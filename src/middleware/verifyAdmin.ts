import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/auth.js';

export const verifyAdmin = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user) {
        res.status(401).json({
            status: 'error',
            message: 'Unauthorized: Authentication required',
        });
        return;
    }

    if (req.user.role !== 'admin') {
        res.status(403).json({
            status: 'error',
            message: 'Forbidden: Admin access required',
        });
        return;
    }

    next();
};