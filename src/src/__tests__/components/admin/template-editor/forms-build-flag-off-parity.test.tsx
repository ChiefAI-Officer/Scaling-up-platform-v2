/**
 * ED9 Task 11 (spec 19al-plan) — flag-gating parity for the Google-Forms
 * `FormsBuilder` Build body + the single-mode header-title hide (decision D1).
 *
 * Proves the ONE seam T11 adds to `TabbedShell`:
 *   - flag ON  (`formsBuildEnabled`) + single mode ⇒ the Build panel renders
 *     <FormsBuilder> (data-testid="forms-builder"), NOT the ED6
 *     <SingleColumnFormBuilder>, AND the page-header <h2 class="wf-page-title">
 *     is suppressed (the FormHeaderCard hero owns the title).
 *   - flag OFF (default) + single mode ⇒ byte-identical to today's ED6:
 *     <SingleColumnFormBuilder> renders, no <FormsBuilder>, and the
 *     <h2 class="wf-page-title"> with the template name is PRESENT.
 *   - three-pane mode + flag ON ⇒ the header <h2> stays (the flag ONLY
 *     affects single mode; the hero card exists only in FormsBuilder).
 *
 * The header conditional is flag-gated by design: it MUST NOT key off
 * `activeAuthoringMode === "single"` alone — that would strip the h2 from
 * today's flag-OFF ED6 single mode and break the goldens + byte-identity.
 *
 * Harness mirrors single-column-flag.test.tsx (toast / next-navigation /
 * genUid / confirm mocks), rendered through TemplateEditorTabbed (the
 * controller), so the flag rides `TabbedShellProps`.
 */

import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ── Mocks (mirror the single-column-flag harness) ─────────────────────────
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
  formsBuildEnabled?: boolean;
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
    ...(opts.formsBuildEnabled === undefined
      ? {}
      : { formsBuildEnabled: opts.formsBuildEnabled }),
  };
}

describe("ED9 T11 — flag ON: FormsBuilder + hidden header title (single mode)", () => {
  it("renders FormsBuilder, drops SingleColumnFormBuilder, hides the wf-page-title h2", () => {
    const { container } = render(
      <TemplateEditorTabbed
        {...baseProps({ singleColumnEnabled: true, formsBuildEnabled: true })}
      />,
    );

    // Body = the ED9 Google-Forms builder.
    expect(screen.getByTestId("forms-builder")).toBeInTheDocument();
    // NOT the ED6 single-column builder.
    expect(
      screen.queryByTestId("single-column-builder"),
    ).not.toBeInTheDocument();

    // The page-header <h2 class="wf-page-title"> is suppressed (hero owns it).
    expect(container.querySelector("h2.wf-page-title")).toBeNull();

    // Still the "Build" tab, still single mode chrome.
    expect(screen.getByRole("tab", { name: "Build" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.queryByRole("tab", { name: "Sections" })).toBeNull();
  });
});

describe("ED9 T11 — flag OFF (default): unchanged ED6 single mode", () => {
  it("renders SingleColumnFormBuilder, no FormsBuilder, keeps the wf-page-title h2", () => {
    const { container } = render(
      <TemplateEditorTabbed
        {...baseProps({ singleColumnEnabled: true, formsBuildEnabled: false })}
      />,
    );

    expect(screen.getByTestId("single-column-builder")).toBeInTheDocument();
    expect(screen.queryByTestId("forms-builder")).not.toBeInTheDocument();

    const h2 = container.querySelector("h2.wf-page-title");
    expect(h2).not.toBeNull();
    expect(h2).toHaveTextContent("Alpha Template");
  });

  it("omitted formsBuildEnabled behaves like flag OFF", () => {
    const { container } = render(
      <TemplateEditorTabbed {...baseProps({ singleColumnEnabled: true })} />,
    );

    expect(screen.getByTestId("single-column-builder")).toBeInTheDocument();
    expect(screen.queryByTestId("forms-builder")).not.toBeInTheDocument();
    expect(container.querySelector("h2.wf-page-title")).not.toBeNull();
  });
});

describe("ED9 T11 — flag ON only affects single mode", () => {
  it("three-pane + formsBuildEnabled keeps the wf-page-title h2 (no FormsBuilder)", () => {
    const { container } = render(
      <TemplateEditorTabbed
        {...baseProps({ threePaneEnabled: true, formsBuildEnabled: true })}
      />,
    );

    // Three-pane workspace (not single) — the flag is a no-op here.
    expect(screen.getByTestId("three-pane-workspace")).toBeInTheDocument();
    expect(screen.queryByTestId("forms-builder")).not.toBeInTheDocument();

    const h2 = container.querySelector("h2.wf-page-title");
    expect(h2).not.toBeNull();
    expect(h2).toHaveTextContent("Alpha Template");
  });
});
