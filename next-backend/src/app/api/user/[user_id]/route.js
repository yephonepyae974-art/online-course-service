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

// Users can only access their own profile.
async function getAccount(request, params) {
    const identity = verifyJWT(request);

    if (
        !identity ||
        typeof identity.id !== "string" ||
        !ObjectId.isValid(identity.id)
    ) {
        return { error: errorResponse("Unauthorized", 401) };
    }

    const { user_id } = await params;

    if (!ObjectId.isValid(user_id)) {
        return { error: errorResponse("Invalid user ID", 400) };
    }

    const id = new ObjectId(user_id).toString();

    if (identity.id !== id) {
        return { error: errorResponse("Access denied", 403) };
    }

    const client = await getClientPromise();
    const db = client.db();
    const filter = { _id: new ObjectId(id) };

    const user = await db.collection("users").findOne(filter);

    if (!user) {
        return { error: errorResponse("User not found", 404) };
    }

    return { db, filter, user, id };
}

function publicUser(user) {
    return {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
    };
}

export async function GET(request, { params }) {
    try {
        const account = await getAccount(request, params);

        if (account.error) return account.error;

        return successResponse(
            { user: publicUser(account.user) },
            200,
        );
    } catch (error) {
        printExceptionLog("Get user profile", error);
        return errorResponse("Unable to get profile", 500);
    }
}

export async function PUT(request, { params }) {
    try {
        const account = await getAccount(request, params);

        if (account.error) return account.error;

        let body;

        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON", 400);
        }

        const { username, email } = body ?? {};

        if (
            typeof username !== "string" ||
            typeof email !== "string" ||
            !username.trim() ||
            !email.trim()
        ) {
            return errorResponse("Username and email are required", 400);
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return errorResponse("Enter a valid email address", 400);
        }

        const users = account.db.collection("users");

        await users.createIndex({ email: 1 }, { unique: true });

        const updated = await users.findOneAndUpdate(
            account.filter,
            {
                $set: {
                    username: username.trim(),
                    email: normalizedEmail,
                },
            },
            { returnDocument: "after" },
        );

        if (!updated) {
            return errorResponse("User not found", 404);
        }

        return successResponse({ user: publicUser(updated) }, 200);
    } catch (error) {
        if (error.code === 11000) {
            return errorResponse("Email already registered", 409);
        }

        printExceptionLog("Update user profile", error);
        return errorResponse("Unable to update profile", 500);
    }
}

export async function DELETE(request, { params }) {
    try {
        const account = await getAccount(request, params);

        if (account.error) return account.error;

        // Avoid leaving courses without an owner.
        const ownedCourse = await account.db
            .collection("courses")
            .findOne({ ownerId: account.id });

        if (ownedCourse) {
            return errorResponse(
                "Delete your created courses before deleting your account",
                409,
            );
        }

        await account.db.collection("enrollments").deleteMany({
            userId: account.id,
        });

        const result = await account.db
            .collection("users")
            .deleteOne(account.filter);

        if (!result.deletedCount) {
            return errorResponse("User not found", 404);
        }

        const response = successResponse(
            { message: "Account deleted" },
            200,
        );

        response.cookies.set("token", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 0,
        });

        return response;
    } catch (error) {
        printExceptionLog("Delete user account", error);
        return errorResponse("Unable to delete account", 500);
    }
}