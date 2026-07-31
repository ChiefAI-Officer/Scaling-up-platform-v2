# GH #217 — Legacy Invitation Fallback Hardening Design

Date: 2026-07-31  
Status: Approved for implementation planning  
Issue: [GH #217](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/217)  
Branch: `codex/217-legacy-invite-fallback-hardening`

## Context

`sendAssessmentInvitationEmail` is the shared invitation-email send boundary.
Production currently leaves `ASSESSMENT_INVITE_BRANDED` unset, so the branded
renderer is live. Setting the variable to `0` and redeploying activates
`sendLegacyInvitationEmail` as the emergency fallback.

The legacy renderer already shares the branded path's default-fill, safe subject,
token interpolation, strict SMTP failure propagation, and PII-free telemetry
contracts. It still has three functional gaps:

1. `coachName` is not passed into the legacy function and is hardcoded to `null`.
2. The SMTP payload has no plain-text alternative.
3. The HTML has a button but no visible bottom fallback URL.

This is defense-in-depth for a dormant emergency path. It is not a Jeff tracker
item and does not alter the live renderer while the production flag remains
unset.

## Decision

Preserve the legacy renderer's existing simple blue HTML design and correct only
the three functional gaps.

### Data flow

1. `sendAssessmentInvitationEmail` continues to compute the invitation URL,
   defaulted subject/body, and renderer flag exactly once.
2. When `ASSESSMENT_INVITE_BRANDED === "0"`, the call to
   `sendLegacyInvitationEmail` also passes `data.coachName ?? null`.
3. The legacy function places that value in its existing `InvitationVars`.
   `buildTokenValues` therefore renders the supplied Coach name or its established
   neutral fallback, `your coach`.
4. The legacy HTML keeps its current escaped paragraph rendering and blue CTA,
   then adds one visible, escaped bottom fallback URL.
5. The SMTP payload adds `text: renderTextBody(effectiveBodyMarkdown, vars)`.
   The shared text renderer strips a standalone redundant invitation CTA before
   appending the canonical `Start the assessment: <URL>` line.

### Rendering boundary

- Keep the legacy font, width, paragraph treatment, button label, blue color,
  padding, radius, and weight.
- Use `escapeHtml(invitationUrl)` for both the button `href` and the new visible
  URL so the generated credential cannot break an attribute or text node.
- Do not route legacy HTML through `buildInvitationEmailHtml` or
  `renderHtmlBody`; doing so would change legacy markdown and visual behavior
  beyond this item.
- The renderer supplies one canonical bottom fallback. Coach-authored prose is
  not rewritten merely because it independently spells out a URL.

### Preserved contracts

- Branded and campaign full-HTML renderers are byte-unmodified.
- Existing template and campaign invitation copy is unchanged.
- Custom-HTML precedence is unchanged.
- The legacy path remains attachment-free.
- Telemetry type, renderer, source fields, and default version are unchanged.
- SMTP errors continue to propagate to the caller.
- No schema, migration, API, route, scoring, report, flag, environment, or
  production-data change is introduced.
- This work does not flip `ASSESSMENT_INVITE_BRANDED`.

## Approaches considered

### 1. Targeted fallback correction — selected

Thread one existing value, add the shared text rendering, and append the missing
fallback block in the current legacy function.

This has the smallest regression surface and preserves the emergency renderer as
an independent fallback.

### 2. Extract a pure legacy-renderer module

Move legacy rendering out of `notifications.ts` and introduce a new HTML builder.
That would improve isolation, but it adds file movement and a new interface for
three narrow corrections without changing the underlying contract.

Rejected as unnecessary for this item.

### 3. Reuse the branded renderer with reduced styling

Drive both paths through the branded builder and suppress logos or selected
chrome for the fallback.

Rejected because it makes the emergency path depend on the implementation it is
supposed to bypass and would change the legacy rendering contract.

## Error handling and security

- No new catch is introduced; SMTP failures remain visible and retryable through
  the existing caller behavior.
- The subject continues through `renderSubject`, whose allowlist excludes the
  token-bearing invitation URL.
- Token interpolation continues through `buildTokenValues`.
- The new visible URL and the existing button attribute use the shared HTML
  escaping authority.
- Raw tokens remain confined to the email body URL and are not logged or
  persisted by this work.

## Test strategy

Extend the existing `sendAssessmentInvitationEmail` service tests:

1. Legacy flag plus `coachName` renders the Coach's name in authored body copy.
2. Legacy flag plus no Coach name renders `your coach`.
3. Legacy HTML retains the blue CTA and includes the visible bottom fallback URL.
4. Legacy SMTP payload includes a plain-text alternative with no HTML or
   markdown syntax.
5. A standalone markdown invitation CTA is removed from the plain-text body so
   the canonical URL line appears once.
6. Legacy telemetry and attachment-free behavior remain unchanged.
7. Branded flag state still carries its existing HTML, text, and CID attachment
   behavior, proving the shared call-site edit did not alter the live path.

Run the focused notification and invitation-email suites, scoped ESLint,
`git diff --check`, migration safety, changelog freshness, and the Turbopack
production build gate before merge.

## Rollout and rollback

The implementation adds no new flag and affects no production invitation while
`ASSESSMENT_INVITE_BRANDED` remains unset. Launch verification must confirm that
state without mutating it.

Rollback is a normal revert. There is no data cleanup, migration rollback,
environment rollback, or scheduler action.

## Acceptance criteria

- The legacy fallback can render `{{coachName}}` with the same neutral fallback
  contract as the branded path.
- Every legacy send includes both HTML and plain-text bodies.
- Legacy HTML offers a visible copy/paste URL beneath its existing button.
- The live branded and custom-HTML paths are unchanged.
- Focused regression evidence covers both flag states.
