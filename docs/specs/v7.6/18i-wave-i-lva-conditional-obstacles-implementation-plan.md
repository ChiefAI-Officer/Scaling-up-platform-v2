# Wave I — LVA Conditional Obstacles + Strengths-Matrix Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Design contract:
> [18i-…-design.md](18i-wave-i-lva-conditional-obstacles-design.md) · [ADR-0014](../../adr/0014-conditional-report-sections-via-report-model-filter.md).
>
> **Hardened by a 3-round claudex/Codex adversarial review (June 23 2026).** All findings folded in **in place**
> below (per R2-M1 — no superseded snippets remain). Round 1 + 2 findings: `scratchpad/round{1,2}-changelog.md`.

**Goal:** Make the LVA per-respondent report match Esperto — drop the 16-factor strengths matrix and render the
"Why is X a hindrance?" follow-ups only for the obstacle factors the respondent checked — via a report-model
filter, with no seed change, no migration, and no feature flag.

**Architecture:** A per-alias `REPORT_FILTERS` map in `qualitative-report-model.ts` (mirroring
`SECTION_PRESENTATION`) declares `suppressSections` and `conditionalFollowups`. `buildQualitativeModel` applies
it generically: skip suppressed sections; once a **valid MULTI_CHOICE gate question exists** in the pinned
version, treat **every** `followupPrefix`-matching key as conditional and render it iff its factor is in the
gate answer — applied via a **shared predicate** in BOTH the section loop AND the orphan bucket. The mechanism
**fails open** (answered-only) when the gate question is absent or not MULTI_CHOICE. The model returns
**non-PII filter provenance** (filter id + suppressed/hidden counts) so the retroactive, code-only content
change is traceable in the VIEW_REPORT audit, metrics, and email outbox logs. Both consumers
(`QualitativeReport.tsx`, `report-email.ts`) read the filtered model, so screen + email fix together. The group
report uses a different model and is untouched.

**Tech Stack:** TypeScript, Jest + Testing Library, Prisma. Source under `src/src`. All commands from
`/Users/diushianstand/Scaling-up-platform-v2/src`. Branch: `feat/wave-i-lva-conditional-obstacles`.
Build gate: `CI=true npx next build --turbopack`.

**Pre-flight (verify before Task 1):**
1. `QMeta` (in `qualitative-report-model.ts`) includes `type` and `options?: Array<{ key: string; label: string }>`.
   `toItem` already reads `meta.options`, so `options` should exist; `type` is used by `isReportAnswerPresent`.
2. **Gate-answer shape (critical):** confirm how the S4 MULTI_CHOICE answer reaches `buildQualitativeModel`.
   `respondent-report.ts:261` passes `rawAnswers: submission.answers`, and `AssessmentSubmission.answers`
   (schema:1317) is documented as `[{stableKey, value} | {stableKey, textValue} | {stableKey, selectedKeys}]`.
   The model's `isRawAnswerRow` requires a `value` key. Verify (against real LVA submissions + the submit path)
   whether MULTI_CHOICE arrives as `value: string[]` (the existing C-H1 test assumes this) or `selectedKeys`.
   If `selectedKeys` is possible, the gate extraction in Task 3 (and the audit in Task 0) MUST handle both shapes.

---

### Task 0: Pre-merge impact audit (read-only) — gates the merge

> The filter is **retroactive and unflagged**: on deploy, every already-submitted LVA report re-renders without
> S3 and with gated S5. This task quantifies the hide-rate over existing production data and **gates the merge**
> on explicit user approval. Read-only; no code path ships from this task.

**Files:**
- Create: `scripts/audit-lva-report-filter-impact.mjs` (standalone CLI; excluded from tsconfig like other scripts)

