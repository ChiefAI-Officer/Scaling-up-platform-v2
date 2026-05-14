/**
 * Round 16 — Wave 1: affiliate cookie-setter script mount.
 *
 * Server component. Mounted in `app/(public)/layout.tsx` so it fires on
 * every public-route-group page — login, register, workshop/[slug], the
 * short-URL `/w/[slug]` redirect target, `/registration/success`, and the
 * password-reset / accept-invite / unauthorized siblings.
 *
 * Renders one `<Script>` per active tracker whose cookie descriptor is an
 * `externalScript`. Defensive: descriptor types `image` and `inlineScriptGroup`
 * are commission-only — if a future adapter returns one of those from
 * `getCookieScriptDescriptor()` it is silently skipped here (forward-prep).
 *
 * Strategy is `afterInteractive` — cookie-setters set a first-party cookie;
 * a sub-second delay is acceptable. `beforeInteractive` is not reliable from
 * nested layouts.
 *
 * The cookie script ALSO fires for authenticated visitors in Wave 1
 * (admins viewing public pages, coaches previewing their own workshop URLs).
 * Harmless first-party storage but the provider may register a "click"
 * against the authenticated session. If self-referral data surfaces in the
 * affiliate dashboard, add `if (session?.user) return null` in Wave 2.
 */

import Script from "next/script";

import { getActiveTrackers } from "@/lib/affiliate/registry";

export function AffiliateCookieScript() {
    const trackers = getActiveTrackers();
    return (
        <>
            {trackers.map((t) => {
                const d = t.getCookieScriptDescriptor();
                if (!d) return null;
                if (d.type !== "externalScript") return null;
                return (
                    <Script
                        key={`affiliate-${t.id}-cookie`}
                        src={d.src}
                        strategy="afterInteractive"
                    />
                );
            })}
        </>
    );
}
