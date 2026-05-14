/**
 * Round 16 — Wave 1: iDev affiliate tracker adapter.
 *
 * Cookie-only in Wave 1. Commission descriptor is a stub that returns null
 * and is guard-tested in `__tests__/affiliate/idev-tracker.test.ts` so an
 * accidental Wave-2 implementation leaking onto Wave 1 surfaces immediately.
 *
 * The cookie URL comes from `AFFILIATE_TRACKER_IDEV_COOKIE_URL` in Vercel.
 * Empty-string (set but empty — common deploy footgun) is treated identically
 * to unset: descriptor returns null. The registry never instantiates the
 * adapter when the mode env var is "off"; an adapter constructed with mode
 * "off" is undefined behavior and not exercised in production.
 */

import type {
    AffiliateTracker,
    ScriptDescriptor,
    TrackerMode,
} from "./affiliate-types";

export interface IdevConfig {
    mode: TrackerMode;
    cookieScriptUrl?: string;
}

export function createIdevTracker(config: IdevConfig): AffiliateTracker {
    return {
        id: "idev",
        mode: config.mode,
        getCookieScriptDescriptor(): ScriptDescriptor | null {
            if (!config.cookieScriptUrl) return null;
            return { type: "externalScript", src: config.cookieScriptUrl };
        },
        getCommissionScriptDescriptor(): ScriptDescriptor | null {
            // Wave 2 wires this up. Wave 1 returns null.
            return null;
        },
    };
}
