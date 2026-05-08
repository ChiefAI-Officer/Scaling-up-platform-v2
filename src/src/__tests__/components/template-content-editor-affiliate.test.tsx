/**
 * ENH-MAY6-4: Affiliate / Tracking Code field should only render on
 * THANK_YOU templates. It was previously rendered unconditionally in the
 * visual editor (SOLO_LANDING, REGISTRATION, THANK_YOU) and in the fallback
 * JSON editor (BIO_PAGE, DUO_LANDING) despite only ever firing on THANK_YOU.
 */

import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    useSearchParams: () => ({ get: jest.fn() }),
    usePathname: () => "/",
}));

import { TemplateContentEditor } from "@/components/templates/template-content-editor";

const baseProps = {
    templateId: "tpl-1",
    templateName: "Test Template",
    categoryName: "Test Category",
    isActive: false,
    initialContent: "{}",
    initialCustomCode: null,
};

// Helper: count how many nodes match the affiliate field label text.
// The Card renders it twice (CardTitle + Label), so we use queryAllByText.
function affiliateCount() {
    return screen.queryAllByText(/affiliate \/ tracking code/i).length;
}

describe("TemplateContentEditor — Affiliate / Tracking Code visibility", () => {
    it("THANK_YOU: shows the Affiliate / Tracking Code field", () => {
        render(<TemplateContentEditor {...baseProps} templateType="THANK_YOU" />);
        expect(affiliateCount()).toBeGreaterThan(0);
    });

    it("SOLO_LANDING: does not show the Affiliate / Tracking Code field", () => {
        render(<TemplateContentEditor {...baseProps} templateType="SOLO_LANDING" />);
        expect(affiliateCount()).toBe(0);
    });

    it("REGISTRATION: does not show the Affiliate / Tracking Code field", () => {
        render(<TemplateContentEditor {...baseProps} templateType="REGISTRATION" />);
        expect(affiliateCount()).toBe(0);
    });

    it("BIO_PAGE: does not show the Affiliate / Tracking Code field", () => {
        render(<TemplateContentEditor {...baseProps} templateType="BIO_PAGE" />);
        expect(affiliateCount()).toBe(0);
    });
});
