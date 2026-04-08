import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import postRoutes from "./routes/post.routes.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { ApiError } from "./utils/ApiError.js";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || process.env.CLIENT_URL || "")
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Root
app.get("/", (req, res) => {
    res.json({ message: "SocialPulse API is running." });
});

// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
    });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/posts', postRoutes);


// 404 - handler
app.use((req, res, next) => {
    next(new ApiError(404, "Page Not Found"));
});
// Global Error handler
app.use(errorHandler);

export default app;