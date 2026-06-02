# 09 — Assessment Content Re-seed (real Esperto questions + scoring)

> **Status:** Design approved (brainstorm complete, 2026-06-02). Next: implementation plan via writing-plans.
> **Goal:** Replace the placeholder/approximated question banks in the 5 seeded assessment templates with the **real Esperto instrument content** (questions + scoring), sourced from Jeff's export under `From Jeff/APP_scaling up assessemnt/`. Customer-facing fidelity is the bar.
> **Origin:** Jeff confirmed on the May 28 call that the seeded questions are samples, not the real reports. This spec operationalizes the fix.

## 1. Locked decisions

1. **Scope** = the 5 templates currently on the platform: Leadership Vision Alignment (LVA), Quarterly Session Prep v1 (QSP v1), Quarterly Session Prep v2 (QSP v2), Rockefeller Habits Checklist, Scaling Up Full. The two extra export folders (`SunHub_ScalingUpQuiz`, `Website-scalingup-assessment`) are **out of scope** (not on the platform).
2. **Fidelity** = questions + structure **and** real scoring (bands/messages) wherever recoverable from the export.
3. **Versioning** = **append a new version (vN+1) per template, never mutate existing rows.** Safe vs the `assessment_template_version_immutability_trigger` (which blocks UPDATE/DELETE only when `publishedAt IS NOT NULL`) and vs existing test campaigns (they keep their `versionId` snapshot). New campaigns auto-pick the latest **published** version (`resolvePublishedTemplateVersion`, ordered by `versionNumber desc`).
4. **Publish strategy** = **stage as DRAFT for human review.** Seed the new versions as `publishedAt: null`; Jeff/admin verifies questions + scoring in the editor, then publishes. All "confirm with Jeff" items ride this review gate — nothing blocks the build.
5. **Scaling Up Full scoring** = **ship questions + provisional scoring + flag the gap** (chosen 2026-06-02). Re-seed 61 verbatim questions + the per-question recommendations we have + the 3 ScaleUp Score bands with **provisional** cutoffs (clearly labeled). The exact weighted 0–100 formula + full 5-stop recommendation text must come from Esperto before publish.
6. **LVA modeling**: 16-factor matrix → 16 `SLIDER_LIKERT` (1=Weak, 2=Average, 3=Strong); obstacle follow-ups → 16 optional `TEXT` "Why is {factor} a hindrance?" (platform has no conditional logic); 9 financial NUMBERs labeled **"in three years"** (they are aspirational targets, not current figures); qualitative TEXT marked **required** (xlsx marks them `*`), NUMBER intake optional.
7. **QSP v1 core-values** question = **3 separate TEXT boxes** (matches the live form). **Rockefeller** = keep verbatim xlsx wording; use the consistent 17/33 band edges (provisional).
8. **No-scoring assessments** (QSP v1, QSP v2, and LVA-overall) use a **single neutral catch-all tier** — the platform requires `scoringConfig` with `tiers.min(1)`; there is no native "aggregation-only" mode. The neutral tier spans the full metric range with a neutral message; no fake bands are invented.

## 2. Platform constraints discovered (ground truth for the plan)

