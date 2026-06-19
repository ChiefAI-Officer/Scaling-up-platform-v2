# Wave F #22 — CEO / Group Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to execute
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Build in-repo on a fresh branch off
> `main` (e.g. `feat/wave-f-group-report`). Source under `src/src`; commands from `src/`; build gate
> `CI=true npx next build --turbopack`.

**Goal:** A new, read-only, campaign-level **group report** that aggregates a campaign's completed
submissions into one team view — Esperto's "CEO Full Report" (#22).

**Architecture:** Additive — **no migration** (`isCEO` exists). A shared pure `group-report-model.ts`
builds an aggregated `CampaignGroupReport` from frozen `result` + raw `answers`; `getCampaignGroupReport`
loads it in one consistent snapshot behind a new `canViewGroupReport` policy + a default-off
`WAVE_F_GROUP_REPORT_ENABLED` flag; a `/(report)/assessments/[id]/report` route dispatches by
`reportConfigFor(alias).reportType` → `QualitativeGroupReport` | `ScoredGroupReport`. The full design +
the 3 claudex Changelogs are in [17f design](17f-wave-f-group-report-design.md); the binding decisions
are [ADR-0011](../../adr/0011-group-report-aggregation-cohort-and-access-model.md). The signed-off
visual is `wave-f-group-report-mockup.pdf`.

**Tech stack:** Next.js 16 App Router (Turbopack), React 19, TypeScript, Prisma/Neon, Jest+RTL,
Playwright.

---

## Binding decisions (every task must honor)

- **Cohort = ALL completed submissions** (submission-based, orphan-robust; never drop a real response).
  Names via the surviving `OrgRespondent`; `isCEO` from the participant row if present. (ADR-0011 §6)
- **Two aggregate definitions:** qualitative `Mean` = mean over **answerers of that question** (CEO
  incl.); scored `Team avg` = mean over **NON-CEO** submissions, `Dev = CEO − teamExclMean`, **N<2 →
  suppress `Dev`**. Every aggregate renders its `n`. (ADR-0011 §2)
- **Qualitative aggregates raw `answers`** (validated on read); **scored reads frozen
  `result.perSection`/`perDomain`/`perQuestion`/`tier`/`scaleUpScore`** (never recomputed). (§8)
- **INVITED-only** gate; **`canViewGroupReport`** (current active coach + current org owner + current
  template access; admin/staff bypass, audited). (§5, §7)
- **Default-off `WAVE_F_GROUP_REPORT_ENABLED`** gating BOTH the entry point AND the route, fail-closed;
  allowlist canary; kill-switch. (§9)
- **`GROUP_REPORT_VIEW` audit** written directly + fail-closed (actor/IP-UA/generatedAt/versionId/
  contentHash/ceoParticipantId/counts/rendered submission IDs). Visible "as of" provenance. (§10)
- Entry link `prefetch={false}`; rate-limit per-actor+campaign+IP before the load (fail-closed 429);
  column/verbatim/PDF caps normative; real `no-store` header via middleware. (R3-M2/M3, R2-LOW-1)

## File map

| File | Responsibility |
|---|---|
| `src/src/lib/assessments/group-report-model.ts` (NEW) | pure `buildGroupReportModel()` + types; per-type aggregation; orphan/validation handling |
| `src/src/lib/assessments/group-report.ts` (NEW) | `getCampaignGroupReport()` loader (snapshot, INVITED gate, provenance/contentHash) |
| `src/src/lib/auth/access-control.ts` (MODIFY) | NEW `canViewGroupReport(db, actor, campaignId)` |
| `src/src/lib/assessments/wave-f-flags.ts` (NEW) | `isGroupReportEnabled(actor, campaign)` (flag + canary allowlist) |
| `src/src/components/assessments/QualitativeGroupReport.tsx` (NEW) | qualitative renderer |
| `src/src/components/assessments/ScoredGroupReport.tsx` (NEW) | scored renderer |
| `src/src/app/(report)/assessments/[id]/report/page.tsx` (NEW) | route: auth → loader → dispatch → audit |
| `src/src/middleware.ts` (MODIFY) | extend no-store matcher to `/assessments/[id]/report` |
| `src/src/components/assessments/CampaignDetail.tsx` (MODIFY) | "View group report" entry (`prefetch={false}`, flag+policy gated) |
| `src/src/styles/su-report.css` (MODIFY) | group-report print/screen classes (scoped) |
| `docs/specs/v7.6/17f-ops-runbook.md` (NEW) | launch/canary/observability/kill-switch/rollback |

