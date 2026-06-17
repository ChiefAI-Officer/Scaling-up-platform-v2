# Spec 17 Wave E — Report Polish & Accuracy (design)

> **Status:** GATED. This is the brainstorm-approved design. Next step is `/grill-with-docs` → `/grill-me` → user approval → per-wave implementation plan (`17e-…-implementation-plan.md`) → subagent-driven build. NO implementation until the plan is approved.
>
> **Parent:** [`17-jeff-june9-feedback-punchlist.md`](./17-jeff-june9-feedback-punchlist.md) (catalog of all 33 items). Wave E = items **#21, #24, #25, #26, #27, #28, #29, #30, #31, #33**.
>
> **Source material (Jeff, authoritative):** `From Jeff/APP_scaling up assessemnt/` — per-template folders with the assessment xlsx **and** the **Esperto-rendered report PDFs** (the side-by-side target):
> - `APP_leadership vision alignment assessment/` — LVA source xlsx + 3 individual report PDFs + 1 **group** report PDF.
> - `APP_qtr session prep v2/` — QSPv2 xlsx + 3 individual + 1 group report PDF.
> - `APP_qtr session prep v1/` — QSPv1 xlsx + 1 report PDF.
> - `APP_Rockerfeller/` — Rockefeller xlsx + 6 report PDFs (per-person + Full Team).

---

## 1. The finding that shapes the wave

Our canonical per-respondent report (`BrandedReport`, [`src/src/components/assessments/BrandedReport.tsx`](../../../src/src/components/assessments/BrandedReport.tsx)) is a **scored** report: cover → 0–100 score ring → per-decision domain cards → **"All sections" score/average table** → recommendations → footer. It adapts per template only *indirectly*, via `scoringConfig` shape and `perDomain` presence (lines ~176–194) — it has **no explicit template identity**.

Reading the Esperto reference PDFs shows that the templates are **two fundamentally different report types**:

