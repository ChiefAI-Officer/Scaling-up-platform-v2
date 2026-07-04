# Wave S — LVA Peer Benchmarks (Jeff July-1 #12 + #13)

**Date:** 2026-07-03 (brainstorm + grill-with-docs + grill-me, all decisions user-confirmed)
**Status:** APPROVED — co-validated (Codex + independent review, changelog below) and user-greenlit 2026-07-03 ("proceed to build"). ADR-0019 written. Building on `feat/wave-s-lva-peer-benchmarks`.
**Jeff items (verbatim, `From Jeff/gabriel-items-2026-07-01.pdf`):**
- **#12 — LVA Peer Averages:** "Need the ability to **set** peer averages for questions in the LVA, and ultimately to add peer average functionality to new templates going forward." *(Jeff's own note: may overlap with the Wave J industry-benchmarking item — resolved below: it IS the deferred Wave J promotion.)*
- **#13 — LVA Peer Comparison in Individual and Group Reports:** "Both the individual and group LVA reports need to display the peer comparison, matching the format of the existing report." *(Depends on #12.)*

---

## 0. Ground truth (evidence)

1. **The Esperto LVA source has NO peers.** The full-evidence fidelity audit (`18-lva-source-fidelity-audit.md` §2.4) records: *"No benchmark/peers column in source — ours correctly has none."* So #12/#13 is **net-new capability**, not source fidelity. "Matching the format of the existing report" is read as: fit the peer comparison into our existing LVA report layouts (and the house peers presentation from SU-Full), not "copy an Esperto LVA peers page" (none exists).
2. **This is the deferred Wave J promotion.** Wave J designed a generic `AssessmentBenchmark` table + admin editor (18j §5), then grill decision **G4** shipped SU-Full peers as a static file (`su-full-benchmarks.ts`) with the explicit deferral *"Promote to a table when real cohort-matched data arrives"*, and **G2** deferred per-question peers (*"additive `QUESTION` kind later"*). Jeff's #12 is that promotion + that kind.
3. **No LVA peer dataset exists anywhere** — not in the Esperto exports, not from Jeff. Any seeded values would be invented numbers; ADR-0015's honest-data stance (we refused to fabricate Esperto's percentile) applies. Therefore the capability ships **empty**: reports render peers only after an admin enters values.
4. **Surfaces:**
   - Group: `QualitativeGroupReport.tsx` rating section — each of the 16 S3 factors already carries a 0–10 `scaledValue` (Wave L `ceil1`, `GroupRatingFactor.stableKey` is the join key; `group-report-model.ts:174`).
   - Individual: `QualitativeReport.tsx` via `buildQualitativeModel` — S3 is **suppressed** (`REPORT_FILTERS["leadership-vision-alignment"].suppressSections:["S3_strengths"]`, Esperto-faithful). The same model feeds the **respondent results email** (`report-email.ts:439`) — the email twin.
   - Keys: 16 questions `S3_<factorSlug>` (SLIDER_LIKERT 1–3, `seed-lva-assessment.ts` — `FACTOR_STABLE_KEYS`), continuity-protected across versions per ADR-0001.
   - Editor home: admin template detail page (`(dashboard)/admin/assessments/templates/[id]`); API namespace `/api/admin/assessment-templates/[id]/...`.

---

## 1. Decision log (15 decisions, all user-confirmed 2026-07-03)

