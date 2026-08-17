# 19. Peer benchmarks: governed DB rows per question; SU-Full snapshot added

Date: 2026-07-03
Status: Accepted

Amended: 2026-08-14

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

LVA per-question peer benchmarks are **admin-entered database rows**. Scaling Up Full adds the source-backed
snapshot exception described below:

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
  render-enabled alias list. Configuration uses a separate editor-enabled list so a verified dataset may be
  prepared before its report presentation ships; the 2026-08-14 amendment is the first staged use.
- **Wave S originally seeded no values.** LVA still ships empty because no source dataset exists; its rows
  appear only after an admin enters them. Scaling Up Full now has a separately governed, source-backed
  exception described in the 2026-08-14 amendment below.
- **SU-Full's static render path is retained.** Its question record now consumes the same canonical
  controlled snapshot used by the explicit DB refresh; its domain/section/ScaleUp values remain provisional.
  The existing report layout and fail-closed key-skew behavior do not change.

## Consequences

- Jeff's #12 is satisfied literally: admins set peer averages per LVA question today, and any future template
  gets the same configuration capability by adding its alias to the editor-enabled list.
- **Two storage/read paths coexist.** The existing SU-Full report reads the canonical static snapshot; DB
  rows support the editor and the future paired-bar path. The explicit refresh mirrors the same source into
  DB, avoiding two code copies, but a manual DB edit does not alter today's static SU-Full report. The render
  follow-on must choose DB semantics (all-or-nothing fail-closed versus per-key omit-empty) before switching.
- Because benchmarks are template-level, editing values changes every campaign report that currently has a
  peer render path, including historical reports. Editor-only templates begin using the rows when their
  report path later ships. This is the intended reference-dataset semantics; `updatedAt` and admin audit
  history keep changes attributable.
- Reports never fail on benchmark state: missing rows, partial coverage, or a killed flag all degrade to
  today's peer-free rendering.

## 2026-08-14 amendment: Scaling Up Full per-question snapshot

A controlled Esperto experiment produced a complete 61-question reference set. Eleven otherwise-identical
reports varied Q01 through scores 0–10, and additional controls varied company size and organizational
phase. Every displayed Peer value stayed fixed by question across that controlled set. This rules out live
calculation from the current company's respondents and provides sufficient evidence to treat the displayed
values as a stored per-question lookup for this implementation. It does **not** reveal Esperto's private
historical cohort formula or refresh schedule. The evidence ledger and complete captured value table are in
`docs/research/esperto-peer-benchmark-snapshot-2026-08-14.md`; source interpretation and remaining unknowns
are in `docs/research/esperto-peer-benchmark-sources.md`.

The implementation therefore:

- stores a single canonical, versioned, effective-dated question snapshot in
  `su-full-question-benchmarks.ts` (`2026-08-14.esperto-controlled-v1`), consumed by both the existing static
  report benchmark and the DB refresh;
- provides an explicit, idempotent reconcile command
  (`BENCHMARK_REFRESH_ACTOR=<operator> npm run seed:scaling-up-full-peers`) that validates the active `enUS`
  template still contains exactly Q01–Q61 before replacing the table's QUESTION rows;
- keeps that refresh separate from the ordinary assessment seed so routine seed runs cannot overwrite later
  manual admin changes;
- writes the reconcile delta, operator, source, benchmark version, effective date, and active template version
  to `AuditLog` in the same transaction as the benchmark mutation;
- exposes Scaling Up Full through the existing peer editor and audited save route for manual or annual
  maintenance; and
- keeps the DB-backed Wave S `PEER_RENDER_ENABLED_ALIASES` LVA-only until the approved Scaling Up Full
  paired-bar report UI ships. `PEER_EDITOR_ENABLED_ALIASES` is the separate configuration gate; the legacy
  Scaling Up Full report continues rendering the canonical static values independently of that Wave S gate.

The existing static Scaling Up Full domain, section, question, and ScaleUp-score benchmark remains the current
report source. This amendment governs its question data and adds the table/editor foundation; it does not
change the report layout. Deploying code alone does not populate table rows: the explicit audited refresh is
a post-deploy operator step.
