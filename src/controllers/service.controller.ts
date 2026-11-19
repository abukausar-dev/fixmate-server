import type { NextFunction, Request, Response } from "express";
import { ObjectId } from "mongodb";
import type { Document, Filter, Sort } from "mongodb";
import { getDB } from "../config/database.js";
import type { AuthenticatedRequest } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";
import {
    SERVICE_CATEGORIES,
    SERVICE_MODES,
} from "../schemas/service.schema.js";

// Safely extract single string from Express query/param values
function asString(value: unknown): string | undefined {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string") {
        return value[0].trim();
    }
    return undefined;
}

// Escape regex special characters to prevent invalid patterns or ReDoS
function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper to enrich service list with live technician area & avatar from `users`
async function attachTechnicianMeta(items: Document[]): Promise<Document[]> {
    if (items.length === 0) return [];

    const emails = Array.from(
        new Set(items.map((item) => item.technicianEmail).filter(Boolean))
    );

    const db = getDB();
    const techs = await db
        .collection("users")
        .find(
            { email: { $in: emails } },
            { projection: { email: 1, name: 1, image: 1, area: 1 } }
        )
        .toArray();

    const techMap = new Map(techs.map((t) => [t.email, t]));

    return items.map((item) => {
        const tech = techMap.get(item.technicianEmail);
        return {
            ...item,
            technicianName: tech?.name || item.technicianName,
            technicianImage: tech?.image || undefined,
            area: tech?.area || "Dhaka Metro",
        };
    });
}

// 1. PUBLIC — Challenge 1: MongoDB Server-Side Search, Filter & Sort
export async function getPublicServices(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const db = getDB();
        const search = asString(req.query.search);
        const category = asString(req.query.category);
        const serviceMode = asString(req.query.serviceMode);
        const sortParam = asString(req.query.sort) || "newest";
        const limitParam = asString(req.query.limit);

        // Public catalog ALWAYS restricts to approved & available services
        const filter: Filter<Document> = {
            approvalStatus: "approved",
            isAvailable: true,
        };

        if (search) {
            const safeRegex = new RegExp(escapeRegex(search), "i");
            filter.$or = [{ title: safeRegex }, { category: safeRegex }];
        }

        if (
            category &&
            category !== "all" &&
            (SERVICE_CATEGORIES as readonly string[]).includes(category)
        ) {
            filter.category = category;
        }

        if (
            serviceMode &&
            serviceMode !== "all" &&
            (SERVICE_MODES as readonly string[]).includes(serviceMode)
        ) {
            filter.serviceMode = serviceMode;
        }

        // Strict sort allowlist
        let sortStage: Sort = { createdAt: -1 };
        if (sortParam === "price-asc") {
            sortStage = { basePrice: 1, createdAt: -1 };
        } else if (sortParam === "price-desc") {
            sortStage = { basePrice: -1, createdAt: -1 };
        }

        let cursor = db.collection("services").find(filter).sort(sortStage);

        if (limitParam) {
            const parsedLimit = Number.parseInt(limitParam, 10);
            if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
                cursor = cursor.limit(Math.min(parsedLimit, 50));
            }
        }

        const rawServices = await cursor.toArray();
        const enriched = await attachTechnicianMeta(rawServices);

        res.status(200).json({
            success: true,
            count: enriched.length,
            data: enriched,
        });
    } catch (error) {
        next(error);
    }
}

// 2. PUBLIC — Single Approved & Available Service Details + Technician Profile
export async function getPublicServiceById(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const id = asString(req.params.id);
        if (!id || !ObjectId.isValid(id)) {
            throw new AppError(404, "Service not found");
        }

        const db = getDB();
        const service = await db.collection("services").findOne({
            _id: new ObjectId(id),
            approvalStatus: "approved",
            isAvailable: true,
        });

        if (!service) {
            throw new AppError(404, "Service not found or currently unavailable");
        }

        const technician = await db.collection("users").findOne(
            { email: service.technicianEmail },
            { projection: { name: 1, image: 1, area: 1, bio: 1 } }
        );

        res.status(200).json({
            success: true,
            data: {
                ...service,
                technicianName: technician?.name || service.technicianName,
                technician: {
                    name: technician?.name || service.technicianName,
                    image: technician?.image || null,
                    area: technician?.area || "Dhaka Metro",
                    bio:
                        technician?.bio ||
                        "Verified FixMate technician specializing in reliable device and appliance diagnostics.",
                },
            },
        });
    } catch (error) {
        next(error);
    }
}

// 3. TECHNICIAN — Create New Service (Defaults to pending moderation)
export async function createService(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const db = getDB();
        const now = new Date();
        const {
            title,
            category,
            description,
            basePrice,
            serviceMode,
            estimatedDuration,
            image,
        } = req.body;

        const newService = {
            title,
            category,
            description,
            basePrice: Number(basePrice),
            serviceMode,
            estimatedDuration,
            image,
            technicianEmail: req.user.email,
            technicianName: req.user.name,
            approvalStatus: "pending" as const,
            isAvailable: true,
            createdAt: now,
            updatedAt: now,
        };

        const result = await db.collection("services").insertOne(newService);

        res.status(201).json({
            success: true,
            message: "Service submitted for admin approval",
            data: {
                _id: result.insertedId,
                ...newService,
            },
        });
    } catch (error) {
        next(error);
    }
}

