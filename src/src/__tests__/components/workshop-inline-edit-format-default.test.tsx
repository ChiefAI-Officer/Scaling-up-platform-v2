/**
 * BUG-MAY12-X (Jeff May 12): WorkshopInlineEditForm fallback default for
 * `format` must be VIRTUAL when the prop is empty/missing — matching the
 * platform-wide default fixed in Wave 12-A for the wizard.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkshopInlineEditForm } from "@/components/workshops/WorkshopInlineEditForm";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

describe("WorkshopInlineEditForm format fallback default", () => {
    it("defaults the format select to VIRTUAL when the format prop is empty", () => {
        render(
            <WorkshopInlineEditForm
                workshopId="ws-1"
                title="Workshop A"
                description="Desc"
                categoryId={null}
                format=""
                pricingTier={null}
                eventDate="2026-12-01T00:00:00.000Z"
                eventTime="9:00 AM"
                timezone="America/New_York"
                virtualLink={null}
                venueName={null}
                venueAddress={null}
                categories={[]}
            />
        );

        // Form is collapsed by default — click "Edit Details" to reveal it.
        fireEvent.click(screen.getByRole("button", { name: /edit details/i }));

        const select = document.getElementById("ie-format") as HTMLSelectElement | null;
        expect(select).not.toBeNull();
        expect(select!.value).toBe("VIRTUAL");
    });
});
