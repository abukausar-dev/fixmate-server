import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { verifyCustomer } from "../middleware/verifyCustomer.js";
import { validateBody } from "../middleware/validateRequest.js";
import { createBookingSchema } from "../schemas/booking.schema.js";
import {
    createBooking,
    getMyBookings,
    cancelMyBooking,
} from "../controllers/booking.controller.js";

const router = Router();

// Customer booking endpoints (protected by JWT + live DB customer role check)
router.post(
    "/",
    verifyToken,
    verifyCustomer,
    validateBody(createBookingSchema),
    createBooking
);
router.get("/my", verifyToken, verifyCustomer, getMyBookings);
router.patch("/:id/cancel", verifyToken, verifyCustomer, cancelMyBooking);

export default router;