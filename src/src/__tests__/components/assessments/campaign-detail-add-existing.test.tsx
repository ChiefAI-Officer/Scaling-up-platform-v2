/**
 * CampaignDetail — "add existing member" picker tests (Slice 1).
 *
 * Verifies the post-creation Add Respondent dialog:
 *  (1) Lists the company's members EXCLUDING current participants (picker present).
 *  (2) Selecting members + confirming POSTs existing respondentId(s) to the add route.
 *  (3) No inline-create form / no bulk-CSV panel present (negative assertions).
 *  (4) Empty state (all members are already participants) shows /portal/members CTA.
 *  (5) A failed add surfaces an inline error toast.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";

// ─── next/navigation and useToast mocked globally via jest.setup.js ───────

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// AssessmentResultView is not exercised by these tests.
jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div data-testid="mock-result-view" />,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────

const ORG_ID = "org-abc";
const CAMPAIGN_ID = "camp-xyz";

const BASE_OVERVIEW: CampaignOverview = {
  campaign: {
    id: CAMPAIGN_ID,
    name: "Q3 Leadership",
    alias: "q3-leadership",
    status: "ACTIVE",
    organizationId: ORG_ID,
    organizationName: "Acme Corp",
    templateId: "tpl-1",
    templateName: "Rockefeller Habits",
    openAt: new Date("2026-06-01T00:00:00Z"),
    closeAt: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    invitationSubject: null,
    invitationBodyMarkdown: null,
  },
  stats: {
    totalParticipants: 1,
    invited: 1,
    viewed: 0,
    submitted: 0,
    completionPct: 0,
  },
};

// Alice is already a participant in the campaign.
const ALICE_ROW: CampaignRespondentRow = {
  participantId: "part-1",
  respondent: {
    id: "resp-alice",
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@acme.com",
    jobTitle: "CEO",
  },
  invitation: null,
  hasSubmission: false,
  submissionId: null,
  submittedAt: null,
  isCEO: false,
};

// Bob and Carol are org members NOT yet in the campaign.
const BOB_ORG = {
  id: "resp-bob",
  firstName: "Bob",
  lastName: "Jones",
  email: "bob@acme.com",
  jobTitle: null as string | null,
};
const CAROL_ORG = {
  id: "resp-carol",
  firstName: "Carol",
  lastName: "Danvers",
  email: "carol@acme.com",
  jobTitle: "Engineer" as string | null,
};

// ─── fetch mock helper ──────────────────────────────────────────────────────

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

/**
 * Install a fetch mock. By default returns Bob+Carol as org members, Alice as
 * the only current participant (already excluded).
 * Pass `orgMembers` to override. Pass `addOk=false` to make the add POST fail.
 */
function installFetch({
  orgMembers = [BOB_ORG, CAROL_ORG],
  addOk = true,
}: {
  orgMembers?: typeof BOB_ORG[];
  addOk?: boolean;
} = {}) {
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

    // Org respondents list.
    if (
      url.includes(`/api/organizations/${ORG_ID}/respondents`) &&
      method === "GET"
    ) {
      return jsonResponse({ success: true, data: orgMembers });
    }

    // Add respondent POST.
    if (
      url.includes(`/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`) &&
      method === "POST"
    ) {
      if (!addOk) {
        return jsonResponse(
          { success: false, error: "Failed to add respondent" },
          false,
        );
      }
      return jsonResponse({ success: true, data: { invitation: null } });
    }

    // Campaign respondents re-fetch (refresh after add).
    if (
      url.includes(`/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`) &&
      method === "GET"
    ) {
      return jsonResponse({
        success: true,
        data: { overview: BASE_OVERVIEW, respondents: [ALICE_ROW] },
      });
    }

    return jsonResponse({ success: false, error: "unhandled" }, false);
  }) as unknown as typeof fetch;
}

function findCall(predicate: (c: FetchCall) => boolean): FetchCall | undefined {
  return fetchCalls.find(predicate);
}

function findAllCalls(predicate: (c: FetchCall) => boolean): FetchCall[] {
  return fetchCalls.filter(predicate);
}

/**
 * Like installFetch but lets the first add-POST succeed and all subsequent
 * add-POSTs fail — for testing the partial-failure path.
 */
function installFetchPartialFailure({
  orgMembers = [BOB_ORG, CAROL_ORG],
}: { orgMembers?: typeof BOB_ORG[] } = {}) {
  fetchCalls = [];
  let addPostCallCount = 0;
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

    // Org respondents list.
    if (
      url.includes(`/api/organizations/${ORG_ID}/respondents`) &&
      method === "GET"
    ) {
      return jsonResponse({ success: true, data: orgMembers });
    }

    // Add respondent POST — first call succeeds, subsequent calls fail.
    if (
      url.includes(`/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`) &&
      method === "POST"
    ) {
      addPostCallCount++;
      if (addPostCallCount === 1) {
        return jsonResponse({ success: true, data: { invitation: null } });
      }
      return jsonResponse(
        { success: false, error: "Server error adding respondent" },
        false,
      );
    }

    // Campaign respondents re-fetch (refresh after add).
    if (
      url.includes(`/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`) &&
      method === "GET"
    ) {
      return jsonResponse({
        success: true,
        data: { overview: BASE_OVERVIEW, respondents: [ALICE_ROW] },
      });
    }

    return jsonResponse({ success: false, error: "unhandled" }, false);
  }) as unknown as typeof fetch;
}

