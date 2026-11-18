import app from './app.js';
import { connectDB } from './config/database.js';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        // Connect to the database
        await connectDB();

        app.listen(PORT, () => {
            console.log(`🚀 Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
    }
};

startServer();