- `AssessmentTemplateVersion.scoringConfig` is **non-nullable** (`Json`, not `Json?`). `ScoringConfigBase` requires `tierMetric ∈ {countAchieved, overallTotal, overallAvg}` and `tiers: z.array(TierSchema).min(1)`; `validateTierTiling` errors on `tiers.length === 0`. ⇒ Every published version needs **≥1 tier** → degenerate neutral tier for no-scoring instruments.
- Per-question recommendations **are** supported (`RecommendationBandSchema`, `q.recommendations[]`, validated at publish) — SU Full's per-stop model fits the engine.
- `scaleUpScore: true` requires `scoringConfig.rollup.overall` set; `meanOfDomains` requires every section to carry a `domain`. (SU Full's real ScaleUp Score is weighted + bonus — NOT `meanOfDomains`; see §4.5.)
- Question types `TEXT` / `NUMBER` / `MULTI_CHOICE` are already supported end-to-end (editor, render, submission, scorer filters to `SLIDER_LIKERT` for scoring) — **no engine changes needed**.
- Immutability trigger: `BEFORE UPDATE OR DELETE`, raises only when `OLD.publishedAt IS NOT NULL`. DRAFT rows are freely mutable; published rows force a new version.

## 3. Build architecture (Approach B)

- **Content artifact per assessment** = a structured, reviewable content constant (sections → questions → type/scale/options/required → scoringConfig), living in each assessment's seed file (the PR diff is the review surface). Diffable and checkable against source before any DB write.
- **Version-aware seeder** = shared helper that, per template+language, computes the content hash and **appends the next `versionNumber` as DRAFT** if no existing version matches that hash (replaces the current "throw on hash mismatch" guard). Keeps the existing `pg_advisory_xact_lock` + 6-state idempotency so concurrent/repeat runs are safe and a matching-hash run is a no-op.
- **Per-assessment vertical slice**: build artifact → run seeder (new DRAFT version) → verify rendered questions/scoring against source → stage. **Order: Rockefeller first** (lowest risk, content already near-correct — validates the version-append seeder), then QSP v1, QSP v2, LVA, **Scaling Up Full last** (highest risk).
- TDD per slice; gate = `CI=true npx next build --turbopack` + targeted tests. Work directly in repo on a feature branch off `main`.

## 4. Per-assessment content reality (verified, adversarial)

> Full extraction maps + verifier verdicts captured in the workflow runs `wx7okg1q2` (QSP v1/v2, LVA) and `wzl519to9` (Rockefeller, SU Full). The implementer must transcribe **verbatim** from the cited source files, not from this summary.

### 4.1 Rockefeller Habits Checklist (`RockHabits`) — fidelity: FULL
- 40 statements, 10 sections × 4, scale **0–3** (no worded anchors in source — only 0,1,2,3). Current seed's questions are already byte-accurate vs `Rockerfeller questions.xlsx`.
- **Scoring**: metric = count of items "passed", where pass = rating **2 or 3** (proven: all-0s and all-1s reports → 0/40; all-2s/all-3s → 40/40). `tierMetric: countAchieved`, `passThreshold: 2`. 3 bands, **verbatim messages**:
  - **Low**: "That is a very low overall score."
  - **OK**: "You're doing quite okay, and have a lot to improve further upon."
  - **Great**: "That is a great overall score."
- Band edges **0–16 / 17–32 / 33–40** are consistent with every Logic-sheet data point (16=low, 22/27=okay, 33/40=great); exact Low/OK & OK/Great integers are not uniquely pinned → **provisional, confirm with Jeff**.
- **Fixes vs current seed**: drop invented anchor labels "Not true"/"Completely true"; drop trailing period on Q1_1 ("…priorities, and styles"); section-7 use straight double quotes around "alive"; keep xlsx wording (authoritative over older PDF rendering).

### 4.2 QSP v1 (`qsp-v1`) — fidelity: FULL
- ~8 sections, **~26–28 question objects**: 1 `NUMBER` (overall performance, 1–10, 1 decimal) + 7 `SLIDER_LIKERT` (six-item 1–10 grid with emoji anchors + 1 Rockefeller-methodology slider) + ~18–20 `TEXT`.
- Core-values "role models" question = **3 separate TEXT boxes**. Department-level start/stop/continue are `(Optional)`; company-level required (confirm); closing remarks + role-models optional.
- **Scoring**: **none** — pure aggregation (report shows means). Use neutral single tier. Current seed (6 sliders + fabricated 4-tier At Risk/Needs Work/On Track/Strong) is fully replaced.
- Source of truth: the **18 embedded survey screenshots** in `qtr session prep v1.xlsx` (`xl/media/image1–18.png`) + the personal report PDF.

### 4.3 QSP v2 (`qsp-v2`) — fidelity: FULL (requires clean re-transcription)
- **One instrument, Parts 1–5, ~12–13 questions** (the first extraction mis-numbered the xlsx images and fabricated a "two-versions" split + extra questions — REJECTED by the verifier):
  - **P1 Retrospective**: `NUMBER` overall rating + `TEXT` "Please explain your rating" + **5**-item `SLIDER_LIKERT` matrix (uses "rocks" wording; **no** "The way you have performed" item) + `TEXT` leadership-rocks view + **3-box** core-values stories.
  - **Start/Stop/Continue**: 3 company-level `TEXT` (no department variants, no "Optional").
  - **P2 Personal Check-in**: 1 `SLIDER_LIKERT` ("How aligned and energized do you feel…") + 1 `TEXT` explain.
  - **P3 Growth Challenge**: 3 `TEXT` (challenge / why / "Where do you believe the solution lies?").
  - **P4 Focus for Next Quarter**: 2 `TEXT` (Critical Number Identification / Top Priorities).
  - **P5 Closing**: 1 `TEXT`.
- **Scoring**: **none** (neutral single tier). Current seed fully replaced.
- ⚠️ **Implementation note**: re-transcribe verbatim from the correctly-numbered survey screens (`image9`–`image22`) in `qtr session prep v2.xlsx`; do NOT reuse the rejected first-pass map's wording.

### 4.4 LVA (`leadership-vision-alignment`) — fidelity: MOSTLY (modeling per §1.6)
- ~51 questions: 9 `NUMBER` **"in three years"** (revenue, gross margin, net profit %, customers, total employees, permanent FTE, part-time FTE, branches, countries) + 8 future-vision `TEXT` (required) + **16-factor** Strong/Avg/Weak matrix as 16 `SLIDER_LIKERT` 1–3 + 1 `MULTI_CHOICE` obstacle (pick 3 of the 16 factors) + 2 always-on obstacle `TEXT` + 1 rehire-% `NUMBER` + 14 focus-area `TEXT` (required).
- 16 factors: Recruitment of new employees · Retaining staff · Leadership Team · The leadership *(distinct from Leadership Team — both real)* · Culture · Internal communications · Strategy · Execution and operational processes · Marketing · Sales · Technology · Scalability · Innovation · Financial processes · Cash · Growth Financing.
- **Scoring**: per-factor 0–10 at the **group** level (Strong=10/Avg=5/Weak=0, team-averaged) + obstacle % vote share — **no overall pass/fail tiers, no recommendation messages**. ⇒ template uses a neutral single tier; the per-factor group-score *visualization* is an Esperto report feature **out of v1 scope** (raw answers are captured; we don't replicate the group factor-bar report). Current seed's Developing/Building/Scaling tiers are fabricated → removed; all labels re-transcribed verbatim from `leadership visin alignment assement.xlsx`.

### 4.5 Scaling Up Full (`scaling-up-full`) — fidelity: PARTIAL (decision §1.5)
- 61 `SLIDER_LIKERT` 0–10, 10 sections, 5 domains: **People, Strategy, Execution, Cash, You**. Question labels + the per-question recommendation text we have are verbatim-faithful in the current seed (keep, don't rewrite).
- Per-question recommendations key off score-stops **{0,3,5,7,10}** with empty-stop fallback. `matrix.xlsx` only populates multiple stops for **3 of 61** questions; the rest must be harvested from the rendered uniform-score PDFs or obtained from Esperto.
- **Overall ScaleUp Score** = weighted **0–100** + bonus (overflows to 107 at all-10s). 3 bands, **verbatim messages**:
  - **LOW / Not ready** (≤28 confirmed): "You have still a lot of focus areas on which you can work within your company. If you want to grow quickly, then your organization is probably not ready yet."
  - **GOOD / On the way** (47–62 confirmed): "A great score. You are pretty well on the way to becoming a strong growth organization."
  - **TOP / Exemplary** (≥73 confirmed): "You are doing extremely well and are perhaps an example for others! However, in order to reach the next phase, there is still room for improvement."
  - Provisional cutoffs **40 / 65** (LOW→GOOD lies in (28,47], GOOD→TOP in (62,73]) — **labeled provisional**.
- **Remove** the fabricated per-domain tiers (Critical/At Risk/On Track/Strong) and the `meanOfDomains` rollup (real score is weighted, not a domain mean).

## 5. Open items flagged for Jeff / Esperto (do not block build; resolve before publish)
- **SU Full**: exact ScaleUp Score weighting + bonus formula; per-section non-uniform weighting (observed ×4–×10); full 5-stop recommendation text for all 61 questions; the distinct stop-10 "top" variants; the non-scored profile inputs (age, ambition %, etc.) that feed the score. Provisional band cutoffs 40/65.
- **Rockefeller**: confirm exact Low/OK (≈17–21) and OK/Great (≈28–33) band integers.
- **All**: whether the live tool shows worded slider endpoint labels (the PDFs show only emoji/numeric). Invitation/results email copy is not in the export (current seed placeholders are platform-authored, not Esperto).

## 6. Verification approach
- Each slice's content artifact is verified against the **cited source file(s)** (xlsx via python parse / PDF via pages) before seeding — the implementer transcribes from source, not from this spec.
- After seeding the DRAFT version: load it in the admin editor + render the public quiz to confirm every question/type/scale renders; run the scorer on a midpoint submission; confirm publish-schema validation passes (tiers tile, recommendations valid).
- Reuse the existing per-assessment seed test pattern; add tests asserting (a) the new version is created as DRAFT, (b) existing versions/campaigns are untouched, (c) re-running the seed with identical content is a no-op (hash match).

## 7. Out of scope (v1)
SunHub + Website assessment variants; the Esperto group factor-bar / peer-comparison report rendering; replicating SU Full's exact weighted score; conditional/branching question logic; invitation/results email copy fidelity; any change to the question-type engine.

## 8. Risks
1. **SU Full provisional scoring** ships customer-facing bands with unconfirmed cutoffs — mitigated by staged DRAFT + explicit "provisional" labeling + Jeff review before publish.
2. **QSP v2 re-transcription** must use the correctly-numbered screens — the first extraction's map is rejected; treat it as a cautionary artifact, not a source.
3. **Version proliferation** — appending vN+1 leaves old DRAFT/published versions; acceptable (new campaigns pick latest published; old test campaigns keep their snapshot). Verify prod publish-state per template (read-only) before seeding to know the starting versionNumber.
4. **Neutral-tier representation** of no-scoring instruments must not surface a misleading band label to respondents — use a genuinely neutral message.

## 9. Source material index (authoritative inputs)
Base: `From Jeff/APP_scaling up assessemnt/`
- `APP_Rockerfeller/Rockerfeller questions.xlsx` (+ Logic sheet) + 6 personal/Full-Team report PDFs
- `APP_qtr session prep v1/qtr session prep v1.xlsx` (image1–18) + report PDF
- `APP_qtr session prep v2/qtr session prep v2.xlsx` (survey = image9–22) + 3 personal + 1 group report PDFs
- `APP_leadership vision alignment assessment/leadership visin alignment assement.xlsx` + 3 personal + 1 group report PDFs
- `APP_scaling up assessemnt/scalingupassessment.xlsx`, `other samples/matrix.xlsx`, `other samples/{all 0s,all 3s,all 5s,All 7s,all 10s}` reports + ScalingUp_CEO_Full / standard / group / condensed reports
