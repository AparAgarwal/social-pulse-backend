import User from "../models/user.model.js";
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

// Internal Helpers
// Shared image update helper for avatar/banner. Keeps cloud + database updates atomic with rollback safety.
const updateUserImage = async ({
    user,
    file,
    folder,
    target,
    successMessage
}) => {
    if (!file) {
        throw new ApiError(400, 'No image uploaded');
    }

    const previousPublicId = target === 'avatar'
        ? user.avatarPublicId
        : user.bannerPublicId;

    const result = await uploadToCloudinary(file.buffer, {
        folder,
        kind: target
    });

    try {
        if (target === 'avatar') {
            user.avatarUrl = result.secure_url;
            user.avatarPublicId = result.public_id;
        } else {
            user.bannerUrl = result.secure_url;
            user.bannerPublicId = result.public_id;
        }

        await user.save();
    } catch (error) {
        await deleteFromCloudinary(result.public_id).catch(() => { });
        throw error;
    }

    if (previousPublicId && previousPublicId !== result.public_id) {
        await deleteFromCloudinary(previousPublicId).catch(() => { });
    }

    return new ApiResponse(200, user, successMessage);
};

// Profile Read Controllers
export const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("-refreshTokens");
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    res.status(200).json(new ApiResponse(200, user, "Current user fetched successfully."));
});

export const getPublicUserProfile = asyncHandler(async (req, res) => {
    const { username } = req.params;

    if (!username) {
        throw new ApiError(400, "Username is required");
    }

    const user = await User.findOne({ username: username.toLowerCase() })
        .select("fullname username bio avatarUrl bannerUrl createdAt");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new ApiResponse(200, user, "Public profile fetched successfully.")
    );
});

// Profile Update Controller
export const updateCurrentUserProfile = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    const { fullname, username, bio } = req.body;
    const updatePayload = {};

    if (typeof fullname !== 'undefined') {
        updatePayload.fullname = fullname.trim();
    }

    if (typeof username !== 'undefined') {
        updatePayload.username = username.trim().toLowerCase();
    }

    if (typeof bio !== 'undefined') {
        updatePayload.bio = bio;
    }

    try {
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: updatePayload },
            { new: true, runValidators: true }
        ).select('-refreshTokens');

        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        return res.status(200).json(
            new ApiResponse(200, user, 'Profile updated successfully.')
        );
    } catch (error) {
        if (error?.code === 11000) {
            const field = Object.keys(error.keyValue || {})[0] || 'field';
            throw new ApiError(409, `User with this ${field} already exists`);
        }
        throw error;
    }
});

// Media Upload Controllers
export const uploadAvatar = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    const response = await updateUserImage({
        user,
        file: req.file,
        folder: `social-pulse/users/${user._id}/avatar`,
        target: 'avatar',
        successMessage: 'Avatar updated successfully'
    });

    return res.status(200).json(response);
});

export const uploadBanner = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    const response = await updateUserImage({
        user,
        file: req.file,
        folder: `social-pulse/users/${user._id}/banner`,
        target: 'banner',
        successMessage: 'Banner updated successfully'
    });

    return res.status(200).json(response);
});