Test fixtures: `src/src/__tests__/lib/assessments/fixtures/group-*.ts` (a campaign with a CEO + 2 team
submissions, an orphaned submission, a malformed-answer row, an LVA + a Rockefeller variant).

---

## Task 1 — `canViewGroupReport` policy

**Files:** Modify `src/src/lib/auth/access-control.ts`; Test `src/src/__tests__/lib/auth/can-view-group-report.test.ts`

- [ ] **Step 1 — failing test**
```ts
import { canViewGroupReport } from "@/lib/auth/access-control";
// admin bypass
it("admin/staff may view", async () => {
  expect(await canViewGroupReport(dbStub({}), {role:"ADMIN"} as any, "c1")).toBe(true);
});
// coach must be CURRENTLY active + own org + have template access
it("denies a coach who lost template access (stricter than read gate)", async () => {
  const db = dbStub({ campaign:{ createdByCoachId:"co1", organization:{ ownerCoachId:"co1" }, templateId:"t1" },
                      coach:{ id:"co1", certificationStatus:"ACTIVE" }, hasTemplateAccess:false });
  expect(await canViewGroupReport(db, {role:"COACH", coachId:"co1"} as any, "c1")).toBe(false);
});
it("allows current active owner-coach with template access", async () => {
  const db = dbStub({ campaign:{ createdByCoachId:"co1", organization:{ ownerCoachId:"co1" }, templateId:"t1" },
                      coach:{ id:"co1", certificationStatus:"ACTIVE" }, hasTemplateAccess:true });
  expect(await canViewGroupReport(db, {role:"COACH", coachId:"co1"} as any, "c1")).toBe(true);
});
```
- [ ] **Step 2 — run, verify FAIL** (`npm test -- can-view-group-report`).
- [ ] **Step 3 — implement.** Mirror `canManageCampaign("write")`'s *currency* checks (active coach,
  current org ownership, current template access via the existing `evaluateAccess`/access-group path)
  — NOT the lenient retained-`"read"` branch. Admin/STAFF (`isPrivilegedRole`) → true. Return boolean.
- [ ] **Step 4 — run, verify PASS.**
- [ ] **Step 5 — commit** `feat(assessments): canViewGroupReport policy for bulk group report (R2-HIGH-3)`.

## Task 2 — `WAVE_F_GROUP_REPORT_ENABLED` flag + canary

**Files:** Create `src/src/lib/assessments/wave-f-flags.ts`; Test `…/__tests__/lib/assessments/wave-f-flags.test.ts`

- [ ] **Step 1 — failing test**
```ts
import { isGroupReportEnabled } from "@/lib/assessments/wave-f-flags";
afterEach(()=>{ delete process.env.WAVE_F_GROUP_REPORT_ENABLED; delete process.env.WAVE_F_GROUP_REPORT_CANARY; });
it("default OFF", ()=> expect(isGroupReportEnabled({coachId:"x"} as any,{id:"c1"} as any)).toBe(false));
it("ON when flag truthy", ()=>{ process.env.WAVE_F_GROUP_REPORT_ENABLED="1"; expect(isGroupReportEnabled({coachId:"x"} as any,{id:"c1"} as any)).toBe(true); });
it("canary allowlist permits a listed coach while global OFF", ()=>{ process.env.WAVE_F_GROUP_REPORT_CANARY="co1,co2"; expect(isGroupReportEnabled({coachId:"co1"} as any,{id:"c1"} as any)).toBe(true); expect(isGroupReportEnabled({coachId:"zz"} as any,{id:"c1"} as any)).toBe(false); });
```
- [ ] **Step 2 — run, verify FAIL.**
- [ ] **Step 3 — implement.** `isGroupReportEnabled(actor, campaign)`: true if `WAVE_F_GROUP_REPORT_ENABLED`
  is truthy, OR `actor.coachId`/org/`campaign.id` is in the comma-split `WAVE_F_GROUP_REPORT_CANARY`
  allowlist. Pure, env-read, no throw.
