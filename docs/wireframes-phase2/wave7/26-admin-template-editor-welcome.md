# 26 — Admin assessment Welcome screen authoring

## Chosen state

The Welcome screen is a fixed, nearly full-width card in the existing **Build**
canvas, directly after the assessment header and before Section 1. It is collapsed
by default so the rest of the builder remains visible. Expanding it reveals the
seven authored fields followed by the respondent preview; at 1024 px those columns
stack in that source order.

The card summary is:

- `Welcome screen`
- `First screen respondents see`
- shortened current Welcome message
- `Before Section 1`

## Save behavior

There is no card-level **Save Welcome screen** action. Welcome changes participate
in the builder's existing top-level **Save Draft** action, validation, dirty state,
failure toast, and retry behavior.

## Field ownership

ADMIN and STAFF author:

- invitation label;
- heading template, retaining `{{campaignName}}`;
- one to four Welcome-message paragraphs;
- sharing heading;
- scores heading;
- scores explanation; and
- button label.

The platform derives time, question count, section count, scale, rating description,
the CTA arrow, layout, icons, and the named-answer disclosure. The server preserves
legacy fine print when present. These are not presented as editable inputs and there
are no `Automatic` or `Protected` boxes in the interface.

## Lifecycle copy

The expanded card says:

> Changes become the default for future invited campaigns. Campaigns already
> created keep the Welcome screen they started with.

The preview uses `Example campaign`, current Build questions/sections, and the same
shared rendering component as an invited respondent. Its CTA is non-actionable.

## Report-style simplification

When this coordinated experience is enabled, coaches no longer see **Report
appearance** or **Report style** in campaign creation or campaign detail. New
campaigns inherit the assessment default owned by ADMIN/STAFF. Existing campaign
report rendering, links, stored styles, and first-response locks remain intact.

## Acceptance notes

- The default state is collapsed.
- The card occupies the normal Build canvas width but does not hide the header or
  Section 1 context.
- The expanded desktop state uses fields beside preview; 1024 px stacks fields then
  preview without horizontal scrolling.
- No field permits authoring the protected disclosure, facts, icons, fine print, or
  system styling.
- No card-level save button is present.
- Public assessment Welcome screens are outside this artifact and remain unchanged.
