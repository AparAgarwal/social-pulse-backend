import express from "express";
import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { ApiError } from "./utils/ApiError.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', userRoutes);

// 404 - handler
app.use((req, res, next) => {
    next(new ApiError(404, "Page Not Found"));
});
// Global Error handler
app.use(errorHandler);

export default app;