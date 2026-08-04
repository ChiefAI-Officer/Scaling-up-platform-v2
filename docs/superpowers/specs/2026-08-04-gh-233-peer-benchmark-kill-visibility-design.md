# GH #233 — Peer-Benchmark Production Auditability Design

Date: 2026-08-04
Status: Design approved; written spec awaiting user review
Issue: [GH #233](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/233)
Claim: [Issue #261 comment](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/261#issuecomment-5142664467)
Re-prime: [Issue #261 comment](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/261#issuecomment-5173204553)
Branch: `codex/233-peer-benchmark-kill-visibility`
Baseline: `origin/main` at `71cb15b9290657b9cbf967aa8a09f705dd1640eb`

## Context

Wave S introduced LVA peer-benchmark authoring and report comparisons behind two
runtime inputs:

- `WAVE_S_PEER_BENCHMARKS_KILL`, which hard-disables the capability when on;
- `WAVE_S_PEER_BENCHMARKS_ENABLED`, which enables it only when the kill input
  does not override it.

`src/src/lib/assessments/wave-s-flags.ts` is the authority for the effective
result. The editor and report paths call `isPeerBenchmarksEnabled()`; neither
needs to know which input produced the result.

The Production kill input is stored as a Vercel `sensitive` variable. Its value
cannot be read back reliably through the Vercel inventory surfaces used by this
project. An unreadable value must therefore remain unknown. It must never be
reported as empty, off, or absent.

Historical records establish that the kill was deliberately enabled and
deployed on 2026-07-16. They do not prove which underlying input is active
today. A later inventory incorrectly treated the unreadable value as empty;
`CLAUDE.md` and the `flag-state-recorrection` CHANGELOG entry retract that
inference.

## Verified Production Baseline

A read-only authenticated Production observation on 2026-08-04 established:

1. The LVA template exists.
2. Published v3 is the active version.
3. Draft v4 and active v3 have the same content hash.
4. The matching content contains 16 `SLIDER_LIKERT` rating questions.
5. The **Peer averages** panel does not render.

The editor gate requires the effective Wave S gate, the LVA render-enabled
alias, an active published version, and at least one rating-question key. The
alias and published-question prerequisites are satisfied, so the absent panel
proves that the effective capability is currently **dark** in the running
Production deployment.

That observation does **not** identify which underlying flag input caused the
dark result. The current editor and benchmark API also do not expose a
read-only benchmark-row inventory. The presence or absence of stored benchmark
rows therefore remains **unknown**, not zero, until a separately authorized
deployment of the diagnostic designed here or another authorized read-only
database audit establishes it.

## Decision

Add a durable, read-only LVA peer-benchmark diagnostic to the existing
`/admin/assessments/observability` page.

The diagnostic reports the effective runtime result and each independent
database prerequisite. It does not reveal raw environment inputs or benchmark
values. It remains useful while the capability is dark by continuing to inspect
the template, active version, rating keys, and stored benchmark keys.

The surface:

- lives only on the Observability page;
- is visible to the page's existing `ADMIN` and `STAFF` roles;
- is a live, refreshable snapshot with no stored history;
- treats unavailable evidence as `Unknown`;
- creates no schema, migration, background task, or audit-log write; and
- does not restore, modify, or expand peer-benchmark behavior.

## Approaches Considered

### 1. Dedicated diagnostic service, endpoint, and panel — selected

Build a focused read-only service, expose it through an independently authorized
endpoint, and mount an independently refreshable panel on the Observability
page.

This follows the shipped import-health pattern. A peer-diagnostic failure cannot
break the main dashboard counters or import-health panel, and the helper can be
tested without React, Next.js, or raw environment strings.

### 2. Extend `GET /api/admin/observability`

Add peer-benchmark fields to the existing dashboard response.

Rejected because the current route is a monolithic `Promise.all`. A failure in
the new evidence path would fail every existing dashboard counter unless this
small issue also refactored the full route into partial-result handling.

### 3. Server-render the diagnostic directly in the page

Query and render the status from the Observability server page.

Rejected because refreshing would require full-page navigation, failure
isolation would be less explicit, and the data contract would be harder to
reuse and test independently.

## Architecture and Component Boundaries

### Read-only audit service

Add a focused module:

`src/src/lib/assessments/peer-benchmark-audit.ts`

It owns:

- the PII-free snapshot types;
- database evidence queries;
- rating-key and stored-key comparison;
- partial-failure classification; and
- the final readiness derivation.

The service receives an already-derived effective-gate evidence object. It
never receives raw environment strings. The route derives the effective result
with the same `isPeerBenchmarksEnabled()` function used by the editor and
reports.

Use structural database interfaces so unit tests can supply narrow mocks and
the Prisma client can satisfy the contract without importing generated Prisma
types into the pure classification logic.

### Dedicated endpoint

Add:

`GET /api/admin/assessments/peer-benchmark-status`

The route is force-dynamic and no-store. It:

1. resolves the API actor;
2. returns `401` when unauthenticated;
3. returns `403` when the actor is not `ADMIN` or `STAFF`;
4. derives the effective runtime gate without exposing its inputs;
5. invokes the read-only audit service; and
6. returns the PII-free snapshot.

The route performs no database writes and emits no audit-log row merely because
an operator viewed or refreshed the status.

### Observability panel

Add:

`src/src/components/admin/PeerBenchmarkStatusPanel.tsx`

Mount it on:

`src/src/app/(dashboard)/admin/assessments/observability/page.tsx`

The panel owns only fetch state, refresh behavior, and presentation. It does not
derive gate or readiness state in the browser.

No Phase 2 wireframe exists for the shipped Observability page. This is a small
extension of that existing operational surface and follows the current
`ImportHealthPanel` layout, refresh, status, and error idioms. It does not
introduce a new navigation destination or a new editor surface.

## Evidence Queries

The service evaluates the following layers.

### Effective runtime gate

The route calls `isPeerBenchmarksEnabled()` in the running deployment and maps
the result to:

- `enabled`; or
- `dark`.

The response never includes the kill input, enabled input, their raw values, or
an inferred cause. If the derivation unexpectedly cannot be obtained, this
field is `unknown`.

### LVA template

Find the non-deleted template whose alias is the existing LVA authority used by
`PEER_RENDER_ENABLED_ALIASES`.

Return only the evidence state needed by the panel. The template database ID is
used internally for dependent queries and does not need to be returned.

### Active published version

When the template is present, resolve the active version using:

- `DEFAULT_TEMPLATE_LANGUAGE`;
- `activePublishedWhere`; and
- descending `versionNumber`.

This is the same published/non-archived version rule used by current campaign
and benchmark read paths. Return the version number, language, and published
timestamp. Parse its questions with the existing
`listRatingQuestionKeys(...)` authority and return the rating-question count.

### Stored benchmark keys

Independently of the effective gate, query the template's
`AssessmentBenchmark` rows where `metricKind` is `QUESTION`.

Select `metricKey` only. Do not select or return `value`.

When the active rating keys and stored keys are both known, compute:

- total stored row count;
- rows matching an active rating key;
- active rating keys missing a stored row; and
- stored rows stale against the active rating-key set.

The schema's existing key uniqueness means these are set counts rather than
value or duplicate analysis.

### Dependency states

Evidence uses explicit states:

- `known` — the query or derivation succeeded;
- `missing` — the authoritative query succeeded and found no required object;
- `notApplicable` — a known missing prerequisite makes a dependent query
  meaningless; and
- `unknown` — the source failed or depends on an unknown source.

A failed query never becomes `missing`, zero, or `notApplicable`.

After a template is known, the active-version query and stored-key query are
isolated so one may succeed when the other fails. A dark effective gate never
short-circuits either database query.

## Snapshot Contract

The endpoint returns a versioned, PII-free shape equivalent to:

```ts
interface PeerBenchmarkAuditSnapshot {
  generatedAt: string;
  targetAlias: "leadership-vision-alignment";
  effectiveGate: Evidence<"enabled" | "dark">;
  template: Evidence<"present">;
  activeVersion: Evidence<{
    versionNumber: number;
    language: string;
    publishedAt: string;
    ratingQuestionCount: number;
  }>;
  benchmarks: Evidence<{
    storedRowCount: number;
    matchingRowCount: number;
    missingRatingQuestionCount: number;
    staleRowCount: number;
  }>;
  readiness:
    | "dark"
    | "blocked"
    | "noData"
    | "partialData"
    | "ready"
    | "unknown";
}
```

`Evidence<T>` is a discriminated union implementing the states above. Unknown
responses expose a stable reason code such as `query_failed` or
`dependency_unknown`, not raw database errors.

## Readiness Derivation

Readiness is display-only. It does not control the editor, reports, API, or
feature flags.

Apply these rules in order:

1. If the effective gate is known dark, readiness is `dark`.
2. If the gate is enabled but the template, active version, or rating-key
   prerequisite is known missing, readiness is `blocked`.
3. If an enabled path requires evidence that is unknown, readiness is
   `unknown`.
4. If zero stored rows match active rating keys, readiness is `noData`.
5. If at least one but fewer than all active rating keys match, readiness is
   `partialData`.
6. If every active rating key has a stored row, readiness is `ready`.

Stale rows are reported separately. When every active key matches, extra stale
rows do not prevent `ready` because current report joins ignore them. The panel
still shows the stale-row warning so dormant configuration does not become
invisible.

The top-level `dark` result does not suppress or overwrite prerequisite
evidence. Operators can still see whether the version and data layers are
known, missing, or unknown.

## Panel Presentation

The panel title is **LVA peer benchmark status**. It contains:

1. a generated timestamp and independent **Refresh** button;
2. a readiness badge and short factual explanation;
3. effective capability status;
4. template and active-version status;
5. active rating-question count;
6. stored, matching, missing, and stale row counts; and
7. a persistent privacy note:
   `Underlying environment inputs and peer values are not displayed.`

State framing:

- `dark` — neutral operational state, not an incident by itself;
- `blocked` — a known prerequisite is absent;
- `noData` — the capability has no matching benchmark configuration;
- `partialData` — only some active rating questions have stored rows;
- `ready` — every active rating question has a matching stored row;
- `unknown` — warning state; one or more required sources could not be read.

The panel must not display:

- environment variable values;
- a claim that the kill input is on or off;
- benchmark numbers;
- organization, campaign, respondent, Coach, or user data; or
- controls that change flags, rows, versions, or reports.

## Error Handling

Each database evidence stage catches and classifies its own read failure.
Successful partial snapshots return HTTP `200` with explicit `unknown`
evidence.

Only a failure outside the snapshot contract returns HTTP `500`. The panel then
shows its own load error. Because it uses a dedicated endpoint and component,
that failure does not remove the existing Observability dashboard or
import-health signals.

Server-side error logs may include:

- the diagnostic name;
- the failed evidence stage; and
- the ordinary error class/message needed for operations.

They must not include:

- raw environment inputs;
- benchmark values;
- full Prisma query results; or
- unrelated customer identifiers.

Known absence and source failure are never interchangeable:

- a successful zero-row query returns known count `0`;
- a failed row query returns `unknown`;
- no active version after a successful query returns `missing`; and
- failure to query the active version returns `unknown`.

## Testing Strategy

### Service tests

Add focused unit coverage for:

1. A dark gate still queries the template, active version, and stored keys.
2. A known active version with rating keys and zero stored rows preserves the
   zero counts rather than producing unknown.
3. Fully matching keys derive `ready`.
4. A nonempty subset derives `partialData`.
5. Zero active matches derives `noData`, including when stale rows exist.
6. Extra stale rows are counted and do not block `ready` when all active keys
   match.
7. A missing template derives `blocked` with truthful dependent states.
8. A missing active version derives `blocked`.
9. An active version with zero rating keys derives `blocked`.
10. Template-query failure makes dependent evidence unknown.
11. Active-version-query failure does not hide a successful stored-key query.
12. Stored-key-query failure does not hide a successful active-version query.
13. No snapshot field contains benchmark values or raw environment strings.

### Route tests

Add focused route coverage for:

1. unauthenticated `401`;
2. non-privileged `403`;
3. `ADMIN` success;
4. `STAFF` success;
5. a partial snapshot remaining HTTP `200`;
6. unexpected service failure returning `500`; and
7. dynamic/no-store response behavior.

### Component tests

Add focused panel coverage for:

1. loading and independent refresh;
2. dark state with prerequisite evidence still visible;
3. missing, zero, partial, ready, stale, and unknown presentations;
4. explicit unknown copy rather than false zero/off wording;
5. endpoint failure isolated to the peer panel;
6. the privacy note; and
7. absence of environment values, benchmark values, and mutation controls.

### Regression validation

The existing Wave S flag, editor, benchmark API, and report tests remain
behavioral authorities. Their expectations must not change merely to
accommodate this diagnostic.

Before any future code push, run from `src/`:

- targeted service, route, and component tests;
- existing Wave S flag/editor/API/report regression tests;
- ESLint on changed files; and
- `CI=true npx next build --turbopack`.

## Rollout and Rollback

The diagnostic itself is flagless and read-only. Merging implementation would
make the operational status panel available to `ADMIN` and `STAFF`; it would
not enable peer averages or modify their underlying gates.

Production deployment remains a separately authorized operation. No design or
implementation approval authorizes:

- changing either Wave S environment input;
- rewriting a Vercel variable from `sensitive` to another type;
- restoring the editor panel or report joins;
- authoring benchmark values;
- publishing or altering an assessment version; or
- redeploying Production.

After a separately approved deployment, verification is read-only:

1. open the Observability page as an authorized operator;
2. confirm the panel loads independently;
3. record the effective status and prerequisite counts without copying raw
   flag inputs or benchmark values;
4. confirm the existing editor/report behavior is unchanged; and
5. update GH #233 and the project source of truth with only what the diagnostic
   actually establishes.

Rollback is a normal code revert. There is no data cleanup, migration rollback,
or environment repair because the diagnostic writes nothing.

## Scope Exclusions and Active-Work Boundaries

This design excludes:

- any Wave S flag value read-back, disclosure, rewrite, or mutation;
- capability restoration or report/editor activation;
- benchmark-number authoring, seeding, editing, repair, or migration;
- changes to `PeerBenchmarksPanel`;
- changes to the benchmark `PUT` route;
- changes to individual or group report joins;
- report redesign or Wave S feature expansion;
- the other seven historically unreadable sensitive variables;
- synthetic customer reports or Production customer-data reads/writes;
- schema changes, migrations, background jobs, or snapshot history;
- GH #257 assessment-email outbox reconciliation; and
- GH #256 Coach-image host policy.

The separately active GH #257 and GH #256 worktrees retain their full scopes.
This branch must not touch their source files, design documents, tracking
claims, or Production operations.

## Acceptance Criteria

- The current effective peer-benchmark state is visible to `ADMIN` and `STAFF`
  on the Observability page.
- The result is derived with the same effective-gate function used by editor
  and report paths.
- Underlying flag inputs and their values are never returned or displayed.
- Template, active-version, rating-key, and benchmark-key evidence remains
  visible even when the capability is dark.
- Stored benchmark values are never selected by the diagnostic or returned.
- Known zero, known missing, not applicable, and unknown are distinct.
- Independent read failures preserve every other verified fact.
- Matching, missing, and stale key counts are accurate.
- The diagnostic performs no writes and creates no audit history.
- A peer-panel failure does not break existing Observability content.
- Existing editor, benchmark API, and report behavior is unchanged.
- No schema, migration, flag change, Production write, redeploy, or capability
  restoration is included.
- Any later Production operation requires separate explicit authorization.
