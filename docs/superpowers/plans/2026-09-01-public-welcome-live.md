# Public Welcome unedited-baseline correction plan

**Fixed point:** `6f24ee6872f6b693700e279e602feaf1d2e8d5a6`

1. RED: add the exact schema-v1 migration baseline and prove the Public resolver
   seam does not yet exist; then normalize v1→v2 before canonical alias comparison.
2. RED: prove the current Public page passes an untouched v1 backfill as authored
   invited copy; route that call site through the resolver and restore no-override.
3. Cover schema-v2 seed baselines, generic and alias-specific baselines, single-field
   edits, and absent/malformed values at the resolver seam.
4. Cover the standing public disclosure, fine print, Campaign description, and exact
   absence of invited wording; retain the edited-template renderer case.
5. Guard the invited API's immutable campaign-snapshot behavior without changing it.
6. Amend the existing design, glossary, ADR-0033 PUBLIC clause, and SoT in the same PR.
7. Run focused suites, refactor only after green, then run changed-file ESLint,
   migration safety, exact `CI=true npm run build`, and repository-required tests.
8. Review from the fixed point on both
   standards and specification axes, commit, push, and open a protected-branch PR.
