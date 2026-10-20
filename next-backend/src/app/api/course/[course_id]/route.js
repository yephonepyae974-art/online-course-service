import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/auth";
import corsHeaders from "@/lib/cors";
import {
    errorResponse,
    successResponse,
    printExceptionLog,
} from "@/lib/utils";

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
}

function validId(value) {
    return typeof value === "string" && ObjectId.isValid(value);
}

async function serializeCourse(db, course) {
    const teacher = validId(course.teacherId)
        ? await db.collection("users").findOne(
            { _id: new ObjectId(course.teacherId) },
            { projection: { username: 1 } },
        )
        : null;

    const enrolledCount = (course.studentIds || []).length;

    return {
        id: course._id.toString(),
        name: course.name,
        durationDays: course.durationDays,
        topics: course.topics,
        price: course.price,
        maxStudents: course.maxStudents,
        status: course.status,
        teacherId: course.teacherId,
        teacherName: teacher?.username || "Unknown Teacher",
        enrolledCount,
        seatsRemaining: Math.max(
            0,
            course.maxStudents - enrolledCount,
        ),
    };
}

function validateCourse(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "A JSON object is required";
    }

    const {
        name,
        durationDays,
        topics,
        price,
        maxStudents,
        status,
    } = body;

    if (
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 200
    ) {
        return "Course name is required (maximum 200 characters)";
    }

    if (!Number.isInteger(durationDays) || durationDays < 1) {
        return "Duration must be a positive whole number of days";
    }

    if (
        !Array.isArray(topics) ||
        topics.length === 0 ||
        topics.length > 100 ||
        topics.some(
            (topic) => typeof topic !== "string" || !topic.trim(),
        )
    ) {
        return "Provide between 1 and 100 nonempty topics";
    }

    if (
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price < 0
    ) {
        return "Price must be zero or greater";
    }

    if (!Number.isInteger(maxStudents) || maxStudents < 1) {
        return "Max Student must be a positive whole number";
    }

    if (!["Open", "Close", "Cancel"].includes(status)) {
        return "Status must be Open, Close or Cancel";
    }

    return null;
}

// View course details.
export async function GET(request, { params }) {
    try {
        const account = await requireUser(request);

        if (account.error) return account.error;

        const { course_id } = await params;

        if (!validId(course_id)) {
            return errorResponse("Invalid course ID", 400);
        }

        const filter = {
            _id: new ObjectId(course_id),
        };

        if (account.user.role === "Teacher") {
            filter.teacherId = account.id;
        } else {
            filter.status = { $in: ["Open", "Close"] };
        }

        const course = await account.db
            .collection("courses")
            .findOne(filter);

        if (!course) {
            return errorResponse("Course not found or access denied", 404);
        }

        const result = await serializeCourse(account.db, course);

        if (account.user.role === "Teacher") {
            const studentIds = (course.studentIds || [])
                .filter(validId)
                .map((id) => new ObjectId(id));

            const students = await account.db
                .collection("users")
                .find(
                    {
                        _id: { $in: studentIds },
                        role: "Student",
                    },
                    {
                        projection: {
                            username: 1,
                            email: 1,
                        },
                    },
                )
                .toArray();

            result.students = students.map((student) => ({
                id: student._id.toString(),
                username: student.username,
                email: student.email,
            }));
        }

        return successResponse({ course: result }, 200);
    } catch (error) {
        printExceptionLog("Get course", error);
        return errorResponse("Unable to get course", 500);
    }
}

// Update only the authenticated Teacher's own course.
export async function PUT(request, { params }) {
    try {
        const account = await requireUser(request, "Teacher");

        if (account.error) return account.error;

        const { course_id } = await params;

        if (!validId(course_id)) {
            return errorResponse("Invalid course ID", 400);
        }

        const courses = account.db.collection("courses");
        const courseId = new ObjectId(course_id);

        const existing = await courses.findOne({ _id: courseId });

        if (!existing) {
            return errorResponse("Course not found", 404);
        }

        if (existing.teacherId !== account.id) {
            return errorResponse("You can only update your own courses", 403);
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON", 400);
        }

        const validationError = validateCourse(body);

        if (validationError) {
            return errorResponse(validationError, 400);
        }

        // Check occupancy in the same write that updates capacity.
        const updated = await courses.findOneAndUpdate(
            {
                _id: courseId,
                teacherId: account.id,
                $expr: {
                    $lte: [
                        { $size: { $ifNull: ["$studentIds", []] } },
                        body.maxStudents,
                    ],
                },
            },
            {
                $set: {
                    name: body.name.trim(),
                    durationDays: body.durationDays,
                    topics: [
                        ...new Set(body.topics.map((topic) => topic.trim())),
                    ],
                    price: body.price,
                    maxStudents: body.maxStudents,
                    status: body.status,
                    updatedAt: new Date(),
                },
            },
            { returnDocument: "after" },
        );

        if (!updated) {
            return errorResponse(
                "Cannot reduce Max Student below enrollment count, or course was removed",
                409,
            );
        }

        return successResponse(
            {
                course: await serializeCourse(account.db, updated),
            },
            200,
        );
    } catch (error) {
        printExceptionLog("Update course", error);
        return errorResponse("Unable to update course", 500);
    }
}

// Delete only an owned course with no enrolled Students.
export async function DELETE(request, { params }) {
    try {
        const account = await requireUser(request, "Teacher");

        if (account.error) return account.error;

        const { course_id } = await params;

        if (!validId(course_id)) {
            return errorResponse("Invalid course ID", 400);
        }

        const courses = account.db.collection("courses");
        const courseId = new ObjectId(course_id);

        const existing = await courses.findOne({ _id: courseId });

        if (!existing) {
            return errorResponse("Course not found", 404);
        }

        if (existing.teacherId !== account.id) {
            return errorResponse("You can only delete your own courses", 403);
        }

        // Enrollment and deletion operate on the same course document.
        const result = await courses.deleteOne({
            _id: courseId,
            teacherId: account.id,
            $expr: {
                $eq: [
                    { $size: { $ifNull: ["$studentIds", []] } },
                    0,
                ],
            },
        });

        if (!result.deletedCount) {
            return errorResponse(
                "Course has enrolled Students or was already removed",
                409,
            );
        }

        return successResponse({ message: "Course deleted" }, 200);
    } catch (error) {
        printExceptionLog("Delete course", error);
        return errorResponse("Unable to delete course", 500);
    }
}