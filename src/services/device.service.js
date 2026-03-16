import Bowser from "bowser";

const getClientIpAddress = (req) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
        return forwardedFor.split(',')[0].trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
        return forwardedFor[0];
    }

    return req.ip || null;
};

const getDeviceType = (parsedUserAgent) => {
    if (parsedUserAgent.platform?.type) {
        return parsedUserAgent.platform.type;
    }

    const ua = parsedUserAgent.ua || "";
    if (/mobile|android|iphone|ipod/i.test(ua)) {
        return "mobile";
    }
    if (/ipad|tablet/i.test(ua)) {
        return "tablet";
    }

    return "desktop";
};

export const buildSessionDeviceDetails = (req) => {
    const userAgent = req.headers['user-agent'] || "Unknown";
    const parsed = Bowser.parse(userAgent);

    return {
        deviceType: getDeviceType(parsed),
        os: parsed.os?.name || "Unknown",
        browser: parsed.browser?.name || "Unknown",
        userAgent,
        ipAddress: getClientIpAddress(req),
    };
};
