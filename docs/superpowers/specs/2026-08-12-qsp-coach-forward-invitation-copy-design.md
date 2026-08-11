# QSP Coach-Forward Invitation Copy Design

Date: 2026-08-12
Status: Approved from the QSP v1 / QSP v2 visual comparison
Scope: Canonical invitation defaults for `qsp-v1` and `qsp-v2`

## Outcome

Both QSP templates use the same coach-forward invitation sentence:

> You've been invited by `{{coachName}}` to complete the `{{templateName}}` for `{{organizationName}}`.

The existing universal invitation shell remains unchanged. It continues to own
the Scaling Up banner, resolved Coach image/name byline, primary CTA, fallback
link, and footer.

## Changes

- Replace QSP v1's organization-forward default body with the approved
  coach-forward body already canonical for QSP v2.
- Keep each template's own `{{templateName}}`, so rendered copy remains
  “Quarterly Session Prep v1” or “Quarterly Session Prep v2.”
- Preserve the existing invitation subject.
- Add byte-exact regression coverage for both QSP versions so their canonical
  default bodies cannot drift apart unintentionally.

## Boundaries

- No renderer, banner, CTA, token, schema, question, scoring, report, or public
  quiz behavior changes.
- Existing campaign-level subject/body overrides remain authoritative.
- Already-sent emails are unchanged.
- This code change does not mutate Production template or campaign rows and
  does not send an email. A Production live-row update and received-email
  acceptance require a separately authorized operational step.

## Acceptance

1. Both QSP seed builders emit the same coach-forward body.
2. QSP v1 and QSP v2 retain their distinct template names and aliases.
3. Both retain the subject “Please complete your Quarterly Session Prep.”
4. The body contains `{{coachName}}`, `{{templateName}}`, and
   `{{organizationName}}`, and contains no raw invitation URL.
5. Existing QSP seed and content tests remain green.
