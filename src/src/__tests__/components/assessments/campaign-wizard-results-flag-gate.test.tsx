/**
 * Wave D — FIX 2: gate the #15/#16 email checkboxes behind their feature flags.
 *
 * Root cause: the #15 ("Email each respondent their results") + #16 ("Email me
 * on completion") checkboxes were ungated UI. With WAVE_D_RESULTS_EMAIL_ENABLED
 * OFF (dark merge) a coach could still check #15 → sendResultsToRespondent=true
 * persists → the thank-you page promises "We are sending you your results."
 * but NO email sends (the send path is flag-gated) → a misleading message.
 *
 * Fix: the wizard takes `resultsEmailEnabled` + `coachNotifyEnabled` props
 * (default false, mirroring the server flags). When a flag is OFF its checkbox
 * is hidden AND its field is never sent true on the create.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignWizard } from "@/components/assessments/CampaignWizard";

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const ORG = { id: "org-1", name: "Acme Corp", externalId: null };

const TEMPLATE_APPROVED = {
  id: "tpl-approved",
  name: "Rockefeller Habits",
  alias: "rockefeller",
  description: null,
  aggregationMode: "FULL_VISIBILITY" as const,
  resultsEmailApproved: true,
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
  templates: (typeof TEMPLATE_APPROVED)[] = [TEMPLATE_APPROVED],
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

/** Advance to the Schedule (step 3) with arbitrary CampaignWizard props. */
async function advanceToSchedule(
  props: { resultsEmailEnabled?: boolean; coachNotifyEnabled?: boolean } = {},
  templates = [TEMPLATE_APPROVED],
) {
  installFetch(templates);
  render(<CampaignWizard {...props} />);

  const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
  fireEvent.click(orgRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  const tplRadio = await screen.findByRole("radio", {
    name: new RegExp(templates[0].name, "i"),
  });
  fireEvent.click(tplRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  const aliceCheckbox = await screen.findByRole("checkbox", {
    name: /alice smith/i,
  });
  fireEvent.click(aliceCheckbox);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
}

// ---------------------------------------------------------------------------
// Flags OFF (default / dark merge) — checkboxes hidden
// ---------------------------------------------------------------------------

describe("CampaignWizard — #15/#16 flag gating", () => {
  it("HIDES the #15 checkbox when resultsEmailEnabled is false (default)", async () => {
    await advanceToSchedule();
    expect(
      screen.queryByLabelText(/email each respondent their results/i),
    ).not.toBeInTheDocument();
  });

  it("HIDES the #16 checkbox when coachNotifyEnabled is false (default)", async () => {
    await advanceToSchedule();
    expect(
      screen.queryByLabelText(/email me when someone completes/i),
    ).not.toBeInTheDocument();
  });

  it("SHOWS the #15 checkbox when resultsEmailEnabled is true (still approval-gated)", async () => {
    await advanceToSchedule({ resultsEmailEnabled: true });
    const toggle = screen.getByLabelText(/email each respondent their results/i);
    expect(toggle).toBeInTheDocument();
    // approved template → enabled
    expect(toggle).not.toBeDisabled();
  });

  it("SHOWS the #16 checkbox when coachNotifyEnabled is true", async () => {
    await advanceToSchedule({ coachNotifyEnabled: true });
    expect(
      screen.getByLabelText(/email me when someone completes/i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Flags OFF → fields never sent true on the create
// ---------------------------------------------------------------------------

describe("CampaignWizard — flags OFF never persist the toggle true", () => {
  async function submitDraft(props: {
    resultsEmailEnabled?: boolean;
    coachNotifyEnabled?: boolean;
  }) {
    installFetch([TEMPLATE_APPROVED]);
    render(<CampaignWizard {...props} />);

    const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
    fireEvent.click(orgRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const tplRadio = await screen.findByRole("radio", {
      name: /rockefeller habits/i,
    });
    fireEvent.click(tplRadio);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const aliceCheckbox = await screen.findByRole("checkbox", {
      name: /alice smith/i,
    });
    fireEvent.click(aliceCheckbox);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const nameInput = screen.getByLabelText(/campaign name/i);
    fireEvent.change(nameInput, { target: { value: "Q3 Test Campaign" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

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
    });
    const postCall = fetchCalls.find(
      (c) => c.url.includes("/api/assessment-campaigns") && c.method === "POST",
    );
    return postCall!.body as Record<string, unknown>;
  }

  it("sendResultsToRespondent is NOT true when resultsEmailEnabled is false", async () => {
    const body = await submitDraft({ resultsEmailEnabled: false });
    expect(body.sendResultsToRespondent).not.toBe(true);
  });

  it("notifyCoachOnCompletion is NOT true when coachNotifyEnabled is false", async () => {
    const body = await submitDraft({ coachNotifyEnabled: false });
    expect(body.notifyCoachOnCompletion).not.toBe(true);
  });
});
