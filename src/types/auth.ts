import type { Request } from 'express';

export type UserRole = 'customer' | 'technician' | 'admin';

export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    image?: string;
    phone?: string;
    area?: string;
    bio?: string;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}