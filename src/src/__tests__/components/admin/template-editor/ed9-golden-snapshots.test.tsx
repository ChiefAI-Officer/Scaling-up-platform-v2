/**
 * ED9 Task 2 (spec 19al-plan) — golden `innerHTML` snapshots, captured at
 * HEAD, BEFORE the ED9 refactors (T3 command-layer extraction, T4
 * `QuestionSettings` sub-component split, T6 builder-controller extraction).
 *
 * ED9 golden net — these snapshots must stay byte-identical through the
 * T3/T4/T6 refactors; a diff here means a refactor changed rendered DOM.
 * Do NOT run -u to "fix" them. A diff means: stop, diff the HTML by hand,
 * and either revert the refactor step that changed markup or get explicit
 * sign-off that the DOM change is intentional (then re-snapshot in its own
 * reviewed commit — never silently alongside an unrelated refactor).
 *
 * This is NOT a behavior test. `editor-byte-equivalence.test.tsx` and
 * `three-pane-parity.test.tsx` already pin BEHAVIOR (request transcripts,
 * user-visible text/roles) through the flag-off legacy paths; this file
 * pins the exact rendered DOM of the bare `QuestionInspector` (the ED6/ED7
 * single-column surface these refactors will touch) for representative
 * question states, plus a minimal presence check that the single-column
 * builder shell still mounts.
 *
 * Render harness mirrors `single-column-inspector-bare.test.tsx` (bare
 * QuestionInspector, direct props) and `single-column-builder.test.tsx`
 * (TemplateEditorTabbed → SingleColumnFormBuilder, real model fixtures).
 */
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  QuestionInspector,
  type ShowIfGateOption,
} from "@/components/admin/template-editor/QuestionInspector";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

afterEach(() => cleanup());

// ── Bare QuestionInspector fixtures ────────────────────────────────────
function makeQuestion(
  overrides: Partial<QuestionDraftRow> = {},
): QuestionDraftRow {
  return {
    uid: "u1",
    stableKey: "S1_Q",
    sectionStableKey: "S1",
    label: "Sample label",
    helpText: "",
    isRequired: true,
    type: "SLIDER_LIKERT",
    sortOrder: 1,
    scaleMin: 0,
    scaleMax: 10,
    scaleStep: 1,
    anchorMin: "Low",
    anchorMax: "High",
    options: [],
    maxChoices: null,
    isInherited: false,
    isNewToDraft: true,
    findingBands: [],
    findingOptionTexts: {},
    showIf: null,
    ...overrides,
  };
}

interface RenderBareOptions {
  isReadOnly?: boolean;
  isUnlocked?: boolean;
  findingsEnabled?: boolean;
  conditionalEnabled?: boolean;
  showIfGates?: ShowIfGateOption[];
}

function renderBare(question: QuestionDraftRow, opts: RenderBareOptions = {}) {
  return render(
    <QuestionInspector
      question={question}
      isReadOnly={opts.isReadOnly ?? false}
      isUnlocked={opts.isUnlocked ?? true}
      findingsEnabled={opts.findingsEnabled ?? true}
      conditionalEnabled={opts.conditionalEnabled ?? true}
      showIfGates={opts.showIfGates ?? []}
      showIfDependents={[]}
      onClearDependents={() => {}}
      publishedOptionKeys={{}}
      onUpdate={() => {}}
      bare
    />,
  );
}

