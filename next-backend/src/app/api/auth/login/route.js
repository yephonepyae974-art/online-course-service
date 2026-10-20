import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getClientPromise } from "@/lib/mongodb";
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

export async function POST(request) {
    let body;

    try {
        body = await request.json();
    } catch {
        return errorResponse("Invalid JSON", 400);
    }

    const { email, password } = body ?? {};

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
    ) {
        return errorResponse("Email and password are required", 400);
    }

    try {
        const client = await getClientPromise();

        const user = await client.db().collection("users").findOne({
            email: email.trim().toLowerCase(),
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return errorResponse("Invalid email or password", 401);
        }

        if (!["Student", "Teacher"].includes(user.role)) {
            return errorResponse("Account does not have a valid role", 403);
        }

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is missing");
        }

        const publicUser = {
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            role: user.role,
        };

        // Protected routes will read the current role from MongoDB.
        const token = jwt.sign(
            { id: publicUser.id },
            process.env.JWT_SECRET,
            {
                algorithm: "HS256",
                expiresIn: "1d",
            },
        );

        const response = successResponse({ user: publicUser }, 200);

        response.cookies.set("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24,
        });

        return response;
    } catch (error) {
        printExceptionLog("Login", error);
        return errorResponse("Unable to log in", 500);
    }
}