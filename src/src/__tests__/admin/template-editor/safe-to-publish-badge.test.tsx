/**
 * Wave ED2 (spec 19ad) — SafeToPublishBadge unit tests.
 *
 * Fixture shapes reused from two places, per the task instructions:
 *   - the QuestionDraftRow / SectionDraft prop shapes come from
 *     test-mode-drawer.test.tsx (the Wave 1 badge sibling);
 *   - the "real publish blocker" scoring fixtures (section/slider/text/tier
 *     helpers + the non-tiling global-tier version) come from
 *     publish-readiness.test.ts, so this exercises the SAME publish-only
 *     failure the badge is meant to mirror (C1).
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SafeToPublishBadge } from "@/components/admin/template-editor/SafeToPublishBadge";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

// ── Raw scoring-shape fixtures (copied from publish-readiness.test.ts) ────

const section = (stableKey: string, name: string, sortOrder = 1) => ({
  stableKey,
  sortOrder,
  name,
});

const slider = (
  stableKey: string,
  opts: { min?: number; max?: number; step?: number; section?: string } = {},
) => ({
  stableKey,
  sortOrder: 1,
  type: "SLIDER_LIKERT" as const,
  label: stableKey,
  sectionStableKey: opts.section ?? "S1",
  isRequired: true,
  scale: {
    min: opts.min ?? 0,
    max: opts.max ?? 3,
    step: opts.step ?? 1,
    anchorMin: "low",
    anchorMax: "high",
  },
});

const text = (stableKey: string, sectionKey = "S1") => ({
  stableKey,
  sortOrder: 2,
  type: "TEXT" as const,
  label: stableKey,
  sectionStableKey: sectionKey,
  isRequired: false,
});

const tier = (minMetric: number, maxMetric: number | undefined, label: string) => ({
  minMetric,
  ...(maxMetric === undefined ? {} : { maxMetric }),
  label,
  message: `${label} message`,
});

const rawSections = [section("S1", "One")];
const rawQuestions = [slider("Q1"), slider("Q2", { section: "S1" }), text("T1")].map(
  (q, i) => ({ ...q, sortOrder: i + 1 }),
);
/** 2 sliders (0-3) → countAchieved integer domain [0, 2]; these tiers tile it fully. */
const validScoringConfig = {
  tierMetric: "countAchieved" as const,
  passThreshold: 2,
  tiers: [tier(0, 1, "Low"), tier(2, 2, "High")],
};
/** Same domain, but the tiers stop at 1 instead of tiling [0, 2] — a real publish blocker. */
const nonTilingScoringConfig = {
  ...validScoringConfig,
  tiers: [tier(0, 1, "Only")],
};

// ── QuestionDraftRow / SectionDraft fixtures (shape copied from
//    test-mode-drawer.test.tsx) — mirror rawQuestions/rawSections exactly so
//    the dirty (reserialize) path reproduces the SAME clean, publishable
//    version as the raw pass-through path. ─────────────────────────────────

const draftSections: SectionDraft[] = [
  { uid: "u-s1", stableKey: "S1", name: "One", sortOrder: 1 } as unknown as SectionDraft,
];
const draftQuestions: QuestionDraftRow[] = [
  {
    uid: "u-q1", stableKey: "Q1", sectionStableKey: "S1", label: "Q1", helpText: "",
    type: "SLIDER_LIKERT", isRequired: true, sortOrder: 1, isNewToDraft: false, isInherited: false,
    scaleMin: 0, scaleMax: 3, scaleStep: 1, anchorMin: "low", anchorMax: "high",
    options: [], findingBands: [], findingOptionTexts: {}, showIf: null,
  } as unknown as QuestionDraftRow,
  {
    uid: "u-q2", stableKey: "Q2", sectionStableKey: "S1", label: "Q2", helpText: "",
    type: "SLIDER_LIKERT", isRequired: true, sortOrder: 2, isNewToDraft: false, isInherited: false,
    scaleMin: 0, scaleMax: 3, scaleStep: 1, anchorMin: "low", anchorMax: "high",
    options: [], findingBands: [], findingOptionTexts: {}, showIf: null,
  } as unknown as QuestionDraftRow,
  {
    uid: "u-t1", stableKey: "T1", sectionStableKey: "S1", label: "T1", helpText: "",
    type: "TEXT", isRequired: false, sortOrder: 3, isNewToDraft: false, isInherited: false,
    scaleMin: 0, scaleMax: 0, scaleStep: 1, anchorMin: "", anchorMax: "",
    options: [], findingBands: [], findingOptionTexts: {}, showIf: null,
  } as unknown as QuestionDraftRow,
];

