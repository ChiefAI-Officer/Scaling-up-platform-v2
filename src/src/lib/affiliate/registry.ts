/**
 * Round 16 — Wave 1: affiliate tracker registry.
 *
 * `process.env` reads happen per-call (server-component render time). DO NOT
 * add module-level caching here — it would defeat the "redeploy to change env"
 * model the rest of the system relies on. Vercel redeploys reload the bundle,
 * so per-call reads carry no measurable cost at scale.
 *
 * `parseMode` is CASE-STRICT: env vars must be lowercase ("primary" / "shadow"
 * / "off"). Anything else falls back to "off" — typos disable the tracker
 * rather than fire it in a half-configured state.
 */

import type { AffiliateTracker, TrackerMode } from "./affiliate-types";
import { createIdevTracker } from "./idev-tracker";

export function parseMode(value: string | undefined): TrackerMode {
    if (value === "primary" || value === "shadow") return value;
    return "off";
}

export function getActiveTrackers(): AffiliateTracker[] {
    const trackers: AffiliateTracker[] = [];

    const idevMode = parseMode(process.env.AFFILIATE_TRACKER_IDEV_MODE);
    if (idevMode !== "off") {
        trackers.push(
            createIdevTracker({
                mode: idevMode,
                cookieScriptUrl: process.env.AFFILIATE_TRACKER_IDEV_COOKIE_URL,
            })
        );
    }

    // Wave 3: PAP block added here.

    return trackers;
}
