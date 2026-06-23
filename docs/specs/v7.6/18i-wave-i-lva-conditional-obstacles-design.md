# Spec 18i — Wave I: LVA Conditional Obstacles + Strengths-Matrix Removal (per-respondent report)

> **Status: DESIGN LOCKED (brainstorm → grill-with-docs → grill-me → user-approved + preview-signed, June 23 2026). Gating artifact.**
> Build is GATED on (a) this spec, (b) ADR-0014, (c) the per-wave TDD plan
> [18i-…-implementation-plan.md](18i-wave-i-lva-conditional-obstacles-implementation-plan.md).
> Additive: **no schema migration, no seed change, no new route, no feature flag** (reversible by revert).
> This is the deferred **#29 LVA reconcile / conditional-obstacles** item; it is **report-layer only**.

**Source touch-point:** Jeff June 22 2026 call — LVA report has "way too many questions." Grounded against
the Esperto sample LVA PDFs in `From Jeff/APP_scaling up assessemnt/` and Spec 18 §B. Esperto's *individual*
LVA report renders: financials → vision free-text → **obstacles explained for ONLY the checked factors** →
rehire % → focus free-text. It does **not** render the 16-row strengths matrix in the individual report.

---

## A. Problem (two parts, one root)

The LVA per-respondent report over-renders versus Esperto:

1. **S3 16-factor strengths matrix always shows.** All 16 `S3_<factor>` sliders are `isRequired: true`, so
   the answered-only model filter never trims them — every individual report renders a 16-row
   Weak/Average/Strong matrix. Esperto treats that matrix as a **group-level** view (CEO-vs-team), not an
   individual one.
2. **S5 "Why is X a hindrance?" follow-ups are not bound to the S4 obstacle checkboxes.** The survey form
   shows all 16 `S5_why_<factor>` questions unconditionally (the platform has no survey-form conditional
   engine — the seed comment says so). So a respondent can type an explanation for a factor they did **not**
   check in S4, and it renders. Esperto shows explanations **only for the ≤3 checked factors**.

**Root:** there is no conditional logic linking S5 to S4, and the answered-only filter can't express
"only the checked factors." Both are fixable at the **report-model layer** — no survey-form engine needed.

---

## B. Code ground-truth (verified June 23 2026)

- **Seed** `src/prisma/seed-lva-assessment.ts` (alias `leadership-vision-alignment`):
  - `S4_biggest_obstacles` — `MULTI_CHOICE`, `maxChoices: 3`, each option `key = FACTOR_STABLE_KEYS[i]`
    (e.g. `sales`, `cash`, `the_leadership`).
  - `S5_why_<FACTOR_STABLE_KEYS[i]>` — 16 optional `TEXT` follow-ups, plus 2 **always-on** required
    `TEXT` (`S5_other_factor`, `S5_change_one_thing`).
  - `S3_<FACTOR_STABLE_KEYS[i]>` — 16 required `SLIDER_LIKERT` (1–3).
  - So `S5_why_<K>` ↔ S4 option `<K>` is a **deterministic** key relationship.
- **MULTI_CHOICE storage** (`scoring.ts:545`): the stored answer value is an **array of option keys**
  (`["sales","cash"]`), each validated to be a string ∈ `question.options[].key`. The model already proves
  this: `toItem`'s C-H1 path maps stored keys → labels.
- **Model** `src/src/lib/assessments/qualitative-report-model.ts` — `buildQualitativeModel` holds
  `answerByKey` (stableKey → value), `metaByKey` (stableKey → QMeta incl. `options`), and the section loop.
  `SECTION_PRESENTATION[alias]` is the precedent for **alias-keyed report config living in this file**.
- **Loader** `respondent-report.ts:254/261` threads `templateAlias = template.alias` and
  `rawAnswers = submission.answers` into the model on the per-respondent path. (Confirmed reliable.)
- **Consumers** of `buildQualitativeModel`: `QualitativeReport.tsx` (on-screen/print) and `report-email.ts`
  (email twin) — **both**. Filtering at the model layer fixes screen + email together.
- **Group report** uses its own `group-report-model.ts` / `group-report.ts`, **not** `buildQualitativeModel`.
  So suppressing S3 in the per-respondent model does **not** touch the Wave F 16-factor team matrix.
- **LVA is invited-only** — it never appears in the public-quiz path, so there is no public-results path to
  also change.

---

## C. Locked design

A per-alias **`REPORT_FILTERS`** map in `qualitative-report-model.ts` (mirroring `SECTION_PRESENTATION`):

```ts
export interface ReportFilterConfig {
  /** Section stableKeys omitted from the per-respondent report entirely. */
  suppressSections?: string[];
  /** Render a follow-up item only if its factor was selected in a gate MULTI_CHOICE. */
  conditionalFollowups?: { gateKey: string; followupPrefix: string };
}

export const REPORT_FILTERS: Readonly<Record<string, ReportFilterConfig>> = {
  "leadership-vision-alignment": {
    suppressSections: ["S3_strengths"],
    conditionalFollowups: { gateKey: "S4_biggest_obstacles", followupPrefix: "S5_why_" },
  },
};
```

`buildQualitativeModel` applies it generically:

1. **Suppress** — in the section loop, `if (suppressed.has(section.stableKey)) continue;`. Suppressed-section
   questions still carry `sectionStableKey`, so Pass 1 marks them `assignedKeys` → they are **never** re-surfaced
   in the "Additional responses" orphan bucket.