- [ ] **Step 1: Write the audit script.** Requirements (all mandatory):
  - **Read-only enforcement:** require a dedicated env var `AUDIT_READONLY_URL` (a least-privileged read-only
    connection string). **Refuse to run if it is unset** — do NOT fall back to `DATABASE_URL`/`DIRECT_URL`.
    Instantiate Prisma with that URL, and run every query inside
    `prisma.$transaction(async (tx) => { await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); … })`.
    Issue **only SELECTs**. **Redact** the connection string in all output (never print the URL/creds).
  - **Impact set (R2-L1):** completed LVA submissions = `AssessmentSubmission` rows whose
    `invitation.status === "SUBMITTED"` and `respondentId` is non-null, for campaigns whose
    `template.alias === "leadership-vision-alignment"`. (Mirror the "completed" definition in
    `group-report.ts:281-287`; confirm the exact relation path `submission → invitation/campaign → template.alias`
    against `schema.prisma:1289,1311`.)
  - For each submission, parse `answers` (JSON) and compute:
    - the S4 checked-factor set — read `S4_biggest_obstacles` handling **both** `value: string[]` and
      `selectedKeys: string[]` shapes (per Pre-flight #2);
    - the present `S5_why_<f>` keys (non-empty text) whose `<f>` is **not** in the checked set → **will be hidden**.
  - **Output (no PII — ids only):** per-campaign + grand totals of:
    (a) reports losing the S3 matrix (= all completed; sanity only),
    (b) reports with ≥1 hidden `S5_why_` (the **hide rate**) + a histogram of hidden-count-per-report,
    (c) submissions whose pinned version has **no** S4 gate or a **non-MULTI_CHOICE** S4 (the fail-open population).
    Print an id-only sample (submission ids) for (b) and (c).

- [ ] **Step 2: Smoke-run read-only** (against a safe DB first if available):

Run: `cd /Users/diushianstand/Scaling-up-platform-v2/src && AUDIT_READONLY_URL="<readonly-conn>" node ../scripts/audit-lva-report-filter-impact.mjs | tee /tmp/lva-audit.txt`
Expected: prints the (a)/(b)/(c) tallies; no write attempted; URL redacted.

- [ ] **Step 3: GATE — present the hide-rate to the user for explicit approval.** Do NOT merge until the (b)
  hide-rate is reviewed and approved (or a legacy fallback is defined). Record the approved numbers in the PR/SoT.

- [ ] **Step 4: Commit the script** (no behavior ships):

```bash
git add scripts/audit-lva-report-filter-impact.mjs
git commit -m "chore(assessments): read-only LVA report-filter impact audit (Wave I Task 0)"
```

---

### Task 1: `REPORT_FILTERS` config + type

**Files:**
- Modify: `src/src/lib/assessments/qualitative-report-model.ts` (add after the `SECTION_PRESENTATION` map)
- Test: `src/src/__tests__/lib/assessments/qualitative-report-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { REPORT_FILTERS } from "@/lib/assessments/qualitative-report-model";

describe("REPORT_FILTERS (Wave I)", () => {
  it("declares the LVA suppress + conditional-followup contract", () => {
    expect(REPORT_FILTERS["leadership-vision-alignment"]).toEqual({
      suppressSections: ["S3_strengths"],
      conditionalFollowups: { gateKey: "S4_biggest_obstacles", followupPrefix: "S5_why_" },
    });
  });
  it("has no entry for unaffected templates", () => {
    expect(REPORT_FILTERS["qsp-v2"]).toBeUndefined();
    expect(REPORT_FILTERS["RockHabits"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npm test -- --testPathPatterns="qualitative-report-model"` → FAIL (not exported).

- [ ] **Step 3: Implement** (after the closing `}` of `SECTION_PRESENTATION`):

```ts
/**
 * Per-alias report filter (ADR-0014). Reproduces Esperto conditional output at the
 * report layer — NOT via a survey-form conditional engine. One conditional follow-up
 * group per template by design (YAGNI; widen `conditionalFollowups` to an array only
 * if a future template needs multiple). Unknown alias → no filtering.
 */
export interface ReportFilterConfig {
  suppressSections?: string[];
  conditionalFollowups?: { gateKey: string; followupPrefix: string };
}

export const REPORT_FILTERS: Readonly<Record<string, ReportFilterConfig>> = {
  "leadership-vision-alignment": {
    suppressSections: ["S3_strengths"],
    conditionalFollowups: { gateKey: "S4_biggest_obstacles", followupPrefix: "S5_why_" },
  },
};

/** Bump when the filter's semantics change — recorded in audit/metrics provenance (Task 5). */
export const REPORT_FILTER_VERSION = "lva-cond-v1";
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(assessments): add per-alias REPORT_FILTERS config (Wave I, ADR-0014)`.

---

### Task 2: Section suppression in `buildQualitativeModel`

**Files:** Modify `qualitative-report-model.ts`; Test `qualitative-report-model.test.ts`.

- [ ] **Step 1: Failing test**

```ts
describe("LVA section suppression (Wave I)", () => {
  it("omits S3_strengths for LVA even when every factor is answered", () => {
    const model = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [
        { stableKey: "S3_strengths", name: "Strengths and Weaknesses" },
        { stableKey: "S2_vision", name: "Vision" },
      ],
      questionsByKey: {
        S3_sales: { type: "SLIDER_LIKERT", label: "Sales", sectionStableKey: "S3_strengths", min: 1, max: 3 },
        S2_products: { type: "TEXT", label: "Products", sectionStableKey: "S2_vision" },
      },
      rawAnswers: [
        { stableKey: "S3_sales", value: 1 },
        { stableKey: "S2_products", value: "robots" },
      ],
    });
    const keys = model.sections.map((s) => s.stableKey);
    expect(keys).not.toContain("S3_strengths");
    expect(keys).toContain("S2_vision");
    expect(keys).not.toContain("__additional_responses__"); // not leaked into the orphan bucket
  });

  it("does NOT suppress for a template without a REPORT_FILTERS entry", () => {
    const model = buildQualitativeModel({
      templateAlias: "qsp-v2",
      sections: [{ stableKey: "S3_strengths", name: "Strengths" }],
      questionsByKey: { S3_a: { type: "SLIDER_LIKERT", label: "A", sectionStableKey: "S3_strengths", min: 1, max: 3 } },
      rawAnswers: [{ stableKey: "S3_a", value: 2 }],
    });
    expect(model.sections.map((s) => s.stableKey)).toContain("S3_strengths");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — after `const aliasMap = templateAlias ? SECTION_PRESENTATION[templateAlias] : undefined;`:

```ts
  // Wave I (ADR-0014) — per-alias report filter.
  const reportFilter = templateAlias ? REPORT_FILTERS[templateAlias] : undefined;
  const suppressedSections = new Set(reportFilter?.suppressSections ?? []);
```

As the FIRST statement inside `for (const section of sectionList) {`:

```ts
    if (suppressedSections.has(section.stableKey)) continue;
```

(Suppressed-section questions were added to `assignedKeys` in Pass 1, so they will not surface in the orphan bucket.)

- [ ] **Step 4: Run → the two Task-2 cases PASS** (`:207` may FAIL — fixed in Task 4; expected).
- [ ] **Step 5: Commit** `feat(assessments): suppress configured sections in qualitative model (Wave I)`.

---

### Task 3: Conditional follow-up gating — hardened (prefix-match once gate is valid; shared predicate; fail-open on malformed)

> **Mechanism (R1-M3 / R2-M3):** once a **valid MULTI_CHOICE** gate question exists in the pinned version, EVERY
> `followupPrefix`-matching key is conditional; render iff its factor ∈ the checked set. This closes the
> per-factor leak (a `S5_why_<f>` whose `<f>` drifted out of the options can't be checked → hidden). **Fail-open**
> when the gate is absent OR not MULTI_CHOICE (never hide content on schema weirdness). A valid gate with a
> missing/non-array answer → empty checked set → all `S5_why_` hidden (= "no factors flagged"). The predicate is
> applied in BOTH the section loop AND the orphan bucket (R2-M1/M3 orphan-bypass fix).

**Files:** Modify `qualitative-report-model.ts` (`buildQualitativeModel`; `QMeta` if `options`/`type` missing);
Test `qualitative-report-model.test.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
const lvaGate = (s4, explanations, opts = {}) => ({
  templateAlias: "leadership-vision-alignment",
  sections: [{ stableKey: "S5_explained", name: "Obstacles Explained" }],
  questionsByKey: {
    S4_biggest_obstacles: {
      type: opts.gateType ?? "MULTI_CHOICE",
      label: "Pick the obstacles",
      sectionStableKey: "S4_obstacles",
      options: [
        { key: "sales", label: "Sales" }, { key: "cash", label: "Cash" },
        { key: "execution", label: "Execution" }, { key: "the_leadership", label: "The Leadership" },
      ],
    },
    S5_why_sales: { type: "TEXT", label: "Why is Sales a hindrance?", sectionStableKey: "S5_explained" },
    S5_why_cash: { type: "TEXT", label: "Why is Cash a hindrance?", sectionStableKey: "S5_explained" },
    S5_why_execution: { type: "TEXT", label: "Why is Execution a hindrance?", sectionStableKey: "S5_explained" },
    S5_why_the_leadership: { type: "TEXT", label: "Why is The Leadership a hindrance?", sectionStableKey: "S5_explained" },
    S5_other_factor: { type: "TEXT", label: "Another factor?", sectionStableKey: "S5_explained" },
    S5_change_one_thing: { type: "TEXT", label: "Change one thing?", sectionStableKey: "S5_explained" },
  },
  rawAnswers: [
    ...(opts.omitGate ? [] : [{ stableKey: "S4_biggest_obstacles", value: s4 }]),
    ...Object.entries(explanations).map(([stableKey, value]) => ({ stableKey, value })),
  ],
});
const s5Keys = (m) => (m.sections.find((s) => s.stableKey === "S5_explained")?.items ?? []).map((i) => i.stableKey);

describe("LVA conditional follow-ups (Wave I)", () => {
  it("renders S5_why_<f> only for checked factors; drops unchecked-but-typed", () => {
    const m = buildQualitativeModel(lvaGate(["sales", "cash"], {
      S5_why_sales: "lost reps", S5_why_cash: "long receivables",
      S5_why_execution: "no cadence", S5_why_the_leadership: "friction",
    }));
    const k = s5Keys(m);
    expect(k).toEqual(expect.arrayContaining(["S5_why_sales", "S5_why_cash"]));
    expect(k).not.toContain("S5_why_execution");
    expect(k).not.toContain("S5_why_the_leadership");
  });
  it("always renders the non-followup S5 questions", () => {
    const k = s5Keys(buildQualitativeModel(lvaGate(["sales"], { S5_other_factor: "hiring", S5_change_one_thing: "rhythm" })));
    expect(k).toEqual(expect.arrayContaining(["S5_other_factor", "S5_change_one_thing"]));
  });
  it("omits a checked-but-blank follow-up", () => {
    expect(s5Keys(buildQualitativeModel(lvaGate(["sales"], { S5_why_sales: "   " })))).not.toContain("S5_why_sales");
  });
  it("valid gate + missing answer → all S5_why_ hidden", () => {
    const k = s5Keys(buildQualitativeModel(lvaGate([], { S5_why_sales: "x" }, { omitGate: true && false })));
    // omitGate:false but s4=[] (answered empty) → nothing checked
    expect(k).not.toContain("S5_why_sales");
  });
  it("FAIL-OPEN: no gate question in the version → renders answered-only", () => {
    const k = s5Keys(buildQualitativeModel(lvaGate(["sales"], { S5_why_sales: "x" }, { omitGate: true })));
    expect(k).toContain("S5_why_sales");
  });
  it("FAIL-OPEN: gate present but NOT MULTI_CHOICE → renders answered-only", () => {
    const k = s5Keys(buildQualitativeModel(lvaGate(["sales"], { S5_why_sales: "x" }, { gateType: "TEXT" })));
    expect(k).toContain("S5_why_sales");
  });
  it("does not gate orphaned S5_why_ either: an unchecked orphaned follow-up is NOT in Additional responses", () => {
    const m = buildQualitativeModel({
      templateAlias: "leadership-vision-alignment",
      sections: [], // no section claims the question → orphan path
      questionsByKey: {
        S4_biggest_obstacles: { type: "MULTI_CHOICE", label: "g", options: [{ key: "sales", label: "Sales" }, { key: "cash", label: "Cash" }] },
        S5_why_cash: { type: "TEXT", label: "Why Cash?" }, // no sectionStableKey → orphan
      },
      rawAnswers: [{ stableKey: "S4_biggest_obstacles", value: ["sales"] }, { stableKey: "S5_why_cash", value: "x" }],
    });
    const add = m.sections.find((s) => s.stableKey === "__additional_responses__");
    expect((add?.items ?? []).map((i) => i.stableKey)).not.toContain("S5_why_cash");
  });
});
```

- [ ] **Step 2: Run → the "only checked" / blank / orphan / empty-answer cases FAIL.**

- [ ] **Step 3a: ensure `QMeta` carries `type` and `options`** (add if missing): `options?: Array<{ key: string; label: string }>;`

- [ ] **Step 3b: Implement** — extend the Task-2 filter block:

```ts
  // Conditional follow-ups (ADR-0014). Gate only when a VALID MULTI_CHOICE gate
  // question exists in THIS pinned version → fail open otherwise (never hide on
  // schema weirdness). A valid gate with a missing/non-array answer → empty set
  // → all prefix-matching follow-ups hidden ("no factors flagged").
  const cf = reportFilter?.conditionalFollowups;
  const gateMeta = cf ? metaByKey.get(cf.gateKey) : undefined;
  const gateValid = !!cf && gateMeta?.type === "MULTI_CHOICE";
  const gateAnswer = cf ? answerByKey.get(cf.gateKey) : undefined;
  const checkedFactorKeys = new Set(
    gateValid && Array.isArray(gateAnswer) ? (gateAnswer as unknown[]).map(String) : [],
  );
  const isHiddenFollowup = (key: string): boolean =>
    gateValid &&
    key.startsWith(cf!.followupPrefix) &&
    !checkedFactorKeys.has(key.slice(cf!.followupPrefix.length));
```

In the per-item loop `for (const { key, meta } of questions) {`, as the FIRST statement:

```ts
      if (isHiddenFollowup(key)) continue;
```

In the orphan bucket loop (`for (const [key, meta] of questionEntries)` near "Additional responses"), as the FIRST statement after `if (assignedKeys.has(key)) continue;`:

```ts
      if (isHiddenFollowup(key)) continue;
```

> Gate-answer shape: if Pre-flight #2 finds MULTI_CHOICE can arrive as `selectedKeys` (not `value`), normalize it
> where `answerByKey` is built (lift `selectedKeys` → the value) so `gateAnswer` is the array — do NOT special-case
> only the gate.

- [ ] **Step 4: Run → all Task-3 cases PASS.**

- [ ] **Step 5: Seed-invariant guard test** (R1-M3 belt-and-suspenders) — in `lva-content.test.ts` (or the model test):

```ts
it("every S5_why_ follow-up has a matching S4 option (gate invariant)", () => {
  const content = buildLvaContent(); // from seed-lva-assessment
  const optionKeys = new Set(
    (content.questions.find((q) => q.stableKey === "S4_biggest_obstacles")?.options ?? []).map((o) => o.key),
  );
  const followups = content.questions.filter((q) => q.stableKey.startsWith("S5_why_"));
  expect(followups.length).toBeGreaterThan(0);
  for (const q of followups) expect(optionKeys.has(q.stableKey.slice("S5_why_".length))).toBe(true);
});
```

- [ ] **Step 6: Run → PASS. Commit** `feat(assessments): gate LVA S5 follow-ups on checked S4 factors, fail-open on malformed gate (Wave I)`.

---

### Task 4: Repair the two existing tests broken by S3 suppression

**Files:** `qualitative-report-model.test.ts` (`:207`); `qualitative-report.test.tsx` (the S3 "renders a rating item" case).

- [ ] **Step 1:** Re-point the model `:207` 'rating' test off the LVA alias — set `templateAlias: undefined`
  (delete the line) and retitle to `"assigns 'rating' for an all-slider 1-3 section and carries min/max"`. With no
  alias, `classifyByTypes` still yields `'rating'`; min/max assertions hold. (`'rating'` is also covered by the
  QSP-v1 `S3_quarter_grid` case at `:248`.)

- [ ] **Step 2:** Replace the component `"renders a rating item showing the respondent's pick …"` body with:

```ts
  it("does NOT render the S3 strengths matrix for LVA (it lives in the group report)", () => {
    render(<QualitativeReport report={lvaReport()} />);
    expect(screen.queryByTestId("qual-section-S3_strengths")).not.toBeInTheDocument();
  });
```

- [ ] **Step 3:** Add a non-LVA 'rating' render test to keep `RatingBlock` covered:

```ts
  it("renders Weak/Average/Strong for an all-slider 1-3 section (non-LVA)", () => {
    const report = baseReport({
      templateAlias: undefined,
      sections: [{ stableKey: "ratings", name: "Ratings" }],
      questionsByKey: { r_sales: { type: "SLIDER_LIKERT", label: "Sales", sectionStableKey: "ratings", min: 1, max: 3 } },
      rawAnswers: [{ stableKey: "r_sales", value: 1 }],
    });
    render(<QualitativeReport report={report} />);
    const section = screen.getByTestId("qual-section-ratings");
    expect(section.textContent).toMatch(/Weak/);
    expect(section.textContent).toMatch(/Strong/);
  });
```

- [ ] **Step 4: Run** `npm test -- --testPathPatterns="qualitative-report-model|qualitative-report.test"` → PASS.
- [ ] **Step 5: Commit** `test(assessments): re-point S3 'rating' coverage off the suppressed LVA alias (Wave I)`.

---

### Task 5: Filter provenance in audit / metrics / outbox (R2-M4)

> Because `REPORT_FILTERS` changes rendered bodies **code-only** (same `versionId`/`contentHash` → different body,
> and sent emails are purged), surface non-PII provenance so the retroactive change is auditable.

**Files:** Modify `qualitative-report-model.ts` (return shape); locate + modify the VIEW_REPORT audit + report
metrics + report-email outbox enqueue/render sites; Tests in the model test + the audit/email tests.

- [ ] **Step 1: Failing test** — model returns provenance counts:

```ts
it("returns filter provenance (id + suppressed/hidden counts) for LVA", () => {
  const m = buildQualitativeModel(lvaGate(["sales"], { S5_why_sales: "x", S5_why_cash: "y" }));
  expect(m.filterProvenance).toEqual(expect.objectContaining({
    filterId: "lva-cond-v1",
    hiddenFollowupCount: 1,        // cash typed but unchecked
  }));
});
```
(For a suppression case, assert `suppressedSectionCount: 1`.)

- [ ] **Step 2: Run → FAIL** (no `filterProvenance`).

- [ ] **Step 3: Implement** — extend `QualitativeModel` with
  `filterProvenance?: { filterId: string; suppressedSectionCount: number; hiddenFollowupCount: number }`.
  Increment a `suppressedSectionCount` when a section is skipped and a `hiddenFollowupCount` when `isHiddenFollowup`
  drops an item (in both loops). Populate `filterProvenance` only when `reportFilter` is defined, with
  `filterId: REPORT_FILTER_VERSION`. Return it alongside `sections`.

- [ ] **Step 4: Wire provenance into the audit + metrics + outbox.**
  - Locate the `VIEW_REPORT` audit write + `assessment.respondent_report.*` metric emission. They are NOT in
    `respondent-report.ts` — grep `VIEW_REPORT`, `respondent_report`, `logAudit`, `recordMetric` across
    `src/lib/assessments/` (likely the report-access gate `report-access-gate.ts` / `report-gate-core.ts` or the
    `(report)` route). Add `filterId` + the two counts to the audit `changes` payload and the metric tags.
  - In `report-email.ts` (outbox enqueue / render), include the same provenance in the enqueue/render log line.
  - Thread the counts from the model's `filterProvenance` (do not recompute).

- [ ] **Step 5: Run → PASS** (model test + a light audit-payload assertion). **Commit**
  `feat(assessments): record LVA report-filter provenance in audit/metrics/outbox (Wave I)`.

---

### Task 6: Real-seed integration + consumer (screen + email) e2e tests (R1-M2, R1-M4)

**Files:** new/extended tests in `qualitative-report-model.test.ts`, `qualitative-report.test.tsx`,
`report-email-qualitative.test.ts`.

- [ ] **Step 1: Real-seed integration test** — prove the filter keys match the ACTUAL seed:

```ts
import { buildLvaContent } from "@/../prisma/seed-lva-assessment"; // adjust path to the seed export
import { buildQuestionMetaByKey } from "@/lib/assessments/question-meta";

it("suppresses S3 and gates S5 on the REAL LVA seed content", () => {
  const content = buildLvaContent();
  const questionsByKey = buildQuestionMetaByKey(content.questions);
  const sections = content.sections; // shape it as buildQualitativeModel expects
  const model = buildQualitativeModel({
    templateAlias: "leadership-vision-alignment",
    sections,
    questionsByKey,
    rawAnswers: [
      // every S3 answered, S4 picks sales+cash, S5 typed for sales+cash+execution(unchecked)
      ...content.questions.filter((q) => q.stableKey.startsWith("S3_")).map((q) => ({ stableKey: q.stableKey, value: 2 })),
      { stableKey: "S4_biggest_obstacles", value: ["sales", "cash"] },
      { stableKey: "S5_why_sales", value: "a" }, { stableKey: "S5_why_cash", value: "b" },
      { stableKey: "S5_why_execution", value: "c" },
      { stableKey: "S5_other_factor", value: "d" },
    ],
  });
  const keys = model.sections.map((s) => s.stableKey);
  expect(keys).not.toContain("S3_strengths");
  const s5 = model.sections.find((s) => s.stableKey === "S5_explained")?.items.map((i) => i.stableKey) ?? [];
  expect(s5).toEqual(expect.arrayContaining(["S5_why_sales", "S5_why_cash", "S5_other_factor"]));
  expect(s5).not.toContain("S5_why_execution");
});
```
(Adjust the seed import path / `sections` shaping to match `buildLvaContent`'s actual return; confirm in Pre-flight.)

- [ ] **Step 2: `QualitativeReport.tsx` e2e** — extend the `lvaReport()` fixture to include S4 (`value: ["sales"]`,
  with options) + `S5_why_sales` (checked) and `S5_why_cash` (typed, unchecked). Assert the checked text renders
  and the unchecked text is absent:

```ts
  it("renders only the checked obstacle explanation (screen)", () => {
    render(<QualitativeReport report={lvaReportWithObstacles()} />);
    const root = screen.getByTestId("qualitative-report");
    expect(root.textContent).toContain("checked-sales-text");
    expect(root.textContent).not.toContain("unchecked-cash-text");
  });
```

- [ ] **Step 3: `report-email.ts` e2e** — same assertion against the email HTML builder (checked present, unchecked
  absent). Use the existing `report-email-qualitative.test.ts` harness.

- [ ] **Step 4: Run → PASS. Commit** `test(assessments): real-seed integration + screen/email gated-followup e2e (Wave I)`.

---

### Task 7: Regression sweep + build gate

**Files:** none (verification only)

- [ ] **Step 1:** `npm test -- --testPathPatterns="assessments|qualitative|report-email|lva|respondent-report|group-report|question-meta"` → PASS.
  Confirm `report-email-qualitative.test.ts`, `report-email.test.ts`, `lva-content.test.ts`, and the group-report
  suites are green.
- [ ] **Step 2:** `CI=true npx next build --turbopack 2>&1 | tail -15` → clean.
- [ ] **Step 3:** `npx eslint` on every changed file → 0/0.
- [ ] **Step 4: No commit.** Proceed to the whole-branch code review, then stop for the user's merge-go.

---

## Post-build (after merge-go — NOT part of the TDD loop)

- SoT flush: bump CLAUDE.md `LAST_UPDATED_ISO/SLUG`; prepend full detail to `plans/CHANGELOG.md` (incl. the
  approved Task-0 hide-rate numbers).
- Notion task → Done (auto-fires on push to `main`).
- Update memory `project_jeff_june22_touchpoint` (Wave I shipped) and `project_jeff_june9_punchlist` (#29 done).

## Self-review (writing-plans)
- **Spec coverage:** Task 0 audit (R1-H1, R2-M2, R2-L1), Task 1 config (R1-L1 narrowed), Task 2 suppress,
  Task 3 hardened gate + orphan predicate + seed invariant (R1-M1/M3, R2-M3), Task 4 test repair, Task 5
  provenance (R2-M4), Task 6 real-seed + screen/email e2e (R1-M2/M4), Task 7 regression+build. Every claudex
  finding mapped; no superseded snippet remains (R2-M1).
- **Type consistency:** `REPORT_FILTERS`/`ReportFilterConfig`/`REPORT_FILTER_VERSION`, `isHiddenFollowup`,
  `checkedFactorKeys`, `gateValid`, `suppressedSections`, `filterProvenance` named identically across tasks.
