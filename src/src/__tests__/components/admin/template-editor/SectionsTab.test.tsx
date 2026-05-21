/**
 * F2b — SectionsTab (Checkpoint 1b).
 *
 * Tests written FIRST per TDD discipline. The standalone Sections tab
 * re-mounts the SectionsCard component full-width on its own tab. State
 * is shared with the Metadata tab's right-column SectionsCard (single
 * sectionsDirty flag in TemplateEditorTabbed).
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
  mockSearchParams = new URLSearchParams("tab=sections");
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
  description: "Description",
  invitationSubject: "subject",
  invitationBodyMarkdown: "body",
  resultsEmailSubject: null as string | null,
  resultsEmailBodyMarkdown: null as string | null,
  resultsEmailContentApproved: false,
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
};

const sectionsFixture = [
  { stableKey: "S1", name: "Section 1 — Strategy", description: "" },
  { stableKey: "S2", name: "Section 2 — Execution", description: "" },
];

const questionsFixture = [
  { stableKey: "Q1", sectionStableKey: "S1", label: "Q1 label" },
  { stableKey: "Q2", sectionStableKey: "S2", label: "Q2 label" },
];

const draftVersion = {
  id: "ver_2",
  versionNumber: 2,
  language: "en-US",
  publishedAt: null,
  contentHash: "abcdef",
  questions: questionsFixture,
  sections: sectionsFixture,
  scoringConfig: { tierMetric: "overallAvg", passThreshold: 3, tiers: [] },
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
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
  },
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────
describe("SectionsTab — F2b (Checkpoint 1b)", () => {
  it("renders the same section list as the Metadata tab — full-width on its own tab", () => {
    mockSearchParams = new URLSearchParams("tab=sections");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const panel = screen.getByTestId("tab-panel-sections");
    // Both fixture sections render inside the Sections tab panel — names
    // live inside inline-editable inputs.
    expect(
      within(panel).getByDisplayValue("Section 1 — Strategy"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByDisplayValue("Section 2 — Execution"),
    ).toBeInTheDocument();
  });

  it("shows + Add Section button + footer caption per WF16", () => {
    mockSearchParams = new URLSearchParams("tab=sections");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const panel = screen.getByTestId("tab-panel-sections");
    expect(
      within(panel).getByRole("button", { name: /^\+ Add Section$/ }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/stableKey is auto-generated/i),
    ).toBeInTheDocument();
  });

  it("+ Add Section appends a new row with auto-generated stableKey", () => {
    mockSearchParams = new URLSearchParams("tab=sections");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const panel = screen.getByTestId("tab-panel-sections");
    const addBtn = within(panel).getByRole("button", {
      name: /^\+ Add Section$/,
    });

    act(() => {
      fireEvent.click(addBtn);
    });

    // After add, title should show (3) and a new stableKey row exists.
    expect(within(panel).getByText(/Sections \(3\)/)).toBeInTheDocument();
    // S3 stableKey rendered (auto-numbered by index)
    expect(within(panel).getByText(/^S3$/)).toBeInTheDocument();
  });

  it("clicking the up/down arrows reorders sections", () => {
    mockSearchParams = new URLSearchParams("tab=sections");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const panel = screen.getByTestId("tab-panel-sections");
    const s2Input = within(panel).getByDisplayValue("Section 2 — Execution");
    const s2Row = s2Input.closest("li") as HTMLElement;
    expect(s2Row).toBeTruthy();
    const moveUp = within(s2Row).getByRole("button", { name: /Move up/i });
    act(() => {
      fireEvent.click(moveUp);
    });

    // After reorder, dirty flag should flip; Save Draft enabled.
    const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
    expect(saveBtn).not.toBeDisabled();
  });

  it("delete confirmation removes a section", () => {
    mockSearchParams = new URLSearchParams("tab=sections");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const panel = screen.getByTestId("tab-panel-sections");
    const s2Input = within(panel).getByDisplayValue("Section 2 — Execution");
    const s2Row = s2Input.closest("li") as HTMLElement;
    const deleteBtn = within(s2Row).getByRole("button", { name: /Delete/i });
    act(() => {
      fireEvent.click(deleteBtn);
    });

    // S2 removed; count drops to 1.
    expect(within(panel).getByText(/Sections \(1\)/)).toBeInTheDocument();
    expect(
      within(panel).queryByDisplayValue("Section 2 — Execution"),
    ).toBeNull();
  });

  it("editing section name on SectionsTab updates the same state slice as Metadata tab", () => {
    mockSearchParams = new URLSearchParams("tab=sections");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const panel = screen.getByTestId("tab-panel-sections");
    // Each section row has an inline editable input with the section name
    const input = within(panel).getByDisplayValue(
      /Section 1 — Strategy/,
    );
    act(() => {
      fireEvent.change(input, { target: { value: "Renamed S1" } });
    });

    // Save Draft enabled = sections dirty
    const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
    expect(saveBtn).not.toBeDisabled();
  });

  it("read-only mode disables all section interactions when version is published", () => {
    mockSearchParams = new URLSearchParams("tab=sections");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={publishedVersion}
        allVersions={allVersions}
      />,
    );

    const panel = screen.getByTestId("tab-panel-sections");
    expect(
      within(panel).getByRole("button", { name: /^\+ Add Section$/ }),
    ).toBeDisabled();
    // Inputs disabled
    const input = within(panel).getByDisplayValue("Section 1 — Strategy");
    expect(input).toBeDisabled();
    // Delete buttons disabled
    const s2Input = within(panel).getByDisplayValue("Section 2 — Execution");
    const s2Row = s2Input.closest("li") as HTMLElement;
    const deleteBtn = within(s2Row).getByRole("button", { name: /Delete/i });
    expect(deleteBtn).toBeDisabled();
  });

  it("sections edited via Sections tab persist via version PATCH on Save Draft", async () => {
    mockSearchParams = new URLSearchParams("tab=sections");
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

    const panel = screen.getByTestId("tab-panel-sections");
    const input = within(panel).getByDisplayValue(
      /Section 1 — Strategy/,
    );
    act(() => {
      fireEvent.change(input, { target: { value: "Renamed S1" } });
    });

    const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      const calls = (fetchMock as unknown as jest.Mock).mock.calls;
      const urls = calls.map((c: unknown[]) => String(c[0]));
      expect(
        urls.some(
          (u: string) =>
            u.includes("/versions/ver_2") && !u.includes("/publish"),
        ),
      ).toBe(true);
    });
  });
});
