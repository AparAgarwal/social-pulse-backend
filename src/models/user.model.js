import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const sessionSchema = new mongoose.Schema(
    {
        sessionId: { type: String, required: true },
        refreshTokenHash: { type: String, required: true },
        deviceType: { type: String, default: "unknown" },
        os: { type: String, default: "Unknown" },
        browser: { type: String, default: "Unknown" },
        userAgent: { type: String, default: "Unknown" },
        ipAddress: { type: String, default: null },
        refreshExpiresAt: { type: Date, default: null },
        lastUsedAt: { type: Date, default: Date.now },
        revokedAt: { type: Date, default: null },
    },
    { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const userSchema = new mongoose.Schema({
    fullname: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    bio: {
        type: String,
        default: null
    },
    avatarUrl: {
        type: String,
        default: null
    },
    avatarPublicId: {
        type: String,
        default: null
    },
    bannerUrl: {
        type: String,
        default: null
    },
    bannerPublicId: {
        type: String,
        default: null
    },
    sessions: {
        type: [sessionSchema],
        default: []
    }
}, { timestamps: true });

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.isPasswordCorrect = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAccessToken = function (sessionId) {
    return jwt.sign(
        {
            id: this._id,
            email: this.email,
            sessionId
        },
        process.env.ACCESS_SECRET,
        { expiresIn: process.env.ACCESS_EXPIRY || '15m' }
    );
};

userSchema.methods.generateRefreshToken = function (sessionId) {
    return jwt.sign(
        {
            id: this._id,
            email: this.email,
            sessionId,
        },
        process.env.REFRESH_SECRET,
        { expiresIn: process.env.REFRESH_EXPIRY || '7d' }
    );
};

userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.sessions;
    return obj;
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;