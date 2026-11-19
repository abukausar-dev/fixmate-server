import { getDB } from "./database.js";

// Creates idempotent MongoDB indexes on startup for all application collections
export async function ensureIndexes(): Promise<void> {
    const db = getDB();

    // 1. services collection indexes (speeds up Challenge 1 public browse & technician dashboard)
    const services = db.collection("services");
    await Promise.all([
        services.createIndex({ approvalStatus: 1, isAvailable: 1, createdAt: -1 }),
        services.createIndex({ category: 1, serviceMode: 1 }),
        services.createIndex({ technicianEmail: 1, createdAt: -1 }),
    ]);

    // 2. bookings collection indexes (includes concurrency-safe duplicate active request protection)
    const bookings = db.collection("bookings");
    await Promise.all([
        bookings.createIndex({ customerEmail: 1, status: 1, createdAt: -1 }),
        bookings.createIndex({ technicianEmail: 1, status: 1, createdAt: -1 }),
        bookings.createIndex({ serviceId: 1 }),
        bookings.createIndex(
            { activeRequestKey: 1 },
            {
                unique: true,
                partialFilterExpression: { activeRequestKey: { $type: "string" } },
            }
        ),
    ]);

    // 3. payments collection indexes (prevents duplicate payment records on Stripe webhook retries)
    const payments = db.collection("payments");
    await Promise.all([
        payments.createIndex({ bookingId: 1 }, { unique: true }),
        payments.createIndex({ stripeSessionId: 1 }, { unique: true }),
        payments.createIndex({ customerEmail: 1, paidAt: -1 }),
    ]);

    console.log("MongoDB indexes ensured successfully.");
}