2. **Conditional follow-ups — prefix-match once a VALID gate exists; shared predicate; fail-open on malformed**
   (hardened by the claudex review — supersedes the earlier "derive-from-options" sketch):
   - The gate is **valid** iff `metaByKey.get(gateKey)?.type === "MULTI_CHOICE"`. When valid,
     `checkedFactorKeys = Set(answerByKey.get(gateKey))` if that answer is an array, else `∅`.
   - A shared predicate `isHiddenFollowup(key) = gateValid && key.startsWith(followupPrefix) &&
     !checkedFactorKeys.has(key.slice(prefix.length))` is applied in **both** the per-section item loop **and**
     the orphan "Additional responses" loop (so a malformed/old pinned version can't leak an unchecked follow-up
     into the orphan bucket). Treating **every** prefix-matching key as conditional (not just keys derived from
     current options) closes a per-factor leak: an `S5_why_<f>` whose `<f>` drifted out of the S4 options can't be
     checked → it's hidden.
   - **Fail-open** when the gate question is **absent OR not MULTI_CHOICE** → nothing is gated → answered-only
     (today's behavior); never hide content on schema weirdness. A **valid** gate with a missing/non-array answer
     → `checkedFactorKeys = ∅` → all `S5_why_` hidden (= "no factors flagged").
   - `isReportAnswerPresent` stays the **second** gate (checked-but-blank still omitted).
   - **Gate-answer shape:** the S4 answer must reach the model as an array; if real submissions store MULTI_CHOICE
     as `selectedKeys` rather than `value` (schema:1317), normalize it where `answerByKey` is built.

**Behavioral contract:**
- S3 strengths matrix: **omitted** from the LVA individual report (present in the group report).
- `S5_why_<K>`: rendered iff `<K>` ∈ checked S4 factors **and** the text is non-empty.
- `S5_other_factor`, `S5_change_one_thing`, and the S4 obstacle list itself: **always** rendered (never gated).
- Unchecked-but-typed explanation: **dropped from the report; still stored in the DB** (render-only filter).
- Every other template (QSP v1/v2, Rockefeller, etc.): **unaffected** — no `REPORT_FILTERS` entry.

---

## D. Scope, retroactivity, reversibility

- **Surface:** the LVA per-respondent qualitative report only (on-screen/print + email twin, via the shared
  model). No new route, no migration, no seed edit, no flag.
- **Retroactive (intentional, like ADR-0010's report-type policy):** every *already-submitted* LVA report
  re-renders without S3 and with gated S5 the moment this deploys — not new-submissions-only. Data is
  preserved; only rendering changes. **Pre-merge gate:** a read-only audit (impl-plan Task 0) quantifies how
  many existing reports lose ≥1 obstacle explanation (the *hide rate*); the user approves that number (or a
  legacy fallback) before merge.
- **Provenance (claudex R2-M4):** because this changes rendered bodies **code-only** under the same
  `versionId`/`contentHash` (and sent emails are purged), the model returns non-PII filter provenance
  (`REPORT_FILTER_VERSION` + suppressed-section / hidden-followup counts) that is recorded in the `VIEW_REPORT`
  audit, the `assessment.respondent_report.*` metrics, and the report-email outbox log.
- **Reversible:** revert the commit to restore prior rendering. No data/schema/flag coupling.

---

## E. Out of scope (Wave I) — noted follow-on

- **Survey-form conditional engine** (only *showing* the `S5_why_<factor>` boxes in the survey for checked
  factors). The form still shows all 16; Wave I fixes the **report**, which is Jeff's complaint. The form-level
  conditional is a larger client change → **deferred follow-on**, not Wave I.
- SU Full business logic (Wave J), coach logo / import move (Wave K) — separate waves.

---

## F. Test strategy (for the TDD plan)

- **Existing tests that change** (S3 now suppressed for the LVA alias):
  - `qualitative-report-model.test.ts:207` ("assigns 'rating' for the LVA strengths section") — re-point off
    the LVA alias so it still covers `'rating'` + min/max classification (the QSP-v1 `S3_quarter_grid` test
    at `:248` independently covers `'rating'`, so no coverage is lost).
  - `qualitative-report.test.tsx` ("renders a rating item showing the respondent's pick") — flip to assert
    LVA **suppresses** `S3_strengths`; add a separate non-LVA `'rating'` render test to keep `RatingBlock`
    covered.
- **New model tests:** S3 suppressed despite all-answered; `S5_why_<K>` gated to checked factors;
  unchecked-but-typed dropped; checked-but-blank omitted; always-on + S4 list always render; **fail-open**
  when no S4 gate question; QSP-v2 unaffected (regression).
- **Unchanged / green:** `lva-content.test.ts` (seed untouched); `report-email-qualitative.test.ts`
  (its LVA cases have S4 picks but no `S5_why_` items → nothing to gate) — run both as regression.
- **Build gate:** `CI=true npx next build --turbopack` from `src`.

---

## G. Sequence

1. Spec 18i (this) + ADR-0014 — **done**.
2. Preview mockup (faithful `su-report.css`) → **user-signed June 23**.
3. Per-wave TDD plan — **this artifact set**.
4. Subagent-driven TDD build on `feat/wave-i-lva-conditional-obstacles` → whole-branch review → stop for
   merge-go → SoT flush (CLAUDE.md anchor + CHANGELOG) + Notion.

## H. Open confirmations — all resolved
1. Drop S3 from the individual report — **yes** (config-driven; group report keeps it).
2. Conditional mechanism — per-alias config (A); **prefix-match once a VALID MULTI_CHOICE gate exists, shared
   predicate across section + orphan loops, fail-open on absent/malformed gate** (hardened from the original
   "derive-from-options" by the claudex review).
3. Unchecked-but-typed dropped; form-conditional deferred; keep S4 picks block;
   `REPORT_FILTERS` lives in `qualitative-report-model.ts` — **all confirmed**.
