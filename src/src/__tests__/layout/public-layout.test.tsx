/**
 * Round 16 — Wave 1: regression guard that the `(public)/` route group
 * layout mounts <AffiliateCookieScript />. Future cleanup that removes the
 * import (e.g. file-reformat-on-save tooling that prunes "unused" tags)
 * should fail this test instead of silently disabling affiliate tracking.
 */

import React from "react";
import { render, screen } from "@testing-library/react";

// Mock AffiliateCookieScript so the test asserts the layout *renders* it,
// without needing the registry / next/script chain to run.
jest.mock("@/components/affiliate/affiliate-cookie-script", () => ({
    AffiliateCookieScript: () => (
        <div data-testid="affiliate-cookie-script-mounted" />
    ),
}));

import PublicLayout from "@/app/(public)/layout";

describe("(public)/layout.tsx", () => {
    it("mounts <AffiliateCookieScript /> alongside children", () => {
        render(
            <PublicLayout>
                <div data-testid="layout-child">child</div>
            </PublicLayout>
        );

        // Child still renders.
        expect(screen.getByTestId("layout-child")).toBeInTheDocument();
        // AffiliateCookieScript is mounted by the layout.
        expect(
            screen.getByTestId("affiliate-cookie-script-mounted")
        ).toBeInTheDocument();
    });
});