// 4. TECHNICIAN — Get Only Logged-in Technician's Services
export async function getMyServices(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const db = getDB();
        const services = await db
            .collection("services")
            .find({ technicianEmail: req.user.email })
            .sort({ createdAt: -1 })
            .toArray();

        res.status(200).json({
            success: true,
            count: services.length,
            data: services,
        });
    } catch (error) {
        next(error);
    }
}

// 5. TECHNICIAN — Update Own Service (Resets approvalStatus to pending)
export async function updateMyService(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const id = asString(req.params.id);
        if (!id || !ObjectId.isValid(id)) {
            throw new AppError(400, "Invalid service ID");
        }

        const db = getDB();
        const existing = await db
            .collection("services")
            .findOne({ _id: new ObjectId(id) });

        if (!existing) {
            throw new AppError(404, "Service not found");
        }

        if (existing.technicianEmail !== req.user.email) {
            throw new AppError(403, "Forbidden: you can only edit your own services");
        }

        // Allowlist editable fields & always reset approvalStatus back to pending
        const updates: Record<string, unknown> = {
            approvalStatus: "pending",
            updatedAt: new Date(),
        };

        const editableFields = [
            "title",
            "category",
            "description",
            "basePrice",
            "serviceMode",
            "estimatedDuration",
            "image",
        ] as const;

        for (const field of editableFields) {
            if (req.body[field] !== undefined) {
                updates[field] =
                    field === "basePrice" ? Number(req.body[field]) : req.body[field];
            }
        }

        const updated = await db
            .collection("services")
            .findOneAndUpdate(
                { _id: new ObjectId(id), technicianEmail: req.user.email },
                { $set: updates },
                { returnDocument: "after" }
            );

        res.status(200).json({
            success: true,
            message: "Service updated and sent back for admin approval",
            data: updated,
        });
    } catch (error) {
        next(error);
    }
}

// 6. TECHNICIAN — Toggle Availability Without Resetting Approval
export async function toggleServiceAvailability(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const id = asString(req.params.id);
        if (!id || !ObjectId.isValid(id)) {
            throw new AppError(400, "Invalid service ID");
        }

        const db = getDB();
        const existing = await db
            .collection("services")
            .findOne({ _id: new ObjectId(id) });

        if (!existing) {
            throw new AppError(404, "Service not found");
        }

        if (existing.technicianEmail !== req.user.email) {
            throw new AppError(
                403,
                "Forbidden: you can only update availability for your own services"
            );
        }

        const updated = await db
            .collection("services")
            .findOneAndUpdate(
                { _id: new ObjectId(id), technicianEmail: req.user.email },
                {
                    $set: {
                        isAvailable: Boolean(req.body.isAvailable),
                        updatedAt: new Date(),
                    },
                },
                { returnDocument: "after" }
            );

        res.status(200).json({
            success: true,
            message: `Service marked as ${req.body.isAvailable ? "available" : "unavailable"}`,
            data: updated,
        });
    } catch (error) {
        next(error);
    }
}

// 7. TECHNICIAN — Delete Own Service
export async function deleteMyService(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const id = asString(req.params.id);
        if (!id || !ObjectId.isValid(id)) {
            throw new AppError(400, "Invalid service ID");
        }

        const db = getDB();
        const existing = await db
            .collection("services")
            .findOne({ _id: new ObjectId(id) });

        if (!existing) {
            throw new AppError(404, "Service not found");
        }

        if (existing.technicianEmail !== req.user.email) {
            throw new AppError(
                403,
                "Forbidden: you can only delete your own services"
            );
        }

        await db
            .collection("services")
            .deleteOne({ _id: new ObjectId(id), technicianEmail: req.user.email });

        res.status(200).json({
            success: true,
            message: "Service deleted successfully",
        });
    } catch (error) {
        next(error);
    }
}

// 8. ADMIN — List All Services (Pending First or Filtered by Status)
export async function getAdminServices(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const db = getDB();
        const statusParam = asString(req.query.status);
        const filter: Filter<Document> = {};

        if (
            statusParam &&
            ["pending", "approved", "rejected"].includes(statusParam)
        ) {
            filter.approvalStatus = statusParam;
        }

        const services = await db
            .collection("services")
            .find(filter)
            .sort({ createdAt: -1 })
            .toArray();

        // Sort pending listings first when viewing all so admin can moderate immediately
        const priority: Record<string, number> = {
            pending: 0,
            approved: 1,
            rejected: 2,
        };
        services.sort(
            (a, b) =>
                (priority[a.approvalStatus] ?? 3) - (priority[b.approvalStatus] ?? 3)
        );

        res.status(200).json({
            success: true,
            count: services.length,
            data: services,
        });
    } catch (error) {
        next(error);
    }
}

// 9. ADMIN — Approve or Reject a Technician Service
export async function moderateServiceApproval(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const id = asString(req.params.id);
        if (!id || !ObjectId.isValid(id)) {
            throw new AppError(400, "Invalid service ID");
        }

        const db = getDB();
        const updated = await db
            .collection("services")
            .findOneAndUpdate(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        approvalStatus: req.body.approvalStatus,
                        updatedAt: new Date(),
                    },
                },
                { returnDocument: "after" }
            );

        if (!updated) {
            throw new AppError(404, "Service not found");
        }

        res.status(200).json({
            success: true,
            message: `Service ${req.body.approvalStatus} successfully`,
            data: updated,
        });
    } catch (error) {
        next(error);
    }
}