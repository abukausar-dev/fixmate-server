import { z } from "zod";

export const updateProfileSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, "Name must be at least 2 characters")
            .max(80, "Name cannot exceed 80 characters")
            .optional(),
        phone: z
            .union([
                z
                    .string()
                    .trim()
                    .min(7, "Please enter a valid phone number")
                    .max(25, "Phone number is too long")
                    .regex(/^[0-9+\-\s()]+$/, "Phone number contains invalid characters"),
                z.literal(""),
            ])
            .optional(),
        area: z
            .string()
            .trim()
            .max(100, "Area cannot exceed 100 characters")
            .optional(),
        bio: z
            .string()
            .trim()
            .max(500, "Bio cannot exceed 500 characters")
            .optional(),
        image: z
            .union([
                z.string().trim().url("Profile image must be a valid URL"),
                z.literal(""),
            ])
            .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one profile field must be provided",
    });