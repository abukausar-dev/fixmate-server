import Stripe from "stripe";
import { AppError } from "../utils/AppError.js";

let stripeInstance: Stripe | null = null;

// Lazily creates a single Stripe client instance using server-only STRIPE_SECRET_KEY
export function getStripe(): Stripe {
    if (stripeInstance) return stripeInstance;

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
        throw new AppError(
            500,
            "Stripe is not configured on the server (missing STRIPE_SECRET_KEY)"
        );
    }

    stripeInstance = new Stripe(secretKey);
    return stripeInstance;
}