import { z } from "zod";

// Returns YYYY-MM-DD in UTC so date validation stays consistent across local & Render servers
function getTodayUtcDateString(): string {
    return new Date().toISOString().slice(0, 10);
}

export const createBookingSchema = z.object({
    serviceId: z.string().trim().min(1, "Service ID is required"),
    customerPhone: z
        .string()
        .trim()
        .min(7, "Please enter a valid phone number")
        .max(25, "Phone number is too long")
        .regex(/^[0-9+\-\s()]+$/, "Phone number contains invalid characters"),
    address: z
        .string()
        .trim()
        .min(8, "Please provide a complete service address")
        .max(300, "Address cannot exceed 300 characters"),
    preferredDate: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Preferred date must be in YYYY-MM-DD format")
        .refine((value) => {
            const parsed = new Date(`${value}T00:00:00Z`);
            return !Number.isNaN(parsed.getTime()) && value >= getTodayUtcDateString();
        }, "Preferred date cannot be in the past"),
    problemDescription: z
        .string()
        .trim()
        .min(20, "Please describe the problem in at least 20 characters")
        .max(1500, "Problem description cannot exceed 1500 characters"),
});