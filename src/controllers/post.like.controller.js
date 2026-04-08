import Post from "../models/post.model.js";
import PostLike from "../models/postLike.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getAccessiblePost } from "../utils/post.helpers.js";

export const getMyPostLikeStatus = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { postId } = req.params;
    const post = await getAccessiblePost(postId, userId);

    const liked = Boolean(
        await PostLike.exists({
            post: post._id,
            user: userId,
        })
    );

    return res.status(200).json(
        new ApiResponse(200, { postId: post.shortId, liked }, "Like status fetched successfully.")
    );
});

export const likePost = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { postId } = req.params;
    const post = await getAccessiblePost(postId, userId);

    const likeResult = await PostLike.updateOne(
        { post: post._id, user: userId },
        { $setOnInsert: { post: post._id, user: userId } },
        { upsert: true }
    );

    const created = likeResult.upsertedCount > 0;

    if (created) {
        await Post.updateOne(
            { _id: post._id },
            { $inc: { "engagementMetrics.likesCount": 1 } }
        );
    }

    return res.status(created ? 201 : 200).json(
        new ApiResponse(
            created ? 201 : 200,
            { postId: post.shortId, liked: true },
            created ? "Post liked successfully." : "Post already liked."
        )
    );
});

export const unlikePost = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const { postId } = req.params;
    const post = await getAccessiblePost(postId, userId);

    const result = await PostLike.deleteOne({ post: post._id, user: userId });
    const removed = result.deletedCount > 0;

    if (removed) {
        await Post.updateOne(
            { _id: post._id },
            [
                {
                    $set: {
                        "engagementMetrics.likesCount": {
                            $max: [
                                { $add: [{ $ifNull: ["$engagementMetrics.likesCount", 0] }, -1] },
                                0,
                            ],
                        },
                    },
                },
            ]
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { postId: post.shortId, liked: false },
            removed ? "Post unliked successfully." : "Post was not liked before."
        )
    );
});
