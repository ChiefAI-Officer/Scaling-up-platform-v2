/**
 * Assessment "setup-first" flip — CampaignWizard pick-existing tests.
 *
 * Slice 1 flips the wizard from inline-create to pick-existing:
 *  (a) Step 0 (Organization) with zero orgs shows a CTA linking to
 *      /portal/members and NO inline-create form.
 *  (b) Step 0 picks an EXISTING org only — no "+ New organization" button.
 *  (c) Step 2 (Participants) picks existing members (grouped by team) — no
 *      inline single-respondent form and no bulk-CSV panel.
 *  (d) saveCampaign() POSTs the selected participants and does NOT send a
 *      `bulkRespondents` array in the create body.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignWizard } from "@/components/assessments/CampaignWizard";

// next/navigation is globally mocked in jest.setup.js.
// useToast carries internal state; stub it to a no-op.
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = { id: "org-1", name: "Acme Corp", externalId: null };
const TEMPLATE = {
  id: "tpl-1",
  name: "Rockefeller Habits",
  alias: "rockefeller",
  description: null,
  aggregationMode: "FULL_VISIBILITY" as const,
};
const TEAM_ENG = {
  id: "team-eng",
  organizationId: "org-1",
  parentTeamId: null,
  name: "Engineering",
  type: null,
  description: null,
  children: [],
};
const ALICE = {
  id: "resp-1",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@acme.com",
  jobTitle: "CEO",
  teamId: "team-eng",
  organizationId: "org-1",
};
const BOB = {
  id: "resp-2",
  firstName: "Bob",
  lastName: "Jones",
  email: "bob@acme.com",
  jobTitle: null,
  teamId: null,
  organizationId: "org-1",
};

// ---------------------------------------------------------------------------
// fetch routing helper — match by URL + method so step order doesn't matter.
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

let fetchCalls: FetchCall[];

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => payload,
  } as unknown as Response;
}

function installFetch({ orgs }: { orgs: typeof ORG[] }) {
  fetchCalls = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = undefined;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    fetchCalls.push({ url, method, body });

    // Draft endpoint — no resumable draft.
    if (url.includes("/api/assessment-campaign-drafts")) {
      if (method === "GET") return jsonResponse({ success: true, data: null });
      return jsonResponse({ success: true });
    }
    // Organizations list.
    if (url.endsWith("/api/organizations") && method === "GET") {
      return jsonResponse({ success: true, data: orgs });
    }
    // Single organization (Review step).
    if (url.match(/\/api\/organizations\/org-1$/) && method === "GET") {
      return jsonResponse({ success: true, data: ORG });
    }
    // Templates list.
    if (url.endsWith("/api/assessment-templates") && method === "GET") {
      return jsonResponse({ success: true, data: [TEMPLATE] });
    }
    // Teams tree for the org.
    if (url.includes("/api/organizations/org-1/teams") && method === "GET") {
      return jsonResponse({ success: true, data: [TEAM_ENG] });
    }
    // Respondents for the org.
    if (
      url.includes("/api/organizations/org-1/respondents") &&
      method === "GET"
    ) {
      return jsonResponse({ success: true, data: [ALICE, BOB] });
    }
    // Campaign create.
    if (url.endsWith("/api/assessment-campaigns") && method === "POST") {
      return jsonResponse({
        success: true,
        data: { id: "camp-1" },
      });
    }
    // Participants add.
    if (url.includes("/api/assessment-campaigns/camp-1/participants")) {
      return jsonResponse({ success: true, data: { added: 1 } });
    }
    // Activate.
    if (url.includes("/api/assessment-campaigns/camp-1/activate")) {
      return jsonResponse({ success: true, data: { status: "ACTIVE" } });
    }
    return jsonResponse({ success: false, error: "unhandled" }, false);
  }) as unknown as typeof fetch;
}

function findCall(predicate: (c: FetchCall) => boolean): FetchCall | undefined {
  return fetchCalls.find(predicate);
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Step 0 — Organization
// ---------------------------------------------------------------------------

describe("CampaignWizard — Step 0 (Organization)", () => {
  it("zero orgs shows a setup CTA linking to /portal/members and NO inline-create", async () => {
    installFetch({ orgs: [] });
    render(<CampaignWizard />);

    // Wait for the org fetch to settle.
    await waitFor(() =>
      expect(
        findCall((c) => c.url.endsWith("/api/organizations") && c.method === "GET"),
      ).toBeTruthy(),
    );

    // CTA link to the Members lane.
    const cta = await screen.findByRole("link", { name: /set up a company/i });
    expect(cta).toHaveAttribute("href", "/portal/members");

    // No inline-create affordances.
    expect(
      screen.queryByRole("button", { name: /new organization/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^create one$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/organization name/i),
    ).not.toBeInTheDocument();
  });

  it("with orgs present, picks an existing org and shows NO create button", async () => {
    installFetch({ orgs: [ORG] });
    render(<CampaignWizard />);

    const radio = await screen.findByRole("radio", { name: /acme corp/i });
    expect(radio).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /new organization/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Full flow — saveCampaign posts participants WITHOUT bulkRespondents
// ---------------------------------------------------------------------------

describe("CampaignWizard — pick-existing flow", () => {
  async function advanceToParticipants() {
    // Step 0 — pick org.
    const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
    fireEvent.click(orgRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 1 — pick template.
    const tplRadio = await screen.findByRole("radio", {
      name: /rockefeller habits/i,
    });
    fireEvent.click(tplRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
  }

  it("Step 2 picks existing members (no inline-create, no bulk CSV)", async () => {
    installFetch({ orgs: [ORG] });
    render(<CampaignWizard />);
    await advanceToParticipants();

    // Members list rendered from the respondents endpoint.
    await screen.findByText("Alice Smith");
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();

    // Inline-create + bulk-CSV affordances are gone.
    expect(
      screen.queryByRole("button", { name: /new respondent/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("wizard-toggle-bulk-csv"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("wizard-bulk-csv-panel"),
    ).not.toBeInTheDocument();
  });

  it("saveCampaign posts participants and does NOT send a bulkRespondents array", async () => {
    installFetch({ orgs: [ORG] });
    render(<CampaignWizard />);
    await advanceToParticipants();

    // Select Alice as participant + CEO.
    const aliceCheckbox = await screen.findByRole("checkbox", {
      name: /alice smith/i,
    });
    fireEvent.click(aliceCheckbox);
    const aliceCeo = screen.getByRole("radio", {
      name: /mark alice smith as ceo/i,
    });
    fireEvent.click(aliceCeo);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 3 — schedule (name + default open-ended).
    const nameInput = await screen.findByLabelText(/campaign name/i);
    fireEvent.change(nameInput, { target: { value: "Q3 Assessment" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 4 — review → Save as Draft.
    const saveBtn = await screen.findByRole("button", {
      name: /save as draft/i,
    });
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(
        findCall(
          (c) =>
            c.url.endsWith("/api/assessment-campaigns") && c.method === "POST",
        ),
      ).toBeTruthy(),
    );

    const createCall = findCall(
      (c) => c.url.endsWith("/api/assessment-campaigns") && c.method === "POST",
    )!;
    const createBody = createCall.body as Record<string, unknown>;
    // The flip: no bulkRespondents key in the create payload.
    expect(createBody).not.toHaveProperty("bulkRespondents");
    expect(createBody.organizationId).toBe("org-1");
    expect(createBody.templateId).toBe("tpl-1");
    expect(createBody.name).toBe("Q3 Assessment");

    // Participants posted with the selected respondent + CEO.
    await waitFor(() =>
      expect(
        findCall((c) =>
          c.url.includes("/api/assessment-campaigns/camp-1/participants"),
        ),
      ).toBeTruthy(),
    );
    const partCall = findCall((c) =>
      c.url.includes("/api/assessment-campaigns/camp-1/participants"),
    )!;
    const partBody = partCall.body as Record<string, unknown>;
    expect(partBody.respondentIds).toEqual(["resp-1"]);
    expect(partBody.ceoRespondentId).toBe("resp-1");
  });
});
