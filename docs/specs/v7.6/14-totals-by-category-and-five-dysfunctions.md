# Spec 14 — Totals by Category + Five Dysfunctions assessment

Status: **plan / contingency** ("just in case" per Jeff's Slack). No build, no DB writes until approved. Assessment-domain; sits in the v7.6 spec library. Engine: `src/src/lib/assessments/scoring.ts`.

## 1. Context (Jeff's asks)
- **June, 8:40 AM:** "Does the current setup for assessments allow me to do **totals by category**?" — pointing at the **Five Dysfunctions of a Team** team-assessment (Lencioni / Pfeiffer / Wiley, ISBN 0-7879-8618-6). Gabriel replied "checking this now" → this spec closes that.
- **Escalation (later):** "Ultimately we are going to want the **5 dysfunctions exactly like they have it in their toolset**" (the Esperto / Scaling Up Toolkit version).

## 2. Finding — the platform ALREADY does totals by category
The scorer emits per-category subtotals today:
- `ScoreResult.perSection[]` — always (each section: `totalPoints`, `averagePoints`, `achievedCount`, `totalCount`).
- `ScoreResult.perDomain[]` — when a template groups sections into `domains[]`; each domain carries `averagePoints` + a resolved `tier` (band).
- The branded results report renders per-section/per-domain breakdowns.

**Live proof:** Scaling Up Full already scores the **4 Decisions** (People / Strategy / Execution / Cash) as domains, each with its own subtotal + band. That *is* totals-by-category.

## 3. Phase 1 — the answer for Jeff (no build)
Relay to Jeff (paste-ready):
> **Yes — the platform does totals by category.** You group an assessment's questions into categories, and each category gets its own subtotal + interpretation band on the results report. Scaling Up Full already does this with the 4 Decisions (People/Strategy/Execution/Cash). So a category-scored assessment like the Five Dysfunctions (Trust / Conflict / Commitment / Accountability / Results) fits the model directly.

That unblocks the Slack reply immediately. Everything below is the **ultimate** build.

## 4. Phase 2 — Five Dysfunctions "exactly like the toolset"

### 4.1 Licensing gate (BLOCKER — confirm before any build)
The Five Dysfunctions Team Assessment (the statements **and** the interpretation text) is **© 2007 Patrick Lencioni, published by Pfeiffer/Wiley — "All rights reserved."** This spec deliberately **does not reproduce that content.** Before we host it on the platform we must confirm Scaling Up holds the right to reproduce/distribute it digitally (their toolset presumably licenses it; that license must extend to our implementation). **Owner decision (Jeff/Scaling Up legal) — do not build until confirmed.**

### 4.2 Content source (when cleared)
Obtain the **toolset's exact version** — ideally an **Esperto export**, the same way the other assessments were exported into `From Jeff/` (Five Dysfunctions is **not** in that folder yet). Capture verbatim: the rated statements, the response scale, the category→item mapping, the band thresholds, and the per-category interpretation text — from the licensed source, not transcribed here.

### 4.3 Scoring structure (methodology — facts, no copyrighted text)
The instrument's *method* (not its wording) maps cleanly onto the existing engine:
- **38 rated statements, 1–5 scale**, grouped into **5 categories**: Trust, Conflict, Commitment, Accountability, Results. Category item counts: 8 / 8 / 7 / 7 / 8 (= 38).
- **Per-category score = average** of that category's items (sum ÷ count).
- **Per-category band** on the average: **High ≥ 3.75 · Medium 3.25–3.74 · Low ≤ 3.24**, each with a category-specific interpretation paragraph (sourced from the licensed content).
- **No reverse-scoring** — every statement is positively worded (high = healthy). ⇒ **No change to the scoring *math* is required** — but see §4.4a: the band *boundaries* need exact half-open semantics, which the current tier resolver/validator may not represent as-is.

### 4.4 Engine mapping (reuses existing `domains` feature — zero scoring-engine changes)
- Model each of the 5 categories as a **domain with one section**, questions = SLIDER_LIKERT with `scale {min:1, max:5}`.
- Configure each domain's **tiers** as the 3 bands (`≥3.75` High / `3.25–3.74` Medium / `≤3.24` Low) with the interpretation text as the band message.
- Result: `perDomain[].averagePoints` = the category average; `perDomain[].tier` = the band. Exactly the Lencioni output, via machinery Scaling Up Full already exercises.
- *(Presentation choice: questions can be grouped by category as sections, or kept in the source's interleaved order — both score identically since membership is by section, not position. Match the toolset's order.)*

### 4.4a Band-boundary semantics — a second engine gap **[claudex R2 High — confirm before publish]**
The Lencioni bands are **half-open**: High **≥ 3.75**, Medium **3.25–3.74**, Low **≤ 3.24**. The current per-domain tier model uses **inclusive min/max bounds** with **tiling validation** that requires contiguous ranges. A real boundary score (e.g. **3.25**, or a respondent average like **3.3333…**) can therefore either **fail publish validation** (gap/overlap at the 3.24↔3.25 and 3.74↔3.75 seams) or **fall into the wrong band** depending on rounding. Required before publish: define explicit **half-open / range-comparator** band semantics (or a licensed-toolset banding adapter), and add **boundary tests at 3.24 / 3.25 / 3.74 / 3.75** plus a repeating `3.333…` average. §4.3's "no scoring *math* change" stays true — the *banding* is the work.

### 4.5 The one real engine gap — team/group scoring **[REQUIRED, grill Q4]**
The instrument is fundamentally a **team** assessment (its purpose is the team's aggregate score per category + the discussion that drives), so the team/group per-category report is **in scope for v1, not optional** — an individual-only replica would be incomplete. The current cross-respondent dashboard (`CampaignTrendsView`) rolls up **per-section** across respondents but **not per-domain**. So the build must add **per-domain aggregation** to that dashboard (small, additive, well-scoped). Individual reports need no engine change; this team rollup is the one required engine addition.

**Canonical aggregation formula (claudex R2 — define up front):** the team score per category = **mean of respondents' per-domain averages** (each respondent → per-domain average; team = mean of those), **not** a pooled mean of raw answers (the two differ when respondents skip items). Carry **n per domain** (respondents contributing) for transparency, and **distinguish "no data"/null from a genuine low score** in the UI. State the partial-response rule (e.g. require all items answered for a respondent to count toward a domain) before implementing. **Dedupe to one submission per respondent** (the campaign's keep-rule) so a re-take can't double-count a person into the team mean.

**Authorization gap to close FIRST (claudex R2 — High).** The trends page/API currently gates only **organization ownership**, not template access or per-campaign read rights — so direct URL/API calls could expose results for templates/admin-created campaigns the actor shouldn't read. Before adding the per-domain aggregate (which would surface licensed Five Dysfunctions data), gate those reads with `canAccessTemplate` and/or `canManageCampaign("read")` for **every included campaign** (or a dedicated team-report route with explicit permissions), and add **URL-tampering regression tests**. Especially important given the licensed content (§4.1).

### 4.6 Report layout
Match the toolset's presentation (the 5-dysfunction pyramid + per-category band grid). Reuse the branded report components (ADR-0005 scoped brand).

### 4.7 DB-safety (hard constraint — 2 prior prod wipes)
**No scripts against the prod DB. No `prisma migrate reset`/`dev`/destructive ops.** Create the template through the **app's admin assessment editor** (Metadata/Sections/Questions/Scoring&Tiers tabs) — a guarded, validated, app-mediated path — **or**, if a seed is used, only the existing **additive, fail-closed, content-hash-idempotent DRAFT seeder** (`ensureTemplateVersionContent`) that never mutates published/live rows, run against **staging first**, with an admin reviewing + clicking Publish. Zero schema migration (reuses the frozen `ScoreResult` + `domains` shape).

**Concurrency / last-write-wins [claudex R2 Medium].** Admin draft edits + publish are currently **last-write-wins** with no `contentHash`/CAS guard — two admins editing the same template version can silently overwrite each other's question/scoring changes, or publish stale half-reviewed content. Require an **expected `contentHash` (or `updatedAt`)** on the template **PATCH and publish** mutations, return **409 on mismatch**, and record the hash in the **publish audit** event. (Applies to every template authored this way — Spec 14 and Spec 15 both.)

## 5. Build outline (when licensing is cleared)
1. Obtain + verify the toolset's exact Five Dysfunctions content (export).
2. Create the template via the admin editor: 5 domains, 38 SLIDER_LIKERT items (1–5), per-domain bands + interpretation text, source order.
3. Add per-domain aggregation to `CampaignTrendsView` for the team report (additive).
4. Report layout to match the toolset (branded components).
5. Verify scoring against a known sample (category averages + bands); admin publishes from DRAFT.

## 6. Out of scope / open
- **Licensing confirmation** — gate on §4.1.
- **Obtaining the toolset export** (not in `From Jeff/` yet).
- Whether group/team scoring is in v1 (drives §4.5).
- Reverse-scoring/weighting — **not needed** for Five Dysfunctions; only relevant if a *future* instrument requires it.

## Revision log
- **R2 (claudex round 2, 2026-06-09):** this reconciliation added §4.4a (half-open band-boundary semantics — corrects the "zero engine change" claim), the §4.7 contentHash/CAS guard on template edit+publish, and the §4.5 submission-dedupe note. The earlier R2 pass had already added the §4.5 canonical aggregation formula and the §4.5 authorization-gap prerequisite (deduped here).
