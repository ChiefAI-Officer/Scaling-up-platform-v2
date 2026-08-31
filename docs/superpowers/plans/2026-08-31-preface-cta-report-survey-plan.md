# Preface and CTA report survey implementation plan

**Goal:** Deliver Jeff's all-report survey and safely expand closing-message customization without changing report scope or production data.

**Spec:** `docs/superpowers/specs/2026-08-31-preface-cta-report-survey-design.md`

## 1. RED: encode the new closing boundary

- Update sanitizer unit expectations so a 24-estimated-line conclusion is accepted and 25 is rejected.
- Update the physical browser matrix to exercise 24 estimated lines in the fixed Scaling Up Full conclusion region.
- Keep explicit coverage for the conclusion table composition whose previous failure message named 16.
- Run the focused tests and record the expected failures against the 16-line implementation.

## 2. GREEN: raise only the governed limit

- Change `REPORT_HTML_LIMITS.conclusion.estimatedLines` from 16 to 24.
- Update test fixture metadata and expectations; do not change any other sanitizer limit or report layout.
- Run sanitizer and physical browser tests until green.

## 3. Verify every report surface

- Run individual report-section and report-style suites.
- Run invited loader, public quiz loader/client, group report, and email-report suites.
- Confirm supported browser/print paths carry authored content and intentionally unsupported group/email paths remain unchanged.

## 4. Full gates and review

- Run ESLint on changed TypeScript/TSX files.
- Run `CI=true npm run build` from `src/`.
- Run migration safety if required by the repository gate.
- Review the branch against `origin/main`, fix actionable findings, commit, push, open a PR, and complete the review loop.

## 5. Report product follow-up separately

- State that the mini quiz is pinned to an older version without the authored content.
- Do not repin it. Record that choosing a newer version is a separate authorized production-data operation.
- Include the complete surface survey and the two unrecoverable clipped clauses in the PR/report.
