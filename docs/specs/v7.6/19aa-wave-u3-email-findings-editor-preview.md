# Spec 19aa — Wave U §3 leftovers (part 1): findings in the results email + editor test-a-value preview

> **Status:** BUILT — editor findings preview LIVE on merge (reuses the live Wave U flag); results-email findings MERGED DARK behind `WAVE_U3_EMAIL_FINDINGS_ENABLED` (default OFF). Launch = flag flip after a walk (pending, separate authorization).
> **Wave:** Wave U §3 leftovers, part 1. (Single-letter 19a–19z is exhausted; continuing as `19aa`.)
> **Flags:** editor preview reuses the LIVE `isFindingsLogicEnabled()` (Wave U). Email findings get a
> NEW default-OFF flag `WAVE_U3_EMAIL_FINDINGS_ENABLED` (ships dark; kill = zero the flag).
> **Migration/schema/ADR:** none (extends ADR-0021; renders the existing frozen `result.findings`).
> **Deferred out of this wave:** group-report/cohort findings (§3 item 3) — see D1.

## 1. Problem / goal

Wave U (spec 19u, ADR-0021) freezes answer-driven `result.findings` on every submission and renders
them in the two per-respondent reports. Two authored-findings gaps remain:

1. **Results email carries no findings.** `buildReportEmailHtml` renders no recommendations block at
   all (scored) and the qualitative path uses `buildQualitativeModel`, which deliberately omits
   findings (D7 report-only isolation, same posture as Wave S peers). So a respondent/coach who reads
   the results email never sees the recommendations that appear on-screen.
2. **No authoring preview.** The editor's per-question `FindingsPanel` lets an author write band/option
   rules but gives no way to test "if someone answers X, which finding text fires?" — authors publish
   blind.

Goal: close both, reusing the existing frozen-snapshot substrate (`parseResolvedFindings` /
`buildFindingsSection`) and the pure `resolveFindings`. No new findings data model.

## 2. Scope

**In scope:**
- **Findings in the results email** — a findings block in `buildReportEmailHtml` for BOTH the scored
  and qualitative paths, reading `report.result.findings` (the frozen snapshot). Gated by the new
  `WAVE_U3_EMAIL_FINDINGS_ENABLED` (default OFF).
- **Editor "test-a-value" preview** — a preview sub-block in `FindingsPanel` (QuestionsTab.tsx) that
  runs the pure `resolveFindings` live on a sample answer. Gated by the existing (live)
  `isFindingsLogicEnabled()`.

**Explicitly OUT of scope (deferred — D1):**
- **Group/cohort-report findings.** The cohort-aggregation semantic is undefined (union / per-finding
  counts / most-common / shared-only / attributed roster) AND the scored group report has no
  recommendations section to host it. Deserves its own wave + likely a product call with Jeff.

## 3. Decision log

