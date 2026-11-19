import { z } from "zod";

export const SERVICE_CATEGORIES = [
    "Smartphone",
    "Laptop & PC",
    "AC",
    "Refrigerator",
    "TV",
    "Washing Machine",
    "Electrical",
] as const;

export const SERVICE_MODES = ["Home Visit", "Shop Drop-off"] as const;

export const createServiceSchema = z.object({
    title: z
        .string()
        .trim()
        .min(5, "Service title must be at least 5 characters")
        .max(120, "Service title cannot exceed 120 characters"),
    category: z.enum(SERVICE_CATEGORIES, {
        message: "Please select a valid repair category",
    }),
    description: z
        .string()
        .trim()
        .min(20, "Description must be at least 20 characters")
        .max(2000, "Description cannot exceed 2000 characters"),
    basePrice: z.coerce
        .number()
        .positive("Base price must be greater than 0")
        .max(100000, "Base price is too high"),
    serviceMode: z.enum(SERVICE_MODES, {
        message: "Service mode must be Home Visit or Shop Drop-off",
    }),
    estimatedDuration: z
        .string()
        .trim()
        .min(2, "Estimated duration is required (e.g. 1-2 hours)")
        .max(60, "Estimated duration is too long"),
    image: z
        .string()
        .trim()
        .url("A valid uploaded service image URL is required"),
});

export const updateServiceSchema = createServiceSchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: "At least one field must be provided to update" }
);

export const availabilitySchema = z.object({
    isAvailable: z.boolean(),
});

export const approvalSchema = z.object({
    approvalStatus: z.enum(["approved", "rejected"], {
        message: "Approval status must be approved or rejected",
    }),
});