/**
 * Wave Q item #1 — results-email template default in the campaign wizard.
 *
 * The picker payload now carries per-template `sendResultsDefault`. With the
 * `waveQDefaultsEnabled` prop ON, picking a template derives the #15 checkbox
 * initial state as `resultsEmailApproved ? template.sendResultsDefault : false`
 * (approval always wins). Flag OFF = byte-identical legacy behavior (hardcoded
 * false / force-false-when-unapproved). A resumed draft keeps its explicitly
 * saved `sendResultsToRespondent === true` — never retro-defaulted; only a
 * template-SWITCH after resume re-derives.
 *
 * Also covers the disabled-template draft-resume state: a resumed draft whose
 * templateId is absent from the picker payload surfaces "This template is no
 * longer available — choose another" and forces a re-pick (Next disabled).
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignWizard } from "@/components/assessments/CampaignWizard";

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const ORG = { id: "org-1", name: "Acme Corp", externalId: null };

const TEMPLATE_DEFAULT_ON = {
  id: "tpl-default-on",
  name: "Rockefeller Habits",
  alias: "rockefeller",
  description: null,
  aggregationMode: "FULL_VISIBILITY" as const,
  resultsEmailApproved: true,
  sendResultsDefault: true,
};

const TEMPLATE_DEFAULT_OFF = {
  id: "tpl-default-off",
  name: "Leadership Assessment",
  alias: "lva",
  description: null,
  aggregationMode: "FULL_VISIBILITY" as const,
  resultsEmailApproved: true,
  sendResultsDefault: false,
};

const TEMPLATE_UNAPPROVED_DEFAULT_ON = {
  id: "tpl-unapproved",
  name: "Quarterly Pulse",
  alias: "pulse",
  description: null,
  aggregationMode: "FULL_VISIBILITY" as const,
  resultsEmailApproved: false,
  sendResultsDefault: true,
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

type TemplatePayload = typeof TEMPLATE_DEFAULT_ON;

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

function installFetch({
  templates = [TEMPLATE_DEFAULT_ON],
  draft = null,
}: {
  templates?: TemplatePayload[];
  draft?: {
    stepsData: string;
    currentStep: number;
    lastSavedAt: string;
  } | null;
} = {}) {
  fetchCalls = [];
  global.fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
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
        if (method === "GET") {
          return jsonResponse({ success: true, data: draft });
        }
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
      if (
        url.includes("/api/organizations/org-1/respondents") &&
        method === "GET"
      ) {
        return jsonResponse({ success: true, data: [ALICE] });
      }
      return jsonResponse({ success: false, error: "unhandled" }, false);
    },
  ) as unknown as typeof fetch;
}

afterEach(() => {
  jest.restoreAllMocks();
});

/** Advance to Schedule (step 3), picking the given template along the way. */
async function advanceToSchedule(
  props: {
    waveQDefaultsEnabled?: boolean;
    resultsEmailEnabled?: boolean;
  },
  templates: TemplatePayload[],
  pickTemplateName: RegExp,
) {
  installFetch({ templates });
  render(<CampaignWizard {...props} />);

  const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
  fireEvent.click(orgRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  const tplRadio = await screen.findByRole("radio", {
    name: pickTemplateName,
  });
  fireEvent.click(tplRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  const aliceCheckbox = await screen.findByRole("checkbox", {
    name: /alice smith/i,
  });
  fireEvent.click(aliceCheckbox);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
}

const resultsCheckbox = () =>
  screen.getByLabelText(
    /email each respondent their results/i,
  ) as HTMLInputElement;

// ---------------------------------------------------------------------------
// Flag OFF — legacy behavior byte-identical
// ---------------------------------------------------------------------------

describe("CampaignWizard — Wave Q flag OFF (legacy default)", () => {
  it("checkbox defaults FALSE even when the template default is true", async () => {
    await advanceToSchedule(
      { resultsEmailEnabled: true },
      [TEMPLATE_DEFAULT_ON],
      /rockefeller habits/i,
    );
    expect(resultsCheckbox().checked).toBe(false);
    expect(resultsCheckbox()).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Flag ON — derived default
// ---------------------------------------------------------------------------

describe("CampaignWizard — Wave Q flag ON derives the #15 default", () => {
  it("approved + default true → checkbox starts CHECKED", async () => {
    await advanceToSchedule(
      { waveQDefaultsEnabled: true, resultsEmailEnabled: true },
      [TEMPLATE_DEFAULT_ON],
      /rockefeller habits/i,
    );
    expect(resultsCheckbox().checked).toBe(true);
  });

  it("approved + default false → checkbox starts unchecked", async () => {
    await advanceToSchedule(
      { waveQDefaultsEnabled: true, resultsEmailEnabled: true },
      [TEMPLATE_DEFAULT_OFF],
      /leadership assessment/i,
    );
    expect(resultsCheckbox().checked).toBe(false);
  });

  it("UNapproved + default true → unchecked AND disabled (approval wins)", async () => {
    await advanceToSchedule(
      { waveQDefaultsEnabled: true, resultsEmailEnabled: true },
      [TEMPLATE_UNAPPROVED_DEFAULT_ON],
      /quarterly pulse/i,
    );
    expect(resultsCheckbox().checked).toBe(false);
    expect(resultsCheckbox()).toBeDisabled();
  });

  it("template-switch re-derives from the NEW template's default", async () => {
    await advanceToSchedule(
      { waveQDefaultsEnabled: true, resultsEmailEnabled: true },
      [TEMPLATE_DEFAULT_ON, TEMPLATE_DEFAULT_OFF],
      /rockefeller habits/i,
    );
    expect(resultsCheckbox().checked).toBe(true);

    // Back to Participants, back to Template, switch to the default-false one.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await screen.findByRole("checkbox", { name: /alice smith/i });
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    const otherRadio = await screen.findByRole("radio", {
      name: /leadership assessment/i,
    });
    fireEvent.click(otherRadio);
    // No stale-template warning for a valid selection.
    expect(
      screen.queryByText(/no longer available/i),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByRole("checkbox", { name: /alice smith/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(resultsCheckbox().checked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Draft resume — saved explicit value always wins over the derived default
// ---------------------------------------------------------------------------

describe("CampaignWizard — Wave Q draft resume", () => {
  it("a resumed draft keeps its saved sendResultsToRespondent=true (no re-derive)", async () => {
    installFetch({
      // Picker default is FALSE — proving the resumed TRUE was kept, not derived.
      templates: [TEMPLATE_DEFAULT_OFF],
      draft: {
        stepsData: JSON.stringify({
          organizationId: "org-1",
          templateId: "tpl-default-off",
          respondentIds: ["resp-1"],
          ceoRespondentId: null,
          name: "Resumed Campaign",
          openAt: "2030-01-01T09:00",
          endMode: "OPEN_END",
          closeAt: "",
          sendResultsToRespondent: true,
        }),
        currentStep: 3,
        lastSavedAt: new Date().toISOString(),
      },
    });
    render(
      <CampaignWizard waveQDefaultsEnabled resultsEmailEnabled />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /resume/i }),
    );

    expect(resultsCheckbox().checked).toBe(true);
  });

  it("resumed draft pointing at a template absent from the picker shows the 'no longer available' state and blocks Next", async () => {
    installFetch({
      templates: [TEMPLATE_DEFAULT_ON],
      draft: {
        stepsData: JSON.stringify({
          organizationId: "org-1",
          templateId: "tpl-gone",
          respondentIds: [],
          ceoRespondentId: null,
          name: "",
          openAt: "2030-01-01T09:00",
          endMode: "OPEN_END",
          closeAt: "",
        }),
        currentStep: 1,
        lastSavedAt: new Date().toISOString(),
      },
    });
    render(<CampaignWizard />);

    fireEvent.click(
      await screen.findByRole("button", { name: /resume/i }),
    );

    // Template step, stale templateId → visible re-pick prompt + Next blocked.
    expect(
      await screen.findByText(
        /this template is no longer available — choose another/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();

    // Re-picking a live template clears the state and unblocks Next.
    fireEvent.click(
      screen.getByRole("radio", { name: /rockefeller habits/i }),
    );
    expect(
      screen.queryByText(/no longer available/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
  });
});
