import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { verifyCustomer } from "../middleware/verifyCustomer.js";
import { verifyTechnician } from "../middleware/verifyTechnician.js";
import { validateBody } from "../middleware/validateRequest.js";
import {
    createBookingSchema,
    updateBookingStatusSchema,
} from "../schemas/booking.schema.js";
import {
    createBooking,
    getMyBookings,
    cancelMyBooking,
    getTechnicianBookings,
    updateBookingStatus,
} from "../controllers/booking.controller.js";

const router = Router();

// Customer routes
router.post(
    "/",
    verifyToken,
    verifyCustomer,
    validateBody(createBookingSchema),
    createBooking
);
router.get("/my", verifyToken, verifyCustomer, getMyBookings);
router.patch("/:id/cancel", verifyToken, verifyCustomer, cancelMyBooking);

// Technician routes (Challenge 3 server-enforced state machine)
router.get("/technician", verifyToken, verifyTechnician, getTechnicianBookings);
router.patch(
    "/:id/status",
    verifyToken,
    verifyTechnician,
    validateBody(updateBookingStatusSchema),
    updateBookingStatus
);

export default router;