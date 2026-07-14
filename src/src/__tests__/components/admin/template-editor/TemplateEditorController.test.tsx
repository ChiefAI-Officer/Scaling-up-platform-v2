/**
 * TemplateEditorController — ED5 (spec 19ag), Task 4: auto-focus first
 * question once on mount (audit A-1, "cold empty landing").
 *
 * Before this fix, flag-ON always landed on an empty canvas + empty
 * inspector (`focusedQuestionUid` starts `null` and nothing set it). This
 * suite proves the new mount-once effect in `TemplateEditorController.tsx`:
 *   1. flag-ON + questions present ⇒ the first section's first question (by
 *      canonical array order, then `sortOrder` within the section) is
 *      focused after mount — asserted via the rendered `QuestionCanvas`.
 *   2. flag-OFF ⇒ the effect performs ZERO work (spied `resetSelection`
 *      call count stays 0), matching the frozen `editor-byte-equivalence`
 *      guard's flag-OFF byte-identity.
 *   3. Mount-once persistence: once a later user action changes focus, a
 *      subsequent re-render of the SAME controller instance does not
 *      re-invoke the effect (empty deps) — proving a later "already
 *      focused" state can never be clobbered. (The `focusedQuestionUid !==
 *      null` guard that would fire on a genuinely pre-seeded mount is not
 *      independently exercised — `useEditorSelection()` takes no seed
 *      argument — but is source-verified: see the guard clause in
 *      `TemplateEditorController.tsx`.)
 *
 * Same harness (toast / next-navigation / genUid / confirm mocks) as
 * `three-pane-flag.test.tsx` and the ED3 byte-equivalence guard.
 */

import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TemplateEditorController } from "@/components/admin/template-editor/TemplateEditorController";

// ── Mocks (mirror the byte-equivalence / three-pane-flag harness) ───────
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

// Spy on `resetSelection` (wrapping the real implementation) so we can prove
// exactly how many times — and with what args — the mount-once effect calls
// it, independent of any observable UI signal.
const resetSelectionSpy = jest.fn();
jest.mock(
  "@/components/admin/template-editor/hooks/useEditorSelection",
  () => {
    const actual = jest.requireActual(
      "@/components/admin/template-editor/hooks/useEditorSelection",
    );
    return {
      ...actual,
      useEditorSelection: (...args: unknown[]) => {
        const real = actual.useEditorSelection(...args);
        return {
          ...real,
          resetSelection: (
            section: string | null,
            focus: string | null,
          ) => {
            resetSelectionSpy(section, focus);
            return real.resetSelection(section, focus);
          },
        };
      },
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
  resetSelectionSpy.mockClear();
  mockSearchParams = new URLSearchParams("");
  mockUidCounter = 0;
});
afterEach(() => cleanup());

// ── Fixture: two sections. S1 carries two questions whose JSON array order
// is DELIBERATELY the reverse of their `sortOrder`, so "first by canonical
// order" only passes if the effect sorts by `sortOrder` (not raw array
// position). S2 carries a question too, to prove section array-order (not
// alphabetic/other) picks S1.
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
      sections: [
        { stableKey: "S1", name: "Section One" },
        { stableKey: "S2", name: "Section Two" },
      ],
      questions: [
        // Appears FIRST in the array but has the HIGHER sortOrder.
        {
          stableKey: "S1_zulu",
          sectionStableKey: "S1",
          label: "Zulu Question",
          type: "TEXT",
          isRequired: false,
          sortOrder: 2,
        },
        // Appears SECOND in the array but has the LOWER sortOrder — this is
        // the one that should be auto-focused.
        {
          stableKey: "S1_alpha",
          sectionStableKey: "S1",
          label: "Alpha Question",
          type: "TEXT",
          isRequired: false,
          sortOrder: 1,
        },
        {
          stableKey: "S2_q1",
          sectionStableKey: "S2",
          label: "Section Two Question",
          type: "TEXT",
          isRequired: false,
          sortOrder: 1,
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

describe("ED5 T4 — auto-focus first question once on mount (A-1)", () => {
  it("flag-ON: focuses the first section's first question by sortOrder (not raw array order)", () => {
    render(<TemplateEditorController {...baseProps(true)} />);

    // Observable UI signal: the canvas renders the focused question, not
    // its empty state.
    expect(screen.queryByTestId("question-canvas-empty")).not.toBeInTheDocument();
    const canvas = screen.getByTestId("question-canvas");
    expect(canvas).toHaveTextContent("Alpha Question");
    expect(canvas).not.toHaveTextContent("Zulu Question");

    // The outline row for the auto-focused question is marked focused.
    expect(screen.getByTestId("outline-focus-S1_alpha")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Exactly one resetSelection call, resolving to S1 + a real (non-null)
    // question uid — the exact synthetic uid isn't asserted here (hook call
    // order across the composed model is an implementation detail); the
    // canvas/outline assertions above already prove it resolves to the
    // Alpha Question specifically.
    expect(resetSelectionSpy).toHaveBeenCalledTimes(1);
    const [calledSection, calledUid] = resetSelectionSpy.mock.calls[0];
    expect(calledSection).toBe("S1");
    expect(typeof calledUid).toBe("string");
    expect(calledUid).not.toBe("");
  });

  it("flag-OFF: performs zero work — resetSelection is never called on mount (Metadata is the default tab, Edit/Questions body isn't even mounted)", () => {
    render(<TemplateEditorController {...baseProps(false)} />);

    // Default tab stays Metadata (byte-identical to pre-ED5); neither the
    // legacy QuestionsTab nor ThreePaneWorkspace is mounted, so the ONLY
    // thing that could have called resetSelection is this new effect.
    expect(screen.getByRole("tab", { name: "Metadata" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.queryByTestId("three-pane-workspace")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tab-panel-questions")).not.toBeInTheDocument();
    expect(resetSelectionSpy).not.toHaveBeenCalled();
  });

  it("does not clobber a focus set after mount — the effect fires exactly once for the life of the controller instance", () => {
    const { rerender } = render(<TemplateEditorController {...baseProps(true)} />);

    // Auto-focused to Alpha Question on mount.
    expect(screen.getByTestId("question-canvas")).toHaveTextContent(
      "Alpha Question",
    );
    expect(resetSelectionSpy).toHaveBeenCalledTimes(1);

    // User manually focuses a different question via the outline.
    fireEvent.click(screen.getByTestId("outline-focus-S1_zulu"));
    expect(screen.getByTestId("question-canvas")).toHaveTextContent(
      "Zulu Question",
    );

    // Re-render the SAME controller instance (not remounted — same position
    // in the tree, no key change) with a fresh (but equivalent) props
    // object, simulating a parent re-render unrelated to focus.
    rerender(<TemplateEditorController {...baseProps(true)} />);

    // Still Zulu Question — the mount-once effect (empty deps) did not
    // re-fire and reset focus back to Alpha Question, and resetSelection
    // was not called again.
    expect(screen.getByTestId("question-canvas")).toHaveTextContent(
      "Zulu Question",
    );
    expect(resetSelectionSpy).toHaveBeenCalledTimes(1);
  });
});
