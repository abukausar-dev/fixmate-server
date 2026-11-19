import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { verifyAdmin } from "../middleware/verifyAdmin.js";
import { validateBody } from "../middleware/validateRequest.js";
import { approvalSchema } from "../schemas/service.schema.js";
import {
    getAdminServices,
    moderateServiceApproval,
} from "../controllers/service.controller.js";

const router = Router();

// Protect every route in this router with JWT + live DB admin role check
router.use(verifyToken, verifyAdmin);

router.get("/services", getAdminServices);
router.patch(
    "/services/:id/approval",
    validateBody(approvalSchema),
    moderateServiceApproval
);

export default router;