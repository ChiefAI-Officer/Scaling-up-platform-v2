# Single scoped final re-review — Summary Reporting tracer

Date: 2026-08-27. Branch: `codex/summary-reporting-tracer`.

Reviewed fix: `5d2a23bcb6c857a316c7a24314ddf1a7647ca719..bc12913a493a6a141a04bade2584f15d3e45d4c1` (one commit).

**Verdict: all eight original findings ADDRESSED; no new fix-diff defects found. Ready for the next separately authorized gate, not for global enablement or a launch claim.**

Counts: **8/8 addressed · 0 not addressed · 0 new Critical · 0 new Important · 0 new Minor.** This is the single bounded re-review, not another whole-branch review. The actual-output approval and live infrastructure gates remain open.

## Scope and method

Read `final-rereview-brief.md` first, then the complete fix brief/integration ruling, original I1–I4/M1–M4 statements, global constraints, and implementer fix report. Read the supplied 1,899-line fix package, affected spec sections, and only the unchanged dependencies needed to evaluate concrete fix risks. Verified HEAD/base and the one-commit range; product worktree/index/branch were clean and unchanged. No subagents, test-suite/build reruns, service provisioning, customer data, or external mutations. This report is the only file written by this reviewer.

Code-review and agent-watchdog guidance informed contract/evidence checking; PDF guidance prompted direct raster inspection; API-docs guidance prompted checking installed sharp/Prisma contracts and sharp's official input/output documentation. No skill was used to expand the implementation scope.

## Original findings

### I1 — ADDRESSED: uncertain commit must retain the artifact

[create.ts:653](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/lib/assessments/summary-reports/create.ts:653) tracks successful completion of the write callback, setting the marker only after report, source and audit operations finish at line 726. The catch at line 735 deletes only when that marker is false. After callback success, failed or empty reconciliation leaves the private bytes intact; there is no inference that an empty read proves rollback. The early invalid/recheck returns write no report and are safely cleaned up.

[create.ts:428](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/lib/assessments/summary-reports/create.ts:428) still checks request ownership (actor, destination, type) and current destination authorization. The initial lookup and reconciliation share this boundary. Unique-request losers reject inside the callback, clean their own randomized artifact, then use that same authorized lookup. Unrelated integrity failures are not treated as request collisions.

[create.test.ts:337](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/__tests__/lib/assessments/summary-reports/create.test.ts:337) covers lost acknowledgement, empty/failed reconciliation, later same-UUID recovery and revoked authorization. Existing definite rollback/source-change cases at lines 898/922 and unique-loser cases at line 961 remain. Rare retained private orphans are the explicit controller-approved cost, not a missing cleanup fix.

### I2 — ADDRESSED: frozen tier policy

[scaling-ceo-full-document.tsx:653](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/lib/assessments/summary-reports/renderers/scaling-ceo-full-document.tsx:653) requires `snapshot.reportModel.showTier` as well as a computed tier. Computed tier/scoring data are not removed. [PDF tests:280](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/__tests__/lib/assessments/summary-reports/scaling-ceo-full-pdf.test.tsx:280) exercise actual rendered PDF text for false and true policy, retaining peer standing and the provisional disclosure.

Personally inspected the current tier-suppressed raster: CEO 66, Team unavailable, peers 53.1, standing +12.9 and disclosure remain, with no tier. Direct text extraction of both existing final PDFs also found no `CEO tier`, eight page labels and the benchmark disclosure. The [current evidence record:3](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/docs/research/evidence/summary-reporting-final-fix/README.md:3) expressly supersedes the tier-bearing evidence and old fidelity PASS.

### I3 — ADDRESSED: real errors and stale-scope refresh

[SummaryReportWizard.tsx:101](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/components/assessments/SummaryReportWizard.tsx:101) reads `errors[]`, uses allowlisted safe messages, and obtains source identity only from already-selected metadata. Any `source_unavailable` entry overrides the entire response with a generic message, ignoring supplied identifiers/names/messages. Unknown/malformed envelopes use the generic fallback. The producer checks source-campaign authorization before source-state feedback; the client does not invent an authorization grant.

[SummaryReportWizard.tsx:401](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/components/assessments/SummaryReportWizard.tsx:401) clears both cached scopes after conclusive 422 without clearing draft, candidate metadata, CEO or Team assignments. Returning to Composition triggers the existing fetch effect at line 216. Ambiguous retries retain their exact body/UUID and in-flight guards.

[wizard tests:279](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/__tests__/components/assessments/summary-report-wizard.test.tsx:279) use real removed/incomplete/incompatible envelopes and check specific feedback, retained assignment, fresh candidates and only one POST; line 310 covers concealed/malformed responses. Existing exact-retry and synchronous lock regressions remain at lines 411/474.

### I4 — ADDRESSED within the approved image-host boundary

