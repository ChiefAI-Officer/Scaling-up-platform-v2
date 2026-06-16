/**
 * Wave D — Task 6b: CampaignWizard toggles #15/#16 + create persistence + adaptive thank-you.
 *
 * #15 — "Email each respondent their results" toggle → sendResultsToRespondent
 * #16 — "Email me when someone completes" toggle → notifyCoachOnCompletion
 *
 * Rules:
 *  - #15 is disabled with a hint when the selected template has resultsEmailApproved === false
 *  - #15 is enabled when resultsEmailApproved === true
 *  - Both fields flow into the POST /api/assessment-campaigns body
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

const TEMPLATE_APPROVED = {
  id: "tpl-approved",
  name: "Rockefeller Habits",
  alias: "rockefeller",
  description: null,
  aggregationMode: "FULL_VISIBILITY" as const,
  resultsEmailApproved: true,
};

const TEMPLATE_NOT_APPROVED = {
  id: "tpl-unapproved",
  name: "LVA Assessment",
  alias: "lva",
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

function installFetch(
  templates: typeof TEMPLATE_APPROVED[] = [TEMPLATE_APPROVED],
  respondents = [ALICE],
) {
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
      return jsonResponse({ success: true, data: templates });
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

async function advanceToSchedule(templates = [TEMPLATE_APPROVED]) {
  installFetch(templates);
  render(<CampaignWizard />);

  // Step 0 — org
  const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
  fireEvent.click(orgRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Step 1 — template
  const tplName = templates[0].name;
  const tplRadio = await screen.findByRole("radio", {
    name: new RegExp(tplName, "i"),
  });
  fireEvent.click(tplRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Step 2 — participants: select at least one so Next is enabled
  const aliceCheckbox = await screen.findByRole("checkbox", {
    name: /alice smith/i,
  });
  fireEvent.click(aliceCheckbox);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Now on Step 3 (Schedule)
}

// ---------------------------------------------------------------------------
// #15 + #16 — Toggles render on Schedule step
// ---------------------------------------------------------------------------

describe("CampaignWizard — #15/#16 toggles", () => {
  it("renders the #15 'email respondent results' toggle on the schedule step", async () => {
    await advanceToSchedule();
    expect(
      screen.getByLabelText(/email each respondent their results/i),
    ).toBeInTheDocument();
  });

  it("renders the #16 'notify coach on completion' toggle on the schedule step", async () => {
    await advanceToSchedule();
    expect(
      screen.getByLabelText(/email me when someone completes/i),
    ).toBeInTheDocument();
  });

  it("#15 toggle is ENABLED when template has resultsEmailApproved = true", async () => {
    await advanceToSchedule([TEMPLATE_APPROVED]);
    const toggle = screen.getByLabelText(/email each respondent their results/i);
    expect(toggle).not.toBeDisabled();
  });

  it("#15 toggle is DISABLED when template has resultsEmailApproved = false", async () => {
    await advanceToSchedule([TEMPLATE_NOT_APPROVED]);
    const toggle = screen.getByLabelText(/email each respondent their results/i);
    expect(toggle).toBeDisabled();
  });

  it("shows a hint when #15 is disabled due to unapproved template", async () => {
    await advanceToSchedule([TEMPLATE_NOT_APPROVED]);
    expect(
      screen.getByText(/results email not yet approved/i),
    ).toBeInTheDocument();
  });

  it("#16 toggle is always enabled regardless of resultsEmailApproved", async () => {
    await advanceToSchedule([TEMPLATE_NOT_APPROVED]);
    const toggle = screen.getByLabelText(/email me when someone completes/i);
    expect(toggle).not.toBeDisabled();
  });

  it("both toggles default to unchecked", async () => {
    await advanceToSchedule();
    expect(
      screen.getByLabelText(/email each respondent their results/i),
    ).not.toBeChecked();
    expect(
      screen.getByLabelText(/email me when someone completes/i),
    ).not.toBeChecked();
  });

  it("#15 toggle becomes checked when clicked (approved template)", async () => {
    await advanceToSchedule([TEMPLATE_APPROVED]);
    const toggle = screen.getByLabelText(/email each respondent their results/i);
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("#16 toggle becomes checked when clicked", async () => {
    await advanceToSchedule();
    const toggle = screen.getByLabelText(/email me when someone completes/i);
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// Create payload — both booleans flow into POST body
// ---------------------------------------------------------------------------

describe("CampaignWizard — toggles flow into create payload", () => {
  it("sends sendResultsToRespondent=false and notifyCoachOnCompletion=false by default", async () => {
    installFetch([TEMPLATE_APPROVED]);
    render(<CampaignWizard />);

    // Step 0
    const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
    fireEvent.click(orgRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 1
    const tplRadio = await screen.findByRole("radio", {
      name: /rockefeller habits/i,
    });
    fireEvent.click(tplRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2
    const aliceCheckbox = await screen.findByRole("checkbox", {
      name: /alice smith/i,
    });
    fireEvent.click(aliceCheckbox);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 3 — fill name, do NOT toggle anything
    const nameInput = screen.getByLabelText(/campaign name/i);
    fireEvent.change(nameInput, { target: { value: "Q3 Test Campaign" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 4 — review: submit
    const saveDraftBtn = await screen.findByRole("button", {
      name: /save as draft/i,
    });
    fireEvent.click(saveDraftBtn);

    await waitFor(() => {
      const postCall = fetchCalls.find(
        (c) =>
          c.url.includes("/api/assessment-campaigns") && c.method === "POST",
      );
      expect(postCall).toBeDefined();
      const body = postCall!.body as Record<string, unknown>;
      expect(body.sendResultsToRespondent).toBe(false);
      expect(body.notifyCoachOnCompletion).toBe(false);
    });
  });

  it("sends sendResultsToRespondent=true when #15 is toggled on (approved template)", async () => {
    installFetch([TEMPLATE_APPROVED]);
    render(<CampaignWizard />);

    // Step 0
    const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
    fireEvent.click(orgRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 1
    const tplRadio = await screen.findByRole("radio", {
      name: /rockefeller habits/i,
    });
    fireEvent.click(tplRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2
    const aliceCheckbox = await screen.findByRole("checkbox", {
      name: /alice smith/i,
    });
    fireEvent.click(aliceCheckbox);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 3 — toggle #15
    const nameInput = screen.getByLabelText(/campaign name/i);
    fireEvent.change(nameInput, { target: { value: "Q3 Test" } });
    const toggle15 = screen.getByLabelText(/email each respondent their results/i);
    fireEvent.click(toggle15);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 4 — submit
    const saveDraftBtn = await screen.findByRole("button", {
      name: /save as draft/i,
    });
    fireEvent.click(saveDraftBtn);

    await waitFor(() => {
      const postCall = fetchCalls.find(
        (c) =>
          c.url.includes("/api/assessment-campaigns") && c.method === "POST",
      );
      expect(postCall).toBeDefined();
      const body = postCall!.body as Record<string, unknown>;
      expect(body.sendResultsToRespondent).toBe(true);
    });
  });

  it("sends notifyCoachOnCompletion=true when #16 is toggled on", async () => {
    installFetch([TEMPLATE_APPROVED]);
    render(<CampaignWizard />);

    // Step 0
    const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
    fireEvent.click(orgRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 1
    const tplRadio = await screen.findByRole("radio", {
      name: /rockefeller habits/i,
    });
    fireEvent.click(tplRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2
    const aliceCheckbox = await screen.findByRole("checkbox", {
      name: /alice smith/i,
    });
    fireEvent.click(aliceCheckbox);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 3 — toggle #16
    const nameInput = screen.getByLabelText(/campaign name/i);
    fireEvent.change(nameInput, { target: { value: "Q3 Test" } });
    const toggle16 = screen.getByLabelText(/email me when someone completes/i);
    fireEvent.click(toggle16);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 4 — submit
    const saveDraftBtn = await screen.findByRole("button", {
      name: /save as draft/i,
    });
    fireEvent.click(saveDraftBtn);

    await waitFor(() => {
      const postCall = fetchCalls.find(
        (c) =>
          c.url.includes("/api/assessment-campaigns") && c.method === "POST",
      );
      expect(postCall).toBeDefined();
      const body = postCall!.body as Record<string, unknown>;
      expect(body.notifyCoachOnCompletion).toBe(true);
    });
  });
});
