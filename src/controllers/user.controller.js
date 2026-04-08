import User from "../models/user.model.js";
import Follow from "../models/follow.model.js";
import Post from "../models/post.model.js";
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { getLikedPostIdsSet, toPublicPostWithLikeState } from "../utils/post.helpers.js";

const parsePagination = (query) => {
    const rawPage = Number.parseInt(query?.page, 10);
    const rawLimit = Number.parseInt(query?.limit, 10);

    const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);

    return { page, limit, skip: (page - 1) * limit };
};

const getUserByUsername = async (username) => {
    if (!username) {
        throw new ApiError(400, "Username is required");
    }

    const user = await User.findOne({ username: username.toLowerCase() }).select("_id username");
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return user;
};

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
        ? user.profile?.avatar?.publicId
        : user.profile?.banner?.publicId;

    const result = await uploadToCloudinary(file.buffer, {
        folder,
        kind: target
    });

    try {
        user.profile = user.profile || {};

        if (target === 'avatar') {
            user.profile.avatar = user.profile.avatar || {};
            user.profile.avatar.url = result.secure_url;
            user.profile.avatar.publicId = result.public_id;
        } else {
            user.profile.banner = user.profile.banner || {};
            user.profile.banner.url = result.secure_url;
            user.profile.banner.publicId = result.public_id;
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

const removeUserImage = async ({ user, target, successMessage }) => {
    const publicId = target === 'avatar'
        ? user.profile?.avatar?.publicId
        : user.profile?.banner?.publicId;

    if (!publicId) {
        throw new ApiError(400, `No ${target} found to delete`);
    }

    await deleteFromCloudinary(publicId).catch(() => { });

    user.profile = user.profile || {};

    if (target === 'avatar') {
        user.profile.avatar = user.profile.avatar || {};
        user.profile.avatar.url = null;
        user.profile.avatar.publicId = null;
    } else {
        user.profile.banner = user.profile.banner || {};
        user.profile.banner.url = null;
        user.profile.banner.publicId = null;
    }

    await user.save();

    return new ApiResponse(200, user, successMessage);
};

// Profile Read Controllers
export const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("-sessions");
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    res.status(200).json(new ApiResponse(200, user, "Current user fetched successfully."));
});

export const getPublicUserProfile = asyncHandler(async (req, res) => {
    const { username } = req.params;
    const requesterId = req.user?.id || null;

    if (!username) {
        throw new ApiError(400, "Username is required");
    }

    const user = await User.findOne({ username: username.toLowerCase() })
        .select("fullname username profile.bio profile.location profile.website profile.avatar.url profile.banner.url socialMetrics.followersCount socialMetrics.followingCount accountSettings.isPrivate createdAt updatedAt");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    let isFollowing = null;

    if (requesterId) {
        if (requesterId === user._id.toString()) {
            isFollowing = false;
        } else {
            const followRelation = await Follow.exists({
                follower: requesterId,
                following: user._id,
            });
            isFollowing = Boolean(followRelation);
        }
    }

    const payload = user.toObject();
    payload.isFollowing = isFollowing;

    return res.status(200).json(
        new ApiResponse(200, payload, "Public profile fetched successfully.")
    );
});

export const followUser = asyncHandler(async (req, res) => {
    const requesterId = req.user?.id;
    if (!requesterId) {
        throw new ApiError(401, 'Unauthorized');
    }

    const targetUser = await getUserByUsername(req.params.username);

    if (requesterId === targetUser._id.toString()) {
        throw new ApiError(400, 'You cannot follow yourself');
    }

    const followResult = await Follow.updateOne(
        { follower: requesterId, following: targetUser._id },
        { $setOnInsert: { follower: requesterId, following: targetUser._id } },
        { upsert: true }
    );

    const wasCreated = followResult.upsertedCount > 0;

    if (wasCreated) {
        await User.bulkWrite([
            {
                updateOne: {
                    filter: { _id: requesterId },
                    update: { $inc: { 'socialMetrics.followingCount': 1 } },
                },
            },
            {
                updateOne: {
                    filter: { _id: targetUser._id },
                    update: { $inc: { 'socialMetrics.followersCount': 1 } },
                },
            },
        ]);
    }

    return res.status(wasCreated ? 201 : 200).json(
        new ApiResponse(
            wasCreated ? 201 : 200,
            { username: targetUser.username, isFollowing: true },
            wasCreated ? 'User followed successfully.' : 'Already following this user.'
        )
    );
});

