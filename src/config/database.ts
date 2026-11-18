import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI as string;
const dbName = process.env.DB_NAME as string;

if (!uri) {
    throw new Error("MONGODB_URI is not defined in the environment variables");
}

// creating mongo client instance
const client = new MongoClient(uri);

let db: Db;

// database connection function
export const connectDB = async () => {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("✅ Successfully connected to MongoDB!");

        db = client.db(dbName);
        return db;
    } catch (error) {
        console.error("❌ MongoDB connection failed:", error);
        process.exit(1);
    }
};

// exporting the database instance for use in other parts of the application
export const getDB = (): Db => {
    if (!db) {
        throw new Error("Database not initialized. Call connectDB first.");
    }
    return db;
};