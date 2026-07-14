/**
 * ED4 (spec 19af §3.1/§3.2), Task 3 — WAVE_ED4 flag + Questions-body
 * workspace pick.
 *
 * Proves the ONE conditional `TabbedShell` gains:
 *   - flag ON  ⇒ Questions body = <ThreePaneWorkspace>; the tab is relabeled
 *     "Edit" and becomes the DEFAULT landing tab.
 *   - flag OFF (default) ⇒ Questions body = <QuestionsTab>; the tab stays
 *     "Questions" and the default landing tab stays Metadata (byte-identical
 *     to today — the ED3 byte-equivalence guard keeps the transcript pinned).
 *
 * Same harness as editor-byte-equivalence.test.tsx (toast / next-navigation /
 * genUid / confirm mocks). Rendered through TemplateEditorTabbed (the
 * TemplateEditorController), so the flag rides `TabbedShellProps`.
 */

import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ── Mocks (mirror the byte-equivalence harness) ──────────────────────────
const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const replaceMock = jest.fn();
const refreshMock = jest.fn();
const pushMock = jest.fn();
const PATHNAME = "/admin/assessments/templates/tpl_1/versions/ver_2/edit";
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: refreshMock,
  }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => PATHNAME,
}));

let mockUidCounter = 0;
jest.mock(
  "@/components/admin/template-editor/sections-serialization",
  () => {
    const actual = jest.requireActual(
      "@/components/admin/template-editor/sections-serialization",
    );
    return {
      ...actual,
      genUid: jest.fn(() => `uid-${++mockUidCounter}`),
    };
  },
);

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
  mockSearchParams = new URLSearchParams("");
  mockUidCounter = 0;
});
afterEach(() => cleanup());

// ── Fixture: one section, one slider question, every editor flag ON ──────
const allVersionsMeta = [
  {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
    contentHash: "abcdef012345",
  },
];

function baseProps(threePaneEnabled: boolean | undefined) {
  return {
    template: {
      id: "tpl_1",
      name: "Alpha Template",
      alias: "ALPHA",
      aggregationMode: "FULL_VISIBILITY" as const,
      accessMode: "INVITED" as const,
    },
    version: {
      id: "ver_2",
      versionNumber: 2,
      language: "en-US",
      publishedAt: null,
      contentHash: "abcdef012345",
      sections: [{ stableKey: "S1", name: "Section One" }],
      questions: [
        {
          stableKey: "S1_q1",
          sectionStableKey: "S1",
          label: "Q1 label",
          type: "SLIDER_LIKERT",
          isRequired: true,
          sortOrder: 1,
          scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: allVersionsMeta,
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    waveQEnabled: true,
    questionEditorUnlocked: true,
    findingsEnabled: true,
    conditionalAuthoringEnabled: true,
    testModeEnabled: true,
    safeToPublishEnabled: true,
    ...(threePaneEnabled === undefined ? {} : { threePaneEnabled }),
  };
}

describe("ED4 T3 — flag ON: three-pane workspace pick", () => {
  it("renders ThreePaneWorkspace in the Questions body, relabels the tab 'Edit', and defaults to it", () => {
    render(<TemplateEditorTabbed {...baseProps(true)} />);

    // Body = the workspace (the real EditorOutline (T4) + the real
    // QuestionCanvas (T5) + the reused inspector). Nothing is focused on the
    // initial flag-ON mount (three-pane preserves focus, no mount-reset), so the
    // canvas shows its empty state.
    expect(screen.getByTestId("three-pane-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("editor-outline")).toBeInTheDocument();
    expect(
      screen.getByTestId("question-canvas-empty"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("questions-config-form")).toBeInTheDocument();

    // The legacy QuestionsTab body is NOT rendered.
    expect(screen.queryByTestId("questions-section-nav")).not.toBeInTheDocument();

    // Tab relabeled "Edit" and it is the active (default) tab.
    const editTab = screen.getByRole("tab", { name: "Edit" });
    expect(editTab).toHaveAttribute("data-state", "active");
    expect(screen.queryByRole("tab", { name: "Questions" })).toBeNull();
  });
});

describe("ED4 T3 — flag OFF (default): unchanged QuestionsTab", () => {
  it("keeps the tab labeled 'Questions' and defaults to Metadata", () => {
    render(<TemplateEditorTabbed {...baseProps(undefined)} />);

    expect(screen.getByRole("tab", { name: "Metadata" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("tab", { name: "Questions" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Edit" })).toBeNull();
    expect(screen.queryByTestId("three-pane-workspace")).not.toBeInTheDocument();
  });

  it("renders the legacy QuestionsTab body (not the workspace) when the Questions tab is active", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(<TemplateEditorTabbed {...baseProps(false)} />);

    expect(screen.getByTestId("questions-section-nav")).toBeInTheDocument();
    expect(screen.queryByTestId("three-pane-workspace")).not.toBeInTheDocument();
  });
});
