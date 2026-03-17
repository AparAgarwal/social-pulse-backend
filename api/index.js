import "dotenv/config";
import app from "../src/app.js";
import connectDB from "../src/config/db.js";

let dbConnectionPromise;

async function ensureDatabaseConnection() {
    if (!dbConnectionPromise) {
        dbConnectionPromise = connectDB();
    }

    return dbConnectionPromise;
}

export default async function handler(req, res) {
    await ensureDatabaseConnection();
    return app(req, res);
}
