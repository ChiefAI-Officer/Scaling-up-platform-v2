# Wave J — Scaling Up Full business logic — Design

> **Status: 🚧 GATED DESIGN (one spec, owner-reviewed).** Grounds Spec 18 §C in the actual Esperto
> SU-Full source (group + individual + self-comparison PDFs, `scalingupassessment.xlsx`, `matrix.xlsx`)
> and the current code. Per the gated-wave rule this still needs a per-wave **implementation plan**
> (writing-plans) before any code. Nothing here is a build instruction yet.
>
> Source authority: `From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/` —
> `ScalingUp_group_report_*.pdf`, `ScalingUp_CEO_Full_report_*.pdf`, `ScalingUp_selfcomparison_report_*.pdf`,
> `scalingupassessment.xlsx`, `other samples/matrix.xlsx`. Comprehension run: workflow `wf_48fa37d2-4ec`.

## 0. Owner decisions (locked)

| # | Decision | Resolution |
|---|----------|------------|
| Phase tile (J-1) | how far | **Full fidelity** — background/growth inputs + mid-survey "Phase N" interstitial + report prose (match source) |
| Peers (J-2) | data source | **Seed the numbers extracted from the sample report PDFs** into an admin-editable table, marked PROVISIONAL; retune later |
| Anonymity (J-3) | scope | **Group report anonymized** (non-CEO → means / "Person N"); **individual report keeps names** (matches Esperto's variant split) |
| Launch | posture | **Build dark** behind the existing default-OFF `WAVE_F_GROUP_REPORT_ENABLED`; SU-Full stays DRAFT; launch is a later flag-flip |

## 0b. Source-audit corrections (2026-06-26 — full PDF + xlsx re-read)

> A second, exhaustive faithfulness pass (all 13 PDFs + every xlsx screenshot tab; see
> [`18j-su-full-source-extract.md` → "AUDIT 2026-06-26"](18j-su-full-source-extract.md)) corrected/sharpened
> several facts this design relied on. **Design-affecting deltas:**
>
> 1. **Phase driver = PERMANENT FTE, not perm+temp combined.** Discriminating case: 7 perm + 2 temp (=9) →
>    *Pioneering* (P1, 1–7), which only works if temp is excluded. `resolvePhase()` should key on permanent
>    FTE; if J-1 collects a single combined field, treat it as permanent (confirm with Jeff). Bands unchanged.
> 2. **Esperto has NO score bands/tiers.** No LOW/GOOD/TOP anywhere; standing = peer-percentile prose ("X% of
>    comparable companies score higher") + ▲/▼ arrows. The overall ScaleUp score is an integer that **can
>    exceed 100** (all-10s → 107) via bonus points. → **J-3/launch must NOT invent tier bands.** Either mirror
>    the percentile model or keep the platform's existing neutral "—" tier. (Kills the old "40/65 cutoffs".)
> 3. **Per-section score formula known:** section "score" (0–100) = SUM of that section's 0–10 answers
>    (max = 10 × #questions); the matrix value (0–10) = the section MEAN. Overall ScaleUp remains opaque
>    (weights + ambition + past-growth + bonus). Useful for J-2 benchmark parity.
> 4. **Peer benchmarks are cohort-dependent** (size/phase/profile-matched; e.g. Leadership-Team peer 18.1 at
>    14 FTE vs 11.9 at 115 FTE). J-2 seeds stay PROVISIONAL one-cohort samples — already the plan, now with
>    explicit justification. Full 10-section benchmark set is in the extract audit.
> 5. **Anonymity CONFIRMED against the real group report:** Appendix B = "CEO score" + "Person 1".."Person 4",
>    columns People/Strategy/Execution/Cash (no You), **no phase tile in the group report at all**; CEO
>    individual report names members (Appendix B/C). Validates the `groupReportAnonymized` render approach.
> 6. **P3/P4/P5 phase narratives are now HARVESTED** (v2 tab in-survey tiles) — see §1/§7 update. P3 and P4
>    share identical body copy in the source (a genuine Esperto artifact).
> 7. Report length varies by variant (plain individual **26pp**, appendix-bearing 31pp, **group 23pp**,
>    condensed 2pp); the live closing screen promises a "30-page report". Cosmetic for us.

## 1. What the source established (facts, not assumptions)

**Growth-phase model (J-1).** Five phases keyed on **permanent FTE** (temp & freelance excluded — see §0b/C1):

| Phase | Name | Band (FTE) | Narrative source |
|------:|------|-----------|------------------|
| 1 | **Pioneering** | 1–7 | verbatim (individual report p4) |
| 2 | **Organization** | 8–24 | verbatim (self-comparison p4) |
| 3 | **Management** | 25–49 | in-survey tile harvested (shares P4's body — source artifact) |
| 4 | **Delegation** | 50–149 | in-survey tile harvested (shares P3's body — source artifact) |
| 5 | **Standardization** | 150+ | in-survey tile harvested verbatim (v2 tab) |

> The workbook's "9-49" P3 label is a source typo overlapping the 8-24 band; worked examples (15→P2, 40→P3,
> 100→P4) confirm the intended bands above. P1/P2 narratives are harvested verbatim; **P3/P4/P5 narratives
> need a clean source** (the v2 workbook screenshots had copy/paste artifacts) — flagged as a content gap (§7).

**Background / growth input set (J-1)** — verbatim labels from `scalingupassessment.xlsx`:
- Years in existence (NUMBER)
- Permanent/temporary employees, FTE (NUMBER) — **drives the phase**
- Freelance employees, FTE (NUMBER)
- Leadership positions filled (MULTI_CHOICE checkboxes): Finance · HR · Operations · Marketing · Sales · IT · R&D · Other
- Revenue: two-years-ago · last-year · target-this-year · next-year · target-in-two-years (NUMBER, $M) → computed growth %
- Sector (single select, 14 options), market (B2C/B2B/Both), country/state/postal, gender, age, years-as-entrepreneur, # active co-founders, external investors (Y/N), partner/network strategy (Y/N), % revenue abroad, ScaleUp self-estimate (0–100)
- Biggest-challenge free text (echoed in the report conclusion)

**Report anatomy.** "4 Decisions + You" — **People · Strategy · Execution · Cash · You** (fixed brand colors).
- **YOUR PROFILE matrix** columns: `[section] · CEO score · Team avg · Peers · Dev-from-team · Dev-from-Peers` (0–10; dev shows value + red ▼ when negative).
- **Per-question tri-bar**: `you` (CEO single bar) / `team` (range bar: dark=min, light=max, black stripe=avg, number=avg) / `peers` (single benchmark bar). Scale 0–10.
- **Per-section header** carries a 0–100 peer-benchmark sentence ("The average score for this section is N. Your average score is M.").
- **Conclusion**: "You have a ScaleUp Score of N" + highest/lowest section + same-phase peer comparison + biggest-challenge free text.

**Anonymity (variant-specific, confirmed).** Esperto ships distinct report variants: Condensed CEO · CEO Full (names members in Appendix B/C) · **Anonymous Team Report** (`groupanon` — CEO vs "Person 1..N", no names) · Self Comparison. Our **campaign-level group report** maps to the *Anonymous Team Report* for SU-Full → **anonymize non-CEO respondents; the CEO's own individual report is unchanged**.

## 2. The big architectural win — most of J-3 already exists

The **scored group-report engine is fully built and tested, only gated off**:
- `lib/assessments/group-report-model.ts` → `buildScoredReport()` / `buildScoredDomains()` / `buildScoredTier()` are implemented; dispatch at line ~1304 already routes non-qualitative templates to the scored path.
- `components/assessments/ScoredGroupReport.tsx` renders the domains block + ScaleUp score + tier (presence-driven) and **explicitly names "SU Full"** in its anatomy comment.
- It is unreachable ONLY because of the one-line allowlist `GROUP_REPORT_ALIASES = ["leadership-vision-alignment"]` in `lib/assessments/wave-f-flags.ts`.

So **J-3's scored team report is mostly: add the alias + render anonymity + render the Peers column + publish SU-Full**, not net-new modelling.

## 3. Decomposition & sequencing

Build in three shippable slices, each its own PR; **J-3 → J-2 → J-1** is the recommended order (cheapest/highest-leverage first), all behind the dark flag:

- **J-3 (first) — Scored anonymous group report.** Alias flip + anonymity property + render. Smallest code, highest visibility, reuses the built engine. Peers column renders empty/hidden until J-2.
- **J-2 (second) — Benchmark "Peers" table + admin editor + seed.** Lights up the Peers / Dev-from-Peers columns in both group and individual reports.
- **J-1 (third) — Background/growth inputs + phase tile.** The heaviest (survey-flow changes + new input handling + report prose); independent of J-2/J-3.

> Each slice is additive and flag-dark, so they can merge independently without launching anything.

## 4. J-3 — Scored anonymous group report

**4.1 Surface the engine.** Add `"scaling-up-full"` to `GROUP_REPORT_ALIASES`; update `wave-f-flags.test.ts` (line ~193 hard-asserts the single-element array). No model/renderer code needed for the base scored team report.

**4.2 Anonymity property.** Add an **additive, dedicated** column — `AssessmentTemplate.groupReportAnonymized Boolean @default(false)` — NOT an overload of `aggregationMode` (anonymity is orthogonal to the FULL_VISIBILITY/CEO_ONLY *visibility* axis). Rationale: it's a per-template policy admins edit in the template editor; `report-config.ts` is alias-keyed/global and the version `reportConfig Json?` column is dead/unread.
- **Render-layer only.** The model already separates means (`teamAvg`, `mean`, distributions) from named cells (`perRespondent`, `answers[].name`). Thread the flag through the group-report loader provenance → `ScoredGroupReport` (and `QualitativeGroupReport`) to relabel non-CEO respondents "Person N" and suppress names. No scoring/model change. The CEO row stays identified.
- Default `false` = today's behavior (LVA unaffected). SU-Full seed sets it `true`.

**4.3 Dependencies for launch (dark until met):** SU-Full PUBLISHED (currently DRAFT) + a **standing-signal decision** (Esperto has NO tier bands — mirror its peer-percentile + ▲/▼ model, or keep the platform's neutral "—" tier; see §0b/C2, §7) + `WAVE_F_GROUP_REPORT_ENABLED` on. Build dark; do not publish SU-Full in this slice.

## 5. J-2 — Industry-benchmark ("Peers") table

**5.1 Model (additive migration).**
```
model AssessmentBenchmark {
  id          String   @id @default(cuid())
  templateId  String                       // FK → AssessmentTemplate
  metricKind  BenchmarkMetricKind          // DOMAIN | SECTION | SCALEUP
  metricKey   String                       // domain key (people/strategy/…) | section stableKey | "" for scaleup
  peerLabel   String   @default("Industry")
  value       Float                        // 0–10 for DOMAIN/SECTION; 0–100 for SCALEUP
  provisional Boolean  @default(true)
  updatedBy   String?
  updatedAt   DateTime @updatedAt
  @@unique([templateId, metricKind, metricKey, peerLabel])
}
```
Domain-level is the primary join (5 stable keys matching `ScoreResult.perDomain[].key` — already the headline in `ScoredGroupReport`).

**5.2 Seed (provisional).** Seed the per-domain/per-section peer numbers extracted from the sample group-report PDF (e.g. Your Employees 5.9, Company Culture 6.3, … per §1's matrix; section 0–100 figures 47.3 / 31.4 / …) via a guarded seed script, all `provisional=true`. These are ONE cohort, explicitly provisional — admins retune.

**5.3 Admin editor.** A CRUD panel on the template (admin/STAFF only, audited, Zod-validated). **DB caveat (pre-existing, not unique to benchmarks):** the app runs one Neon DB across all envs, so any admin write in a preview deploy mutates prod — this affects every admin mutation today, not just benchmarks. Recommend the **preview/prod DB separation as a follow-on infra improvement** (not a Wave J blocker); for now benchmark editing is prod-as-truth like every other admin write.

**5.4 Render.** Join benchmark rows by (metricKind, metricKey) into the Peers / Dev-from-Peers columns in `ScoredGroupReport.tsx` (matrix + per-question) and the per-domain cards in `BrandedReport.tsx`. Omit-empty: no benchmark row → no Peers column (graceful-degrade, matching existing report conventions). Support both ▼/▲/● deviation directions.

## 6. J-1 — Background/growth inputs + phase tile

**6.1 Inputs.** Reuse existing question types where possible: NUMBER (years, FTE, revenue, age, etc.), MULTI_CHOICE (leadership positions, sector, market, yes/no). Add a **new section** "Background & Growth" to the SU-Full template (forward-only re-seed → new version). Revenue growth % is computed/displayed, not entered.

**6.2 Phase computation.** Pure helper `resolvePhase(permTempFte: number) → { phase: 1..5, name, band }` using the §1 bands. Driven by perm/temp FTE only (freelance excluded; revenue does not override) — confirm against the live tool if a 2nd source surfaces.

**6.3 Mid-survey interstitial.** A new pager page type (`section-pages.ts` + `section-pager.tsx`) — a non-question "milestone" page rendered after the Background section: *"You've reached Phase N – {Name} phase"* + the phase narrative. Branded (`.su-assessment-brand`). Skippable-forward only.

**6.4 Report prose.** The report INTRODUCTION interpolates the background inputs + the resolved phase narrative (HTML-escaped — the source leaked unescaped free text). P1/P2 verbatim; P3/P4/P5 prose pending a clean source (§7).

## 7. Open dependencies / content gaps (must resolve before LAUNCH, not before build)

1. **ScaleUp standing model** — Esperto has **NO tier bands** (no LOW/GOOD/TOP); it shows a 0–100+ ScaleUp score (can exceed 100 via bonus pts) + peer-percentile prose + ▲/▼ arrows (§0b/C2). Per-section score = SUM of 0–10 answers (formula known); overall weighting opaque. The scored group report renders the frozen `result` verbatim → build-safe. **Before publishing SU-Full, decide: adopt Esperto's percentile model or keep the neutral "—" tier** (don't invent 40/65 cutoffs). Needs Jeff.
2. ~~P3/P4/P5 phase narratives~~ **HARVESTED** (all 5 in-survey tiles, v2 tab; §0b/C6). Residual: Esperto's P3 & P4 tiles share identical copy (source artifact) — get distinct prose from Jeff only if desired.
3. **Authoritative peer dataset** — we seed one sample cohort as provisional; real peer norms come from Jeff or future platform aggregate.
4. ~~Anonymity confirm~~ **CONFIRMED** against the real group report: Appendix B = "CEO score" + "Person 1".."Person 4", no names, no phase tile; individual report names members (§0b/C5). Design's group-only anonymization matches Esperto exactly.
5. **Preview/prod DB separation** — recommended infra follow-on (benchmark editor inherits the existing single-DB caveat).
6. **Two coexisting scales** (0–10 bars vs 0–100 section averages) — render both from the frozen result; do not recompute.

## 8. Launch posture

All three slices merge **dark** (additive; no behavior change with `WAVE_F_GROUP_REPORT_ENABLED` off and SU-Full DRAFT). Launch sequence (separate, owner-gated): confirm ScaleUp scoring → publish SU-Full → flip `GROUP_REPORT_ALIASES`-gated flag (canary → global). Kill-switch = flag off. Matches the Wave F dark-merge pattern.

## 9. Testing

- `resolvePhase` band table (incl. boundary values 7/8, 24/25, 49/50, 149/150).
- Anonymity render: `groupReportAnonymized=true` → no non-CEO names, CEO named, means intact; `false` → unchanged (LVA regression).
- Benchmark join: present → Peers + Dev columns; absent → omit-empty; both ▼/▲ directions.
- `GROUP_REPORT_ALIASES` now includes scaling-up-full (update the hard-assert test).
- Scored group report for SU-Full reads frozen `result` verbatim (no recompute); N<2 → null team aggregates.
- Full build gate + ESLint + browser smoke per the deployment protocol.

## 10. Non-goals

- No change to SU-Full's 1–10 question scoring or the ScaleUp rollup math (display/UX + benchmark + phase + anonymity only).
- No live-tool data creation.
- No preview/prod DB split in this wave (recommended follow-on).
- Individual-report anonymization (group only).


---

## 11. Grill decisions (2026-06-26, `/grill-with-docs`) — SUPERSEDING

> Codebase-grounded grill (Explore agent mapped the real state). These 7 decisions **supersede** the
> matching earlier sections where they differ — the earlier text is kept for rationale. Net effect:
> **Wave J first build = J-3 + J-2 only, dark, no migration.**

| # | Decision | Supersedes |
|---|----------|-----------|
| **G1** | **Aggregate-only group report; defer the per-member "Appendix B" (Person N).** The *scored* model (`buildScoredReport`) exposes **only aggregates** — no per-member data (the `perRespondent`/`answers[].name` separation is the *qualitative* model, not scored). So Appendix B needs new model plumbing; defer it. **Consequence: the `groupReportAnonymized` boolean is DROPPED** — the aggregate is inherently anonymous, nothing to toggle. | §4.2 (anonymity boolean) |
| **G2** | **Seed Peers at DOMAIN + SECTION + SCALEUP only (~16 numbers); defer per-question peers** (additive `QUESTION` kind later). Per-question tri-bar shows you/team only for now; omit-empty. | §5 (granularity) |
| **G3** | **Drop the invented tier band; standing = peer-deviation (▲/▼).** Esperto has no bands and we **cannot compute its percentile** (we have the peer *mean*, not the distribution). Config-gate the `tier` block off for SU-Full **(GROUP report only this wave; per-respondent deferred — see plan grill Q2)**, **render-layer only** — the computed tier stays in the frozen `ScoreResult`, just hidden. De-risks launch (no Jeff band-cutoff confirmation needed). See ADR-0015. | §4.3, §7.1 |
| **G4** | **Static config (`su-full-benchmarks.ts`), NOT a Prisma table + admin editor.** 16 provisional single-cohort numbers don't need a DB table/CRUD. **No migration.** Promote to a table when real cohort-matched data arrives. | §5 (table model) |
| **G5** | **Defer J-1 (phase tile + background section + interstitial + re-seed) to its own later slice.** It changes the *survey-taking* flow + needs net-new pager infra + a forward-only re-seed, and the phase tile is **individual-report-only** (never in the group report) — orthogonal to J-3/J-2. | §3 sequencing, §6 |
| **G6** | **Seed Peers on the platform's native scales: DOMAIN + SECTION = 0–10; ScaleUp = 0–100.** Domain/section matrix values (Your Employees 5.9, Company Culture 6.3, Leadership Team 4.5, Operational Processes 5.6, Sales&Marketing 6.4, Scalability 6.6, Cash 7.8, You 5.4, etc.) come from Esperto's 0–100 section SUM ÷ question-count (47.3/8 = 5.9 ✓). **ScaleUp Peer = 53.1 (0–100)** because `ScoreResult.scaleUpScore = round(rollup×10)` is 0–100 (scoring.ts:1443) — do NOT divide it to 5.3. Store native, no rescaling layer. | new (correctness; ScaleUp-scale fix /grill-me 2026-06-26) |
| **G7** | **Two-gate dark; one known test break; no LVA regression.** `GROUP_REPORT_ALIASES = ["leadership-vision-alignment","scaling-up-full"]` (update `wave-f-flags.test.ts`). Stays dark via flag-OFF **and** SU-Full DRAFT. LVA path untouched (qualitative dispatch); Peers logic lives only in the scored model + renders only where `su-full-benchmarks` has entries. Launch = separate confirmed publish + flag-flip, gated on Jeff's content sign-off. | §8 |

**Resulting build scope (this wave, all dark, no migration):**
1. **J-3:** add `"scaling-up-full"` to `GROUP_REPORT_ALIASES` (+ fix the test); config-gate the SU-Full tier block off (G3).
2. **J-2:** `su-full-benchmarks.ts` (0–10, domain/section/scaleup); extend the scored model to carry an optional `peers` value per domain/section + ScaleUp (additive) + `Dev·Peers = CEO − Peers`; render the Peers column + Dev·Peers in `ScoredGroupReport.tsx`, omit-empty.
3. Tests + dark verification. **Deferred:** Appendix B (G1), per-question peers (G2), benchmark table + admin editor (G4), J-1 phase tile (G5), per-question/cohort fidelity.
