# Final whole-branch remediation report

## Status

All final whole-branch review cycle-1 findings are remediated and committed locally.
No release, lifecycle, database, remote, deployment, Production, or communications
action was performed.

- Remediation base: `7010c528bddb670eca837d57b918da87ec390376`
- Implementation commit: `3e18f25094e66dcf09f161b4f423565e98550b6b`
- Verified source commit: `ae561d1f9e59e10f13e002615dc6564722cc8e8d`
- Subjects: `fix: close frozen peer review findings`; `test: use canonical peer report fixture`
- Branch: `codex/su-full-esperto-landscape-closeout-wording`

## Findings closed

### 1. Exact same-report presentation integrity

`isSuFullPeerPresentationForReport` still validates the untrusted presentation's
internal shape first. It then calls the pure
`buildSuFullPeerPresentationResult({ report })` builder and compares the supplied and
expected presentations with a browser-safe exact structural comparison. The builder
does not call the same-report validator, so there is no recursion.

This binds all report-derived fields at once: provenance, peer values, You values,
frozen recommendations, question labels, section keys/labels/domains, section and
question order, and totals. It validates only. It neither repairs the presentation
nor substitutes catalogue values at revival.

Direct-helper and `reviveOnScreenReport` tests each forge an internally coherent Q01
You value (with a matching total), recommendation, question label, and section
domain. Every forgery is rejected and revival drops only the optional enhancement.

### 2. Truthful disclosure with one owner

`su-full-peer-disclosure.ts` now owns one typed disclosure model for both report
surfaces. Governed reports retain exactly:

> Peers are a governed benchmark snapshot selected by organizational phase and frozen
> when this result was scored. This is not an industry-, geography-, or cohort-matched
> comparison.

Historical reports use exactly:

> Peers use the governed historical baseline for reports scored before phase-aware
> peer snapshots were frozen. This is not an industry-, geography-, or cohort-matched
> comparison.

The same helper owns exact provenance formatting:

- `Phase P<n> · <sourceId>` for governed snapshots;
- `Legacy baseline · <sourceId>` for historical fallback.

The generic comparison and landscape report both consume that model. Component,
landscape-render/model, real-browser, and PDF-text assertions prove legacy output
contains neither the governed sentence nor its phase-selected/frozen-scoring claim.

### 3. Catalogue determinism and test quality

The duplicate-row mutation now asserts that its exact governed source row exists
before appending it. The deterministic test renders from the committed CSV and
compares the output directly to the checked-in generated TypeScript module, while
the CLI regeneration/diff gate independently proves repository cleanliness.

### 4. Full five-phase regression contract

Catalogue tests now independently pin:

- canonical keys Q01-Q61 for every explicit P1-P5 vector;
- baseline hash `fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd`
  for P1/P2/P3/P5;
- delegation hash `ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff`
  for P4;
- equality of P1/P2/P3/P5;
- exactly 56 P3-to-P4 changes;
- exactly five unchanged keys: Q27, Q30, Q38, Q41, Q57; and
- exactly 56 P4-to-P5 reversions with the same changed-key identity.

The scoring table now compares every frozen 61-value result vector for P1-P5 to its
selected governed vector, in addition to pinning provenance and Q01 examples.

### 5. Valid zero handling

The generator template now distinguishes missing from zero with `=== undefined`.
The RED generator test renders a controlled vector with Q01 equal to zero and proves
the generated helper uses the zero-safe guard. The CLI regenerated the checked-in
module; repeated generation is byte-identical.

## TDD evidence

### Cross-object integrity and disclosure RED

```bash
npx jest \
  src/__tests__/lib/assessments/su-full-peer-presentation.test.ts \
  src/__tests__/lib/assessments/onscreen-result-store.test.ts \
  src/__tests__/components/assessments/su-full-peer-render.test.tsx \
  src/__tests__/lib/assessments/su-full-landscape-render.test.tsx \
  src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  --runInBand
```

Before production changes: exit `1`, **5 suites failed, 11 tests failed, 89 passed**.
The failures were the eight accepted direct/revival forgeries and three legacy-copy
surfaces. After implementation: exit `0`, **5/5 suites and 100/100 tests passed**.

