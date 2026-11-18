import express, { type Application, type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app: Application = express();

// Middlewares
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    credentials: true // Allow credentials (cookies, authorization headers, etc.) to be sent in cross-origin requests
}));
app.use(express.json());

// Health Check API
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'success', message: 'FixMate server is running smoothly.' });
});

export default app;