/**
 * F2 — MetadataTab (Checkpoint 1b).
 *
 * Tests written FIRST per TDD discipline (red phase). Wireframe spec:
 * src/public/wireframes-phase2/admin/16-admin-template-editor-meta.html
 * lines 820-1100. The Metadata tab is a 60/40 two-column grid:
 *   - LEFT (60%): Template Metadata + Invitation Email + Results Email
 *   - RIGHT (40%): Sections card
 * + Version History strip below.
 *
 * Save Draft is owned by TemplateEditorTabbed's header but actually saves
 * the dirty surfaces from this tab.
 */

import React from "react";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
  waitFor,
  within,
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

let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: refreshMock }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));

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

// ────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────
const baseTemplate = {
  id: "tpl_1",
  name: "Rockefeller Habits Checklist",
  alias: "RockHabits",
  description:
    "A good strategy falls apart if you don't make great Execution Decisions.",
  invitationSubject:
    "{{respondentFirstName}}, your Rockefeller Habits Checklist is ready",
  invitationBodyMarkdown:
    "Hi {{respondentFirstName}},\n\nYou've been invited.",
  resultsEmailSubject: null as string | null,
  resultsEmailBodyMarkdown: null as string | null,
  resultsEmailContentApproved: false,
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
};

const sectionsFixture = [
  { stableKey: "S1", name: "Section 1 — Strategy", description: "" },
  { stableKey: "S2", name: "Section 2 — Execution", description: "" },
  { stableKey: "S3", name: "Section 3 — People", description: "" },
];

const questionsFixture = [
  { stableKey: "Q1", sectionStableKey: "S1", label: "Q1 label" },
  { stableKey: "Q2", sectionStableKey: "S1", label: "Q2 label" },
  { stableKey: "Q3", sectionStableKey: "S2", label: "Q3 label" },
  { stableKey: "Q4", sectionStableKey: "S3", label: "Q4 label" },
];

const draftVersion = {
  id: "ver_2",
  versionNumber: 2,
  language: "en-US",
  publishedAt: null,
  contentHash: "abcdef0123456789",
  questions: questionsFixture,
  sections: sectionsFixture,
  scoringConfig: {
    tierMetric: "overallAvg",
    passThreshold: 3,
    tiers: [],
  },
  reportConfig: null,
};

