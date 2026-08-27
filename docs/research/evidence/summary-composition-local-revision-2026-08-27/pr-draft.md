# Local PR draft — not submitted

Proposed title: `feat(assessments): add summary reporting foundation and Scaling CEO Full`

Base: `main`. Head: `codex/summary-reporting-tracer` after integration and validation.
Current status: **blocked by integration and repository-wide test gates**.

## Summary

- Add the shared Summary Reports lifecycle on admin and coach campaign screens,
  exposing Scaling CEO Full as the first enabled report type.
- Preserve explicit completed-submission composition, ordered CEO/Team roles,
  frozen report inputs/artifact identity, same-command deduplication, authorization
  and immutable storage.
- Use the locally approved Esperto-style two-column composition: compact sources,
  search/current-all scope, bulk selection and transfer, CEO/Team boxes, clear/remove,
  explicit pending-selection validation, mobile scrolling and accessible provenance.
- Keep the legacy report route and flag-off behavior. Other report variants and
  placeholders are not implemented by this PR.

## Verified locally

- [x] User approved the revised local composition visual.
- [x] Scoped review findings corrected and independently rechecked.
- [x] 83 targeted Jest tests pass.
- [x] Five real local Chromium lifecycle/security/concurrency tests pass.
- [x] Changed-file ESLint, 43-migration safety check and Turbopack build pass.
- [ ] Integrate current main and resolve eight merge conflicts.
- [ ] Full repository test gate passes in the required isolated environment.
- [ ] Protected PR checks pass on the final integrated candidate.

## Deployment boundary

**Not production-approved.** Leave global Summary Reporting off and canary empty.
Dedicated private Blob and distributed rate-limiter verification are still required;
local tests simulate Blob transport. No invitations, customer-data mutation or live
configuration change was part of this release-preparation gate.

See `release-readiness.md` for exact run evidence, known baseline failures, mobile
host limitations, artifact identity and the next integration gate. Do not mark this
draft ready for merge based only on the focused green checks.