export const unfollowUser = asyncHandler(async (req, res) => {
    const requesterId = req.user?.id;
    if (!requesterId) {
        throw new ApiError(401, 'Unauthorized');
    }

    const targetUser = await getUserByUsername(req.params.username);

    if (requesterId === targetUser._id.toString()) {
        throw new ApiError(400, 'You cannot unfollow yourself');
    }

    const deleteResult = await Follow.deleteOne({
        follower: requesterId,
        following: targetUser._id,
    });

    const wasRemoved = deleteResult.deletedCount > 0;

    if (wasRemoved) {
        await User.bulkWrite([
            {
                updateOne: {
                    filter: { _id: requesterId },
                    update: [
                        {
                            $set: {
                                'socialMetrics.followingCount': {
                                    $max: [
                                        { $add: [{ $ifNull: ['$socialMetrics.followingCount', 0] }, -1] },
                                        0,
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
            {
                updateOne: {
                    filter: { _id: targetUser._id },
                    update: [
                        {
                            $set: {
                                'socialMetrics.followersCount': {
                                    $max: [
                                        { $add: [{ $ifNull: ['$socialMetrics.followersCount', 0] }, -1] },
                                        0,
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
        ]);
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { username: targetUser.username, isFollowing: false },
            wasRemoved ? 'User unfollowed successfully.' : 'You are not following this user.'
        )
    );
});

export const listFollowers = asyncHandler(async (req, res) => {
    const targetUser = await getUserByUsername(req.params.username);
    const { page, limit, skip } = parsePagination(req.query);

    const [total, entries] = await Promise.all([
        Follow.countDocuments({ following: targetUser._id }),
        Follow.find({ following: targetUser._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({
                path: 'follower',
                select: 'fullname username profile.avatar.url profile.bio socialMetrics.followersCount socialMetrics.followingCount',
            })
            .lean(),
    ]);

    const followers = entries
        .filter((entry) => entry.follower)
        .map((entry) => ({
            ...entry.follower,
            followedAt: entry.createdAt,
        }));

    return res.status(200).json(
        new ApiResponse(200, {
            user: targetUser.username,
            pagination: {
                page,
                limit,
                total,
                hasMore: page * limit < total,
            },
            followers,
        }, 'Followers fetched successfully.')
    );
});

export const listFollowing = asyncHandler(async (req, res) => {
    const targetUser = await getUserByUsername(req.params.username);
    const { page, limit, skip } = parsePagination(req.query);

    const [total, entries] = await Promise.all([
        Follow.countDocuments({ follower: targetUser._id }),
        Follow.find({ follower: targetUser._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({
                path: 'following',
                select: 'fullname username profile.avatar.url profile.bio socialMetrics.followersCount socialMetrics.followingCount',
            })
            .lean(),
    ]);

    const following = entries
        .filter((entry) => entry.following)
        .map((entry) => ({
            ...entry.following,
            followedAt: entry.createdAt,
        }));

    return res.status(200).json(
        new ApiResponse(200, {
            user: targetUser.username,
            pagination: {
                page,
                limit,
                total,
                hasMore: page * limit < total,
            },
            following,
        }, 'Following list fetched successfully.')
    );
});

export const listUserPosts = asyncHandler(async (req, res) => {
    const requesterId = req.user?.id || null;
    const { page, limit, skip } = parsePagination(req.query);
    const username = req.params.username?.toLowerCase();

    if (!username) {
        throw new ApiError(400, "Username is required");
    }

    const targetUser = await User.findOne({ username })
        .select("_id username accountSettings.isPrivate");

    if (!targetUser) {
        throw new ApiError(404, "User not found");
    }

    const isOwner = requesterId === targetUser._id.toString();
    let isFollowing = false;

    if (!isOwner && requesterId) {
        const followRelation = await Follow.exists({
            follower: requesterId,
            following: targetUser._id,
        });
        isFollowing = Boolean(followRelation);
    }

    if (targetUser.accountSettings?.isPrivate && !isOwner && !isFollowing) {
        throw new ApiError(403, "This account is private");
    }

    const filter = {
        author: targetUser._id,
        isDeleted: false,
        status: "published",
    };

    if (!isOwner) {
        filter.visibility = isFollowing ? { $in: ["public", "followers"] } : "public";
    }

    const [total, posts] = await Promise.all([
        Post.countDocuments(filter),
        Post.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({ path: "author", select: "fullname username profile.avatar.url" })
            .lean(),
    ]);

    const likedPostIdsSet = await getLikedPostIdsSet(posts, requesterId);

    return res.status(200).json(
        new ApiResponse(200, {
            user: targetUser.username,
            pagination: {
                page,
                limit,
                total,
                hasMore: page * limit < total,
            },
            posts: posts.map((post) => toPublicPostWithLikeState(post, likedPostIdsSet, requesterId)),
        }, "User posts fetched successfully.")
    );
});

// Profile Update Controller
export const updateCurrentUserProfile = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    const { fullname, username, bio, location, website, isPrivate } = req.body;
    const updatePayload = {};

    if (typeof fullname !== 'undefined') {
        updatePayload.fullname = fullname.trim();
    }

    if (typeof username !== 'undefined') {
        updatePayload.username = username.trim().toLowerCase();
    }

    if (typeof bio !== 'undefined') {
        updatePayload['profile.bio'] = bio;
    }

    if (typeof location !== 'undefined') {
        updatePayload['profile.location'] = location;
    }

    if (typeof website !== 'undefined') {
        updatePayload['profile.website'] = website;
    }

    if (typeof isPrivate !== 'undefined') {
        updatePayload['accountSettings.isPrivate'] = isPrivate;
    }

    try {
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: updatePayload },
            { returnDocument: 'after', runValidators: true }
        ).select('-sessions');

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

export const deleteAvatar = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    const response = await removeUserImage({
        user,
        target: 'avatar',
        successMessage: 'Avatar deleted successfully'
    });

    return res.status(200).json(response);
});

export const deleteBanner = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    const response = await removeUserImage({
        user,
        target: 'banner',
        successMessage: 'Banner deleted successfully'
    });

    return res.status(200).json(response);
});