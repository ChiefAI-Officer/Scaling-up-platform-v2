# Spec 17 Wave E — Report Polish & Qualitative Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Design + hardening:** [`17e-wave-e-report-polish-design.md`](./17e-wave-e-report-polish-design.md) (§1–§8 design; §9–§12 are the claudex hardening and are **AUTHORITATIVE**). ADR: [`0010`](../adr/0010-assessment-reports-have-two-types-scored-and-qualitative.md).

**Goal:** Make the per-respondent assessment report correct per template — clean the scored report (Rockefeller table, footer, QSP label, raw-view labels) and add a **qualitative report** type (LVA + QSP) rendered on-screen/PDF *and* in email, matching the Esperto reference PDFs.

**Architecture:** A per-template `report-config.ts` (keyed by `AssessmentTemplate.alias`) selects `reportType: "scored" | "qualitative"`. A shared `qualitative-report-model.ts` shapes per-respondent answers (answered-only, type-aware) once; two thin renderers consume it — `QualitativeReport.tsx` (on-screen/PDF) and an inline-HTML path in `report-email.ts` (email). Additive: **no migration, no new feature flag**; content fixes are forward-only DRAFT re-seed + publish.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Prisma/Neon, Jest + RTL, Playwright. Source under `src/src`; commands from `/Users/diushianstand/Scaling-up-platform-v2/src`. Build gate: `CI=true npx next build --turbopack`.

**Standing constraints (all tasks):**
- **No migration; no new feature flag.** Additive only. Reuse existing Wave-D email flags (`WAVE_D_RESULTS_EMAIL_ENABLED` / `WAVE_D_COACH_NOTIFY_ENABLED` / `ASSESSMENT_SENDS_PAUSED`).
- **Subagents NEVER run DB-connecting commands** (`prisma migrate dev/deploy`, `db push`, `prisma db seed`, `npx tsx prisma/seed*`). Local `DATABASE_URL` may point at prod. Seed *code* is written + unit/content-tested only; running a seed + publishing is an explicit, guarded, human-run step.
- Per-task gate: `CI=true npx next build --turbopack` + `npx eslint <changed files>` (0 warnings/errors on changed files) + targeted `npm test`.
- Both render paths (`BrandedReport.tsx` + `report-email.ts`) change together.
- Branch off `main` (e.g. `feat/wave-e-report-polish`), NOT a worktree. Commit per task. Do NOT push/PR until the final review + user go.

**Build order:** Tasks 1–6 (E-1) are buildable immediately. **Task 7 (`/frontend-design` mockup) is a HARD GATE** — Tasks 8–13 (E-2) MUST NOT start until the mockup is user-approved. Task 14 finalizes.

---

## Phase E-1 — mechanical cleanup (no mockup, buildable now)

### Task 1: `report-config.ts` — per-template report type/config

