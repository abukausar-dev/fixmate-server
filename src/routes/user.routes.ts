import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { validateBody } from "../middleware/validateRequest.js";
import { updateProfileSchema } from "../schemas/user.schema.js";
import {
    getMyProfile,
    updateMyProfile,
} from "../controllers/user.controller.js";

const router = Router();

// Every route here requires a verified JWT session
router.use(verifyToken);

router.get("/me", getMyProfile);
router.patch(
    "/profile",
    validateBody(updateProfileSchema),
    updateMyProfile
);

export default router;