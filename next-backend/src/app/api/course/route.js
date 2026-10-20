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

// Teacher: list own courses.
// Student: list non-Cancel courses with optional filters.
export async function GET(request) {
    try {
        const account = await requireUser(request);

        if (account.error) {
            return account.error;
        }

        const { db, user, id } = account;

        const filter =
            user.role === "Teacher"
                ? { teacherId: id }
                : { status: { $in: ["Open", "Close"] } };

        const rows = await db
            .collection("courses")
            .find(filter)
            .sort({ createdAt: -1 })
            .toArray();

        const teacherIds = [
            ...new Set(
                rows
                    .map((course) => course.teacherId)
                    .filter(
                        (value) =>
                            typeof value === "string" &&
                            ObjectId.isValid(value),
                    ),
            ),
        ];

        const teachers = await db
            .collection("users")
            .find(
                {
                    _id: {
                        $in: teacherIds.map((value) => new ObjectId(value)),
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

        const params = new URL(request.url).searchParams;
        const nameFilter = (params.get("name") || "")
            .trim()
            .toLowerCase();
        const teacherFilter = (params.get("teacher") || "")
            .trim()
            .toLowerCase();

        const courses = rows
            .map((course) => {
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
            })
            .filter(
                (course) =>
                    (course.name || "")
                        .toLowerCase()
                        .includes(nameFilter) &&
                    course.teacherName
                        .toLowerCase()
                        .includes(teacherFilter),
            );

        return successResponse({ courses }, 200);
    } catch (error) {
        printExceptionLog("List courses", error);
        return errorResponse("Unable to get courses", 500);
    }
}

// Only authenticated Teachers can create courses.
export async function POST(request) {
    try {
        const account = await requireUser(request, "Teacher");

        if (account.error) {
            return account.error;
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON", 400);
        }

        const {
            name,
            durationDays,
            topics,
            price,
            maxStudents,
            status,
        } = body ?? {};

        if (
            typeof name !== "string" ||
            !name.trim() ||
            name.trim().length > 200
        ) {
            return errorResponse(
                "Course name is required and must not exceed 200 characters",
                400,
            );
        }

        if (!Number.isInteger(durationDays) || durationDays < 1) {
            return errorResponse(
                "Duration must be a positive whole number of days",
                400,
            );
        }

        if (
            !Array.isArray(topics) ||
            topics.length === 0 ||
            topics.length > 100 ||
            topics.some(
                (topic) =>
                    typeof topic !== "string" || !topic.trim(),
            )
        ) {
            return errorResponse(
                "Provide between 1 and 100 nonempty topics",
                400,
            );
        }

        if (
            typeof price !== "number" ||
            !Number.isFinite(price) ||
            price < 0
        ) {
            return errorResponse("Price must be zero or greater", 400);
        }

        if (!Number.isInteger(maxStudents) || maxStudents < 1) {
            return errorResponse(
                "Max Student must be a positive whole number",
                400,
            );
        }

        if (!["Open", "Close", "Cancel"].includes(status)) {
            return errorResponse(
                "Status must be Open, Close or Cancel",
                400,
            );
        }

        const course = {
            name: name.trim(),
            durationDays,
            topics: [
                ...new Set(topics.map((topic) => topic.trim())),
            ],
            price,
            maxStudents,
            status,
            teacherId: account.id,
            studentIds: [],
            createdAt: new Date(),
        };

        const result = await account.db
            .collection("courses")
            .insertOne(course);

        return successResponse(
            {
                course: {
                    id: result.insertedId.toString(),
                    name: course.name,
                    durationDays: course.durationDays,
                    topics: course.topics,
                    price: course.price,
                    maxStudents: course.maxStudents,
                    status: course.status,
                    teacherId: course.teacherId,
                    teacherName: account.user.username,
                    enrolledCount: 0,
                    seatsRemaining: course.maxStudents,
                },
            },
            201,
        );
    } catch (error) {
        printExceptionLog("Create course", error);
        return errorResponse("Unable to create course", 500);
    }
}