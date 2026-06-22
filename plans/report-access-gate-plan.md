# Implementation Plan — Report Access Gate refactor

> **Status (2026-06-22):** Plan complete; design adversarially reviewed (4-lens panel) + grilled
> twice (`/grill-with-docs` Q1–Q5; `/grill-me` GQ1–GQ3) + a **Codex co-validate round** (C1–C6 + F1
> applied — see §11). This is the **reconciled single-narrative spec**. Decision of record:
> [ADR-0012](../docs/adr/0012-report-access-gate.md). Glossary term **Report access gate** in
> [CONTEXT.md](../CONTEXT.md). All three fold-ins **APPROVED**. **Implementation ON HOLD pending
> greenlight** — no code written yet. PR sequencing RESOLVED: split by surface — PR1 (gate + group
> no-op migration, ships dark behind the group flag) → PR2 (respondent migration + the 3 fold-ins). §10.

## 1. Summary + intentional behavior changes

Extract a deep **Report access gate** (`viewReport`) under `lib/assessments/` that owns the
cross-cutting protocol both report-viewing routes run today — actor no-actor policy, optional flag
gate, the rate-limit guard, fail-closed audit with IP/UA/provenance/`performedBy`, and the
`render_failure`/`audit_failure` emissions — wrapping a caller-supplied loader that still owns domain
authorization and returns its own discriminated outcome. The gate is **dependency-injected**
(`{ rateLimiter, auditSink, emitMetric }`) so the protocol becomes a unit under test against fakes —
killing the class of bug (stale `NEXT_NOT_FOUND` digest in the fail-closed guard) that shipped twice.
The fix is **structural**: `notFound()`/`redirect()` are only ever called *outside* any `try`, and the
loaders never throw Next control-flow — so the gate uses **zero `unstable_rethrow`** and the
swallowed-404 cannot recur (Codex co-validate C1). The gate interprets the outcome via a single
**`classify(o) → ReportDisposition`** and hands `passthrough` outcomes (`empty`/`notApplicable`) back
to the page to render bespoke panels. Two thin adapters pre-bind per-surface policy; the **pure core
lives in its own file** (§2/C5).

**Intentional behavior changes (call each out in the PR description):**

1. **[CHANGE — audit policy unification]** The per-respondent route moves from **fail-OPEN** audit
   (`logAudit`, which swallows write errors) to **fail-CLOSED** audit (direct `auditSink.create`; a
   write throw re-raises and nothing renders), and now **captures `ipAddress` + `userAgent`** (today
   it omits both). Matches the group route; adopts a policy already proven in prod there.

2. **[CHANGE — rate-limit key, APPROVED]** The per-respondent key is strengthened from the weak
   IP-only `report:${ip}` to `report:${actorKey}:${campaignId}:${respondentId}:${ip}` where
   `actorKey = actor?.coachId ?? actor?.userId ?? "anon"` — the **exact** formula the group route
   already uses (Codex C2: the group key formula is preserved verbatim, not silently rebucketed). The
   current IP-only bucket is shared across every coach behind one NAT/egress IP. **Redis state note:**
   no migration — coaches mid-throttle under the old `report:${ip}` key get a clean slate once on
   deploy. State it in the PR.

3. **[CHANGE — metrics unification + respondent vocabulary]** `emitGroupReportMetric` is generalized
   into a **positional** `emitReportMetric(surface, event, fields?)`; `emitGroupReportMetric` becomes
   a thin positional wrapper (existing group callers untouched). The per-respondent route stops using
   ad-hoc `console.info` and **joins the full structured vocabulary**: `rate_limited`, `authz_deny`
   (on a true `forbidden`), `render_failure`, `audit_failure`, `view`. Markers stay **per-surface
   namespaced** — group keeps `assessment.group_report.${event}` byte-for-byte (preserves the
   `/admin/observability` panel + `group-report-metrics.test.ts`); respondent gets
   `assessment.respondent_report.${event}`. Every line gains a `surface` field (additive for group).
   Consequence: respondent now emits `authz_deny` on a forbidden view — an intentional observability
   upgrade, uniform with group (`forbidden → authz_deny`, `not-found → silent` on both surfaces).

Everything else is **behavior-preserving** (§4). **No feature flag, no posture knob** — ships dark;
rollback = `git revert` + Vercel promote-previous (§8).

---

## 2. New modules and exact file paths

House convention: report-domain code lives in `src/src/lib/assessments/`; tests mirror under
`src/src/__tests__/lib/assessments/` and `src/src/__tests__/app/`.

