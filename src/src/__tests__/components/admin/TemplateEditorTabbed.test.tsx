/**
 * F1 — TemplateEditorTabbed (Checkpoint 1a).
 *
 * Phase 1a of the wireframe rebuild (WF16/WF17/WF18). Smallest possible
 * standalone surface: persistent chrome (header + 7-tab nav + URL tab
 * persistence) with EMPTY tab panels. Tab content lands in F2+.
 *
 * Wireframe chrome verbatim from WF16 lines 700-900.
 */

import React from "react";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
  waitFor,
} from "@testing-library/react";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ────────────────────────────────────────────────────────────────────────
// Mocks
// ────────────────────────────────────────────────────────────────────────
const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const replaceMock = jest.fn();
const refreshMock = jest.fn();
const pushMock = jest.fn();

// URL search-params mock — overridable per test.
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: refreshMock }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_1/edit",
}));

// Stub window.confirm — jsdom doesn't implement it.
const originalConfirm = window.confirm;
beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterAll(() => {
  window.confirm = originalConfirm;
});

beforeEach(() => {
  toastMock.mockClear();
  replaceMock.mockClear();
  refreshMock.mockClear();
  pushMock.mockClear();
  (window.confirm as jest.Mock).mockClear?.();
  mockSearchParams = new URLSearchParams("");
});

afterEach(() => {
  cleanup();
});

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

// Canonical template / version props the editor receives from the page
// server component.
const baseTemplate = {
  id: "tpl_1",
  name: "Rockefeller Habits Checklist",
  alias: "RockHabits",
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
};

const draftVersion = {
  id: "ver_2",
  versionNumber: 2,
  language: "en-US",
  publishedAt: null,
  contentHash: "abcdef0123456789",
};

const publishedVersion = {
  id: "ver_1",
  versionNumber: 1,
  language: "en-US",
  publishedAt: "2026-05-05T00:00:00.000Z",
  contentHash: "abcdef0123456789",
};

