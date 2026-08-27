# Scaling CEO Full renderer v1 visual review

Date: 2026-08-27

## Scope and durable evidence

- Accepted comparison source: `docs/research/evidence/platform-scaling-group-report-candidate-jeff-approved-2026-08-27-deidentified.png`.
- Accepted-source SHA-256: `0842e2816e965a9419b111018c2e5b3c4d330f823c5d8c3b8e28df58e64a6cee`.
- De-identification audit: `docs/research/evidence/platform-scaling-group-report-candidate-jeff-approved-2026-08-27-deidentified-audit.md`.
- Frozen Team-0 input: `src/src/__tests__/fixtures/summary-reports/scaling-ceo-full-snapshot.json`. Its committed JSON is reproduced exactly by the production Task 6 snapshot builder.
- Team-0 PDF: eight A4 portrait pages; SHA-256 `c17e145b2f33aef459fc3e5eb97dc318c6c98002849ac2f0a44a73e151b57994`.
- Team-2 PDF: eight A4 portrait pages; SHA-256 `6afbbcc58d20c23b4aacc04c5b3464c5bd5d3b7a7609de5eb42c089da5d180f5`.
- Team-50 PDF: ten A4 portrait pages; SHA-256 `64cd642576d86e10e7d2ddd1d4fd65c90e4bfede070cdbd55ec79f02f4e9eaf6`.

The PDFs and their complete raster sets were created in `src/tmp/pdfs/` for inspection and removed after verification, as required by the PDF workflow. The following representative 144-DPI rasters are committed so the review remains inspectable from a clean checkout:

| Tracked raster                                                                                                     | SHA-256                                                            |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `docs/research/evidence/summary-reporting-scaling-ceo-full-renderer-v1/team0-page-2-provenance-and-aggregates.png` | `11bae4b0373ebf336c901e206e064811d5b1b7ce4c0291b2a1d6462b96298fee` |
| `docs/research/evidence/summary-reporting-scaling-ceo-full-renderer-v1/team0-page-3-scaleup-and-disclosure.png`    | `7dd13494e3ce05fd755fb105b3922637c2c106264d002f9915b8e5495eb1ada0` |
| `docs/research/evidence/summary-reporting-scaling-ceo-full-renderer-v1/team2-page-4-question-comparison.png`       | `fc8143e25b341860ba0c7c954c0f9ac6087dae0bb538a127e565790f2ee977b3` |
| `docs/research/evidence/summary-reporting-scaling-ceo-full-renderer-v1/team50-page-8-appendix-start.png`           | `06a3f2c6de02df3b6c4af68197ed4506a6dbc68806de8c91fc5ea4a087c4c498` |
| `docs/research/evidence/summary-reporting-scaling-ceo-full-renderer-v1/team50-page-9-appendix-continued.png`       | `6bb2669fef7f000345b544e491857e9c6593c4ae5bda5618a480d691f15b92e3` |
| `docs/research/evidence/summary-reporting-scaling-ceo-full-renderer-v1/team50-page-10-appendix-final.png`          | `793e2c99ed6c7e901ac6c5df9462628e2608c6e229ccfb007900c79dd2dddbba` |

The comparison is structural and cosmetic, not a claim of pixel identity. The accepted source is one continuous browser report; renderer v1 is an immutable A4 artifact with deliberate page ownership and fixed artifact footers.

## Page-specific review

