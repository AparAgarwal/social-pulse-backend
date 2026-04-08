import Comment from "../models/comment.model.js";
import Post from "../models/post.model.js";
import PostLike from "../models/postLike.model.js";

const readPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
        return fallback;
    }

    return parsed;
};

const RETENTION_DAYS = readPositiveInt(process.env.POST_TRASH_RETENTION_DAYS, 30);
const CLEANUP_INTERVAL_MINUTES = readPositiveInt(process.env.POST_TRASH_CLEANUP_INTERVAL_MINUTES, 60);
const CLEANUP_BATCH_SIZE = readPositiveInt(process.env.POST_TRASH_CLEANUP_BATCH_SIZE, 200);

const getRetentionCutoff = () => {
    const now = Date.now();
    const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return new Date(now - retentionMs);
};

export const hardDeleteExpiredPosts = async () => {
    const cutoff = getRetentionCutoff();

    const expiredPosts = await Post.find(
        {
            isDeleted: true,
            deletedAt: { $ne: null, $lte: cutoff },
        },
        { _id: 1 }
    )
        .sort({ deletedAt: 1 })
        .limit(CLEANUP_BATCH_SIZE)
        .lean();

    if (expiredPosts.length === 0) {
        return { deletedPosts: 0, deletedLikes: 0, deletedComments: 0 };
    }

    const postIds = expiredPosts.map((post) => post._id);

    const [likesResult, commentsResult, postsResult] = await Promise.all([
        PostLike.deleteMany({ post: { $in: postIds } }),
        Comment.deleteMany({ post: { $in: postIds } }),
        Post.deleteMany({ _id: { $in: postIds }, isDeleted: true, deletedAt: { $ne: null, $lte: cutoff } }),
    ]);

    return {
        deletedPosts: postsResult.deletedCount || 0,
        deletedLikes: likesResult.deletedCount || 0,
        deletedComments: commentsResult.deletedCount || 0,
    };
};

export const startPostCleanupScheduler = () => {
    const intervalMs = CLEANUP_INTERVAL_MINUTES * 60 * 1000;

    const runCleanup = async () => {
        try {
            await hardDeleteExpiredPosts();
        } catch (error) {
            console.error("[post-cleanup] Failed to hard delete expired posts:", error?.message || error);
        }
    };

    runCleanup();

    const timer = setInterval(runCleanup, intervalMs);
    if (typeof timer.unref === "function") {
        timer.unref();
    }

    return timer;
};