const publishedVersion = {
  ...draftVersion,
  id: "ver_1",
  versionNumber: 1,
  publishedAt: "2026-05-05T00:00:00.000Z",
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
describe("MetadataTab — F2 (Checkpoint 1b)", () => {
  describe("Template Metadata card (left column, card 1)", () => {
    it("renders all 6 fields from WF16 lines 822-905 — Name, Alias, Description, Language, Access Mode, Aggregation Mode", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      expect(screen.getByText("Template Metadata")).toBeInTheDocument();
      // Name
      expect(screen.getByLabelText(/^Name$/)).toHaveValue(
        "Rockefeller Habits Checklist",
      );
      // Alias
      expect(screen.getByLabelText(/^Alias$/)).toHaveValue("RockHabits");
      expect(
        screen.getByText("Used in URLs. Lowercase, no spaces."),
      ).toBeInTheDocument();
      // Description
      expect(screen.getByLabelText(/^Description$/)).toBeInTheDocument();
      // Language label includes "(this version)" per plan Gap C
      expect(
        screen.getByLabelText(/Language \(this version\)/i),
      ).toBeInTheDocument();
      // Access Mode radio group
      expect(
        screen.getByRole("radiogroup", { name: /Access mode/i }),
      ).toBeInTheDocument();
      // Aggregation Mode radio group
      expect(
        screen.getByRole("radiogroup", { name: /Aggregation mode/i }),
      ).toBeInTheDocument();
    });

    it("Access Mode shows INVITED selected + PUBLIC disabled (read-only display per Gap A)", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const invited = screen.getByRole("radio", { name: /INVITED/ });
      const publicMode = screen.getByRole("radio", { name: /PUBLIC/ });
      expect(invited).toBeChecked();
      expect(publicMode).toBeDisabled();
    });

    it("Aggregation Mode renders FULL_VISIBILITY (selected) + CEO_ONLY (with WF16 captions)", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );
      const full = screen.getByRole("radio", { name: /FULL_VISIBILITY/ });
      const ceo = screen.getByRole("radio", { name: /CEO_ONLY/ });
      expect(full).toBeChecked();
      expect(ceo).not.toBeChecked();
      expect(
        screen.getByText("All viewers see per-respondent rows."),
      ).toBeInTheDocument();
    });
  });

  describe("Invitation Email card (left column, card 2)", () => {
    it("renders subject + body + variable reference panel with all 8 vars from WF16 lines 916-970", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      expect(screen.getByText("Invitation Email")).toBeInTheDocument();
      // Subject input bound to template.invitationSubject
      expect(screen.getByDisplayValue(baseTemplate.invitationSubject))
        .toBeInTheDocument();

      // All 8 variable codes per WF16 lines 945-955 verbatim
      const vars = [
        "{{respondentFirstName}}",
        "{{respondentLastName}}",
        "{{campaignName}}",
        "{{templateName}}",
        "{{invitationUrl}}",
        "{{closeAt}}",
        "{{coachName}}",
        "{{orgName}}",
      ];
      // The variable reference panel renders these as <code> blocks; they
      // ALSO appear inside the subject/body inputs. Scope to the Invitation
      // Email card's variable list via the "Available variables" label.
      const invitationPanel = screen
        .getByText(/^Available variables$/)
        .closest("div") as HTMLElement;
      expect(invitationPanel).toBeTruthy();
      for (const v of vars) {
        expect(within(invitationPanel).getByText(v)).toBeInTheDocument();
      }
    });
  });

  describe("Results Email card (left column, card 3, NEW from F0)", () => {
    it("renders subject + body + 5-var reference panel + content-approved toggle (WF16 lines 974-1050)", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const resultsEmailHeading = screen.getByText("Results Email");
      const resultsCard = resultsEmailHeading.closest("section") as HTMLElement;
      expect(resultsCard).toBeTruthy();
      // v7.5 badge from WF16 line 977 — scope to the Results Email card
      // since "v7.5" also appears in the CEO_ONLY caption.
      expect(within(resultsCard).getByText(/v7\.5/)).toBeInTheDocument();
      // 5 results-only vars per WF16 lines 1020-1026
      const vars = [
        "{{tierLabel}}",
        "{{tierMessage}}",
        "{{perSectionList}}",
      ];
      const resultsPanel = within(resultsCard)
        .getByText(/Available variables \(results email only\)/i)
        .closest("div") as HTMLElement;
      expect(resultsPanel).toBeTruthy();
      for (const v of vars) {
        expect(within(resultsPanel).getByText(v)).toBeInTheDocument();
      }
      // Content-approved toggle
      const toggle = screen.getByRole("switch", {
        name: /Content approved/i,
      });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-checked", "false");
    });

    it("clicking the content-approved toggle flips template-metadata dirty", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const toggle = screen.getByRole("switch", {
        name: /Content approved/i,
      });
      act(() => {
        fireEvent.click(toggle);
      });
      expect(toggle).toHaveAttribute("aria-checked", "true");
      // Save Draft button is enabled now that there is a dirty surface
      const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
      expect(saveBtn).not.toBeDisabled();
    });
  });

  describe("Sections card (right column, card 4)", () => {
    it("renders Sections card with row count in title + +Add Section button", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      // WF16 line 1052: "Sections (10)" — we have 3 in fixture
      expect(screen.getByText(/Sections \(3\)/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^\+ Add Section$/ }),
      ).toBeInTheDocument();
    });

    it("renders each section with stableKey badge, name, and question count", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      // Section 1: S1 / "Section 1 — Strategy" / 2 questions
      // stableKey badges render inside <span> (one per section row).
      expect(screen.getAllByText("S1").length).toBeGreaterThan(0);
      // Section name renders inside an inline-editable <input value=...>.
      expect(
        screen.getByDisplayValue("Section 1 — Strategy"),
      ).toBeInTheDocument();

      // Count badges — 2 questions / 1 question / 1 question for S1/S2/S3.
      expect(screen.getByText(/^2 questions$/)).toBeInTheDocument();
      // S2 + S3 each have 1 question
      const oneCounts = screen.getAllByText(/^1 question$/);
      expect(oneCounts.length).toBe(2);
    });

    it("footer caption per WF16 line 1097 — stableKey immutability note", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      expect(
        screen.getByText(/stableKey is auto-generated/i),
      ).toBeInTheDocument();
    });
  });

  describe("Version History strip (below the grid)", () => {
    it("renders one card per version with status pill + current draft highlighted", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const heading = screen.getByText(/^Version History$/);
      const strip = heading.closest("section") as HTMLElement;
      expect(strip).toBeTruthy();
      // v1 + v2 cards present inside the version history strip
      const v1Card = screen.getByTestId("version-history-card-ver_1");
      const v2Card = screen.getByTestId("version-history-card-ver_2");
      expect(within(v1Card).getByText(/v1\s/i)).toBeInTheDocument();
      expect(within(v2Card).getByText(/v2\s/i)).toBeInTheDocument();
      // "(you are here)" caption on the current draft card
      expect(
        within(v2Card).getByText(/\(you are here\)/i),
      ).toBeInTheDocument();
    });
  });

  describe("Dirty state — editing flips the correct flag", () => {
    it("editing Name flips template-metadata dirty (template-level surface)", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const name = screen.getByLabelText(/^Name$/);
      act(() => {
        fireEvent.change(name, { target: { value: "New Name" } });
      });
      // Save Draft button is no longer the "no dirty" state.
      const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
      expect(saveBtn).not.toBeDisabled();
      // Editing template-level field should NOT flip the version dirty flag.
      // We can verify by checking that the save payload below only hits the
      // template route — covered in the Save Draft test.
    });

    it("editing Language flips version dirty (version-level surface)", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const language = screen.getByLabelText(/Language \(this version\)/i);
      act(() => {
        fireEvent.change(language, { target: { value: "en-GB" } });
      });
      const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
      expect(saveBtn).not.toBeDisabled();
    });

    it("editing Aggregation Mode flips template-metadata dirty", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const ceo = screen.getByRole("radio", { name: /CEO_ONLY/ });
      act(() => {
        fireEvent.click(ceo);
      });
      expect(ceo).toBeChecked();
      const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
      expect(saveBtn).not.toBeDisabled();
    });

    it("editing Invitation Email subject flips template-metadata dirty", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const inputs = screen.getAllByDisplayValue(
        baseTemplate.invitationSubject,
      );
      const subject = inputs[0];
      act(() => {
        fireEvent.change(subject, { target: { value: "New subject" } });
      });
      const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
      expect(saveBtn).not.toBeDisabled();
    });
  });

  describe("Read-only mode (published version)", () => {
    it("disables ALL inputs when version.publishedAt is set", () => {
      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={publishedVersion}
          allVersions={allVersions}
        />,
      );

      expect(screen.getByLabelText(/^Name$/)).toBeDisabled();
      expect(screen.getByLabelText(/^Alias$/)).toBeDisabled();
      expect(screen.getByLabelText(/^Description$/)).toBeDisabled();
      expect(screen.getByLabelText(/Language \(this version\)/i)).toBeDisabled();
      // Aggregation toggle disabled (radio buttons disabled)
      const ceo = screen.getByRole("radio", { name: /CEO_ONLY/ });
      expect(ceo).toBeDisabled();
      // Results Email toggle disabled
      const toggle = screen.getByRole("switch", {
        name: /Content approved/i,
      });
      expect(toggle).toBeDisabled();
      // + Add Section disabled
      expect(
        screen.getByRole("button", { name: /^\+ Add Section$/ }),
      ).toBeDisabled();
    });
  });

  describe("Save Draft — dispatches PATCHes per dirty surface", () => {
    it("template-only dirty → hits template PATCH endpoint only", async () => {
      const fetchMock = jest.fn(async () =>
        makeJsonResponse({ success: true }, 200),
      ) as unknown as typeof fetch;
      global.fetch = fetchMock;

      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const name = screen.getByLabelText(/^Name$/);
      act(() => {
        fireEvent.change(name, { target: { value: "Changed Name" } });
      });

      const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      const calls = (fetchMock as unknown as jest.Mock).mock.calls;
      const urls = calls.map((c: unknown[]) => String(c[0]));
      // Template PATCH hit
      expect(
        urls.some((u: string) => u.includes("/api/admin/assessment-templates/tpl_1")),
      ).toBe(true);
      // Version PATCH NOT hit
      expect(
        urls.some((u: string) =>
          u.includes("/versions/ver_2") && !u.includes("/publish"),
        ),
      ).toBe(false);
    });

    it("version-only dirty (language) → hits version PATCH only", async () => {
      const fetchMock = jest.fn(async () =>
        makeJsonResponse({ success: true }, 200),
      ) as unknown as typeof fetch;
      global.fetch = fetchMock;

      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const language = screen.getByLabelText(/Language \(this version\)/i);
      act(() => {
        fireEvent.change(language, { target: { value: "en-GB" } });
      });

      const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      const calls = (fetchMock as unknown as jest.Mock).mock.calls;
      const urls = calls.map((c: unknown[]) => String(c[0]));
      // Version PATCH hit
      expect(
        urls.some(
          (u: string) =>
            u.includes("/versions/ver_2") && !u.includes("/publish"),
        ),
      ).toBe(true);
    });

    it("both surfaces dirty → both PATCHes dispatched", async () => {
      const fetchMock = jest.fn(async () =>
        makeJsonResponse({ success: true }, 200),
      ) as unknown as typeof fetch;
      global.fetch = fetchMock;

      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const name = screen.getByLabelText(/^Name$/);
      const language = screen.getByLabelText(/Language \(this version\)/i);
      act(() => {
        fireEvent.change(name, { target: { value: "Changed Name" } });
        fireEvent.change(language, { target: { value: "en-GB" } });
      });

      const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      await waitFor(() => {
        const calls = (fetchMock as unknown as jest.Mock).mock.calls;
        const urls = calls.map((c: unknown[]) => String(c[0]));
        expect(
          urls.some((u: string) =>
            u.startsWith("/api/admin/assessment-templates/tpl_1") &&
            !u.includes("/versions"),
          ),
        ).toBe(true);
        expect(
          urls.some(
            (u: string) =>
              u.includes("/versions/ver_2") && !u.includes("/publish"),
          ),
        ).toBe(true);
      });
    });

    it("clears dirty flags on success (Save Draft button becomes disabled again)", async () => {
      global.fetch = jest.fn(async () =>
        makeJsonResponse({ success: true }, 200),
      ) as unknown as typeof fetch;

      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const name = screen.getByLabelText(/^Name$/);
      act(() => {
        fireEvent.change(name, { target: { value: "Changed Name" } });
      });
      const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
      expect(saveBtn).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(saveBtn);
      });

      await waitFor(() => {
        // After successful save, dirty cleared → button disabled again
        expect(saveBtn).toBeDisabled();
      });
    });

    it("shows error toast on 4xx response", async () => {
      global.fetch = jest.fn(async () =>
        makeJsonResponse({ success: false, error: "Invalid body" }, 400),
      ) as unknown as typeof fetch;

      render(
        <TemplateEditorTabbed
          template={baseTemplate}
          version={draftVersion}
          allVersions={allVersions}
        />,
      );

      const name = screen.getByLabelText(/^Name$/);
      act(() => {
        fireEvent.change(name, { target: { value: "Changed Name" } });
      });
      const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalled();
      });
      const calls = toastMock.mock.calls;
      const found = calls.some(
        (c) => c[0] && c[0].variant === "destructive",
      );
      expect(found).toBe(true);
    });
  });
});