| Page/state         | Evidence observed                                                                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team 0, page 1     | The accepted hierarchy is preserved: local white Scaling Up logo, de-identified coach attribution, `Group Report`, `Your Scaling Up Full Assessment Report`, organization/team/date attribution, and a dominant purple cover. The locked orange top rule and blue accent are crisp. The title has no mid-word hyphen or clipping.             |
| Team 0, page 2     | The exact UTC creation timestamp, CEO, campaign, assessment/pinned version, and selected/completed/invited counts are visible. Section and Domain tables are separately labeled; CEO, Team, peer, gap, and CEO-vs-peer columns are unambiguous. Team-0 values are consistently `Not available`, never inferred from CEO.                      |
| Team 0, page 3     | The ScaleUp score cards show CEO `66`, Team `Not available`, peers `53.1`, CEO-vs-peers `+12.9`, and tier `Exemplary`. The exact peer benchmark version is visible with its provisional, single-Esperto-cohort, not-yet-size-matched disclosure. The unused space is intentional fixed-page composition, not missing content.                 |
| Team 0, pages 4–7  | All 61 frozen questions appear in stable order with purple CEO and orange peer values/bars. Team is explicitly `Not available`. Rows remain unsplit, continuation headings and column headers repeat, and the final ten-row page intentionally retains white space rather than changing row density. No label, bar, footer, or heading clips. |
| Team 0, page 8     | Appendix B shows the CEO domain row and no inferred Team member. The large remainder is intentional capacity in the explicit appendix page, not missing or clipped content.                                                                                                                                                                   |
| Team 2, page 2     | Synthetic Team averages and CEO-vs-Team gaps render independently across Section and Domain tables. Provenance reports `3 selected / 3 completed / 3 invited`.                                                                                                                                                                                |
| Team 2, page 3     | Team score `54` is legible beside CEO `66`, peers `53.1`, CEO-vs-peers `+12.9`, tier, and benchmark disclosure.                                                                                                                                                                                                                               |
| Team 2, pages 4–7  | CEO, Team, and peer question values/bars render side by side in purple, blue, and orange, including explicit zero values. All rows remain aligned and unsplit.                                                                                                                                                                                |
| Team 2, page 8     | Appendix B exposes only `CEO`, `Person 1`, and `Person 2`. Synthetic source names are absent from extracted PDF text. The table is legible and unclipped.                                                                                                                                                                                     |
| Team 50, page 2    | Provenance reports `51 selected / 51 completed / 51 invited`; the dense Section and Domain tables remain readable without collision or clipping.                                                                                                                                                                                              |
| Team 50, pages 4–7 | The complete question sequence retains CEO/Team/peer alignment and fixed footers. The smaller final chunk on page 7 intentionally preserves stable row height.                                                                                                                                                                                |
| Team 50, page 8    | Appendix B starts with `CEO`, then `Person 1` through `Person 19`. Privacy notice, heading, and column header are attached and rows do not split.                                                                                                                                                                                             |
| Team 50, page 9    | `Appendix B - Team Members (Anonymized) (continued)`, privacy notice, and column header repeat. The page contains exactly `Person 20` through `Person 39`.                                                                                                                                                                                    |
| Team 50, page 10   | The continued identity and column header repeat above exactly `Person 40` through `Person 50`. The remainder is intentional last-chunk whitespace; all rows and the `Page 10 / 10` footer are intact.                                                                                                                                         |

All Team-0 pages, Team-2 comparison/score/question/appendix pages, and Team-50 pages 2–10 were inspected at original 144-DPI raster detail. Every inspected page has the fixed campaign/version/`Page N / total` footer. Automated tests separately assert every footer across all physical pages, exact question sequence, absence of Team names, and 50-Team appendix boundaries.

## Comparison verdict and intentional differences

**PASS for the Task 8 visual gate.** Renderer v1 faithfully carries forward the accepted report's hierarchy, locked purple/blue/orange palette, dense score comparisons, question-level CEO/Team/peer bars, and anonymized appendix while adapting the continuous browser layout to A4 pages.

Observed differences are intentional and bounded:

- The accepted source is a continuous HTML/print surface; renderer v1 owns a deterministic A4 sequence with fixed campaign/version/page footers.
- Team 0 is written as `Not available` rather than inferred from CEO data.
- The provisional peer contract is frozen into each Task 6 snapshot so later benchmark changes cannot silently alter a generated artifact.
- Section and Domain peers are integrated into two explicitly labeled tables, avoiding the accepted source's repeated unqualified row names.
- Appendix B uses deterministic explicit 20-row chunks. This keeps identities anonymous, repeats context on every continuation, and trades some final-page density for stable boundaries and unsplit rows.
- A decorative running header is omitted; page headings and the mandatory fixed footer preserve navigation without duplicate chrome.

## Mechanical verification

Team-0 verifier command:

```text
node scripts/verify-summary-report-artifacts.mjs tmp/pdfs/team0.pdf --expect-text "Appendix B" --min-pages 8 --max-pages 8 --sha256 c17e145b2f33aef459fc3e5eb97dc318c6c98002849ac2f0a44a73e151b57994
```

Team-50 verifier command:

```text
node scripts/verify-summary-report-artifacts.mjs tmp/pdfs/team50.pdf --expect-text "Person 50" --min-pages 10 --max-pages 10 --sha256 64cd642576d86e10e7d2ddd1d4fd65c90e4bfede070cdbd55ec79f02f4e9eaf6
```

Both commands returned `ok: true`, their exact expected title/text/page count/SHA-256 values, and exit status 0.
