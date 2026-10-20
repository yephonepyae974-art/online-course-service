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

// List the current Student's enrolled, non-Cancel courses.
export async function GET(request) {
    try {
        const account = await requireUser(request, "Student");

        if (account.error) return account.error;

        const rows = await account.db
            .collection("courses")
            .find({
                studentIds: account.id,
                status: { $in: ["Open", "Close"] },
            })
            .toArray();

        const teacherIds = [
            ...new Set(
                rows
                    .map((course) => course.teacherId)
                    .filter(
                        (id) => typeof id === "string" && ObjectId.isValid(id),
                    ),
            ),
        ];

        const teachers = await account.db
            .collection("users")
            .find(
                {
                    _id: {
                        $in: teacherIds.map((id) => new ObjectId(id)),
                    },
                },
                { projection: { username: 1 } },
            )
            .toArray();

        const teacherNames = new Map(
            teachers.map((teacher) => [
                teacher._id.toString(),
                teacher.username,
            ]),
        );

        const courses = rows.map((course) => {
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
                teacherName:
                    teacherNames.get(course.teacherId) || "Unknown Teacher",
                enrolledCount,
                seatsRemaining: Math.max(
                    0,
                    course.maxStudents - enrolledCount,
                ),
            };
        });

        return successResponse({ courses }, 200);
    } catch (error) {
        printExceptionLog("List enrollments", error);
        return errorResponse("Unable to get enrollments", 500);
    }
}

// Enroll only if Open, not already enrolled, and seats remain.
export async function POST(request) {
    try {
        const account = await requireUser(request, "Student");

        if (account.error) return account.error;

        let body;

        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON", 400);
        }

        const courseId = body?.courseId;

        if (
            typeof courseId !== "string" ||
            !ObjectId.isValid(courseId)
        ) {
            return errorResponse("A valid courseId is required", 400);
        }

        const courses = account.db.collection("courses");
        const _id = new ObjectId(courseId);

        // All enrollment rules are checked in one atomic database write.
        const result = await courses.updateOne(
            {
                _id,
                status: "Open",
                studentIds: { $ne: account.id },
                $expr: {
                    $lt: [
                        { $size: { $ifNull: ["$studentIds", []] } },
                        "$maxStudents",
                    ],
                },
            },
            {
                $addToSet: {
                    studentIds: account.id,
                },
            },
        );

        if (!result.modifiedCount) {
            const course = await courses.findOne({ _id });

            if (!course || course.status === "Cancel") {
                return errorResponse("Course not found", 404);
            }

            if (course.studentIds?.includes(account.id)) {
                return errorResponse("Already enrolled in this course", 409);
            }

            if (course.status !== "Open") {
                return errorResponse("This course is not Open", 409);
            }

            return errorResponse("No seats available", 409);
        }

        return successResponse(
            { message: "Enrolled successfully" },
            201,
        );
    } catch (error) {
        printExceptionLog("Enroll", error);
        return errorResponse("Unable to enroll", 500);
    }
}

// Cancel only the current Student's enrollment.
export async function DELETE(request) {
    try {
        const account = await requireUser(request, "Student");

        if (account.error) return account.error;

        let body;

        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON", 400);
        }

        const courseId = body?.courseId;

        if (
            typeof courseId !== "string" ||
            !ObjectId.isValid(courseId)
        ) {
            return errorResponse("A valid courseId is required", 400);
        }

        const result = await account.db
            .collection("courses")
            .updateOne(
                {
                    _id: new ObjectId(courseId),
                    studentIds: account.id,
                },
                {
                    $pull: {
                        studentIds: account.id,
                    },
                },
            );

        if (!result.modifiedCount) {
            return errorResponse("Enrollment not found", 404);
        }

        return successResponse(
            { message: "Enrollment cancelled" },
            200,
        );
    } catch (error) {
        printExceptionLog("Unenroll", error);
        return errorResponse("Unable to cancel enrollment", 500);
    }
}