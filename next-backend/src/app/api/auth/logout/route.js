import corsHeaders from "@/lib/cors";
import { successResponse } from "@/lib/utils";

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
}

export async function POST() {
    const response = successResponse(
        { message: "Logged out successfully" },
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
}