import User from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const registerUser = asyncHandler(async (req, res) => {
    const { fullname, email, username, password } = req.body;

    try {
        const user = await User.create({ fullname, email, username, password });
        return res.status(201).json(new ApiResponse(201, user, "User registered"));
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

    return res.status(200).json(new ApiResponse(200, user, "Logged in"));
});

export const logoutUser = asyncHandler(async (req, res) => {
    res.send('logout route');
});