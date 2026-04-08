import mongoose from "mongoose";

const postLikeSchema = new mongoose.Schema(
    {
        post: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Post",
            required: true,
            index: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
    },
    { timestamps: true }
);

postLikeSchema.index({ post: 1, user: 1 }, { unique: true });
postLikeSchema.index({ post: 1, createdAt: -1 });
postLikeSchema.index({ user: 1, createdAt: -1 });

const PostLike = mongoose.models.PostLike || mongoose.model("PostLike", postLikeSchema);

export default PostLike;
