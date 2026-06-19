/**
 * Wave D dark-merge fix — CampaignWizard auto-send gating.
 *
 * The timing radio (#2/#3) and the `inviteTiming` create-payload field are the
 * client half of the Wave-D auto-send lifecycle. They MUST be gated behind the
 * server `WAVE_D_AUTO_SEND_ENABLED` flag (passed in as the `autoSend` prop,
 * mirroring how `customHtmlEmailEnabled` is wired from the server page):
 *
 *   - autoSend=false (default merge state): NO timing radio, NO `inviteTiming`
 *     in the POST body (so the create route takes the legacy DRAFT path), and
 *     the legacy `openAt` picker is shown (the coach's chosen open date).
 *   - autoSend=true: timing radio rendered + `inviteTiming` sent, as built.
 *
 * Without this gating the radio always renders + always sends `inviteTiming`,
 * making every create a "Wave-D create" and (with auto-send OFF) stranding the
 * coach at the manual /invite 409 gate.
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

function installFetch(respondents = [ALICE]) {
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

/** Renders the wizard with the given autoSend prop, advances to the Schedule step. */
async function advanceToSchedule(autoSend: boolean) {
  installFetch();
  render(<CampaignWizard autoSend={autoSend} />);

  const orgRadio = await screen.findByRole("radio", { name: /acme corp/i });
  fireEvent.click(orgRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  const tplRadio = await screen.findByRole("radio", { name: /rockefeller habits/i });
  fireEvent.click(tplRadio);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  const aliceCheckbox = await screen.findByRole("checkbox", { name: /alice smith/i });
  fireEvent.click(aliceCheckbox);
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  // Now on Step 3 (Schedule).
}

describe("CampaignWizard — auto-send flag gates the timing radio", () => {
  it("autoSend=false: hides the timing radio entirely", async () => {
    await advanceToSchedule(false);
    expect(
      screen.queryByRole("radio", { name: /immediately/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /when the campaign opens/i }),
    ).not.toBeInTheDocument();
  });

  it("autoSend=false: shows the legacy openAt picker (coach's chosen date)", async () => {
    await advanceToSchedule(false);
    const openAtInput = screen.getByLabelText(/opens at/i);
    expect(openAtInput).toBeInTheDocument();
    expect((openAtInput as HTMLInputElement).disabled).toBe(false);
  });

  it("autoSend=true: renders the timing radio", async () => {
    await advanceToSchedule(true);
    expect(
      screen.getByRole("radio", { name: /immediately/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /when the campaign opens/i }),
    ).toBeInTheDocument();
  });
});

describe("CampaignWizard — auto-send flag gates the inviteTiming payload", () => {
  it("autoSend=false: create POST body omits inviteTiming (legacy create path)", async () => {
    await advanceToSchedule(false);

    const nameInput = screen.getByLabelText(/campaign name/i);
    fireEvent.change(nameInput, { target: { value: "Test Campaign" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Review → Save as Draft (no timing radio means no "Create & send" label).
    const draftBtn = await screen.findByRole("button", { name: /save as draft/i });
    await act(async () => {
      fireEvent.click(draftBtn);
    });

    await waitFor(() => {
      const createCall = fetchCalls.find(
        (c) => c.url.endsWith("/api/assessment-campaigns") && c.method === "POST",
      );
      expect(createCall).toBeDefined();
      const sentBody = createCall?.body as Record<string, unknown>;
      expect("inviteTiming" in sentBody).toBe(false);
      // The legacy openAt the coach chose is still sent.
      expect(typeof sentBody.openAt).toBe("string");
    });
  });

  it("autoSend=true: create POST body includes inviteTiming", async () => {
    await advanceToSchedule(true);

    const nameInput = screen.getByLabelText(/campaign name/i);
    fireEvent.change(nameInput, { target: { value: "Test Campaign" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const createBtn = await screen.findByRole("button", { name: /create & send/i });
    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      const createCall = fetchCalls.find(
        (c) => c.url.endsWith("/api/assessment-campaigns") && c.method === "POST",
      );
      expect(createCall).toBeDefined();
      expect((createCall?.body as Record<string, unknown>)?.inviteTiming).toBe(
        "IMMEDIATELY",
      );
    });
  });

  it("autoSend=true: sends selected participants in the create body and skips the DRAFT-only participants endpoint", async () => {
    await advanceToSchedule(true);

    const nameInput = screen.getByLabelText(/campaign name/i);
    fireEvent.change(nameInput, { target: { value: "Test Campaign" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const createBtn = await screen.findByRole("button", { name: /create & send/i });
    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => {
      const createCall = fetchCalls.find(
        (c) => c.url.endsWith("/api/assessment-campaigns") && c.method === "POST",
      );
      expect(createCall).toBeDefined();
      expect((createCall?.body as Record<string, unknown>)?.participantIds).toEqual([
        "resp-1",
      ]);
    });

    expect(
      fetchCalls.find((c) =>
        c.url.includes("/api/assessment-campaigns/camp-1/participants"),
      ),
    ).toBeUndefined();
  });
});
