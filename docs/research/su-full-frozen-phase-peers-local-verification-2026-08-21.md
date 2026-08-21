# Scaling Up Full frozen phase-aware Peers local verification receipt

- Receipt date: 2026-08-21
- Branch: `codex/su-full-esperto-landscape-closeout-wording`
- Task 7 base commit: `88e85050c542a6da730624491567872b4a8b06ad`
- Verified source commit before this receipt: `58e919efe52bcfa30cb431619fcdc3233210170f`
- Design: `docs/superpowers/specs/2026-08-21-su-full-frozen-phase-peers-design.md`
- Plan: `docs/superpowers/plans/2026-08-21-su-full-frozen-phase-peers.md`

## Result

The frozen phase-aware Peers implementation is verified on the local branch. Future
governed, report-eligible Scaling Up Full CEO results freeze the exact phase-selected
peer value for every governed question plus source/hash/phase provenance. New report
rendering validates and consumes only that frozen result. Historical results with no
snapshot retain the executable 2026-08-14 baseline; corrupt declared snapshots fail
closed. This receipt does not authorize or record a release.

## Evidence counts and audited fingerprints

| Evidence | Verified value |
| --- | --- |
| Source matrix rows | `3355` |
| Phase/score reports | `55` |
| Governed questions per vector | `61` |
| Phase-peer records in the combined edition | `305` |
| P1/P2/P3/P5 baseline fingerprint | `fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd` |
| P4 delegation fingerprint | `ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff` |

The compiler test reads
`docs/research/esperto-feedback-five-phase-full-matrix-2026-08-20.csv`, requires all
3,355 rows and 55 reports, resolves exactly 61 stable keys for each explicit phase,
and proves the score-invariant vectors against the two audited fingerprints. The
combined forward-only edition requires exactly 305 phase/question values. No draft
was created to obtain these counts.

## Fresh command evidence

All commands ran from `src/` on the tree committed as
`58e919efe52bcfa30cb431619fcdc3233210170f`. The first build exposed compile-only
Task 5 validator defects before any source-of-truth edit: a dynamically generated
`string` key was passed to a literal-keyed legacy map, then the compiler exposed a
lost `Array.isArray` narrowing after aliasing untrusted `perQuestion`. The final
source makes the legacy map explicitly `Map<string, number>` and narrows the local
alias before use. These are type-only corrections; validator decisions and peer data
are unchanged.

### Targeted regression set

```bash
npx jest \
  src/__tests__/lib/assessments/su-full-phase-peer-catalogue.test.ts \
  src/__tests__/lib/assessments/scoring.test.ts \
  src/__tests__/lib/assessments/compute-score-result.test.ts \
  src/__tests__/lib/assessments/su-full-phase-feedback-edition.test.ts \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/lib/assessments/respondent-report.test.ts \
  src/__tests__/lib/assessments/onscreen-result-store.test.ts \
  src/__tests__/lib/assessments/su-full-peer-presentation.test.ts \
  src/__tests__/lib/assessments/peer-report-resolver.test.ts \
  src/__tests__/components/assessments/su-full-landscape-browser.test.tsx \
  src/__tests__/lib/assessments/su-full-landscape-report.test.ts \
  src/__tests__/lib/assessments/su-full-landscape-render.test.tsx \
  --runInBand
```

Exit `0`: **12/12 suites passed, 479/479 tests passed, 0 snapshots** in 12.029s.
The submit suite's console output exercises expected negative paths; Jest reported
zero failed suites and zero failed tests.

### Deterministic catalogue regeneration

```bash
npm run generate:scaling-up-full-phase-peers
```

Exit `0`.

```bash
git diff --exit-code -- src/lib/assessments/su-full-phase-peer-catalogue.ts
```

Exit `0`, no output. The generated module remained byte-identical to the committed
module.

### Exact changed-path ESLint gate

```bash
npx eslint \
  src/lib/assessments/su-full-phase-peer-catalogue-generator.ts \
  src/lib/assessments/su-full-phase-peer-catalogue.ts \
  scripts/generate-su-full-phase-peer-catalogue.ts \
  src/lib/assessments/scoring.ts \
  src/lib/assessments/compute-score-result.ts \
  src/lib/assessments/su-full-phase-feedback-edition.ts \
  'src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  src/lib/assessments/su-full-question-benchmarks.ts \
  src/lib/assessments/su-full-peer-presentation.ts \
  src/lib/assessments/peer-report-resolver.ts \
  src/components/assessments/su-full-landscape/SuFullLandscapeReport.tsx \
  src/components/assessments/su-full-landscape/SuFullLandscapeCharts.tsx
```

