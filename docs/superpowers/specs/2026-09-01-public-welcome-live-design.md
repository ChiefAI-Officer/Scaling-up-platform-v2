# Public Welcome live-template design

**Origin:** GH #387 item 4 follow-up; Jeff's `JV New Assessment Testing` report
**Fixed point:** `dd32487bbe9f37a7674a0fd062fefeef1775d49f`

## Problem

The assessment editor persists the Welcome fields on
`AssessmentTemplate.invitedWelcomeDefault`, and its preview renders those values.
The public `/quiz/[campaignAlias]` route does not select that configuration and
`PublicQuizClient` hardcodes the public Welcome copy. Consequently, Jeff's saved
JV values are visible in the editor but not at the existing public campaign URL.

Production read-only evidence confirmed the JV campaign is `PUBLIC`, has no public
or invited campaign snapshot, and points at a template containing Jeff's exact
saved Welcome values. This is a missing read/render connection, not a failed save.

## Approved behavior

- A PUBLIC campaign reads the current saved Welcome configuration from its actual
  related template on every request. Editing the template therefore updates
  existing public campaign links immediately.
- INVITED campaigns retain ADR-0033 immutable campaign snapshots.
- Valid authored fields control eyebrow, interpolated campaign heading, message
  paragraphs, sharing heading/explanation, scores heading/explanation, CTA label,
  and server-owned fine print.
- Question count, section count, time estimate, question-format expectation, and
  scale label remain derived from the campaign's pinned published question bank.
- Missing or malformed template Welcome JSON preserves the current public Welcome
  output, including campaign-description fallback and current public disclosure.
- The editor explains the split lifecycle: public campaigns update immediately;
  future invited campaigns use the default; existing invited campaigns stay frozen.

## Safety and scope

The server strictly parses persisted JSON before passing it to the client. No raw
or malformed JSON crosses the public server/client boundary. The campaign relation,
not a URL or campaign alias, selects the template configuration.

No schema, migration, feature flag, environment setting, production data, campaign,
submission, invitation, email, report, admin field, or snapshot semantic changes.

## Acceptance seams

1. Page loader: selects the related template's saved Welcome JSON, passes a valid
   normalized configuration, and passes no authored override for malformed JSON.
2. Public renderer: shows all valid authored copy, interpolates `{{campaignName}}`,
   and retains actual question-derived facts.
3. Compatibility: absent/malformed configuration renders the existing public copy.
4. Editor contract: lifecycle guidance describes live PUBLIC behavior and frozen
   INVITED behavior without claiming that existing invited campaigns update.
