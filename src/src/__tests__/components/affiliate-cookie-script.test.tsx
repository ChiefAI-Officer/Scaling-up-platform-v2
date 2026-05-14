/**
 * Round 16 — Wave 1: cookie-script component tests.
 *
 * Mocks the registry so we don't depend on `process.env` mutations here.
 * Mocks `next/script` so we can inspect the rendered tag/props without
 * needing a real Next runtime.
 */

import React from "react";
import { render } from "@testing-library/react";

import type { AffiliateTracker, ScriptDescriptor } from "@/lib/affiliate/affiliate-types";

// Mock next/script — renders a <div> stand-in we can query in jsdom.
// Using a real <script> tag would trip the Next.js no-sync-scripts ESLint rule
// in the test file (since the test runs in jsdom, not Next's runtime).
jest.mock("next/script", () => ({
    __esModule: true,
    default: function MockScript(props: {
        src?: string;
        strategy?: string;
        id?: string;
    }) {
        return (
            <div
                data-testid="next-script"
                data-strategy={props.strategy}
                data-src={props.src}
            />
        );
    },
}));

// Mock the registry so each test controls what trackers come back.
jest.mock("@/lib/affiliate/registry", () => ({
    getActiveTrackers: jest.fn(),
}));

import { AffiliateCookieScript } from "@/components/affiliate/affiliate-cookie-script";
import { getActiveTrackers } from "@/lib/affiliate/registry";

const mockedGetActiveTrackers = getActiveTrackers as jest.MockedFunction<
    typeof getActiveTrackers
>;

function makeTracker(opts: {
    id: "idev" | "pap";
    cookieDescriptor: ScriptDescriptor | null;
}): AffiliateTracker {
    return {
        id: opts.id,
        mode: "primary",
        getCookieScriptDescriptor: () => opts.cookieDescriptor,
        getCommissionScriptDescriptor: () => null,
    };
}

describe("<AffiliateCookieScript />", () => {
    beforeEach(() => {
        mockedGetActiveTrackers.mockReset();
    });

    it("renders nothing when no trackers are active", () => {
        mockedGetActiveTrackers.mockReturnValue([]);
        const { container } = render(<AffiliateCookieScript />);
        expect(container.querySelectorAll("[data-testid=next-script]")).toHaveLength(0);
    });

    it("renders one next/script with correct src + afterInteractive strategy when iDev cookie URL is set", () => {
        mockedGetActiveTrackers.mockReturnValue([
            makeTracker({
                id: "idev",
                cookieDescriptor: {
                    type: "externalScript",
                    src: "https://scalingup.idevaffiliate.com/affiliate.js",
                },
            }),
        ]);

        const { container } = render(<AffiliateCookieScript />);
        const scripts = container.querySelectorAll("[data-testid=next-script]");
        expect(scripts).toHaveLength(1);
        expect(scripts[0].getAttribute("data-src")).toBe(
            "https://scalingup.idevaffiliate.com/affiliate.js"
        );
        expect(scripts[0].getAttribute("data-strategy")).toBe("afterInteractive");
    });

    it("skips non-externalScript descriptor types (image / inlineScriptGroup defensive guard)", () => {
        mockedGetActiveTrackers.mockReturnValue([
            makeTracker({
                id: "idev",
                cookieDescriptor: {
                    type: "image",
                    src: "https://scalingup.idevaffiliate.com/sale.php",
                },
            }),
            makeTracker({
                id: "pap",
                cookieDescriptor: {
                    type: "inlineScriptGroup",
                    steps: [
                        { kind: "external", src: "https://x.postaffiliatepro.com/pap.js" },
                        { kind: "inline", body: "PostAffTracker.track();" },
                    ],
                },
            }),
        ]);

        const { container } = render(<AffiliateCookieScript />);
        expect(container.querySelectorAll("[data-testid=next-script]")).toHaveLength(0);
    });
});