const allVersions = [
  {
    id: "ver_1",
    versionNumber: 1,
    language: "en-US",
    publishedAt: "2026-05-05T00:00:00.000Z",
  },
  {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
  },
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────
describe("TemplateEditorTabbed — F1 chrome", () => {
  describe("tab nav", () => {
    it("renders all 7 tabs with exact labels from WF16", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      // Verbatim labels from WF16 lines 805-815.
      expect(screen.getByRole("tab", { name: /^Metadata$/ })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /^Sections$/ })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /^Questions$/ })).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: /Scoring & Tiers/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: /Conditional Logic/ }),
      ).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /^Access$/ })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /^Versions$/ })).toBeInTheDocument();
    });

    it("activates Metadata tab by default (no ?tab param)", () => {
      mockSearchParams = new URLSearchParams("");
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const metaTab = screen.getByRole("tab", { name: /^Metadata$/ });
      expect(metaTab).toHaveAttribute("aria-selected", "true");
    });

    it("respects ?tab=questions URL param and activates Questions tab", () => {
      mockSearchParams = new URLSearchParams("tab=questions");
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const questionsTab = screen.getByRole("tab", { name: /^Questions$/ });
      expect(questionsTab).toHaveAttribute("aria-selected", "true");
    });

    it("ignores ?tab=conditional — Conditional Logic stays inactive (disabled)", () => {
      mockSearchParams = new URLSearchParams("tab=conditional");
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const condTab = screen.getByRole("tab", { name: /Conditional Logic/ });
      expect(condTab).toHaveAttribute("aria-disabled", "true");
      expect(condTab).not.toHaveAttribute("aria-selected", "true");
      // Falls back to Metadata.
      const metaTab = screen.getByRole("tab", { name: /^Metadata$/ });
      expect(metaTab).toHaveAttribute("aria-selected", "true");
    });

    it("Conditional Logic tab shows v1.5 badge + tooltip from WF16", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const condTab = screen.getByRole("tab", { name: /Conditional Logic/ });
      expect(condTab).toHaveAttribute("aria-disabled", "true");
      // Badge text.
      expect(condTab.textContent).toMatch(/v1\.5/i);
      // WF16 tooltip text verbatim.
      expect(condTab).toHaveAttribute(
        "title",
        "Available in v1.5 — for v1, admins seed conditionalSections JSON via Prisma Studio",
      );
    });

    it("Access tab navigates to /admin/assessments/access-groups (renders <a>)", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      // It's a link, not a button — WF16 spec.
      const accessLink = screen.getByTestId("template-editor-access-link");
      expect(accessLink.tagName).toBe("A");
      expect(accessLink).toHaveAttribute(
        "href",
        "/admin/assessments/access-groups",
      );
    });

    it("clicking a tab updates the URL via router.replace (no history push)", async () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const sectionsTab = screen.getByRole("tab", { name: /^Sections$/ });
      // Radix Tabs activates on mousedown for non-keyboard activation.
      await act(async () => {
        fireEvent.mouseDown(sectionsTab);
        fireEvent.click(sectionsTab);
      });

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalled();
      });
      const lastCall = replaceMock.mock.calls[replaceMock.mock.calls.length - 1];
      expect(String(lastCall[0])).toContain("tab=sections");
    });
  });

  describe("header", () => {
    it("renders template name + draft version pill (amber) + caption", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      expect(
        screen.getByRole("heading", { name: /Rockefeller Habits Checklist/ }),
      ).toBeInTheDocument();
      // Draft pill verbatim from WF16 line 786: "v2 (draft)"
      const pill = screen.getByTestId("template-editor-version-pill");
      expect(pill.textContent).toMatch(/v2 \(draft\)/i);
    });

    it("renders published version pill (green) when isPublished", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={publishedVersion}
          allVersions={allVersions}
        />,
      );

      const pill = screen.getByTestId("template-editor-version-pill");
      expect(pill.textContent).toMatch(/v1 \(published\)/i);
    });

    it("Preview as Respondent button is disabled with v1.5 tooltip", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const btn = screen.getByRole("button", {
        name: /Preview as Respondent/,
      });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("title", "Coming in v1.5");
    });

    it("Save Draft button calls onSaveDraft callback", async () => {
      const onSaveDraft = jest.fn();
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
          onSaveDraft={onSaveDraft}
        />,
      );

      const btn = screen.getByRole("button", { name: /Save Draft/ });
      expect(btn).not.toBeDisabled();
      await act(async () => {
        fireEvent.click(btn);
      });
      expect(onSaveDraft).toHaveBeenCalled();
    });

    it("Publish button opens PublishFailureModal on 422 with issues[]", async () => {
      global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        if (method === "POST" && url.includes("/publish")) {
          return makeJsonResponse(
            {
              success: false,
              error: "PUBLISH_VALIDATION_FAILED",
              issues: [
                {
                  path: ["scoringConfig", "tiers", 0, "minMetric"],
                  code: "custom",
                  message: "Tier 0 must start at 0.",
                },
              ],
            },
            422,
          );
        }
        return makeJsonResponse({ success: true, data: {} });
      }) as unknown as typeof fetch;

      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const btn = screen.getByTestId("template-editor-publish-btn");
      await act(async () => {
        fireEvent.click(btn);
      });

      await waitFor(() => {
        expect(screen.getByTestId("publish-failure-modal")).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Tier 0 must start at 0\./),
      ).toBeInTheDocument();
    });
  });

  describe("published (read-only) mode", () => {
    it("disables Save Draft + Publish + renders read-only banner", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={publishedVersion}
          allVersions={allVersions}
        />,
      );

      expect(screen.getByRole("button", { name: /Save Draft/ })).toBeDisabled();
      expect(screen.getByTestId("template-editor-publish-btn")).toBeDisabled();
      expect(
        screen.getByText(/Published versions are read-only/i),
      ).toBeInTheDocument();
    });
  });

  describe("beforeunload guard", () => {
    it("registers beforeunload when a dirty flag is set; clears on unmount", () => {
      const addSpy = jest.spyOn(window, "addEventListener");
      const removeSpy = jest.spyOn(window, "removeEventListener");

      const { unmount } = render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
          initialDirtyFlags={{ metadata: true }}
        />,
      );

      const beforeunloadAdds = addSpy.mock.calls.filter(
        ([evt]) => evt === "beforeunload",
      );
      expect(beforeunloadAdds.length).toBeGreaterThan(0);

      unmount();

      const beforeunloadRemoves = removeSpy.mock.calls.filter(
        ([evt]) => evt === "beforeunload",
      );
      expect(beforeunloadRemoves.length).toBeGreaterThan(0);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
});
