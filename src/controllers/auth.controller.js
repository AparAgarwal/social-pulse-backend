import User from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { hashToken } from "../utils/helper.js";

const MAX_ACTIVE_SESSIONS = Math.max(Number.parseInt(process.env.MAX_ACTIVE_SESSIONS || "3", 10) || 5, 1);

const trimOldestRefreshTokens = (user) => {
    if (!user?.refreshTokens?.length) return;
    if (user.refreshTokens.length <= MAX_ACTIVE_SESSIONS) return;

    user.refreshTokens = [...user.refreshTokens]
        .sort((firstToken, secondToken) => new Date(firstToken.createdAt) - new Date(secondToken.createdAt))
        .slice(-MAX_ACTIVE_SESSIONS);
};

export const registerUser = asyncHandler(async (req, res) => {
    const { fullname, email, username, password } = req.body;

    try {
        const user = await User.create({ fullname, email, username, password });

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
        user.refreshTokens.push({ token: hashToken(refreshToken) });
        trimOldestRefreshTokens(user);
        await user.save();

        const cookiesOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        };
        res.cookie('refreshToken', refreshToken, cookiesOptions);
        return res.status(201).json(new ApiResponse(201, { user, accessToken }, "User registered"));
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

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshTokens.push({ token: hashToken(refreshToken) });
    trimOldestRefreshTokens(user);
    await user.save();

    const cookiesOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    res.cookie('refreshToken', refreshToken, cookiesOptions);

    return res.status(200).json(new ApiResponse(200, { user, accessToken }, "Logged in"));
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
    const user = req.user;
    const incomingRefreshHash = hashToken(req.cookies.refreshToken);

    if (!user) {
        throw new ApiError(401, "Invalid refresh request.");
    }

    user.refreshTokens = user.refreshTokens.filter(({ token }) => token !== incomingRefreshHash);

    const accessToken = user.generateAccessToken();
    const newRefreshToken = user.generateRefreshToken();
    user.refreshTokens.push({ token: hashToken(newRefreshToken) });
    trimOldestRefreshTokens(user);
    await user.save();

    const cookiesOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    res.cookie('refreshToken', newRefreshToken, cookiesOptions);
    return res.status(200).json(new ApiResponse(200, { accessToken }, "Access token refreshed"));
});

export const logoutUser = asyncHandler(async (req, res) => {
    const incomingToken = req.cookies?.refreshToken;
    const incomingTokenHash = hashToken(incomingToken || "");

    if (incomingToken) {
        await User.updateOne(
            { "refreshTokens.token": incomingTokenHash },
            {
                $pull: {
                    refreshTokens: { token: incomingTokenHash }
                }
            }
        );
    }

    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });

    return res.status(200).json(new ApiResponse(200, null, "Logged out successfully"));

});