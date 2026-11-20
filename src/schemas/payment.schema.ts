import { z } from "zod";

export const createCheckoutSessionSchema = z.object({
    bookingId: z.string().trim().min(1, "Booking ID is required"),
});

export const verifyCheckoutSessionSchema = z.object({
    sessionId: z
        .string()
        .trim()
        .min(10, "Invalid Stripe session ID")
        .startsWith("cs_", "Invalid Stripe Checkout session ID format"),
});