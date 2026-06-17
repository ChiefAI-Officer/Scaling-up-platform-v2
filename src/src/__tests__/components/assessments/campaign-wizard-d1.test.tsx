/**
 * Wave D — Task 4: CampaignWizard feature tests.
 *
 * #17 — Schedule step shows the selected template name (read-only badge).
 * #18 — Select-All per group header; filter-aware when search is active.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignWizard } from "@/components/assessments/CampaignWizard";

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
const TEAM_SALES = {
  id: "team-sales",
  organizationId: "org-1",
  parentTeamId: null,
  name: "Sales",
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
  roleType: null as string | null,
};
const BOB = {
  id: "resp-2",
  firstName: "Bob",
  lastName: "Jones",
  email: "bob@acme.com",
  jobTitle: null,
  teamId: "team-eng",
  organizationId: "org-1",
  roleType: null as string | null,
};
// Charlie is in Sales
const CHARLIE = {
  id: "resp-3",
  firstName: "Charlie",
  lastName: "Davis",
  email: "charlie@acme.com",
  jobTitle: null,
  teamId: "team-sales",
  organizationId: "org-1",
  roleType: null as string | null,
};

// ---------------------------------------------------------------------------
// Fetch helper
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

function installFetch(respondents = [ALICE, BOB, CHARLIE], teams = [TEAM_ENG, TEAM_SALES]) {
  fetchCalls = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = undefined;
    if (init?.body && typeof init.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    fetchCalls.push({ url, method, body });

    if (url.includes("/api/assessment-campaign-drafts")) {
      if (method === "GET") return jsonResponse({ success: true, data: null });
      return jsonResponse({ success: true });
    }
    if (url.endsWith("/api/organizations") && method === "GET") {
      return jsonResponse({ success: true, data: [ORG] });
    }
    if (url.match(/\/api\/organizations\/org-1$/) && method === "GET") {
      return jsonResponse({ success: true, data: ORG });
    }
    if (url.endsWith("/api/assessment-templates") && method === "GET") {
      return jsonResponse({ success: true, data: [TEMPLATE] });
    }
    if (url.includes("/api/organizations/org-1/teams") && method === "GET") {
      return jsonResponse({ success: true, data: teams });
    }
    if (url.includes("/api/organizations/org-1/respondents") && method === "GET") {
      return jsonResponse({ success: true, data: respondents });
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
// Navigation helpers
// ---------------------------------------------------------------------------

async function advanceToSchedule() {
  // Step 0 — org
  const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
  fireEvent.click(orgRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Step 1 — template
  const tplRadio = await screen.findByRole("radio", { name: /rockefeller habits/i });
  fireEvent.click(tplRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Step 2 — participants: select at least one so Next is enabled
  const aliceCheckbox = await screen.findByRole("checkbox", { name: /alice smith/i });
  fireEvent.click(aliceCheckbox);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Now on Step 3 (Schedule)
}

async function advanceToParticipants() {
  // Step 0 — org
  const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
  fireEvent.click(orgRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Step 1 — template
  const tplRadio = await screen.findByRole("radio", { name: /rockefeller habits/i });
  fireEvent.click(tplRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Now on Step 2 (Participants)
}

// ---------------------------------------------------------------------------
// #17 — Template name shown on Schedule step
// ---------------------------------------------------------------------------

describe("CampaignWizard — #17 template name on Schedule step", () => {
  it("shows the selected template name as a read-only label on the schedule step", async () => {
    installFetch();
    render(<CampaignWizard />);

    await advanceToSchedule();

    // Should show the template name on Step 3 (Schedule)
    await screen.findByText(/rockefeller habits/i);
    // Confirm we're actually on the schedule step (campaign name input present)
    expect(screen.getByLabelText(/campaign name/i)).toBeInTheDocument();
  });

  it("does NOT show the template name on the participants step", async () => {
    installFetch();
    render(<CampaignWizard />);

    await advanceToParticipants();

    // On Step 2 — template name should NOT be shown as an assessment label
    await screen.findByText("Alice Smith"); // verify we're on participants
    // The template radio label is gone (different step), but the badge/label should not appear here
    expect(screen.queryByTestId("schedule-template-name")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// #18 — Select-All per group
// ---------------------------------------------------------------------------

describe("CampaignWizard — #18 Select-All participants per group", () => {
  it("renders a Select-All control in each group header", async () => {
    installFetch();
    render(<CampaignWizard />);

    await advanceToParticipants();

    // Both groups should render
    await screen.findByText("Alice Smith");

    // Select-All controls exist for Engineering and Sales
    expect(
      screen.getByRole("checkbox", { name: /select all engineering/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /select all sales/i }),
    ).toBeInTheDocument();
  });

  it("Select-All for a group checks all members in that group", async () => {
    installFetch();
    render(<CampaignWizard />);

    await advanceToParticipants();
    await screen.findByText("Alice Smith");

    // Click Select-All for Engineering (Alice + Bob)
    fireEvent.click(screen.getByRole("checkbox", { name: /select all engineering/i }));

    expect(
      screen.getByRole("checkbox", { name: /include alice smith/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /include bob jones/i }),
    ).toBeChecked();
    // Charlie (Sales) should NOT be affected
    expect(
      screen.getByRole("checkbox", { name: /include charlie davis/i }),
    ).not.toBeChecked();
  });

  it("unchecking Select-All clears all members in that group", async () => {
    installFetch();
    render(<CampaignWizard />);

    await advanceToParticipants();
    await screen.findByText("Alice Smith");

    // Select all Engineering first
    const selectAllEng = screen.getByRole("checkbox", { name: /select all engineering/i });
    fireEvent.click(selectAllEng);
    expect(
      screen.getByRole("checkbox", { name: /include alice smith/i }),
    ).toBeChecked();

    // Uncheck Select-All Engineering
    fireEvent.click(selectAllEng);
    expect(
      screen.getByRole("checkbox", { name: /include alice smith/i }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /include bob jones/i }),
    ).not.toBeChecked();
  });

  it("Select-All is checked when all members in the group are checked", async () => {
    installFetch();
    render(<CampaignWizard />);

    await advanceToParticipants();
    await screen.findByText("Alice Smith");

    // Manually check Alice and Bob (Engineering)
    fireEvent.click(screen.getByRole("checkbox", { name: /include alice smith/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /include bob jones/i }));

    // Select-All for Engineering should now be checked
    expect(
      screen.getByRole("checkbox", { name: /select all engineering/i }),
    ).toBeChecked();
  });

  it("Select-All is unchecked (indeterminate or unchecked) when only some group members are selected", async () => {
    installFetch();
    render(<CampaignWizard />);

    await advanceToParticipants();
    await screen.findByText("Alice Smith");

    // Check only Alice (not Bob) in Engineering
    fireEvent.click(screen.getByRole("checkbox", { name: /include alice smith/i }));

    // Select-All should NOT be fully checked
    const selectAllEng = screen.getByRole("checkbox", { name: /select all engineering/i });
    expect(selectAllEng).not.toBeChecked();
  });

  it("Select-All with search filter only selects visible (filtered) members", async () => {
    installFetch();
    render(<CampaignWizard />);

    await advanceToParticipants();
    await screen.findByText("Alice Smith");

    // Type in search to filter to only "Alice"
    const searchInput = screen.getByPlaceholderText(/search members/i);
    fireEvent.change(searchInput, { target: { value: "Alice" } });

    // Bob should no longer be visible
    await waitFor(() => {
      expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
    });

    // Select-All for Engineering now only selects Alice (visible), not Bob (hidden)
    fireEvent.click(screen.getByRole("checkbox", { name: /select all engineering/i }));

    expect(
      screen.getByRole("checkbox", { name: /include alice smith/i }),
    ).toBeChecked();

    // Clear search — Bob should reappear and NOT be checked
    fireEvent.change(searchInput, { target: { value: "" } });
    await screen.findByText("Bob Jones");
    expect(
      screen.getByRole("checkbox", { name: /include bob jones/i }),
    ).not.toBeChecked();
  });
});