/** A MULTI_CHOICE question with zero options — forces buildQuestionsPayload
 *  to throw QuestionSerializationError("MULTI_CHOICE_NO_OPTIONS") when dirty,
 *  exercising the badge's soft-fail path (never crash the editor). */
const throwingQuestions: QuestionDraftRow[] = [
  {
    uid: "u-mc1", stableKey: "S1_mc1", sectionStableKey: "S1", label: "Pick one", helpText: "",
    type: "MULTI_CHOICE", isRequired: true, sortOrder: 1, isNewToDraft: false, isInherited: false,
    scaleMin: 0, scaleMax: 0, scaleStep: 1, anchorMin: "", anchorMax: "",
    options: [], findingBands: [], findingOptionTexts: {}, showIf: null,
  } as unknown as QuestionDraftRow,
];

const baseProps = {
  questions: [] as unknown as QuestionDraftRow[],
  sections: [] as unknown as SectionDraft[],
  rawQuestions,
  rawSections,
  scoringConfig: validScoringConfig,
  publishedKeys: new Set<string>(),
  publishedOptionKeys: {},
  dirty: { questions: false, sections: false },
  isDirty: false,
};

describe("SafeToPublishBadge", () => {
  it("clean, publishable draft + isDirty=false → 'ready to publish'", () => {
    render(<SafeToPublishBadge {...baseProps} />);
    expect(screen.getByTestId("safe-to-publish-badge")).toHaveTextContent(/ready to publish/i);
  });

  it("C2: same clean draft but isDirty=true (dirty.questions=true, reserialize path) → " +
    "never plain 'Ready' — shows 'ready after save'", () => {
    render(
      <SafeToPublishBadge
        {...baseProps}
        questions={draftQuestions}
        sections={draftSections}
        dirty={{ questions: true, sections: true }}
        isDirty={true}
      />,
    );
    const badge = screen.getByTestId("safe-to-publish-badge");
    expect(badge).toHaveTextContent(/ready after save/i);
    expect(badge).not.toHaveTextContent(/^ready$/i);
  });

  it("a real publish blocker (non-tiling global tiers) → badge shows a blocker; " +
    "clicking expands the panel and lists the issue", () => {
    render(<SafeToPublishBadge {...baseProps} scoringConfig={nonTilingScoringConfig} />);
    const badge = screen.getByTestId("safe-to-publish-badge");
    expect(badge).toHaveTextContent(/blocker/i);

    expect(screen.queryByTestId("safe-to-publish-panel")).not.toBeInTheDocument();
    fireEvent.click(badge);
    const panel = screen.getByTestId("safe-to-publish-panel");
    expect(panel).toBeInTheDocument();

    const preventGroup = within(panel).getByTestId("stp-prevent");
    expect(preventGroup.querySelectorAll("li").length).toBeGreaterThan(0);
    // The issue path routes through scoringConfig.tiers — same gate as the
    // server (checkGlobalTierTiling), rendered via the shared formatIssuePath.
    expect(within(preventGroup).getByText(/scoringConfig/)).toBeInTheDocument();
  });

  it("soft-fail: an assembly error (buildVersionScoringPayload throws) never crashes " +
    "render — it becomes a Prevent-class note", () => {
    expect(() =>
      render(
        <SafeToPublishBadge
          {...baseProps}
          questions={throwingQuestions}
          rawQuestions={[]}
          dirty={{ questions: true, sections: false }}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByTestId("safe-to-publish-badge")).toHaveTextContent(/blocker/i);
  });
});
