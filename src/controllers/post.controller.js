import Post from "../models/post.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    createPostWithShortIdRetry,
    getAccessiblePost,
    getFollowingAuthorIds,
    getPostIdentifierQuery,
    getLikedPostIdsSet,
    parsePagination,
    toPublicPost,
    toPublicPostWithLikeState,
    toPublicDeletedPost,
    RETENTION_DAYS,
    RETENTION_MS,
} from "../utils/post.helpers.js";

// ============================================
// POST CRUD OPERATIONS
// ============================================

export const createPost = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { content, media, tags, visibility, status, allowComments } = req.body;

    const post = await createPostWithShortIdRetry({
        author: userId,
        content,
        media: media || [],
        tags: tags || [],
        visibility: visibility || "public",
        status: status || "published",
        allowComments: allowComments !== false,
    });

    const populatedPost = await Post.findById(post._id)
        .populate({ path: "author", select: "fullname username profile.avatar.url" })
        .lean();

    return res.status(201).json(
        new ApiResponse(201, toPublicPost(populatedPost), "Post created successfully.")
    );
});

export const getPost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const accessCheckedPost = await getAccessiblePost(postId, req.user?.id);

    const post = await Post.findById(accessCheckedPost._id)
        .populate({ path: "author", select: "fullname username profile.avatar.url" })
        .lean();

    const likedPostIdsSet = await getLikedPostIdsSet([post], req.user?.id);

    return res.status(200).json(
        new ApiResponse(200, toPublicPostWithLikeState(post, likedPostIdsSet, req.user?.id), "Post fetched successfully.")
    );
});

export const listPosts = asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const userId = req.user?.id;
    const requestedFeed = typeof req.query.feed === "string" ? req.query.feed.toLowerCase() : "public";

    const baseFilter = {
        isDeleted: false,
        status: "published",
    };

    if (!["public", "following"].includes(requestedFeed)) {
        throw new ApiError(400, "Invalid feed filter");
    }

    if (requestedFeed === "following") {
        if (!userId) {
            throw new ApiError(401, "Authentication required for following feed");
        }

        const followingAuthorIds = await getFollowingAuthorIds(userId);

        baseFilter.author = { $in: followingAuthorIds };
        baseFilter.visibility = { $in: ["public", "followers"] };
    } else {
        if (!userId) {
            baseFilter.visibility = "public";
        } else {
            const followingAuthorIds = await getFollowingAuthorIds(userId);
            const followerOnlyClause = followingAuthorIds.length > 0
                ? [{ visibility: "followers", author: { $in: followingAuthorIds } }]
                : [];

            baseFilter.$or = [
                { visibility: "public" },
                {
                    author: userId,
                    visibility: { $in: ["public", "followers"] },
                },
                ...followerOnlyClause,
            ];
        }
    }

    const [total, posts] = await Promise.all([
        Post.countDocuments(baseFilter),
        Post.find(baseFilter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({ path: "author", select: "fullname username profile.avatar.url" })
            .lean(),
    ]);

    const likedPostIdsSet = await getLikedPostIdsSet(posts, req.user?.id);

    return res.status(200).json(
        new ApiResponse(200, {
            pagination: {
                page,
                limit,
                total,
                hasMore: page * limit < total,
            },
            posts: posts.map((post) => toPublicPostWithLikeState(post, likedPostIdsSet, req.user?.id)),
        }, "Posts fetched successfully.")
    );
});

