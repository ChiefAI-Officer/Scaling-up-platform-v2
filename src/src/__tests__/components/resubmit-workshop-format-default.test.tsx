/**
 * BUG-MAY12-X (Jeff May 12): when ResubmitWorkshop is rendered without an
 * initialFormat, the fallback default must be VIRTUAL — matching the
 * platform-wide default fixed in Wave 12-A for the wizard.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ResubmitWorkshop } from "@/components/workshops/resubmit-workshop";

beforeEach(() => {
    global.fetch = jest.fn((url: string) => {
        if (typeof url === "string" && (url.includes("/api/categories") || url.includes("/api/pricing-tiers"))) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([]),
            } as unknown as Response);
        }
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
        } as unknown as Response);
    }) as unknown as typeof fetch;
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("ResubmitWorkshop format fallback default", () => {
    it("defaults the format select to VIRTUAL when initialFormat is null", async () => {
        render(
            <ResubmitWorkshop
                variant="info_requested"
                workshopId="ws-1"
                approvalId="ap-1"
                adminMessage="Please clarify"
                title="Workshop A"
                description="Desc"
                eventDate="2026-12-01T00:00:00.000Z"
                eventTime="9:00 AM"
                timezone="America/New_York"
                venueName="Hall"
                venueAddress="123 Main"
                virtualLink={null}
                categoryId={null}
                format={null}
                priceCents={20000}
                isFree={false}
                pricingTierId={null}
            />
        );

        await waitFor(() => {
            const formatLabel = screen.getByText("Format");
            const select = formatLabel.parentElement?.querySelector("select") as HTMLSelectElement | null;
            expect(select).not.toBeNull();
            expect(select!.value).toBe("VIRTUAL");
        });
    });
});
