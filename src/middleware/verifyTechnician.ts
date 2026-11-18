import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/auth.js';

export const verifyTechnician = (
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

    if (req.user.role !== 'technician') {
        res.status(403).json({
            status: 'error',
            message: 'Forbidden: Technician access required',
        });
        return;
    }

    next();
};