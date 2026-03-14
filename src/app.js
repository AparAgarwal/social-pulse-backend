import express from "express";
import userRouter from "./routes/user.routes.js";
import staticRouter from "./routes/static.routes.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { ApiError } from "./utils/ApiError.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', staticRouter);
app.use('/user', userRouter);

// 404 - handler
app.use((req, res, next) => {
    next(new ApiError(404, "Page Not Found"));
});
// Global Error handler
app.use(errorHandler);

export default app;