| Template | Esperto report type | Evidence |
|---|---|---|
| Scaling Up Full, Quick (4-Decisions), **Five Dysfunctions** | **Scored** — score/ring + per-category breakdown is the point (Five D = Jeff's "totals by category") | domains/rollup |
| Rockefeller (checklist) | **Scored** — tier band + checklist; but the per-section *average* table is redundant | #24 |
| **LVA**, **QSP v1/v2** | **Qualitative "prep" reports** — the value is the respondent's *answers organized by theme* (Vision table → "main products in 3 years" Q&A → "Obstacles and challenges explained" → "Important Focus areas" charts → BHAG / Core Purpose / Strategy Q&A). **No score ring, no overall total, no "All Sections" aggregate.** | LVA + QSP PDFs |

This is why Jeff wants the score tables *gone* from LVA/QSP/Rockefeller (#24/#27/#28/#30) and LVA *restructured* (#31): forcing a qualitative survey through the scored anatomy produces the wrong report. The **only** place a respondent's actual answers render today is the **deprecated raw view** (#21) — so **#21 and #31 are the same underlying need**: the respondent's real answers, branded and themed.

**A principled "hide the score table when the template is neutral-tier" rule is wrong** — Five Dysfunctions *is* neutral-tier yet exists to show Jeff's per-category totals (the table he wants **kept**). So per-template behavior must be **explicit**, not inferred.

---

## 2. Wave shape — two slices

| Slice | Items | Nature | Gate |
|---|---|---|---|
| **E-1 · Mechanical report cleanup** | #21, #24, #25, #26 | per-template config + small content; touches `BrandedReport.tsx` + `report-email.ts` + 1 seed/scale + 1 deprecated view | **buildable now** — no mockup, no Jeff input |
| **E-2 · Qualitative report (LVA + QSP)** | #27, #28, #29, #30, #31 | a new **generic qualitative report variant** (section + question-type driven) matching the Esperto LVA/QSP PDFs; wired to LVA + QSP v1/v2 | **`/frontend-design` mockup first** (user decision), then build |
| **Blocked / deferred** | #33 | full all-reports accuracy diff | open — pends Jeff's side-by-side; the Esperto PDFs already anchor E-1/E-2 |

Ship **E-1 first** (fast, low-risk, reversible by revert + Vercel promote-previous, no flag — same posture as Wave C), then **E-2** (mockup-gated). Same slice-and-ship pattern as Wave D.

> **Grill G2 (resolved):** QSP v1/v2 get the **qualitative renderer** in Wave E, not a literal table-removal. Removing only the "All Sections" table (#27/#28) leaves QSP visibly score-framed ("Submitted" block + "How you scored, section by section" cards + recommendations) — a half-measure for a template Jeff sees as qualitative (he flagged it twice). The `QualitativeReport` is built **generically** (section + question-type driven, not LVA-hardcoded), so wiring QSP is a one-line config flip. **#27/#28 therefore move from E-1 → E-2.** QSP gets **no content reconcile** (only LVA #29 is Jeff-flagged) — existing QSP content renders as-is. The `/frontend-design` mockup gains a QSP frame. Risk noted: QSP content may carry the same divergence/empty-section gaps as LVA; a *light* read-only diff of the QSP source xlsx (`APP_qtr session prep v1/v2`) is advisable in the plan, but not a committed #29-style reconcile.

---

## 3. Architecture — explicit per-template report config

Introduce a single source of truth for per-template report behavior, keyed by the template's existing **`AssessmentTemplate.alias`** (`leadership-vision-alignment`, `qsp-v2`, `qsp-v1`, `RockHabits`). No schema change — the alias already exists on the template row; the report loader simply selects it and passes it through the report payload. **This report-type split is captured in [ADR-0010](../../adr/0010-assessment-reports-have-two-types-scored-and-qualitative.md)** (scored vs qualitative, explicit per-template config, orthogonal to the ADR-0002 neutral-tier concept).

**New module** `src/src/lib/assessments/report-config.ts`:

```ts
export type ReportType = "scored" | "qualitative";

export interface ReportConfig {
  reportType: ReportType;     // which renderer
  showScoreTable: boolean;    // the "All sections" score/average table
}

// Keyed by AssessmentTemplate.alias (VERIFIED against the seed files; stable across versions —
// versions are appended by template alias, the per-version alias is separate).
// Unknown alias → DEFAULT (current behavior, fully back-compatible).
const REPORT_CONFIG: Record<string, ReportConfig> = {
  "RockHabits":                  { reportType: "scored",      showScoreTable: false }, // #24 (stays scored, table off)
  "qsp-v1":                      { reportType: "qualitative", showScoreTable: false }, // #28 (G2: qualitative)
  "qsp-v2":                      { reportType: "qualitative", showScoreTable: false }, // #27 (G2: qualitative)
  "leadership-vision-alignment": { reportType: "qualitative", showScoreTable: false }, // #30 + #31
  // KEEP-set (omitted → DEFAULT → scored + table): "five-dysfunctions", "scaling-up-full", "scaling-up-quick"
};

export const DEFAULT_REPORT_CONFIG: ReportConfig = { reportType: "scored", showScoreTable: true };
export function reportConfigFor(alias: string | null | undefined): ReportConfig { /* lookup ?? DEFAULT */ }
```

**Wiring:** the respondent-report loader (`getRespondentReport`, `src/src/lib/assessments/respondent-report.ts`) selects `campaign.template { id, name }` today — **add `alias: true`** to that select and pass `templateAlias` through the `RespondentReport` payload type (currently absent; only `provenance.templateName` exists). `BrandedReport` and `report-email.ts` both call `reportConfigFor(report.templateAlias)`:
- `showScoreTable === false` → omit the "All sections" `<section className="su-report-scores">` block ([BrandedReport.tsx:564–630](../../../src/src/components/assessments/BrandedReport.tsx)) and the mirror block in [`report-email.ts:425–470`](../../../src/src/lib/assessments/report-email.ts).
- `reportType === "qualitative"` → render the new qualitative variant (E-2) instead of the scored anatomy.

**Alias strings VERIFIED against the seed files** (`grill-with-docs`, 2026-06-17): `RockHabits`, `qsp-v1`, `qsp-v2`, `leadership-vision-alignment`; keep-set `five-dysfunctions` / `scaling-up-full` / `scaling-up-quick`. Keying mechanism resolved (Grill #1).

---

## 4. E-1 — mechanical cleanup (item by item)

### #25 — Footer cleanup (ALL reports)
Footer becomes exactly: **submission date · Scaling Up logo · "Generated by Scaling Up Platform"** — nothing else.
> **Grill G6 (resolved):** the current footer ([BrandedReport.tsx:689–695](../../../src/src/components/assessments/BrandedReport.tsx)) shows a `.su-report-provenance` span `Submission {id} · v{version} · {hash} · generated {now}` **+** a `Generated by the Scaling Up Assessment platform · Confidential` line — and the date shown is the **generation time** (`new Date()`), not the submission. Fixes: **(1)** delete the provenance span entirely (id/version/hash/generated-now); **(2)** show the **submission date** (`report.submittedAt`, the value the cover already formats), not `new Date()`; **(3)** change the credit to `Generated by Scaling Up Platform` and **drop "· Confidential"** (Jeff's #25 says "only" those three elements). Same edits in [`report-email.ts:578`](../../../src/src/lib/assessments/report-email.ts). Provenance stays in the data + the `VIEW_REPORT` audit log — only the *visible* stamp is removed. Both render paths; every template.

### #24 — Rockefeller: drop the "All Sections" score/average table
`reportConfigFor("RockHabits").showScoreTable === false`. Keep the tier band + overall (Rockefeller stays `scored`). One config entry; no Rockefeller-specific code.

### #27 / #28 — QSP v2 / v1: remove "Score Summary – All Sections"
**Moved to E-2 (Grill G2).** QSP v1/v2 become `reportType: "qualitative"` → the score summary (and the score-framed "Submitted"/section-cards/recs anatomy) disappears by construction. See §5. (Footer #25 still applies globally in E-1.)

### #26 — QSPv2: whole-number ratings (1–10, no decimals)
> **Grill G5 (resolved): this is a LABEL fix, not a scale fix.** The QSPv2 scale is already `step: 1` (whole numbers, [`seed-qsp-v2-assessment.ts:69–72`](../../../src/prisma/seed-qsp-v2-assessment.ts)) and `formatNumber` already drops trailing `.0` for integers ([`BrandedReport.tsx:109–113`](../../../src/src/components/assessments/BrandedReport.tsx)). The real defect: the **first question's label** reads `"How would you rate the past Quarter? (1-10) (with 1 decimal)"` ([`seed-qsp-v2-assessment.ts:196`](../../../src/prisma/seed-qsp-v2-assessment.ts)) — the "(with 1 decimal)" text contradicts the integer scale. **Fix = strip "(with 1 decimal)" from the label** → corrected **DRAFT re-seed + publish** (forward-only; existing pinned campaigns keep the old label). No report-display or input-scale change needed.

### #21 — Raw-data view: question codes → question text
The Coaches-Portal "Raw Data" view ([`AssessmentResultView.tsx:264–268`](../../../src/src/components/assessments/AssessmentResultView.tsx)) renders `q.stableKey` (e.g. `q1_1`) as monospace. It is the **deprecated** Phase-1 fallback (BrandedReport is canonical), but Jeff flagged it and the fix is cheap: map `stableKey → question label` using the label data the loader already has (`BrandedReport` already does this via `labelFor()` at [`BrandedReport.tsx:200–209`](../../../src/src/components/assessments/BrandedReport.tsx)). Surface the label (keep the code as a small muted secondary if useful). No new data plumbing beyond passing the existing label map into the view.

**E-1 render-path rule:** every score-table / footer change must land in **both** `BrandedReport.tsx` (on-screen + Print-to-PDF) and `report-email.ts` (emailed copy) so the two never drift. Targeted tests assert the removed blocks are absent for the configured templates and present for the defaults.

---

## 5. E-2 — Qualitative report: LVA + QSP (mockup-gated)

**Goal:** a **generic** qualitative report renderer (section + question-type driven, not LVA-hardcoded) matching the Esperto LVA/QSP PDFs — a branded, themed presentation of the respondent's answers, *not* a score sheet. Wired in Wave E to **LVA** (`leadership-vision-alignment`) and **QSP v1/v2** (`qsp-v1`, `qsp-v2`). Only **LVA** gets a content reconcile (#29); QSP renders existing content as-is.

> **Grill G1 (resolved):** the LVA qualitative report is **per-respondent only — NO team "Mean" column.** Esperto's Mean is a team average across all submissions; computing it is group-aggregation = **Wave F #22 (group report)**. Our loader is single-respondent by design (the current score table is even commented `G3 — no team average`). Wave E renders only *this* respondent's themed answers / ratings / bar values; the Esperto Mean columns are omitted. The team-Mean/group view stays Wave F.

### Esperto LVA anatomy (the target)
1. **Cover** — purple, white SU logo + "A GAZELLES COMPANY" + S-curve mark + "Your Leadership Vision Alignment Report" + Four-Decisions top stripe + "for: {name}".
2. **Preface** — "Dear {name}, This is your report from the {Assessment Name}… We wish you many great insights." **Grill G4 (resolved): text-only branded preface, NO Verne photo/signature** in Wave E — we don't have those assets and a real person's likeness/signature needs the asset (and arguably permission); it overlaps #19 custom-slides and can be added there later. Keep the white SU logo. The per-template preface copy is adapted from each assessment's intro.
3. **The Vision on the Future** — a quantitative **Mean vs respondent** table (revenue, gross margin, net profit, customers, employees, FTE, branches, countries).
4. **"…in three years" Q&A** — heading = question, row = `{name}({role}): {answer}` (products, partners, competitors, news, success, employees, major initiatives, reasons-not-to-reach).
5. **Obstacles and challenges explained** — Q&A grouped by the chosen growth factors (Sales / Cash / Execution / Other / "what would you change"). *This is the section Jeff's #29 flags as not matching our seed.*
6. **Important Focus areas** — e.g. "% you'd enthusiastically rehire" rendered as a **bar chart** (value + Mean).
7. **BHAG / Core Purpose / Core Values / Market focus / Core customer / Strategy / Strategy execution / Goals clear / #1 priorities / KPIs / leadership-team / leadership-position** — Q&A blocks.

### #31 — layout / new renderer (shared data layer + two presentation layers)
> **Grill G10 (resolved):** the qualitative renderer ships **both** an on-screen/PDF view **and** an email twin, because `report-email.ts` (the Wave D #15 results-email + #16 coach-notify, **live in prod**) currently renders the **scored** anatomy for every template — so enabling #15 on an LVA/QSP campaign emails the wrong (scored) report today. Architecture mirrors the existing `BrandedReport` ↔ `report-email.ts` split:
> - **Shared data layer** `src/src/lib/assessments/qualitative-report-model.ts` — groups the respondent's answers by section and maps each question to a presentation kind. Computed **once**.
> - **On-screen** `src/src/components/assessments/QualitativeReport.tsx` (rendered when `reportType === "qualitative"`).
> - **Email** inline-HTML path in `report-email.ts` (selected by `reportConfigFor(alias).reportType`).
>
> **Governing rule (Grill-me #1):** render **only *answered* questions; omit blank answers and fully-empty sections.** Our platform has **no conditional logic** — LVA's 16 "Why is [factor] a hindrance?" follow-ups are all *optional* TEXT, of which a respondent answers only the ~3 matching their `MULTI_CHOICE` pick-3. Suppressing blanks reproduces Esperto's conditional "only the picked obstacles show" output **organically** (no conditional engine) and keeps the report clean. Submitted required questions are always answered; a genuinely-empty value is omitted rather than printed as "Not answered".
>
> Per-question type → presentation (**per-respondent only**, no Mean per G1; exact contract = mockup input, G8):
> - TEXT → Q&A row (heading + the respondent's answer).
> - **NUMBER group** (consecutive NUMBER questions in a section, e.g. LVA financials) → a compact metric table (Esperto's "Vision on the Future" table), respondent column only.
> - single **NUMBER percentage** (e.g. rehire %) → a bar showing the respondent's value.
> - **SLIDER_LIKERT matrix** (LVA S3, 16 factors) → the respondent's own compact factor→rating table (Weak/Average/Strong). **Grill-me #2: include** (it's the leader's own ratings; ADR-0003 deferred only the *team-averaged* group bar). Mockup-confirm.
> - SLIDER group (QSP statement ratings) → the respondent's own rating list (no team-Mean column).
> - MULTI_CHOICE / CHECKBOX → selected labels; the matching answered follow-up TEXT rows render under it (blanks suppressed → only picked factors show).
> Brand stays scoped (`.su-public-brand .su-report`, ADR-0005). **Print-to-PDF:** the restructure must paginate cleanly (`page-break-inside: avoid` on section blocks/cards) — #31's complaint is "one long unbroken block", so the fix is *both* a sectioned layout *and* clean PDF pagination, not just reflow.

**Mockup gate:** a `/frontend-design` mockup of `QualitativeReport` (matching the Esperto LVA/QSP PDFs, in the existing SU report brand) must be **user-approved before E-2 build** — consistent with PRs #41/#51/#54 and the user's Wave E decision. The mockup covers the LVA frame (and a QSP frame per G2).

### #30 — drop the LVA "All Sections" table
Falls out of `reportType: "qualitative"` (the qualitative renderer has no aggregate score table). Config also sets `showScoreTable: false` for safety.

### #29 — LVA content reconcile (against Jeff's source xlsx)
> **Grill G3 (resolved):** **Jeff's xlsx is authoritative** for LVA question/section content (domain authority overrides our "verbatim Esperto" reseed). #29 produces a **question-by-question diff** (our seed vs the xlsx, sample-answer cells stripped) → reconciled into a **corrected DRAFT version** (never a blind overwrite). **Publishing stays a human gate** (`09b-publish-review-checklist.md`): the diff goes into the review doc, Jeff/admin reviews + publishes. So #29 is **build-unblocked** (the renderer ships regardless) and the content correction publishes when reviewed. Our LVA section structure already matches Esperto — the divergence is *within* sections (obstacle factor list + "Why is [factor] a hindrance?" follow-ups), so this is fine-grained, not a restructure.

Our LVA seed was an adversarially-verified "verbatim Esperto" reseed, yet Jeff says the questions (esp. "Obstacles and Challenges") don't match. **The task starts with a diff, not an overwrite:**
1. Diff our current LVA seed (`src/prisma/seed-lva-assessment.ts`) against the extracted source (`From Jeff/.../leadership visin alignment assement.xlsx` → `xl/sharedStrings.xml`).
2. Surface material discrepancies (question wording, section grouping, the growth-factor matrix, the empty Welcome/Completion copy already noted in the v2 sweep).
3. Reconcile → corrected **DRAFT re-seed + publish** (additive, no schema), following the established seed discipline (`safe-seed.mjs` guards, `09b-publish-review-checklist.md`).

This **subsumes Wave G's LVA content re-seed** (the #29 ↔ Wave G overlap is hereby resolved into Wave E).

### Forward-only content caveat (#26, #29)
Campaigns **pin** a `TemplateVersion`. A corrected re-seed publishes a **new** version → it affects **NEW campaigns only**; existing/in-flight campaigns keep their pinned version. This is the established behavior (ADR-0001/0002, seed discipline) and is forward-only by design. Confirm with Jeff that forward-only is acceptable (grill Q6).

---

## 6. Out of scope (Wave E)

- **#33 full accuracy diff** — held for Jeff's side-by-side. The Esperto PDFs already anchor E-1/E-2; remaining per-report nits fold in as Jeff's diffs arrive.
- **QSP *content* reconcile** — E-2 wires QSP to the qualitative renderer (Grill G2) but does **not** reconcile QSP question content against its source (only LVA #29 is Jeff-flagged). A light read-only QSP-xlsx diff is advisable in the plan; a committed re-seed is out of scope.
- **Group / Team reports** — Esperto ships LVA/QSP/Rockefeller **group** reports (the "Full Team" / "Group report" PDFs). That is **Wave F #22** (CEO/group report, own ADR), not Wave E.
- **#22 / #23 / #32** — net-new report subsystems, Wave F.

---

## 7. Constraints

- **Additive only.** No migration for report rendering (config module + components + a passthrough field on the report payload). Content fixes (#29 LVA questions, #26 QSPv2 label) are **DRAFT re-seed + publish** — no schema change.
- **No feature flag (E-1 *or* E-2).** **Grill G7 (resolved):** E-2 is pure rendering (a new renderer path keyed by `REPORT_CONFIG`; unknown/omitted alias → current behavior) with no external side effects — unlike Wave D's send-side risk, it needs no kill switch. Rollback = revert + Vercel promote-previous, or flip an alias back to `scored`/default (a one-line config change). The `REPORT_CONFIG` map *is* the kill-switch.
- **Both render paths stay consistent** — `BrandedReport.tsx` and `report-email.ts` change together for every score-table/footer edit.
- **Brand stays scoped** — all report CSS under `.su-public-brand .su-report` ([`su-report.css`](../../../src/src/styles/su-report.css)), ADR-0005, zero global leak.
- **Subagents never run DB-connecting commands** (local `DATABASE_URL` may point at prod). Seed diffs are read-only; any publish is an explicit, guarded, user-run step.
- **Build gate:** `CI=true npx next build --turbopack` from `/src` + `eslint` on changed files + targeted tests.

---

## 8. Grill resolutions (`/grill-with-docs`, 2026-06-17)

1. **Per-template keying** — ✅ RESOLVED by exploration. Key on `AssessmentTemplate.alias` (stable across versions); add `alias` to the loader's `template` select; pass `templateAlias` through `RespondentReport`; source-code `REPORT_CONFIG` map; unknown → safe default (scored + table). Aliases verified.
2. **E-2 scope** — ✅ **G2:** build the renderer **generically**; wire **LVA + QSP v1/v2** to `qualitative` this wave (#27/#28 satisfied by construction, moved E-1→E-2). QSP gets no content reconcile.
3. **#29 conflict resolution** — ✅ **G3:** Jeff's xlsx is authoritative; diff (answers stripped) → corrected DRAFT; publish is the human gate (09b). Build-unblocked.
4. **Preface block** — ✅ **G4:** text-only branded preface, NO Verne photo/signature (overlaps #19; assets/permission); keep SU logo.
5. **#26** — ✅ **G5:** it's a **label fix** (strip "(with 1 decimal)") — scale already integer, display already integer. DRAFT re-seed + publish.
6. **Forward-only content fix** — ✅ **G3/G5:** existing pinned campaigns keep their version (established ADR-0001/0002 behavior). Forward-only by design; Jeff signs off at publish.
7. **E-2 flag** — ✅ **G7:** no flag; pure rendering, config-gated, `REPORT_CONFIG` is the kill-switch.
8. **Raw view (#21)** — ✅ fix-in-place (brainstorm decision); retiring the deprecated view (ADR-0007 Phase-2) stays out of scope.

### `/grill-me` resolutions (2026-06-17)
- **Grill-me #1 — ✅ governing rule:** render only *answered* questions; omit blank answers + fully-empty sections → reproduces Esperto's conditional obstacle output with no conditional engine (we have none). Resolves G9. See §5.
- **Grill-me #2 — ✅ matrix display:** include the respondent's own 16-factor ratings as a compact table (per-respondent; ADR-0003 deferred only the team-averaged group bar). Mockup-confirm.
- **QSP content check — ✅ scoped:** the plan includes a *light read-only diff* of QSP v1/v2 seed vs `APP_qtr session prep v1/v2` xlsx (insurance now that QSP content renders prominently). Surface gaps to Jeff; do **not** auto-reconcile (only #26 label is a committed QSP content change).

### Still genuinely open (carry to plan / mockup)
- **G8:** the exact question-type → presentation contract (refined in §5) is finalized by the `/frontend-design` mockup against the Esperto LVA/QSP PDFs.

---

## 9. /claudex:plan hardening — Round 2 (security & data-integrity) — AUTHORITATIVE over the body

Adversarial review run `20260617-185054-d60e32`, round 2. Findings folded below; the Changelog records accept/reject. These supersede the body where they conflict.

- **R2-H1 (ACCEPT) — thread `templateAlias` + raw answers through EVERY report-assembly path, not just `getRespondentReport`.** The email path does **not** call `getRespondentReport`: the submit routes build the email payload directly via `buildReportEmailHtml({ report, … })`, whose input `BuildRespondentReportArgs` carries `result/sections/questions/scoringConfig` but **no `templateAlias` and no raw answers** (and currently passes `submittedAt: new Date()`, `submissionId: ""`). So a qualitative email cannot render the respondent's answers. **Fix:** extend the shared email payload (`BuildRespondentReportArgs` + its builder) and **all** call sites — invited submit (`org-survey/.../submit/route.ts`), public quiz submit (`quiz/.../submit/route.ts`), and the public in-place results — to pass `templateAlias`, **the raw answers**, the **real `submittedAt`**, and pinned version metadata. Add LVA/QSP email tests asserting answer text is present and the scored anatomy is absent. (Public quiz templates are all `scored`, so the qualitative path is invited-only in practice — but the payload is threaded uniformly to avoid drift.)
- **R2-H3 (ACCEPT) — escape ALL respondent-controlled content in the inline qualitative email.** The qualitative renderer surfaces free-text answers, option labels, and numbers — user-controlled. The shared data layer (`qualitative-report-model.ts`) stays **raw structured data**; **`report-email.ts` HTML-escapes every label/option/answer** at the render boundary and clamps any numeric→style value (e.g. bar widths) to a safe range. Add adversarial HTML/attribute-injection tests (`<script>`, `"><img onerror>`, `{{token}}`, style-breakout). On-screen React auto-escapes, but the email twin does not — this is the new surface.
- **R2-M5 (ACCEPT) — the omit-empty rule is TYPE-AWARE, not truthiness.** A shared `isReportAnswerPresent(type, value)`: NUMBER → present iff `Number.isFinite` (so a real **`0`** — "0 branches", "0% net profit" — is **kept**, not dropped); TEXT → present iff non-empty after `trim`; MULTI_CHOICE/CHECKBOX → present iff the selection array is non-empty; SLIDER_LIKERT → present iff a finite number. Unit-tested per type. Used by both presentation layers so on-screen and email agree.
- **R2-M6 (ACCEPT, scoped) — qualitative render must be defensive; a render failure must not silently drop the email.** Rendering (at enqueue, per the Wave-D render-at-enqueue model) must not throw on unexpected answer shapes — degrade gracefully (skip the offending row, never the whole report). If rendering still fails, the **submission must still succeed** (never block submit) and the failure is **recorded** (audit/log + a metric), not swallowed — no "your results are on the way" with no enqueued row. (The heavier "render from `submissionId` in the worker so a deploy fix can retry" is noted as a possible follow-up, not required for Wave E.)
- **R2-M7 (ACCEPT) — bind the #29 publish to the reviewed draft hash.** Mirrors the Wave-D #15 content-hash gate (SEC-H2): the publish-review artifact records the reviewed draft's `contentHash`; the guarded publish step asserts the current draft hash still matches before setting `publishedAt`, so a draft edited *after* review cannot be published by mistake.
- **R2-L8 (ACCEPT) — move provenance to audit/send metadata when removing it from the visible footer (#25).** Removing the visible `submissionId·version·hash` stamp must not lose traceability: enrich the `VIEW_REPORT` audit entry and the outbox/email send metadata with `templateAlias`, `versionId`, `contentHash`, **and `reportType`** so we can always reconstruct exactly which renderer produced what was shown/emailed.
- **R2-M4 (REJECT — with reasoning) — do NOT version-pin the report *type*.** Codex flags that an alias-keyed config is deployment-global and can retroactively change historical/in-flight LVA/QSP reports. **That retroactivity is the intent:** Jeff wants **all** LVA/QSP reports rendered qualitatively, not only new campaigns. Report *type* is a **presentation policy**, deliberately global (ADR-0010); report *content* (questions) stays version-pinned (#29/#26, forward-only). Pinning the type to the version would freeze historical reports as scored and defeat the fix. Kept in code config.
- **R2-H2 (DEFER — pre-existing, out of Wave E scope, with a raised-stakes note) — outbox double-send under concurrent drains.** `drainLeadOutbox` does `findMany(status:PENDING)` → send → `update(SENT)` with **no atomic claim** (idempotent only for *sequential* re-runs; a cron retry overlapping the event-triggered drain can double-send). This is **pre-existing Spec-16/Wave-D infrastructure**; Wave E changes report *content*, not the drain. A correct fix (CAS `PENDING→SENDING` or `SELECT … FOR UPDATE SKIP LOCKED`) needs a new `SENDING` state = a **migration**, which Wave E forbids (additive, no-migration). **Raised-stakes note:** the qualitative email carries *more* PII (full answers), so a duplicate is worse — this should be **prioritized as a near-term follow-up** (added to the open follow-ons), but it is not Wave E's job to fix the drain mechanism. No clean no-migration claim exists (marking SENT before send loses the email on failure).

## Changelog

### Round 2 — security & data-integrity (claudex `20260617-185054-d60e32`)
- **Accepted:** R2-H1 (thread `templateAlias` + raw answers + real `submittedAt` through all report-assembly paths incl. the email submit routes; LVA/QSP email tests), R2-H3 (HTML-escape all respondent content in the qualitative email twin + injection tests; shared model stays raw data), R2-M5 (type-aware `isReportAnswerPresent`, finite `0` kept), R2-M6 (defensive render; never block submit; record render failures, don't swallow), R2-M7 (bind #29 publish to the reviewed `contentHash`), R2-L8 (enrich `VIEW_REPORT` audit + send metadata with `templateAlias`/`versionId`/`contentHash`/`reportType`).
- **Rejected:** R2-M4 (version-pin report *type*) — report-type is intentionally a global presentation policy (ADR-0010); Jeff wants all LVA/QSP reports qualitative incl. historical. Content stays version-pinned; type does not.
- **Deferred (pre-existing, out of scope):** R2-H2 (outbox double-send) — pre-existing Spec-16/Wave-D drain has no atomic claim; a real fix needs a `SENDING` enum = migration, which Wave E forbids. Wave E raises the PII stakes of a duplicate → flag as a prioritized near-term follow-up, not a Wave E deliverable.

---

## 10. /claudex:plan hardening — Round 1 (senior-engineer) — AUTHORITATIVE over the body

Round 1 findings (recovered — the round-1 runner was backgrounded and its findings weren't processed in-loop; folded here). Several extend Round 2; the genuinely new ones are H3, M2, M3, M4, M5, L1, L2.

- **R1-H1/H2 (ACCEPT — confirms R2-H1):** both submit paths build `RespondentReport` with `rawAnswers: []` and never pass the submitted answers, and `templateAlias` was only planned for `getRespondentReport`. **Concrete fix (supersedes the §3 "add alias to the loader" note):** thread `AssessmentTemplate.alias` **and** the validated raw answers through **every** report-construction path — `getRespondentReport`, the invited Wave-D enqueue/email builders, the public quiz submit + page/client, and **all report test fixtures** — before any `reportConfigFor(...)` call. Test every render surface (Rockefeller/LVA/QSP/default) for both on-screen and email.
- **R1-H3 (ACCEPT — refines G7 "no flag"):** E-2 is **not** "pure rendering" for the *email* path — result/coach emails **persist rendered `bodyHtml` in the outbox before send**, so a bad qualitative renderer enqueues irreversible wrong/empty emails and a later config flip will NOT repair already-enqueued rows. **Resolution:** the on-screen/PDF path stays config-revertible (truly pure rendering). The **email path is governed by the EXISTING Wave-D flags** — `WAVE_D_RESULTS_EMAIL_ENABLED` / `WAVE_D_COACH_NOTIFY_ENABLED` + the `ASSESSMENT_SENDS_PAUSED` kill switch — which already gate whether qualitative emails are enqueued/sent at all (so "config is the kill-switch" from G7 holds for screen, but the **email kill-switch is the Wave-D flag set**, not the report-config). Combine with R2-M6 (defensive render → never enqueue garbage) + an **ops-runbook note** for outbox inspection/regeneration. No NEW flag needed; the email safety net already exists.
- **R1-M1 (ACCEPT — refines R2-M4):** make the cutover policy **explicit**: report *type* is **global/retroactive by intent** (all LVA/QSP reports, incl. historical pinned versions, render qualitatively — that IS the fix), while report *content* (#26/#29) is **forward-only**. Because old pinned versions now render under the new renderer, **regression-test old/representative pinned LVA & QSP versions through `QualitativeReport`** (the renderer reads questions+answers from the pinned version, so it must tolerate older content shapes). Reject stands on version-pinning the *type*.
- **R1-M2 (ACCEPT — refines G8; important):** "generic, type-driven" is underspecified — question type + adjacency do **not** encode presentation semantics (LVA financial **metric table**, **percent bar**, QSP **rating group**, obstacle **follow-up attachment**, **units**, option-label display). The renderer needs an explicit **per-template / per-section presentation contract** (a small layout schema: which section → table vs. Q&A vs. bar vs. rating group), **reviewed and finalized at the `/frontend-design` mockup gate**, with a safe **fallback** (plain per-question Q&A) only for genuinely unknown templates. The renderer is "config + type driven", not "type alone".
- **R1-M3 (ACCEPT — corrects the #21 "no new plumbing" claim):** the deprecated `/result` API returns sections + scoringConfig but **not** version questions, so `AssessmentResultView` has **no labels** to render. #21 requires updating the `/result` API response **+** the component props **+** tests to pass `questionsByKey`/labels. (Re-confirm the fix-in-place decision vs. formally retiring the raw view per ADR-0007 Phase-2 — fix-in-place stands, but it is real plumbing.)
- **R1-M4 (ACCEPT — refines #29):** diffing via `xl/sharedStrings.xml` loses sheet structure, row order, option grouping, and which strings are sample-answers vs. questions. Use a **structured XLSX parser** (preserve sheet names + cell coordinates) to produce a **stableKey-aware, sample-answer-stripped** diff for human review. (Read-only; subagents still never touch the DB.)
- **R1-M5 (ACCEPT — new):** full inline qualitative emails can exceed practical email size limits (`MAX_TEXT_ANSWER_LENGTH = 10_000` × many free-text prompts → LVA/QSP can blow past Gmail's ~102 KB clip). Define a **per-answer truncation + overall email byte budget**, with a graceful "…(truncated)" indicator (there is **no respondent report URL** to "view full" per ADR-0007/0008, so truncation must stand alone). Test worst-case LVA/QSP email size + clipping. The **on-screen/PDF report is NOT truncated** — only the email twin.
- **R1-L1 (ACCEPT — terminology):** the stored question type is **`MULTI_CHOICE`** (LVA `S4_biggest_obstacles`, `maxChoices: 3`), not `CHECKBOX`. The renderer contract + §5 type→presentation map must use `MULTI_CHOICE` (correct the design's "CHECKBOX" references).
- **R1-L2 (ACCEPT — note):** #26 forward-only leaves existing pinned QSPv2 campaigns/reports showing "(with 1 decimal)". Either confirm Jeff accepts new-campaign-only (consistent with the forward-only policy) **or** add a cheap **render-time strip** of the "(with 1 decimal)" suffix so historical reports are fixed too. Lean: forward-only policy + an optional render-time strip (decide in the plan).

### Changelog — Round 1 (senior-engineer, recovered)
- **Accepted:** R1-H1/H2 (confirm + concretize R2-H1: `rawAnswers:[]` + alias threading through ALL paths incl. fixtures), R1-H3 (email path is not pure-rendering → governed by existing Wave-D email flags + defensive render + ops-runbook regeneration; refines G7), R1-M1 (explicit cutover policy: type global/retroactive, content forward-only; regression-test old pinned versions), R1-M2 (per-template/section presentation contract at the mockup gate, not type-alone; refines G8), R1-M3 (#21 needs `/result` API + props + tests — real plumbing), R1-M4 (structured XLSX parser for the #29 diff), R1-M5 (qualitative email byte budget + per-answer truncation; on-screen not truncated), R1-L1 (use `MULTI_CHOICE` not `CHECKBOX`), R1-L2 (#26 forward-only + optional render-time label strip).
- **Rejected:** none new (R1-M1 reinforces the R2-M4 reject on version-pinning the *type* while accepting the "make cutover explicit + regression-test" part).

---

## 11. /claudex:plan hardening — Round 3 (ops/SRE) — AUTHORITATIVE over the body

Round 3 (ops/SRE) recovered and run directly (the in-loop round-3 runner never executed). All findings accepted; none rejected.

- **R3-H1 (ACCEPT — operational complement to R1-H3):** the email **kill switch gates enqueue, not the drainer**, and `AssessmentEmailOutbox.bodyHtml` is frozen at enqueue — so already-queued qualitative emails still send after a config/flag rollback. **Wave E rollback runbook (new) must, in order:** (1) pause the outbox drain (`quick-assessment-lead-email` + its `*/3` cron) **first**; (2) query/quarantine affected `PENDING` rows; (3) regenerate or discard them; (4) only then consider promote-previous / config rollback complete. The runbook is a deliverable (extend an `17e-ops-runbook.md`).
- **R3-M1 (ACCEPT — concretizes R2-M6/L8):** define concrete observability — counters/gauges `assessment.report.render.failure`, `assessment.report.render.degraded_rows`, outbox **pending-age** and **failed-count**, **labeled by** `templateAlias` / `reportType` / `renderPath` / `emailType` / `recipientRole` — with `/admin/observability` (spec 06) panels and paging thresholds, so on-call sees qualitative-render failures before users do.
- **R3-M2 (ACCEPT — turns G7 "no flag" into a SAFE staged rollout):** ship the renderer code with **all aliases still `scored`/default**, then flip `leadership-vision-alignment` → `qsp-v1` → `qsp-v2` **one alias at a time**, each after a preview/prod **smoke test on representative historical pinned submissions** with explicit pass/fail. The per-template config map *is* the incremental-rollout lever — there's no flag, but the cutover is staged + reversible per alias. Add a post-deploy smoke checklist to the ops runbook.
- **R3-M3 (ACCEPT — perf):** qualitative rendering runs on the submit path and, for invited submissions, **inside the submission transaction** (lock + write), so max-size free-text answers raise submit latency, lock duration, and pool pressure under load. **Render OUTSIDE the DB transaction** (render → then open the tx to insert the outbox row), and **load-test worst-case LVA/QSP** with results + coach-notify enabled against p95/p99 submit-latency + outbox-backlog budgets; escalate to worker-side rendering only if budgets are exceeded.
- **R3-M4 (ACCEPT — targeted publish rollback for #26/#29):** a bad #26/#29 publish is immediately selected by new campaigns (latest published by `versionNumber`). Add a **non-destructive publish-rollback procedure**: temporarily block new-campaign creation for the affected alias, identify campaigns pinned to the bad version since publish, **supersede with a corrected version or explicitly unpublish/retire** the bad version (audited) — PITR only for catastrophic cases.
- **R3-L1 (ACCEPT — provenance):** record SHA256 of every source XLSX/PDF, the XLSX-parser/package version, and the generated diff-artifact hash in the publish-review artifact + seed run log, so the #29 LVA / QSP source-diff is reconstructable later (not dependent on mutable local files).

### Changelog — Round 3 (ops/SRE, recovered + run directly)
- **Accepted (all):** R3-H1 (rollback runbook pauses the **drainer** + quarantines pending rows, not just enqueue), R3-M1 (concrete render/outbox metrics + `/admin/observability` panels + alerts), R3-M2 (staged alias-by-alias rollout via the config map + post-deploy smoke), R3-M3 (render OUTSIDE the submit tx + worst-case load tests + latency/backlog budgets), R3-M4 (targeted non-destructive #26/#29 publish rollback, PITR only as last resort), R3-L1 (record source/parser/diff hashes in the publish-review artifact).
- **Rejected:** none.

---

## 12. Loop outcome & deliverables added by hardening

**Review run `20260617-185054-d60e32`** (3 lenses; round-1 recovered post-hoc, round-3 run directly after the in-loop runner was skipped by a backgrounding mishap — never background the claudex runner). Net: **7 high / 13 medium / 4 low** considered; **all material accepted except R2-M4** (version-pin report type — rejected, type is intentionally global) and **R2-H2 deferred** (pre-existing outbox double-send, needs a migration Wave E forbids → prioritized follow-up).

**New deliverables the hardening adds to the implementation plan (beyond the original §1–§8 design):**
1. Thread `templateAlias` + **raw answers** + real `submittedAt` through **all** report-assembly paths (loader, invited enqueue/email, public submit, public quiz client, fixtures) — R1-H1/H2, R2-H1.
2. **HTML-escape** all respondent content in the qualitative email twin + injection tests; shared model stays raw data — R2-H3.
3. Type-aware `isReportAnswerPresent` (finite `0` kept) — R2-M5.
4. A **per-template/per-section presentation contract** (layout schema) finalized at the `/frontend-design` mockup gate; type-only inference is insufficient — R1-M2.
5. **Email byte budget + per-answer truncation** (no report URL to link to); on-screen NOT truncated — R1-M5.
6. **Structured XLSX parser** for the #29 LVA (+ light QSP) source diff; record source/parser/diff **hashes** — R1-M4, R3-L1.
7. **#21 `/result` API + props + tests** plumbing (it has no labels today) — R1-M3.
8. Bind **#29 publish to the reviewed `contentHash`** — R2-M7.
9. **Render outside the submit transaction** + worst-case LVA/QSP **load tests** + latency/backlog budgets — R3-M3.
10. **`17e-ops-runbook.md`**: staged alias-by-alias rollout + post-deploy smoke; rollback pauses the **outbox drainer** + quarantines pending rows; targeted non-destructive #26/#29 publish rollback; concrete render/outbox **metrics + `/admin/observability` panels + alerts** — R3-H1/M1/M2/M4, R2-L8.
11. Use **`MULTI_CHOICE`** (not `CHECKBOX`); #26 forward-only + optional render-time label strip — R1-L1, R1-L2.
12. **Follow-up (out of Wave E):** add an atomic outbox claim (`SENDING` state / `FOR UPDATE SKIP LOCKED`) — pre-existing R2-H2, needs a migration.

**Refined decisions:** G7 "no flag" stands for the **on-screen** path (config-revertible) but the **email** path is governed by the existing Wave-D flags + a drainer-aware rollback runbook (R1-H3, R3-H1); report **type** is global/retroactive by intent while **content** is forward-only, with **old pinned versions regression-tested** under the new renderer (R1-M1).