**Files:**
- Create: `src/src/lib/assessments/report-config.ts`
- Test: `src/src/__tests__/lib/assessments/report-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/src/__tests__/lib/assessments/report-config.test.ts
import { reportConfigFor, DEFAULT_REPORT_CONFIG } from "@/lib/assessments/report-config";

describe("reportConfigFor", () => {
  it("Rockefeller stays scored but hides the score table (#24)", () => {
    expect(reportConfigFor("RockHabits")).toEqual({ reportType: "scored", showScoreTable: false });
  });
  it("QSP v1/v2 + LVA are qualitative (#27/#28/#30/#31)", () => {
    for (const a of ["qsp-v1", "qsp-v2", "leadership-vision-alignment"]) {
      expect(reportConfigFor(a).reportType).toBe("qualitative");
    }
  });
  it("keep-set + unknown + null fall back to scored + table", () => {
    for (const a of ["five-dysfunctions", "scaling-up-full", "scaling-up-quick", "nope", null, undefined]) {
      expect(reportConfigFor(a)).toEqual({ reportType: "scored", showScoreTable: true });
    }
    expect(DEFAULT_REPORT_CONFIG).toEqual({ reportType: "scored", showScoreTable: true });
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `npm test -- report-config` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/src/lib/assessments/report-config.ts
export type ReportType = "scored" | "qualitative";

export interface ReportConfig {
  /** Which renderer drives the per-respondent report. */
  reportType: ReportType;
  /** Whether the scored renderer shows the "All sections" score/average table. */
  showScoreTable: boolean;
}

/** Default = current behaviour (back-compatible): scored report with the table shown. */
export const DEFAULT_REPORT_CONFIG: ReportConfig = { reportType: "scored", showScoreTable: true };

/**
 * Per-template report behaviour, keyed by AssessmentTemplate.alias (stable across versions).
 * See ADR-0010. Report TYPE is a global presentation policy (intentionally retroactive);
 * report CONTENT stays version-pinned. Unknown alias → DEFAULT.
 */
const REPORT_CONFIG: Readonly<Record<string, ReportConfig>> = {
  RockHabits: { reportType: "scored", showScoreTable: false }, // #24
  "qsp-v1": { reportType: "qualitative", showScoreTable: false }, // #28
  "qsp-v2": { reportType: "qualitative", showScoreTable: false }, // #27
  "leadership-vision-alignment": { reportType: "qualitative", showScoreTable: false }, // #30/#31
};

export function reportConfigFor(alias: string | null | undefined): ReportConfig {
  if (!alias) return DEFAULT_REPORT_CONFIG;
  return REPORT_CONFIG[alias] ?? DEFAULT_REPORT_CONFIG;
}
```

- [ ] **Step 4: Run test, verify pass** — `npm test -- report-config` → PASS.
- [ ] **Step 5: Gate + commit** — `CI=true npx next build --turbopack`; `git commit -m "feat(assessments): per-template report-config (ADR-0010) — alias-keyed scored/qualitative"`.

---

### Task 2: thread `templateAlias` onto `RespondentReport`

**Files:**
- Modify: `src/src/lib/assessments/respondent-report.ts` (type `RespondentReport` ~L89–112; select ~L210–214; assembly ~L283–303)
- Test: `src/src/__tests__/lib/assessments/respondent-report.test.ts` (extend existing if present, else create)

- [ ] **Step 1: Failing test** — assert `getRespondentReport` returns `templateAlias` from the campaign's template.

```ts
// add to the respondent-report test suite — mock includes campaign.template.alias
it("exposes templateAlias from the campaign template", async () => {
  // arrange a mock submission whose campaign.template = { id, name, alias: "leadership-vision-alignment" }
  const out = await getRespondentReport(/* …mocked deps… */);
  expect(out.status).toBe("ok");
  if (out.status === "ok") expect(out.report.templateAlias).toBe("leadership-vision-alignment");
});
```

- [ ] **Step 2: Run, verify fail** — `npm test -- respondent-report` → FAIL (`templateAlias` undefined / not selected).

- [ ] **Step 3: Implement**
  - In the Prisma select, change `template: { select: { id: true, name: true } }` → add `alias: true`.
  - Add `templateAlias: string;` to `interface RespondentReport`.
  - In the assembly object, add `templateAlias: submission.campaign.template.alias,`.

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(assessments): expose templateAlias on RespondentReport (report-config wiring)"`.

> NOTE: this covers the **on-screen** loader path only. The **email/submit** paths build the report payload separately and are handled in **Task 9** (R1/R2-H1) — do not assume Task 2 covers them.

---

### Task 3: #25 footer cleanup + provenance → audit/send metadata (R2-L8)

**Files:**
- Modify: `src/src/components/assessments/BrandedReport.tsx` (footer ~L679–702; the `formatSubmittedAt(new Date())` provenance line ~L689–695)
- Modify: `src/src/lib/assessments/report-email.ts` (footer ~L578)
- Modify: the report-view audit call site (where `VIEW_REPORT` is logged — `getRespondentReport` caller; grep `VIEW_REPORT`)
- Test: `src/src/__tests__/components/assessments/branded-report-footer.test.tsx`; extend `report-email` tests