[coach-image.ts:12](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/lib/assessments/summary-reports/coach-image.ts:12) restricts initial URLs to HTTPS public Vercel Blob hostnames, rejects credentials/nonstandard ports/arbitrary hosts and all redirects, bounds transport time/bytes, validates raster signatures, and uses sharp pixel/frame/processing/output limits. The final `finally` abort also closes responses rejected before body consumption. Normalized PNG bytes, SHA-256 and dimensions are frozen; failures return null without logging profile URLs/bytes. The 2-second sharp setting is a processing timeout, not an assertion about total wall-clock scheduling delay. Its documented behavior matches the chosen use. [Sharp input](https://sharp.pixelplumbing.com/api-constructor/), [sharp timeout/output](https://sharp.pixelplumbing.com/api-output/).

[create.ts:619](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/lib/assessments/summary-reports/create.ts:619) loads once outside either transaction. The original source hash still gates persistence at line 662; the augmented rendered snapshot/hash are persisted and audited. [Renderer:310](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/lib/assessments/summary-reports/renderers/scaling-ceo-full-document.tsx:310) restores subordinate coach image/name attribution under the Scaling Up footer identity and uses only frozen buffer bytes; cover attribution is restored at line 539. No stored profile URL is passed to the renderer, and artifact delivery remains unchanged.

[loader tests:10](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/__tests__/lib/assessments/summary-reports/coach-image.test.ts:10), [creation tests:312](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/__tests__/lib/assessments/summary-reports/create.test.ts:312), and [PDF tests:324](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/__tests__/lib/assessments/summary-reports/scaling-ceo-full-pdf.test.tsx:324) cover safe loading/fallback, augmented identity plus source recheck, actual embedded dimensions/attribution and no-brand fallback. The PDF subprocess also checks that rendering does not mutate the input. Real local proof changes the coach profile after creation and checks unchanged artifact/input identity.

Inspected actual image-present cover/provenance/appendix and name-only cover/provenance/score pages: coach attribution is present, subordinate and unobstructed in these samples. This is synthetic-image proof, not live-avatar proof. [Evidence:30](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/docs/research/evidence/summary-reporting-final-fix/README.md:30) accurately states that Circle/other external hosts degrade to name-only until a verified policy is separately approved.

### M1 — ADDRESSED: persisted contract coverage

[schema-contract.test.ts:33](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/__tests__/lib/assessments/summary-reports/schema-contract.test.ts:33) enumerates every report/source scalar field and requiredness, both enums, all three foreign-key relationships, inverse lists and exact migration delete/update actions. Existing unique/immutability tests remain. Real DB adapter assertions add field/timestamp/rollback coverage. No migration rewrite or historical-chain repair was introduced.

### M2 — ADDRESSED: exact visual deviations documented, acceptance still open

[Evidence:98](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/docs/research/evidence/summary-reporting-final-fix/README.md:98) accurately describes the inspected partial desktop native paint, absent top logo/toolbar/full-page proof, horizontal native-mobile clipping, and new-tab/download alternatives. Lines 104–108 explicitly record light flat `#6d58a8` versus the accepted dark-gradient cover, title/wrapping/spacing/top-strip/blue-accent differences, side-by-side bars and A4 density changes. The old PASS is superseded rather than repurposed as acceptance. These observations match the final rasters and preserved accepted comparison source.

### M3 — ADDRESSED: real 390px list-state evidence

[E2E:46](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/e2e/summary-reporting.spec.ts:46) resizes to 390×844, scrolls Summary Reports into view, checks the heading, trial-clicks the appropriate action and checks its viewport intersection, then takes the viewport capture before full-page capture. All four final images independently hash-match and are exactly 390×844. Empty/populated panels and relevant actions are in the captured area on both hosts. Admin action labels fit; coach labels/panel still clip horizontally. The populated admin heading has scrolled above the viewport. These limitations are explicitly recorded at [evidence:88](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/docs/research/evidence/summary-reporting-final-fix/README.md:88): trial click establishes reachability, not full-label fit or mobile readability. No host redesign is claimed.

### M4 — ADDRESSED: durable baseline after squash

[fixture:125](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/e2e/fixtures/summary-reporting.ts:125) now reads stable main ancestor `16d5a29c31c2db64e7f4d11c4053f4bb9f5d43db` and still applies the exact tracer SQL. Independently resolved both old/new schema objects to `f3d1b8a0d35e5277f37b8ee912f23e546e496d20`. The [runbook:35](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/docs/research/evidence/summary-reporting-local-proof/README.md:35) requires sufficient main history and continues disclosing the missing-`categories` historical-chain failure. No feature-only Git object remains necessary for that baseline.

## Integration discovery and newly changed code

**No new defect found in the exact-JSON INSERT, UTC mapping, collision handling or transaction boundary.**

- [create.ts:278](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/src/lib/assessments/summary-reports/create.ts:278) uses a static tagged `$queryRaw` statement, bound values, and canonical JSON text cast to `jsonb`; no unsafe query API, dynamic identifier, score rounding or raw-error logging was added by this adapter. All 19 report columns match the current schema. Omitted IDs receive an opaque UUID; supplied IDs are retained. Creation time has an explicit fallback; artifact time is required. SQL-null/JSON-null/ordinary optional manifests are handled separately. The seven explicit RETURNING fields match `SummaryReportListItem`.
- Both date parameters explicitly convert `timestamptz` to UTC before storage in the schema's timestamp fields. [E2E:145](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/e2e/summary-reporting.spec.ts:145) checks the actual persisted values, session `Asia/Manila`, and exact equality with frozen creation time. The fixture supplies a non-UTC session intentionally.
- Only `ON CONFLICT (creationRequestId) DO NOTHING` leads to the deliberate request-collision signal. The real DB cases at [E2E:242](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/e2e/summary-reporting.spec.ts:242) distinguish that from an artifact-path `P2010/23505`; other integrity failures propagate. The callback remains inside the existing repeatable-read transaction, with sources and audit written through the same transaction client. Lines 245–253 test rollback of all three after a deliberate exception.
- [E2E:155](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/e2e/summary-reporting.spec.ts:155) independently reconstructs the rendered source-plus-image input and asserts its hash, then reads `inputSnapshot::text`, parses/canonicalizes it and asserts the stored hash. This proves canonical JSON value identity, not byte-for-byte equality with PostgreSQL's whitespace/key formatting. Ordinary Prisma JSON-read identity is separately computed and **logged**, not asserted (lines 161–162). The report records `true` for that fixture; this is characterization, not a general Prisma-read guarantee or a substitute for the raw stored-value assertion.
- [E2E:355](/Users/diushianstand/Scaling-up-platform-v2/.worktrees/summary-reporting-tracer/src/e2e/summary-reporting.spec.ts:355) checks a real concurrent request pair, retry, and one report/source/audit/artifact. Inspected raw app output confirms 201/503 followed by 200, with a serialization rejection on the loser. No production authorization was weakened to obtain that result.

Standards axis: no new actionable documented-standard violations in the scoped diff. Spec axis: all eight findings and the binding integration ruling are satisfied. Explicit raw-column mapping maintenance remains a disclosed cost, not a reason to reopen the approved approach.

## Verification provenance and limits

Reviewer-executed, read-only checks:

- Verified exact commit/range, clean product status and `git diff --check` exit 0.
- Personally inspected all **13** promoted images, plus the accepted comparison image; independently checked all 13 PNG SHA-256 values and dimensions against the committed table.
- Independently hashed the existing actual-download PDF (`b0a097a7f213e13cd378fa9817cf88060fa652f7ab1301434e2cc5fb4de4c44f`) and Team-0 PDF (`2cef66b3d1cff875c65062db3c5dc636b0967a8f280bfb22d03b8cee01f8c1fd`); both match the record. Extracted text from both: no tier label, nine coach-attribution occurrences (cover plus eight footers), eight page labels and provisional disclosure. No rerender or PDF modification.
- Read the final loopback app log and Playwright `.last-run.json` (`passed`, no failed tests); these corroborate outcomes but do not replace individual assertion output.

Reviewed implementer records, **not reviewer-run suites or persisted raw runner stdout**: 20 named Jest suites/246 tests; legacy 4 suites/48 tests; headed Chromium 5/5; changed-file lint; migration safety 43 migrations; freshness 4/4. Reviewed test implementations against those claims. The main successful-image/browser case preceded the last rejected-response-body abort cleanup; the later restarted-server race exercised final code. Do not describe all five browser cases as one uninterrupted fresh run against the final loader bytes.

The [controller verification record](controller-verification.md) separately records fresh 3-suite/69-test success on final product code, and exact-commit credential-free Node20 Turbopack exit 0 (12.9s compile, TypeScript, 92/92 pages). It is explicitly a contemporaneous tool-output transcription, not a raw log file. That fresh build closes the implementer build-timing caveat after the final cleanup change. Expected lockfile/middleware/Inngest/missing-DATABASE_URL diagnostics are disclosed, not suppressed.

## Out-of-scope observations and next gate

No additional out-of-scope defect is asserted. Known limitations remain: rare retained uncertain private orphans; explicit INSERT mapping upkeep; historical migration-chain bootstrap failure; inherited coach mobile overflow; partial native PDF compositing; visible cover/bar/layout deviations; and unsupported external/Circle coach-image hosts. Closing M2/M3 means the evidence is accurate, not that those visual limitations are approved.

**Ready for the next separately authorized PR/infrastructure/Preview gate.** This review authorizes no push, merge, provisioning, deployment or flag change. Keep global enablement off and the canary empty until the relevant permission/gates are satisfied.

**Still NOT RUN / NOT APPROVED:** real dedicated-private-Blob privacy/provisioning, distributed Redis capacity/failure behavior, intended-environment migration/deployment and framing/CSP/CDN precedence, exact-campaign Preview canary, live external-avatar availability, and product-owner acceptance of actual final screens/PDF. Local proof cannot close these gates.
