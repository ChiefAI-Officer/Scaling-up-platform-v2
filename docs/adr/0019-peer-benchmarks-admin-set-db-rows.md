# 19. Peer benchmarks: admin-set DB rows per question; SU-Full's static file retained

Date: 2026-07-03
Status: Accepted

## Context

Wave J shipped the platform's first Peers benchmark (Scaling Up Full) as a **static, versioned TS file**
(`su-full-benchmarks.ts`) after grill decision G4 explicitly rejected a Prisma table + admin editor:
*"16 provisional single-cohort numbers don't need a DB table/CRUD. Promote to a table when real
cohort-matched data arrives."* G2 likewise deferred per-question peers (*"additive QUESTION kind later"*).

Jeff's July-1 feedback then asked for exactly that promotion, for the LVA (items #12/#13): *"the ability to
**set** peer averages for questions in the LVA, and ultimately to add peer average functionality to new
templates going forward,"* with the peer comparison displayed in both LVA reports. Two facts shape the
solution:

1. **The Esperto LVA source has no peers at all** (fidelity audit `18-lva-source-fidelity-audit.md` §2.4) —
   there is no dataset to seed, and inventing one would violate the honest-data stance of ADR-0015.
2. A static file cannot satisfy "the ability to set."

## Decision

Per-question peer benchmarks are **admin-entered database rows**, not code constants:

- New `AssessmentBenchmark` model (`templateId + metricKind + metricKey(stableKey) + value`), unique per
  tuple. `metricKind` has the single value `QUESTION` this wave; other kinds arrive as additive enum
  migrations only when a consumer exists (deliberately no reserved values).
- **Template-level, not version-level.** StableKeys carry cross-version semantic continuity (ADR-0001), the
  display layer is deliberately template/alias-scoped and retroactive (`REPORT_FILTERS`, report factor
  labels, the ceil1 scale), and peers are a *reference dataset* ("companies who have preceded you") — old
  submissions are correctly compared against the current peer set, exactly as Esperto does. Version-scoping
  was considered (co-validate C1) and rejected: it would blank every value on each publish and misreads
  benchmarks as version content.
- **Saves are an atomic full-set reconcile** (one transaction: upsert changed, insert new, delete missing;
  unchanged rows keep id/timestamps) with a before/after delta in the audit log. Blank = unset = row deleted;
  stale keys are pruned against the currently-published version.
- **Rendering is omit-empty per key** and gated twice: the `WAVE_S_PEER_BENCHMARKS_ENABLED` flag AND a
  render-enabled alias list (`PEER_RENDER_ENABLED_ALIASES`, LVA-only this wave). The editor panel appears
  only on render-enabled templates — no dead switches.
- **No values are ever seeded or fabricated.** The capability ships empty; reports are byte-identical until
  an admin enters real numbers. Launch verification uses temporary values via the local-UI pilot against the
  prod DB *before* the production flag flips, so invented numbers can never render on production reports.
- **SU-Full's static file is retained untouched.** Migrating a live, verified render path (with its own
  fail-closed key-skew semantics) buys no user-visible value in this wave.

## Consequences

- Jeff's #12 is satisfied literally: admins set peer averages per LVA question today, and any future template
  gets the same capability by adding its alias to the render-enabled list.
- **Two benchmark systems coexist** (SU-Full static file at domain/section/scaleup granularity; DB rows at
  question granularity). This is deliberate and temporary; a named follow-on consolidates SU-Full into the
  table — and must decide then whether to keep SU-Full's all-or-nothing fail-closed rule (right for seed
  drift) or adopt Wave S's per-key omit-empty (right for deliberate admin input).
- Because benchmarks are template-level, editing values changes what EVERY campaign's reports (including
  historical ones) show as the peer reference from that moment on. That is the intended reference-dataset
  semantics; report provenance records the benchmark `updatedAt` so any view is attributable.
- Reports never fail on benchmark state: missing rows, partial coverage, or a killed flag all degrade to
  today's peer-free rendering.
