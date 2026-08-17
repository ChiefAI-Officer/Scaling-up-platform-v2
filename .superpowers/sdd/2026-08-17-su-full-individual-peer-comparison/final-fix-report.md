# SU Full individual peer comparison: final review fix report

Date: 2026-08-17

Branch: `codex/su-full-individual-peer-ui-design`

Fixed review point: `8324b20ee899420e65c4dcd265d95f6a3ac6155a`

Scope: Tasks 1-6 only. Task 7 activation, push, deployment, Production access,
benchmark mutation, and every other external mutation remained excluded.

## Outcome

This one final-fix wave closes every whole-branch review finding:

1. Resolver builder/dispatch exceptions now fail soft. The core resolver catches
   unexpected LVA or SU Full builder exceptions, returns the original report,
   and emits one bounded warning containing `reason`, identifiers, counts when
   applicable, and `errorName` only. Campaign and submission wrappers await
   delegated resolution inside their catchable region. A narrow injected
   resolver seam exists only to prove wrapper rejection interception; the
   production default remains `resolvePeerReportEnhancements`.
2. Session JSON revival no longer trusts `suFullPeerPresentation`. Runtime
   validation requires an ISO benchmark timestamp, non-empty/unique valid
   sections, canonical Q01-Q61 exactly once and in order, non-blank labels,
   finite `[0, 10]` You/Peers values, valid recommendation values, and section
   totals equal to the defined one-decimal sum contract. Invalid enhancement
   data becomes `undefined`; the original report remains available for Classic
   fallback. No peer recomputation, benchmark read, or envelope-version change
   was added.
3. Overview collections and rows now use native `ul`/`li` semantics. Scoped
   `.su-report .su-peer-overview-list` CSS resets margin, padding, and list
   markers without changing the existing grid, responsive, or print rules.
4. The presentation model test now pins both section totals directly:
   `28 / 45.7` and `262 / 307.1` for You / Peers.

## TDD evidence

All commands below ran from `src/` unless noted.

### RED: resolver fail-soft behavior

```bash
npx jest src/__tests__/lib/assessments/peer-report-resolver.test.ts --runInBand --silent
```

Result: exit `1`; 1 suite failed, 4 tests failed, 20 passed. Both injected
builder exceptions rejected instead of resolving to the unchanged report, and
both ID wrappers ignored the rejecting delegate rather than intercepting it.

### RED: untrusted optional session payload

```bash
npx jest src/__tests__/lib/assessments/onscreen-result-store.test.ts --runInBand --silent
```

Result: exit `1`; 1 suite failed, 10 tests failed, 25 passed. Malformed,
missing-sections, empty, incomplete, stale-key, invalid-date, out-of-range,
wrong-total, blank-label, and invalid-recommendation presentations all survived
revival when each should have been stripped.

### RED: accessibility and renderer fallback

```bash
npx jest src/__tests__/components/assessments/su-full-peer-render.test.tsx --runInBand --silent
```

Result: exit `1`; 1 suite failed, 2 tests failed, 6 passed. Testing Library
could not find a native `list`, and an empty revived peer payload suppressed
the generic Classic sections/recommendations.

### Coverage-only total assertions before production edits

```bash
npx jest src/__tests__/lib/assessments/su-full-peer-presentation.test.ts --runInBand --silent
```

Result: exit `0`; 15/15 tests passed. The new literal total assertions cover the
already-defined builder behavior and did not require a production behavior
change.

### GREEN: individual regression seams

```bash
npx jest src/__tests__/lib/assessments/peer-report-resolver.test.ts --runInBand --silent
npx jest src/__tests__/lib/assessments/onscreen-result-store.test.ts --runInBand --silent
npx jest src/__tests__/components/assessments/su-full-peer-render.test.tsx --runInBand --silent
npx jest src/__tests__/components/assessments/org-survey-onscreen-results.test.tsx --runInBand --silent
```

Results:

- resolver: 24/24 tests passed;
- on-screen store: 35/35 tests passed;
- SU Full renderer: 8/8 tests passed; and
- invited on-screen client: 28/28 tests passed after replacing its old empty
  placeholder with the canonical complete presentation fixture.

## Final focused matrix

