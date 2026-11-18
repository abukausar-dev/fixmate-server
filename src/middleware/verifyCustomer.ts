import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/auth.js';

export const verifyCustomer = (
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

    if (req.user.role !== 'customer') {
        res.status(403).json({
            status: 'error',
            message: 'Forbidden: Customer access required',
        });
        return;
    }

    next();
};