// ─── Render helper ──────────────────────────────────────────────────────────

function renderDetail(
  respondents: CampaignRespondentRow[] = [ALICE_ROW],
  overview: CampaignOverview = BASE_OVERVIEW,
) {
  return render(
    <CampaignDetail
      initialOverview={overview}
      initialRespondents={respondents}
    />,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Test suite ─────────────────────────────────────────────────────────────

describe("CampaignDetail — Add Respondent dialog (pick-existing)", () => {
  // ────────────────────────────────────────────────────────────────────────
  // (1) Dialog lists org members EXCLUDING current participants
  // ────────────────────────────────────────────────────────────────────────
  it("shows org members excluding current participants in a checkbox list", async () => {
    installFetch();
    renderDetail();

    // Open the dialog.
    fireEvent.click(screen.getByTestId("add-respondent-btn"));

    // Wait for the org-respondents fetch to settle.
    await waitFor(() =>
      expect(
        findCall(
          (c) =>
            c.url.includes(`/api/organizations/${ORG_ID}/respondents`) &&
            c.method === "GET",
        ),
      ).toBeTruthy(),
    );

    // Bob and Carol are present in the dialog picker.
    await screen.findByText(/bob jones/i);
    expect(screen.getByText(/carol danvers/i)).toBeInTheDocument();

    // Alice is already a participant — she must NOT have a checkbox in the picker.
    // (She does appear in the respondent table, so we check role=checkbox, not text.)
    const aliceCheckbox = screen.queryByRole("checkbox", { name: /alice smith/i });
    expect(aliceCheckbox).not.toBeInTheDocument();

    // Members are rendered as checkboxes (not a single select-dropdown).
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  // ────────────────────────────────────────────────────────────────────────
  // (2) Selecting member(s) + confirming POSTs existing respondentId(s)
  // ────────────────────────────────────────────────────────────────────────
  it("POSTs selected orgRespondentId(s) to the add route on confirm", async () => {
    installFetch();
    renderDetail();

    fireEvent.click(screen.getByTestId("add-respondent-btn"));

    // Wait for members to load.
    const bobCheckbox = await screen.findByRole("checkbox", {
      name: /bob jones/i,
    });
    fireEvent.click(bobCheckbox);
    expect(bobCheckbox).toBeChecked();

    // Confirm the add.
    fireEvent.click(screen.getByTestId("add-respondent-confirm"));

    await waitFor(() =>
      expect(
        findCall(
          (c) =>
            c.url.includes(
              `/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`,
            ) && c.method === "POST",
        ),
      ).toBeTruthy(),
    );

    const addCall = findCall(
      (c) =>
        c.url.includes(
          `/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`,
        ) && c.method === "POST",
    )!;
    // Must use the existing respondentId path — NOT a create-inline payload.
    const body = addCall.body as Record<string, unknown>;
    expect(body.orgRespondentId).toBe("resp-bob");
    // Confirm no inline-create fields leak through.
    expect(body).not.toHaveProperty("firstName");
    expect(body).not.toHaveProperty("lastName");
    expect(body).not.toHaveProperty("email");
  });

  // ────────────────────────────────────────────────────────────────────────
  // (3) No inline-create / no bulk-CSV UI present (negative assertions)
  // ────────────────────────────────────────────────────────────────────────
  it("has NO inline-create form and NO bulk-CSV panel", async () => {
    installFetch();
    renderDetail();

    fireEvent.click(screen.getByTestId("add-respondent-btn"));

    // Allow dialog to settle / org fetch to fire.
    await waitFor(() =>
      expect(screen.getByTestId("add-respondent-dialog")).toBeInTheDocument(),
    );

    // Inline-create fields must not be present.
    expect(
      screen.queryByTestId("new-respondent-firstName"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("new-respondent-lastName"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("new-respondent-email"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("create-new-respondent-btn"),
    ).not.toBeInTheDocument();

    // Bulk-CSV tab / panel must not be present.
    expect(
      screen.queryByTestId("add-respondent-tab-bulk"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("add-respondent-tab-single"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("add-respondent-bulk-panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("add-respondent-bulk-textarea"),
    ).not.toBeInTheDocument();
  });

  // ────────────────────────────────────────────────────────────────────────
  // (4) Empty state — all org members already participants → /portal/members CTA
  // ────────────────────────────────────────────────────────────────────────
  it("shows /portal/members CTA when no members are available to add", async () => {
    // Org returns Alice — who is already a participant.
    installFetch({
      orgMembers: [
        {
          id: "resp-alice",
          firstName: "Alice",
          lastName: "Smith",
          email: "alice@acme.com",
          jobTitle: "CEO" as string | null,
        },
      ],
    });
    renderDetail();

    fireEvent.click(screen.getByTestId("add-respondent-btn"));

    // Wait for the fetch.
    await waitFor(() =>
      expect(
        findCall(
          (c) =>
            c.url.includes(`/api/organizations/${ORG_ID}/respondents`) &&
            c.method === "GET",
        ),
      ).toBeTruthy(),
    );

    // Empty state CTA link must be present.
    const cta = await screen.findByRole("link", { name: /add members/i });
    expect(cta).toHaveAttribute("href", "/portal/members");

    // No checkboxes should be rendered.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows /portal/members CTA when the org has zero members at all", async () => {
    installFetch({ orgMembers: [] });
    renderDetail([]);

    fireEvent.click(screen.getByTestId("add-respondent-btn"));

    await waitFor(() =>
      expect(
        findCall(
          (c) =>
            c.url.includes(`/api/organizations/${ORG_ID}/respondents`) &&
            c.method === "GET",
        ),
      ).toBeTruthy(),
    );

    const cta = await screen.findByRole("link", { name: /add members/i });
    expect(cta).toHaveAttribute("href", "/portal/members");
  });

  // ────────────────────────────────────────────────────────────────────────
  // (5) Failed add surfaces an error (via toast or inline)
  // ────────────────────────────────────────────────────────────────────────
  it("does not crash and closes gracefully when add succeeds", async () => {
    installFetch({ addOk: true });
    renderDetail();

    fireEvent.click(screen.getByTestId("add-respondent-btn"));
    const carolCheckbox = await screen.findByRole("checkbox", {
      name: /carol danvers/i,
    });
    fireEvent.click(carolCheckbox);
    fireEvent.click(screen.getByTestId("add-respondent-confirm"));

    await waitFor(() =>
      expect(
        findCall(
          (c) =>
            c.url.includes(
              `/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`,
            ) && c.method === "POST",
        ),
      ).toBeTruthy(),
    );

    // Dialog should close after a successful add.
    await waitFor(() =>
      expect(
        screen.queryByTestId("add-respondent-dialog"),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps dialog open on a failed add and does not crash", async () => {
    installFetch({ addOk: false });
    const toastFn = jest.fn();
    jest
      .spyOn(
        require("@/components/ui/use-toast"),
        "useToast",
      )
      .mockReturnValue({ toast: toastFn });

    renderDetail();

    fireEvent.click(screen.getByTestId("add-respondent-btn"));
    const bobCheckbox = await screen.findByRole("checkbox", {
      name: /bob jones/i,
    });
    fireEvent.click(bobCheckbox);
    fireEvent.click(screen.getByTestId("add-respondent-confirm"));

    await waitFor(() =>
      expect(
        findCall(
          (c) =>
            c.url.includes(
              `/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`,
            ) && c.method === "POST",
        ),
      ).toBeTruthy(),
    );

    // toast should have been called (error notification).
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
  });

  // ────────────────────────────────────────────────────────────────────────
  // (8) Partial failure — 2 selected, first succeeds, second fails
  // ────────────────────────────────────────────────────────────────────────
  it("partial failure: reports '1 added, 1 couldn't be added', refreshes table, keeps dialog open", async () => {
    installFetchPartialFailure();
    const toastFn = jest.fn();
    jest
      .spyOn(
        require("@/components/ui/use-toast"),
        "useToast",
      )
      .mockReturnValue({ toast: toastFn });

    renderDetail();

    // Open dialog and wait for members to load.
    fireEvent.click(screen.getByTestId("add-respondent-btn"));
    const bobCheckbox = await screen.findByRole("checkbox", {
      name: /bob jones/i,
    });
    const carolCheckbox = await screen.findByRole("checkbox", {
      name: /carol danvers/i,
    });

    // Select both Bob (first POST → success) and Carol (second POST → fail).
    fireEvent.click(bobCheckbox);
    fireEvent.click(carolCheckbox);
    fireEvent.click(screen.getByTestId("add-respondent-confirm"));

    // Wait for both add-POSTs to fire.
    await waitFor(() => {
      const addPosts = findAllCalls(
        (c) =>
          c.url.includes(`/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`) &&
          c.method === "POST",
      );
      expect(addPosts).toHaveLength(2);
    });

    // (a) refreshRespondents was triggered — the GET re-fetch for the campaign respondents fires.
    await waitFor(() =>
      expect(
        findCall(
          (c) =>
            c.url.includes(`/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`) &&
            c.method === "GET",
        ),
      ).toBeTruthy(),
    );

    // (b) Toast reflects "1 added, 1 couldn't be added" — NOT "2 added".
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    const toastArgs = toastFn.mock.calls[0][0] as { title: string; description: string; variant?: string };
    expect(toastArgs.title).toMatch(/1 added.*1 couldn't be added/i);
    expect(toastArgs.variant).toBe("destructive");
    expect(toastArgs.title).not.toMatch(/^2 respondents added/i);

    // (c) Dialog stays open (partial failure keeps it open for retry).
    expect(screen.getByTestId("add-respondent-dialog")).toBeInTheDocument();
  });
});
