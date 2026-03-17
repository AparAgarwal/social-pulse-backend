import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/user.model.js";
import { hashToken } from "../utils/helper.js";
import {
    findActiveSessionById,
    findActiveSessionByRefreshHash,
    pruneStaleSessions,
    touchSessionLastUsed,
} from "../services/session.service.js";
import {
    verifyAccessToken,
    verifyRefreshToken,
    verifySessionManagementToken,
} from "../services/token.service.js";

const LAST_USED_UPDATE_WINDOW_MS = 5 * 60 * 1000;

export const authenticate = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.accessToken;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const token = cookieToken || bearerToken;

    if (!token) {
        throw new ApiError(401, "Access Denied. No token provided!");
    }

    try {
        const decoded = verifyAccessToken(token);

        if (!decoded?.id || !decoded?.sessionId) {
            throw new ApiError(401, "Invalid session token. Please login again.");
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            throw new ApiError(401, "Invalid token. Access denied.");
        }

        const pruneResult = pruneStaleSessions(user);
        if (pruneResult.changed) {
            await user.save();
        }

        const activeSession = findActiveSessionById(user, decoded.sessionId);
        if (!activeSession) {
            throw new ApiError(401, "Session revoked. Please login again.");
        }

        req.user = {
            id: user._id.toString(),
            email: user.email,
            sessionId: decoded.sessionId
        };

        const wasTouched = touchSessionLastUsed(user, decoded.sessionId, LAST_USED_UPDATE_WINDOW_MS);
        if (wasTouched) {
            await user.save();
        }
        next();
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

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
        const decoded = verifyRefreshToken(incomingRefresh);
        if (!decoded?.id || !decoded?.sessionId) {
            throw new ApiError(401, "Invalid Token.");
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            throw new ApiError(401, "Invalid Token.");
        }

        const pruneResult = pruneStaleSessions(user);
        if (pruneResult.changed) {
            await user.save();
        }

        const activeSession = findActiveSessionByRefreshHash(user, decoded.sessionId, incomingRefreshHash);

        if (!activeSession) {
            throw new ApiError(401, "Refresh Token revoked or invalid.");
        }

        const wasTouched = touchSessionLastUsed(user, decoded.sessionId);
        if (wasTouched) {
            await user.save();
        }

        req.user = user;
        req.session = activeSession;
        req.sessionId = decoded.sessionId;
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

export const sessionManagementAuthenticate = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new ApiError(401, "Session management token is required.");
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = verifySessionManagementToken(token);

        if (!decoded?.id || decoded?.purpose !== "session-management") {
            throw new ApiError(401, "Invalid session management token.");
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            throw new ApiError(401, "Invalid session management token.");
        }

        req.user = {
            id: user._id.toString(),
            email: user.email
        };
        req.sessionManagementUser = user;
        next();
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        if (error.name === "TokenExpiredError") {
            throw new ApiError(401, "Session management token expired. Please login again.");
        }

        throw new ApiError(401, "Invalid session management token.");
    }
});