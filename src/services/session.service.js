import { randomUUID } from "crypto";
import { hashToken } from "../utils/helper.js";
import { getTokenExpiryDate } from "./token.service.js";

const parsedMaxSessions = Number.parseInt(process.env.MAX_ACTIVE_SESSIONS || "3", 10);

export const MAX_ACTIVE_SESSIONS = Number.isFinite(parsedMaxSessions) && parsedMaxSessions > 0
    ? parsedMaxSessions
    : 3;

const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
const parsedRetentionDays = Number.parseInt(process.env.SESSION_REVOKED_RETENTION_DAYS || "7", 10);
const SESSION_REVOKED_RETENTION_DAYS = Number.isFinite(parsedRetentionDays) && parsedRetentionDays >= 0
    ? parsedRetentionDays
    : 7;
const SESSION_REVOKED_RETENTION_MS = SESSION_REVOKED_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const refreshCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(process.env.NODE_ENV === 'production' && { domain: '.social-pulse.aparagarwal.tech' }),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
};

export const accessCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(process.env.NODE_ENV === 'production' && { domain: '.social-pulse.aparagarwal.tech' }),
    maxAge: ACCESS_COOKIE_MAX_AGE_MS,
};

export const refreshCookieClearOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(process.env.NODE_ENV === 'production' && { domain: '.social-pulse.aparagarwal.tech' }),
};

export const accessCookieClearOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(process.env.NODE_ENV === 'production' && { domain: '.social-pulse.aparagarwal.tech' }),
};

const getRefreshExpiryMs = (session) => {
    const explicitExpiryMs = new Date(session.refreshExpiresAt || 0).getTime();
    if (Number.isFinite(explicitExpiryMs) && explicitExpiryMs > 0) {
        return explicitExpiryMs;
    }

    const createdAtMs = new Date(session.createdAt || 0).getTime();
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) {
        return null;
    }

    return createdAtMs + REFRESH_COOKIE_MAX_AGE_MS;
};

export const getActiveSessions = (user) => {
    return (user.sessions || []).filter((session) => {
        if (session.revokedAt) return false;

        const refreshExpiresAtMs = getRefreshExpiryMs(session);
        if (!Number.isFinite(refreshExpiresAtMs) || refreshExpiresAtMs === null) {
            return true;
        }

        return refreshExpiresAtMs > Date.now();
    });
};

export const sanitizeSession = (session, currentSessionId = null) => {
    return {
        sessionId: session.sessionId,
        deviceType: session.deviceType,
        os: session.os,
        browser: session.browser,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        isCurrent: currentSessionId ? session.sessionId === currentSessionId : false,
    };
};

export const serializeActiveSessions = (user, currentSessionId = null) => {
    return getActiveSessions(user)
        .sort((firstSession, secondSession) => new Date(secondSession.lastUsedAt || secondSession.createdAt) - new Date(firstSession.lastUsedAt || firstSession.createdAt))
        .map((session) => sanitizeSession(session, currentSessionId));
};

export const createSessionForUser = (user, deviceDetails) => {
    const sessionId = randomUUID();
    const refreshToken = user.generateRefreshToken(sessionId);
    const refreshExpiresAt = getTokenExpiryDate(refreshToken);

    user.sessions.push({
        sessionId,
        refreshTokenHash: hashToken(refreshToken),
        refreshExpiresAt,
        ...deviceDetails,
        lastUsedAt: new Date(),
    });

    const accessToken = user.generateAccessToken(sessionId);
    return { sessionId, refreshToken, accessToken };
};

export const findActiveSessionById = (user, sessionId) => {
    return getActiveSessions(user).find((session) => session.sessionId === sessionId);
};

export const findActiveSessionByRefreshHash = (user, sessionId, refreshTokenHash) => {
    return getActiveSessions(user).find(
        (session) =>
            session.sessionId === sessionId &&
            session.refreshTokenHash === refreshTokenHash
    );
};

export const updateSessionRefreshToken = (session, newRefreshToken) => {
    session.refreshTokenHash = hashToken(newRefreshToken);
    session.refreshExpiresAt = getTokenExpiryDate(newRefreshToken);
    session.lastUsedAt = new Date();
};

export const revokeSessionById = (user, sessionId) => {
    const session = findActiveSessionById(user, sessionId);
    if (!session) {
        return false;
    }

    session.revokedAt = new Date();
    return true;
};

export const touchSessionLastUsed = (user, sessionId, minWindowMs = 0) => {
    const session = findActiveSessionById(user, sessionId);
    if (!session) {
        return false;
    }

    const now = Date.now();
    const lastUsedMs = new Date(session.lastUsedAt || session.createdAt || 0).getTime();
    if (now - lastUsedMs < minWindowMs) {
        return false;
    }

    session.lastUsedAt = new Date(now);
    return true;
};

export const pruneStaleSessions = (user, now = new Date()) => {
    const nowMs = new Date(now).getTime();
    if (!user?.sessions?.length) {
        return { changed: false, revokedCount: 0, removedCount: 0 };
    }

    let changed = false;
    let revokedCount = 0;

    for (const session of user.sessions) {
        if (session.revokedAt) {
            continue;
        }

        const refreshExpiresAtMs = getRefreshExpiryMs(session);
        const isRefreshExpired = Number.isFinite(refreshExpiresAtMs) && refreshExpiresAtMs !== null && refreshExpiresAtMs <= nowMs;
        if (isRefreshExpired) {
            session.revokedAt = new Date(nowMs);
            changed = true;
            revokedCount += 1;
        }
    }

    const initialCount = user.sessions.length;
    user.sessions = user.sessions.filter((session) => {
        if (!session.revokedAt) {
            return true;
        }

        if (SESSION_REVOKED_RETENTION_MS <= 0) {
            return false;
        }

        const revokedAtMs = new Date(session.revokedAt).getTime();
        return Number.isFinite(revokedAtMs) && (nowMs - revokedAtMs) < SESSION_REVOKED_RETENTION_MS;
    });

    const removedCount = initialCount - user.sessions.length;
    if (removedCount > 0) {
        changed = true;
    }

    return { changed, revokedCount, removedCount };
};
