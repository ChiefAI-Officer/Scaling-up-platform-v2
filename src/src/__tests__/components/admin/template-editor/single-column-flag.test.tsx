/**
 * ED6 (spec 19ah), PR-A — WAVE_ED6 flag + 3-way Questions-body seam.
 *
 * Proves `TabbedShell`'s single conditional gains a THIRD arm that WINS over
 * the ED4 three-pane:
 *   - flag ON  ⇒ Questions body = <SingleColumnFormBuilder> (placeholder for
 *     PR-A); the tab is relabeled "Build" and becomes the DEFAULT landing tab;
 *     the Sections trigger is GONE; ?tab=sections resolves to the Build tab.
 *   - flag OFF (default) ⇒ byte-identical to today — Sections trigger present,
 *     default Metadata, and the ED4 three-pane behavior is unchanged (the ED3
 *     byte-equivalence guard + ED4 parity keep those transcripts pinned).
 *
 * Same harness as three-pane-flag.test.tsx (toast / next-navigation / genUid /
 * confirm mocks). Rendered through TemplateEditorTabbed (the
 * TemplateEditorController), so the flag rides `TabbedShellProps`.
 */

import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ── Mocks (mirror the byte-equivalence / three-pane-flag harness) ─────────
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

function baseProps(opts: {
  singleColumnEnabled?: boolean;
  threePaneEnabled?: boolean;
}) {
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
    ...(opts.threePaneEnabled === undefined
      ? {}
      : { threePaneEnabled: opts.threePaneEnabled }),
    ...(opts.singleColumnEnabled === undefined
      ? {}
      : { singleColumnEnabled: opts.singleColumnEnabled }),
  };
}

describe("ED6 PR-A — flag ON: single-column form builder pick", () => {
  it("mounts SingleColumnFormBuilder, relabels the tab 'Build', defaults to it, and drops Sections", () => {
    render(<TemplateEditorTabbed {...baseProps({ singleColumnEnabled: true })} />);

    // Body = the single-column builder placeholder.
    expect(screen.getByTestId("single-column-builder")).toBeInTheDocument();

    // Neither the legacy QuestionsTab body nor the three-pane workspace.
    expect(
      screen.queryByTestId("questions-section-nav"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("three-pane-workspace"),
    ).not.toBeInTheDocument();

    // Tab relabeled "Build" and it is the active (default) tab.
    const buildTab = screen.getByRole("tab", { name: "Build" });
    expect(buildTab).toHaveAttribute("data-state", "active");
    expect(screen.queryByRole("tab", { name: "Questions" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Edit" })).toBeNull();

    // Sections trigger is GONE (folded into the single-column builder).
    expect(screen.queryByRole("tab", { name: "Sections" })).toBeNull();
  });

  it("single-column WINS over three-pane (both flags on ⇒ Build, not Edit)", () => {
    render(
      <TemplateEditorTabbed
        {...baseProps({ singleColumnEnabled: true, threePaneEnabled: true })}
      />,
    );
    expect(screen.getByTestId("single-column-builder")).toBeInTheDocument();
    expect(
      screen.queryByTestId("three-pane-workspace"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Build" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.queryByRole("tab", { name: "Edit" })).toBeNull();
  });

  it("routes ?tab=sections to the Build (questions) tab", () => {
    mockSearchParams = new URLSearchParams("tab=sections");
    render(<TemplateEditorTabbed {...baseProps({ singleColumnEnabled: true })} />);

    expect(screen.getByRole("tab", { name: "Build" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("single-column-builder")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sections" })).toBeNull();
  });
});

describe("ED6 PR-A — flag OFF (default): unchanged", () => {
  it("keeps Sections + Questions, defaults to Metadata, no builder", () => {
    render(<TemplateEditorTabbed {...baseProps({})} />);

    expect(screen.getByRole("tab", { name: "Metadata" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("tab", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Questions" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Build" })).toBeNull();
    expect(
      screen.queryByTestId("single-column-builder"),
    ).not.toBeInTheDocument();
  });

  it("leaves the ED4 three-pane behavior unchanged when only threePane is on", () => {
    render(<TemplateEditorTabbed {...baseProps({ threePaneEnabled: true })} />);

    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("three-pane-workspace")).toBeInTheDocument();
    expect(
      screen.queryByTestId("single-column-builder"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Build" })).toBeNull();
  });
});