```bash
npx jest \
  src/__tests__/lib/assessments/su-full-peer-presentation.test.ts \
  src/__tests__/lib/assessments/peer-report-resolver.test.ts \
  src/__tests__/lib/assessments/peer-benchmarks.test.ts \
  src/__tests__/components/assessments/su-full-peer-render.test.tsx \
  src/__tests__/components/assessments/branded-report.test.tsx \
  src/__tests__/components/assessments/report-style-renderers.test.tsx \
  src/__tests__/components/assessments/wave-s-peer-render.test.tsx \
  src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx \
  src/__tests__/app/assessment-respondent-report-page.test.tsx \
  src/__tests__/app/public-submission-report-page.test.tsx \
  src/__tests__/app/org-survey/submit-onscreen-results.test.ts \
  src/__tests__/lib/assessments/onscreen-result-store.test.ts \
  src/__tests__/components/assessments/org-survey-onscreen-results.test.tsx \
  src/__tests__/assessments/report-email.wave-s-guard.test.ts \
  --runInBand --silent
```

Result: exit `0`; 14/14 suites, 328/328 tests, and 1/1 snapshot passed.

The first matrix attempt was intentionally not hidden: it found one legacy
test fixture with `sections: []`, now invalid by contract. That attempt was
13/14 suites and 327/328 tests. The fixture was replaced with the real complete
builder output, its individual suite passed 28/28, and the entire matrix above
was rerun clean.

Full Jest was not repeated because the parent task explicitly allowed the
focused matrix plus build after Task 6's existing full-suite receipt, and this
fix remained narrow.

## Static and build verification

### Changed-file ESLint

```bash
npx eslint \
  src/lib/assessments/peer-report-resolver.ts \
  src/lib/assessments/onscreen-result-store.ts \
  src/lib/assessments/su-full-peer-presentation.ts \
  src/components/assessments/SuFullPeerComparison.tsx \
  src/__tests__/lib/assessments/peer-report-resolver.test.ts \
  src/__tests__/lib/assessments/onscreen-result-store.test.ts \
  src/__tests__/lib/assessments/su-full-peer-presentation.test.ts \
  src/__tests__/components/assessments/su-full-peer-render.test.tsx \
  src/__tests__/components/assessments/org-survey-onscreen-results.test.tsx
```

Result: exit `0`, zero output, zero warnings/errors.

### TypeScript context

```bash
npx tsc --noEmit
```

Result: exit `2` on the repository's pre-existing broad TypeScript baseline,
including unrelated lower-target BigInt literals and many historical test mock
shape errors. Filtering the same output for every changed TypeScript basename
returned no matches. The authoritative Next production build's TypeScript phase
then passed.

### Migration safety and whitespace

```bash
node scripts/check-migration-safety.mjs
git diff --check
```

Results: exit `0`; 47 migrations checked with no unapproved destructive
operations, and the diff has no whitespace errors.

### Production Turbopack build

```bash
CI=true npx next build --turbopack
```

Result: exit `0`; compiled successfully, TypeScript passed, and 94/94 static
pages generated. Local-only warnings were limited to the existing middleware
deprecation, absent Inngest keys, and absent `DATABASE_URL` during optional
static data reads; none prevented the successful build.

## Files changed

- `src/src/lib/assessments/peer-report-resolver.ts`
- `src/src/__tests__/lib/assessments/peer-report-resolver.test.ts`
- `src/src/lib/assessments/su-full-peer-presentation.ts`
- `src/src/lib/assessments/onscreen-result-store.ts`
- `src/src/__tests__/lib/assessments/onscreen-result-store.test.ts`
- `src/src/components/assessments/SuFullPeerComparison.tsx`
- `src/src/styles/su-report.css`
- `src/src/__tests__/components/assessments/su-full-peer-render.test.tsx`
- `src/src/__tests__/components/assessments/org-survey-onscreen-results.test.tsx`
- `src/src/__tests__/lib/assessments/su-full-peer-presentation.test.ts`
- this report

## Self-review against `8324b20e`

- Standards: no actionable finding. The diff is limited to the reviewed seams,
  uses existing structured telemetry, keeps validation pure, preserves test
  fixtures through real production builders, and leaves all CSS scoped.
- Spec: no actionable finding. Invalid optional enhancement data fails closed
  to the original report, all 61 canonical keys are mandatory, feedback is not
  recomputed, the DB is not queried during revival, and list semantics now meet
  the accepted accessibility requirement.
- Privacy: telemetry assertions require exact bounded objects and explicitly
  reject a `message` field. No respondent answer, name, email, or error message
  is logged by the new paths.
- Dark launch: `git diff --exit-code 8324b20e --
  src/src/lib/assessments/peer-benchmarks.ts` passed. The production render list
  still contains LVA only; Scaling Up Full remains editor-only and dark.
- Scope: no Task 7 file, environment, Production, deployment, push, or external
  state was changed.
- Source of Truth: `CLAUDE.md` and `plans/CHANGELOG.md` were not edited because
  their dark/not-deployed/not-activated claims remain truthful; this fix adds no
  release or activation claim.

Planned cohesive commit subject:
`fix(assessments): harden SU Full peer report fallback`