| # | Decision | Call | Why |
|---|----------|------|-----|
| D1 | Peer source | **Admin-set via editor** — no seed, no live cross-org aggregate | Jeff's literal "ability to set"; no honest dataset to seed; live aggregate has tiny N + privacy questions and contradicts the seeded model (ADR-0015) |
| D2 | Who / level | **Admin/STAFF only, template-level, audited** | Benchmarks are platform truth; Wave J §5.3 shape; coaches read, never write |
| D3 | Keys covered | **16 LVA S3 factors only** (0–10 scale), schema generic via `metricKind` | Only LVA questions where a cross-company average is meaningful; financial absolutes are size-dependent; more kinds later without migration |
| D4 | Individual report | **New additive "compared to peers" section**, renders ONLY when values exist | Esperto-faithful S3 suppression untouched when benchmark absent; report byte-identical until values set |
| D5 | Group report | **Inline in the existing rating rows** — `Peers N.N` + ▲/▼ next to `scaledValue` | "Format of the existing report"; no duplicate 16-label matrix |
| D6 | Generality | **Generic store + editor; LVA render only this wave.** SU-Full static file UNTOUCHED | Don't destabilize the live, verified Wave J path for zero user gain; consolidation = named follow-on |
| D7 | Flag | **`WAVE_S_PEER_BENCHMARKS_ENABLED`** gates editor writes AND both render joins | Content-affecting wave → house default; kill = zero flag (rows persist, reports revert) |
| D8 | Partial coverage | **Per-factor omit-empty + atomic full-set save** | Values are deliberate admin input (unlike SU-Full's seed-drift hazard → its all-or-nothing fail-closed stays SU-Full-only); one-transaction save means partial = deliberate, never mid-edit |
| D9 | Email twin | **Screen report only** — results email byte-identical | Email has a size budget + separate email-safe HTML build; parity = follow-on. Enforced by construction: the peers section is a separate pure builder, NOT added to `buildQualitativeModel`. **Product sign-off recorded** (co-validate C4): the results email is *respondent*-facing while Jeff #13's "reports" are the *coach*-facing web/print artifacts (consistent with his #4/#9 print framing); decided with the email-twin fact explicitly on the table; revisit only on Jeff feedback |
| D10 | Editor visibility | **Render-enabled aliases only** (`PEER_RENDER_ENABLED_ALIASES = ["leadership-vision-alignment"]`) | No dead switches (Wave O honest-framing rule); adding an alias lights panel + render together |
| D11 | Launch shape | **Verify → clear → hand to Jeff**: flag ON, editor live, reports omit-empty until real numbers entered | No fabricated benchmarks persist on coach-facing reports; the capability is the deliverable |
| D12 | ADR | **ADR-0019** — per-question peer benchmarks as admin-set DB rows; SU-Full static file retained | Supersedes G4 for QUESTION kind; explains the two-benchmark-systems state |
| D13 | Individual placement | **S3's natural slot** (between vision and obstacles), titled with the real section name + comparison framing | Report keeps survey order; the section is what it is — the respondent's S3 ratings vs the peer reference |
| D14 | Save semantics | **Full-set reconcile** (semantics: replace-set; mechanism per co-validate C3): one transaction upserts changed, inserts new, deletes missing — blank = no row; stale keys pruned; unchanged rows keep id/timestamps | DB always mirrors the last-saved form; orphans can't accumulate; clean audit story (before/after deltas) |
| D15 | PR / launch cadence | **One PR, merge dark, same-session launch walk** (each prod mutation individually authorized) | House pattern from Waves P/Q/R; migration is additive + inert |

---

## S-1 — Schema + migration

New enum + model (additive; no existing-table changes):

```prisma
enum BenchmarkMetricKind {
  QUESTION   // Wave S — per-question peer mean (LVA S3 factors)
  // Deliberately NO reserved values (co-validate C2): DOMAIN/SECTION/SCALEUP
  // are added by the SU-Full consolidation follow-on as one-line additive
  // migrations when (if) that wave is greenlit.
}

model AssessmentBenchmark {
  id          String              @id @default(cuid())
  templateId  String
  template    AssessmentTemplate  @relation(fields: [templateId], references: [id], onDelete: Cascade)
  metricKind  BenchmarkMetricKind
  metricKey   String              // question stableKey (QUESTION kind)
  value       Float               // 0–10; bounds-checked then ROUNDED to 1dp server-side
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  @@unique([templateId, metricKind, metricKey])
  @@index([templateId])
  @@map("assessment_benchmarks")
}
```

- **Template-level, not version-level** *(co-validate C1 — considered and OVERRIDDEN)*: Codex argued benchmarks should be version-scoped because wording can drift under a stable key. Rejected because (a) the house display layer is deliberately template/alias-level, global and retroactive — `REPORT_FILTERS`, `LVA_REPORT_FACTOR_LABELS`, the ceil1 scale all carry the documented contract "apply to ALL LVA versions; a presentation contract, not a per-version content choice"; (b) ADR-0001 gives stableKeys cross-version semantic continuity (a semantic change warrants a new key); (c) peers are a **reference dataset** ("companies who have preceded you"), not version content — comparing an old-pinned submission to the current peer set is the correct semantics, exactly as Esperto does; (d) version-scoping would blank all values on every publish, forcing a 16-number re-key. Mitigations that address the underlying worry: the editor validates keys against the currently-published version, the save reconcile prunes stale keys, and report provenance records the benchmark `updatedAt` so any view is attributable to the peer set in force.
- **Trimmed schema** *(co-validate C2 — accepted)*: `peerLabel`, `provisional`, `updatedBy` dropped — nothing writes or renders them this wave (the audit trail owns the actor; multi-benchmark sets are speculative). The `metricKind` discriminator stays so the QUESTION rows don't need a backfill when consolidation adds other kinds.
- **Migration:** hand-authored additive SQL (`CREATE TYPE` + `CREATE TABLE`), Wave Q comment style, applied by the Vercel build's `prisma migrate deploy`. **NEVER `prisma db push`/`migrate dev` locally — local `DATABASE_URL` is the production Neon DB.**

## S-2 — Flag

New `src/src/lib/assessments/wave-s-flags.ts` mirroring `wave-n-flags.ts`/`wave-o-flags.ts`: `isPeerBenchmarksEnabled()` with KILL > ENABLED, call-time `process.env` reads, no caching. Default OFF.

Gates: (a) the editor panel render, (b) the benchmarks API (PUT reconcile), (c) the group-report benchmark fetch/join, (d) the individual-report benchmark fetch/section. Flag OFF ⇒ zero DB reads on report paths and byte-identical reports/pages.

`PEER_RENDER_ENABLED_ALIASES: readonly string[] = [LVA_TEMPLATE_ALIAS]` lives in the new benchmarks lib module (S-3) — the single list that gates BOTH panel visibility and render joins (D10).

## S-3 — Benchmarks lib + admin editor

**New `src/src/lib/assessments/peer-benchmarks.ts`** (pure + thin DB helpers, following house layering):
- `PEER_RENDER_ENABLED_ALIASES` (D10).
- `listRatingQuestionKeys(versionQuestions): { stableKey, label }[]` — SLIDER_LIKERT questions of the template's currently-published version, in question order. For LVA ⇒ exactly the 16 S3 factors. Labels shown in the editor use the **report** factor labels (`LVA_REPORT_FACTOR_LABELS` overrides where present) so the admin sees what the report prints.
- `getQuestionBenchmarks(db, templateId): Map<stableKey, value>` — QUESTION-kind rows.
- `reconcileQuestionBenchmarks(db, templateId, entries, actorId)` — **one transaction, atomic full-set reconcile** (D8/D14, mechanism per co-validate C3): upsert changed values, insert new keys, delete keys missing from the submission — unchanged rows keep their id/timestamps (clean history, clobber-resistant). Entries validated against `listRatingQuestionKeys` of the published version (unknown key ⇒ 400), `0 ≤ value ≤ 10` bounds check, then **rounded to 1dp server-side** (no float-unsafe Zod `multipleOf`). External semantics unchanged from D14: the DB always mirrors the last-saved form; blank field = key absent = row deleted.

**API — `PUT /api/admin/assessment-templates/[id]/benchmarks`** (new route, PUT only — the server-rendered panel receives its initial data as props and the PUT returns the saved set, so no GET is needed):
- Guards in order: `getApiActor()` → 401; `isPrivilegedRole` → 403; flag OFF or alias not render-enabled → 404. Zod body (`{ entries: { stableKey, value }[] }`, bounded array length ≤ 64) + `withRateLimit` + `logAudit` (entityType `ASSESSMENT_TEMPLATE`, action `BENCHMARKS_RECONCILED`, changes payload = **before/after deltas** per key — benchmark values are not PII).

**Panel — `PeerBenchmarksPanel` on the admin template detail page:** renders only when flag ON **and** template alias ∈ `PEER_RENDER_ENABLED_ALIASES` (D10). One row per rating question (report label + numeric input 0–10, step 0.1, blank = unset), one **Save** button (atomic reconcile), saved/error states. Copy states plainly: "Peer averages render on LVA reports. Blank = the factor shows no peer comparison."

## S-4 — Group report (#13, group half)

- `group-report.ts` (the DB-facing builder): when flag ON and alias ∈ `PEER_RENDER_ENABLED_ALIASES`, fetch the template's QUESTION benchmarks and pass a pure `Map<stableKey, number>` into the model build (model stays DB-free, matching its "pure data + pure helpers" contract).
- `group-report-model.ts`: `GroupRatingFactor` gains optional `peers?: number` and `devPeers?: number`. In the LVA S3 path (where `scaledValue` is computed), a factor whose stableKey has a benchmark gets `peers = value` and `devPeers = scaledValue − peers` (signed, 1dp, computed only when `scaledValue !== null` — a scale-degraded factor gets NO peer comparison rather than a raw-mean-vs-0–10 mismatch).
- `QualitativeGroupReport.tsx`: in each rating row, when `peers` is present render `Peers N.N` + deviation glyph next to the existing value — ▲ (above peers) / ▼ (below) / ● (equal), value styled like the SU-Full deviation convention (red on negative). Print CSS: the addition lives inside the existing row; no new page-break rules expected (verified in the print QA gate).
- Omit-empty per factor (D8): factors without a benchmark render exactly as today.
- **Provenance:** bump `GROUP_RENDER_VERSION` → `"lva-fidelity-v2"`. The version string describes the ruleset in force — which from this wave *includes the conditional peers join* — so it ships unconditionally at merge (flag OFF just means the conditional rule joined nothing). Whether peers actually applied on a given view is carried separately: `peerBenchmarks: { applied: n, updatedAt: max(updatedAt) }` in the `GROUP_REPORT_VIEW` audit changes payload when ≥1 factor joined (parallels the SU-Full benchmark version string).

## S-5 — Individual report (#13, individual half)

- **New pure builder in `peer-benchmarks.ts`**: `buildPeerComparisonSection({ questionsByKey, rawAnswers, benchmarks })` → `{ sectionKey: "S3_strengths", title, items: { stableKey, label, ownRating: "Weak"|"Average"|"Strong", ownValue: 0|5|10, peers, dev }[] } | null`. Per factor: requires BOTH a benchmark value AND an in-domain own answer (1|2|3 → 0/5/10); factors missing either are omitted; zero items ⇒ `null` (section absent).
- **NOT added to `buildQualitativeModel`** — that model is shared with the results email (`report-email.ts:439`); building the section separately keeps the email byte-identical by construction (D9).
- The respondent report **page** (`(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx` server side): when flag ON + alias render-enabled, fetch benchmarks, call the builder, pass the optional `peerComparison` prop into `QualitativeReport`.
- `QualitativeReport.tsx`: renders the section **in S3's natural slot** (D13). Concrete splice rule (the model's section list excludes the suppressed S3, so the slot must be derived): **insert immediately before the `S4_obstacles` section when present in the model; else append at the end.** Title: the real section name + comparison framing — **"Organizational Strengths and Weaknesses — compared to peers"**, with a one-line intro: "Your rating per factor next to the peer average (companies that have preceded you in this assessment)." Row: report factor label · own rating word (with its 0/5/10 value on the shared axis) · `Peers N.N` · ▲/▼/●.
- No benchmark rows (or flag OFF) ⇒ prop absent ⇒ report byte-identical to today, S3 suppression intact.
- Styling: existing `su-report` table/dl classes (incl. Wave R's full-width conventions); print-safe (`break-inside: avoid` on the section block).

## S-6 — Security & audit (standing practice)

Zod at the boundary; `getApiActor()` first (401), privileged-role check (403); `withRateLimit` on PUT; `logAudit` on every save; no raw HTML anywhere (labels rendered as text); no secrets logged. Benchmarks are non-PII platform config.

## S-7 — Explicitly OUT of scope (named follow-ons)

1. **SU-Full consolidation** — migrate `su-full-benchmarks.ts` DOMAIN/SECTION/SCALEUP into the table (+ its editor); keep the fail-closed all-or-nothing semantics decision for that migration.
2. **Results-email parity** for the individual peers section (D9).
3. **Per-question peers on SU-Full's tri-bars** (Wave J G2 deferral) — becomes trivial once consolidation lands.
4. **Non-LVA render enablement** — flip an alias into `PEER_RENDER_ENABLED_ALIASES` + panel lights up. (Multi-benchmark sets — e.g. a `peerLabel` column — were cut as speculative in co-validate C2; re-add only on a real ask.)
5. **Rehire-% peer value** (rejected D3 option — revisit only on an explicit ask).

## Test plan (TDD, subagent-driven)

**Unit — `peer-benchmarks.ts`:** key listing (published-version filter, order, report-label overrides); reconcile (blank pruning, stale-key pruning, unchanged rows keep id/timestamps, unknown-key 400, bounds check + 1dp rounding, single transaction); `buildPeerComparisonSection` (mapping 1/2/3→0/5/10, missing-answer omit, missing-benchmark omit, all-empty → null, dev sign/rounding).
**Unit — group model:** benchmark map joins by stableKey; `devPeers = scaledValue − peers`; scale-degraded factor gets no peers; omit-empty per factor; non-LVA alias never joins; provenance payload.
**API:** 401/403/404(flag)/429 ladder; Zod rejects; audit before/after deltas written; PUT returns the saved set.
**Render:** group row with/without peers (snapshot-free assertions on text: `Peers 6.3` + glyph); individual section present only with prop; placement between vision/obstacles; suppression intact without prop.
**Email guard:** `report-email` output byte-identical with benchmarks present in DB (the twin never sees them).
**Flag:** OFF ⇒ no DB benchmark reads (spy), byte-identical page/report/panel-absent.
**Regression:** existing LVA group/individual suites; `changelog-freshness`; `CI=true npx next build --turbopack`.

## Launch plan (D11/D15 — one PR, merge dark, same-session walk)

1. PR: schema + flag + lib + API + panel + both renders + tests. Adversarial whole-branch review before merge. Merge = still dark (flag unset; migration applies on the merge deploy, table sits empty and unread).
2. **Value-render verification BEFORE the prod flag ever flips** *(co-validate C5 — zero fabricated-value exposure)*: local-UI pilot against the prod DB with the flag inline (the established Wave O/R pattern; needs local `ASSESSMENT_SESSION_SECRET`). Each prod DB mutation individually authorized: save test values via the local panel → verify the group report ("LVA test new" N=2 + "LVA Spectrum" N=3) shows `Peers` + deviations → verify one individual report shows the S3-slot section → print QA one group PDF → **clear the values** (reconcile to empty) → verify byte-identity restored. Throughout this step the prod flag is OFF, so no fabricated number can render on any prod report at any moment. (A dedicated test template can't substitute — the render is alias-gated to the real LVA alias.)
3. Prod flip (authorized): set `WAVE_S_PEER_BENCHMARKS_ENABLED=1` + redeploy. Prod smoke: LVA template page shows the panel; group + individual reports byte-identical (omit-empty, no values exist); non-LVA template pages unchanged.
4. Hand-off: tell Jeff the peer-averages editor is live (screenshots/PDF from step 2 as evidence); he/Suzanne enter real numbers (his #12 "ability to set" is the deliverable). Kill = zero the flag; rows persist.
5. SoT: CLAUDE.md anchor + CHANGELOG entry + ADR-0019 + Notion task (auto-fire covers push).
6. Known gotchas honored: Vercel Preview lacks Production flags (group reports 404 on PR previews — use the local-UI pilot with the flag inline); local pilot needs `ASSESSMENT_SESSION_SECRET` (any local value); group-report read path can trip the 5s Prisma txn budget on high-latency clients (retry; ledgered Wave O follow-on).

## Co-validate changelog (2026-07-03 — Codex staff-engineer review + independent Claude review)

**Codex findings:**
- **C1 (version-scoped benchmarks) — OVERRIDDEN.** Rationale recorded in S-1: template-level matches the house display-layer contract (global/retroactive), ADR-0001 key continuity, and reference-dataset semantics; version-scoping would blank values on every publish. Mitigations for the underlying worry (wording drift) are in place.
- **C2 (schema over-generalization) — ACCEPTED.** Dropped `peerLabel`, `provisional`, `updatedBy`, and the reserved enum values; kept the `metricKind` discriminator (QUESTION only) to avoid a consolidation-time backfill.
- **C3 (replace-set loses row continuity) — ACCEPTED.** Save is now an atomic **reconcile** (upsert changed / insert new / delete missing, one transaction) with before/after-delta audit; external full-set semantics unchanged.
- **C4 (email exclusion needs product sign-off) — OVERRIDDEN as a change, ACCEPTED as documentation.** The sign-off already happened (D9, decided with the email-twin fact on the table); the spec now records the respondent-email vs coach-report reading explicitly.
- **C5 (fabricated test values on prod) — ACCEPTED, with a stronger mechanism than proposed.** Codex suggested a test template — impossible here (render is alias-gated to the real LVA alias). Instead the launch plan verifies value rendering via the local-UI pilot against the prod DB *before* the prod flag flips: zero window where invented numbers can render on prod reports.

**Claude independent findings (all folded in):** GET route dropped (server page provides panel data, PUT returns saved set); individual-section splice anchor pinned (before `S4_obstacles`, else append); 1dp enforced by server-side rounding, not Zod `multipleOf`; `GROUP_RENDER_VERSION` bump semantics clarified (ruleset string unconditional; per-view application in the audit payload); `provisional` YAGNI (converged with C2).

## ADR-0019 (to be written with the build)

"Per-question peer benchmarks are admin-set DB rows; SU-Full's static file is retained." Context: G4's static-only stance + Jeff's set-ability ask + no honest LVA dataset. Decision: generic `AssessmentBenchmark` (QUESTION kind), template-level (version-scoping considered and rejected — see spec S-1/C1), atomic reconcile saves, per-factor omit-empty, render-enabled-alias gating, no seeded values ever. Consequences: two benchmark systems until the consolidation follow-on; capability ships empty by design.
