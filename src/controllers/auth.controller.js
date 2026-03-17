import User from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { hashToken } from "../utils/helper.js";
import {
    accessCookieClearOptions,
    accessCookieOptions,
    createSessionForUser,
    findActiveSessionById,
    findActiveSessionByRefreshHash,
    MAX_ACTIVE_SESSIONS,
    pruneStaleSessions,
    refreshCookieClearOptions,
    refreshCookieOptions,
    revokeSessionById,
    serializeActiveSessions,
    updateSessionRefreshToken,
} from "../services/session.service.js";
import {
    issueSessionManagementToken,
    verifyRefreshToken,
} from "../services/token.service.js";
import { buildSessionDeviceDetails } from "../services/device.service.js";

export const registerUser = asyncHandler(async (req, res) => {
    const { fullname, email, username, password } = req.body;

    try {
        const user = await User.create({ fullname, email, username, password });

        const deviceDetails = buildSessionDeviceDetails(req);
        const { accessToken, refreshToken } = createSessionForUser(user, deviceDetails);
        await user.save();

        res.cookie('accessToken', accessToken, accessCookieOptions);
        res.cookie('refreshToken', refreshToken, refreshCookieOptions);
        return res.status(201).json(new ApiResponse(201, { user }, "User registered"));
    } catch (err) {
        // Duplicate key (unique) error
        if (err.code === 11000) {
            const field = Object.keys(err.keyValue || {})[0] || "field";
            throw new ApiError(409, `User with this ${field} already exists`);
        }
        throw err;
    }
});

export const loginUser = asyncHandler(async (req, res) => {
    const { email, username, password } = req.body;

    const query = email ? { email } : { username };
    const user = await User.findOne(query).select("+password");
    if (!user) {
        throw new ApiError(401, "Invalid credentials");
    }

    const ok = await user.isPasswordCorrect(password);
    if (!ok) {
        throw new ApiError(401, "Invalid credentials");
    }

    const pruneResult = pruneStaleSessions(user);
    if (pruneResult.changed) {
        await user.save();
    }

    const activeSessions = serializeActiveSessions(user);
    if (activeSessions.length >= MAX_ACTIVE_SESSIONS) {
        const sessionManagementToken = issueSessionManagementToken(user._id.toString());
        return res.status(409).json(
            new ApiResponse(
                409,
                {
                    code: "MAX_ACTIVE_SESSIONS_REACHED",
                    maxActiveSessions: MAX_ACTIVE_SESSIONS,
                    activeSessions,
                    sessionManagementToken,
                },
                "Maximum active sessions reached. Logout one active session and try again."
            )
        );
    }

    const deviceDetails = buildSessionDeviceDetails(req);
    const { accessToken, refreshToken } = createSessionForUser(user, deviceDetails);
    await user.save();

    res.cookie('accessToken', accessToken, accessCookieOptions);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    return res.status(200).json(new ApiResponse(200, { user }, "Logged in"));
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
    const user = req.user;
    const sessionId = req.sessionId;

    if (!user || !sessionId) {
        throw new ApiError(401, "Invalid refresh request.");
    }

    const pruneResult = pruneStaleSessions(user);
    if (pruneResult.changed) {
        await user.save();
    }

    const activeSession = findActiveSessionById(user, sessionId);
    if (!activeSession) {
        throw new ApiError(401, "Session revoked or invalid.");
    }

    const accessToken = user.generateAccessToken(sessionId);
    const newRefreshToken = user.generateRefreshToken(sessionId);
    updateSessionRefreshToken(activeSession, newRefreshToken);
    await user.save();

    res.cookie('accessToken', accessToken, accessCookieOptions);
    res.cookie('refreshToken', newRefreshToken, refreshCookieOptions);
    return res.status(200).json(new ApiResponse(200, null, "Access token refreshed"));
});

export const logoutUser = asyncHandler(async (req, res) => {
    const incomingToken = req.cookies?.refreshToken;

    if (incomingToken) {
        try {
            const decoded = verifyRefreshToken(incomingToken);
            if (decoded?.id && decoded?.sessionId) {
                const incomingTokenHash = hashToken(incomingToken);
                const user = await User.findById(decoded.id);

                if (user) {
                    const session = findActiveSessionByRefreshHash(user, decoded.sessionId, incomingTokenHash);

                    if (session) {
                        revokeSessionById(user, decoded.sessionId);
                        await user.save();
                    }
                }
            }
        } catch {
            // Ignore invalid refresh token during logout and clear cookie anyway.
        }
    }

    res.clearCookie('accessToken', accessCookieClearOptions);
    res.clearCookie('refreshToken', refreshCookieClearOptions);

    return res.status(200).json(new ApiResponse(200, null, "Logged out successfully"));

});

export const listActiveSessions = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user?.id);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const pruneResult = pruneStaleSessions(user);
    if (pruneResult.changed) {
        await user.save();
    }

    const sessions = serializeActiveSessions(user, req.user?.sessionId);
    return res.status(200).json(
        new ApiResponse(200, { sessions, maxActiveSessions: MAX_ACTIVE_SESSIONS }, "Active sessions fetched")
    );
});

export const revokeSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    const user = await User.findById(req.user?.id);

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const revoked = revokeSessionById(user, sessionId);
    if (!revoked) {
        throw new ApiError(404, "Active session not found");
    }

    await user.save();

    if (req.user?.sessionId === sessionId) {
        res.clearCookie('accessToken', accessCookieClearOptions);
        res.clearCookie('refreshToken', refreshCookieClearOptions);
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { sessions: serializeActiveSessions(user, req.user?.sessionId) },
            "Session revoked successfully"
        )
    );
});

export const listSessionsForManagement = asyncHandler(async (req, res) => {
    const user = req.sessionManagementUser;
    const pruneResult = pruneStaleSessions(user);
    if (pruneResult.changed) {
        await user.save();
    }

    const sessions = serializeActiveSessions(user);

    return res.status(200).json(
        new ApiResponse(200, { sessions, maxActiveSessions: MAX_ACTIVE_SESSIONS }, "Active sessions fetched")
    );
});

export const revokeSessionForManagement = asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    const user = req.sessionManagementUser;

    const revoked = revokeSessionById(user, sessionId);
    if (!revoked) {
        throw new ApiError(404, "Active session not found");
    }

    await user.save();

    return res.status(200).json(
        new ApiResponse(200, { sessions: serializeActiveSessions(user) }, "Session revoked successfully")
    );
});