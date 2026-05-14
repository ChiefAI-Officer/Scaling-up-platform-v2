/**
 * Round 16 — Wave 1: iDev affiliate tracker adapter.
 *
 * Cookie-only in Wave 1 — commission descriptor stub returns null and is
 * guard-tested here so a future accidental Wave-2 leakage onto this wave
 * surfaces immediately.
 */

import { createIdevTracker } from "@/lib/affiliate/idev-tracker";

describe("createIdevTracker — cookie descriptor", () => {
    it("returns an externalScript descriptor when cookieScriptUrl is configured", () => {
        const tracker = createIdevTracker({
            mode: "primary",
            cookieScriptUrl: "https://scalingup.idevaffiliate.com/affiliate.js",
        });
        const descriptor = tracker.getCookieScriptDescriptor();
        expect(descriptor).toEqual({
            type: "externalScript",
            src: "https://scalingup.idevaffiliate.com/affiliate.js",
        });
    });

    it("returns null when cookieScriptUrl is undefined", () => {
        const tracker = createIdevTracker({
            mode: "primary",
            cookieScriptUrl: undefined,
        });
        expect(tracker.getCookieScriptDescriptor()).toBeNull();
    });

    it("returns null when cookieScriptUrl is an empty string (deploy footgun guard)", () => {
        const tracker = createIdevTracker({
            mode: "primary",
            cookieScriptUrl: "",
        });
        expect(tracker.getCookieScriptDescriptor()).toBeNull();
    });
});

describe("createIdevTracker — commission descriptor (Wave 1 stub)", () => {
    it("returns null in Wave 1 — guard against accidental Wave 2 leakage", () => {
        const tracker = createIdevTracker({
            mode: "primary",
            cookieScriptUrl: "https://scalingup.idevaffiliate.com/affiliate.js",
        });
        expect(tracker.getCommissionScriptDescriptor()).toBeNull();
    });
});
