import { Router } from "express";
import type { NextFunction, Response } from "express";
import multer from "multer";
import { verifyToken } from "../middleware/verifyToken.js";
import type { AuthenticatedRequest } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";

const router = Router();

const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new AppError(400, "Only JPG, PNG, and WebP images are allowed"));
        }
    },
});

router.post(
    "/image",
    verifyToken,
    upload.single("image"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            const apiKey = process.env.IMGBB_API_KEY;
            if (!apiKey) {
                throw new AppError(
                    500,
                    "Image upload service is not configured on the server"
                );
            }

            if (!req.file) {
                throw new AppError(400, "Please attach an image file");
            }

            const base64Image = req.file.buffer.toString("base64");
            const formBody = new URLSearchParams();
            formBody.append("image", base64Image);

            const imgbbRes = await fetch(
                `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: formBody.toString(),
                }
            );

            const payload = (await imgbbRes.json()) as {
                success?: boolean;
                data?: { display_url?: string; url?: string };
                error?: { message?: string };
            };

            if (!imgbbRes.ok || !payload.success || !payload.data) {
                throw new AppError(
                    502,
                    payload.error?.message || "Failed to upload image to ImgBB",
                );
            }

            const imageUrl = payload.data.display_url || payload.data.url;
            if (!imageUrl) {
                throw new AppError(502, "ImgBB did not return an image URL");
            }

            res.status(201).json({
                success: true,
                data: { url: imageUrl },
            });
        } catch (error) {
            next(error);
        }
    }
);

export default router;