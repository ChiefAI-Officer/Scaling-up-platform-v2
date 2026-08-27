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

## Task 14 — real local lifecycle and UI review (2026-08-27)

The Task 8 evidence above is preserved unchanged. This addendum concerns the
real campaign hosts, authenticated API/Prisma lifecycle, and PDF bytes produced
from a deidentified local 61-question CEO + two-Team campaign. It is **not a
live-canary or global-launch approval**. Reproduction, boundary limitations and
pending operations are in [the local-proof runbook](summary-reporting-local-proof/README.md).

### Observed UI and artifact results

| State | Local result and evidence |
| --- | --- |
| Coach/admin empty and populated lists | PASS: both actual hosts show the same single implemented catalog. The campaign panel remains primary; there is no new hub. `coach-empty-*`, `admin-empty-*`, `coach-populated-*`, `admin-populated-*` show the real components, not a static mockup. |
| Composition | PASS after narrow scroll repair: selection is separate from role assignment; CEO is explicit, Team order is retained. At 390×844 the candidate region scrolls independently of the footer. The final action is fully visible/clickable above Review at the actual bottom; see `composition-bottom-mobile-viewport.png`. The earlier sticky-footer overlap was a real failure and was fixed, not accepted as baseline. |
| Review | PASS after acceptance-gap repair: destination organization, CEO and ordered Team roles now include source campaign, assessment/version/language, completion timestamp and full submission identity. A same-name historical-source DOM regression proves disambiguation/order. `review-mobile-viewport.png` is legible; `admin-review-long-ids-mobile-viewport.png` proves long identities wrap within the dialog. The Review state changes no captured ambiguous-retry payload and adds no query. |
| Modal / native PDF | PASS for visible desktop content paint in the corrected R1 captures below: both coach/admin images show the upper purple cover, logo/title, populated thumbnails and native toolbar/page count. They do **not** show the complete cover page. The original committed captures were blank and did not support the earlier PASS claim. Real inline HTTP 200, `private, no-store`, `SAMEORIGIN`, new-tab and checksum-identical downloads are separately proven. The exact artifact route required a narrow exception to global DENY; matching Next/Vercel overrides do not prove deployed CDN/CSP/header precedence. |
| Actual PDF pages | PASS for legibility/attribution: `local-pdf-1.png` has purple cover, local logo, campaign/organization/date hierarchy; `local-pdf-2.png` shows named CEO Alex CEO, frozen timestamp/version, 3 selected/completed/invited and labeled Section/Domain comparisons. `local-appendix-8.png` shows CEO, Person 1 (reordered Ed source), Person 2 (Dee source), with no Team names. All three are rasters of the bytes downloaded through the authorized route. |
| Legacy mobile host layout | EXISTING LIMITATION: document width is 901px in a 390px viewport with Summary Reporting enabled **and with it off**, using the same campaign data. `coach-flag-off-mobile-viewport.png` records the comparison. The inherited respondent table/page overflow is not a wizard regression and is not claimed fixed. Full-page mobile screenshots can therefore exceed viewport width; use the `*-mobile-viewport.png` files for actual mobile composition. |

All named screenshots are in [summary-reporting-local-proof](summary-reporting-local-proof/).
Desktop viewports are 1440×1000 and mobile viewports 390×844. Full-page captures
include content beyond the viewport and are explicitly not pixel-sized viewport
evidence. The original full lifecycle PDF has eight pages; its run-specific SHA-256 is
`be5ac1759faf087f9375f139e6d34df5ba6f99079b00df4e8d6f06a1a6316a4e`.
The hash remains unchanged after retries, each host's download, and a later
submission. New run timestamps naturally produce a different artifact hash.

### Exact visible differences and remaining visual gate

The comparison source remains the tracked deidentified accepted artifact above.
The approved spec's discovery-record and original-PDF links are absent in this
worktree; no unrelated dirty originals were imported. This is a comparison to
the durable deidentified baseline and preserved Task 8 evidence, not a fresh
inspection of the live source.

- **Question-bar layout differs:** the accepted source stacks CEO/peer bars
  beneath each question; renderer v1 uses side-by-side CEO / Team / peer column
  mini-bars and numeric values. This is a visible density/layout deviation,
  not merely a paper-size change, and must be explicitly accepted on the canary.
- The continuous browser report becomes fixed A4 page ownership and repeated
  campaign/version/page footers. Section/Domain results are separate tables;
  exact provenance and provisional peer disclosure are explicit. These alter
  density and whitespace while retaining the purple/blue/orange hierarchy.
- Appendix B is anonymized and chunked at 20 rows per page with continuation
  context; the short two-Team local appendix intentionally has substantial
  whitespace. Team-50 continuation coverage remains in the preserved evidence.
- The local fixture has no coach avatar, so the cover uses the renderer's
  no-image attribution fallback; it does not prove a live coach-photo path.
  Optional/background identity answers are omitted from this synthetic input.
- Headless-shell could not open the native PDF popup. The original full
  Chromium runs delivered bytes, but the committed desktop captures had blank
  canvases: the pre-capture delay was invalidated by subsequent resize/full-page
  capture. The earlier claim that those files proved paint was incorrect. R1
  below replaces only the two desktop files with inspected viewport captures.
  Native paint is manually reviewed, not asserted by a pixel test. A bounded
  Computer Use fallback failed with app-server error -10005; no desktop capture
  is claimed from it. Mobile native viewer controls remain browser-dependent;
  downloads/new-tab remain available.

**Verdict:** local lifecycle, mobile wizard containment, Review provenance and
representative PDF legibility pass. The accepted bar-layout/A4/appendix
differences keep the **actual-canary visual gate open before launch**; this
addendum does not authorize global enablement or claim pixel identity to ESPERTO.

### R1 evidence correction — exact final desktop files

The blank coach image at commit `3dd74fc2` had SHA-256
`ebb09fb4720dc45ff3376e528ef5d43cd46e72f7693dc07e615522f56b56cf85`.
It and the blank admin image are superseded by the following **1440×1000
viewport-only** captures, inspected after copying into their final tracked paths:

| File | Final SHA-256 |
| --- | --- |
| `summary-reporting-local-proof/coach-pdf-preview-desktop.png` | `97985319235b627f6ba6093fbbb137141a4c23e5c0bf3689a620373a76a2fd90` |
| `summary-reporting-local-proof/admin-pdf-preview-desktop.png` | `dac6275d3694ca42b4d23cd8cb82e859618141bf6fe1a30ff28c2a9ebebcf8b6` |

Both show the upper purple cover, Scaling Up logo, `Your Scaling Up Full
Assessment Report`, orange top rule, populated page thumbnails and `1 / 8`
toolbar. The captured native surface cuts off the lower cover portion; this is
positive content-paint evidence, **not** proof of complete-page visibility or
mobile PDF readability. Complete cover/content legibility remains evidenced
separately by the actual PDF rasters above and requires live canary acceptance.

The focused headed lifecycle rerun passed **1/1**, 40.2s, including both actors'
inline/new-tab/download and immutable checksum checks. Its PDF SHA-256 was
`e838eac5839ef019b32bd7075674d82e3497254d7ffd67d98f8ef0af1b00baad`;
this is a new timestamped run, distinct from the original full-suite PDF/rasters.
The helper now activates the page and settles **after** setting the final
viewport, then captures without full-page enlargement. Test runs write only
ignored `src/test-results/summary-reporting-evidence/`; promoting inspected
files is explicit, so a later run cannot overwrite accepted tracked evidence.