export const updatePost = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { postId } = req.params;
    const identifierQuery = getPostIdentifierQuery(postId);

    const post = await Post.findOne(identifierQuery).select("_id author isDeleted");

    if (!post || post.isDeleted) {
        throw new ApiError(404, "Post not found");
    }

    if (post.author.toString() !== userId) {
        throw new ApiError(403, "You can only update your own posts");
    }

    const { content, media, tags, visibility, status, allowComments } = req.body;
    const updatePayload = {};

    if (typeof content !== 'undefined') {
        updatePayload.content = content;
    }
    if (typeof media !== 'undefined') {
        updatePayload.media = media;
    }
    if (typeof tags !== 'undefined') {
        updatePayload.tags = tags;
    }
    if (typeof visibility !== 'undefined') {
        updatePayload.visibility = visibility;
    }
    if (typeof status !== 'undefined') {
        updatePayload.status = status;
    }
    if (typeof allowComments !== 'undefined') {
        updatePayload.allowComments = allowComments;
    }

    updatePayload.lastEditedAt = new Date();

    const updatedPost = await Post.findByIdAndUpdate(
        post._id,
        updatePayload,
        { new: true }
    )
        .populate({ path: "author", select: "fullname username profile.avatar.url" })
        .lean();

    return res.status(200).json(
        new ApiResponse(200, toPublicPost(updatedPost), "Post updated successfully.")
    );
});

export const deletePost = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { postId } = req.params;
    const identifierQuery = getPostIdentifierQuery(postId);

    const post = await Post.findOne(identifierQuery).select("_id shortId author isDeleted");

    if (!post || post.isDeleted) {
        throw new ApiError(404, "Post not found");
    }

    if (post.author.toString() !== userId) {
        throw new ApiError(403, "You can only delete your own posts");
    }

    await Post.updateOne(
        { _id: post._id },
        {
            isDeleted: true,
            deletedAt: new Date(),
        }
    );

    return res.status(200).json(
        new ApiResponse(200, {
            postId: post.shortId,
            deleted: true,
            retentionDays: RETENTION_DAYS,
            restoreUntil: new Date(Date.now() + RETENTION_MS),
        }, "Post moved to trash successfully.")
    );
});

export const listDeletedPosts = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { page, limit, skip } = parsePagination(req.query);
    const filter = { author: userId, isDeleted: true };

    const [total, posts] = await Promise.all([
        Post.countDocuments(filter),
        Post.find(filter)
            .sort({ deletedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({ path: "author", select: "fullname username profile.avatar.url" })
            .lean(),
    ]);

    return res.status(200).json(
        new ApiResponse(200, {
            pagination: {
                page,
                limit,
                total,
                hasMore: page * limit < total,
            },
            retentionDays: RETENTION_DAYS,
            posts: posts.map(toPublicDeletedPost),
        }, "Deleted posts fetched successfully.")
    );
});

export const restorePost = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { postId } = req.params;
    const identifierQuery = getPostIdentifierQuery(postId);

    const post = await Post.findOne(identifierQuery).select("_id shortId author isDeleted deletedAt status");

    if (!post) {
        throw new ApiError(404, "Post not found");
    }

    if (post.author.toString() !== userId) {
        throw new ApiError(403, "You can only restore your own posts");
    }

    if (!post.isDeleted) {
        throw new ApiError(400, "Post is not in trash");
    }

    post.isDeleted = false;
    post.deletedAt = null;

    if (post.status === "archived") {
        post.status = "published";
    }

    await post.save();

    const restored = await Post.findById(post._id)
        .populate({ path: "author", select: "fullname username profile.avatar.url" })
        .lean();

    return res.status(200).json(
        new ApiResponse(200, toPublicPost(restored), "Post restored successfully.")
    );
});

export const permanentlyDeletePost = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { postId } = req.params;
    const identifierQuery = getPostIdentifierQuery(postId);

    const post = await Post.findOne(identifierQuery).select("_id shortId author isDeleted");

    if (!post) {
        throw new ApiError(404, "Post not found");
    }

    if (post.author.toString() !== userId) {
        throw new ApiError(403, "You can only permanently delete your own posts");
    }

    if (!post.isDeleted) {
        throw new ApiError(400, "Post must be in trash before permanent deletion");
    }

    const Comment = (await import("../models/comment.model.js")).default;
    const PostLike = (await import("../models/postLike.model.js")).default;

    await Promise.all([
        PostLike.deleteMany({ post: post._id }),
        Comment.deleteMany({ post: post._id }),
        Post.deleteOne({ _id: post._id }),
    ]);

    return res.status(200).json(
        new ApiResponse(200, { postId: post.shortId, permanentlyDeleted: true }, "Post permanently deleted successfully.")
    );
});
