import mongoose from "mongoose";
import Comment from "../models/comment.model.js";
import Post from "../models/post.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getAccessiblePost, parsePagination, toPublicComment } from "../utils/post.helpers.js";

export const addComment = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { postId } = req.params;
    const { content, parentComment } = req.body;
    const post = await getAccessiblePost(postId, userId);

    if (!post.allowComments) {
        throw new ApiError(403, "Comments are disabled for this post");
    }

    let normalizedParent = null;

    if (parentComment) {
        if (!mongoose.Types.ObjectId.isValid(parentComment)) {
            throw new ApiError(400, "Invalid parent comment id");
        }

        const parent = await Comment.findOne({
            _id: parentComment,
            post: post._id,
            isDeleted: false,
        }).select("_id");

        if (!parent) {
            throw new ApiError(404, "Parent comment not found");
        }

        normalizedParent = parent._id;
    }

    const comment = await Comment.create({
        post: post._id,
        author: userId,
        content,
        parentComment: normalizedParent,
    });

    await Post.updateOne(
        { _id: post._id },
        { $inc: { "engagementMetrics.commentsCount": 1 } }
    );

    const populatedComment = await Comment.findById(comment._id)
        .populate({ path: "author", select: "fullname username profile.avatar.url" })
        .lean();

    return res.status(201).json(
        new ApiResponse(201, toPublicComment(populatedComment, post.shortId), "Comment added successfully.")
    );
});

export const listComments = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const post = await getAccessiblePost(postId, req.user?.id);

    const { page, limit, skip } = parsePagination(req.query);

    const baseFilter = {
        post: post._id,
        isDeleted: false,
    };

    if (typeof req.query.parentComment === "string" && req.query.parentComment.length > 0) {
        if (!mongoose.Types.ObjectId.isValid(req.query.parentComment)) {
            throw new ApiError(400, "Invalid parent comment id");
        }
        baseFilter.parentComment = req.query.parentComment;
    } else {
        baseFilter.parentComment = null;
    }

    const [total, comments] = await Promise.all([
        Comment.countDocuments(baseFilter),
        Comment.find(baseFilter)
            .sort({ createdAt: -1 })
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
            comments: comments.map((comment) => toPublicComment(comment, post.shortId)),
        }, "Comments fetched successfully.")
    );
});

export const deleteComment = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { commentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        throw new ApiError(400, "Invalid comment id");
    }

    const comment = await Comment.findById(commentId).select("_id post author isDeleted");

    if (!comment || comment.isDeleted) {
        throw new ApiError(404, "Comment not found");
    }

    if (comment.author.toString() !== userId) {
        throw new ApiError(403, "You can only delete your own comments");
    }

    comment.isDeleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    await Post.updateOne(
        { _id: comment.post },
        [
            {
                $set: {
                    "engagementMetrics.commentsCount": {
                        $max: [
                            { $add: [{ $ifNull: ["$engagementMetrics.commentsCount", 0] }, -1] },
                            0,
                        ],
                    },
                },
            },
        ]
    );

    return res.status(200).json(
        new ApiResponse(200, { commentId, deleted: true }, "Comment deleted successfully.")
    );
});
