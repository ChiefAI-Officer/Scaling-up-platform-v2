/**
 * Wave Q item #1 — "Pre-select for new campaigns" toggle in the
 * admin template editor (Metadata tab, Results Email card).
 *
 * - Renders ONLY when `waveQEnabled` (the write capability is flag-gated).
 * - Wired to an immediate PATCH `{ sendResultsDefault }` on the template row
 *   (NOT the Save Draft flow — this is a TEMPLATE-ROW field like
 *   invitationSubject, so it must stay editable even when the viewed version
 *   is published and the rest of the metadata surface is read-only).
 * - Hint copy: "New campaigns start with respondent results emails enabled."
 * - A 403 from the PATCH (wave flag off server-side) surfaces as a toast.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => "",
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_1/edit",
}));

const baseTemplate = {
  id: "tpl_1",
  name: "Rockefeller Habits Checklist",
  alias: "RockHabits",
  description: null,
  invitationSubject: "You're invited",
  invitationBodyMarkdown: "Hi {{respondentFirstName}}",
  resultsEmailSubject: null,
  resultsEmailBodyMarkdown: null,
  resultsEmailContentApproved: false,
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
  sendResultsDefault: false,
};

const draftVersion = {
  id: "ver_1",
  versionNumber: 1,
  language: "en-US",
  publishedAt: null,
  contentHash: "abcdef0123456789",
  questions: [],
  sections: [],
  scoringConfig: {},
  reportConfig: null,
};

const publishedVersion = {
  ...draftVersion,
  publishedAt: "2026-05-05T00:00:00.000Z",
};

const allVersions = [
  {
    id: "ver_1",
    versionNumber: 1,
    language: "en-US",
    publishedAt: null,
    contentHash: "abcdef0123456789",
  },
];

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}
let fetchCalls: FetchCall[];
let patchStatus: number;

function installFetch() {
  fetchCalls = [];
  patchStatus = 200;
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
      return {
        ok: patchStatus >= 200 && patchStatus < 300,
        status: patchStatus,
        json: async () =>
          patchStatus === 403
            ? { success: false, error: "FORBIDDEN" }
            : { success: true },
      } as unknown as Response;
    },
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  toastMock.mockClear();
  installFetch();
});
afterEach(() => {
  jest.restoreAllMocks();
});

const TOGGLE_NAME = /pre-select for new campaigns/i;

describe("TemplateEditorTabbed — sendResultsDefault toggle gating", () => {
  it("is ABSENT when waveQEnabled is false (default)", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );
    expect(
      screen.queryByRole("switch", { name: TOGGLE_NAME }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /new campaigns start with respondent results emails enabled/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("renders with the hint copy when waveQEnabled", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
        waveQEnabled
      />,
    );
    expect(
      screen.getByRole("switch", { name: TOGGLE_NAME }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /new campaigns start with respondent results emails enabled\./i,
      ),
    ).toBeInTheDocument();
  });

  it("stays editable on a PUBLISHED version (template-row field, not version content)", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={publishedVersion}
        allVersions={allVersions}
        waveQEnabled
      />,
    );
    expect(screen.getByRole("switch", { name: TOGGLE_NAME })).not.toBeDisabled();
  });
});

describe("TemplateEditorTabbed — sendResultsDefault PATCH wiring", () => {
  it("clicking the toggle PATCHes exactly { sendResultsDefault: true } to the template row", async () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
        waveQEnabled
      />,
    );
    const toggle = screen.getByRole("switch", { name: TOGGLE_NAME });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);

    await waitFor(() => {
      const patch = fetchCalls.find((c) => c.method === "PATCH");
      expect(patch).toBeDefined();
      expect(patch!.url).toContain("/api/admin/assessment-templates/tpl_1");
      expect(patch!.body).toEqual({ sendResultsDefault: true });
    });
    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: TOGGLE_NAME }),
      ).toHaveAttribute("aria-checked", "true");
    });
  });

  it("PATCHes { sendResultsDefault: false } when toggling an ON default off", async () => {
    render(
      <TemplateEditorTabbed
        template={{ ...baseTemplate, sendResultsDefault: true }}
        version={draftVersion}
        allVersions={allVersions}
        waveQEnabled
      />,
    );
    const toggle = screen.getByRole("switch", { name: TOGGLE_NAME });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);

    await waitFor(() => {
      const patch = fetchCalls.find((c) => c.method === "PATCH");
      expect(patch).toBeDefined();
      expect(patch!.body).toEqual({ sendResultsDefault: false });
    });
  });

  it("surfaces a 403 as a destructive toast and keeps the toggle state", async () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
        waveQEnabled
      />,
    );
    patchStatus = 403;
    fireEvent.click(screen.getByRole("switch", { name: TOGGLE_NAME }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
    expect(
      screen.getByRole("switch", { name: TOGGLE_NAME }),
    ).toHaveAttribute("aria-checked", "false");
  });
});
