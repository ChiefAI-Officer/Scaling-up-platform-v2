# Public Welcome edited-template design

**Origin:** GH #387 item 4 follow-up; Jeff's `JV New Assessment Testing` report
**Fixed point:** `6f24ee6872f6b693700e279e602feaf1d2e8d5a6`

## Problem

The assessment editor persists the Welcome fields on
`AssessmentTemplate.invitedWelcomeDefault`, and its preview renders those values.
PR #411 connected that configuration to the public `/quiz/[campaignAlias]` route,
so Jeff's edited JV values now render. However, the historical migration backfilled
every template with the invited code baseline. Treating every valid stored value as
authored therefore replaced the anonymous public presentation on untouched templates
with invited wording and suppressed their campaign description.

Production read-only evidence confirmed the JV campaign is `PUBLIC`, has no public
or invited campaign snapshot, and points at a template containing Jeff's exact
saved Welcome values. This is a missing read/render connection, not a failed save.

## Approved behavior

- A PUBLIC campaign reads the current saved Welcome configuration from its actual
  related template only when that normalized configuration differs from the
  code-owned baseline for the template alias. Editing the template therefore
  updates existing public campaign links immediately; untouched templates retain
  the standing anonymous public presentation.
- INVITED campaigns retain ADR-0033 immutable campaign snapshots.
- Valid authored fields control eyebrow, interpolated campaign heading, message
  paragraphs, sharing heading/explanation, scores heading/explanation, CTA label,
  and server-owned fine print.
- Question count, section count, time estimate, question-format expectation, and
  scale label remain derived from the campaign's pinned published question bank.
- Missing, malformed, or baseline-equivalent template Welcome JSON preserves the
  current public Welcome output, including campaign-description fallback and the
  current public disclosure.
- The editor explains the split lifecycle: public campaigns update immediately;
  future invited campaigns use the default; existing invited campaigns stay frozen.

## Safety and scope

The server strictly parses persisted JSON before passing it to the client. Schema-v1
backfills normalize to schema v2 before canonical comparison with the alias baseline;
raw JSON must never be compared directly because v1 lacks `sharingDescription`. No
raw or malformed JSON crosses the public server/client boundary. The campaign
relation, not a URL or campaign alias, selects the template configuration.

When a template has been edited, authored `ledeParagraphs` take precedence and the
Campaign description is not rendered. When it is untouched, no authored override is
passed and the existing public branch renders the Campaign description or its legacy
fallback.

No schema, migration, feature flag, environment setting, production data, campaign,
submission, invitation, email, report, admin field, or snapshot semantic changes.

## Acceptance seams

1. Resolver/page loader: normalizes valid v1/v2 JSON, passes an authored override
   only when it differs from the alias baseline, and passes none for absent,
   malformed, or baseline-equivalent JSON.
2. Public renderer: shows all valid authored copy, interpolates `{{campaignName}}`,
   and retains actual question-derived facts.
3. Compatibility: absent/malformed/unedited configuration renders the existing
   public copy and Campaign description, without invited wording.
4. Editor contract: lifecycle guidance describes live PUBLIC behavior and frozen
   INVITED behavior without claiming that existing invited campaigns update.

## Residual limitations

An edited template can still carry invited-flavoured authored wording onto a Public
link, including Jeff's authored invitation label. The discriminator is “edited at
all,” not “edited for Public.” A separate Public Welcome configuration and editor
surface would solve that, but it is separate scope and is not implemented here.