### Zero-value RED

```bash
npx jest \
  src/__tests__/lib/assessments/su-full-phase-peer-catalogue.test.ts \
  src/__tests__/lib/assessments/scoring.test.ts \
  --runInBand
```

Before the generator change: exit `1`, **1 test failed and 91 passed**, because the
rendered helper retained its truthiness check. After the fix and regeneration: exit
`0`, **2/2 suites and 92/92 tests passed**.

## Integration evidence

The Task 1-6 14-suite integration set passed **14/14 suites, 508/508 tests, 0
snapshots**. This includes both generic and landscape component coverage in addition
to the exact Task 7 list.

## Final post-cast verification chain

An intermediate Turbopack run exposed one compile-only diagnostic at the untrusted
report cast in `su-full-peer-presentation.ts`. The explicit `unknown` boundary was
added and committed. The complete required chain was then rerun from `src/` on the
final code tree at `ae561d1f9e59e10f13e002615dc6564722cc8e8d`.

### Exact Task 7 test set

The exact 12 paths from Task 7 passed **12/12 suites, 489/489 tests, 0 snapshots** in
8.785s. Expected submit-suite console output exercised existing negative paths; Jest
reported zero failures.

### Generation and committed diff

```bash
npm run generate:scaling-up-full-phase-peers
git diff --exit-code -- src/lib/assessments/su-full-phase-peer-catalogue.ts
```

Both exited `0`; the diff emitted no output. A separate two-run `cmp` check also
exited `0`.

### Full changed-path ESLint

ESLint covered all 14 changed TypeScript/TSX production and test paths from the
remediation base through the verified source commit. It exited `0` with zero
diagnostics.

### Migration and production build

```bash
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

- migration safety: exit `0`, all **49 migrations** approved;
- Turbopack: exit `0`, compiled in 83s, passed TypeScript, and generated **95/95**
  static pages.

The build retained only the established non-fatal workspace-root/multiple-lockfile,
middleware-deprecation, missing local Inngest-key, and missing local `DATABASE_URL`
diagnostics.

### Additional whole-repository completion check

An additional `npm test -- --runInBand` check was run after the required chain. It
passed **765/766 suites, 9,384/9,385 tests, and 16/16 snapshots** and exposed one
older component test that attached a complete peer presentation to an unrelated,
partial Rockefeller report fixture. The stricter same-report validator correctly
rejected it. The test was changed to use the existing complete canonical Scaling Up
Full report fixture and then passed **1/1 suite, 28/28 tests**. Because the finding
was in test setup rather than production code, the complete required final chain was
rerun on the resulting commit as recorded above.

The final post-fix repository-wide rerun then passed **766/766 suites,
9,385/9,385 tests, and 16/16 snapshots** in 696.331s.

## Rulings and costs

- Rebuilding the expected presentation avoids a second manually maintained binding
  checklist. Cost: untrusted revival/UI validation performs one deterministic
  61-question reconstruction and structural comparison.
- Exact structural comparison is key-order-insensitive for objects but array-order-
  sensitive and rejects extra fields. Cost: a future intentional presentation schema
  extension must update both builder and validator together.
- Legacy and governed disclosure copy share one typed selector rather than one visual
  component because the generic and landscape markup/classes differ. Cost: each
  renderer retains its own small wrapper element while wording and provenance cannot
  drift.
- Phase tests use the governed production catalogue as scoring input, while literal
  hashes, canonical identities, transition counts, and unchanged keys independently
  pin the evidence contract. Cost: intentional catalogue replacement requires an
  explicit evidence-backed test update.
- The zero regression checks generated output because the audited current vectors do
  not contain zero. Cost: it pins the generated guard shape; benefit: it directly
  protects the previously defective template output.

## Release boundary

```text
Implementation: local branch only
Push: not authorized
PR: not authorized
Draft creation/publication: not executed
Deploy/activation/production mutation: not executed
```

No push, PR, lifecycle script, draft, publication, deployment, activation, database
action, Production mutation, or external communication occurred. The existing eight
post-local stop conditions remain in force.
