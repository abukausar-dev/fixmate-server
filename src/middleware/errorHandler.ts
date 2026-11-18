import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export const errorHandler = (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            status: 'error',
            message: err.message,
        });
        return;
    }

    if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        res.status(400).json({
            status: 'error',
            message: firstIssue?.message || 'Validation failed',
            errors: err.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            })),
        });
        return;
    }

    console.error('Unhandled server error:', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error',
    });
};