### D1 — Group-report findings DEFERRED to its own wave
Of the three §3 leftovers, group-report findings is the only one whose *core semantic* is undecided
(what is "a group finding" when findings are per-answer?), and the scored group report (CEO-vs-team
matrix + anonymized Appendix B) has no natural recommendations slot. Bundling an under-defined design
fork with two ready, well-understood items would stall the ready ones. Split out; grill separately
(candidate: Jeff's view on a cohort "recommendations/themes" view).

### D2 — Flag strategy: new default-OFF flag for the EMAIL; reuse the live Wave U flag for the PREVIEW
`WAVE_U_FINDINGS_ENABLED` is already LIVE in prod, so reusing it for the email would push
recommendations into real results emails the instant this deploys — a sensitive send-path change that
also reverses the deliberate D7 report-only isolation. So the email surface gets its **own
default-OFF flag** `WAVE_U3_EMAIL_FINDINGS_ENABLED` (mirrors the Wave-flag idiom; call-time
`process.env`, no caching): ships dark, launch-walk a real results email, then flip. The **editor
preview** is an admin authoring tool with no send/prod-data effect, so it reuses the existing
`isFindingsLogicEnabled()` — live alongside Wave U. Both gates control RENDERING only; the frozen
`result.findings` write is untouched (Wave Q rule: flags gate capability, never persisted data).

### D3 — Render the FROZEN snapshot on the email; resolve LIVE only in the preview
The email reads `report.result.findings` via `parseResolvedFindings` — never re-resolves on the read
path (ADR-0021; the `recommendations-reader-audit.wave-u` guard forbids new re-resolution readers).
The editor preview is the ONE authoring-time exception that may call the pure `resolveFindings` live,
and it is a read-only simulation — it never writes/mutates a snapshot. All paths stay
total-tolerant / never-throw (house rule since Wave N): malformed/absent frozen data ⇒ omit, never
500 a send.

### D4 — Email recipients: BOTH taker copy + referring coach
Both the person assessed and the referring coach receive findings in their results email. Peers were
kept out of the coach email, but recommendations are more actionable for a coach (they coach on them).

### D5 — Scored email renders ALL finding kinds (incl. slider bands); qualitative reuses the existing block
- **Scored email:** a NEW consolidated findings block (there is no on-screen-style recommendations
  block to merge into) rendering ALL kinds from the frozen snapshot, **including SLIDER_LIKERT bands.**
  Rationale: the email has no legacy per-row slider-rec rendering, so there is no double-display
  problem; excluding sliders (as the on-screen scored report does) would gut recommendations for
  slider-heavy scored instruments like SU-Full — their email would show few/none. This deliberately
  diverges from `BrandedReport`'s non-slider filter, for the stated reason.
- **Qualitative email:** reuse `buildFindingsSection` (all kinds), matching the on-screen
  `FindingsBlock`. Rendered **before** the answers block so recommendations survive the qualitative
  email's ~90 KB byte budget / answer truncation (`QUAL_EMAIL_BYTE_BUDGET`).

### D6 — Reverses the D7 report-only isolation for the email (deliberate); Wave S guard stays green
Adding findings to the email is an intentional reversal of the Wave U D7 "findings isolated to the
report" stance (same isolation Wave S applied to peers). It does NOT trip the Wave S byte-identity
guard (`report-email.wave-s-guard.test.ts` freezes PEERS only) as long as the email findings code
imports nothing from `peer-benchmarks`. Add a NEW email-findings test + a **flag-OFF byte-identity
assertion** (email unchanged when `WAVE_U3_EMAIL_FINDINGS_ENABLED` is off / no snapshot).

### D7 — Editor preview: faithful widget, tolerant, no-drift by shared function
- **Input:** reuse the real `QuestionInput` answer widget so the preview IS the respondent experience
  — slider honors `scale` min/max/step; MULTI_CHOICE uses real checkboxes and allows multiple
  selections → shows the ordered list of fired texts (authored option order); the "no answer / blank
  ⇒ no finding fires" case is shown explicitly so authors understand the hidden⇒omitted rule.
- **Live + tolerant:** updates as the author types, even with in-progress / partially-authored /
  coverage-gap rules (matches the panel's existing tolerance).
- **No drift:** EXTRACT a single shared per-question rule→resolve helper reused by BOTH the preview
  and `buildQuestionsPayload`'s findings emission (question-serialization.ts ~L509-538), so "what the
  preview says fires" provably equals "what save emits." This is the main correctness risk if not shared.
- **Slider note:** slider preview shows the resolved band text with a one-line note that scored
  on-screen reports render slider recs via the per-row path (raw resolver output is what freezes).

### D8 — Copy parity, no ADR
Reuse `FINDINGS_EYEBROW` ("What to work on next") / `FINDINGS_TITLE` ("Your recommendations") for the
email block (on-screen/email parity). No ADR (extends ADR-0021; no new architectural decision); no
schema, no migration.

## 4. Files (anticipated)

| File | Change |
|------|--------|
| `src/src/lib/assessments/report-email.ts` | Scored + qualitative findings blocks (flag-gated, escaped, email-safe `<table>`); qualitative renders findings before answers |
| new `src/src/lib/assessments/wave-u3-flags.ts` | `isEmailFindingsEnabled()` — default-OFF `WAVE_U3_EMAIL_FINDINGS_ENABLED` (mirrors wave-*-flags.ts) |
| `src/src/components/admin/template-editor/QuestionsTab.tsx` | `FindingsPanel` test-a-value preview sub-block (reuses `QuestionInput`; calls the shared resolve helper) |
| `src/src/components/admin/template-editor/question-serialization.ts` | Extract the shared per-question rule→resolve helper (used by save + preview) |
| `src/src/lib/assessments/findings.ts` / `findings-section-model.ts` | Export/host the shared helper if that's the cleaner home (keep pure/total-tolerant) |
| tests | Email findings (scored all-kinds incl. slider; qualitative before-answers) + flag-OFF byte-identity + preview (widget, multi-select order, no-answer case, preview==save parity) |

## 5. Verification
- `CI=true npx next build --turbopack` green.
- New tests green; full sweep parity (jest-verify count; the 7 pre-existing failing suites only).
- **Flag-OFF byte-identity**: with `WAVE_U3_EMAIL_FINDINGS_ENABLED` off, `buildReportEmailHtml` output
  is byte-identical to today (scored + qualitative). Wave S peer guard still green.
- ESLint clean.
- Editor preview verified: preview-fired text == `buildQuestionsPayload` emission for the same rule
  (the no-drift property), across all rule types + the no-answer case.

## 6. Rollout
- **Editor preview** — live with Wave U on merge (authoring tool; reuses `isFindingsLogicEnabled()`).
- **Email findings** — merges DARK (`WAVE_U3_EMAIL_FINDINGS_ENABLED` default OFF). Launch = flip the
  flag on Vercel Production after a launch-walk: send a real results email (test campaign) for a
  scored (slider-bearing) and a qualitative template, confirm findings render correctly in-inbox and
  that recipients are both taker + coach. Kill = zero the flag. SoT on push; Notion task; adversarial
  review before merge.

## 7. Co-validate changelog
User greenlit the build directly ("go") without the optional `/co-validate`
staff-review pass (offered; Codex is env-down so it would have run as the
Workflow fallback). The pre-merge adversarial review (§8) served as the
independent-review gate instead.

## 8. Adversarial review outcome
Two independent adversarial lenses (correctness/security/regression +
no-drift/spec-fidelity), each reading the full diff + new files and running the
load-bearing suites:

- **0 confirmed defects** on every attacked invariant — flag-OFF byte-identity
  (scored + qualitative), never-throw on null/malformed `result`, HTML-escaping,
  the `buildFindingRecommendations` ↔ `buildQuestionsPayload` equivalence (no
  drift; content-hash-stable key order), MC authored-option-order, the Wave S
  source+behavior guard, and the reader-audit guard (email reads the frozen
  `result.findings`, never `question.recommendations`).
- **1 LOW edge, both lenses independently:** the qualitative *empty-answer-body*
  fallback ("Your assessment has been received.") dropped the findings block —
  mildly against the D5 "findings survive the extreme of answer truncation"
  intent (not a byte-identity/throw break; not reachable today since live
  templates ship zero authored findings). **FIXED:** findings now lead the
  degraded body too (`${findingsBlock}${received}`; "" when the flag is off ⇒
  byte-identical). Locked by two new tests (findings render in the fallback;
  flag-OFF degraded body byte-identical).

Verification: build green (`CI=true npx next build --turbopack`); ESLint clean;
37 new tests across 4 suites; full sweep 5,600 pass / 28 fail (7 pre-existing
failing suites only — zero new).