- [ ] **Step 4 — PASS.** **Step 5 — commit** `feat(assessments): default-off WAVE_F_GROUP_REPORT flag + canary (R3-HIGH-2)`.

## Task 3 — `group-report-model.ts` core + cohort + validation

**Files:** Create `src/src/lib/assessments/group-report-model.ts`; Test `…/group-report-model.core.test.ts`; fixtures.

- [ ] **Step 1 — failing test** (cohort, orphan-robust, answer validation, CEO resolution)
```ts
import { buildGroupReportModel } from "@/lib/assessments/group-report-model";
it("includes an orphaned submission (no current participant) named via OrgRespondent", () => {
  const m = buildGroupReportModel(fixtureLvaWithOrphan());
  expect(m.respondents.map(r=>r.name)).toContain("Orphan Olive");
  expect(m.respondents.find(r=>r.isCEO)?.name).toBe("John CEOExec");
});
it("drops a malformed answer value but keeps the submission (degraded notice)", () => {
  const m = buildGroupReportModel(fixtureLvaMalformed());
  expect(m.degraded).toBe(true);
  expect(m.respondentCount).toBe(3);
});
it("respondent order = CEO first then alphabetical", () => {
  expect(buildGroupReportModel(fixtureLva()).respondents.map(r=>r.name))
    .toEqual(["John CEOExec","Jeff Services","Kathy HR"]);
});
```
- [ ] **Step 2 — FAIL.**
- [ ] **Step 3 — implement** the model skeleton: input
  `{ alias, version, participants[], submissions[] }`; build `respondents` (CEO-first, then
  alphabetical; `isCEO` from participant row; orphan = submission with no participant → included,
  flagged), `respondentCount`, `degraded`. Reuse `buildQuestionMetaByKey(version.questions)`. Add
  `normalizeAnswer(meta, value)` (finite numbers; type match; known option keys; dedupe stableKeys;
  invalid → null + `degraded=true`). Reuse `reportConfigFor(alias)` for `reportType`.
- [ ] **Step 4 — PASS.** **Step 5 — commit** `feat(assessments): group-report-model core (cohort, orphan-robust, answer validation)`.

## Task 4 — Qualitative aggregation forms

**Files:** Modify `group-report-model.ts`; Test `…/group-report-model.qualitative.test.ts`

