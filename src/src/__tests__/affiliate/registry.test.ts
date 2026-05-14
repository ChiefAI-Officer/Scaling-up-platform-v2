/**
 * Round 16 — Wave 1: registry tests.
 *
 * Env vars are read per-call (server-component render time) — no module-level
 * memoization. Tests mutate `process.env` directly and restore in afterEach.
 */

import { getActiveTrackers, parseMode } from "@/lib/affiliate/registry";

describe("parseMode (case-strict)", () => {
    it("returns 'primary' for exact lowercase 'primary'", () => {
        expect(parseMode("primary")).toBe("primary");
    });

    it("returns 'shadow' for exact lowercase 'shadow'", () => {
        expect(parseMode("shadow")).toBe("shadow");
    });

    it("returns 'off' for 'off' explicitly", () => {
        expect(parseMode("off")).toBe("off");
    });

    it("returns 'off' for undefined", () => {
        expect(parseMode(undefined)).toBe("off");
    });

    it("returns 'off' for garbage strings", () => {
        expect(parseMode("garbage")).toBe("off");
        expect(parseMode("enabled")).toBe("off");
        expect(parseMode("")).toBe("off");
    });

    it("is case-strict — 'Primary' / 'PRIMARY' / 'Shadow' / 'SHADOW' all parse to 'off'", () => {
        expect(parseMode("Primary")).toBe("off");
        expect(parseMode("PRIMARY")).toBe("off");
        expect(parseMode("Shadow")).toBe("off");
        expect(parseMode("SHADOW")).toBe("off");
    });
});

describe("getActiveTrackers", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        // Restore env (including deletion of keys we set).
        process.env = { ...originalEnv };
    });

    it("returns iDev tracker when AFFILIATE_TRACKER_IDEV_MODE=primary and cookie URL is set", () => {
        process.env.AFFILIATE_TRACKER_IDEV_MODE = "primary";
        process.env.AFFILIATE_TRACKER_IDEV_COOKIE_URL =
            "https://scalingup.idevaffiliate.com/affiliate.js";

        const trackers = getActiveTrackers();
        expect(trackers).toHaveLength(1);
        expect(trackers[0].id).toBe("idev");
        expect(trackers[0].mode).toBe("primary");
        expect(trackers[0].getCookieScriptDescriptor()).toEqual({
            type: "externalScript",
            src: "https://scalingup.idevaffiliate.com/affiliate.js",
        });
    });

    it("returns empty array when AFFILIATE_TRACKER_IDEV_MODE=off", () => {
        process.env.AFFILIATE_TRACKER_IDEV_MODE = "off";
        process.env.AFFILIATE_TRACKER_IDEV_COOKIE_URL =
            "https://scalingup.idevaffiliate.com/affiliate.js";

        expect(getActiveTrackers()).toEqual([]);
    });

    it("returns empty array when AFFILIATE_TRACKER_IDEV_MODE is unset (defaults to off)", () => {
        delete process.env.AFFILIATE_TRACKER_IDEV_MODE;
        delete process.env.AFFILIATE_TRACKER_IDEV_COOKIE_URL;

        expect(getActiveTrackers()).toEqual([]);
    });

    it("returns iDev tracker in shadow mode when AFFILIATE_TRACKER_IDEV_MODE=shadow (forward-prepare Wave 3 multi-tracker registration)", () => {
        process.env.AFFILIATE_TRACKER_IDEV_MODE = "shadow";
        process.env.AFFILIATE_TRACKER_IDEV_COOKIE_URL =
            "https://scalingup.idevaffiliate.com/affiliate.js";

        const trackers = getActiveTrackers();
        expect(trackers).toHaveLength(1);
        expect(trackers[0].id).toBe("idev");
        expect(trackers[0].mode).toBe("shadow");
    });
});