- [ ] **Step 1: Failing tests**

```tsx
// branded-report-footer.test.tsx
it("footer shows submission date + 'Generated by Scaling Up Platform' and NO debug stamp", () => {
  render(<BrandedReport report={mk({ submittedAt: new Date("2026-05-01T12:00:00Z") })} />);
  const footer = screen.getByTestId("report-footer");
  expect(footer).toHaveTextContent(/Generated by Scaling Up Platform/);
  expect(footer.textContent).toMatch(/May 1, 2026|2026/); // submission date present
  expect(footer.textContent).not.toMatch(/Submission |contentHash|· v\d|Confidential/i); // stamp gone
});
```
Add a `report-email` test asserting the email footer string is exactly `Generated by Scaling Up Platform` (no "Assessment platform · Confidential").

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**
  - BrandedReport footer: delete the `<span className="su-report-provenance">…</span>` block; keep the `<img className="su-logo">`; add `<span className="su-report-footer-date">{formatSubmittedAt(report.submittedAt)}</span>`; change the credit `<span>` text to `Generated by Scaling Up Platform`. Remove `· Confidential`.
  - report-email.ts L578: replace `Generated by the Scaling Up Assessment platform &middot; Confidential` with the submission date + `Generated by Scaling Up Platform`.
  - **R2-L8:** at the `VIEW_REPORT` audit call and the outbox-row creation, add metadata fields `templateAlias`, `versionId`, `contentHash`, `reportType` (into the audit `changes`/`metadata` JSON and the outbox row's metadata) so provenance survives off-screen. (Add the columns to the audit JSON payload only — NO schema change; these go in existing JSON/text columns.)

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(assessments): clean report footer (#25) + move provenance to audit/send metadata (R2-L8)"`.

---

### Task 4: #24 Rockefeller — hide "All sections" score table via config

**Files:**
- Modify: `src/src/components/assessments/BrandedReport.tsx` (scores section ~L564–630)
- Modify: `src/src/lib/assessments/report-email.ts` (score table ~L425–470)
- Test: `branded-report` + `report-email` suites

- [ ] **Step 1: Failing tests** — for a `RockHabits` report, the score table (`data-testid="report-scores-table"`) is absent; for a default/`scaling-up-full` report it is present.

```tsx
it("hides the All-sections table when reportConfig.showScoreTable is false (#24 Rockefeller)", () => {
  render(<BrandedReport report={mk({ templateAlias: "RockHabits" })} />);
  expect(screen.queryByTestId("report-scores-table")).toBeNull();
});
it("keeps the table for default/scored templates", () => {
  render(<BrandedReport report={mk({ templateAlias: "scaling-up-full" })} />);
  expect(screen.getByTestId("report-scores-table")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — in both files compute `const cfg = reportConfigFor(report.templateAlias);` and wrap the score-table section in `{cfg.showScoreTable && ( … )}`. (Email path: only emit the `scoresTable` HTML when `cfg.showScoreTable`.)
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(assessments): hide All-sections table for Rockefeller via report-config (#24)"`.

---

### Task 5: #26 QSPv2 — strip "(with 1 decimal)" from the first-question label

**Files:**
- Modify: `src/prisma/seed-qsp-v2-assessment.ts:196` (label)
- Modify (optional render-time strip, R1-L2): `src/src/lib/assessments/qualitative-report-model.ts` label normaliser (added in Task 8) — OR a small shared `normalizeQuestionLabel` util
- Test: `src/src/__tests__/seed/qsp-v2-content.test.ts`

- [ ] **Step 1: Failing test** — assert no QSPv2 question label contains `with 1 decimal`.

```ts
it("QSPv2 first question label has no '(with 1 decimal)' (#26)", () => {
  const labels = qspV2Questions.map((q) => q.label);
  expect(labels.some((l) => /with 1 decimal/i.test(l))).toBe(false);
  expect(labels).toContain("How would you rate the past Quarter? (1-10)");
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — change the L196 label to `"How would you rate the past Quarter? (1-10)"`. (Scale is already `step: 1`; no scale change.) **R1-L2:** also add an exported `stripLegacyDecimalSuffix(label)` (regex `/\s*\(with 1 decimal\)\s*$/i → ""`) and apply it in the qualitative renderer's label display so **already-pinned** QSPv2 versions are fixed at render time too. Document forward-only seed + render-strip in the design's #26 note.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit** — `git commit -m "fix(assessments): QSPv2 label drop '(with 1 decimal)' (#26) + render-time strip for legacy versions"`.

> Publishing the corrected QSPv2 DRAFT is a **human-gated** step (Task 12 process), NOT run here.

---

### Task 6: #21 raw-view question labels (`/result` API plumbing — R1-M3)

**Files:**
- Modify: `src/src/app/api/assessment-campaigns/[id]/respondents/[respondentId]/result/route.ts` (select ~L92 add `questions: true`; response ~L108–123 add `questionByKey`)
- Modify: `src/src/components/assessments/AssessmentResultView.tsx` (props ~L45; per-question render ~L262–268)
- Test: extend the result-route test + `AssessmentResultView` RTL test

- [ ] **Step 1: Failing tests**
  - Route test: response JSON includes `questionByKey` mapping stableKey → label.
  - View test: rendering with `questionByKey={{ q1_1: "How ready are you?" }}` shows the label text, not the bare `q1_1` code.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**
  - Route: add `questions: true` to the `version` select; build `questionByKey: Record<string,string>` from `version.questions` (first-wins on dup stableKey, mirroring `respondent-report.ts:244–257`); include it in the JSON payload.
  - `AssessmentResultViewProps`: add `questionByKey?: Record<string, string>`.
  - In the per-question `<li>`, render `{questionByKey?.[q.stableKey] ?? q.stableKey}` as the primary label; keep `q.stableKey` only as a muted secondary (`text-xs text-muted-foreground`).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(assessments): raw-data view shows question text not codes (#21) + /result API labels"`.

---

## GATE — `/frontend-design` mockup (HARD; blocks Tasks 8–13)

### Task 7: Qualitative report mockup → user approval

**Files:** mockup HTML under `src/public/wireframes-phase2/` (or a scratch file); screenshot for review.

- [ ] **Step 1:** Produce a single self-contained `/frontend-design` mockup of `QualitativeReport` in the existing SU report brand (`.su-public-brand .su-report`), with **two frames** (LVA + QSP), matching the Esperto LVA/QSP PDFs:
  - Cover → **text-only branded preface** (no Verne photo/signature, per G4) → themed sections.
  - Section presentation kinds (the **per-section presentation contract**, R1-M2): **Q&A row** (TEXT), **metric table** (consecutive NUMBER, e.g. LVA financials), **percent bar** (single NUMBER %, e.g. rehire %), **rating list/table** (SLIDER_LIKERT — incl. LVA's 16-factor Weak/Average/Strong, per grill-me #2), **selection + follow-ups** (MULTI_CHOICE pick-3 with answered "why" rows beneath; blanks suppressed).
  - Per-respondent only — **no team Mean column** (G1).
  - Print/PDF: section blocks paginate cleanly.
- [ ] **Step 2:** Render + screenshot; present inline for user approval. Capture the approved **per-section presentation contract** (which section → which kind) into the design doc §5.
- [ ] **Step 3 (GATE):** Do NOT proceed to Task 8 until the user approves the mockup.

---

## Phase E-2 — qualitative report (after mockup approval)

### Task 8: shared `qualitative-report-model.ts` (data layer)

**Files:**
- Create: `src/src/lib/assessments/qualitative-report-model.ts`
- Test: `src/src/__tests__/lib/assessments/qualitative-report-model.test.ts`

- [ ] **Step 1: Failing tests** — `isReportAnswerPresent` (type-aware, R2-M5) + `buildQualitativeModel` (group by section, answered-only, grill-me #1).

```ts
import { isReportAnswerPresent, buildQualitativeModel } from "@/lib/assessments/qualitative-report-model";

describe("isReportAnswerPresent (R2-M5)", () => {
  it("NUMBER: finite 0 is present", () => expect(isReportAnswerPresent("NUMBER", 0)).toBe(true));
  it("NUMBER: null/NaN absent", () => { expect(isReportAnswerPresent("NUMBER", null)).toBe(false); expect(isReportAnswerPresent("NUMBER", NaN)).toBe(false); });
  it("TEXT: trimmed-empty absent, non-empty present", () => { expect(isReportAnswerPresent("TEXT", "   ")).toBe(false); expect(isReportAnswerPresent("TEXT", "x")).toBe(true); });
  it("MULTI_CHOICE: empty array absent", () => { expect(isReportAnswerPresent("MULTI_CHOICE", [])).toBe(false); expect(isReportAnswerPresent("MULTI_CHOICE", ["a"])).toBe(true); });
  it("SLIDER_LIKERT: finite number present incl. min", () => expect(isReportAnswerPresent("SLIDER_LIKERT", 1)).toBe(true));
});

describe("buildQualitativeModel (grill-me #1: answered-only)", () => {
  it("omits unanswered questions and fully-empty sections", () => {
    const model = buildQualitativeModel({ sections: S, questionsByKey: Q, rawAnswers: A });
    // a section with no answered questions is absent; an unanswered optional 'why' row is absent
    expect(model.sections.find((s) => s.stableKey === "S5_explained")?.items.length).toBeGreaterThan(0);
    expect(model.sections.every((s) => s.items.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**
  - `isReportAnswerPresent(type, value)`: NUMBER/SLIDER_LIKERT → `typeof value === "number" && Number.isFinite(value)`; TEXT → `typeof value === "string" && value.trim() !== ""`; MULTI_CHOICE → `Array.isArray(value) && value.length > 0`; default → falsy-check.
  - `buildQualitativeModel({ sections, questionsByKey, rawAnswers })`: returns `{ sections: Array<{ stableKey, name, description?, items: PresentationItem[] }> }` where each section groups its questions (by `sectionStableKey`), maps each **answered** question to a `PresentationItem` tagged with its **presentation kind** (`qa | metric-table | percent-bar | rating | choices`) from the **approved per-section contract** (a `SECTION_PRESENTATION` map keyed by `templateAlias` + sectionStableKey, with a per-question-type fallback), and **drops** sections with zero items. Raw structured data only — **no HTML** (escaping happens in the renderers).
  - Re-export `stripLegacyDecimalSuffix` (Task 5) and apply to displayed labels.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(assessments): qualitative-report-model — answered-only, type-aware presence, per-section presentation contract"`.

---

### Task 9: thread raw answers + templateAlias + real submittedAt through ALL report-assembly paths (R1/R2-H1)

**Files:**
- Modify: `src/src/lib/assessments/report-email.ts` (`BuildRespondentReportArgs` ~L71; `buildRespondentReportFromSubmission` `rawAnswers: []` ~L141)
- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts` (report-email construction ~L120–185; `submittedAt: new Date()`, `submissionId: ""`)
- Modify: `src/src/app/api/quiz/[campaignAlias]/submit/route.ts` (~L260–290)
- Modify: any report fixtures used by tests
- Test: new `report-email` LVA/QSP tests + submit-route tests

- [ ] **Step 1: Failing tests** — build a report email for an LVA submission and assert the body contains the respondent's actual TEXT/NUMBER/MULTI_CHOICE answers and does **not** contain the scored anatomy.

```ts
it("LVA results email renders answer text, not a score report (R1/R2-H1)", () => {
  const report = buildRespondentReportFromSubmission(lvaArgsWithAnswers); // now carries rawAnswers + templateAlias
  const { bodyHtml } = buildReportEmailHtml({ report, recipientRole: "RESPONDENT" });
  expect(bodyHtml).toContain("be largest blah org in country"); // a real answer
  expect(bodyHtml).not.toMatch(/score ring|All sections|How you scored/i);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**
  - Add to `BuildRespondentReportArgs`: `templateAlias: string;` and `rawAnswers: unknown;` (the submitted answers) and require a real `submittedAt`/`submissionId`.
  - `buildRespondentReportFromSubmission`: set `rawAnswers: args.rawAnswers` (not `[]`) and `templateAlias: args.templateAlias`.
  - Both submit routes: pass `templateAlias: campaign.template.alias` (add `alias` to the template select), the **validated answers**, the **real `submittedAt`** (the submission's timestamp, not `new Date()`), and the real `submissionId`.
  - Update fixtures to include `templateAlias` + `rawAnswers`.
- [ ] **Step 4: Run, verify pass** (incl. existing scored-template email tests still pass).
- [ ] **Step 5: Gate + commit** — `git commit -m "fix(assessments): thread templateAlias + raw answers + real submittedAt through all report-assembly paths (R1/R2-H1)"`.

---

### Task 10: `QualitativeReport.tsx` (on-screen/PDF) + dispatch + CSS

**Files:**
- Create: `src/src/components/assessments/QualitativeReport.tsx`
- Modify: `src/src/components/assessments/BrandedReport.tsx` (dispatch: when `reportConfigFor(report.templateAlias).reportType === "qualitative"` render `<QualitativeReport>`)
- Modify: `src/src/styles/su-report.css` (qualitative section/card styles, scoped `.su-public-brand .su-report`; `@media print { … page-break-inside: avoid }`)
- Test: `qualitative-report.test.tsx` (RTL) + extend `branded-report` dispatch test

- [ ] **Step 1: Failing tests**
  - Dispatch: a `leadership-vision-alignment` report renders `QualitativeReport` (testid `qualitative-report`) and NOT the score ring.
  - Content: themed sections present; answered answers shown; unanswered omitted (grill-me #1); 16-factor ratings shown (grill-me #2); no Mean column (G1).

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — `QualitativeReport({ report })` calls `buildQualitativeModel(report)` and renders cover → text preface → sections per the **approved mockup contract** (Task 7): Q&A rows, metric tables, percent bars, rating lists, choice + follow-ups. React auto-escapes text. Add `data-testid="qualitative-report"`. Wire the dispatch in `BrandedReport`. Add scoped CSS incl. print pagination.
  > Visual arrangement follows the Task-7 approved mockup; the **testable contracts** (which sections/kinds appear, answered-only, no-Mean, ratings present) are asserted above and are mockup-independent.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(assessments): QualitativeReport on-screen/PDF renderer (LVA/QSP) + dispatch + scoped CSS (#30/#31)"`.

---

### Task 11: qualitative EMAIL twin — escape, truncate, defensive render, render-outside-tx

**Files:**
- Modify: `src/src/lib/assessments/report-email.ts` (qualitative inline-HTML path, selected by `reportConfigFor`)
- Modify: the invited enqueue site (`org-survey/.../submit/route.ts`) — render **before** opening the submission `$transaction` (R3-M3)
- Test: `report-email` injection + size + dispatch tests; a regression test over a representative OLD pinned LVA/QSP version (R1-M1)

- [ ] **Step 1: Failing tests**
  - **Injection (R2-H3):** an answer of `<script>alert(1)</script>` and `"><img onerror=x>` appears HTML-escaped in the email body; a numeric bar width is clamped to `[0,100]`.
  - **Size (R1-M5):** a 10,000-char answer is truncated to the per-answer cap with a `…(truncated)` indicator and total body bytes ≤ the defined budget (e.g. 90 KB).
  - **Defensive (R2-M6):** a malformed answer shape does not throw — the row is skipped and the rest renders.
  - **Dispatch:** a `qsp-v2` results email renders the qualitative HTML (no score table).
  - **Regression (R1-M1):** an old pinned LVA version renders without throwing.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**
  - Qualitative email path consumes `buildQualitativeModel` and emits inline-styled table HTML; **every** label/option/answer goes through an `escapeHtml` at the boundary; numeric → style values clamped.
  - Per-answer truncation + overall byte budget (constants `QUAL_EMAIL_ANSWER_CAP`, `QUAL_EMAIL_BYTE_BUDGET`); graceful indicator (no "view full" link — none exists per ADR-0007/0008).
  - Wrap row rendering in try/per-item so one bad item degrades, never throws the whole report; on total failure, return a minimal safe body and signal the caller to record a render-failure (do not silently drop — see Task 13 metrics).
  - **R3-M3:** in the invited submit route, render the email HTML **before** `db.$transaction(...)`; the transaction only inserts the (already-rendered) outbox row.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(assessments): qualitative email twin — escape (R2-H3), truncate/budget (R1-M5), defensive render (R2-M6), render-outside-tx (R3-M3)"`.

---

### Task 12: #29 LVA content reconcile (structured diff → DRAFT) + publish-hash gate

**Files:**
- Create: `src/scripts/diff-lva-source.mjs` (read-only structured XLSX diff; R1-M4)
- Modify: `src/prisma/seed-lva-assessment.ts` (reconcile questions to Jeff's source after diff review)
- Modify: the publish path / publish-review checklist to bind to the reviewed `contentHash` (R2-M7)
- Doc: extend `docs/specs/v7.6/09b-publish-review-checklist.md` for Wave E (record source/parser/diff SHA256 — R3-L1)
- Test: `src/src/__tests__/seed/lva-content.test.ts` (assert reconciled labels)

- [ ] **Step 1:** Write `diff-lva-source.mjs` using a structured XLSX parser (e.g. `xlsx`/`exceljs`) that preserves sheet/cell coordinates, **strips sample-answer cells**, and emits a stableKey-aware question/section diff (our seed vs `From Jeff/APP_…/leadership visin alignment assement.xlsx`). **Read-only — no DB.** Print the diff for human review; record source/parser/diff SHA256.
- [ ] **Step 2:** Run the diff (local, read-only); review with the user/Jeff. Reconcile `seed-lva-assessment.ts` question labels/sets to the approved source (forward-only DRAFT append via the existing `ensureTemplateVersionContent` helper). Update `lva-content.test.ts` expectations.
- [ ] **Step 3:** Publish-hash gate (R2-M7): record the reviewed draft `contentHash` in the publish-review artifact; the guarded publish step asserts the current draft hash still matches before `publishedAt`. (Mirror the Wave-D #15 SEC-H2 pattern.)
- [ ] **Step 4:** Light **read-only** QSP v1/v2 diff-check (same parser) — surface gaps to Jeff; **no committed QSP content change** (G2).
- [ ] **Step 5: Gate + commit** — `git commit -m "feat(assessments): LVA #29 content reconcile (structured diff → DRAFT) + publish-hash gate + QSP diff-check"`.

> Running the seed + publishing is a **human-gated** step (subagents never touch the DB). The implementer writes code + content tests only.

---

### Task 13: `17e-ops-runbook.md` (rollout / rollback / observability)

**Files:** Create `docs/specs/v7.6/17e-ops-runbook.md`; wire render/outbox metrics into `/admin/observability` (spec 06).

- [ ] **Step 1:** Write the runbook:
  - **Staged rollout (R3-M2):** ship the renderer with all aliases still scored/default → flip `leadership-vision-alignment` → `qsp-v1` → `qsp-v2` one at a time, each after a preview/prod smoke on representative **historical pinned** submissions with explicit pass/fail.
  - **Rollback (R3-H1):** to revert a bad qualitative *email*, first **pause the outbox drain** (`quick-assessment-lead-email` + its `*/3` cron) and/or set `ASSESSMENT_SENDS_PAUSED=1`, then query/quarantine/regenerate/discard affected `PENDING` rows, *then* config/promote-previous rollback. (Config flip alone doesn't un-send queued rows.)
  - **Publish rollback (R3-M4):** targeted, non-destructive — block new-campaign creation for the alias, identify campaigns pinned to the bad version, supersede/unpublish with audit; PITR last resort.
  - **Observability (R3-M1/R2-L8):** counters `assessment.report.render.failure`, `assessment.report.render.degraded_rows`, outbox pending-age + failed-count, labeled by `templateAlias`/`reportType`/`renderPath`/`emailType`/`recipientRole`; `/admin/observability` panels + paging thresholds.
- [ ] **Step 2:** Implement the metric emission at the render-failure + outbox sites; add the `/admin/observability` panels.
- [ ] **Step 3: Gate + commit** — `git commit -m "docs(assessments): Wave E ops runbook (staged rollout, drainer-aware rollback, targeted publish rollback) + render/outbox metrics"`.

---

### Task 14: final whole-branch review + SoT

- [ ] **Step 1:** Dispatch the superpowers code-reviewer over the whole branch (base `main` → HEAD). Fix Critical/Important.
- [ ] **Step 2:** Full gate — `CI=true npx next build --turbopack`; `npx eslint` on all changed files (0/0); `npm test` (no NEW failures vs `main` baseline).
- [ ] **Step 3:** SoT flush (on merge): CLAUDE.md LAST_UPDATED anchor + `plans/CHANGELOG.md` entry + Notion task. Add the deferred **R2-H2 outbox atomic-claim** to the open follow-ons list.
- [ ] **Step 4:** Stop for the user's merge-go (do NOT PR/merge without it).

---

## Self-review — spec coverage

| Design / finding | Task |
|---|---|
| Per-template config (ADR-0010) | 1 |
| `templateAlias` on report (on-screen) | 2 · (email/submit) 9 |
| #25 footer + provenance→audit (R2-L8) | 3 |
| #24 Rockefeller table removal | 4 |
| #26 QSPv2 label (+ R1-L2 render-strip) | 5 |
| #21 raw-view labels (+ R1-M3 API plumbing) | 6 |
| Mockup gate + per-section contract (R1-M2) | 7 |
| answered-only (grill-me#1) + type-aware presence (R2-M5) | 8 |
| raw answers + alias + real submittedAt all paths (R1/R2-H1) | 9 |
| QualitativeReport on-screen/PDF (#30/#31) + matrix ratings (grill-me#2) + no Mean (G1) | 10 |
| email escape (R2-H3) + budget/truncate (R1-M5) + defensive (R2-M6) + render-outside-tx (R3-M3) + old-pinned regression (R1-M1) | 11 |
| #29 structured diff (R1-M4) + DRAFT + publish-hash (R2-M7) + hashes (R3-L1) + QSP diff-check (G2) | 12 |
| ops runbook: staged rollout (R3-M2), drainer-aware rollback (R3-H1), publish rollback (R3-M4), metrics (R3-M1) | 13 |
| MULTI_CHOICE not CHECKBOX (R1-L1) | 8, 10, 11 (contract uses MULTI_CHOICE) |
| Rejected: version-pin type (R2-M4) — config stays global | — (by design) |
| Deferred: outbox atomic claim (R2-H2) | 14 (follow-on list) |
| #33 accuracy diff | out of scope (pends Jeff) |