describe("ED9 golden snapshots — bare QuestionInspector (T2)", () => {
  it("1. SLIDER_LIKERT, unlocked, not inherited", () => {
    const { container } = renderBare(
      makeQuestion({
        uid: "u-slider-unlocked",
        stableKey: "S1_slider_confidence",
        label: "How confident are you in your leadership team?",
        helpText: "Rate honestly, 0-10.",
        anchorMin: "Not at all",
        anchorMax: "Completely",
      }),
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section class="space-y-4" data-testid="questions-config-form"><div class="space-y-1"><label class="wf-label" for="q-stablekey-u-slider-unlocked">stableKey</label><input id="q-stablekey-u-slider-unlocked" readonly="" class="wf-input" style="background: hsl(var(--muted) / 0.4);" type="text" value="S1_slider_confidence"><span class="block text-[0.6875rem] italic text-muted-foreground">Immutable across versions for longitudinal comparability.</span></div><div class="space-y-1"><label class="wf-label" for="q-type-u-slider-unlocked">Question Type</label><select id="q-type-u-slider-unlocked" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed"><option value="SLIDER_LIKERT">Slider</option><option value="TEXT">Short text</option><option value="NUMBER">Number</option><option value="MULTI_CHOICE">Multiple choice</option></select></div><div class="space-y-1"><label class="wf-label" for="q-label-u-slider-unlocked">Label</label><textarea id="q-label-u-slider-unlocked" rows="2" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed">How confident are you in your leadership team?</textarea></div><div class="space-y-1"><label class="wf-label" for="q-help-u-slider-unlocked">Help text</label><input id="q-help-u-slider-unlocked" placeholder="Optional helper text shown to respondents" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Rate honestly, 0-10."><span class="block text-[0.6875rem] italic text-muted-foreground">Optional. Rendered below the label on the respondent form.</span></div><div class="space-y-1"><span class="block text-xs font-medium text-foreground">Required</span><label class="flex items-center justify-between gap-2 px-2 py-2 rounded border border-border bg-muted/20 text-sm"><span class="text-foreground">Respondent must answer to submit</span><input aria-label="Required" class="w-4 h-4 disabled:opacity-60" type="checkbox" checked=""></label></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-2"><h4 class="text-xs font-semibold text-foreground">Slider settings</h4><div class="grid grid-cols-3 gap-2"><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-min-u-slider-unlocked">Scale min</label><input id="q-min-u-slider-unlocked" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="number" value="0"></div><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-max-u-slider-unlocked">Scale max</label><input id="q-max-u-slider-unlocked" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="number" value="10"></div><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-step-u-slider-unlocked">Scale step</label><input id="q-step-u-slider-unlocked" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="number" value="1"></div></div><div class="grid grid-cols-2 gap-2"><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-anchor-min-u-slider-unlocked">Label for the lowest point</label><input id="q-anchor-min-u-slider-unlocked" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Not at all"></div><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-anchor-max-u-slider-unlocked">Label for the highest point</label><input id="q-anchor-max-u-slider-unlocked" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Completely"></div></div><span class="block text-[0.6875rem] italic text-muted-foreground">Respondents pick a whole number between the min and max, moving in steps of the step size.</span></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-2" data-testid="q-findings-panel"><div class="flex items-center justify-between gap-2"><h4 class="text-xs font-semibold text-foreground">Findings</h4><button type="button" data-testid="q-findings-toggle" class="text-[0.6875rem] text-muted-foreground hover:text-foreground">Add</button></div><p class="text-[0.6875rem] italic text-muted-foreground">Report text shown when the answer falls in a score range.</p></div><div class="rounded-md border border-border bg-muted/10 p-3 space-y-2" data-testid="q-showif-panel"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2"><span class="text-xs font-medium text-foreground">Show only when…</span></div><button type="button" data-testid="q-showif-toggle" class="text-xs font-medium px-2 py-1 rounded text-foreground hover:bg-muted" aria-expanded="false">Configure</button></div></div></section>"`);
  });

  it("2. SLIDER_LIKERT, locked/inherited", () => {
    const { container } = renderBare(
      makeQuestion({
        uid: "u-slider-inherited",
        stableKey: "S1_slider_growth",
        label: "How would you rate your growth trajectory?",
        anchorMin: "Declining",
        anchorMax: "Accelerating",
        isInherited: true,
        isNewToDraft: false,
      }),
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section class="space-y-4" data-testid="questions-config-form"><div class="space-y-1"><label class="wf-label" for="q-stablekey-u-slider-inherited">stableKey</label><input id="q-stablekey-u-slider-inherited" readonly="" class="wf-input" style="background: hsl(var(--muted) / 0.4);" type="text" value="S1_slider_growth"><span class="block text-[0.6875rem] italic text-muted-foreground">Immutable across versions for longitudinal comparability.</span></div><div class="space-y-1"><label class="wf-label" for="q-type-u-slider-inherited">Question Type</label><select id="q-type-u-slider-inherited" disabled="" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed"><option value="SLIDER_LIKERT">Slider</option><option value="TEXT">Short text</option><option value="NUMBER">Number</option><option value="MULTI_CHOICE">Multiple choice</option></select><span class="block text-[0.6875rem] italic text-muted-foreground">Type is locked once published — a different type is a new question (delete + add).</span></div><div class="space-y-1"><label class="wf-label" for="q-label-u-slider-inherited">Label</label><textarea id="q-label-u-slider-inherited" rows="2" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed">How would you rate your growth trajectory?</textarea></div><div class="space-y-1"><label class="wf-label" for="q-help-u-slider-inherited">Help text</label><input id="q-help-u-slider-inherited" placeholder="Optional helper text shown to respondents" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value=""><span class="block text-[0.6875rem] italic text-muted-foreground">Optional. Rendered below the label on the respondent form.</span></div><div class="space-y-1"><span class="block text-xs font-medium text-foreground">Required</span><label class="flex items-center justify-between gap-2 px-2 py-2 rounded border border-border bg-muted/20 text-sm"><span class="text-foreground">Respondent must answer to submit</span><input aria-label="Required" class="w-4 h-4 disabled:opacity-60" type="checkbox" checked=""></label></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-2"><h4 class="text-xs font-semibold text-foreground">Slider settings</h4><div class="grid grid-cols-3 gap-2"><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-min-u-slider-inherited">Scale min</label><input id="q-min-u-slider-inherited" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="number" value="0"></div><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-max-u-slider-inherited">Scale max</label><input id="q-max-u-slider-inherited" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="number" value="10"></div><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-step-u-slider-inherited">Scale step</label><input id="q-step-u-slider-inherited" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="number" value="1"></div></div><div class="grid grid-cols-2 gap-2"><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-anchor-min-u-slider-inherited">Label for the lowest point</label><input id="q-anchor-min-u-slider-inherited" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Declining"></div><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-anchor-max-u-slider-inherited">Label for the highest point</label><input id="q-anchor-max-u-slider-inherited" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Accelerating"></div></div><span class="block text-[0.6875rem] italic text-muted-foreground">Respondents pick a whole number between the min and max, moving in steps of the step size.</span></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-2" data-testid="q-findings-panel"><div class="flex items-center justify-between gap-2"><h4 class="text-xs font-semibold text-foreground">Findings</h4><button type="button" data-testid="q-findings-toggle" class="text-[0.6875rem] text-muted-foreground hover:text-foreground">Add</button></div><p class="text-[0.6875rem] italic text-muted-foreground">Report text shown when the answer falls in a score range.</p></div><div class="rounded-md border border-border bg-muted/10 p-3 space-y-2" data-testid="q-showif-panel"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2"><span class="text-xs font-medium text-foreground">Show only when…</span></div><button type="button" data-testid="q-showif-toggle" class="text-xs font-medium px-2 py-1 rounded text-foreground hover:bg-muted" aria-expanded="false">Configure</button></div></div></section>"`);
  });

  it("3. MULTI_CHOICE with 3 options", () => {
    const { container } = renderBare(
      makeQuestion({
        uid: "u-multi-3opt",
        stableKey: "S2_obstacles",
        label: "Which of these is your biggest obstacle right now?",
        type: "MULTI_CHOICE",
        isRequired: false,
        maxChoices: 2,
        options: [
          { key: "K1", label: "Cash flow", isNew: false },
          { key: "K2", label: "Talent", isNew: false },
          { key: "K3", label: "Market fit", isNew: false },
        ],
      }),
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section class="space-y-4" data-testid="questions-config-form"><div class="space-y-1"><label class="wf-label" for="q-stablekey-u-multi-3opt">stableKey</label><input id="q-stablekey-u-multi-3opt" readonly="" class="wf-input" style="background: hsl(var(--muted) / 0.4);" type="text" value="S2_obstacles"><span class="block text-[0.6875rem] italic text-muted-foreground">Immutable across versions for longitudinal comparability.</span></div><div class="space-y-1"><label class="wf-label" for="q-type-u-multi-3opt">Question Type</label><select id="q-type-u-multi-3opt" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed"><option value="SLIDER_LIKERT">Slider</option><option value="TEXT">Short text</option><option value="NUMBER">Number</option><option value="MULTI_CHOICE">Multiple choice</option></select></div><div class="space-y-1"><label class="wf-label" for="q-label-u-multi-3opt">Label</label><textarea id="q-label-u-multi-3opt" rows="2" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed">Which of these is your biggest obstacle right now?</textarea></div><div class="space-y-1"><label class="wf-label" for="q-help-u-multi-3opt">Help text</label><input id="q-help-u-multi-3opt" placeholder="Optional helper text shown to respondents" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value=""><span class="block text-[0.6875rem] italic text-muted-foreground">Optional. Rendered below the label on the respondent form.</span></div><div class="space-y-1"><span class="block text-xs font-medium text-foreground">Required</span><label class="flex items-center justify-between gap-2 px-2 py-2 rounded border border-border bg-muted/20 text-sm"><span class="text-foreground">Respondent must answer to submit</span><input aria-label="Required" class="w-4 h-4 disabled:opacity-60" type="checkbox"></label></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-2" data-testid="multichoice-config"><h4 class="text-xs font-semibold text-foreground">Answer options</h4><ul class="space-y-1"><li class="flex items-center gap-2"><span class="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-mono rounded bg-muted text-muted-foreground whitespace-nowrap font-semibold">K1</span><input data-testid="q-option-label-0" aria-label="Option 1 label" class="wf-input flex-1 disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Cash flow"><button type="button" data-testid="q-option-remove-0" class="text-xs font-medium px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed">Remove</button></li><li class="flex items-center gap-2"><span class="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-mono rounded bg-muted text-muted-foreground whitespace-nowrap font-semibold">K2</span><input data-testid="q-option-label-1" aria-label="Option 2 label" class="wf-input flex-1 disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Talent"><button type="button" data-testid="q-option-remove-1" class="text-xs font-medium px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed">Remove</button></li><li class="flex items-center gap-2"><span class="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-mono rounded bg-muted text-muted-foreground whitespace-nowrap font-semibold">K3</span><input data-testid="q-option-label-2" aria-label="Option 3 label" class="wf-input flex-1 disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Market fit"><button type="button" data-testid="q-option-remove-2" class="text-xs font-medium px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed">Remove</button></li></ul><button type="button" data-testid="q-option-add" class="text-[0.6875rem] font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed">+ Add option</button><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-maxchoices-u-multi-3opt">Max choices</label><input id="q-maxchoices-u-multi-3opt" data-testid="q-maxchoices" min="1" style="width: 5rem;" class="px-2 py-1 text-sm border border-border rounded bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed" type="number" value="2"><span class="block text-[0.6875rem] italic text-muted-foreground">Blank = unlimited. Enforced live on the respondent form.</span></div></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-2" data-testid="q-findings-panel"><div class="flex items-center justify-between gap-2"><h4 class="text-xs font-semibold text-foreground">Findings</h4><button type="button" data-testid="q-findings-toggle" class="text-[0.6875rem] text-muted-foreground hover:text-foreground">Add</button></div><p class="text-[0.6875rem] italic text-muted-foreground">Report text shown when an option is selected.</p></div><div class="rounded-md border border-border bg-muted/10 p-3 space-y-2" data-testid="q-showif-panel"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2"><span class="text-xs font-medium text-foreground">Show only when…</span></div><button type="button" data-testid="q-showif-toggle" class="text-xs font-medium px-2 py-1 rounded text-foreground hover:bg-muted" aria-expanded="false">Configure</button></div></div></section>"`);
  });

  it("4. MULTI_CHOICE with a findings rule present", () => {
    const { container } = renderBare(
      makeQuestion({
        uid: "u-multi-findings",
        stableKey: "S2_obstacles_findings",
        label: "Which of these is your biggest obstacle right now?",
        type: "MULTI_CHOICE",
        isRequired: false,
        maxChoices: null,
        options: [
          { key: "K1", label: "Cash flow", isNew: false },
          { key: "K2", label: "Talent", isNew: false },
        ],
        findingOptionTexts: {
          K1: "Consider a 13-week cash-flow forecast review with your CFO.",
        },
      }),
      { findingsEnabled: true },
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section class="space-y-4" data-testid="questions-config-form"><div class="space-y-1"><label class="wf-label" for="q-stablekey-u-multi-findings">stableKey</label><input id="q-stablekey-u-multi-findings" readonly="" class="wf-input" style="background: hsl(var(--muted) / 0.4);" type="text" value="S2_obstacles_findings"><span class="block text-[0.6875rem] italic text-muted-foreground">Immutable across versions for longitudinal comparability.</span></div><div class="space-y-1"><label class="wf-label" for="q-type-u-multi-findings">Question Type</label><select id="q-type-u-multi-findings" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed"><option value="SLIDER_LIKERT">Slider</option><option value="TEXT">Short text</option><option value="NUMBER">Number</option><option value="MULTI_CHOICE">Multiple choice</option></select></div><div class="space-y-1"><label class="wf-label" for="q-label-u-multi-findings">Label</label><textarea id="q-label-u-multi-findings" rows="2" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed">Which of these is your biggest obstacle right now?</textarea></div><div class="space-y-1"><label class="wf-label" for="q-help-u-multi-findings">Help text</label><input id="q-help-u-multi-findings" placeholder="Optional helper text shown to respondents" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value=""><span class="block text-[0.6875rem] italic text-muted-foreground">Optional. Rendered below the label on the respondent form.</span></div><div class="space-y-1"><span class="block text-xs font-medium text-foreground">Required</span><label class="flex items-center justify-between gap-2 px-2 py-2 rounded border border-border bg-muted/20 text-sm"><span class="text-foreground">Respondent must answer to submit</span><input aria-label="Required" class="w-4 h-4 disabled:opacity-60" type="checkbox"></label></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-2" data-testid="multichoice-config"><h4 class="text-xs font-semibold text-foreground">Answer options</h4><ul class="space-y-1"><li class="flex items-center gap-2"><span class="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-mono rounded bg-muted text-muted-foreground whitespace-nowrap font-semibold">K1</span><input data-testid="q-option-label-0" aria-label="Option 1 label" class="wf-input flex-1 disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Cash flow"><button type="button" data-testid="q-option-remove-0" class="text-xs font-medium px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed">Remove</button></li><li class="flex items-center gap-2"><span class="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-mono rounded bg-muted text-muted-foreground whitespace-nowrap font-semibold">K2</span><input data-testid="q-option-label-1" aria-label="Option 2 label" class="wf-input flex-1 disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Talent"><button type="button" data-testid="q-option-remove-1" class="text-xs font-medium px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed">Remove</button></li></ul><button type="button" data-testid="q-option-add" class="text-[0.6875rem] font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed">+ Add option</button><div class="space-y-1"><label class="block text-[0.6875rem] font-medium text-foreground" for="q-maxchoices-u-multi-findings">Max choices</label><input id="q-maxchoices-u-multi-findings" data-testid="q-maxchoices" min="1" style="width: 5rem;" class="px-2 py-1 text-sm border border-border rounded bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed" type="number" value=""><span class="block text-[0.6875rem] italic text-muted-foreground">Blank = unlimited. Enforced live on the respondent form.</span></div></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-2" data-testid="q-findings-panel"><div class="flex items-center justify-between gap-2"><h4 class="text-xs font-semibold text-foreground">Findings (1)</h4><button type="button" data-testid="q-findings-toggle" class="text-[0.6875rem] text-muted-foreground hover:text-foreground">Edit</button></div><p class="text-[0.6875rem] italic text-muted-foreground">Report text shown when an option is selected.</p></div><div class="rounded-md border border-border bg-muted/10 p-3 space-y-2" data-testid="q-showif-panel"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2"><span class="text-xs font-medium text-foreground">Show only when…</span></div><button type="button" data-testid="q-showif-toggle" class="text-xs font-medium px-2 py-1 rounded text-foreground hover:bg-muted" aria-expanded="false">Configure</button></div></div></section>"`);
  });

  it("5. NUMBER", () => {
    const { container } = renderBare(
      makeQuestion({
        uid: "u-number",
        stableKey: "S3_revenue",
        label: "What was your trailing-twelve-month revenue?",
        type: "NUMBER",
        isRequired: false,
        helpText: "Enter annual revenue in USD.",
      }),
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section class="space-y-4" data-testid="questions-config-form"><div class="space-y-1"><label class="wf-label" for="q-stablekey-u-number">stableKey</label><input id="q-stablekey-u-number" readonly="" class="wf-input" style="background: hsl(var(--muted) / 0.4);" type="text" value="S3_revenue"><span class="block text-[0.6875rem] italic text-muted-foreground">Immutable across versions for longitudinal comparability.</span></div><div class="space-y-1"><label class="wf-label" for="q-type-u-number">Question Type</label><select id="q-type-u-number" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed"><option value="SLIDER_LIKERT">Slider</option><option value="TEXT">Short text</option><option value="NUMBER">Number</option><option value="MULTI_CHOICE">Multiple choice</option></select></div><div class="space-y-1"><label class="wf-label" for="q-label-u-number">Label</label><textarea id="q-label-u-number" rows="2" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed">What was your trailing-twelve-month revenue?</textarea></div><div class="space-y-1"><label class="wf-label" for="q-help-u-number">Help text</label><input id="q-help-u-number" placeholder="Optional helper text shown to respondents" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value="Enter annual revenue in USD."><span class="block text-[0.6875rem] italic text-muted-foreground">Optional. Rendered below the label on the respondent form.</span></div><div class="space-y-1"><span class="block text-xs font-medium text-foreground">Required</span><label class="flex items-center justify-between gap-2 px-2 py-2 rounded border border-border bg-muted/20 text-sm"><span class="text-foreground">Respondent must answer to submit</span><input aria-label="Required" class="w-4 h-4 disabled:opacity-60" type="checkbox"></label></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-1" data-testid="number-config-note"><h4 class="text-xs font-semibold text-foreground">Number</h4><p class="text-[0.6875rem] italic text-muted-foreground">Free numeric entry with finite-number validation at submit. Put units or bounds guidance in the Help text.</p></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-2" data-testid="q-findings-panel"><div class="flex items-center justify-between gap-2"><h4 class="text-xs font-semibold text-foreground">Findings</h4><button type="button" data-testid="q-findings-toggle" class="text-[0.6875rem] text-muted-foreground hover:text-foreground">Add</button></div><p class="text-[0.6875rem] italic text-muted-foreground">Report text shown when the answer falls in a score range.</p></div><div class="rounded-md border border-border bg-muted/10 p-3 space-y-2" data-testid="q-showif-panel"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2"><span class="text-xs font-medium text-foreground">Show only when…</span></div><button type="button" data-testid="q-showif-toggle" class="text-xs font-medium px-2 py-1 rounded text-foreground hover:bg-muted" aria-expanded="false">Configure</button></div></div></section>"`);
  });

  it("6. TEXT", () => {
    const { container } = renderBare(
      makeQuestion({
        uid: "u-text",
        stableKey: "S3_notes",
        label: "Anything else we should know?",
        type: "TEXT",
        isRequired: false,
      }),
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section class="space-y-4" data-testid="questions-config-form"><div class="space-y-1"><label class="wf-label" for="q-stablekey-u-text">stableKey</label><input id="q-stablekey-u-text" readonly="" class="wf-input" style="background: hsl(var(--muted) / 0.4);" type="text" value="S3_notes"><span class="block text-[0.6875rem] italic text-muted-foreground">Immutable across versions for longitudinal comparability.</span></div><div class="space-y-1"><label class="wf-label" for="q-type-u-text">Question Type</label><select id="q-type-u-text" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed"><option value="SLIDER_LIKERT">Slider</option><option value="TEXT">Short text</option><option value="NUMBER">Number</option><option value="MULTI_CHOICE">Multiple choice</option></select></div><div class="space-y-1"><label class="wf-label" for="q-label-u-text">Label</label><textarea id="q-label-u-text" rows="2" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed">Anything else we should know?</textarea></div><div class="space-y-1"><label class="wf-label" for="q-help-u-text">Help text</label><input id="q-help-u-text" placeholder="Optional helper text shown to respondents" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value=""><span class="block text-[0.6875rem] italic text-muted-foreground">Optional. Rendered below the label on the respondent form.</span></div><div class="space-y-1"><span class="block text-xs font-medium text-foreground">Required</span><label class="flex items-center justify-between gap-2 px-2 py-2 rounded border border-border bg-muted/20 text-sm"><span class="text-foreground">Respondent must answer to submit</span><input aria-label="Required" class="w-4 h-4 disabled:opacity-60" type="checkbox"></label></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-1" data-testid="text-config-note"><h4 class="text-xs font-semibold text-foreground">Short text</h4><p class="text-[0.6875rem] italic text-muted-foreground">Respondents type their answer in a text box (up to 10,000 characters).</p></div><div class="rounded-md border border-border bg-muted/10 p-3 space-y-2" data-testid="q-showif-panel"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2"><span class="text-xs font-medium text-foreground">Show only when…</span></div><button type="button" data-testid="q-showif-toggle" class="text-xs font-medium px-2 py-1 rounded text-foreground hover:bg-muted" aria-expanded="false">Configure</button></div></div></section>"`);
  });

  it("7. a question with a showIf rule set (conditionalEnabled)", () => {
    const { container } = renderBare(
      makeQuestion({
        uid: "u-conditional",
        stableKey: "S2_why_cashflow",
        label: "Tell us more about your cash-flow challenge.",
        type: "TEXT",
        isRequired: false,
        showIf: { questionKey: "S2_obstacles", optionKey: "K1" },
      }),
      {
        conditionalEnabled: true,
        showIfGates: [
          {
            stableKey: "S2_obstacles",
            label: "Which of these is your biggest obstacle right now?",
            options: [
              { key: "K1", label: "Cash flow" },
              { key: "K2", label: "Talent" },
            ],
          },
        ],
      },
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<section class="space-y-4" data-testid="questions-config-form"><div class="space-y-1"><label class="wf-label" for="q-stablekey-u-conditional">stableKey</label><input id="q-stablekey-u-conditional" readonly="" class="wf-input" style="background: hsl(var(--muted) / 0.4);" type="text" value="S2_why_cashflow"><span class="block text-[0.6875rem] italic text-muted-foreground">Immutable across versions for longitudinal comparability.</span></div><div class="space-y-1"><label class="wf-label" for="q-type-u-conditional">Question Type</label><select id="q-type-u-conditional" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed"><option value="SLIDER_LIKERT">Slider</option><option value="TEXT">Short text</option><option value="NUMBER">Number</option><option value="MULTI_CHOICE">Multiple choice</option></select></div><div class="space-y-1"><label class="wf-label" for="q-label-u-conditional">Label</label><textarea id="q-label-u-conditional" rows="2" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed">Tell us more about your cash-flow challenge.</textarea></div><div class="space-y-1"><label class="wf-label" for="q-help-u-conditional">Help text</label><input id="q-help-u-conditional" placeholder="Optional helper text shown to respondents" class="wf-input disabled:opacity-60 disabled:cursor-not-allowed" type="text" value=""><span class="block text-[0.6875rem] italic text-muted-foreground">Optional. Rendered below the label on the respondent form.</span></div><div class="space-y-1"><span class="block text-xs font-medium text-foreground">Required</span><label class="flex items-center justify-between gap-2 px-2 py-2 rounded border border-border bg-muted/20 text-sm"><span class="text-foreground">Respondent must answer to submit</span><input aria-label="Required" disabled="" class="w-4 h-4 disabled:opacity-60" type="checkbox"></label><span class="block text-[0.6875rem] italic text-muted-foreground" data-testid="q-required-showif-note">Conditional questions are always optional — clear the “Show only when…” rule to make this required.</span></div><div class="rounded-md border border-border bg-muted/20 p-3 space-y-1" data-testid="text-config-note"><h4 class="text-xs font-semibold text-foreground">Short text</h4><p class="text-[0.6875rem] italic text-muted-foreground">Respondents type their answer in a text box (up to 10,000 characters).</p></div><div class="rounded-md border border-border bg-muted/10 p-3 space-y-2" data-testid="q-showif-panel"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2"><span class="text-xs font-medium text-foreground">Show only when…</span><span class="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-semibold rounded bg-primary/10 text-primary">conditional</span></div><button type="button" data-testid="q-showif-toggle" class="text-xs font-medium px-2 py-1 rounded text-foreground hover:bg-muted" aria-expanded="false">Configure</button></div></div></section>"`);
  });
});

// ── Builder-shell presence baseline ─────────────────────────────────────
// Not a full snapshot (the TabbedShell header <h2> golden is deferred to
// the T11 parity test) — just proves the `single-column-builder` shell
// still mounts under the ED9 refactors. Harness mirrors
// single-column-builder.test.tsx exactly (mocks + fixture shape).
const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));
const replaceMock = jest.fn();
const mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: replaceMock, refresh: jest.fn() }),
  useSearchParams: () => ({
    get: (k: string) => mockSearchParams.get(k),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));

const allVersionsMeta = [
  {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
    contentHash: "abcdef012345",
  },
];

function builderProps() {
  return {
    template: {
      id: "tpl_1",
      name: "Alpha",
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
      sections: [{ stableKey: "S1", name: "Financials" }],
      questions: [
        {
          stableKey: "S1_rev",
          sectionStableKey: "S1",
          label: "Revenue",
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
    singleColumnEnabled: true,
  };
}

describe("ED9 golden baseline — single-column builder shell presence", () => {
  it("mounts the single-column-builder testid", () => {
    render(<TemplateEditorTabbed {...builderProps()} />);
    expect(document.querySelector('[data-testid="single-column-builder"]')).toBeInTheDocument();
  });
});
