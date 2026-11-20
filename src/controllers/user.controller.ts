import type { NextFunction, Response } from "express";
import { getDB } from "../config/database.js";
import type { AuthenticatedRequest } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";

// Explicit safe projection so internal auth fields are never returned
const SAFE_USER_PROJECTION = {
    _id: 1,
    name: 1,
    email: 1,
    role: 1,
    image: 1,
    phone: 1,
    area: 1,
    bio: 1,
    createdAt: 1,
    updatedAt: 1,
} as const;

// 1. AUTHENTICATED — Fetch Logged-in User's Live Profile
export async function getMyProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const db = getDB();
        const user = await db
            .collection("users")
            .findOne({ email: req.user.email }, { projection: SAFE_USER_PROJECTION });

        if (!user) {
            throw new AppError(404, "User profile not found");
        }

        res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error) {
        next(error);
    }
}

// 2. AUTHENTICATED — Update Own Profile (Allowlisted Fields Only — Role & Email Locked)
export async function updateMyProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const updates: Record<string, unknown> = {
            updatedAt: new Date(),
        };

        const allowedFields = ["name", "phone", "area", "bio", "image"] as const;
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        const db = getDB();
        const updatedUser = await db.collection("users").findOneAndUpdate(
            { email: req.user.email },
            { $set: updates },
            {
                returnDocument: "after",
                projection: SAFE_USER_PROJECTION,
            }
        );

        if (!updatedUser) {
            throw new AppError(404, "User profile not found");
        }

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: updatedUser,
        });
    } catch (error) {
        next(error);
    }
}