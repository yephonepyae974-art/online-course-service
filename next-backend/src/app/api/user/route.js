import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import { getClientPromise } from "@/lib/mongodb";
import { verifyJWT } from "@/lib/auth";
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

// Register a Student or Teacher.
export async function POST(request) {
    let body;

    try {
        body = await request.json();
    } catch {
        return errorResponse("Invalid JSON", 400);
    }

    const {
        username,
        email,
        password,
        role = "Student",
    } = body ?? {};

    if (
        typeof username !== "string" ||
        !username.trim() ||
        username.trim().length > 100
    ) {
        return errorResponse(
            "Username is required and must not exceed 100 characters",
            400,
        );
    }

    if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
        return errorResponse("A valid email is required", 400);
    }

    if (
        typeof password !== "string" ||
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
    ) {
        return errorResponse(
            "Password must have at least 8 characters and at most 72 bytes",
            400,
        );
    }

    if (!["Student", "Teacher"].includes(role)) {
        return errorResponse("Role must be Student or Teacher", 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
        const client = await getClientPromise();
        const users = client.db().collection("users");

        await users.createIndex({ email: 1 }, { unique: true });

        const existingUser = await users.findOne({
            email: normalizedEmail,
        });

        if (existingUser) {
            return errorResponse("Email already registered", 409);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await users.insertOne({
            username: username.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role,
        });

        return successResponse(
            {
                id: result.insertedId.toString(),
                username: username.trim(),
                email: normalizedEmail,
                role,
            },
            201,
        );
    } catch (error) {
        if (error.code === 11000) {
            return errorResponse("Email already registered", 409);
        }

        printExceptionLog("Register user", error);
        return errorResponse("Unable to register user", 500);
    }
}

// Return the current user's latest database information.
export async function GET(request) {
    const identity = verifyJWT(request);

    if (
        !identity ||
        typeof identity.id !== "string" ||
        !ObjectId.isValid(identity.id)
    ) {
        return errorResponse("Unauthorized", 401);
    }

    try {
        const client = await getClientPromise();

        const user = await client.db().collection("users").findOne(
            { _id: new ObjectId(identity.id) },
            {
                projection: {
                    username: 1,
                    email: 1,
                    role: 1,
                },
            },
        );

        if (!user) {
            return errorResponse("User not found", 404);
        }

        if (!["Student", "Teacher"].includes(user.role)) {
            return errorResponse(
                "This account does not have a valid role",
                403,
            );
        }

        return successResponse(
            {
                user: {
                    id: user._id.toString(),
                    username: user.username,
                    email: user.email,
                    role: user.role,
                },
            },
            200,
        );
    } catch (error) {
        printExceptionLog("Get current user", error);
        return errorResponse("Unable to get current user", 500);
    }
}