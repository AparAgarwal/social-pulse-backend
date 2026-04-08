import mongoose from "mongoose";
import Follow from "../models/follow.model.js";
import Post from "../models/post.model.js";
import PostLike from "../models/postLike.model.js";
import { ApiError } from "./ApiError.js";

const SHORT_ID_REGEX = /^[A-HJ-NP-Za-km-z1-9]{12}$/;
const POST_TRASH_RETENTION_DAYS = Number.parseInt(process.env.POST_TRASH_RETENTION_DAYS || "30", 10);
const RETENTION_DAYS = Number.isNaN(POST_TRASH_RETENTION_DAYS) || POST_TRASH_RETENTION_DAYS < 1
    ? 30
    : POST_TRASH_RETENTION_DAYS;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const parsePagination = (query) => {
    const rawPage = Number.parseInt(query?.page, 10);
    const rawLimit = Number.parseInt(query?.limit, 10);

    const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);

    return { page, limit, skip: (page - 1) * limit };
};

export const getPostIdentifierQuery = (identifier) => {
    if (mongoose.Types.ObjectId.isValid(identifier)) {
        return { _id: identifier };
    }

    if (SHORT_ID_REGEX.test(identifier)) {
        return { shortId: identifier };
    }

    throw new ApiError(400, "Invalid post identifier");
};

export const isOwnPost = (authorId, userId) => {
    if (!authorId || !userId) {
        return false;
    }

    return authorId.toString() === userId;
};

export const isFollowingAuthor = async (viewerId, authorId) => {
    if (!viewerId || !authorId || viewerId === authorId.toString()) {
        return false;
    }

    const relation = await Follow.exists({
        follower: viewerId,
        following: authorId,
    });

    return Boolean(relation);
};

export const assertPostReadAccess = async (post, viewerId) => {
    if (!post) {
        throw new ApiError(404, "Post not found");
    }

    if (isOwnPost(post.author, viewerId)) {
        return;
    }

    if (post.visibility === "public") {
        return;
    }

    if (post.visibility === "followers") {
        const follower = await isFollowingAuthor(viewerId, post.author);
        if (follower) {
            return;
        }
    }

    throw new ApiError(403, "You do not have access to this post");
};

export const getAccessiblePost = async (postIdentifier, viewerId) => {
    const identifierQuery = getPostIdentifierQuery(postIdentifier);

    const post = await Post.findOne({
        ...identifierQuery,
        isDeleted: false,
        status: { $ne: "archived" },
    }).select("_id shortId author visibility allowComments");

    await assertPostReadAccess(post, viewerId);

    return post;
};

export const getFollowingAuthorIds = async (viewerId) => {
    if (!viewerId) {
        return [];
    }

    const follows = await Follow.find({ follower: viewerId })
        .select("following -_id")
        .lean();

    return follows.map((entry) => entry.following);
};

export const createPostWithShortIdRetry = async (payload, retries = 2) => {
    let attempts = 0;

    while (attempts <= retries) {
        try {
            return await Post.create(payload);
        } catch (error) {
            const isShortIdCollision = error?.code === 11000 && error?.keyPattern?.shortId;

            if (!isShortIdCollision || attempts === retries) {
                throw error;
            }

            attempts += 1;
        }
    }

    throw new ApiError(500, "Could not create post at this time");
};

export const toPublicPost = (post) => {
    if (!post) {
        return post;
    }

    const { _id, shortId, ...rest } = post;

    return {
        ...rest,
        postId: shortId,
    };
};

export const toPublicComment = (comment, postShortId) => {
    if (!comment) {
        return comment;
    }

    const { post, ...rest } = comment;

    return {
        ...rest,
        postId: postShortId,
    };
};

export const toPublicDeletedPost = (post) => {
    const base = toPublicPost(post);
    const deletedAt = post.deletedAt ? new Date(post.deletedAt) : null;
    const restoreUntil = deletedAt ? new Date(deletedAt.getTime() + RETENTION_MS) : null;

    return {
        ...base,
        deletedAt,
        restoreUntil,
    };
};

export const getLikedPostIdsSet = async (posts, userId) => {
    if (!userId || posts.length === 0) {
        return new Set();
    }

    const postIds = posts.map((post) => post._id);
    const likes = await PostLike.find({
        user: userId,
        post: { $in: postIds },
    })
        .select("post -_id")
        .lean();

    return new Set(likes.map((like) => like.post.toString()));
};

export const toPublicPostWithLikeState = (post, likedPostIdsSet, userId) => {
    const base = toPublicPost(post);

    if (!userId) {
        return {
            ...base,
            likedByMe: false,
        };
    }

    return {
        ...base,
        likedByMe: likedPostIdsSet.has(post._id.toString()),
    };
};

export { RETENTION_DAYS, RETENTION_MS };
