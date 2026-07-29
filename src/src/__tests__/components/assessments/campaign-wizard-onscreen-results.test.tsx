/**
 * Wave OSR (Jeff #71) — the campaign wizard's "Results on screen" checkbox.
 *
 * Mirrors the harness in campaign-wizard-results-flag-gate.test.tsx (the #15/#16
 * siblings) so the fixture cost is near zero.
 *
 * NOTE on what is deliberately NOT tested here. The spec's non-coercion decision
 * — the wizard must not force `showResultsOnScreen` false when the flag is off,
 * unlike `sendResultsToRespondent` — has NO observable behaviour to assert:
 * `persistDraft` never stores any of the three toggles, so the "stale draft true"
 * state the coercion defends against cannot arise, and with the flag off the
 * hidden checkbox leaves the value false either way. The decision stands on
 * consistency ("flags gate capability, not data"), and ADR-0027 was corrected to
 * stop claiming a hazard that cannot occur. Inventing a test that appeared to
 * cover it would be worse than recording why one is impossible.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignWizard } from "@/components/assessments/CampaignWizard";

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const ORG = { id: "org-1", name: "Acme Corp", externalId: null };
const TEMPLATE = {
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

function installFetch() {
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
      return jsonResponse({ success: true, data: [ALICE] });
    }
    if (url.endsWith("/api/assessment-campaigns") && method === "POST") {
      return jsonResponse({ success: true, data: { id: "camp-1" } });
    }
    if (url.includes("/api/assessment-campaigns/camp-1/")) {
      return jsonResponse({ success: true, data: {} });
    }
    return jsonResponse({ success: false, error: "unhandled" }, false);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  jest.restoreAllMocks();
});

async function advanceToSchedule(props: {
  onScreenResultsEnabled?: boolean;
  resultsEmailEnabled?: boolean;
} = {}) {
  installFetch();
  render(<CampaignWizard {...props} />);

  fireEvent.click(await screen.findByRole("radio", { name: /acme corp/i }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  fireEvent.click(
    await screen.findByRole("radio", { name: /rockefeller habits/i }),
  );
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  fireEvent.click(await screen.findByRole("checkbox", { name: /alice smith/i }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
}

const CHECKBOX = /show each respondent their results on screen/i;

describe("flag gating", () => {
  it("HIDES the checkbox when the flag is off (default)", async () => {
    await advanceToSchedule();
    expect(screen.queryByLabelText(CHECKBOX)).not.toBeInTheDocument();
  });

  it("SHOWS the checkbox when the flag is on", async () => {
    await advanceToSchedule({ onScreenResultsEnabled: true });
    expect(screen.getByLabelText(CHECKBOX)).toBeInTheDocument();
  });

  it("starts unchecked — the campaign must opt IN", async () => {
    await advanceToSchedule({ onScreenResultsEnabled: true });
    expect(screen.getByLabelText(CHECKBOX)).not.toBeChecked();
  });

  it("is NOT gated on the results-email approval state", async () => {
    // Independent of the approval hash by design: that hash approves authored
    // EMAIL copy, and this render carries none.
    await advanceToSchedule({ onScreenResultsEnabled: true });
    expect(screen.getByLabelText(CHECKBOX)).not.toBeDisabled();
  });
});

describe("the one-look operator warning", () => {
  it("warns when on-screen is on and no results email is going out", async () => {
    await advanceToSchedule({ onScreenResultsEnabled: true });
    fireEvent.click(screen.getByLabelText(CHECKBOX));
    expect(
      screen.getByText(/they will not be able to return to it later/i),
    ).toBeInTheDocument();
  });

  it("shows no warning while the box is unchecked", async () => {
    await advanceToSchedule({ onScreenResultsEnabled: true });
    expect(
      screen.queryByText(/they will not be able to return to it later/i),
    ).not.toBeInTheDocument();
  });
});

describe("the create payload", () => {
  async function submitDraft(props: {
    onScreenResultsEnabled?: boolean;
    tick?: boolean;
  }) {
    await advanceToSchedule({
      onScreenResultsEnabled: props.onScreenResultsEnabled,
    });
    if (props.tick) fireEvent.click(screen.getByLabelText(CHECKBOX));

    fireEvent.change(screen.getByLabelText(/campaign name/i), {
      target: { value: "Q3 Test Campaign" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /save as draft/i }),
    );

    await waitFor(() => {
      expect(
        fetchCalls.find(
          (c) =>
            c.url.endsWith("/api/assessment-campaigns") && c.method === "POST",
        ),
      ).toBeDefined();
    });
    return fetchCalls.find(
      (c) => c.url.endsWith("/api/assessment-campaigns") && c.method === "POST",
    )!.body as Record<string, unknown>;
  }

  it("sends showResultsOnScreen true when the operator ticks the box", async () => {
    const body = await submitDraft({ onScreenResultsEnabled: true, tick: true });
    expect(body.showResultsOnScreen).toBe(true);
  });

  it("sends false when the box is left unticked", async () => {
    const body = await submitDraft({ onScreenResultsEnabled: true });
    expect(body.showResultsOnScreen).toBe(false);
  });

  it("is not true when the flag is off (the checkbox never renders)", async () => {
    const body = await submitDraft({ onScreenResultsEnabled: false });
    expect(body.showResultsOnScreen).not.toBe(true);
  });
});
