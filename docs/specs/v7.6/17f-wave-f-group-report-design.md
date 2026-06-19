# Spec 17 Wave F — CEO / Group Report (#22) — design

> **Status:** brainstorm + grill-with-docs + grill-me + `/claudex:plan` (3 rounds: senior-eng →
> security → ops/SRE, all 21 findings accepted) COMPLETE (2026-06-18). Design hardened; ADR-0011
> ([aggregation-cohort-and-access-model](../../adr/0011-group-report-aggregation-cohort-and-access-model.md))
> rewritten to match. **Next: `/frontend-design` mockup (both archetypes) — HARD gate before build.**
> See the three claudex Changelogs + Loop outcome at the bottom.
> Source punch-list item: **#22** (the team-Mean / aggregate "CEO" view), deferred from Wave E
> (G1; ADR-0003 deferred the LVA group factor-bar; ADR-0007 "individual ≠ cohort report").
>
> **⚠ SCOPE UPDATE (2026-06-18, during build):** Jeff confirmed via Slack the group report is
> wanted on the **Leadership Vision Alignment assessment ONLY** (*"we don't need aggregate on all
> reports… just the one"* → *"Just LVA"*). The generic SCORED group archetype (Rockefeller/Five-D)
> below is **built but NOT surfaced** — both the loader and the CampaignDetail entry point gate on
> `GROUP_REPORT_ALIASES` (LVA only) in `wave-f-flags.ts`; a non-LVA campaign returns `notApplicable`
> (no model build, no audit) and shows no link. The scored sections of this doc describe the dormant
> engine, kept for a future ask (add an alias to surface). See [17f ops runbook](17f-ops-runbook.md).

## Goal

Aggregate a campaign's N completed submissions into **one team-level report** — Esperto's "CEO
Full Report" (a.k.a. *Summary Report*): *"CEO Report results compared with the averages of the
individual leader reports."* Per-respondent reports answer *"how did this one person respond?"*;
the group report answers *"where does the CEO diverge from the team, and what does the team
collectively say?"* — the core of a *vision-alignment* / quarterly-prep coaching conversation.

## Why now (Wave F)

Wave E shipped the per-respondent report (scored + qualitative, ADR-0010) but **explicitly deferred
the cohort view** (G1). #22 is the most concrete + buildable of the three Wave-F net-new subsystems
(#22 group, #23 longitudinal, #32 benchmarking). #23/#32 need a Jeff scope conversation first.

## Locked grill decisions

| # | Decision | Rationale |
|---|----------|-----------|
| **G1 Composition** | **Zero-config auto-aggregate.** The group report for a campaign = all completed submissions; the `isCEO` participant's submission is the CEO column; everyone else is "team." No picker, no persisted "report object." | A campaign already **is** a defined cohort and we already designate exactly one CEO per campaign (`isCEO` partial-unique index + `/ceo` endpoint). Esperto's Composition step (CEO min:1/max:1 + Team bucket) is already encoded by our roster + CEO designation. |
| **G2 CEO edges** | **Graceful degrade, never hard-block.** Always render the team aggregate from whatever's completed. The CEO column/tag appears **only when the designated CEO has a completed submission**. *No CEO designated* → team-only + nudge to designate (links to the CEO picker). *CEO designated, not submitted* → team aggregate + explicit "CEO (Name) — not yet submitted" placeholder (never fabricate a CEO column). | Matches Wave E's H10 defensive-degrade; coaches own the campaign and shouldn't be locked out of a good team view because the CEO slot is unfilled. Cost: the scored "Dev-from-CEO" headline is absent until the CEO submits (degrades to a plain team-average table). |
| **G3 Cohort / naming** | **Render at N≥1** (empty state only at N=0) + a "X of Y invited completed" context line. **Fully named/attributed** (names + job titles from `OrgRespondent`, CEO marked) — no anonymized variant in v1. | No anonymity to protect — leadership-team alignment instruments are *meant* to surface where named leaders diverge; Esperto names everyone. An anonymized aggregate is a real future feature, not v1. |
| **G4 Aggregation (→ ADR-0011), as revised R1/R2** | **Two distinct columns, distinct definitions** (R1-HIGH-1): the *qualitative* **`Mean`** = mean over respondents **who answered that question** (CEO included), honestly labeled "Mean". The *scored* **`Team avg` / `Dev`** = mean over **NON-CEO** submissions; `Dev = CEO − teamExclMean`; **N<2 fallback** suppresses `Dev` when <1 non-CEO submission exists. | "Dev from team" must compare the CEO to the *rest*, not a group containing himself (self-dilution; zero when only the CEO submitted). The qualitative `Mean` is a different, honestly-labeled column and stays CEO-inclusive (Esperto-faithful: LVA *Net profit %* Mean 13 = (18+10+10)/3). |
| **G5 Release (REVISED R3-HIGH-2)** | **Default-off `WAVE_F_GROUP_REPORT_ENABLED` flag** gating BOTH the CampaignDetail entry point AND the route (fail-closed when off) + an admin/org/coach **allowlist canary** + a documented **kill-switch** (zero the flag → both surfaces disappear, no redeploy). Launch = flip on (Wave B/D pattern). | Original G5 ("no flag") is OVERRIDDEN: a new **bulk named-PII** route is materially riskier than Wave C/E pure-rendering — an authz/render/capacity bug would otherwise hit every eligible campaign at merge with only a redeploy to stop it. A kill-switch is exactly what you want for a bulk-PII surface. |

## Architecture

Additive — **no migration** (`isCEO` already exists); **default-off `WAVE_F_GROUP_REPORT_ENABLED` flag + canary + kill-switch** (G5, revised R3-HIGH-2).

- **`group-report-model.ts`** (NEW, shared data layer — parallel to `qualitative-report-model.ts`):
  pure function `buildGroupReportModel({ submissions, participants, version, alias })` →
  a `CampaignGroupReport` of per-question **aggregated** rows. Reads **frozen `submission.result`
  + raw `answers`** only; never re-scores (mirrors `aggregate-report.ts`). Reuses
  `buildQuestionMetaByKey` (stableKey → type/label/section/min/max/options) and the Wave-E
  `SECTION_PRESENTATION` contract.
- **`getCampaignGroupReport(db, campaignId, actor)`** (NEW loader): authorized via a NEW
  **`canViewGroupReport`** policy (R2-HIGH-3) — privileged (admin/staff) bypass (audited); a
  non-privileged coach must be **currently active + currently own the org + currently have template
  access** (the stricter "write"-level currency checks, NOT the lenient retained-`"read"` gate),
  because the group report is a **bulk named-PII disclosure**. Loads campaign + pinned `versionId` +
  **all completed submissions** (the cohort — see GM2) + participants (`isCEO`, names, titles) in a
  **single consistent snapshot** (R2-MEDIUM-1: one joined read or a `RepeatableRead` tx) so counts,
  CEO marker, rows, and the stamped provenance all come from one instant → calls
  `buildGroupReportModel`.
- **Dispatch** by `reportConfigFor(alias).reportType`:
  `scored → <ScoredGroupReport>` | `qualitative → <QualitativeGroupReport>` (NEW components),
  mirroring the per-respondent `BrandedReport`/`QualitativeReport` split.
- **Route** `/(report)/assessments/[id]/report` (NEW, campaign-level — sits beside the
  per-respondent `…/respondents/[respondentId]/report`). Server component: `getApiActor()` →
  `getCampaignGroupReport` → dispatch. `export const dynamic = "force-dynamic"` + `revalidate = 0`
  (R1-LOW-1) **and** the middleware no-store matcher extended to `/assessments/[id]/report` so it
  gets a real `Cache-Control: no-store, private` header (R2-LOW-1). Rate-limited. Audited
  `GROUP_REPORT_VIEW` written **directly + fail-closed** (NOT the fail-open `logAudit`; R2-MEDIUM-2)
  capturing actor + IP/UA + generatedAt + versionId + contentHash + ceoParticipantId +
  invited/completed counts + the rendered submission IDs (or a model hash).
- **Entry point**: a "View group report" action on `CampaignDetail` (campaign-level, beside the
  per-row per-respondent report links). Gated by the new `canViewGroupReport` policy (above).
- **PDF**: Print → PDF via the existing report print CSS (`su-report.css` scope), same as
  per-respondent. No new export infra.

## Aggregation contract (the meat — hardened in ADR-0011 + the mockup)

The group model is **"the report model, but each question's value is the collation across
respondents."** Aggregation form is chosen by **(Wave-E section presentation) × (question type)**:

### Qualitative group (LVA, QSP — live qualitative templates)
Per question, grouped by question, **omit-empty** (a respondent who left it blank is skipped; a
question no one answered is omitted entirely — reproduces Esperto's conditional output with no
conditional engine, exactly the Wave-E rule):

1. **Free-text (`TEXT`)** → list each respondent's verbatim answer, `Name (role):` prefixed, CEO
   marked `(CEO)`. (LVA "Our main Products…", "Obstacles and challenges explained", etc.)
2. **Financial metric group (`NUMBER`, section presentation = financial-table)** → a matrix:
   columns `Mean | CEO | <each respondent>`, rows = the section's metric questions. **Mean over the
   respondents who *answered that metric*** (CEO incl. if they answered) — a blank is NOT averaged
   as 0 (R2-MEDIUM-2); each row shows its `n`; blank cell for a non-answerer; omit a row no one
   answered. (LVA "The Vision on the Future".)
3. **Standalone number (`NUMBER`, e.g. % rehire)** → per-respondent horizontal bars + a `Mean: X`
   marker. (LVA "Important Focus areas".)
4. **Rating group (the 16 strength/weakness factors)** → an aggregate **stacked Strong/Average/Weak
   bar** per factor (proportion across respondents) + a **composite score**, sorted descending.
   *(Plan/mockup TODO: confirm the LVA seed's actual question type for this section and the exact
   composite-score formula — derive from the per-respondent rating value mapping already in
   scoring; sort key = composite desc.)*
5. **Multi-choice (`MULTI_CHOICE`, e.g. obstacles)** → "**% of team who selected** each option"
   horizontal bars, sorted descending, option **labels not keys** (the Wave-E C-H1 fix). (LVA
   "Biggest Obstacles to achieve growth".)

Section ordering + intros follow the per-respondent qualitative report; defensive grouping +
"Additional responses" orphan bucket reused from Wave E.

### Scored group (Rockefeller, Five-Dysfunctions — live scored templates)
The scored aggregate **mirrors the per-respondent scored headline** — it aggregates whatever the
frozen `result` actually carries, not section-rows-only (R2-HIGH-2):
1. **Headline by what `result` contains** (matching `BrandedReport`'s adaptive headline): where
   present, **`perDomain`** means (CEO vs team, per domain) + **`scaleUpScore`** (CEO vs team mean)
   + **`tier`** (CEO's tier + the team tier distribution); **falling back to `perSection` rows**
   for non-domain templates. Live targets: Rockefeller (section + tier band) and Five-Dysfunctions
   (5 fundamentals as sections + neutral global tier) are section-based; this future-proofs domain
   instruments (SU Full's `perDomain`/`scaleUpScore`).
2. **Profile matrix** columns = **`CEO | Team avg | Dev`** with a ▲/▼ indicator. **`Team avg` =
   mean over NON-CEO submissions** of that section/domain's `averagePoints`; CEO = the CEO
   submission's value; **`Dev = CEO − teamExclMean`** (R1-HIGH-1 split — a true CEO-vs-rest gap).
   **N<2 fallback:** with <1 non-CEO submission, suppress `Dev` ("—"). `Dev` is signed + directional
   (alignment, **not** performance — no good/bad color). **Peers DEFERRED to #32.**
3. **Per-question CEO-vs-team bars**: CEO value + the **non-CEO team mean** (+ optional min/max), from
   `perQuestion.value`.
All values from the **frozen** `result` (never recomputed).

All values come from the **frozen** `result` — the group report never recomputes a score.

## Edge cases (defensive)

- **N=0 completed** → empty state ("No completed submissions yet"), no crash.
- **N=1** → renders; Mean = that one value; "1 of Y completed" context line.
- **CEO unset / CEO not submitted** → G2 graceful degrade.
- **Mixed types within a section** → section presentation contract + type fallback (Wave E).
- **Old/partial `result` JSON** → defensive degrade per Wave E H10 (skip malformed rows, never throw).
- **Single version** — a campaign pins one `versionId`, so all submissions share a version (no
  old-version grouping problem the per-respondent path had).

## Out of scope (v1)

- **Peers / benchmark column** (#32 — no cross-org benchmark data exists).
- **Email twin** (the group report is an on-screen/PDF coaching artifact; no auto-send).
- **Longitudinal / self-comparison** report (#23 — "4 years later", "self-comparison").
- **Esperto's persisted "Summary Report" object + composition picker** (G1: auto-aggregate).
- **Anonymized aggregate variant** (G3: named only).

## Slices

- **S1 — Qualitative group** (LVA/QSP): shared `group-report-model` + `QualitativeGroupReport` +
  route + CampaignDetail entry + audit. Covers the most team-oriented live templates.
- **S2 — Scored group** (Rockefeller/Five-D): `ScoredGroupReport` (profile matrix + per-question
  bars) via the same loader/dispatch.

## Grill-me deepening (2026-06-18, codebase-verified)

Five further branches resolved after a read-only recon pass (file:line in the session log):

- **GM1 — INVITED-only gate.** The group report is gated to `accessMode === INVITED`. PUBLIC
  campaigns (Quick Assessment) have no participants, no `isCEO`, anonymous `publicTaker` — a
  "CEO vs team" view is structurally meaningless; population aggregates for PUBLIC are the existing
  admin `aggregate-report.ts`'s job. The entry point + route both check `accessMode`; a PUBLIC hit
  returns a clean "available for invited campaigns only" state. The loader may therefore assume
  participants + `isCEO` exist.
- **GM2 — Submission-based cohort.** Aggregate **all completed submissions in the campaign**;
  resolve each name via `submission.respondentId → OrgRespondent` (survives roster removal); read
  `isCEO` from the participant row if it still exists (removed CEO → graceful no-CEO degrade, G2).
  Mirrors the immutable `teamPathAtAdd` snapshot pattern (a submission is a recorded fact). Roster-
  filtering is a one-line change if ever needed.
- **GM3 — Data-source split (the key architectural finding).** `scoreSubmission` only scores
  SLIDER_LIKERT, so a QUALITATIVE template's frozen `result` contains *almost nothing* (for LVA,
  only the `S3_strengths` rating lands in `perSection`). ⟹ the **qualitative group report aggregates
  raw `answers`** (`[{stableKey, value}]`, where `value` is number | string | string[] by type);
  the **scored group report reads `result.perSection`/`perQuestion`** (populated for Rockefeller).
  Verified LVA types: `S1_financials` = 9 NUMBER (→ metric-table matrix); `S3_strengths` = 16
  SLIDER_LIKERT **scale 1–3 Weak/Avg/Strong** (→ rating); `S4_biggest_obstacles` = 1 MULTI_CHOICE
  maxChoices:3 whose **option keys are the 16 factor keys** (→ choices); `S6_rehire_pct` = 1 NUMBER
  inside a `qa` section (→ per-respondent bars + Mean); rest = TEXT. `SECTION_PRESENTATION` already
  keys every LVA/QSP section (`metric-table`/`rating`/`choices`/`qa`) — reused to pick the group
  aggregate form, with the Wave-E `classifyByTypes` fallback for unmapped sections.
- **GM4 — Per-type aggregate specifics.**
  - *Rating (S3, 1–3):* per factor `{strongCount, avgCount, weakCount, mean}` → stacked
    Weak/Avg/Strong bar + mean on the native 1–3 scale, **sorted by mean desc** (no 0–10 rescale —
    honest to a 3-bucket scale).
  - *Obstacles (S4):* **% of respondents who *answered* the question** (omit-empty denominator) per
    option, all options shown incl. 0%, sorted desc, **labels not keys** (Wave-E C-H1).
  - *Financials (S1, metric-table):* matrix `Mean | CEO | <each respondent>`, Mean over
    **metric-answerers** (CEO incl. if answered, blanks not counted; R2-MEDIUM-2), per-row `n`,
    blank cell for non-answerers, omit a row no one answered.
  - *Standalone NUMBER in a qa section (rehire %):* per-respondent bars + `Mean:` marker.
  - *Free-text:* verbatim list, CEO first then team alphabetical, omit-empty.
- **GM5 — Shell, ordering, scale, scored math.**
  - *Shell:* branded "Group Report" cover (assessment + company name + date); **no salutation /
    no Verne** (Wave E G7); Wave-E footer (date + SU logo + "Generated by Scaling Up Platform", no
    id/version/hash); **per-question recommendations dropped in v1** (score-keyed to one person);
    section intro/description copy rendered if present (omit-empty, no new content dependency — LVA
    intros are the unresolved #29 content, so render-what's-pinned).
  - *Ordering:* CEO first, then team **alphabetical by display name** (deterministic); same order
    inside free-text collations.
  - *Scale (NORMATIVE, R1-M4/R3-M3):* financial matrix = `Mean | CEO | up to K team columns`,
    overflow → appendix; free-text verbatim truncated with expand on-screen + per-answer PDF cap;
    exact K/cap finalized at the mockup; large campaigns load-tested. (Replaces the old "no cap".)
  - *Scored Team-avg (REVISED R1-HIGH-1):* a section/domain's **Team avg = mean over NON-CEO
    submissions** of its `averagePoints` (the CEO is excluded from the comparison group); CEO = the
    CEO submission's value; `Dev = CEO − teamExclMean`, **N<2 fallback** suppresses `Dev` ("—") when
    <1 non-CEO submission; signed + directional arrow, **alignment not performance** (no good/bad color).

## Gates (process)

1. `/claudex:plan` (3-round adversarial: senior-eng → security → ops/SRE) → fold findings here.
2. `/frontend-design` mockup of both archetypes (qualitative + scored group frames) → **user
   sign-off** (HARD gate before the renderer build, per Wave E E-2 / project pattern).
3. `writing-plans` → `17f-…-implementation-plan.md` (TDD tasks).
4. subagent-driven build → final whole-branch review → `/co-validate` → merge → SoT flush + Notion.

## References

- ADR-0011 (NEW) — [group-report aggregation, cohort, and access model](../../adr/0011-group-report-aggregation-cohort-and-access-model.md) (rewritten post-claudex: qualitative Mean incl. CEO / scored Team-avg excl. CEO; submission-based orphan-robust cohort; `canViewGroupReport`; default-off flag).
- ADR-0003 (LVA group factor-bar deferred) + ADR-0007 (individual ≠ cohort) — this wave closes both.
- ADR-0010 — two report types (scored | qualitative); the group report reuses the same dispatch.
- Esperto reference (on disk, `From Jeff/APP_scaling up assessemnt/`): group-report PDFs
  `Leadership_Vision_Alignment_Group_report_…pdf` (qualitative archetype),
  `ScalingUp_group_report_…pdf` ("Leadership Team version", scored archetype, **Peers column**),
  `Quarterly_Session_Preparationv2_Group_report_…pdf`; the "CEO Full Report" wizard
  (Variant → Type → Composition[CEO min:1/max:1 + Team] → Check-out) = images 1–4 in the
  "Screen Shots" sheet of `…/APP_leadership vision alignment assessment/leadership visin alignment assement.xlsx`.
- Existing infra reused: `aggregate-report.ts` (in-memory mean of frozen results, precedent),
  `question-meta.ts`, `qualitative-report-model.ts`, `report-config.ts`, `access-control.ts`
  (`canManageCampaign`), `isCEO` + `/api/assessment-campaigns/[id]/ceo`.

---

## Changelog — Round 1 (claudex senior-engineer review)

All 8 findings material; **all accepted** (2 with scope-bounded refinements), none rejected.

**[HIGH-1 — accepted, refined] CEO-vs-team math + labeling.** Split the aggregate by archetype:
- *Qualitative* `Mean` column = mean over respondents **who answered that question** (CEO included); labeled "Mean" (not a "deviation") — Esperto-faithful, no mislabel.
- *Scored* profile matrix `Team avg`/`Dev` = mean over **NON-CEO** submissions; `Dev = CEO − teamExclMean` — a true CEO-vs-rest alignment gap. **N<2 fallback:** with <1 non-CEO submission, suppress `Dev` ("—", "needs ≥1 other submission"). Supersedes the blanket "CEO-included for both" in G4/ADR-0011: qualitative Mean keeps the CEO; the scored comparison drops the CEO from the team group.

**[HIGH-2 — accepted] Scored aggregate mirrors the per-respondent scored headline.** Not section-rows-only — aggregate whatever the frozen `result` carries, matching BrandedReport's adaptive headline: `perDomain` means (CEO vs team) + `scaleUpScore` (CEO vs team mean) + `tier` (CEO tier + team tier distribution) **where present**, falling back to `perSection` rows for non-domain templates. Live targets Rockefeller (section + tier) + Five-Dysfunctions (section + neutral tier) are section-based; this future-proofs domain instruments (SU Full).

**[MEDIUM-1 — accepted; persisted snapshot deferred] Reproducibility / "as of".** Visible provenance line — *"As of {generatedAt} · {completedCount} of {invited} completed · version {versionId}"* — plus generatedAt/completedCount/versionId/contentHash in the GROUP_REPORT_VIEW audit. Persisted snapshot / freeze-on-close = noted follow-up (the per-respondent report is also on-demand; not v1 scope).

**[MEDIUM-2 — accepted] Consistent denominators + per-aggregate n.** Every aggregate uses the **answerer denominator** and renders its `n`: financial Mean over metric-answerers (a blank is NOT averaged as 0), obstacles % over question-answerers, rating mean over answerers (16 required → n=completed), free-text shows the response count. Refines G4 ("all completed" → "all who answered that question, CEO incl.").

**[MEDIUM-3 + LOW-2 — accepted] Cohort/denominator reconciliation.** The participant-delete route **blocks removal after submission**, so every completed submission belongs to a current, non-revoked participant — submission-based ≡ current-roster. Cohort = completed submissions of current participants; **denominator Y = non-revoked invitations, numerator X = SUBMITTED** (canonical `getInvitationBand`) — consistent num/denom. Names resolve live from `OrgRespondent` with the "as of" provenance setting the current-data expectation; `isCEO` from the live participant row. The "removed-CEO → no-CEO degrade" (GM2) is retained as **defensive handling for legacy/manual data only** (unreachable via normal UI).

**[MEDIUM-4 — accepted; thresholds at mockup] Scale caps.** Financial matrix = `Mean | CEO | up to K team columns`; beyond K, overflow team columns → appendix (full data retained), headline shows "Mean / CEO / +M others". Long free-text verbatim truncated with expand on-screen + a per-answer cap in PDF (mirrors Wave E byte-budget). Replaces GM5's "no cap." Exact K + cap finalized at the /frontend-design mockup.

**[LOW-1 — accepted] No-store mechanism.** Report page uses `export const dynamic = "force-dynamic"` + `revalidate = 0` (mirroring the per-respondent report page), not a literal `Cache-Control: no-store` header on a server component; route-handler/middleware wrapper only if a real header is later required.

## Changelog — Round 2 (claudex security & data-integrity review)

All 7 findings material; **all accepted**, none rejected. Body + decisions rewritten inline to one authoritative model (no body/Changelog drift).

**[HIGH-1 — accepted] Stale normative text fixed inline.** The G4 row, the loader/route architecture, and the scored contract in the body now state the post-R1 model directly (qualitative `Mean` = answerers incl. CEO; scored `Team avg`/`Dev` = NON-CEO mean + N<2 fallback). ADR-0011 will be rewritten to supersede its "CEO-included for both / all completed" text when findings are folded back into 17f + ADR-0011 (it currently still carries the pre-R1 wording). Tests to assert: scored team avg excludes CEO; qualitative means use answerer denominators.

**[HIGH-2 — accepted; R1-M3 roster-flip WITHDRAWN] Cohort = completed submissions, orphan-robust.** R1-M3 wrongly assumed removal-after-submit is blocked; in fact the delete route's submission-check is a non-transactional pre-check and the invitation FK is `ON DELETE SET NULL`, so a concurrent submit can orphan a completed response (invitationId null, participant gone). **Revert to submission-based cohort (GM2): aggregate ALL completed submissions, never drop a real response.** The loader **detects orphaned submitted respondents** (submission with no current participant row), still **includes** them (named via the surviving `OrgRespondent`), and flags them; `isCEO` from the participant row if present. Headline count = completed-submission count. The delete-route TOCTOU + SET-NULL race is flagged as a **recommended adjacent hardening** (move the submission re-check into a row-locking tx, or switch hard-delete → revoke/soft-delete) — tracked as a follow-up; the group loader is robust regardless.

**[HIGH-3 — accepted] `canViewGroupReport` policy.** The group report is a bulk named-PII disclosure, so it must NOT reuse the lenient retained-`"read"` gate. New policy: admin/staff bypass (audited); a non-privileged coach must be **currently active + currently own the org + currently have template access**. Applied at the loader + the CampaignDetail entry point.

**[MEDIUM-1 — accepted] Single consistent snapshot.** Load campaign + version + participants + completed submissions in one joined read or a `RepeatableRead`/`Serializable` tx; derive visible provenance + audit fields from that one instant (no mixed-instant rows/counts/CEO-marker).

**[MEDIUM-2 — accepted] Answerer denominators + per-aggregate `n`.** Financial Mean over metric-answerers (blank ≠ 0), obstacles % over question-answerers, rating over answerers; every aggregate renders its `n`. Body lines corrected.

**[MEDIUM-3 — accepted] Validate raw answers on read.** The qualitative model normalizes each raw answer against `questionsByKey` (finite numbers, type match, known option keys, dedupe stableKeys), skips invalid values with a degraded notice (Wave-E H10), with malformed-row tests — so imports/manual repairs/malformed JSON can't distort means/%/counts.

**[LOW-1 — accepted] Real no-store header.** Beyond `dynamic="force-dynamic"`/`revalidate=0`, extend the middleware no-store matcher to `/assessments/[id]/report` so the bulk-PII page gets a real `Cache-Control: no-store, private` header like the per-respondent report.

## Changelog — Round 3 (claudex ops & SRE review)

All 6 findings material; **all accepted**, none rejected.

**[HIGH-1 — accepted] Authoritative source-of-truth.** PLAN.md body fully reconciled (G5 flag, GM5 caps + scored NON-CEO team avg). The canonical fold (done immediately after this loop) rewrites `docs/specs/v7.6/17f-wave-f-group-report-design.md` + **renames/rewrites ADR-0011 away from "CEO included / all completed"** to the post-R1/R2 model, then restores the PLAN.md hub. Guard tests required at build: scored team avg EXCLUDES the CEO; `canViewGroupReport` enforces current active-coach/org-owner/template-access.

**[HIGH-2 — accepted; OVERRIDES G5] Default-off flag + canary + kill-switch.** New server-side `WAVE_F_GROUP_REPORT_ENABLED` gates BOTH the CampaignDetail entry point AND the `/assessments/[id]/report` route (fail-closed when off); admin/org/coach allowlist canary; documented kill-switch (zero the flag, no redeploy). This is the Wave B/D pattern, appropriate for a new bulk named-PII surface — supersedes G5's "no flag, merge=launch."

**[MEDIUM-1 — accepted] Observability.** Emit structured `assessment.group_report.*` metrics — render p95 latency, 5xx/render-failure, degraded-row count, authorization-deny, orphan-submission count, audit-failure, rate-limit-hit — with alert gates and an `/admin/observability` panel (closes the Wave-E deferred observability follow-up for this surface).

**[MEDIUM-2 — accepted] No prefetch on the entry point.** The "View group report" link uses `prefetch={false}` (or a plain `<a>`), matching the per-respondent report precedent, so Next.js can't fetch the bulk-PII report or write `GROUP_REPORT_VIEW` audit rows before an explicit click; regression test asserts CampaignDetail render issues no group-report fetch/audit.

**[MEDIUM-3 — accepted] Capacity/abuse controls.** A per-actor + per-campaign + IP rate limit applied **before** the expensive aggregation load, fail-closed 429; the column/verbatim/PDF caps are now **normative** (stale "no cap" removed); large campaigns load-tested.

**[LOW-1 — accepted] Ops runbook.** A build deliverable `docs/specs/v7.6/17f-ops-runbook.md` (like 17d/17e): flag-flip launch order, canary checks, observability dashboard queries, kill-switch + rollback sequence, audit-failure response, post-rollback smoke tests.

---

### Loop outcome
3 rounds complete (senior-eng → security → ops/SRE): R1 2H/4M/2L, R2 3H/3M/1L, R3 2H/3M/1L — **all 21 findings accepted** (one R1 reconciliation withdrawn in R2; G5 overridden in R3). Next: fold this hardened model into 17f + ADR-0011 + a Wave-F ops-runbook stub, restore the PLAN.md hub, then the `/frontend-design` mockup gate.
