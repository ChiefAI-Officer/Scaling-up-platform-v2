/**
 * Wave D — Task 10: CampaignWizard timing radio (#2/#3) + openAt gating +
 * consequence-labeled Create button + ≥1 participant gate.
 *
 * Covers:
 *  - Timing radio ("Immediately" / "When the campaign opens") on Schedule step
 *  - inviteTiming flows into the POST body
 *  - Immediately → openAt picker hidden; note shown
 *  - When it opens → openAt picker shown; past datetime → error + Next blocked
 *  - Review/Create button label: IMMEDIATELY → "Create & send N invitation(s) now"
 *  - Review/Create button label: ON_OPEN → "Schedule for <openAt formatted>"
 *  - Create button disabled when 0 participants (requires ≥1)
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { CampaignWizard } from "@/components/assessments/CampaignWizard";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

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
  resultsEmailApproved: false,
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
  jobTitle: null,
  teamId: "team-eng",
  roleType: null as string | null,
};

const BOB = {
  id: "resp-2",
  firstName: "Bob",
  lastName: "Jones",
  email: "bob@acme.com",
  jobTitle: null,
  teamId: "team-eng",
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

function installFetch(respondents = [ALICE, BOB]) {
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
      return jsonResponse({ success: true, data: [TEAM_ENG] });
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

/** Renders the wizard (sets up fetch mock first) then advances to Schedule step. */
async function advanceToSchedule(participantCount = 1) {
  installFetch();
  render(<CampaignWizard autoSend={true} />);

  // Step 0 — org
  const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
  fireEvent.click(orgRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Step 1 — template
  const tplRadio = await screen.findByRole("radio", { name: /rockefeller habits/i });
  fireEvent.click(tplRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Step 2 — participants
  const aliceCheckbox = await screen.findByRole("checkbox", { name: /alice smith/i });
  fireEvent.click(aliceCheckbox);
  if (participantCount >= 2) {
    const bobCheckbox = await screen.findByRole("checkbox", { name: /bob jones/i });
    fireEvent.click(bobCheckbox);
  }
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  // Now on Step 3 (Schedule)
}

/** Advances from step 0 all the way to Review (step 4). installFetch + render happen inside advanceToSchedule. */
async function advanceToReview(opts: { participantCount?: number; timing?: "immediately" | "when" } = {}) {
  const { participantCount = 1, timing = "immediately" } = opts;
  await advanceToSchedule(participantCount);

  // Fill campaign name
  const nameInput = screen.getByLabelText(/campaign name/i);
  fireEvent.change(nameInput, { target: { value: "Test Campaign" } });

  // Choose timing
  if (timing === "when") {
    const whenRadio = screen.getByRole("radio", { name: /when the campaign opens/i });
    fireEvent.click(whenRadio);
    // Set a future openAt (tomorrow)
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const futureStr =
      `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}` +
      `T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
    const openAtInput = screen.getByLabelText(/opens at/i);
    fireEvent.change(openAtInput, { target: { value: futureStr } });
  }

  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  // Now on Step 4 (Review)
}

// ---------------------------------------------------------------------------
// Timing radio — renders on Schedule step
// ---------------------------------------------------------------------------

describe("CampaignWizard — timing radio (#2/#3)", () => {
  it("renders Immediately and When-it-opens radios on Schedule step", async () => {
    await advanceToSchedule();

    expect(
      screen.getByRole("radio", { name: /immediately/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /when the campaign opens/i }),
    ).toBeInTheDocument();
  });

  it("defaults to Immediately", async () => {
    await advanceToSchedule();

    const immediateRadio = screen.getByRole("radio", { name: /immediately/i });
    expect(immediateRadio).toBeChecked();

    const whenRadio = screen.getByRole("radio", { name: /when the campaign opens/i });
    expect(whenRadio).not.toBeChecked();
  });

  it("shows 'Invitations send as soon as you create' note when Immediately", async () => {
    await advanceToSchedule();

    expect(
      screen.getByText(/invitations send as soon as you create/i),
    ).toBeInTheDocument();
  });

  it("hides/disables the openAt picker when Immediately is selected", async () => {
    await advanceToSchedule();

    const immediateRadio = screen.getByRole("radio", { name: /immediately/i });
    expect(immediateRadio).toBeChecked();

    // openAt picker should not be visible (or be disabled) when Immediately
    const openAtInput = screen.queryByLabelText(/opens at/i);
    // Either not rendered OR disabled
    expect(!openAtInput || (openAtInput as HTMLInputElement).disabled).toBe(true);
  });

  it("shows the openAt picker when 'When the campaign opens' is selected", async () => {
    await advanceToSchedule();

    const whenRadio = screen.getByRole("radio", { name: /when the campaign opens/i });
    fireEvent.click(whenRadio);

    const openAtInput = screen.getByLabelText(/opens at/i);
    expect(openAtInput).toBeInTheDocument();
    expect((openAtInput as HTMLInputElement).disabled).toBe(false);
  });

  it("blocks Next with inline error when openAt is in the past (ON_OPEN)", async () => {
    await advanceToSchedule();

    const whenRadio = screen.getByRole("radio", { name: /when the campaign opens/i });
    fireEvent.click(whenRadio);

    // Set a PAST datetime
    const openAtInput = screen.getByLabelText(/opens at/i);
    fireEvent.change(openAtInput, { target: { value: "2020-01-01T00:00" } });

    // Fill name so that's not blocking
    const nameInput = screen.getByLabelText(/campaign name/i);
    fireEvent.change(nameInput, { target: { value: "Test" } });

    // Next button should be disabled
    const nextBtn = screen.getByRole("button", { name: /next/i });
    expect(nextBtn).toBeDisabled();

    // Inline error message
    expect(
      screen.getByText(/open time must be in the future/i),
    ).toBeInTheDocument();
  });

  it("allows Next when openAt is in the future (ON_OPEN)", async () => {
    await advanceToSchedule();

    const whenRadio = screen.getByRole("radio", { name: /when the campaign opens/i });
    fireEvent.click(whenRadio);

    // Set a FUTURE datetime
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const futureStr =
      `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}` +
      `T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;

    const openAtInput = screen.getByLabelText(/opens at/i);
    fireEvent.change(openAtInput, { target: { value: futureStr } });

    const nameInput = screen.getByLabelText(/campaign name/i);
    fireEvent.change(nameInput, { target: { value: "Test Campaign" } });

    const nextBtn = screen.getByRole("button", { name: /next/i });
    expect(nextBtn).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// inviteTiming flows to POST body
// ---------------------------------------------------------------------------

describe("CampaignWizard — inviteTiming in POST body", () => {
  it("sends inviteTiming=IMMEDIATELY when Immediately is selected", async () => {
    await advanceToReview({ timing: "immediately" });

    // Click Create button (IMMEDIATELY mode → "Create & send N invitation(s) now")
    const createBtn = screen.getByRole("button", { name: /create & send/i });
    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      const createCall = fetchCalls.find(
        (c) => c.url.endsWith("/api/assessment-campaigns") && c.method === "POST",
      );
      expect(createCall).toBeDefined();
      expect((createCall?.body as Record<string, unknown>)?.inviteTiming).toBe("IMMEDIATELY");
    });
  });

  it("sends inviteTiming=ON_OPEN when When-it-opens is selected", async () => {
    await advanceToReview({ timing: "when" });

    // ON_OPEN mode → "Schedule for ..."
    const createBtn = screen.getByRole("button", { name: /schedule for/i });
    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      const createCall = fetchCalls.find(
        (c) => c.url.endsWith("/api/assessment-campaigns") && c.method === "POST",
      );
      expect(createCall).toBeDefined();
      expect((createCall?.body as Record<string, unknown>)?.inviteTiming).toBe("ON_OPEN");
    });
  });
});