| File | Status | Purpose |
|------|--------|---------|
| `src/src/lib/assessments/report-gate-core.ts` | **NEW** | The **pure** envelope core: `viewReport`, `ReportGateDeps`, `ViewReportOptions`, `ReportDisposition`, `ReportAuditSpec`, `NoActorPolicy`. Imports ONLY `{ notFound, redirect } from "next/navigation"` and **type-only** imports (`ApiActor`, `AuditAction`, `RateLimitConfig`/`RateLimitResult`, the metric types). **No `db`, no `headers`, no loaders, no flags, no `unstable_rethrow`.** This is the unit-test surface (Codex C5 — keeps the fake seam real, no transitive Next/Prisma imports in the core's test). |
| `src/src/lib/assessments/report-access-gate.ts` | **NEW** | The two adapters (`viewRespondentReport`, `viewGroupReport`), the `ipFromHeaders` helper, and `defaultReportGateDeps()`. Imports `{ headers } from "next/headers"`, `db`, `getApiActor`, both loaders, `reportConfigFor`, `isGroupReportEnabled`, `RateLimits`/`checkRateLimitAsync`, `emitReportMetric`, and `viewReport` from the core. Owns the narrow-Db bridge cast (the pages never see it). `ApiActor` from `@/lib/auth/access-control`. |
| `src/src/lib/assessments/report-metrics.ts` | **NEW** | `ReportSurface`, `ReportMetricEvent` (superset of `GroupReportMetricEvent`), the **positional** `emitReportMetric(surface, event, fields?)`, the surface→marker-namespace map, the shared PII-key stripper. |
| `src/src/lib/assessments/group-report-metrics.ts` | **EDIT (thin)** | `emitGroupReportMetric(event, fields)` becomes `(event, fields) => emitReportMetric("group", event, fields)` — callers + `GroupReportMetricEvent`/`GroupReportMetricFields` types unchanged. Marker `assessment.group_report.${event}` + a `surface:"group"` field. |
| `src/src/lib/rate-limit.ts` | **EDIT (one word)** | Add `export` to the local `interface RateLimitConfig` (Codex C4 — today it's unexported, so the core can't `import type` it). Purely additive. |
| `src/src/lib/assessments/respondent-report.ts` · `group-report.ts` | **NOT MODIFIED** | Loaders untouched. |
| `src/src/lib/audit.ts` | **EDIT (one line)** | Add `'VIEW_REPORT'` to the `AuditAction` union (additive); removes today's `as AuditAction` cast. |
| `src/src/app/(report)/.../report/page.tsx` (both) | **EDIT (shrink)** | Adapter call + outcome switch + page-owned success metrics. Pass only ids (+ `generatedAt` for group) + `defaultReportGateDeps()`; no `reportDb` cast. See §6. |

Tests: `report-gate-core.test.ts` (**NEW**, the protocol against fakes — no Next/Prisma transitive imports); `report-metrics.test.ts` (**NEW**); `report-access-gate.test.ts` (**NEW**, the two adapters' wiring/mapping); `group-report-metrics.test.ts` (**EDIT**, `surface:"group"`); both page tests (**EDIT** — mock the adapter for render/page-metric tests + keep one leaf-mocked integration smoke each).

---

## 3. The gate interface (concrete, ground-truth types) + the EXACT gate body

```ts
// report-gate-core.ts (PURE core — signatures, plan not final code)

import { notFound, redirect } from "next/navigation";              // the ONLY runtime import
import type { ApiActor } from "@/lib/auth/access-control";         // canonical type the loaders use
import type { AuditAction } from "@/lib/audit";                    // now includes "VIEW_REPORT"
import type { RateLimitConfig, RateLimitResult } from "@/lib/rate-limit";  // RateLimitConfig now exported (C4)
import type { ReportSurface, ReportMetricEvent } from "@/lib/assessments/report-metrics";

export interface ReportGateDeps {
  // EXACTLY Prisma's auditLog.create signature — do NOT narrow (contravariance). Typed without
  // importing `db` at runtime: a structural { create } the full client satisfies.
  auditSink: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
  rateLimiter: (id: string, config: RateLimitConfig) => Promise<RateLimitResult>;
  emitMetric: (surface: ReportSurface, event: ReportMetricEvent, fields?: Record<string, unknown>) => void;
}

export type ReportDisposition = "ok" | "forbidden" | "not-found" | "passthrough";

export interface ReportAuditSpec {
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes: Record<string, unknown>;   // provenance payload; the gate JSON.stringifies (parity with logAudit, verified)
}

export type NoActorPolicy = "redirect-login" | "tolerate";

export interface ViewReportOptions<TOutcome> {
  surface: ReportSurface;
  actor: ApiActor | null;
  noActorPolicy: NoActorPolicy;
  flagGate?: () => boolean;
  ip: string;
  userAgent: string | null;
  rateLimitKey: string;
  rateLimitConfig: RateLimitConfig;
  load: () => Promise<TOutcome>;          // loaders return discriminated unions; NEVER throw Next control-flow
  classify: (o: TOutcome) => ReportDisposition;   // single total classifier (replaces 3 booleans)
  auditOf: (o: TOutcome) => ReportAuditSpec;       // called ONLY when classify(o) === "ok"; adapter narrows the ok-variant (F1)
  auditFailureFields?: (o: TOutcome) => Record<string, unknown>;  // surface fields for the audit_failure metric (group: { template }) — C3
  metricRole: string | null;
}

export async function viewReport<TOutcome>(deps: ReportGateDeps, opts: ViewReportOptions<TOutcome>): Promise<TOutcome>;
```

**The exact gate body — `notFound()`/`redirect()` are called ONLY outside `try`, so nothing can
swallow them; ZERO `unstable_rethrow` (the bug class is structurally impossible — Codex C1):**

```ts
export async function viewReport(deps, opts) {
  const emit = (event, fields) => deps.emitMetric(opts.surface, event, { role: opts.metricRole, ...fields });
  const startedAt = Date.now();

  // 1. No-actor policy — throws OUTSIDE any try.
  if (!opts.actor && opts.noActorPolicy === "redirect-login") redirect("/login");

  // 2. Flag gate FIRST — throws OUTSIDE any try.
  if (opts.flagGate && !opts.flagGate()) notFound();

  // 3. Rate-limit — the try wraps ONLY the limiter call. notFound() is called AFTER the catch,
  //    so the fail-closed 404 can never be swallowed. FAIL-CLOSED on exceeded; FAIL-OPEN on outage.
  let rateLimited = false;
  try {
    const rl = await deps.rateLimiter(opts.rateLimitKey, opts.rateLimitConfig);
    rateLimited = !rl.success;
  } catch (err) {
    console.error("[report-gate] rate limiter unavailable; proceeding (fail-open)", err);
  }
  if (rateLimited) { emit("rate_limited"); notFound(); }   // OUTSIDE the try

  // 4. Load — loaders return unions and NEVER throw Next control-flow, so this catch only ever sees
  //    genuine errors (no unstable_rethrow needed). INVARIANT: if a loader ever throws notFound()/
  //    redirect(), re-introduce unstable_rethrow(err) as the first line of this catch.
  let result;
  try {
    result = await opts.load();
  } catch (err) {
    emit("render_failure", { latencyMs: Date.now() - startedAt, errorClass: err instanceof Error ? err.constructor.name : "unknown" });
    throw err;
  }

  // 5. Disposition — exhaustive over a gate-owned enum. All notFound()s here are OUTSIDE any try.
  const disposition = opts.classify(result);
  if (disposition === "forbidden") { emit("authz_deny"); notFound(); }
  if (disposition === "not-found") { notFound(); }                       // silent 404
  if (disposition === "passthrough") return result;                      // empty/notApplicable → page renders
  if (disposition !== "ok") { const _exhaustive: never = disposition; throw new Error(`unhandled report disposition: ${String(_exhaustive)}`); }

  // 6. OK → fail-closed audit BEFORE returning. auditSink.create is a DB write (never control-flow).
  try {
    const spec = opts.auditOf(result);
    await deps.auditSink.create({
      data: {
        entityType: spec.entityType,
        entityId: spec.entityId,
        action: spec.action,
        performedBy: opts.actor?.email ?? "anon",
        changes: JSON.stringify(spec.changes),
        ipAddress: opts.ip,            // TOP-LEVEL
        userAgent: opts.userAgent,     // TOP-LEVEL
      },
    });
  } catch (err) {
    const errorClass = err instanceof Error ? err.constructor.name : "unknown";
    const latencyMs = Date.now() - startedAt;
    emit("render_failure", { latencyMs, errorClass });                          // latencyMs preserved (C3)
    emit("audit_failure", { ...(opts.auditFailureFields?.(result) ?? {}), errorClass });  // group: { template } (C3)
    throw err;
  }

  // 7. OK outcome returned UNCHANGED. The PAGE emits `view` (+ surface signals) and renders.
  return result;
}
```

**Adapters (`report-access-gate.ts` — pre-bind per-surface policy; own the read-`db` cast; page passes only ids):**

```ts
import { viewReport, type ReportGateDeps, type ViewReportOptions } from "./report-gate-core";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { checkRateLimitAsync, RateLimits } from "@/lib/rate-limit";
import { emitReportMetric } from "./report-metrics";
import { getRespondentReport } from "./respondent-report";
import { getCampaignGroupReport } from "./group-report";
import { reportConfigFor } from "./report-config";
import { isGroupReportEnabled } from "./wave-f-flags";

const ipFromHeaders = (h) =>
  h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "localhost";

export function defaultReportGateDeps(): ReportGateDeps {
  // db.auditLog satisfies the structural { create }; checkRateLimitAsync / emitReportMetric are
  // standalone functions (no `this` binding concern).
  return { auditSink: db.auditLog, rateLimiter: checkRateLimitAsync, emitMetric: emitReportMetric };
}

export async function viewRespondentReport(deps, args /* { campaignId, respondentId } */) {
  const actor = await getApiActor();
  const h = await headers();
  const ip = ipFromHeaders(h);
  const userAgent = h.get("user-agent");
  const actorKey = actor?.coachId ?? actor?.userId ?? "anon";          // SAME formula as group (C2)
  const reportDb = db as unknown as Parameters<typeof getRespondentReport>[0];
  return viewReport(deps, {
    surface: "respondent",
    actor,
    noActorPolicy: "redirect-login",
    flagGate: undefined,
    ip, userAgent,
    rateLimitKey: `report:${actorKey}:${args.campaignId}:${args.respondentId}:${ip}`,   // fix #2
    rateLimitConfig: RateLimits.standard,
    load: () => getRespondentReport(reportDb, actor!, args.campaignId, args.respondentId),
    classify: (o) => (o.status === "ok" ? "ok" : o.status === "forbidden" ? "forbidden" : "not-found"),
    auditOf: (o) => {
      if (o.status !== "ok") throw new Error("unreachable: auditOf on non-ok");   // narrows o → ok-variant (F1, no `as any`)
      return {
        entityType: "AssessmentSubmission",
        action: "VIEW_REPORT",
        entityId: o.report.provenance.submissionId,
        changes: {
          kind: "respondent-report",
          templateAlias: o.report.templateAlias ?? null,
          reportType: reportConfigFor(o.report.templateAlias).reportType,
          versionId: o.report.provenance.versionId,
          contentHash: o.report.provenance.contentHash,
        },
      };
    },
    // respondent has no audit_failure today (it's new) → no surface fields needed.
    metricRole: actor?.role ?? null,
  });
}

export async function viewGroupReport(deps, args /* { campaignId, generatedAt } */) {
  const actor = await getApiActor();
  const h = await headers();
  const ip = ipFromHeaders(h);
  const userAgent = h.get("user-agent");
  const actorKey = actor?.coachId ?? actor?.userId ?? "anon";          // EXACT current formula (C2)
  const reportDb = db as unknown as Parameters<typeof getCampaignGroupReport>[0];
  return viewReport(deps, {
    surface: "group",
    actor,
    noActorPolicy: "tolerate",
    flagGate: () => isGroupReportEnabled(actor, { id: args.campaignId }),   // null-actor-safe (verified)
    ip, userAgent,
    rateLimitKey: `group-report:${actorKey}:${args.campaignId}:${ip}`,      // UNCHANGED (now truly)
    rateLimitConfig: RateLimits.standard,
    load: () => getCampaignGroupReport(reportDb, actor, args.campaignId, args.generatedAt),
    classify: (o) => (o.kind === "ok" ? "ok" : o.kind === "forbidden" ? "forbidden" : "passthrough"),
    auditOf: (o) => {
      if (o.kind !== "ok") throw new Error("unreachable: auditOf on non-ok");   // narrows (F1)
      return {
        entityType: "AssessmentCampaign",
        action: "GROUP_REPORT_VIEW",
        entityId: args.campaignId,
        changes: {
          kind: "group-report",
          generatedAt: args.generatedAt.toISOString(),
          versionId: o.provenance.versionId,
          templateAlias: o.provenance.templateAlias,
          contentHash: o.provenance.contentHash,
          ceoParticipantId: o.provenance.ceoParticipantId,
          completedCount: o.provenance.completedCount,
          invitedCount: o.provenance.invitedCount,
          submissionIds: o.provenance.submissionIds,
        },
      };
    },
    auditFailureFields: (o) => (o.kind === "ok" ? { template: o.provenance.templateAlias } : {}),  // preserves today's audit_failure `template` (C3)
    metricRole: actor?.role ?? null,
  });
}
```

**Why a single `classify`.** Three interdependent booleans (`isOk`/`isForbidden`/`emitAuthzDeny`)
already produced a false-`authz_deny`-on-a-nonexistent-entity bug in review. One total classifier over
a gate-owned enum makes branching exhaustive and that class structurally impossible:
`forbidden → authz_deny + 404`, `not-found → silent 404`, `passthrough → return for the page`,
`ok → audit + return`. `ReportDisposition` is internal plumbing — **not** a CONTEXT.md term. The
`assertNever` default guards future members. **`auditOf` type-safety (F1):** the adapter narrows the
ok-variant with a guard (`if (o.status !== "ok") throw …`) so it reads ok-only fields type-safely —
no `as any`.

**Metric ownership (the seam).** The gate emits ONLY request-*ending* events it decides:
`rate_limited`, `authz_deny`, `render_failure`, `audit_failure`. The **page** emits success-*render*
events — `view` (rich, surface-specific), `degraded`/`orphan_submission` (group), `not_applicable`/
`empty` panel signals — because only the page knows what it rendered. `forbidden → authz_deny`,
`not-found → silent`, uniform across surfaces. The group `audit_failure` keeps its `template` field
and both failure paths keep `latencyMs` (C3).

**Control-flow preservation (the structural fix — Codex C1).** Next's `notFound()`/`redirect()` throw
control-flow errors (`NEXT_HTTP_ERROR_FALLBACK;404` / `NEXT_REDIRECT`). The gate calls them ONLY
outside any `try` (step 1 no-actor, step 2 flag, the post-catch rate-limit check, the disposition
switch) — **nothing catches them, so the swallowed-404 bug is structurally impossible, and the gate
uses no `unstable_rethrow`.** The two `try` blocks (load, audit) wrap operations that never produce
Next control-flow — the loaders return discriminated unions (verified: no `notFound`/`redirect`
inside either loader) and `auditSink.create` is a DB write — so their `catch` only sees genuine
errors. **Invariant** (documented in the load catch): if a future loader throws `notFound()`/
`redirect()` internally, re-introduce `unstable_rethrow(err)` as the catch's first line.

---

## 4. Behavior-preservation matrix

| # | Observable behavior (current) | Route(s) today | After refactor: lives in | Status |
|---|---|---|---|---|
| 1 | `getApiActor()` resolves actor server-side | both | **adapter** | preserved |
| 2 | Null actor → `redirect("/login")` | respondent | **gate** (`noActorPolicy:"redirect-login"`) | preserved |
| 3 | Null actor tolerated (flag + loader handle it) | group | **gate** (`noActorPolicy:"tolerate"`) | preserved |
| 4 | **Flag gate FIRST**, before any DB/rate-limit work → `notFound()` | group | **gate** | preserved (order: actor → flag → rate-limit → load → audit). *(Adapter reads `headers()` before the gate; negligible, no DB/rate-limit/load runs before the flag.)* |
| 5 | IP/UA read once, reused by key + audit | group (resp. IP only, no UA) | **adapter** via `ipFromHeaders` | group preserved; **changed** for respondent (now uses UA — fix #1) |
| 6 | Rate-limit **fail-closed on EXCEEDED** → `notFound()` | both | **gate** | preserved (single impl) |
| 7 | Rate-limit **fail-OPEN on outage** → log + proceed | both | **gate** — `notFound()` is now **outside** the rate-limit `try` (flag set in try, 404 after catch); **zero `unstable_rethrow`** | preserved + **hardened** (Codex C1: the twice-shipped swallowed-404 is structurally impossible) |
| 8 | Rate-limit key shape | resp: `report:${ip}` · group: `group-report:${actorKey}:${id}:${ip}`, `actorKey = coachId ?? userId ?? "anon"` | **adapter** | group **preserved verbatim** (Codex C2: exact `coachId ?? userId ?? "anon"`); respondent **intentionally-changed** to `report:${actorKey}:${campaignId}:${respondentId}:${ip}` with the SAME `actorKey` formula (fix #2) |
| 9 | `rate_limited` metric on shed | group · resp `console.info` | **gate** | group `assessment.group_report.*` preserved; respondent → structured `assessment.respondent_report.*` (fix #3) |
| 10 | Authorized **load** delegated to loader | both | **gate** calls `load()`; loader unchanged | preserved |
| 11 | `forbidden` → `notFound()`, NO audit | both | **gate** (`classify→"forbidden"` ⇒ `authz_deny` + 404) | preserved (404 + no audit) |
| 12 | respondent `not-found` → `notFound()`, no audit, no metric | respondent | **gate** (`classify→"not-found"` ⇒ silent 404) | preserved (silent; no false `authz_deny`) |
| 13 | `notApplicable` → panel, NOT 404 | group | **page** (`passthrough`; gate returns unchanged) | preserved |
| 14 | `empty` → empty panel, NOT 404 | group | **page** (`passthrough`) | preserved |
| 15 | `authz_deny` metric | group (forbidden only) | **gate** | **intentionally-changed:** now on BOTH surfaces on a true `forbidden` (respondent gains it — fix #3). `not-found` stays silent on both. |
| 16 | `not_applicable`/`empty` metrics | group | **page** | preserved |
| 17 | Audit BEFORE render, fail-CLOSED, IP/UA top-level | group | **gate** | preserved (group) |
| 18 | Audit fail-OPEN via `logAudit`, no IP/UA | respondent | **gate** now fail-CLOSED + IP/UA | **intentionally-changed** (fix #1) |
| 19 | Audit row `performedBy` + provenance; `changes` JSON-stringified | group via `db.create(JSON.stringify)` · resp via `logAudit` (which `JSON.stringify`s) | **gate** `JSON.stringify(spec.changes)` | preserved — **serialization parity verified** (`logAudit` does `JSON.stringify`; identical). Respondent gains IP/UA; `changes.templateAlias` keeps `?? null` |
| 20 | `render_failure` on load-throw AND audit-throw (`latencyMs`+`errorClass`) | group only | **gate** (both `try`s emit `latencyMs`+`errorClass`) | preserved for group incl. `latencyMs` on the audit-throw path (Codex C3); **added** for respondent (more observability, no success-path change) |
| 21 | `audit_failure` (`template`+`errorClass`) | group | **gate** via `auditFailureFields` ⇒ `{ template }` + `errorClass` | preserved for group incl. **`template`** (Codex C3); respondent gains it (now fail-closed) |
| 22 | OK **view** metric | group rich (page) · resp `console.info` (page) | **page** (gate emits NO `view`) | preserved (group fields verbatim; respondent → structured `assessment.respondent_report.view`) |
| 23 | `dynamic`/`revalidate` | both | **page** (module export) | preserved |
| 24 | `Cache-Control: no-store` | middleware regex | **middleware** (unchanged) | preserved |
| 25 | Final render `<BrandedReport>`/`<GroupReport>` + panels | both | **page** | preserved |
| 26 | Post-OK page work NOT wrapped for `render_failure` | group | **page** (still unwrapped) | preserved (a post-render throw is a plain 500, as today) |

Seam rule: **the gate emits only the request-ending events for its decisions** (`rate_limited`,
`authz_deny`, `render_failure`, `audit_failure`); the **page emits the success-render events**
(`view`, `not_applicable`, `empty`, `degraded`, `orphan_submission`). Gate stays loader-shape-agnostic
and truthful (never claims a render it didn't perform).

---

## 5. TDD task breakdown (ordered)

Use `tdd` + `superpowers:subagent-driven-development`; each task red → green, reviewed. Core + adapter
+ metrics tests assert against fakes — no route render for Tasks 0–11. **PR split (§10):** PR1 =
Tasks -1, 0, 1–8, 10, 13, 14 (gate + group no-op migration, ships dark behind the group flag); PR2 =
Tasks 9, 11, 12, 14 (respondent migration + the 3 fold-ins).

**Task -1 — pre-refactor + source guard (no code).** `grep -rn "NEXT_NOT_FOUND" src/src/` (confirm none). After the core exists, **assert the gate SOURCE contains no `NEXT_` digest literal** (it calls `notFound()`/`redirect()`, never compares digests) — a guard test (Codex C6). No test may reimplement a digest string or a fake `unstable_rethrow`.

**Task 0 — metrics scaffolding + group rewire + `RateLimitConfig` export.** Add `export` to `RateLimitConfig` in `rate-limit.ts` (C4). Create `report-metrics.ts` (positional `emitReportMetric`, surface→namespace map, PII stripper — exact forbidden-key set from today's `emitGroupReportMetric`). **Test first:** `("group","view")` → marker `assessment.group_report.view` + `surface:"group"`; `("respondent","view")` → `assessment.respondent_report.view`; PII keys stripped. Rewire `emitGroupReportMetric` to delegate. **Edit `group-report-metrics.test.ts`** → `expect.objectContaining({ …, surface:"group" })`.

**Task 1 — core: rate-limit EXCEEDED.** `it.each` both surfaces: `rateLimiter` → `{success:false}`; mock `notFound` to throw a **sentinel** (not a digest string). **Assert:** `viewReport` rejects (the sentinel); `load`/`auditSink.create` NOT called; `emitMetric(surface,"rate_limited",…)`. (No `unstable_rethrow`, no digest in the test — Codex C6.)

**Task 2 — core: rate-limiter OUTAGE.** `rateLimiter.mockRejectedValue(new Error("Redis timeout"))`; `load` OK. **Assert:** does NOT throw; `console.error` contains `"rate limiter"`; `load` called once; `auditSink.create` once; returns the OK outcome; **no `rate_limited` emitted**; gate emits no `view`.

**Task 3 — core: dispositions.** group `{kind:"forbidden"}` → rejects (sentinel notFound), no audit, `authz_deny` emitted; respondent `{status:"forbidden"}` → rejects, no audit, `authz_deny` emitted; respondent `{status:"not-found"}` → rejects, no audit, **NO `authz_deny`** emitted.

**Task 4 — core: OK + audit THROWS.** `auditSink.create.mockRejectedValue(new Error("db down"))` + an `auditFailureFields` returning `{template:"X"}`. **Assert:** rejects with `"db down"`; `render_failure` (with `latencyMs`+`errorClass`) **then** `audit_failure` (with `template:"X"`+`errorClass`) emitted, in that order; does NOT return.

**Task 4b — core: LOAD throws.** `load.mockRejectedValue(...)`. **Assert:** rejects; `render_failure` (`latencyMs`+`errorClass`); **NO `audit_failure`**; `auditSink.create` NOT called.

**Task 5 — core: OK + audit OK.** **Assert:** returns the **same object reference** (`toBe`); `auditSink.create` once with `data` `objectContaining({ ipAddress, userAgent, performedBy:"…@…", action:"VIEW_REPORT", changes: stringContaining("versionId") })`; **`emitMetric` NOT called with `"view"`** (page-owned).

**Task 6 — core: `passthrough` NOT 404'd.** `classify→"passthrough"`. **Assert:** returns the same object (`toBe`); `notFound` NOT called; no audit; no metric.

**Task 7 — core: noActorPolicy.** `null`+`"redirect-login"` → `redirect` sentinel thrown; `flagGate`/`rateLimiter`/`load` NOT called. `null`+`"tolerate"`+flag true+rate OK+load OK → returns OK.

**Task 8 — core: flagGate FIRST.** order recorded; `flagGate:()=>false` → rejects, `callOrder===["flagGate"]`, `rateLimiter`/`load` NOT called.

**Task 9 — adapter `viewRespondentReport`.** Mock `getApiActor`/`headers`/loader. **Assert:** `rateLimitKey === report:${coachId??userId??"anon"}:${campaignId}:${respondentId}:${ip}` (C2 formula); `surface:"respondent"`, `noActorPolicy:"redirect-login"`, `flagGate:undefined`, `metricRole`; `classify` maps the 3 statuses; `auditOf` narrows + builds the `VIEW_REPORT` spec (`templateAlias ?? null`); no `reportDb` arg.

**Task 10 — adapter `viewGroupReport`.** **Assert:** `rateLimitKey === group-report:${coachId??userId??"anon"}:${campaignId}:${ip}` (**exact current**, C2); `surface:"group"`, `noActorPolicy:"tolerate"`; `flagGate` wired to `isGroupReportEnabled`; `classify` maps `ok/forbidden/else→passthrough`; `auditOf` narrows + `GROUP_REPORT_VIEW`; `auditFailureFields(ok) === { template }`.

**Task 11 — `AuditAction` union one-liner.** Add `'VIEW_REPORT'`; drop the cast. Type-check confirms.

**Task 12 — shrink per-respondent page + test.** `const res = await viewRespondentReport(defaultReportGateDeps(), { campaignId:id, respondentId })`; `if (res.status !== "ok") notFound()`; `emitReportMetric("respondent","view",{ template:… })`; render `<BrandedReport>`. **Test:** migrate audit mock from `logAudit` → `db.auditLog.create`; mock the **adapter** for render/page-metric tests; **one leaf-mocked integration smoke** (mock `getApiActor`/`headers`/rate-limit/loader/`db.auditLog.create`, NOT the adapter): rate-exceeded→404; `ok`→renders + `VIEW_REPORT` row carries `ipAddress`+`userAgent`.

**Task 13 — shrink group page + test.** `const result = await viewGroupReport(defaultReportGateDeps(), { campaignId, generatedAt })`; switch `notApplicable`/`empty`→panel + their metric; `ok`→compute `orphanCount`/`ceoName`, emit `degraded`/`orphan_submission`/`view`, render `<GroupReport>`. **Test:** keep panel-render + cache-export (mock the adapter); one leaf-mocked integration smoke (flag-off→404, rate-exceeded→404, ok→render); `surface:"group"` on retained metric assertions.

**Task 14 — full-suite + lint + build gate** (§7).

---

## 6. How the two `page.tsx` files shrink

**Per-respondent (154 → ~45 lines):** today inlines actor+redirect, IP read, the rate-limit try/catch, the `db` bridge, the loader call, the `forbidden||not-found→notFound` branch, the fail-open `logAudit` (no IP/UA), the `console.info`. **After:** one `viewRespondentReport(defaultReportGateDeps(), { campaignId:id, respondentId })` call, `if (res.status !== "ok") notFound()`, `emitReportMetric("respondent","view",…)`, render. Bridge cast moves to the adapter; protocol + audit move to the gate.

**Group (275 → ~95 lines):** `viewGroupReport(defaultReportGateDeps(), { campaignId, generatedAt })` absorbs flag gate, IP/UA, rate-limit, the loader `render_failure` wrap, `forbidden→authz_deny→notFound`, and the fail-closed `GROUP_REPORT_VIEW` audit. The page keeps the outcome switch: `notApplicable`→panel+`emit`; `empty`→`<GroupReportEmpty>`+`emit`; `ok`→compute `orphanCount`/`ceoName`, emit `degraded`/`orphan_submission`/`view`, render `<GroupReport>`. Page still creates `generatedAt = new Date()` (gate + loader clock-free).

---

## 7. Verification gate

1. `CI=true npx next build --turbopack`.
2. Targeted: `report-gate-core report-metrics`, `report-access-gate`, `group-report-metrics`, `assessment-respondent-report-page group-report-route`, and regression `group-report.loader respondent-report` (loaders untouched — must stay green).
3. `npx eslint` on every changed file (incl. `rate-limit.ts`, `lib/audit.ts`). Fix all warnings + errors.
4. Full suite: zero NEW failures (baseline 28 pre-existing).
5. Post-push: `npx vercel ls | head -5` → `● Ready`.

---

## 8. Rollback story

Additive new files (`report-gate-core.ts`, `report-access-gate.ts`, `report-metrics.ts`) + thin edits
(`group-report-metrics.ts` delegation; one-word `export` on `RateLimitConfig`; one-line `AuditAction`
member; two pages rewritten to call adapters). Loaders **untouched**. **No migration, no schema
change, no feature flag.** **Redis caveat (fix #2):** the respondent key flip orphans in-flight per-IP
countdowns once on deploy (self-heals); a revert flips back the same one-time way. Revert =
`git revert` the squash commit (or promote-previous) — pages return to inline protocol, new modules
become dead and are removed, `emitGroupReportMetric` reverts to standalone, the unused enum member is
harmless. Clean and atomic (nothing else imports the new modules).

---

## 9. Dismissed / down-graded review findings

- **4-lens panel:** auditSink contravariance (resolved via structural `{ create }`), IP/UA top-level (§3), `isForbidden` split (subsumed by the single `classify`), `notApplicable`/`empty` passthrough (matrix 13/14), VIEW_REPORT union (Task 11).
- **`view`-emitted-by-gate (grill Q4)** — corrected: page-owned.
- **`unstable_rethrow` "not recommended" (Codex aside)** — **moot**: the gate now uses zero `unstable_rethrow` (C1).
- **observability won't tally `VIEW_REPORT`** — non-issue; rows written, panel tally is a later wave.

---

## 10. Decisions

**Resolved (recorded for the implementer):** Q1 single `classify`; Q2 per-surface markers + respondent vocabulary; Q3 dark, no flag; Q4 page-owned `view`; Q5 hybrid test boundary; GQ1 adapter owns read-`db`, page passes ids; GQ2 page keeps exhaustive narrowing switch; GQ3 positional `emitReportMetric`; GC1–GC7 (null-safe flag, `ipFromHeaders` parity, `RateLimits.standard`, error-class capture, headers-before-flag, post-OK unwrapped, `assertNever`); Codex C1–C6 + F1 (§11). Fold-ins (a)(b)(c) **APPROVED**.

**RESOLVED — split by SURFACE (not by "extraction vs fold-ins").** The respondent fold-ins (fail-closed audit, structured metrics) are *intrinsic* to routing respondent through the unified gate, so a "pure-extraction-then-fold-ins" axis would need the rejected posture knob. The clean seam is:

- **PR1 — gate + GROUP migration (no-op for group):** build `report-gate-core.ts`, `report-access-gate.ts` (group adapter), `report-metrics.ts`, the `RateLimitConfig` export, and migrate the group page. Group already matches the gate's target shape (fail-closed audit, structured metrics, canonical key), so behavior is preserved (the only additive change is the `surface:"group"` metric field). Group is the **flag-gated** bulk-PII surface (`WAVE_F_GROUP_REPORT_ENABLED`), so PR1 ships dark and proves the gate in prod with no behavior change. Tasks -1, 0, 1–8 (core), 10 (group adapter), 13 (group page), 14.
- **PR2 — respondent migration (carries the 3 fold-ins):** build the respondent adapter, migrate the respondent page, add the `VIEW_REPORT` union member. The fail-closed+IP/UA audit, stronger rate-limit key, and structured metrics all land here, on the always-on respondent surface. Tasks 9 (respondent adapter), 11 (`VIEW_REPORT` union), 12 (respondent page), 14.

A PR1 regression ⇒ the extraction; a PR2 regression ⇒ a respondent fold-in. Cost: two PRs.

**Acknowledged residual risks (no decision):** one-time Redis throttle reset on deploy (self-heals); `/admin/observability` doesn't tally `VIEW_REPORT` yet; a post-OK page-render throw is a plain 500 with no `render_failure` marker (as today).

---

## 11. Codex co-validate round (2026-06-22)

A staff-engineer Codex pass (via `/co-validate`) + an independent self-review. Verdict was "direction
right, do not greenlight as written" — all material findings accepted:

- **C1 (accepted, structural):** `notFound()` moved OUTSIDE the rate-limit `try`; loaders never throw
  control-flow → **zero `unstable_rethrow`**; swallowed-404 now structurally impossible. §3, matrix 7.
- **C2 (accepted, bug):** group rate-limit `actorKey` preserved verbatim (`coachId ?? userId ?? "anon"`);
  respondent uses the same formula. §1 fix #2, §3, matrix 8, Tasks 9/10.
- **C3 (accepted):** group failure metrics preserved — `latencyMs` on the audit-throw `render_failure`,
  `template` on `audit_failure` via `auditFailureFields`. §3, matrix 20/21, Task 4.
- **C4 (accepted):** `export` `RateLimitConfig` from `rate-limit.ts` so the core can `import type` it. §2, Task 0.
- **C5 (accepted):** pure `viewReport` core split into `report-gate-core.ts` (no Next/Prisma/loader
  imports) from the adapters in `report-access-gate.ts`. §2, §3.
- **C6 (accepted):** tests don't depend on digest strings / a fake `unstable_rethrow`; rate-limit test
  asserts via a sentinel; a source-guard test asserts no `NEXT_` literal in the gate. Tasks -1/1/2.
- **F1 (self, accepted):** `auditOf` narrows the ok-variant with a guard — no `as any`. §3, Tasks 9/10.
- **F2 (self, verified — no change):** respondent `changes` serialization parity holds (`logAudit` does
  `JSON.stringify`, identical to the gate). Matrix 19.
- **Overridden:** Codex's "`unstable_rethrow` not recommended" — moot once C1 removes all uses.
- **Carried to §10 as the one open question:** PR sequencing (one PR vs PR1 pure-extraction + PR2 fold-ins).
