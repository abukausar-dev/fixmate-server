import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { verifyTechnician } from "../middleware/verifyTechnician.js";
import { validateBody } from "../middleware/validateRequest.js";
import {
    createServiceSchema,
    updateServiceSchema,
    availabilitySchema,
} from "../schemas/service.schema.js";
import {
    getPublicServices,
    getPublicServiceById,
    createService,
    getMyServices,
    updateMyService,
    toggleServiceAvailability,
    deleteMyService,
} from "../controllers/service.controller.js";

const router = Router();

// Public routes (Challenge 1 server-side search/filter/sort)
router.get("/", getPublicServices);

// Technician-only routes (declared BEFORE /:id so "/my" is never matched as an ID)
router.get("/my", verifyToken, verifyTechnician, getMyServices);
router.post(
    "/",
    verifyToken,
    verifyTechnician,
    validateBody(createServiceSchema),
    createService
);

// Public single service details
router.get("/:id", getPublicServiceById);

// Technician-owned mutations
router.patch(
    "/:id",
    verifyToken,
    verifyTechnician,
    validateBody(updateServiceSchema),
    updateMyService
);
router.patch(
    "/:id/availability",
    verifyToken,
    verifyTechnician,
    validateBody(availabilitySchema),
    toggleServiceAvailability
);
router.delete("/:id", verifyToken, verifyTechnician, deleteMyService);

export default router;