# Scaling CEO Full renderer v1 visual review

Date: 2026-08-27

## Scope and artifacts

- Accepted comparison source: `docs/research/evidence/platform-scaling-group-report-candidate-jeff-approved-2026-08-27.png` (the Jeff-approved live Scaling group-report candidate).
- Frozen Team-0 input: `src/src/__tests__/fixtures/summary-reports/scaling-ceo-full-snapshot.json`.
- Team-0 PDF: `src/tmp/pdfs/scaling-ceo-full-team-0.pdf`.
- Team-populated PDF: `src/tmp/pdfs/scaling-ceo-full-team-2.pdf`. This artifact is created only for visual verification by adding two deterministic synthetic Team sources to the de-identified fixture.
- Final Team-0 page rasters: `src/tmp/pdfs/team0-delivery-page-1.png` through `team0-delivery-page-8.png`.
- Final Team-populated page rasters: `src/tmp/pdfs/team2-delivery-page-1.png` through `team2-delivery-page-8.png`.
- Team-0 SHA-256: `85b0dfcbbc59ccba44f6489f508648f45e5d266a5f11367f307d433c4bcf5a58`.
- Team-populated SHA-256: `441c5012f6d7dc0b0f4c76a0e6bd5ab5dca7d18bc3b776c4ea0c5befec3150c3`.

The comparison is structural and cosmetic, not a claim of pixel identity. The accepted source is one continuous browser report; renderer v1 is an immutable A4 artifact with deliberate page ownership and fixed artifact footers.

## Page-specific review

| Page/state        | Evidence observed                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Team 0, page 1    | The accepted hierarchy is preserved: local white Scaling Up logo, de-identified coach attribution, `Group Report`, `Your Scaling Up Full Assessment Report`, organization/team/date attribution, and a dominant purple cover. The locked orange top rule and blue accent are crisp. The title has no mid-word hyphen or clipping.                                                    |
| Team 0, page 2    | Provenance, Alignment Profile, section comparison, and domain comparison remain readable at the locked dense table scale. CEO values are emphasized in purple. Every Team and gap cell is explicitly `Not available`; no CEO value is reused as a fabricated Team value. Both headings remain attached to their following table.                                                     |
| Team 0, page 3    | Peer Comparison precedes ScaleUp Score as in the accepted information order. The purple/blue/orange hierarchy remains legible. `Not available` fits in the Team score card without wrapping or clipping. CEO score `66`, peers `53.1`, deviation `+12.9`, and tier `Exemplary` match the frozen model.                                                                               |
| Team 0, pages 4-7 | All 61 frozen questions appear in stable order. Purple CEO bars, table labels, numeric scores, and Team-0 null treatments remain readable. Rows do not split; continuation headings and their table header stay together. Page 7 contains the final ten rows and therefore has intentional unused space rather than stretching row density. No heading, label, bar, or footer clips. |
| Team 0, page 8    | Appendix B is on a dedicated page and shows the CEO domain row. The large remaining area is intentional capacity for Team rows in the same stable appendix layout, not missing or clipped content. The orange privacy note and purple table treatment retain the accepted appendix hierarchy.                                                                                        |
| Team 2, page 2    | Synthetic Team averages and CEO-vs-Team gaps render independently from CEO values across section and domain tables. Composition reads `1 CEO / 2 Team`.                                                                                                                                                                                                                              |
| Team 2, page 3    | Team value `54` is legible beside CEO `66`, peers `53.1`, deviation `+12.9`, and the CEO tier.                                                                                                                                                                                                                                                                                       |
| Team 2, page 4    | CEO and Team question bars render side by side in purple and blue, including explicit zero values; rows remain aligned and unsplit.                                                                                                                                                                                                                                                  |
| Team 2, page 8    | The appendix exposes only `CEO`, `Person 1`, and `Person 2`. The synthetic source names `Taylor Rowan` and `Morgan Lane` are absent from extracted PDF text. The table is legible and unclipped.                                                                                                                                                                                     |

All eight final Team-0 rasters were inspected at 144 DPI. The Team-populated comparison, score, question-detail, and appendix pages were also inspected at 144 DPI. Every final page has the fixed footer text `Northstar Growth Review | scaling-ceo-full-pdf-v1 | Page N / 8`; this is also asserted across every parsed page in the renderer test.

## Comparison verdict and intentional differences

PASS for the Task 8 visual gate. Renderer v1 faithfully carries forward the accepted report's hierarchy, locked purple/blue/orange palette, dense comparison tables, scale score emphasis, question bars, and anonymized appendix while adapting the continuous browser layout to A4 pages.

Observed differences are intentional and bounded:

- The accepted source is a continuous HTML/print surface; renderer v1 owns an eight-page A4 sequence with fixed campaign/version/page footers.
- Team 0 is written as `Not available` rather than inferred from CEO data.
- The frozen canonical model contains section/domain/ScaleUp peer values but no question-level peer field. Renderer v1 therefore preserves peer comparison in the peer table and ScaleUp card, but does not invent the accepted source's orange per-question peer bars.
- The appendix has a dedicated page so Team-populated artifacts retain stable anonymity and pagination. Team 0 consequently leaves intentional white space on page 8.
- A decorative running header was omitted; the accepted hierarchy is carried by page headings and the mandatory artifact footer without nondeterministic duplicate chrome.

## Mechanical verification

Final verifier command:

```text
node scripts/verify-summary-report-artifacts.mjs tmp/pdfs/scaling-ceo-full-team-0.pdf --expect-text "Appendix B" --min-pages 8 --max-pages 8 --sha256 85b0dfcbbc59ccba44f6489f508648f45e5d266a5f11367f307d433c4bcf5a58
```

Result:

```json
{
  "ok": true,
  "path": "tmp/pdfs/scaling-ceo-full-team-0.pdf",
  "pages": 8,
  "sha256": "85b0dfcbbc59ccba44f6489f508648f45e5d266a5f11367f307d433c4bcf5a58",
  "title": "Scaling Up Group Report - Northstar Growth Review",
  "expectedText": "Appendix B"
}
```
