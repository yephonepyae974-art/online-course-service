import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getClientPromise } from "./mongodb";
import { errorResponse } from "./utils";

// Verify the login cookie.
export function verifyJWT(request) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token || !process.env.JWT_SECRET) {
      return null;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (
      typeof decoded !== "object" ||
      typeof decoded.id !== "string" ||
      !ObjectId.isValid(decoded.id)
    ) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

// Read the current account and role from MongoDB.
export async function requireUser(request, requiredRole) {
  const identity = verifyJWT(request);

  if (!identity) {
    return {
      error: errorResponse("Please log in", 401),
    };
  }

  const client = await getClientPromise();
  const db = client.db();

  const user = await db.collection("users").findOne(
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
    return {
      error: errorResponse("Account not found. Please log in again", 401),
    };
  }

  if (!["Student", "Teacher"].includes(user.role)) {
    return {
      error: errorResponse("Account does not have a valid role", 403),
    };
  }

  if (requiredRole && user.role !== requiredRole) {
    return {
      error: errorResponse(`${requiredRole} role required`, 403),
    };
  }

  return {
    db,
    user,
    id: user._id.toString(),
  };
}