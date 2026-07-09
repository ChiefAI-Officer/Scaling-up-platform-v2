/**
 * Wave Z (Z-1) smoke-verify — the Public Campaigns admin page has been ORPHANED
 * (no nav entry) since Task 8; before the sidebar rewire surfaces it we confirm
 * `PublicCampaignsManager` renders its list + create form without crashing,
 * against the three GET endpoints it loads in-mount. No prod contact (fetch mocked).
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { PublicCampaignsManager } from "@/components/admin/PublicCampaignsManager";

const PUBLIC_CAMPAIGN = {
  id: "pc-1",
  name: "Quick Scaling Up Check",
  alias: "scaling-up-quick",
  status: "ACTIVE",
  accessMode: "PUBLIC",
  openAt: "2026-06-01T00:00:00.000Z",
  closeAt: null,
  template: { id: "t1", name: "Scaling Up Quick", alias: "scaling-up-quick" },
  organization: { id: "o1", name: "Acme Corp" },
};

beforeEach(() => {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    const json =
      url.endsWith("/api/assessment-campaigns")
        ? { success: true, data: [PUBLIC_CAMPAIGN] }
        : url.endsWith("/api/admin/assessment-templates")
          ? { success: true, data: [{ id: "t1", name: "Scaling Up Quick", alias: "scaling-up-quick", disabledAt: null }] }
          : url.endsWith("/api/organizations")
            ? { success: true, data: [{ id: "o1", name: "Acme Corp" }] }
            : { success: true, data: [] };
    return { ok: true, status: 200, json: async () => json } as unknown as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

describe("PublicCampaignsManager — orphaned-page render smoke (Z-1)", () => {
  it("renders the list and the create form without crashing", async () => {
    render(<PublicCampaignsManager />);
    // Create form is always present.
    expect(
      await screen.findByText("Create New PUBLIC Campaign"),
    ).toBeInTheDocument();
    // The loaded PUBLIC campaign row shows once the in-mount fetch resolves.
    await waitFor(() =>
      expect(screen.getByText("Quick Scaling Up Check")).toBeInTheDocument(),
    );
    expect(screen.getByText("Existing PUBLIC Campaigns")).toBeInTheDocument();
  });
});