Exit `0`, zero diagnostics.

### Migration safety

```bash
node scripts/check-migration-safety.mjs
```

Exit `0`: **49 migrations** checked; no unapproved destructive operations.

### Production-equivalent build

```bash
CI=true npx next build --turbopack
```

Exit `0`: compiled successfully in 17.9s, TypeScript passed, and **95/95** static
pages generated. The established non-fatal diagnostics were the inferred workspace
root/multiple lockfiles, deprecated middleware convention, absent local Inngest keys,
and absent local `DATABASE_URL` during static data collection.

## Browser, PDF, and typed report evidence

Task 6 used the Playwright-backed Jest harness at
`src/src/__tests__/components/assessments/su-full-landscape-browser.test.tsx` with
`SU_FULL_LANDSCAPE_VISUAL_ARTIFACTS=1`. It inspected:

- P3, P4, P5, and historical dashboard page 6 at desktop `1280x720`;
- P3, P4, P5, and historical detail page 8 at desktop `1280x720`, mobile
  `390x844`, and print sizes;
- corrupt/stale-presentation fallback at desktop, mobile, and print sizes; and
- temporary P3, P4, P5, and historical A4-landscape PDFs.

Standard PNG artifact names were produced under the temporary local path
`src/tmp/screenshots/su-full-phase-peers/`, including
`{p3,p4,p5,historical}-{desktop-page-6,desktop-page-8,mobile-page-8,print-page-8}.png`
and `corrupt-{desktop,mobile,print}.png`. PDFs were created in a temporary
`su-full-phase-peer-browser-*` directory as `{p3,p4,p5,historical}.pdf`.

The inspected output retained the approved question -> You/Peers bars -> Frozen
feedback order, had no horizontal overflow, used one mobile detail column, showed P4
Q01 as 6.6 and P3/P5/historical Q01 as 6.3, and reported exactly 26 pages for all
four valid PDFs. Corrupt input rendered the classic fallback with no landscape peer
sequence, disclosure, or provenance. All 27 detail-card contrast samples met the
test's 3:1 non-text and 4.5:1 numeric-value thresholds.

The PNGs and PDFs were inspection artifacts, removed after Task 6 review, and are
not claimed as durable repository files. Durable evidence is the typed browser test,
Task 6 report at
`.superpowers/sdd/2026-08-21-su-full-frozen-phase-peers/task-6-report.md`, and this
receipt.

## Rulings and costs

- Scaling Up Full Peers and Feedback remain distinct: Feedback varies by score and
  phase, while Peers selects one score-invariant governed vector by phase. The cost
  is explicit five-phase metadata and 305 frozen edition values.
- P1/P2/P3/P5 explicitly map to the baseline fingerprint rather than relying on a
  default. The cost is duplicated phase assignment metadata; the benefit is a
  fail-closed P4 -> P5 return.
- New reports validate but never repair frozen peer snapshots. Historical reports
  alone use the executable baseline. The cost is omission of Peers for corrupt new
  data rather than a superficially complete but false comparison.
- Layout A repeats concise disclosure/provenance on peer-bearing pages so printed
  pages remain self-describing. The cost is a compact subordinate disclosure block;
  the verified 26-page contract remains unchanged.
- The Task 7 build correction widened only internal map typing and restored local
  untrusted-array narrowing. It changes neither data nor runtime decisions, but it
  was required for the production compiler to accept the Task 5 validator.

## Five-state release ledger

```text
Implementation: local branch only
Push: not authorized
PR: not authorized
Draft creation/publication: not executed
Deploy/activation/production mutation: not executed
```

Neither guarded lifecycle script ran. No database, assessment version, published
edition, campaign pin, historical result, Production or Esperto record, deployment,
environment value, Slack message, or email was read, created, sent, or changed.

## Remaining stop conditions

This receipt authorizes no later gate. The implementation must stop locally until
separate authorization is obtained for, in order:

1. independent whole-diff standards and spec-compliance reviews;
2. push and PR creation;
3. required hosted Build and Migration Safety Gate checks;
4. combined governed draft creation;
5. human review of the exact draft receipt and approved content hash;
6. publication without repinning historical campaigns;
7. deploy and activation; and
8. mail-disabled Production smoke for P3, P4, P5, historical, and corrupt-snapshot
   handling.

Each stage requires its own receipt and explicit authority. A green local build or
approved PR does not authorize draft creation, publication, deploy, activation, or
Production mutation.
