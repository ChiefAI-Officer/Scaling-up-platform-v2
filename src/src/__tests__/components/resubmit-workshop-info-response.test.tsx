import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResubmitWorkshop } from "@/components/workshops/resubmit-workshop";

// CHG-01 regression: the info_requested variant must POST to coach-response with
// BOTH `action: "INFO_RESPONSE"` and `response: "..."`. Before this fix the body
// was `{ response: "..." }` only and the route handler rejected it because the
// route requires `action`.

describe("ResubmitWorkshop info_requested — POST body includes action", () => {
    beforeEach(() => {
        global.fetch = jest.fn((url: string) => {
            // Categories + pricing-tiers fetched on mount
            if (typeof url === "string" && (url.includes("/api/categories") || url.includes("/api/pricing-tiers"))) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([]),
                } as unknown as Response);
            }

            // PATCH workshop
            if (typeof url === "string" && url.includes("/api/workshops/")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true }),
                } as unknown as Response);
            }

            // POST coach-response
            if (typeof url === "string" && url.includes("/coach-response")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true }),
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

    test("submitting the info_requested variant calls coach-response with both action and response in the body", async () => {
        render(
            <ResubmitWorkshop
                variant="info_requested"
                workshopId="ws-1"
                approvalId="ap-1"
                adminMessage="Please clarify the venue"
                title="Workshop A"
                description="Desc"
                eventDate="2026-12-01T00:00:00.000Z"
                eventTime="9:00 AM"
                timezone="America/New_York"
                venueName="Hall"
                venueAddress="123 Main"
                virtualLink={null}
                categoryId={null}
                format="IN_PERSON"
                priceCents={20000}
                isFree={false}
                pricingTierId={null}
            />
        );

        const button = screen.getByRole("button", { name: /submit updated workshop/i });
        fireEvent.click(button);

        await waitFor(() => {
            const calls = (global.fetch as jest.Mock).mock.calls as Array<[string, RequestInit | undefined]>;
            const coachResponseCall = calls.find(([url]) => typeof url === "string" && url.includes("/coach-response"));
            expect(coachResponseCall).toBeDefined();

            const body = JSON.parse((coachResponseCall![1]!.body as string) ?? "{}");
            expect(body.action).toBe("INFO_RESPONSE");
            expect(typeof body.response).toBe("string");
            expect(body.response.length).toBeGreaterThan(0);
        });
    });
});