// ---------------------------------------------------------------------------
// Consequence-labeled Create button (Review step)
// ---------------------------------------------------------------------------

describe("CampaignWizard — consequence-labeled Create button", () => {
  it("shows 'Create & send N invitation(s) now' for IMMEDIATELY with N=1", async () => {
    await advanceToReview({ participantCount: 1, timing: "immediately" });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /create & send 1 invitation\(s\) now/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows 'Create & send N invitation(s) now' for IMMEDIATELY with N=2", async () => {
    await advanceToReview({ participantCount: 2, timing: "immediately" });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /create & send 2 invitation\(s\) now/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows 'Schedule for ...' label for ON_OPEN", async () => {
    await advanceToReview({ participantCount: 1, timing: "when" });

    await waitFor(() => {
      // Should contain "Schedule for" with some date
      const createBtn = screen.getByRole("button", { name: /schedule for/i });
      expect(createBtn).toBeInTheDocument();
    });
  });

  it("disables Next when 0 participants are selected (can't reach Review with 0)", async () => {
    // Verify the guard: Next is disabled on the Participants step when 0 selected.
    installFetch([]);
    render(<CampaignWizard autoSend={true} />);

    // Step 0 — org
    const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
    fireEvent.click(orgRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 1 — template
    const tplRadio = await screen.findByRole("radio", { name: /rockefeller habits/i });
    fireEvent.click(tplRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2 — no participants (none loaded) — Next is disabled
    await waitFor(() => {
      const nextBtn = screen.getByRole("button", { name: /next/i });
      expect(nextBtn).toBeDisabled();
    });
  });
});
