import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { verifyAdmin } from "../middleware/verifyAdmin.js";
import { validateBody } from "../middleware/validateRequest.js";
import { approvalSchema } from "../schemas/service.schema.js";
import { updateUserRoleSchema } from "../schemas/admin.schema.js";
import {
    getAdminServices,
    moderateServiceApproval,
} from "../controllers/service.controller.js";
import {
    getAdminStats,
    getAdminBookings,
    getAdminUsers,
    updateUserRole,
} from "../controllers/admin.controller.js";

const router = Router();

// Protect every admin route with JWT + live DB admin role check
router.use(verifyToken, verifyAdmin);

// Overview metrics
router.get("/stats", getAdminStats);

// Service moderation
router.get("/services", getAdminServices);
router.patch(
    "/services/:id/approval",
    validateBody(approvalSchema),
    moderateServiceApproval
);

// Bookings oversight
router.get("/bookings", getAdminBookings);

// User management
router.get("/users", getAdminUsers);
router.patch(
    "/users/:id/role",
    validateBody(updateUserRoleSchema),
    updateUserRole
);

export default router;