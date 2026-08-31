# Preface and CTA report survey design

## Source request

Jeff Verdun's 28 August consolidated Phase 1 list asks for two outcomes:

1. Diagnose why the authored preface and CTA do not appear on the eight-question mini quiz and "test across all reports."
2. Permit "a lot more customization" than the closing message's 16-estimated-line limit.

Two clauses in the printed email are clipped and cannot be recovered. They remain open questions rather than inferred requirements. The attached annotated mini-quiz result and the visible instructions are sufficient for this item.

## Surface survey

| Surface | Authored preface/CTA contract | Finding | Classification |
| --- | --- | --- | --- |
| Invited individual result, browser | Supported | The campaign-pinned template version's safe `reportHtml` is loaded and rendered by all individual report styles. | Working |
| Invited individual result, print/PDF | Supported | The same browser report regions are printed; Scaling Up Full uses a governed preface page and fixed conclusion page. | Working |
| Public quiz result, browser | Supported | The public route loads `reportConfig` from the campaign-pinned version and passes safe `reportHtml` into the same report renderer. | Working |
| Public quiz result, print/PDF | Supported | The public browser report is the print source. | Working |
| Group/aggregate report | Never supported | Group report models do not carry template `reportHtml`. | Out of scope, not a defect |
| Emailed report | Deliberately unsupported | `CONTEXT.md` limits custom introduction/conclusion to browser and print pending separately approved email work. | Out of scope, not a defect |

The live `sunhub-quick-quiz` campaign is pinned to template version 1. Later published versions contain the authored report content, but the pinned version does not. The public result therefore behaves correctly for its immutable campaign-version contract. This work must not repin the campaign, make campaigns follow latest versions, or alter production data.

## ESPERTO reference behavior

Read-only validation in ESPERTO found:

- Scaling Up personal: 26 landscape pages; full-page preface on page 2; generated conclusion and support CTA together on page 25; appendix begins page 26.
- Scaling Up CEO Full: 31 landscape pages; the same preface and conclusion pattern; appendices follow.
- Scaling Up Condensed CEO: 2 landscape pages; neither a preface nor a conclusion CTA region.

The platform should retain a single governed conclusion page. Adding a standalone CTA page or enabling these regions universally would diverge from the source behavior.

## Closing budget

The current 16-estimated-line cap protects the fixed conclusion page. A prior adversarial composition overflowed the physical page and expanded a 26-page PDF to 27 pages. The estimator charges headings, blocks, lists, breaks, table rows, figures, images, and wrapped text rather than trusting character count alone.

Raise only the conclusion `estimatedLines` limit from 16 to 24:

- 24 is a 50% increase in structural freedom, directly addressing Jeff's request.
- The fixed print region is 165 mm tall. At the authored region's approximately 5 mm body line box, 24 estimated lines consume about 120 mm and retain roughly 45 mm (27%) for structural margins and safety.
- The existing 900-visible-character cap already accommodates ESPERTO-scale CTA prose and remains unchanged.
- Element, depth, image, table, heading, break, CSS, and sanitization safeguards remain unchanged.

The change is accepted only if browser tests prove the 24-line boundary remains inside Scaling Up Full's fixed physical page with its existing page count, while Classic scored/qualitative and the alternate styles preserve their own safe print behavior without clipping or content loss. Dynamic Classic layouts may add a physical page rather than clip authored content. Twenty-five estimated lines remain rejected. The complete supported-surface suite must remain green.

## Non-goals

- No production data, campaign pin, environment variable, or feature-flag changes.
- No group-report or email authoring surface.
- No automatic campaign migration to a newer template version.
- No new report page or change to report pagination.
