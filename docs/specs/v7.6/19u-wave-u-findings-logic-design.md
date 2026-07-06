# Spec 19u — Wave U: Findings Logic (Jeff July-1 #11)

**Status: CO-VALIDATED (2026-07-05) — awaiting user greenlight.** See §6 for the co-validate changelog (Codex C1/C2/C4 accepted — the resolution model changed to snapshot-at-scoring; C3 partial; C5 overridden with rider).
Pipeline: brainstorm → grill-with-docs → grill-me (this doc) → /co-validate (Codex) → user greenlight → TDD build → adversarial review → PR dark → same-session launch walk.

## §0 Ground truth

**Jeff's verbatim (#11, `From Jeff/gabriel-items-2026-07-01.pdf` — gitignored, real PII, never commit):**
> "Findings Logic — Need the ability to add logic to present findings from an assessment — i.e. drive report content or recommendations based on respondent answers, beyond survey-screen branching. *Note: Related to conditional question logic (tracker row 38) but distinct — this is about logic on the output/report side.*"

**What exists (verified 2026-07-05):**
- The findings engine already exists **for sliders on scored templates**: `RecommendationBandSchema` (`{minScore, maxScore, text}`) on `SliderLikertQuestion` (`lib/assessments/scoring.ts:41-59`), validated at runtime (`checkRecommendationsRuntime`: max≥min, bands inside scale, no overlap) and at publish (`checkRecommendationsPublish`: **full-scale tiling** — first band starts at `scale.min`, last ends at `scale.max`, contiguous; placeholder-sentinel rejection), resolved **at scoring time** into the frozen `ScoreResult` row (`row.recommendation`, scoring.ts:1249-1255), rendered by `BrandedReport` as the section-grouped "What to work on next" block (BrandedReport.tsx:309-325, 665+).
- **SU-Full carries 305 live Esperto-verbatim bands** (61 sliders × 5 bands at stops {0,3,5,7,10}, seed-scaling-up-full-assessment.ts) — the only authoring path today is the seed script. **No editor UI**; rules survive editor saves only via Wave T's raw-spread/validate-don't-strip contract.
- **Qualitative templates (LVA, QSP — Jeff's flagship instruments) have NO findings path at all.** `reportConfigFor(alias)` (`lib/assessments/report-config.ts`) routes `qsp-v1`/`qsp-v2`/`leadership-vision-alignment` to `QualitativeReport`, which renders answers + Wave S peers and nothing answer-driven. Unknown alias → **scored** (`DEFAULT_REPORT_CONFIG`).
- `recommendations` exists **only on the slider schema** — NUMBER/MULTI_CHOICE/TEXT schemas have no such field. The per-type Zod question schemas are already a type-discriminated union.
- `buildQualitativeModel({templateAlias, sections, questionsByKey, rawAnswers})` already receives everything a render-time resolver needs. `RespondentReport`/`QuestionMeta` already carry raw answers + option metadata on the scored path (proven by the Wave T #136 fix).
- The **scored results email contains no recommendations at all** (zero references in `report-email.ts`), and the **qualitative results email is a body-twin of the on-screen report** with a CI-frozen byte-identical guard (Wave S).
- The editor's "Conditional Logic" tab is disabled (v1.5 placeholder) and is **input-side** — explicitly not this wave (Jeff's own note).
- **No phase-2 wireframe covers findings authoring** (18-admin-template-editor-logic.html is actually Scoring & Tiers). Flagged as wireframe drift per house rule; the UI follows the QuestionsTab idiom exactly as Wave T's options editor did.

**Why now:** last unblocked P6 roadmap item; Wave T just unlocked authoring of the very question types (NUMBER/MULTI_CHOICE) that findings rules extend.

## §1 Decision log (all user-confirmed 2026-07-05)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Scope | **Full**: slider bands + NUMBER ranges + MULTI_CHOICE option-match; authoring UI; rendered in scored AND qualitative **individual** reports |
| D2 | Rule model | **Per-question** (Esperto's model). No cross-question conditions (YAGNI; nothing in #11 requires it) |
| D3 | Schema | Extend the existing per-type question schemas — **the question type IS the discriminator**. SLIDER (existing) + NUMBER: `recommendations: Band[]` (`{minScore, maxScore, text}`); MULTI_CHOICE: `recommendations: OptionRule[]` (`{optionKey, text}`); TEXT: none. Zero migration; SU-Full's published bands validate unchanged |
| D4 | NUMBER publish rules | **Non-overlap only, gaps allowed** (unbounded domain — tiling impossible). No band matched → no finding (existing runtime leniency). Sentinel rejection applies |
| D5 | MULTI_CHOICE matching | **Per selected option** — each selected option that has a rule contributes its finding text (pick Cash + People → both findings). No combination matching |
| D6 | Rendering | **Individual reports only.** Scored: NUMBER/MC findings (from the frozen snapshot, D18) **merge into the existing "What to work on next"** block; the existing slider `row.recommendation` path stays byte-untouched. Qualitative: **new consolidated end-section** (appended after the final section; Wave S peers splice mid-report and are untouched) rendering **all** rule-bearing types (incl. LVA's 2 sliders) from the snapshot, scored-parity copy ("What to work on next" / "Your recommendations"). Group reports untouched (no `GROUP_RENDER_VERSION` bump; group findings = follow-on) |
| D7 | Email | **Untouched.** Scored email has no recommendations today; qualitative email stays byte-identical by construction (Wave S CI guard stays green, unmodified). Findings-in-email = follow-on |
| D8 | Authoring UI | **Inline collapsible "Findings" panel per question card in QuestionsTab** (Wave T options-editor idiom). Band rows (min, max, text, add/remove) for SLIDER/NUMBER; one optional text per option for MULTI_CHOICE; nothing on TEXT. No wireframe exists — recorded drift |
| D9 | Edit rules | Findings text is **reword-class (D9/Wave T taxonomy)** — editable on inherited questions on a draft; no identity/crosswalk/trends impact. Published versions immutable → findings reach reports only via a **newly published version → new campaigns** (same dynamic as Wave P v3) |
| D10 | Validation ladder | **Draft save**: shape-valid only (per-type field shape), still validate-don't-strip. **Publish (strict)**: slider full tiling (unchanged rule), NUMBER non-overlap, MC `optionKey` must exist on that question, sentinel rejection on all rule text. **Runtime**: lenient (no match → omit) |
| D11 | Slider tiling kept strict | Full-tile-or-nothing stays (contiguity, not band count — 0–4/5–10 satisfies it). Protects the SU-Full "every score gets a rec" guarantee; the panel shows coverage inline ("missing 7–10") so publish never surprises |
| D12 | Flag | `WAVE_U_FINDINGS_ENABLED` (default OFF; `WAVE_U_FINDINGS_KILL` wins; call-time env reads; mirrors `wave-t-flags.ts`). Gates: the authoring panel, the qualitative findings section, the scored-report non-slider merge. **Non-killable hardening** (kill = revert commit): the schema extension + PATCH/publish validation (Wave T C2 precedent — flags gate capability, never persisted-intent enforcement) |
| D13 | Launch walk | **Two throwaway TEST templates on prod DB**: (a) default-scored alias — authoring panel E2E, publish gates (tiling failure then success), survey fill, scored merge live; (b) the **new walk alias** — qualitative findings section live incl. print check. §5.5 cleanup order (campaigns first; template soft-delete; published rows never hard-delete). Prod flag flip individually authorized |
| D14 | Walk namespace *(reshaped by co-validate C3)* | `reportConfigFor` gains a documented **reserved test-walk prefix**: any alias starting with `walk-qual-` resolves `{reportType: "qualitative", showScoreTable: false, showTier: false}`. Prefix beats a single hardcoded entry because `AssessmentTemplate.alias` stays claimed by soft-deleted walk templates — each wave's walk needs a fresh alias (`walk-qual-u`, `walk-qual-v`, …). Comment marks the namespace walk-only; a test pins the prefix behavior |
| D15 | Content at launch | **Ships empty on live templates** — no seeded/invented findings text, ever (Wave S honest-data stance). SU-Full's 305 bands untouched and still rendering. Hand-off: Jeff authors findings in the panel and publishes |
| D16 | Preview | None this wave — the panel shows rules plainly; the walk proves the render. "Findings preview / test-a-value" = named follow-on |
| D17 | ADR | **ADR-0021** records the type-discriminated rule shape + the uniform snapshot-at-scoring resolution (D18) with the slider `row.recommendation` back-compat duality |
| D18 | Resolution timing *(reshaped by co-validate C1)* | **Snapshot-at-scoring, uniformly.** `scoreSubmission` runs `resolveFindings` over ALL rule-bearing types and freezes `result.findings: ResolvedFinding[]` on every submission (both submit routes + Wave O imports already persist `result` for every template — qualitative included, ADR-0002 neutral tier). The resolver runs **unconditionally** (flags gate capability/UI, never data correctness — Wave Q durable rule); the FLAG gates authoring + rendering only. No retroactive drift; no report-loader contract expansion (`question-meta.ts` strips `recommendations` — verified); reports read the frozen snapshot. Renderers select to avoid double-display: scored renders sliders from the existing `row.recommendation` + non-sliders from `result.findings`; qualitative renders all kinds from `result.findings` |
| D19 | Data preflight *(co-validate C4)* | Before merge: a read-only scan of ALL existing template-version question payloads against the new publish checks (stray `recommendations` on TEXT, malformed/overlapping bands, duplicate MC rules, dangling optionKeys). Risk is real via Duplicate-from-published hydration (legacy stray fields could newly block a future publish). Findings from the scan get fixed or explicitly waived in the PR |
| D20 | Reader audit *(co-validate C5 rider)* | Enumerate every reader/writer of `question.recommendations` (publish/runtime checks, scoring resolver, seed integrity guards, `question-meta.ts`, serializers, report models) and pin each with a test that the MC option-rule shape flows through or is correctly excluded |
| D21 | Grill-me edges | Findings **fire for questions in suppressed sections** (suppression is presentation of raw answers; an authored rule is explicit intent) — tested. **Any** retype drops that question's rules with a confirm dialog (even band-compatible SLIDER→NUMBER — re-author deliberately). Publish adds a **2,000-char cap** on rule text (none exists today; report/print blowup guard) — cap chosen above the longest live SU-Full band text |

## §2 Design

### U-1 Flag — `src/src/lib/assessments/wave-u-flags.ts`
`isFindingsLogicEnabled()`: KILL > ENABLED, call-time `process.env` reads, `"1"/"true"/"TRUE"/"yes"` truthiness — byte-parallel to `wave-t-flags.ts`. Doc-comment names the non-killable exclusions (schema + validation).

### U-2 Schema + validation — `scoring.ts` (+ the version PATCH)
- `FindingOptionRuleSchema = z.object({ optionKey: z.string(), text: z.string() })`.
- `NumberQuestion.recommendations?: RecommendationBandSchema[]` — same band shape as sliders.
- `MultiChoiceQuestion.recommendations?: FindingOptionRuleSchema[]`.
- TEXT schema: no field. Because the question schemas are non-strict Zod objects (unknown keys pass), a stray `recommendations` on TEXT would NOT fail shape validation — so the **publish-time** check explicitly rejects rules on TEXT questions, and the serializer never emits the field for TEXT. (Same layering as Wave T's stale-`scale` handling: the serializer, not the shape schema, is what keeps quals clean.)
- `checkRecommendationsRuntime` / `checkRecommendationsPublish` get per-type branches:
  - SLIDER: unchanged (bounds, overlap; publish full-tiling + sentinels).
  - NUMBER: max≥min per band; **non-overlap**; publish adds sentinels. No coverage requirement.
  - MULTI_CHOICE: publish requires every `optionKey` to exist among that question's options; duplicate `optionKey` rules rejected; sentinels.
- The Wave T version PATCH picks these up **automatically** (it validates each row with the per-type question schemas) — plus explicit tests for the new shapes. Persistence stays validate-don't-strip (original payload written).

### U-3 Resolver — new pure module `src/src/lib/assessments/findings.ts`
`resolveFindings(questions, answersByKey) → ResolvedFinding[]` where `ResolvedFinding = {stableKey, sectionStableKey?, questionLabel, text}` (one per fired rule; MC can fire several per question, ordered by that question's option order; questions ordered by `sortOrder`).
- SLIDER/NUMBER: first band containing the numeric answer (bands non-overlapping ⇒ at most one). Non-numeric/absent answer → no finding.
- MULTI_CHOICE: for each selected option key with a rule → one finding.
- TEXT: never.
- Total-tolerant: malformed rules/answers are skipped, never throw (report render must not 500 on bad data — house rule since the Wave N hotfix).

**Resolution timing (D18 / ADR-0021):** `scoreSubmission` calls `resolveFindings` **unconditionally** for every submission and writes the result as a new top-level `result.findings: ResolvedFinding[]` (empty array when the version has no rules). Both submit routes (`/api/quiz/[campaignAlias]/submit`, the INVITED org-survey path) and the Wave O import commits already persist `result` — no new write path. The per-row slider `row.recommendation` continues to be written exactly as today (back-compat; existing SU-Full submissions have no `result.findings` and must keep rendering). Resolver-bug fixes do not retro-apply to frozen submissions — same property as slider recommendations today, accepted (frozen results are history, ADR-0016 stance).

### U-4 Editor — Findings panel in `QuestionsTab.tsx` (+ serialization)
- Flag-on only; flag-off markup **byte-identical** (Wave T pattern).
- Collapsible "Findings" panel inside each question card, below the type-specific config (below the options editor on MC). SLIDER/NUMBER: band rows `min | max | text` with add/remove; slider panels show live coverage state ("covers 0–6; missing 7–10") from a pure helper. MC: one optional text field per option (`q-finding-option-<key>` testids). TEXT: no panel.
- `QuestionDraftRow` gains `recommendations?: BandDraft[] | OptionRuleDraft[]` (typed per question type). `hydrateQuestionsFromJson` reads them; `buildQuestionsPayload` emits them per-type on dirty rows (raw-spread first, then explicit per-type emission — a deleted rule cannot resurrect via the spread; retype away from a rule-bearing type drops the rules with a confirm dialog naming the loss).
- Editing findings marks `questionsDirty` and rides the existing save path (content-hash contract untouched).
- **Cascades:** removing a new-to-draft MC option deletes its rule silently (never published); removing a published option already warns (Wave T) — the warning text now also names the attached finding. Duplicate-question copies rules. Inherited-question findings are editable (D9 reword-class); inherited key/type/option-key locks are unaffected.

### U-5 Report rendering (reads the frozen snapshot — D18; no loader contract expansion, `question-meta.ts` stays rules-free)
- **Scored (`BrandedReport`):** the non-slider entries of `result.findings` merge into the existing `recSections` grouping (same section → same card; questions in `sortOrder`). Slider entries in the snapshot are IGNORED here — sliders keep rendering from `row.recommendation` exactly as today (no double-display; old submissions without `result.findings` render unchanged). Flag-off → merge skipped, output byte-identical to today.
- **Qualitative (`QualitativeReport`):** a separate pure builder `buildFindingsSection(resultFindings, sections)` (Wave S `PeerComparisonBlock` pattern) renders ALL snapshot entries as the consolidated section; appended after the last rendered section (Wave S peers splice mid-report for LVA and are untouched — findings always land later), eyebrow "What to work on next", title "Your recommendations", grouped by survey section, `data-testid="qual-section-findings"`. Flag-off or empty snapshot → section absent entirely. Suppressed-section findings still render (D21). **Email untouched by construction** — the email body builder never calls the new builder; the Wave S byte-identical CI guard stays green unmodified.
- Print: the section uses existing `su-*` print-safe classes; walk (b) includes a print check.

### U-6 Walk namespace — `report-config.ts` (D14)
`reportConfigFor` resolves any alias with the reserved prefix `walk-qual-` to `{reportType: "qualitative", showScoreTable: false, showTier: false}` before the exact-match map. Comment documents it as the test-walk namespace (throwaway TEST templates only); a pinned test freezes the behavior. Fresh alias per wave (`walk-qual-u`, …) because soft-deleted walk templates keep their alias claimed.

### U-7 Security & house practice
Zod at the PATCH boundary (extended, U-2); no new routes, no new auth surface (editor is admin/STAFF behind existing gates); rule text renders as plain JSX text (no raw-HTML injection anywhere in the new surfaces); no PII in logs; audit unchanged (rides the existing version PATCH audit).

## §3 Follow-ons (named, unscheduled)
- Group-report findings aggregation (needs semantics from Jeff).
- Findings in the results email (respondent-facing; needs the frozen-guard update + live email walk).
- Findings preview / test-a-value in the panel (D16).
- Cross-question findings rules (only if Jeff ever asks; would revisit the rules-tab architecture).
- Conditional/show-if **input-side** authoring (tracker row 38 — the disabled tab; distinct per Jeff's note).

## §4 Test plan (TDD; targets in the Wave T layout)
- `findings.test.ts` — resolver: band hit/miss/boundary (min/max inclusive), NUMBER gaps, MC multi-fire + ordering, TEXT never, malformed-tolerance, determinism, suppressed-section questions still resolve (D21).
- `scoring` snapshot tests — `scoreSubmission` writes `result.findings` unconditionally (empty array when no rules); slider `row.recommendation` byte-identical to pre-Wave-U output on the SU-Full seed content (frozen-path regression pin); Wave O import commits carry the snapshot.
- **Reader audit (D20)** — one test file enumerating every `question.recommendations` reader/writer with a pinned expectation each (MC shape flows through serializers/PATCH; excluded by `question-meta.ts`; slider-scoped in seed integrity guards + scoring rows).
- `scoring` schema tests — new shapes accepted per-type; band-on-TEXT rejected; runtime non-overlap (NUMBER); publish: slider tiling unchanged, NUMBER overlap rejected + gaps accepted, MC optionKey-exists + duplicate rejected, sentinels on all kinds; **SU-Full seed content still validates** (regression pin).
- `template-version-patch.wave-u.test.ts` — PATCH accepts/rejects the new shapes; validate-don't-strip proof (unknown sibling field survives a save that edits findings).
- `question-serialization` tests — emit per-type on dirty; deleted rule stays deleted (anti-resurrection); retype drops rules; duplicate copies rules; hydrate round-trip.
- `questions-tab.wave-u.test.tsx` — panel per type; coverage hint states; MC per-option fields; flag-off **byte-identical** markup snapshot; inherited question panel editable.
- `branded-report` tests — NUMBER/MC findings merged into the right section card; flag-off byte-identical; frozen slider recs untouched.
- `qualitative-report` tests — section renders snapshot entries grouped by section; absent when empty snapshot or flag off; peers + findings coexist in order; **email builder output byte-identical with findings authored** (the CI guard, exercised not modified).
- `report-config` test — `walk-qual-` prefix resolves qualitative; all existing aliases unchanged.
- Publish tests add: rules-on-TEXT rejected; 2,000-char text cap (D21).
- Sweep + `CI=true npx next build --turbopack` green before PR.

## §5 Launch plan (same-session on user "go")
0. **Preflight (D19, before merge):** run the read-only scan of all existing template-version payloads against the new publish checks; fix or explicitly waive anything it finds. ✅ **RUN 2026-07-05 (`scripts/wave-u-preflight-scan.ts` vs prod): CLEAN** — 16 versions / 582 questions / 122 rule-bearing (SU-Full 61 sliders × 2 versions), zero issues.
1. Merge dark (flag absent on Vercel = OFF). **Walks (a)+(b) run as local-UI pilots with the flag inline against the prod DB** (house pattern — Vercel Preview lacks Production flags; local needs `ASSESSMENT_SESSION_SECRET` ≥32 chars); post-flip prod smokes then re-verify the live surfaces.
2. **Walk (a) — scored path**, throwaway TEST template (default alias → scored; needs ≥1 scoring tier authored to publish): author all three rule kinds; publish-gate failure proof (partial slider tiling → blocked with the named error) then success; TEST campaign + safe-member token (NO email); survey fill; verify `result.findings` frozen on the submission row; report shows merged findings exact.
3. **Walk (b) — qualitative path**, throwaway TEST template on alias `walk-qual-u`: author slider band + NUMBER band + MC rule; publish; fill; report shows the findings section (content + grouping + placement after the last section) + print check.
4. Fix-forward anything launch-found (Wave T precedent: same-session PR).
5. **§5.5 cleanup, strict order:** campaigns closed + soft-deleted + tokens revoked FIRST; then template `deletedAt` + `disabledAt`. Published version rows are never hard-deleted.
6. Flag flip on Vercel Production (individually authorized) + redeploy; prod smokes: SU-Full report unchanged (frozen recs render), LVA/QSP reports unchanged (no authored rules → no section), editor panel present on a draft.
7. SoT: CLAUDE.md anchor + `plans/CHANGELOG.md` (`wave-u-launched`) + Notion task + memory update.

**Kill:** zero/`_KILL` the flag + redeploy — the panel and both render additions vanish (already-frozen `result.findings` snapshots persist inert on submissions; authored rules persist on versions; nothing is lost, re-flip restores). Schema/validation hardening + the unconditional snapshot write: kill = revert commit.

## §6 Co-validate changelog (2026-07-05 — Codex staff-engineer review + independent Claude review, consolidated)

**C1 (Codex, BLOCKER) — render-time resolution is the wrong default → ACCEPTED, design reshaped (D18).** Codex: snapshot resolved findings into the frozen `result` at scoring time — no retroactive drift after flag flips/resolver changes, matches the slider precedent. Verified feasible: both submit routes + Wave O imports persist `result` for every template (qualitative included, ADR-0002). Refinement kept from house rules: the resolver runs UNCONDITIONALLY (flags gate capability/UI, never data correctness — Wave Q durable rule); the flag gates authoring + render only. U-3/U-5/D6 rewritten; ADR-0021 Decision 2 rewritten (uniform snapshot; slider `row.recommendation` back-compat duality; renderers select to avoid double-display).

**C2 (Codex) — `question-meta.ts` strips `recommendations`; render inputs assumed by the draft didn't exist → ACCEPTED (independently found by the Claude review too).** Moot under C1: reports read `result.findings`; no loader/QuestionMeta contract expansion. `question-meta.ts` stays rules-free by design (D20 pins it).

**C3 (Codex) — permanent walk alias is architecture pollution → PARTIAL.** Overridden: prod-DB walks stay (no staging exists; house launch truth = local-UI pilot vs prod DB; walking on real LVA/QSP would leak test findings into latest-published — grill-established). Accepted the spirit: the single magic entry became a documented reserved **prefix namespace** `walk-qual-*` (D14/U-6) — self-describing, reusable per wave (soft-deleted walk templates keep their alias claimed, so each walk needs a fresh alias anyway), pinned by a test. Codex's schema-field alternative (template-level reportType) rejected as a bigger model change than the problem (ADR-0010 made report type code-config deliberately).

**C4 (Codex) — preflight existing data before non-killable validation → ACCEPTED (D19, §5 step 0).** Real risk path: Duplicate-from-published hydration can carry legacy stray fields into a new draft whose publish would newly fail. Read-only scan before merge; fix or waive.

**C5 (Codex) — prefer a new `findings` field over overloading `recommendations` → OVERRIDDEN with rider.** D3 stands (user-confirmed; grill-established): the question type discriminates; one concept, one field; NUMBER bands are shape-identical to slider bands; zero migration for 305 live SU-Full bands. Codex's own condition — "tests must cover every generic reader/writer that touches `question.recommendations`" — adopted as D20 (reader-audit test).

**Claude-review findings folded in:** walk UI location made explicit (local-UI pilot + inline flag vs prod DB, §5.1); suppressed-section findings FIRE (D21 + resolver test); ANY retype drops rules (D21); 2,000-char publish cap on rule text (D21 — longest live band text measured at 482 chars); walk (a) tier prerequisite (§5.2); kill-story precision (flag kill hides rendered findings while snapshots persist inert — §5 Kill).

## §7 ADR
ADR-0021 — `docs/adr/0021-findings-rules-type-discriminated-snapshot-resolution.md`.
