import type { NextFunction, Request, Response } from "express";
import { ObjectId } from "mongodb";
import type Stripe from "stripe";
import { getDB } from "../config/database.js";
import { getStripe } from "../config/stripe.js";
import type { AuthenticatedRequest } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";

function getClientUrl(): string {
    const raw = process.env.CLIENT_URL || "http://localhost:3000";
    return raw.replace(/\/+$/, "");
}

// Idempotent helper: records a verified Stripe Checkout payment & marks the booking "paid"
async function fulfillPaidSession(session: Stripe.Checkout.Session) {
    if (session.payment_status !== "paid") {
        throw new AppError(400, "Payment has not been completed yet");
    }

    const bookingId = session.metadata?.bookingId;
    if (!bookingId || !ObjectId.isValid(bookingId)) {
        throw new AppError(400, "Booking reference missing from Stripe session");
    }

    const db = getDB();
    const paymentsCol = db.collection("payments");
    const bookingsCol = db.collection("bookings");

    // 1. If already recorded (e.g., webhook arrived first or user refreshed), return existing receipt
    const existingPayment = await paymentsCol.findOne({
        $or: [{ stripeSessionId: session.id }, { bookingId }],
    });

    if (existingPayment) {
        // Ensure booking is definitely marked paid even if an earlier write crashed halfway
        await bookingsCol.updateOne(
            { _id: new ObjectId(bookingId), paymentStatus: { $ne: "paid" } },
            {
                $set: {
                    paymentStatus: "paid",
                    paidAt: existingPayment.paidAt || new Date(),
                    stripeSessionId: session.id,
                    updatedAt: new Date(),
                },
            }
        );
        return existingPayment;
    }

    // 2. Fetch booking from MongoDB to build an authoritative receipt
    const booking = await bookingsCol.findOne({ _id: new ObjectId(bookingId) });
    if (!booking) {
        throw new AppError(404, "Associated booking not found");
    }

    const now = new Date();
    const amountPaid =
        typeof session.amount_total === "number"
            ? Number((session.amount_total / 100).toFixed(2))
            : Number(booking.finalAmount);

    const paymentRecord = {
        bookingId,
        serviceId: booking.serviceId,
        serviceTitle: booking.serviceTitle,
        category: booking.category,
        customerEmail: booking.customerEmail,
        customerName: booking.customerName,
        technicianEmail: booking.technicianEmail,
        technicianName: booking.technicianName,
        amount: amountPaid,
        currency: (session.currency || "usd").toUpperCase(),
        stripeSessionId: session.id,
        stripePaymentIntentId:
            typeof session.payment_intent === "string"
                ? session.payment_intent
                : null,
        status: "paid" as const,
        paidAt: now,
        createdAt: now,
    };

    try {
        const insertRes = await paymentsCol.insertOne(paymentRecord);
        await bookingsCol.updateOne(
            { _id: new ObjectId(bookingId) },
            {
                $set: {
                    paymentStatus: "paid",
                    paidAt: now,
                    stripeSessionId: session.id,
                    updatedAt: now,
                },
            }
        );

        return {
            _id: insertRes.insertedId,
            ...paymentRecord,
        };
    } catch (err) {
        // Handle race condition if webhook and /verify-session execute at the exact same millisecond
        const mongoErr = err as { code?: number };
        if (mongoErr?.code === 11000) {
            const winner = await paymentsCol.findOne({ bookingId });
            if (winner) return winner;
        }
        throw err;
    }
}

// 1. CUSTOMER — Create Stripe Checkout Session (Only for own Completed & Unpaid bookings)
export async function createCheckoutSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const { bookingId } = req.body as { bookingId: string };
        if (!ObjectId.isValid(bookingId)) {
            throw new AppError(400, "Invalid booking ID");
        }

        const db = getDB();
        const booking = await db
            .collection("bookings")
            .findOne({ _id: new ObjectId(bookingId) });

        if (!booking) {
            throw new AppError(404, "Booking not found");
        }

        // Strict ownership check
        if (booking.customerEmail !== req.user.email) {
            throw new AppError(
                403,
                "Forbidden: you can only pay for your own bookings"
            );
        }

        // Challenge 2 rule: payment is strictly locked until technician completes the job
        if (booking.status !== "completed") {
            throw new AppError(
                400,
                `Payment is only available after repair completion (current status: "${booking.status}")`
            );
        }

        if (booking.paymentStatus === "paid") {
            throw new AppError(409, "This booking has already been paid");
        }

        // Always read authoritative amount from MongoDB — never trust client input
        const amountInCents = Math.round(Number(booking.finalAmount) * 100);
        if (!Number.isFinite(amountInCents) || amountInCents < 50) {
            throw new AppError(
                400,
                "Invalid final amount on booking (minimum $0.50 required by Stripe)"
            );
        }

        const stripe = getStripe();
        const clientUrl = getClientUrl();

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            customer_email: req.user.email,
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: "usd",
                        unit_amount: amountInCents,
                        product_data: {
                            name: booking.serviceTitle,
                            description: `Repair by ${booking.technicianName} (${booking.category} • ${booking.serviceMode})`,
                        },
                    },
                },
            ],
            metadata: {
                bookingId: booking._id.toString(),
                customerEmail: req.user.email,
                technicianEmail: booking.technicianEmail,
            },
            success_url: `${clientUrl}/dashboard/customer/payments/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${clientUrl}/dashboard/customer/bookings?payment=cancelled`,
        });

        if (!session.url) {
            throw new AppError(502, "Stripe did not return a checkout URL");
        }

        res.status(200).json({
            success: true,
            data: {
                sessionId: session.id,
                url: session.url,
            },
        });
    } catch (error) {
        next(error);
    }
}

// 2. CUSTOMER — Verify Returned Checkout Session Directly With Stripe API
export async function verifyCheckoutSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const { sessionId } = req.body as { sessionId: string };
        const stripe = getStripe();

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // Prevent IDOR: ensure this Stripe session belongs to the signed-in customer
        if (session.metadata?.customerEmail !== req.user.email) {
            throw new AppError(
                403,
                "Forbidden: this payment session does not belong to your account"
            );
        }

        const receipt = await fulfillPaidSession(session);

        res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            data: receipt,
        });
    } catch (error) {
        next(error);
    }
}

// 3. CUSTOMER — Fetch Logged-in Customer's Verified Payment Receipts
export async function getMyPayments(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (!req.user) throw new AppError(401, "Unauthorized");

        const db = getDB();
        const payments = await db
            .collection("payments")
            .find({ customerEmail: req.user.email })
            .sort({ paidAt: -1 })
            .toArray();

        res.status(200).json({
            success: true,
            count: payments.length,
            data: payments,
        });
    } catch (error) {
        next(error);
    }
}

// 4. STRIPE WEBHOOK — Background Payment Confirmation (Requires raw request body!)
export async function handleStripeWebhook(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
        if (!webhookSecret) {
            throw new AppError(500, "Webhook secret is not configured");
        }

        const signature = req.headers["stripe-signature"];
        if (typeof signature !== "string") {
            throw new AppError(400, "Missing stripe-signature header");
        }

        const stripe = getStripe();
        const event = stripe.webhooks.constructEvent(
            req.body as Buffer,
            signature,
            webhookSecret
        );

        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;
            if (session.payment_status === "paid") {
                await fulfillPaidSession(session);
            }
        }

        res.status(200).json({ received: true });
    } catch (error) {
        next(error);
    }
}