- [ ] **Step 1 — failing tests** (one per form)
```ts
const m = buildGroupReportModel(fixtureLva());           // CEO + Kathy + Jeff
const fin = sectionOf(m,"S1_financials");                // metric-table
it("financial Mean is over answerers, not all completed", () => {
  const row = fin.metrics.find(x=>x.stableKey==="S1_net_profit_pct")!;
  expect(row.mean).toBeCloseTo(12.7,1); expect(row.n).toBe(3);
  const emp = fin.metrics.find(x=>x.stableKey==="S1_total_employees")!; // Jeff blank
  expect(emp.n).toBe(2);                                  // blank NOT averaged as 0
});
it("rating = strong/avg/weak counts + mean(1-3) sorted desc", () => {
  const rat = sectionOf(m,"S3_strengths").factors;
  expect(rat[0].mean).toBeGreaterThanOrEqual(rat[1].mean);
  expect(rat[0]).toMatchObject({strong:expect.any(Number),avg:expect.any(Number),weak:expect.any(Number),n:3});
});
it("obstacles = % of ANSWERERS, labels not keys, all options incl 0%", () => {
  const obs = sectionOf(m,"S4_obstacles").options;
  expect(obs.every(o=>o.label && !o.label.startsWith("S3_"))).toBe(true);
  expect(obs.some(o=>o.pct===0)).toBe(true);
});
it("free-text collation omits blanks, CEO first", () => {
  const qa = sectionOf(m,"S2_vision").questions[0].answers;
  expect(qa[0].isCEO).toBe(true);
  expect(qa.find(a=>a.name==="Kathy HR" && a.text==="")).toBeUndefined(); // omit-empty
});
```
- [ ] **Step 2 — FAIL.**
- [ ] **Step 3 — implement** per the `SECTION_PRESENTATION` × type contract (design §"Qualitative
  group"): `metric-table` → matrix rows `{label, mean(answerers, CEO incl), perRespondent[], n}`;
  `rating` → per factor `{label, strong, avg, weak, mean(1-3), n}` sorted by mean desc; `choices` →
  per option `{label (via meta.options), pct(answerers), n}` all options sorted desc; `qa` → per
  question by type (TEXT→answers[] omit-empty CEO-first; standalone NUMBER→perRespondent bars + mean).
- [ ] **Step 4 — PASS.** **Step 5 — commit** `feat(assessments): qualitative group aggregation (answerer denominators + n)`.

## Task 5 — Scored aggregation (CEO-excluded + headline mirror)

**Files:** Modify `group-report-model.ts`; Test `…/group-report-model.scored.test.ts`

- [ ] **Step 1 — failing tests**
```ts
const m = buildGroupReportModel(fixtureRockefeller());   // CEO + 3 team
it("Team avg EXCLUDES the CEO; Dev = CEO - teamExcl", () => {
  const people = m.scored.sections.find(s=>s.stableKey==="people")!;
  expect(people.teamAvg).toBeCloseTo(meanOfNonCeo("people"),2);
  expect(people.dev).toBeCloseTo(people.ceo - people.teamAvg,2);
});
it("N<2 non-CEO submissions suppresses Dev", () => {
  const only = buildGroupReportModel(fixtureRockefellerCeoPlusOneSectionSparse());
  expect(only.scored.sections.find(s=>s.stableKey==="cash")!.dev).toBeNull();
});
it("mirrors the per-respondent headline: perDomain/scaleUpScore/tier where present", () => {
  const su = buildGroupReportModel(fixtureScalingUpFull());
  expect(su.scored.domains?.length).toBeGreaterThan(0);
  expect(su.scored.scaleUpScore).toMatchObject({ceo:expect.any(Number), team:expect.any(Number)});
  expect(su.scored.tier).toMatchObject({ceo:expect.any(String)});
});
```
- [ ] **Step 2 — FAIL.**
- [ ] **Step 3 — implement** reading FROZEN `result`: per section/domain `ceo` =
  CEO submission's `averagePoints`; `teamAvg` = mean of NON-CEO submissions' `averagePoints`
  (null if <1 non-CEO); `dev = ceo===null||teamAvg===null ? null : ceo-teamAvg`. Include
  `perDomain`/`scaleUpScore` (ceo + non-CEO-mean) + `tier` (CEO tier + team tier distribution) when
  present; per-question `{label, ceo, teamMean(nonCEO)}` from `perQuestion.value`. Never recompute.
- [ ] **Step 4 — PASS.** **Step 5 — commit** `feat(assessments): scored group aggregation, CEO-excluded + headline mirror (R1-HIGH-1/2)`.

## Task 6 — `getCampaignGroupReport` loader (snapshot, INVITED gate, provenance)

**Files:** Create `src/src/lib/assessments/group-report.ts`; Test `…/group-report.loader.test.ts`

- [ ] **Step 1 — failing tests:** rejects `accessMode==="PUBLIC"` (returns a typed `notApplicable`);
  loads campaign+version+participants+completed submissions in one snapshot; computes
  `generatedAt`(passed in — `new Date()` is forbidden in some contexts, accept an injected clock),
  `completedCount`, `invitedCount` (non-revoked invitations), `contentHash` (stable hash of the model
  inputs). N=0 → `empty` state.
- [ ] **Step 2 — FAIL.**
- [ ] **Step 3 — implement.** Authorize via `canViewGroupReport` (caller passes actor). One
  `db.$transaction([... ], { isolationLevel: "RepeatableRead" })` (or a single joined query) to fetch
  campaign (with `accessMode`, `organization`, pinned `version.questions`/`scoringConfig`),
  participants (`isCEO`, respondent name/title), and completed submissions (`answers`, `result`,
  respondent). INVITED-only → else `{ kind:"notApplicable" }`. Build via `buildGroupReportModel`.
  Stamp provenance (generatedAt injected, completedCount, invitedCount via `getInvitationBand`,
  contentHash). Return discriminated union `{ kind:"ok"|"empty"|"notApplicable", … }`.
- [ ] **Step 4 — PASS.** **Step 5 — commit** `feat(assessments): getCampaignGroupReport loader (snapshot + provenance, R2-M1)`.

## Task 7 — Renderers + dispatch + scoped CSS

**Files:** Create `QualitativeGroupReport.tsx`, `ScoredGroupReport.tsx`; Modify `su-report.css`; Test
`…/__tests__/components/assessments/group-report-render.test.tsx`

- [ ] **Step 1 — failing RTL tests:** qualitative renders the financial matrix headers
  `Mean | <CEO> (CEO) | …`, a per-row `n`, omit-empty free-text, sorted rating bars, %-labels-not-keys;
  scored renders `CEO | Team avg (excl. CEO) | Dev`, the `—` N<2 cell, tier band; dispatch picks the
  renderer by `model.reportType`; the "as of" provenance line shows; graceful-degrade (CEO not
  submitted) renders the placeholder. Visual reference = `wave-f-group-report-mockup.pdf`.
- [ ] **Step 2 — FAIL.**
- [ ] **Step 3 — implement** both components consuming the `CampaignGroupReport` model; a small
  `GroupReport` dispatcher (`model.reportType==="qualitative" ? <QualitativeGroupReport/> :
  <ScoredGroupReport/>`). Add **scoped** `.su-report .group-*` classes to `su-report.css`
  (purple `#522583`, accents, print rules) — zero global leak (ADR-0005). Print → PDF works.
- [ ] **Step 4 — PASS.** **Step 5 — commit** `feat(assessments): QualitativeGroupReport + ScoredGroupReport renderers + scoped CSS`.

## Task 8 — Route + audit + rate-limit + flag gate

**Files:** Create `src/src/app/(report)/assessments/[id]/report/page.tsx`; Test
`…/__tests__/app/group-report-route.test.ts`

- [ ] **Step 1 — failing tests:** flag OFF (and not canary) → 404/disabled; PUBLIC campaign → "invited
  only" state; unauthorized coach → 403/redirect; rate-limit exceeded → fail-closed 429 BEFORE the
  load; success → renders + writes a `GROUP_REPORT_VIEW` audit row containing actor, generatedAt,
  versionId, contentHash, ceoParticipantId, completed/invited counts, rendered submission IDs; audit
  write failure → request fails closed (no silent render).
- [ ] **Step 2 — FAIL.**
- [ ] **Step 3 — implement** the server component: `export const dynamic="force-dynamic"; export const
  revalidate=0;` → `getApiActor()` → `isGroupReportEnabled` gate → per-actor+per-campaign+IP
  `withRateLimit` (fail-closed) → `getCampaignGroupReport(db, actor, id)` → `canViewGroupReport`
  inside it → dispatch `<GroupReport/>`. Write the audit **directly** (`db.auditLog.create`, NOT
  fail-open `logAudit`) and throw on failure. Stamp `generatedAt` from a server `new Date()` at the
  route boundary (allowed here) and thread into the loader.
- [ ] **Step 4 — PASS.** **Step 5 — commit** `feat(assessments): group report route — flag gate, fail-closed audit, rate-limit (R2-M2/R3-M3)`.

## Task 9 — Middleware no-store header

**Files:** Modify `src/src/middleware.ts`; Test `…/__tests__/middleware-no-store.test.ts`

- [ ] **Step 1 — failing test:** a request to `/assessments/<id>/report` receives
  `Cache-Control: no-store, private` (the matcher currently only covers
  `…/respondents/[rid]/report`).
- [ ] **Step 2 — FAIL.** **Step 3 — implement:** extend the existing no-store path regex to also match
  the campaign-level group route. **Step 4 — PASS.** **Step 5 — commit**
  `fix(assessments): real no-store header on the group report route (R2-LOW-1)`.

## Task 10 — CampaignDetail entry point (no prefetch)

**Files:** Modify `CampaignDetail.tsx`; Test `…/__tests__/components/assessments/campaign-detail-group-link.test.tsx`

- [ ] **Step 1 — failing tests:** when the flag/canary is on AND `canViewGroupReport` (server-passed
  capability prop) is true AND `accessMode==="INVITED"`, a "View group report" link renders with
  `prefetch={false}` and the correct href; otherwise it's absent. **Regression:** rendering
  CampaignDetail issues NO request to the group route and writes NO audit (assert no fetch/router
  prefetch fired).
- [ ] **Step 2 — FAIL.** **Step 3 — implement** the gated link (`<Link prefetch={false}>` or `<a>`),
  reading a `canViewGroupReport`/`groupReportEnabled` capability passed from the server page (client
  fail-closed). **Step 4 — PASS.** **Step 5 — commit**
  `feat(assessments): CampaignDetail group-report entry (gated, prefetch=false, R3-M2)`.

## Task 11 — Observability metrics

**Files:** Modify the loader/route to emit metrics; Modify `/admin/observability`; Test
`…/__tests__/lib/assessments/group-report-metrics.test.ts`

- [ ] **Step 1 — failing test:** the loader/route increment `assessment.group_report.*` counters
  (render, render_failure, degraded_rows, authz_deny, orphan_submission, audit_failure,
  rate_limit_hit) and record a render-latency observation. **Step 2 — FAIL.** **Step 3 — implement**
  via the existing structured-metric/observability helper (mirror Wave D/E); surface counts + alert
  gates on the `/admin/observability` panel. **Step 4 — PASS.** **Step 5 — commit**
  `feat(observability): assessment.group_report.* metrics + panel (R3-M1)`.

## Task 12 — Ops runbook + load-test note

**Files:** Create `docs/specs/v7.6/17f-ops-runbook.md`

- [ ] **Step 1 — write** (no test): flag-flip launch order (canary coaches → global on), canary
  verification checklist, observability dashboard queries, **kill-switch** (zero
  `WAVE_F_GROUP_REPORT_ENABLED` + clear canary → both surfaces vanish, no redeploy), rollback (revert
  PR + promote-previous), audit-failure response, post-rollback smoke, and a large-campaign load-test
  procedure (verify column/verbatim/PDF caps + p95). Plus the **adjacent hardening note**: the
  participant-delete TOCTOU + `ON DELETE SET NULL` orphan risk (R2-HIGH-2) — recommended follow-up to
  lock the submission re-check in a tx or switch to revoke/soft-delete. **Step 2 — commit**
  `docs(assessments): Wave F group-report ops runbook (R3-L1)`.

## Task 13 — Whole-branch review + verification + SoT

- [ ] **Step 1 — full gate:** from `src/`, `CI=true npx next build --turbopack` clean; `npm test`
  (zero NEW failures vs the documented pre-existing baseline); `npx eslint` 0/0 on changed files.
- [ ] **Step 2 — whole-branch code review** (superpowers:code-reviewer) → fix Critical/Important.
- [ ] **Step 3 — manual smoke** (coach login, flag/canary on): open a closed INVITED LVA campaign's
  group report + a Rockefeller one; verify INVITED-only (PUBLIC shows the not-applicable state),
  CEO-excluded scored math, omit-empty, provenance, no-prefetch, PDF print.
- [ ] **Step 4 — SoT flush:** CLAUDE.md LAST_UPDATED anchor + `plans/CHANGELOG.md` entry + Notion task;
  do NOT enable the flag on merge — launch is the separate flag-flip per the runbook.

---

## Self-review — spec coverage

| Design / ADR-0011 item | Task |
|---|---|
| canViewGroupReport (§5/§7, R2-HIGH-3) | T1 |
| Default-off flag + canary + kill-switch (§9, R3-HIGH-2) | T2, T8, T10, T12 |
| Cohort all-completed + orphan-robust + validation (§6/§8, R2-HIGH-2) | T3 |
| Qualitative forms + answerer denominators + n (R2-M2) | T4 |
| Scored CEO-excluded + N<2 + headline mirror (R1-HIGH-1/2) | T5 |
| Single snapshot + INVITED gate + provenance/contentHash (R2-M1, §5/§10) | T6 |
| Renderers + dispatch + scoped print CSS | T7 |
| Route + dynamic + fail-closed direct audit + rate-limit (R2-M2/R3-M3) | T8 |
| Real no-store header (R2-LOW-1) | T9 |
| Entry point prefetch=false + gated + no-prefetch regression (R3-M2) | T10 |
| Observability metrics + panel (R3-M1) | T11 |
| Ops runbook + load-test + delete-route hardening note (R3-L1/R2-HIGH-2) | T12 |
| Build gate + review + SoT (no flag on merge) | T13 |
