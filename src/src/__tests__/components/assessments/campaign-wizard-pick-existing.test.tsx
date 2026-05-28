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

// ---------------------------------------------------------------------------
// Second org for the cross-company regression (C1). ORG_B has its own member
// (Carol) on its own team — none of org-1's ids appear here.
// ---------------------------------------------------------------------------

const ORG_B = { id: "org-2", name: "Globex Inc", externalId: null };
const TEAM_SALES_B = {
  id: "team-sales-b",
  organizationId: "org-2",
  parentTeamId: null,
  name: "Sales",
  type: null,
  description: null,
  children: [],
};
const CAROL = {
  id: "resp-9",
  firstName: "Carol",
  lastName: "Danvers",
  email: "carol@globex.com",
  jobTitle: null,
  teamId: "team-sales-b",
  organizationId: "org-2",
};

/**
 * Multi-org fetch installer. Routes teams/respondents per org id so a
 * cross-company switch (org-1 → org-2) returns DIFFERENT members. Optionally
 * fails the teams fetch (for the I2 teams-failure regression) — for which org
 * the failure applies is controlled by `failTeamsForOrg`.
 */
function installMultiOrgFetch(opts?: { failTeamsForOrg?: string }) {
  const failTeamsForOrg = opts?.failTeamsForOrg;
  fetchCalls = [];
  const teamsByOrg: Record<string, unknown[]> = {
    "org-1": [TEAM_ENG],
    "org-2": [TEAM_SALES_B],
  };
  const respByOrg: Record<string, unknown[]> = {
    "org-1": [ALICE, BOB],
    "org-2": [CAROL],
  };
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

    if (url.includes("/api/assessment-campaign-drafts")) {
      if (method === "GET") return jsonResponse({ success: true, data: null });
      return jsonResponse({ success: true });
    }
    if (url.endsWith("/api/organizations") && method === "GET") {
      return jsonResponse({ success: true, data: [ORG, ORG_B] });
    }
    const orgDetailMatch = url.match(/\/api\/organizations\/(org-1|org-2)$/);
    if (orgDetailMatch && method === "GET") {
      const o = orgDetailMatch[1] === "org-1" ? ORG : ORG_B;
      return jsonResponse({ success: true, data: o });
    }
    if (url.endsWith("/api/assessment-templates") && method === "GET") {
      return jsonResponse({ success: true, data: [TEMPLATE] });
    }
    const teamsMatch = url.match(/\/api\/organizations\/(org-1|org-2)\/teams/);
    if (teamsMatch && method === "GET") {
      const orgId = teamsMatch[1];
      if (failTeamsForOrg && orgId === failTeamsForOrg) {
        return jsonResponse({ success: false, error: "teams boom" }, false);
      }
      return jsonResponse({ success: true, data: teamsByOrg[orgId] ?? [] });
    }
    const respMatch = url.match(
      /\/api\/organizations\/(org-1|org-2)\/respondents/,
    );
    if (respMatch && method === "GET") {
      return jsonResponse({ success: true, data: respByOrg[respMatch[1]] ?? [] });
    }
    if (url.endsWith("/api/assessment-campaigns") && method === "POST") {
      return jsonResponse({ success: true, data: { id: "camp-1" } });
    }
    if (url.includes("/api/assessment-campaigns/camp-1/participants")) {
      return jsonResponse({ success: true, data: { added: 1 } });
    }
    if (url.includes("/api/assessment-campaigns/camp-1/activate")) {
      return jsonResponse({ success: true, data: { status: "ACTIVE" } });
    }
    return jsonResponse({ success: false, error: "unhandled" }, false);
  }) as unknown as typeof fetch;
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

// ---------------------------------------------------------------------------
// C1 — stale cross-company selection is cleared when the org changes.
// ---------------------------------------------------------------------------

describe("CampaignWizard — C1 cross-company selection reset", () => {
  it("clears member selection (and CEO) when the picked company changes", async () => {
    installMultiOrgFetch();
    render(<CampaignWizard />);

    // Step 0 — pick org A (Acme / org-1).
    const orgA = await screen.findByRole("radio", { name: /acme corp/i });
    fireEvent.click(orgA);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 1 — template.
    const tpl = await screen.findByRole("radio", {
      name: /rockefeller habits/i,
    });
    fireEvent.click(tpl);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2 — select Alice (org A member) + mark her CEO.
    const alice = await screen.findByRole("checkbox", { name: /alice smith/i });
    fireEvent.click(alice);
    expect(alice).toBeChecked();
    const aliceCeo = screen.getByRole("radio", {
      name: /mark alice smith as ceo/i,
    });
    fireEvent.click(aliceCeo);
    expect(aliceCeo).toBeChecked();

    // Back to template, Back to org.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await screen.findByRole("radio", { name: /rockefeller habits/i });
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    // Switch to org B (Globex / org-2).
    const orgB = await screen.findByRole("radio", { name: /globex inc/i });
    fireEvent.click(orgB);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 1 again — template still picked, advance.
    const tpl2 = await screen.findByRole("radio", {
      name: /rockefeller habits/i,
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(tpl2).toBeChecked();

    // Step 2 for org B — Carol is the only member; she is NOT checked, and
    // org-1's Alice is not even rendered. The Next button is disabled
    // because the prior (org A) selection was wiped on the company switch.
    const carol = await screen.findByRole("checkbox", { name: /carol danvers/i });
    expect(carol).not.toBeChecked();
    expect(
      screen.queryByRole("checkbox", { name: /alice smith/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("re-selecting the SAME org does not wipe a valid selection", async () => {
    installMultiOrgFetch();
    render(<CampaignWizard />);

    const orgA = await screen.findByRole("radio", { name: /acme corp/i });
    fireEvent.click(orgA);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const tpl = await screen.findByRole("radio", {
      name: /rockefeller habits/i,
    });
    fireEvent.click(tpl);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const alice = await screen.findByRole("checkbox", { name: /alice smith/i });
    fireEvent.click(alice);
    expect(alice).toBeChecked();

    // Back to org, click the SAME org A again.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await screen.findByRole("radio", { name: /rockefeller habits/i });
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    const orgAagain = await screen.findByRole("radio", { name: /acme corp/i });
    fireEvent.click(orgAagain);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    const tplAgain = await screen.findByRole("radio", {
      name: /rockefeller habits/i,
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(tplAgain).toBeChecked();

    // Selection preserved — Alice still checked.
    const aliceAgain = await screen.findByRole("checkbox", {
      name: /alice smith/i,
    });
    expect(aliceAgain).toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// I2 — a teams-fetch failure is surfaced (not silently swallowed) even when
// the respondents fetch succeeds.
// ---------------------------------------------------------------------------

describe("CampaignWizard — I2 teams-fetch failure", () => {
  it("shows an error + Retry when teams fails but respondents succeed", async () => {
    installMultiOrgFetch({ failTeamsForOrg: "org-1" });
    render(<CampaignWizard />);

    // Step 0 — org A (whose teams fetch is rigged to fail).
    const orgA = await screen.findByRole("radio", { name: /acme corp/i });
    fireEvent.click(orgA);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 1 — template.
    const tpl = await screen.findByRole("radio", {
      name: /rockefeller habits/i,
    });
    fireEvent.click(tpl);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2 — the teams failure must surface as an error with Retry, and the
    // members must NOT be rendered (no silent all-unassigned fallback).
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/failed to load members/i);
    expect(
      screen.getByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /alice smith/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/not associated with any team/i),
    ).not.toBeInTheDocument();
  });
});
