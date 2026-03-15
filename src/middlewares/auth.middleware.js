import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/user.model.js";
import { hashToken } from "../utils/helper.js";

export const authenticate = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new ApiError(401, "Access Denied. No token provided!");
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_SECRET);

        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new ApiError(401, 'Token has expired. Please login again.');
        }
        throw new ApiError(401, 'Invalid token. Access denied.');
    }
});

export const refreshAuthenticate = asyncHandler(async (req, res, next) => {
    const incomingRefresh = req.cookies?.refreshToken;
    const incomingRefreshHash = hashToken(incomingRefresh || "");
    if (!incomingRefresh) {
        throw new ApiError(401, "No Refresh Token. Login Again.");
    }

    try {
        const decoded = jwt.verify(incomingRefresh, process.env.REFRESH_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) {
            throw new ApiError(401, "Invalid Token.");
        }

        const found = user.refreshTokens.some((storedToken) => storedToken.token === incomingRefreshHash);
        if (!found) {
            throw new ApiError(401, "Refresh Token revoked or invalid.");
        }

        req.user = user;
        next();
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        if (error.name === "TokenExpiredError") {
            throw new ApiError(401, "Refresh Token Expired. Login Again.");
        }
        throw new ApiError(401, "Invalid Token.");
    }
});