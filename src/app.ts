import express, { type Application, type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { verifyToken } from './middleware/verifyToken.js';
import { verifyAdmin } from './middleware/verifyAdmin.js';
import { errorHandler } from './middleware/errorHandler.js';
import type { AuthenticatedRequest } from './types/auth.js';
import uploadRoutes from "./routes/upload.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import adminRoutes from "./routes/admin.routes.js";

dotenv.config({ quiet: true });

const app: Application = express();

// Middlewares
app.use(
    cors({
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
        credentials: true,
    })
);
app.use(express.json());

// Health Check API
app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'success',
        message: 'FixMate server is running smoothly.',
    });
});

// Protected Auth Check API (verifies JWT + live DB role)
app.get(
    '/api/auth/me',
    verifyToken,
    (req: AuthenticatedRequest, res: Response) => {
        res.status(200).json({
            status: 'success',
            user: req.user,
        });
    }
);

// Protected Admin-Only Test API (verifies 403 Forbidden for non-admins)
app.get(
    '/api/admin/ping',
    verifyToken,
    verifyAdmin,
    (_req: AuthenticatedRequest, res: Response) => {
        res.status(200).json({
            status: 'success',
            message: 'Admin access verified.',
        });
    }
);

// Mount Routers
app.use("/api/uploads", uploadRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/admin", adminRoutes);

// 404 Route Handler
app.use((_req: Request, res: Response) => {
    res.status(404).json({
        status: 'error',
        message: 'Requested API endpoint not found',
    });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;