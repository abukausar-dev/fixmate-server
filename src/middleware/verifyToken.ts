import type { Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ObjectId } from 'mongodb';
import { getDB } from '../config/database.js';
import type { AuthenticatedRequest, UserRole } from '../types/auth.js';

const issuer = process.env.JWT_ISSUER || 'http://localhost:3000';
const audience = process.env.JWT_AUDIENCE || 'http://localhost:3000';

// BetterAuth-এর JWKS এন্ডপয়েন্ট থেকে পাবলিক কি ফেচ ও ক্যাশ করা হয়
const jwks = createRemoteJWKSet(new URL(`${issuer}/api/auth/jwks`));

interface UserDocument {
    _id: ObjectId;
    id?: string;
    name: string;
    email: string;
    role?: UserRole;
    image?: string;
    phone?: string;
    area?: string;
    bio?: string;
}

export const verifyToken = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                status: 'error',
                message: 'Unauthorized: Missing or malformed Bearer token',
            });
            return;
        }

        const token = authHeader.slice(7).trim();
        if (!token) {
            res.status(401).json({
                status: 'error',
                message: 'Unauthorized: Token is empty',
            });
            return;
        }

        const { payload } = await jwtVerify(token, jwks, {
            issuer,
            audience,
        });

        const tokenSub = typeof payload.sub === 'string' ? payload.sub : undefined;
        const tokenEmail =
            typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;

        if (!tokenSub && !tokenEmail) {
            res.status(401).json({
                status: 'error',
                message: 'Unauthorized: Token payload lacks identity claims',
            });
            return;
        }

        const db = getDB();
        const usersCollection = db.collection<UserDocument>('users');

        let userDoc: UserDocument | null = null;

        if (tokenSub && ObjectId.isValid(tokenSub)) {
            userDoc = await usersCollection.findOne({ _id: new ObjectId(tokenSub) });
        }

        if (!userDoc && tokenSub) {
            userDoc = await usersCollection.findOne({ id: tokenSub });
        }

        if (!userDoc && tokenEmail) {
            userDoc = await usersCollection.findOne({ email: tokenEmail });
        }

        if (!userDoc) {
            res.status(401).json({
                status: 'error',
                message: 'Unauthorized: User account no longer exists',
            });
            return;
        }

        const validRoles: UserRole[] = ['customer', 'technician', 'admin'];
        const currentRole: UserRole =
            userDoc.role && validRoles.includes(userDoc.role)
                ? userDoc.role
                : 'customer';

        req.user = {
            id: userDoc._id.toString(),
            name: userDoc.name,
            email: userDoc.email,
            role: currentRole,
            image: userDoc.image,
            phone: userDoc.phone,
            area: userDoc.area,
            bio: userDoc.bio,
        };

        next();
    } catch {
        res.status(401).json({
            status: 'error',
            message: 'Unauthorized: Invalid or expired token',
        });
    }
};