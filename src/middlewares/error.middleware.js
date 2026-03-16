import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
    let error = err;

    if (error?.name === 'MulterError') {
        if (error.code === 'LIMIT_FILE_SIZE') {
            error = new ApiError(400, 'Image size exceeds 2MB limit');
        } else {
            error = new ApiError(400, error.message);
        }
    }

    // If the error isn't already an ApiError, wrap it so it's consistent
    if (!(error instanceof ApiError)) {
        const statusCode = error.statusCode || 500;
        const message = error.message || "Internal Server Error";
        error = new ApiError(statusCode, message, error?.errors, err.stack);
    }

    const response = {
        ...error,
        message: error.message,
        ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
    };

    return res.status(error.statusCode).json(response);
};

export { errorHandler };