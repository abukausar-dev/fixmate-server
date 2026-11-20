import type { NextFunction, Response } from "express";
import { ObjectId } from "mongodb";
import type { Document, Filter } from "mongodb";
import { getDB } from "../config/database.js";
import type { AuthenticatedRequest } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";
import { USER_ROLES } from "../schemas/admin.schema.js";

const SAFE_USER_PROJECTION = {
    _id: 1,
    name: 1,
    email: 1,
    role: 1,
    image: 1,
    phone: 1,
    area: 1,
    createdAt: 1,
    updatedAt: 1,
} as const;

const VALID_BOOKING_STATUSES = [
    "requested",
    "accepted",
    "in-progress",
    "completed",
    "rejected",
    "cancelled",
] as const;

function asString(value: unknown): string | undefined {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string") {
        return value[0].trim();
    }
    return undefined;
}

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 1. ADMIN — Platform Overview Metrics + Pending Queue Preview
export async function getAdminStats(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const db = getDB();
        const usersCol = db.collection("users");
        const servicesCol = db.collection("services");
        const bookingsCol = db.collection("bookings");

        const [
            totalUsers,
            totalCustomers,
            totalTechnicians,
            totalAdmins,
            totalServices,
            pendingServices,
            approvedServices,
            rejectedServices,
            totalBookings,
            activeBookings,
            completedBookings,
            revenueAgg,
            recentPendingServices,
            recentBookings,
        ] = await Promise.all([
            usersCol.countDocuments(),
            usersCol.countDocuments({ role: "customer" }),
            usersCol.countDocuments({ role: "technician" }),
            usersCol.countDocuments({ role: "admin" }),
            servicesCol.countDocuments(),
            servicesCol.countDocuments({ approvalStatus: "pending" }),
            servicesCol.countDocuments({ approvalStatus: "approved" }),
            servicesCol.countDocuments({ approvalStatus: "rejected" }),
            bookingsCol.countDocuments(),
            bookingsCol.countDocuments({
                status: { $in: ["requested", "accepted", "in-progress"] },
            }),
            bookingsCol.countDocuments({ status: "completed" }),
            bookingsCol
                .aggregate([
                    { $match: { paymentStatus: "paid" } },
                    {
                        $group: {
                            _id: null,
                            totalRevenue: { $sum: "$finalAmount" },
                            paidCount: { $sum: 1 },
                        },
                    },
                ])
                .toArray(),
            servicesCol
                .find({ approvalStatus: "pending" })
                .sort({ createdAt: -1 })
                .limit(5)
                .toArray(),
            bookingsCol.find().sort({ createdAt: -1 }).limit(5).toArray(),
        ]);

        const revenueSummary = revenueAgg[0] || { totalRevenue: 0, paidCount: 0 };

        res.status(200).json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    customers: totalCustomers,
                    technicians: totalTechnicians,
                    admins: totalAdmins,
                },
                services: {
                    total: totalServices,
                    pending: pendingServices,
                    approved: approvedServices,
                    rejected: rejectedServices,
                },
                bookings: {
                    total: totalBookings,
                    active: activeBookings,
                    completed: completedBookings,
                    paidCount: Number(revenueSummary.paidCount || 0),
                    totalRevenue: Number(revenueSummary.totalRevenue || 0),
                },
                recentPendingServices,
                recentBookings,
            },
        });
    } catch (error) {
        next(error);
    }
}

// 2. ADMIN — List All Platform Bookings (Filterable by Status, Payment & Search)
export async function getAdminBookings(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const db = getDB();
        const statusParam = asString(req.query.status);
        const paymentParam = asString(req.query.paymentStatus);
        const search = asString(req.query.search);

        const filter: Filter<Document> = {};

        if (
            statusParam &&
            statusParam !== "all" &&
            (VALID_BOOKING_STATUSES as readonly string[]).includes(statusParam)
        ) {
            filter.status = statusParam;
        }

        if (
            paymentParam &&
            paymentParam !== "all" &&
            ["paid", "unpaid"].includes(paymentParam)
        ) {
            filter.paymentStatus = paymentParam;
        }

        if (search) {
            const safeRegex = new RegExp(escapeRegex(search), "i");
            filter.$or = [
                { serviceTitle: safeRegex },
                { customerName: safeRegex },
                { customerEmail: safeRegex },
                { technicianName: safeRegex },
                { technicianEmail: safeRegex },
            ];
        }

        const bookings = await db
            .collection("bookings")
            .find(filter)
            .sort({ createdAt: -1 })
            .toArray();

        res.status(200).json({
            success: true,
            count: bookings.length,
            data: bookings,
        });
    } catch (error) {
        next(error);
    }
}

// 3. ADMIN — List All Registered Users (Safe Projection + Role & Search Filter)
export async function getAdminUsers(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const db = getDB();
        const roleParam = asString(req.query.role);
        const search = asString(req.query.search);

        const filter: Filter<Document> = {};

        if (
            roleParam &&
            roleParam !== "all" &&
            (USER_ROLES as readonly string[]).includes(roleParam)
        ) {
            filter.role = roleParam;
        }

        if (search) {
            const safeRegex = new RegExp(escapeRegex(search), "i");
            filter.$or = [{ name: safeRegex }, { email: safeRegex }];
        }

        const users = await db
            .collection("users")
            .find(filter, { projection: SAFE_USER_PROJECTION })
            .sort({ createdAt: -1 })
            .toArray();

        res.status(200).json({
            success: true,
            count: users.length,
            data: users,
        });
    } catch (error) {
        next(error);
    }
}

// 4. ADMIN — Update a User's Role (Prevents Self-Demotion)
export async function updateUserRole(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const id = asString(req.params.id);
        if (!id || !ObjectId.isValid(id)) {
            throw new AppError(400, "Invalid user ID");
        }

        const nextRole = req.body.role as (typeof USER_ROLES)[number];
        const db = getDB();
        const userObjectId = new ObjectId(id);

        const targetUser = await db
            .collection("users")
            .findOne({ _id: userObjectId }, { projection: SAFE_USER_PROJECTION });

        if (!targetUser) {
            throw new AppError(404, "User not found");
        }

        if (targetUser.email === req.user.email && nextRole !== "admin") {
            throw new AppError(
                400,
                "You cannot remove your own admin role while signed in"
            );
        }

        const updated = await db.collection("users").findOneAndUpdate(
            { _id: userObjectId },
            {
                $set: {
                    role: nextRole,
                    updatedAt: new Date(),
                },
            },
            {
                returnDocument: "after",
                projection: SAFE_USER_PROJECTION,
            }
        );

        res.status(200).json({
            success: true,
            message: `Updated ${targetUser.name || targetUser.email} to "${nextRole}"`,
            data: updated,
        });
    } catch (error) {
        next(error);
    }
}