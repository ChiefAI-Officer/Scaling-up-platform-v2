# Wave J (J-3 + J-2) Implementation Plan — SU-Full scored group report + Peers benchmark

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.
>
> **Review provenance:** the tasks below integrate every accepted finding from two Codex adversarial loops (`20260628-162315-250a43` R1–R3, then a deeper `20260628-165217-37fbdf` R1–R5) **as first-class task steps** — there is deliberately NO changelog section; the tasks ARE the resolution. One finding was reasoned-rejected (a loader-side runtime cohort cap — premature + inconsistent with LVA; replaced by a launch preflight + a `capacityOverBudget` visibility metric). The loop converged (loop-2 highs: 2→3→2→2→1).

**Goal:** Surface the already-built scored group report for Scaling Up Full and add a static Peers benchmark (domain/section + ScaleUp) with Dev·Peers, behind an **independent** SU-Full kill switch + an **enforced publish gate** — all dark, no migration.

**Architecture:** Pure-additive, render/loader-layer only. **Three enforced dark gates** (any one keeps it dark): (1) a NEW SU-Full-specific flag `WAVE_J_SUFULL_GROUP_ENABLED` (default-OFF, independent of LVA's `WAVE_F_*`, with a hard `WAVE_J_SUFULL_GROUP_KILL` that overrides any canary); (2) an enforced, **SU-Full-scoped** **publish guard** (`alias==="scaling-up-full" && version.publishedAt == null → notApplicable`; never gates LVA) in the loader, the entry-point link, AND the direct route; (3) the `GROUP_REPORT_ALIASES` allowlist — added atomically with the gates. Peers come from a static, versioned, key-set-bound `su-full-benchmarks.ts`; standing = peer-deviation (ADR-0015, no tier band). LVA's path is byte-for-byte unchanged (qualitative dispatch, WAVE_F flag).

**Tech Stack:** Next.js 16 / TypeScript / React; Jest + @testing-library/react. **No Prisma migration.**

**Source of truth:** [`18j-wave-j-su-full-design.md`](docs/specs/v7.6/18j-wave-j-su-full-design.md) §11, [`18j-su-full-source-extract.md`](docs/specs/v7.6/18j-su-full-source-extract.md) AUDIT, [ADR-0015](docs/adr/0015-su-full-standing-signal-peer-deviation-not-bands.md).

**Conventions:** commands from **`src/`**. App code under `src/src/`. Build gate `CI=true npx next build --turbopack`. Commit per task. Branch `feat/wave-j-su-full-group-report` off `main` (NOT the nav branch, NOT any L branch).

**Scales (do not conflate):** per-domain & per-section = **0–10**; ScaleUp Score = **0–100** (`scoring.ts:1443` `round(rollup×10)`; fixture ceo=70). Esperto's 0–100 section number = SUM of its 0–10 answers, so ÷ question-count = the 0–10 matrix value (47.3/8=5.9). → seed domain/section Peers at 0–10, ScaleUp Peer at 0–100 (53.1).

---

## File structure

| File | Change | Responsibility |
|------|--------|----------------|
| `lib/assessments/wave-f-flags.ts` | modify | independent `WAVE_J_SUFULL_GROUP_ENABLED`/`_CANARY`/`_KILL`; alias-aware `isGroupReportEnabled`; add `"scaling-up-full"` to `GROUP_REPORT_ALIASES` (in Task 3, atomic with gates) |
| `lib/assessments/report-config.ts` | modify | `showTier` (group-consumed only); SU-Full `showTier:false` |
| `lib/assessments/su-full-benchmarks.ts` | **create** | static Peers (domain/section 0–10, ScaleUp 0–100) + `SU_FULL_BENCHMARKS_VERSION` + `SU_FULL_BENCHMARK_KEYS` |
| `lib/assessments/group-report-model.ts` | modify | `peers?`/`devPeers?` on domain/section/ScaleUp; `showTier?`; `applyBenchmarks()` (domain+section, version-on-application, key-mismatch, no-CEO team-vs-peers) |
| `lib/assessments/group-report.ts` | modify | publish guard; `notApplicable` `reason`+`templateAlias`; alias-aware route hydration AFTER rate-limit; stamp `benchmarkVersion`/`benchmarkKeyMismatch` |
| `lib/assessments/report-gate-core.ts` / `report-access-gate.ts` | modify | rate-limit BEFORE alias hydration; alias-aware flag decision; `benchmarkVersion`/`benchmarkKeyMismatch` into audit |
| `app/(portal)/portal/assessments/[id]/page.tsx` | modify | entry-point publish guard in `canShowGroupReport` |
| `lib/assessments/group-report-metrics.ts` | modify | `benchmarkVersion?`/`benchmarkKeyMismatch?` fields; `reason`/`template` on not_applicable |
| `components/assessments/ScoredGroupReport.tsx` | modify | Peers + Dev·Peers (peer-specific null cell); no-CEO team-vs-peers; ScaleUp Peers/Dev·Peers; provisional footnote |
| `app/(report)/assessments/[id]/report/page.tsx` | modify | `benchmarkVersion` in view metric; `unpublished` page copy |
| `docs/specs/v7.6/18j-ops-runbook.md` | **create** | dedicated Wave-J runbook — two-level launch/rollback, kill, pinned promote-previous, canary cap, **tested log-drain alert queries** (the launch telemetry source of truth) — NOT the LVA 17f runbook |
| Tests | modify/create | TDD per task |

**Deferred (NOT this wave):** Appendix B/per-member; per-question peers; benchmark DB table + admin editor; J-1 phase tile; per-respondent SU-Full tier suppression (band stays — locked by a Task 2 regression).

---

## Task 1: Independent SU-Full flag plumbing + kill precedence (NO alias yet)

Adds the SU-Full-specific gate, decoupled from LVA, with a hard kill that overrides canary. **Does NOT add the alias** (that lands atomically with the gates in Task 3 — avoids an intermediate draft-reachable window).

**Files:** `lib/assessments/wave-f-flags.ts`; Test `__tests__/lib/assessments/wave-f-flags.test.ts`.

- [ ] **Step 1: Failing test**
```ts
it("SU-Full enablement is independent of LVA + has kill precedence over canary", () => {
  const suf = { template: { alias: "scaling-up-full" } } as any;
  const lva = { template: { alias: "leadership-vision-alignment" } } as any;
  process.env.WAVE_F_GROUP_REPORT_ENABLED = "1"; delete process.env.WAVE_J_SUFULL_GROUP_ENABLED;
  delete process.env.WAVE_J_SUFULL_GROUP_CANARY; delete process.env.WAVE_J_SUFULL_GROUP_KILL;
  expect(isGroupReportEnabled(null, lva)).toBe(true);
  expect(isGroupReportEnabled(null, suf)).toBe(false);                 // LVA-on ≠ SU-Full-on
  process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
  expect(isGroupReportEnabled(null, suf)).toBe(true);
  process.env.WAVE_J_SUFULL_GROUP_ENABLED = "0";                       // kill alone
  expect(isGroupReportEnabled(null, suf)).toBe(false);
  expect(isGroupReportEnabled(null, lva)).toBe(true);                  // LVA unaffected
  // kill precedence: a stale canary must NOT bypass the kill switch
  process.env.WAVE_J_SUFULL_GROUP_CANARY = "coach-1"; process.env.WAVE_J_SUFULL_GROUP_KILL = "1";
  expect(isGroupReportEnabled({ coachId: "coach-1" } as any, suf)).toBe(false);
});
```
- [ ] **Step 2: Run → FAIL** `npx jest src/__tests__/lib/assessments/wave-f-flags.test.ts -t independent`
- [ ] **Step 3: Implement** — alias-aware enablement; factor out `canaryMatches(csv, actor, campaign)`:
```ts
const isOn = (v?: string) => v === "1" || v === "true" || v === "TRUE" || v === "yes";

// SU-Full canary is CAMPAIGN-ID-ONLY (R4-M blast-radius cap): a coach/org entry must NOT match,
// so one env entry can never expose many/large campaigns past the cohort cap.
const sufCanaryMatches = (csv: string | undefined, campaign: GroupReportCampaign | null) =>
  !!campaign?.id && (csv ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(campaign.id);

export function isGroupReportEnabled(actor: GroupReportActor | null, campaign: GroupReportCampaign | null): boolean {
  if (campaign?.template?.alias === "scaling-up-full") {
    if (isOn(process.env.WAVE_J_SUFULL_GROUP_KILL)) return false;     // hard kill overrides canary (R2-H3)
    return isOn(process.env.WAVE_J_SUFULL_GROUP_ENABLED) || sufCanaryMatches(process.env.WAVE_J_SUFULL_GROUP_CANARY, campaign);
  }
  return isOn(process.env.WAVE_F_GROUP_REPORT_ENABLED) || canaryMatches(process.env.WAVE_F_GROUP_REPORT_CANARY, actor, campaign);
}
```
Keep existing LVA tests green. **Do NOT touch `GROUP_REPORT_ALIASES` here.** Add a test: a **coach id or org id** in `WAVE_J_SUFULL_GROUP_CANARY` does NOT enable SU-Full; only the exact **campaign id** does.
- [ ] **Step 4: Run → PASS** ; **Step 5: Commit** `feat(assessments): independent SU-Full group flag + kill precedence (no alias yet)`

---

## Task 2: report-config `showTier` + lock the per-respondent band

**Files:** `lib/assessments/report-config.ts`; Tests `report-config.test.ts` + BrandedReport render.

- [ ] **Step 1: Failing tests**
```ts
expect(DEFAULT_REPORT_CONFIG.showTier).toBe(true);
expect(reportConfigFor("RockHabits").showTier).toBe(true);
expect(reportConfigFor("scaling-up-full")).toEqual({ reportType: "scored", showScoreTable: true, showTier: false });
```
```tsx
it("per-respondent SU-Full BrandedReport STILL renders its tier band (deferred)", () => {
  render(<BrandedReport {...suFullRespondentProps} />);
  expect(screen.queryByTestId("overall-band")).not.toBeNull();
});
```
- [ ] **Step 2–4:** add `showTier: boolean` to `ReportConfig` + `DEFAULT` (`true`) + every existing entry (`true`); add `"scaling-up-full": { reportType:"scored", showScoreTable:true, showTier:false }`. Comment: **consumed ONLY by the group renderer this wave; `BrandedReport` ignores it (per-respondent deferred).** Run → PASS.
- [ ] **Step 5: Commit** `feat(assessments): report-config showTier (group-only); lock per-respondent tier`

---

## Task 3: Atomic — surface alias + ENFORCED publish gate (loader + entry point + direct route)

Adds the alias AND all three publish gates in ONE commit (no window). Route gate is alias-aware and runs AFTER the rate limiter.

**Files:** `lib/assessments/wave-f-flags.ts` (alias), `lib/assessments/group-report.ts`, `lib/assessments/report-gate-core.ts` / `report-access-gate.ts`, `app/(portal)/portal/assessments/[id]/page.tsx`; Tests: loader + portal + **direct-route matrix**.

- [ ] **Step 1: Failing tests**
```ts
// loader
it("DRAFT SU-Full → notApplicable(unpublished, templateAlias) even with WAVE_J on", async () => {
  process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
  const r = await loadGroupReport(/* SU-Full INVITED, version.publishedAt=null */);
  expect(r).toMatchObject({ kind:"notApplicable", reason:"unpublished", templateAlias:"scaling-up-full" });
});
```
```ts
// DIRECT ROUTE matrix (the real teeth — R1/R2-H1)
it("WAVE_F=1/WAVE_J=0 → SU-Full direct route denied; WAVE_F=0/WAVE_J=1 → allowed iff published+allowlisted", async () => { /* both cases + LVA unaffected */ });
it("rate limiter runs BEFORE the alias-hydration query (no pre-auth DB lookup)", async () => { /* assert limiter called before campaign fetch */ });
```
```tsx
// entry point
it("canShowGroupReport=false for an unpublished SU-Full campaign even with flag on", () => { /* no link */ });
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement**
  - **Alias (atomic):** add `"scaling-up-full"` to `GROUP_REPORT_ALIASES` (moved here from Task 1).
  - **Loader** (`group-report.ts`): add `publishedAt: true` to BOTH `campaign.version` selects (~225, ~354). After the `isGroupReportAlias` check (~261):
    ```ts
    // SU-Full-SCOPED (R3-H1): a legacy/imported LVA version with a null
    // publishedAt must NOT be regressed — LVA stays byte-for-byte.
    if (campaign.template.alias === "scaling-up-full" && campaign.version.publishedAt == null) {
      return { kind:"notApplicable", reason:"unpublished", templateAlias: campaign.template.alias } as const;
    }
    ```
    Add `reason` + `templateAlias` to the `notApplicable` union; backfill `templateAlias` on the existing post-load `notApplicable` returns (`public`, `unsupported-template`). **Add a regression test: a published LVA campaign AND a (hypothetical) null-publishedAt LVA campaign both still load `ok` — the guard only bites SU-Full.**
  - **Route gate** (R2-M5 ordering): in `report-gate-core`/`report-access-gate`, ensure the **rate limiter runs first**, THEN hydrate `template.alias` + `version.publishedAt` (+ canary/ownership fields) in a single cheap select, THEN make the flag decision alias-aware: `flagGate: () => isGroupReportEnabled(actor, hydratedCampaign)`. Preserve dark-404 semantics when the flag is off. (Equivalent alternative: move enablement into the loader with the same 404 behavior — pick one, keep it the single source.)
  - **Route contract (R5-M2) — encode + test both paths distinctly:** flag/alias OFF or not-allowlisted ⇒ **dark 404** (enumeration-safe, before any loader work); flag/alias ON but `version.publishedAt == null` ⇒ the LOADER returns `notApplicable(unpublished, templateAlias)` which is **observable** (page copy + metric, Task 7). A publish-guard hit must NEVER collapse into a 404. Tests assert: disabled→404; enabled+unpublished→notApplicable(unpublished) with copy+metric.
  - **Entry point** (`portal/.../page.tsx`): add `publishedAt` to the `campaignForFlag` version select; add a **SU-Full-scoped** publish check to `canShowGroupReport` — `(campaignForFlag.template?.alias !== "scaling-up-full" || campaignForFlag.version?.publishedAt != null)` — lock-step with the loader, and (like the loader) never gating LVA.
  - Update existing LVA fixtures to set `version.publishedAt` (published).
- [ ] **Step 4: Run → PASS** (loader + route matrix + portal) ; **Step 5: Commit** `feat(assessments): surface SU-Full atomically behind enforced publish gates (loader+route+entry)`

---

## Task 4: Static Peers benchmark (versioned, key-set bound, value-locked)

**Files:** create `lib/assessments/su-full-benchmarks.ts`; Test `su-full-benchmarks.test.ts`.

- [ ] **Step 1: Failing tests**
```ts
it("0-10 domain/section + 0-100 ScaleUp + version", () => {
  const b = benchmarksFor("scaling-up-full")!;
  expect(b.domain.people).toBe(6.1); expect(b.section.S_PEOPLE_YE).toBe(5.9); expect(b.scaleUp).toBe(53.1);
  expect(SU_FULL_BENCHMARKS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/);
});
it("null for non-SU-Full aliases", () => { expect(benchmarksFor("leadership-vision-alignment")).toBeNull(); });
// integrity vs the ACTUAL seed (R1-M1) — NOT a hand-copied list compared to itself
it("benchmark keys exactly match the SU-Full seed's domains + section stableKeys", () => {
  const content = buildScalingUpFullContent(); // import from prisma/seed-scaling-up-full-assessment.ts (Jest transpiles; verify importable)
  const seedDomains = content.scoringConfig.domains.map(d => d.key).sort();
  const seedSections = content.sections.map(s => s.stableKey).sort();
  expect(Object.keys(benchmarksFor("scaling-up-full")!.domain).sort()).toEqual(seedDomains);
  expect(Object.keys(benchmarksFor("scaling-up-full")!.section).sort()).toEqual(seedSections);
});
// value-lock (R2-L1): values are pinned to the version — a quiet edit must break this snapshot
it("benchmark values are version-locked (bump SU_FULL_BENCHMARKS_VERSION on any value change)", () => {
  expect({ v: SU_FULL_BENCHMARKS_VERSION, b: benchmarksFor("scaling-up-full") }).toMatchSnapshot();
});
```
> If `buildScalingUpFullContent` isn't importable under Jest (tsconfig excludes `prisma/`), instead `export const SECTIONS/DOMAINS` from the seed and import those; do NOT fall back to a self-referential list.
- [ ] **Step 2–4:** implement the module (domain 0–10: people 6.1/strategy 5.0/execution 5.8/cash 7.8/you 5.4; sections 0–10: S_PEOPLE_YE 5.9, S_PEOPLE_CC 6.3, S_STRATEGY 5.0, S_EXEC_LT 4.5, S_EXEC_OP 5.6, S_EXEC_SM 6.4, S_EXEC_SIT 6.6, S_CASH 7.8, S_YOU_LEAD 6.1, S_YOU_IC 4.6; scaleUp 53.1), `SU_FULL_BENCHMARKS_VERSION="2026-06-28.cohort1.provisional"`, `SU_FULL_BENCHMARK_KEYS`, `benchmarksFor()`. Header comment = provisional/single-cohort/scale rules/bump-version-on-edit. Run → PASS (commit the snapshot).
- [ ] **Step 5: Commit** `feat(assessments): versioned, seed-bound, value-locked SU-Full Peers (J-2)`

---

## Task 5: `applyBenchmarks` on the scored model (version-on-application, key-mismatch, no-CEO)

**Files:** `lib/assessments/group-report-model.ts`, `lib/assessments/group-report.ts`; Test `group-report-model.scored.test.ts`.

- [ ] **Step 1: Failing test** (real fixtures)
```ts
it("attaches Peers/devPeers to domains+sections+ScaleUp; version only on application; suppresses tier", () => {
  const m = buildGroupReportModel(fixtureScalingUpFull()); // CEO people 8 / cash 9 / scaleUp 70; alias scaling-up-full
  expect(m.scored!.domains!.find(d=>d.key==="people")!.peers).toBe(6.1);
  expect(m.scored!.domains!.find(d=>d.key==="people")!.devPeers).toBeCloseTo(8-6.1,5);   // +1.9
  expect(m.scored!.sections.find(s=>s.stableKey==="S_PEOPLE_YE")!.peers).toBe(5.9);       // section asserted
  expect(m.scored!.scaleUpScore!.peers).toBe(53.1);
  expect(m.scored!.scaleUpScore!.devPeers).toBeCloseTo(70-53.1,5);                        // +16.9
  expect(m.showTier).toBe(false);
  expect(m.benchmarkVersion).toBe(SU_FULL_BENCHMARKS_VERSION);
  expect(m.benchmarkKeyMismatch).toBe(false);
});
it("no benchmarkVersion when nothing applied (Rockefeller / empty)", () => {
  expect(buildGroupReportModel(fixtureRockefeller()).benchmarkVersion).toBeUndefined();
});
it("no-CEO: team-vs-peers deviation is available as the standing signal", () => {
  const m = buildGroupReportModel(fixtureScalingUpFullNoCeo());
  const people = m.scored!.domains!.find(d=>d.key==="people")!;
  expect(people.peers).toBe(6.1);
  expect(people.devPeersTeam).toBeCloseTo((people.teamAvg ?? 0) - 6.1, 5);
});
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** in `group-report-model.ts`:
  - Add to `GroupScoredSection`/`GroupScoredDomain`: `peers?: number|null; devPeers?: number|null; devPeersTeam?: number|null;`. Add `peers?/devPeers?` to `GroupScoredScaleUp`.
  - Add `showTier?: boolean; benchmarkVersion?: string; benchmarkKeyMismatch?: boolean;` to `CampaignGroupReport`; set `showTier = reportConfigFor(input?.alias).showTier`.
  - `applyBenchmarks` returns application metadata (version ONLY if ≥1 row attached; mismatch if any expected key missing):
```ts
function applyBenchmarks(report: GroupScoredReport, alias?: string | null): { version?: string; keyMismatch: boolean } {
  const b = benchmarksFor(alias);
  if (!b) return { keyMismatch: false };
  let applied = 0, missing = 0;
  const fill = (row: { ceo: number|null; teamAvg: number|null }, peer: number|undefined,
                set: (p: number, dCeo: number|null, dTeam: number|null) => void) => {
    if (typeof peer === "number") { set(peer, devOf(row.ceo, peer), devOf(row.teamAvg, peer)); applied++; }
    else missing++;
  };
  for (const d of report.domains ?? []) fill(d, b.domain[d.key], (p,dc,dt)=>{ d.peers=p; d.devPeers=dc; d.devPeersTeam=dt; });
  for (const s of report.sections)      fill(s, b.section[s.stableKey], (p,dc,dt)=>{ s.peers=p; s.devPeers=dc; s.devPeersTeam=dt; });
  if (report.scaleUpScore && typeof b.scaleUp === "number") {
    report.scaleUpScore.peers = b.scaleUp;
    report.scaleUpScore.devPeers = devOf(report.scaleUpScore.ceo, b.scaleUp);
    applied++;
  }
  // FAIL-CLOSED on key skew (R3-Mc): a missing expected key means the seed/version
  // drifted from the benchmark — do NOT show a partial/misleading Peers table.
  // Clear EVERY peer so hasPeers→false and the column is omitted entirely.
  if (missing > 0) {
    for (const d of report.domains ?? []) { d.peers = undefined; d.devPeers = undefined; d.devPeersTeam = undefined; }
    for (const s of report.sections)      { s.peers = undefined; s.devPeers = undefined; s.devPeersTeam = undefined; }
    if (report.scaleUpScore) { report.scaleUpScore.peers = undefined; report.scaleUpScore.devPeers = undefined; }
    return { version: undefined, keyMismatch: true };
  }
  return { version: applied > 0 ? b.version : undefined, keyMismatch: false };
}
```
> Fail-closed means a key-skew incident shows the report **without** Peers (never a partial table); `benchmarkKeyMismatch:true` flows to the audit/metric (Task 7) + alert (Task 8), and is a **canary/launch-blocking** condition in the runbook.
  - Call it in the scored branch; set `report.benchmarkVersion`/`benchmarkKeyMismatch` from the result.
  - `group-report.ts`: add `benchmarkVersion?: string; benchmarkKeyMismatch?: boolean;` to `GroupReportProvenance`; copy from the model (NOT a fresh `benchmarksFor`).
- [ ] **Step 4: Run → PASS** (+ full model suite; LVA/qualitative untouched) ; **Step 5: Commit** `feat(assessments): applyBenchmarks (version-on-application, key-mismatch, no-CEO team-vs-peers)`

---

## Task 6: Render Peers + Dev·Peers (peer-specific null cell, no-CEO fallback, provisional footnote)

**Files:** `components/assessments/ScoredGroupReport.tsx`; Test `group-report-render.test.tsx`.

- [ ] **Step 1: Failing tests**
```tsx
it("renders Peers + Dev·Peers (domain/section + ScaleUp), hides the tier", () => { /* peers-people 6.1, devpeers-people 1.9, scaleup-peers 53.1; no ceo-tier / tier-band */ });
it("omits Peers + keeps tier when no peers (LVA-style)", () => { /* showTier unset → tier shows */ });
it("missing peer → plain '—', never '(N<2)'", () => { /* peer-specific null cell */ });
it("no-CEO → shows Team-vs-Peers deviation as the standing signal", () => { /* devPeersTeam rendered; no-CEO note present */ });
it("shows a provisional-benchmark footnote", () => { expect(screen.getByText(/provisional/i)).toBeInTheDocument(); });
```
- [ ] **Step 2–3: Implement**
  - `ProfileTable` rows gain `peers/devPeers/devPeersTeam`; `hasPeers = rows.some(r => r.peers != null && Number.isFinite(r.peers))`.
  - Headers: `{hasPeers && <th>Peers</th>}`; deviation header is **Dev · Peers** when `hasCeo`, **Team vs Peers** when `!hasCeo` (no-CEO standing, R2-M3).
  - Cells: Peers value or `—`; deviation via a **peer-specific** `DevCell` (`reason="peer"` → null renders plain `—`, NO "(N<2)"). When `hasCeo` use `devPeers`; when `!hasCeo` use `devPeersTeam`.
  - `toProfileRows` + `DomainsBlock` map the new fields.
  - ScaleUp section: when `scaleUpScore.peers != null`, render Peers (`group-scored-scaleup-peers`) + Dev·Peers (`group-scored-scaleup-devpeers`).
  - Tier: gate CEO-tier span + team-distribution on `report.showTier !== false`.
  - **Footnote (R1-M5):** under the profile table, a caption: `Peers = provisional industry benchmark (single Esperto cohort, v{benchmarkVersion}); not yet size-matched.` (omit when no peers).
- [ ] **Step 4: Run → PASS** ; **Step 5: Commit** `feat(assessments): render Peers/Dev·Peers + no-CEO fallback + provisional footnote + suppress tier`

---

## Task 7: Observability — benchmarkVersion, key-mismatch, distinguishable notApplicable

**Files:** `lib/assessments/report-access-gate.ts`, `lib/assessments/group-report-metrics.ts`, `app/(report)/assessments/[id]/report/page.tsx`; tests.

- [ ] **Step 1: Failing tests**
```ts
expect(auditChangesFor("scaling-up-full")).toMatchObject({ benchmarkVersion: "2026-06-28.cohort1.provisional", benchmarkKeyMismatch: false });
expect(auditChangesFor("leadership-vision-alignment")).toMatchObject({ benchmarkVersion: null });
expect(notApplicableMetric("unpublished","scaling-up-full")).toMatchObject({ reason:"unpublished", template:"scaling-up-full" });
expect(notApplicableMetric("unsupported-template","RockHabits")).toMatchObject({ reason:"unsupported-template", template:"RockHabits" });
```
- [ ] **Step 2–3: Implement**
  - `group-report-metrics.ts`: add `benchmarkVersion?: string|null`, `benchmarkKeyMismatch?: boolean` to the metric field type; add `reason?: string`, `template?: string` to the `not_applicable` fields (low-cardinality, PII-safe).
  - `report-access-gate.ts`: in `GROUP_REPORT_VIEW` audit `changes` (~117): `benchmarkVersion: o.provenance.benchmarkVersion ?? null, benchmarkKeyMismatch: o.provenance.benchmarkKeyMismatch ?? false`.
  - report page: success metric payload gets `benchmarkVersion`/`benchmarkKeyMismatch`; `notApplicable` emits `assessment.group_report.not_applicable` with `{ reason: o.reason, template: o.templateAlias }`; branch page copy — a distinct message for `reason==="unpublished"` vs generic.
- [ ] **Step 4: Run → PASS** ; **Step 5: Commit** `feat(assessments): benchmark provenance in audit/metric + distinguishable notApplicable`

---

## Task 8: Dark verification, capacity budgets, layout, build gate

- [ ] **Step 1: Three-gate dark + kill precedence + no-LVA-regression** — confirm Tasks 1/3/5 cover: LVA-on ≠ SU-Full-on; `WAVE_J_SUFULL_GROUP_KILL=1` overrides canary; DRAFT SU-Full → notApplicable even flag-on (loader AND direct route); LVA path untouched.
- [ ] **Step 2: Capacity perf smoke** — assert, for 1 CEO + 40 members: model build **< 500ms**, render **< 1s** (jsdom-timed, generous CI multiplier).
- [ ] **Step 2b: Launch-readiness ops (a DEDICATED `docs/specs/v7.6/18j-ops-runbook.md` — NOT appended to the LVA-scoped 17f runbook; R3-L5). These GATE THE CANARY/LAUNCH, not the dark merge:**
  - **SU-Full observability — REAL telemetry, not just a panel (R3-H2 / R4-H2):** the existing `/admin/observability` is DB-count-derived (counts successful `GROUP_REPORT_VIEW` rows) and has NO latency / failure / not_applicable / mismatch signal. **Decision (R5-M4) — the launch telemetry source of truth is tested log-drain alert queries**, NOT an admin panel (the DB-count dashboard stays as-is, out of this wave's scope — no half-built panel). Author concrete log-drain queries for SU-Full (`template="scaling-up-full"`) view latency p95, render/audit failure, `not_applicable` by `reason`, and `benchmarkKeyMismatch`, each wired to an alert with an explicit threshold + owner, plus a **synthetic smoke that proves each alert actually fires**. **No canary until that smoke passes.**
  - **Rollback (R3-M-kill):** the env-flag kill (`WAVE_J_SUFULL_GROUP_KILL=1` + redeploy) is the deliberate control, but is NOT instant during a bad build. Primary incident control = **Vercel promote-previous deployment** (instant, no rebuild). Document + a verified smoke of both paths; LVA blast radius = none (separate flags/aliases).
  - **Canary blast-radius (R3-M-canary):** SU-Full canary entries are **campaign-id-only** (NOT coach/org — an org canary could expose many/large campaigns past the cap). Preflight query each canaried campaign ≤ **25 members** before adding it. (Document; optionally assert campaign-id shape for the WAVE_J canary.)
  - **Kill-switch runbook:** `benchmarkKeyMismatch=true` for SU-Full is a **launch-blocking** alert (fail-closed render already hides Peers — Task 5).
  - **Publishing SU-Full is a SEPARATE, BROADER step (R4-H1).** The `version.publishedAt` gate means launching the group report requires publishing the SU-Full version — which ALSO enables campaign-creation, the public quiz, and submission. The WAVE_J flag is the group-report-specific control: **`WAVE_J_SUFULL_GROUP_KILL=1` (or promote-previous) restores the no-group-report state but does NOT unpublish SU-Full.** Unpublishing the assessment is a separate, heavier rollback. Launch checklist must verify the broader surfaces (campaign wizard, quiz, submit) behave once SU-Full is published. *(Decision: we keep `publishedAt` as the readiness gate rather than a group-report-only readiness flag — the WAVE_J flag already gives independent group-report control, and rendering a group report for a genuinely-unpublished template was rejected in R1; full decoupling would re-open that.)*
  - **Pre-deploy env preflight (R4-M):** before merging the alias (Task 3), read production Vercel env and **fail the release if `WAVE_J_SUFULL_GROUP_ENABLED` / `_CANARY` / `_KILL` is unexpectedly set** — dark-merge safety must not assume.
  - **Canary cohort-size preflight (R4-M, in lieu of a runtime cap):** before adding a campaign id to `WAVE_J_SUFULL_GROUP_CANARY`, a preflight query proves that campaign ≤ 25 completed members. *(We deliberately do NOT add a loader-side runtime size cap: leadership-team cohorts are inherently small, LVA reads identically with no cap, and a per-alias cap would be inconsistent. Revisit only if real data shows large SU-Full cohorts.)*
  - **Post-rollback cleanup (R4-L):** after a promote-previous rollback, audit + clear stale `WAVE_J_*` env/canary and verify BOTH the direct route and the entry point read dark (so a future relaunch starts clean).
  - **TWO-LEVEL launch + rollback (R4-H1 / R5-H1):** because the group report can only exist once SU-Full is published (campaigns require a published template), document TWO levels: **(L1) group-report-only** — flip/kill `WAVE_J_SUFULL_GROUP_ENABLED`; restores the no-group-report state, SU-Full stays live. **(L2) full-assessment** — *publishing SU-Full also enables the campaign wizard, public quiz, and submission*; its rollback is a **tested unpublish/deactivate** of the SU-Full version with smokes proving the wizard no longer offers it, the public quiz + submit are gone, and BOTH the entry point and direct group-report route read dark. The Wave-J kill switch does NOT perform L2. Publishing is Jeff-gated (content sign-off).
  - **Pinned rollback target (R5-L):** record the **last known-good (pre-Wave-J/alias) deployment id** at launch; the rollback smoke promotes THAT id (not merely "previous", which could still carry the alias) and verifies code version + entry point + direct route darkness before declaring rollback complete.
  - **Canary growth guard (R5-M3, in lieu of a hard runtime cap):** the ≤25-member preflight is point-in-time, so a canaried campaign can grow afterward. The loader emits a low-cardinality **`capacityOverBudget=true`** metric flag when a SU-Full group report renders with completed-members > budget — making post-canary growth **visible/alertable** without a hard block (consistent with LVA's uncapped read; revisit a hard cap only if data shows large cohorts).
- [ ] **Step 3: Layout/print check** — manual: widened table (+2/+3 cols) at desktop/mobile/**Print→PDF**; `.su-group-prof` scrolls in `overflow-x:auto`; print CSS no clip. (Reviewer checklist; test-live-app explicit-only.)
- [ ] **Step 4: Suites + lint** — `npx jest src/__tests__/lib/assessments src/__tests__/components/assessments`; `npx eslint <changed>` (0/0).
- [ ] **Step 5: Full build gate** — `CI=true npx next build --turbopack`.
- [ ] **Step 6: PR** — `gh pr create --title "Wave J (J-3+J-2): SU-Full scored group report + Peers (dark)"`.

---

## Self-review

- **Loop-1 (R1–R3):** publish gate (T3), provenance (T4/5/7), ScaleUp devPeers (T5/6), showTier? (T2/5), integrity (T4), peer-cell (T6), print (T8), entry-point gate (T3), audit/metric benchmarkVersion (T7), independent flag (T1), notApplicable reasons (T7), version-skew/key-set (T4/5), capacity (T8), metric-type (T7).
- **Loop-2 (R1–R2):** route alias-blind → alias-aware route gate AFTER rate-limit (T3); alias-ordering → atomic in T3; canary kill precedence (T1); benchmarkVersion-on-application (T5); section-key mismatch + audit signal (T5/7); no-CEO standing (T5/6); notApplicable template (T3/7); rate-limit-before-hydration (T3); value-lock snapshot (T4); concrete capacity budgets (T8).
- **Invariants:** no migration; group-report-only; LVA byte-for-byte unchanged; standing = peer-deviation (no band, ADR-0015).
- **Type consistency:** `peers?/devPeers?/devPeersTeam?` on domain/section; `peers?/devPeers?` on ScaleUp; `showTier?`/`benchmarkVersion?`/`benchmarkKeyMismatch?` on model + provenance; metric type carries `benchmarkVersion?/benchmarkKeyMismatch?/reason?/template?`.
