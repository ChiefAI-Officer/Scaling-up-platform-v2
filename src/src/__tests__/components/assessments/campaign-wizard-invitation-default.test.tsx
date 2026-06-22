/**
 * Wave G (PR-2) — the wizard PREVIEWS the default invitation via placeholders.
 *
 * The "Customize invitation email" panel shows the actual server-applied
 * default as the Subject input's placeholder and the Body textarea's
 * placeholder — NOT as a controlled value prefill. Prefilling the value would
 * persist as a per-campaign override and stop the campaign from inheriting the
 * live/default body (the bug PR-2 avoids). Leaving the fields blank therefore
 * keeps value="" → save converts blank → undefined → the server applies the
 * shared default.
 *
 * The token helper list also surfaces {{organizationName}} + {{templateName}},
 * which the default body uses.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignWizard } from "@/components/assessments/CampaignWizard";
import {
  DEFAULT_INVITATION_BODY,
  DEFAULT_INVITATION_SUBJECT,
} from "@/lib/assessments/invitation-defaults";

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
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const method = (init?.method ?? "GET").toUpperCase();

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
    return jsonResponse({ success: false, error: "unhandled" }, false);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  jest.restoreAllMocks();
});

/** Advance to the Review (step 4), where the email-overrides panel lives. */
async function advanceToReviewPanel() {
  installFetch();
  render(<CampaignWizard />);

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

  // Schedule step (3) — name is required to advance.
  const nameInput = await screen.findByLabelText(/campaign name/i);
  fireEvent.change(nameInput, { target: { value: "Q3 Test Campaign" } });
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Review step (4) — open the collapsed "Customize invitation email" panel.
  fireEvent.click(await screen.findByTestId("email-overrides-toggle"));
}

describe("CampaignWizard — default invitation preview via placeholder", () => {
  it("shows DEFAULT_INVITATION_SUBJECT as the Subject input placeholder", async () => {
    await advanceToReviewPanel();
    const subject = await screen.findByTestId("invitation-subject-input");
    expect(subject).toHaveAttribute("placeholder", DEFAULT_INVITATION_SUBJECT);
  });

  it("shows DEFAULT_INVITATION_BODY as the Body textarea placeholder", async () => {
    await advanceToReviewPanel();
    const body = await screen.findByTestId("invitation-body-input");
    expect(body).toHaveAttribute("placeholder", DEFAULT_INVITATION_BODY);
  });

  it("does NOT prefill the default into the controlled value (inputs start empty)", async () => {
    await advanceToReviewPanel();
    const subject = await screen.findByTestId("invitation-subject-input");
    const body = await screen.findByTestId("invitation-body-input");
    // Empty value → placeholder visible → blank saves as undefined → server
    // applies the default. A value-prefill would persist as an override.
    expect(subject).toHaveValue("");
    expect(body).toHaveValue("");
  });

  it("lists {{organizationName}} and {{templateName}} as available tokens", async () => {
    await advanceToReviewPanel();
    expect(await screen.findByText("{{organizationName}}")).toBeInTheDocument();
    expect(screen.getByText("{{templateName}}")).toBeInTheDocument();
  });
});
