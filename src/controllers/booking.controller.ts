import type { NextFunction, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/database.js";
import type { AuthenticatedRequest } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";

function asString(value: unknown): string | undefined {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string") {
        return value[0].trim();
    }
    return undefined;
}

// 1. CUSTOMER — Create Repair Booking Request with Concurrency-Safe Duplicate Protection
export async function createBooking(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const {
            serviceId,
            customerPhone,
            address,
            preferredDate,
            problemDescription,
        } = req.body;

        if (!ObjectId.isValid(serviceId)) {
            throw new AppError(400, "Invalid service ID");
        }

        const db = getDB();
        const serviceObjectId = new ObjectId(serviceId);

        // Ensure the target service exists, is admin-approved, and currently available
        const service = await db.collection("services").findOne({
            _id: serviceObjectId,
            approvalStatus: "approved",
            isAvailable: true,
        });

        if (!service) {
            throw new AppError(
                404,
                "This service is not available for booking right now"
            );
        }

        // Deterministic unique key enforces 1 active request per (customer, service) at DB level
        const activeRequestKey = `${req.user.email}::${serviceObjectId.toString()}`;
        const now = new Date();

        const newBooking = {
            serviceId: serviceObjectId.toString(),
            serviceTitle: service.title,
            serviceImage: service.image,
            category: service.category,
            serviceMode: service.serviceMode,
            basePrice: Number(service.basePrice),
            finalAmount: Number(service.basePrice),

            technicianEmail: service.technicianEmail,
            technicianName: service.technicianName,

            customerEmail: req.user.email,
            customerName: req.user.name,
            customerPhone,
            address,
            preferredDate,
            problemDescription,

            status: "requested" as const,
            paymentStatus: "unpaid" as const,
            activeRequestKey,

            createdAt: now,
            updatedAt: now,
        };

        try {
            const result = await db.collection("bookings").insertOne(newBooking);

            res.status(201).json({
                success: true,
                message: "Repair request submitted successfully",
                data: {
                    _id: result.insertedId,
                    ...newBooking,
                },
            });
        } catch (insertError) {
            // Catch MongoDB unique index violation (duplicate active request)
            const mongoErr = insertError as { code?: number };
            if (mongoErr?.code === 11000) {
                throw new AppError(
                    409,
                    "You already have an active request for this service"
                );
            }
            throw insertError;
        }
    } catch (error) {
        next(error);
    }
}

// 2. CUSTOMER — List Only Logged-in Customer's Bookings
export async function getMyBookings(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const db = getDB();
        const bookings = await db
            .collection("bookings")
            .find({ customerEmail: req.user.email })
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

// 3. CUSTOMER — Cancel Own Booking ONLY While Status Is "requested"
export async function cancelMyBooking(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const id = asString(req.params.id);
        if (!id || !ObjectId.isValid(id)) {
            throw new AppError(400, "Invalid booking ID");
        }

        const db = getDB();
        const bookingObjectId = new ObjectId(id);

        // Atomic conditional update: succeeds ONLY if owned by customer AND still "requested"
        const updated = await db.collection("bookings").findOneAndUpdate(
            {
                _id: bookingObjectId,
                customerEmail: req.user.email,
                status: "requested",
            },
            {
                $set: {
                    status: "cancelled",
                    updatedAt: new Date(),
                },
                // Free the unique activeRequestKey so the customer can rebook later if needed
                $unset: {
                    activeRequestKey: "",
                },
            },
            { returnDocument: "after" }
        );

        if (updated) {
            res.status(200).json({
                success: true,
                message: "Booking request cancelled successfully",
                data: updated,
            });
            return;
        }

        // Diagnose why the atomic update didn't match for clear error feedback
        const existing = await db
            .collection("bookings")
            .findOne({ _id: bookingObjectId });

        if (!existing) {
            throw new AppError(404, "Booking not found");
        }

        if (existing.customerEmail !== req.user.email) {
            throw new AppError(
                403,
                "Forbidden: you can only cancel your own booking requests"
            );
        }

        throw new AppError(
            400,
            `Cannot cancel a booking that is already "${existing.status}"`
        );
    } catch (error) {
        next(error);
    }
}