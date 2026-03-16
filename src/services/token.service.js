import jwt from "jsonwebtoken";

export const verifyAccessToken = (token) => {
    return jwt.verify(token, process.env.ACCESS_SECRET);
};

export const verifyRefreshToken = (token) => {
    return jwt.verify(token, process.env.REFRESH_SECRET);
};

export const getTokenExpiryDate = (token) => {
    const decoded = jwt.decode(token);
    if (!decoded?.exp) {
        return null;
    }

    return new Date(decoded.exp * 1000);
};

export const issueSessionManagementToken = (userId) => {
    const secret = process.env.SESSION_MANAGEMENT_SECRET || process.env.ACCESS_SECRET;
    const expiresIn = process.env.SESSION_MANAGEMENT_EXPIRY || "10m";

    return jwt.sign(
        {
            id: userId,
            purpose: "session-management",
        },
        secret,
        { expiresIn }
    );
};

export const verifySessionManagementToken = (token) => {
    const secret = process.env.SESSION_MANAGEMENT_SECRET || process.env.ACCESS_SECRET;
    return jwt.verify(token, secret);
};
