import mongoose from "mongoose";
import { randomBytes } from "crypto";

const SHORT_ID_LENGTH = 12;
const SHORT_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789";

const generateShortId = () => {
    const bytes = randomBytes(SHORT_ID_LENGTH);
    let shortId = "";

    for (let i = 0; i < SHORT_ID_LENGTH; i += 1) {
        shortId += SHORT_ID_ALPHABET[bytes[i] % SHORT_ID_ALPHABET.length];
    }

    return shortId;
};

const mediaSchema = new mongoose.Schema(
    {
        url: {
            type: String,
            required: true,
            trim: true,
        },
        publicId: {
            type: String,
            default: null,
            trim: true,
        },
        type: {
            type: String,
            enum: ["image", "video", "gif"],
            default: "image",
        },
        width: {
            type: Number,
            default: null,
        },
        height: {
            type: Number,
            default: null,
        },
        duration: {
            type: Number,
            default: null,
        },
        alt: {
            type: String,
            default: null,
            trim: true,
            maxlength: 200,
        },
    },
    { _id: false }
);

const postSchema = new mongoose.Schema(
    {
        shortId: {
            type: String,
            unique: true,
            index: true,
            immutable: true,
            minlength: SHORT_ID_LENGTH,
            maxlength: SHORT_ID_LENGTH,
            default: generateShortId,
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        content: {
            text: {
                type: String,
                required: true,
                trim: true,
                maxlength: 5000,
            },
        },
        media: {
            type: [mediaSchema],
            default: [],
        },
        tags: {
            type: [String],
            default: [],
        },
        visibility: {
            type: String,
            enum: ["public", "followers", "private"],
            default: "public",
            index: true,
        },
        status: {
            type: String,
            enum: ["draft", "published", "archived"],
            default: "published",
            index: true,
        },
        allowComments: {
            type: Boolean,
            default: true,
        },
        engagementMetrics: {
            likesCount: {
                type: Number,
                default: 0,
                min: 0,
            },
            commentsCount: {
                type: Number,
                default: 0,
                min: 0,
            },
            sharesCount: {
                type: Number,
                default: 0,
                min: 0,
            },
        },
        publishedAt: {
            type: Date,
            default: Date.now,
        },
        lastEditedAt: {
            type: Date,
            default: null,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ visibility: 1, status: 1, createdAt: -1 });
postSchema.index({ tags: 1, createdAt: -1 });

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);

export default Post;