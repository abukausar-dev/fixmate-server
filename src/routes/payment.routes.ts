import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { verifyCustomer } from "../middleware/verifyCustomer.js";
import { validateBody } from "../middleware/validateRequest.js";
import {
    createCheckoutSessionSchema,
    verifyCheckoutSessionSchema,
} from "../schemas/payment.schema.js";
import {
    createCheckoutSession,
    verifyCheckoutSession,
    getMyPayments,
} from "../controllers/payment.controller.js";

const router = Router();

// All customer payment endpoints require verified JWT + live DB customer role
router.use(verifyToken, verifyCustomer);

router.post(
    "/create-checkout-session",
    validateBody(createCheckoutSessionSchema),
    createCheckoutSession
);
router.post(
    "/verify-session",
    validateBody(verifyCheckoutSessionSchema),
    verifyCheckoutSession
);
router.get("/my", getMyPayments);

export default router;