# GH #220 — Branded Campaign Invitation HTML Design

Date: 2026-08-03
Status: Implemented and locally verified; default-off; not production-activated
Issue: [GH #220](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/220)
Branch: `codex/220-invitation-html-branding-design`
Base: `origin/main` at `6983c1f1050be06e95a736be8f228d30ad13f200`

## Context

When `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` is on and a campaign has a non-empty
`invitationBodyHtml`, `prepareAssessmentInvitationEmail` treats the authored
HTML as the complete email. It does not call the branded-shell builder, removes
the Scaling Up CID attachment, and emits no platform or Coach chrome unless the
author recreated it manually.

That behavior was intentional in the original Wave-D contract: the Coach
controlled all imagery and the HTML replaced the whole email. It also caused the
confirmed Jeff #76 QSP incident. Four production sends on 2026-07-10 used
`renderer: "custom_html"` for the now-soft-deleted `2026 QSP Q2` campaign, whose
override contained neither Coach-forward copy nor the shared branded shell.
Template-row corrections could not reach it because campaign overrides take
precedence.

The current editors already state that full custom HTML replaces the complete
branded email. That warning did not prevent the incident, and two adjacent UI
states are inaccurate:

- the collapsed Campaign Wizard and Campaign Detail summaries ignore
  `invitationBodyHtml`; and
- the Campaign Detail save confirmation can report “Using template default”
  when only HTML is set.

There is no invitation-email preview. A read-only production audit on 2026-08-03
found zero live invitation overrides and two full-HTML overrides only when
soft-deleted campaigns were included.

Before this design session, GitHub was rechecked. GH #220 was open, unassigned,
had no issue comments, had no claim on tracker #261, and had no matching open PR
or remote implementation branch. The similarly named remote custom-HTML
branches belong to the already-merged landing-page template work and are
unrelated.

## Product decision

Scaling Up and Coach branding is the invariant. Campaign-authored HTML is a
custom **body fragment**, not a complete email.

When branded custom-HTML mode is active, the platform owns:

- the Scaling Up header and CID logo;
- the existing Coach-logo behavior and graceful degradation;
- the primary assessment CTA and visible fallback URL; and
- the Scaling Up footer.

The Coach owns the sanitized content inside that shell. The subject remains the
separate token-allowlisted invitation-subject field.

This decision supersedes the Wave-D “Coach controls all imagery” contract only
while the new behavior flag is active. It does not alter author ownership of the
stored HTML bytes.

## Goals

1. Guarantee shared branded chrome for enabled campaign custom-HTML invitations.
2. Guarantee a usable assessment link without requiring the author to place a
   URL token.
3. Preserve stored Coach-authored HTML without rewriting or migrating it.
4. Keep initial sends, reminders, resends, and auto-send on one render contract.
5. Provide a dark deployment, explicit activation, and safe emergency rollback.
6. Make editor and telemetry state accurately disclose the active composition
   mode.

## Non-goals

- Rewriting, clearing, or migrating existing campaign HTML.
- Changing invitation subject semantics, recipient selection, SMTP delivery,
  error propagation, reminder tokens, or invitation lifecycle.
- Changing the shared Coach-image URL policy or repairing Coach images (GH #256).
- Changing emailed report branding (GH #228).
- Changing assessment-email outbox reconciliation (GH #257).
- Expanding feature-flag visibility work (GH #233).
- Adding a browser-style email preview.
- Adding a schema column or Prisma migration.
- Mutating production data or flags in the design session or implementation PR.
  Production activation is a later, separately authorized operational step.

## Approaches considered

### 1. Render-time branded composition — selected

Keep raw authored HTML unchanged. At the shared send chokepoint, interpolate and
sanitize it as a body fragment, then place the fragment inside the current
branded shell.

This keeps chrome current, avoids migration risk, uses the same behavior for all
send entry points, and permits a flag-controlled rollback.

### 2. Save-time wrapping or conversion

Rewrite stored HTML into platform-branded markup on save and migrate existing
rows.

Rejected because platform chrome would become embedded in Coach-owned data,
branding could become stale, and rewriting arbitrary authored HTML risks data
loss or presentation damage.

### 3. Require authors to embed approved branding

Keep complete replacement but validate the presence of platform brand elements
or special branding tokens.

Rejected because arbitrary HTML and CSS cannot reliably guarantee presentation,
and it leaves platform-owned identity under Coach control.

## Feature controls and render selection

`WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` remains the capability flag. Add
`ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED`, parsed with the repository’s
existing explicit-truthy convention and defaulting off.

The render decision is:

| Wave-D HTML flag | Branded-HTML flag | Stored HTML | URL token in HTML | Result |
| --- | --- | --- | --- | --- |
| Off | Any | Any | Any | Ignore HTML; use branded markdown/template default |
| On | Off | Empty | N/A | Use branded markdown/template default |
| On | Off | Non-empty | Recognized token present | Current complete-replacement renderer |
| On | Off | Non-empty | No URL token | Use branded markdown/template default |
| On | On | Empty | N/A | Use branded markdown/template default |
| On | On | Non-empty | Present or absent | Branded custom-HTML body |

The tokenless fallback closes a rollback hazard. A body saved while branded mode
is active may legitimately omit `{{invitationUrl}}`; if the behavior flag is
later disabled, it must not become a complete HTML email with no assessment
link.

Render selection uses the same browser-safe raw-byte token predicate and
URL-token aliases as save-time validation. It does not infer link presence from
sanitized output or search for arbitrary URLs. Stored token placement was
already validated when the body was written; the rollback decision only needs
the shared recognized-token predicate.

Legacy token-bearing bodies may temporarily regain complete replacement during
an emergency rollback. That is an accepted rollback-only exception to the
branding invariant, not a supported authoring mode going forward.

## Component boundaries

### Custom body renderer

The existing custom-HTML pipeline remains the security authority:

1. build the token-value map;
2. HTML-escape every token value;
3. interpolate the raw stored bytes with the existing token matcher; and
4. run the result through `sanitizeEmailHtml`.

The resulting value is a sanitized fragment. Expose and document that semantic
boundary without implying that the result is necessarily a complete email. The
current complete-replacement path may reuse the same fragment for rollback.

### Shared invitation-URL token policy

Move the recognized invitation-URL aliases and raw-byte presence predicate into
a small pure module with no sanitizer, parser, Node-only, or React dependencies.
The placement validator, render selector, activation audit, and editor status
logic all import this one policy. This prevents the client from duplicating the
token regex and keeps the validator's heavier HTML parser out of the browser
bundle.

### Shared branded shell

Extract the existing shell composition from markdown conversion so it accepts a
trusted, already-sanitized `bodyHtml` value plus `InvitationVars` and the current
`InvitationChrome` variant.

The existing markdown renderer first derives escaped markdown-lite HTML and then
uses the same shell. The branded custom-HTML renderer supplies its sanitized
fragment directly. This prevents two shells from drifting while keeping
markdown conversion and HTML sanitization independent.

The shell continues to:

- attach the Scaling Up logo as the existing CID asset;
- use the existing `waveP`/`legacy` chrome selection;
- render the Coach image only when the current HTTPS-only gate accepts it;
- preserve the existing no-Coach/no-image/invalid-image degradation;
- render the platform CTA and fallback URL; and
- render the current footer.

This work does not change `safeImageSrc`, `resolveCoachLogo`, Coach identity
selection, logo sizing, or logo ordering.

### Plain-text composer

Branded custom HTML receives a deliberate text alternative derived from the
same already-sanitized fragment used by the HTML shell:

```text
Scaling Up Platform
Coach: <coach name>        # omitted when unavailable

<text derived from the sanitized custom fragment>

Start the assessment: <invitation URL>
```

The platform URL line is always appended, even if legacy body text independently
contains the URL. This keeps link ownership explicit and ensures href-only
authored links survive conversion to text.

### Send orchestration

`prepareAssessmentInvitationEmail` remains the only composition decision point.
Initial sends, fan-out, reminders, and resends continue to pass campaign data
into that boundary and require no renderer-specific branches.

The subject continues through `renderSubject` and never derives from body HTML.
The invitation credential remains excluded from subject tokens.

## Save-time validation

Raw storage and the 50,000-character limit remain unchanged.

When the Wave-D capability flag is off, create and update routes continue to
ignore `invitationBodyHtml`.

When Wave-D is on and branded custom-HTML mode is off, the current validation
contract remains: non-empty HTML must contain at least one invitation URL token
in a permitted position.

When both flags are on:

- zero invitation URL tokens is valid because the shell owns the link;
- if a URL token is present, every occurrence must still be either a text node
  or the complete value of an anchor `href`; and
- URL tokens remain forbidden in comments, CSS, images, mixed attribute values,
  and other attributes.

The placement validator accepts an explicit `requireUrlToken` policy and imports
the shared recognized-token predicate; parsing and token aliases are not
duplicated. Validation errors remain HTTP 400 and perform no database write.

## Authoring experience

Both the Campaign Wizard and Campaign Detail editor receive the server-derived
branded custom-HTML flag. They must never infer production mode independently.

When branded mode is active:

- label the field **Custom HTML body (advanced)**;
- state that Scaling Up branding, available Coach identity, the assessment
  button/link, and the footer are added automatically;
- state that the HTML replaces only the markdown body;
- make `{{invitationUrl}}` optional;
- continue listing the supported merge tokens; and
- retain upload-or-paste, clear, length, and inline validation behavior.

When branded mode is inactive and the current HTML contains a recognized URL
token, retain the current accurate warning that the HTML replaces the complete
branded email. When the current HTML is tokenless, state that it is retained but
inactive, the branded markdown/template fallback will send, and editing the HTML
requires adding a URL token or clearing it.

Collapsed summaries include `invitationBodyHtml`:

- branded HTML present: “Branded custom HTML body set for this campaign”;
- behavior flag off plus token-bearing HTML: “Full custom HTML replaces the
  branded email”;
- behavior flag off plus tokenless stored HTML: “Custom HTML retained but
  inactive — branded template fallback will send”;
- subject or markdown override only: retain the current custom subject/body
  summary; and
- no overrides: retain the template-default summary.

The Campaign Detail save confirmation must inspect HTML as well as subject and
markdown. Branded HTML saves report “Branded custom HTML body saved.” A
full-replacement save reports that mode explicitly. A retained tokenless body in
rollback mode reports the safe fallback rather than claiming full replacement
or a template default. Template-default copy is shown only when all three
overrides are empty.

Campaign Detail must not make a retained tokenless body block unrelated subject
or markdown edits during rollback. In that state, omit `invitationBodyHtml` from
the PATCH payload unless the HTML value itself changed. If the author edits the
HTML, the full-replacement validator requires a recognized URL token or an
explicit clear. The Campaign Wizard has no persisted server row to preserve, so
a tokenless draft submitted after a flag rollback receives the normal inline
validation error and must be corrected or cleared.

No live preview is added. Browser rendering would imply fidelity that email
clients do not provide, and the issue does not require a broader email-preview
subsystem.

## Existing stored HTML

Existing `invitationBodyHtml` bytes remain unchanged. There is no automatic
rewrite, clearing operation, backfill, or migration.

When branded mode is enabled, existing HTML is interpreted as a body fragment.
An existing embedded invitation link remains in the fragment, so a restored
legacy campaign may contain both that link and the platform CTA. That duplication
is preferable to heuristically deleting authored links.

Add a read-only activation audit that reports:

- total HTML overrides;
- live versus soft-deleted counts;
- template alias and campaign ID;
- whether each body contains a recognized URL token; and
- its current, post-activation, and rollback composition modes.

The audit must not print raw HTML, invitation credentials, respondent data, or
email addresses. It performs no writes. Activation pauses when live overrides
are nonzero until each live row has been manually reviewed.

The audit's current, post-activation, and rollback mode classifications assume
the branded renderer is active. `ASSESSMENT_INVITE_BRANDED=0` selects the legacy
renderer before custom-HTML render selection, so activation must also verify
that kill switch is inactive; the audit classifications do not describe actual
send behavior while the legacy renderer is selected.

## Telemetry

Preserve existing values for continuity:

- `renderer: "custom_html"` when custom HTML is rendered; and
- `bodySource: "custom_html"` on that path.

Add PII-free composition metadata:

- `customHtmlMode: "full_replace" | "branded_body"` when custom HTML is used;
  and
- `customHtmlFallbackReason: "branded_mode_disabled_missing_url_token"` when
  stored HTML is bypassed by the rollback safety rule.

The fallback uses the normal branded renderer and its authored/default body
source. No raw HTML, URL, token, Coach image URL, or campaign name enters
telemetry.

## Error handling and security

- Unexpected sanitizer, composition, or SMTP errors continue to propagate
  through the existing strict send-failure path.
- No new catch converts a failed send into success.
- If sanitization yields an empty fragment without throwing, the branded shell,
  CTA, fallback URL, and footer still produce a usable invitation.
- Authored token values remain HTML-escaped before interpolation.
- The strict Coach-safe sanitizer remains the only authority for authored email
  markup.
- The trusted shell is composed after fragment sanitization; authored content
  never becomes shell markup or SMTP metadata.
- Remote image and inline-style policies remain unchanged.
- The Scaling Up CID attachment is present only on branded paths, including
  branded custom HTML.

## Test strategy

### Feature and validation matrix

Cover every row in the render-selection table:

1. The new flag defaults off and accepts only the repository's explicit truthy
   values.
2. Wave-D off ignores stored HTML and uses branded markdown/default behavior.
3. Wave-D on plus branded mode off renders token-bearing HTML as the complete
   email with no CID attachment.
4. Wave-D on plus branded mode off safely bypasses tokenless HTML.
5. Both flags on render token-bearing and tokenless HTML as branded bodies.
6. Empty HTML always uses the markdown/template path.
7. Tokenless HTML is accepted only while branded mode is on.
8. Unsafe token placement is rejected in both authoring modes.

### Rendering and security

- Sanitized custom content appears inside the shared shell.
- Scaling Up CID logo, Coach-logo ordering/degradation, CTA, fallback URL, and
  footer match the markdown shell.
- Custom script, iframe, event-handler, unsafe URL, and unsafe CSS inputs remain
  stripped.
- PII-bearing token values cannot inject markup.
- Subject behavior and credential exclusion remain unchanged.
- A sanitizer-empty fragment still yields a usable branded email.
- A legacy body with its own URL retains that URL and also receives the platform
  CTA.

### Plain text and telemetry

- Plain text includes platform identity, optional Coach attribution, custom body
  text, and the canonical assessment URL.
- Href-only authored tokens still yield the canonical text URL.
- Custom rendering retains `renderer: "custom_html"` and reports the correct
  `customHtmlMode`.
- Tokenless rollback fallback reports its PII-free reason and normal branded
  body source.

### Authoring UI

Cover both Campaign Wizard and Campaign Detail:

- branded-body label and explanatory copy;
- full-replacement rollback wording;
- tokenless rollback-fallback wording;
- optional versus required URL-token guidance;
- HTML-only collapsed status;
- subject/markdown-only edits preserve retained tokenless HTML during rollback;
- changing retained tokenless HTML during rollback requires adding a recognized
  URL token or clearing the field;
- correct save confirmation for HTML, markdown, and all-empty states; and
- unchanged upload, clear, length, and inline-error behavior.

### Activation audit

- Counts and live/soft-deleted classification are correct.
- Recognized-token classification uses the same helper as validation and render
  selection.
- Current, post-activation, and rollback composition classifications match the
  render-selection table.
- Output contains campaign IDs and template aliases but never raw HTML,
  invitation credentials, respondent data, email addresses, or Coach image
  URLs.
- The audit performs no create, update, delete, or flag operation.

Before merge, run the focused invitation renderer, notification service,
campaign create/update API, feature-flag, and two editor suites; scoped ESLint;
`git diff --check`; migration safety; changelog freshness; and
`CI=true npx next build --turbopack`.

## Rollout

1. Merge and deploy with
   `ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED` unset/default-off.
2. Read the current Production values of `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED`,
   `ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED`, and
   `ASSESSMENT_INVITE_BRANDED`. Stop unless the branded-renderer kill switch is
   verified inactive (`ASSESSMENT_INVITE_BRANDED` is not exactly `"0"`), then
   run the read-only override audit with the exact two custom-HTML flag values
   and retain its receipt.
3. If live overrides are zero, or every live override has been manually
   reviewed, separately authorize the new Production flag. Use the repository's
   established Vercel REST write path—`POST /v10/projects/{id}/env` with
   `type:"encrypted"` and `target:["production"]`, passing the correct
   Production `teamId` explicitly—then redeploy. Do not use piped
   `vercel env add`, the mis-paired local `.vercel` link, or
   `scripts/push-env-to-vercel.mjs`.
4. Confirm the exact deployment is ready, owns the production aliases, reports
   healthy database/auth posture, and has the expected flag state.
5. Let organic sends populate PII-free mode telemetry. Do not manufacture a
   customer invitation solely for rollout verification.

For value verification, an empty or `[SENSITIVE]` read for a
`sensitive`-typed flag means **unknown**, not off. Such a value requires a live
in-app check or a separately authorized REST rewrite as `type:"encrypted"`;
REST-written `encrypted` flags are readable. Never paste returned values.

The verified 2026-08-03 inventory—zero live and two soft-deleted overrides—is
evidence for planning, not permission to skip the activation-time audit.

## Rollback

Disable `ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED` and redeploy.

- Token-bearing legacy bodies temporarily regain complete replacement.
- Tokenless bodies use the branded markdown/template fallback and remain usable.
- Stored HTML is not modified, so re-enabling restores branded-body behavior.
- No database cleanup, migration rollback, outbox action, or resend is required.

Disabling `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` remains the broader capability
rollback and causes all stored custom HTML to be ignored.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Existing authored HTML visually conflicts with the 560px shell | Activation inventory and manual review for every live override; zero live rows at the latest audit |
| Legacy authored link duplicates the platform CTA | Preserve intent; disclose in inventory; do not heuristically rewrite HTML |
| UI claims branded composition while renderer is in rollback mode | Pass one server-derived behavior flag into both editors and test both modes |
| New tokenless body becomes unusable during rollback | Detect missing URL token and use branded markdown/template fallback |
| Markdown and custom shells drift | Extract one shared shell composer |
| Telemetry continuity breaks | Keep `renderer: "custom_html"` and add a separate mode field |
| Sanitization removes all authored content | Still send the branded shell and platform CTA |

## Acceptance criteria

1. With both flags enabled, every non-empty campaign custom-HTML invitation uses
   the same shared branded shell as a markdown invitation.
2. The platform CTA and fallback URL are present regardless of authored token
   usage.
3. Custom HTML remains raw in storage and passes escaped interpolation plus the
   existing strict sanitizer at render.
4. The subject remains separate and invitation credentials cannot enter it.
5. Plain text contains platform identity, optional Coach attribution, authored
   body text, and the canonical assessment URL.
6. Tokenless custom HTML is accepted only in branded mode and remains safe under
   rollback.
7. Existing stored HTML is neither rewritten nor cleared.
8. Editor summaries, guidance, and save confirmation accurately disclose the
   active mode and HTML-only overrides.
9. Telemetry distinguishes branded-body, full-replacement, and safe-fallback
   outcomes without PII.
10. Activation requires a fresh read-only inventory and manual review of every
    live override.
11. No schema, migration, production-data mutation, unrelated email behavior,
    or GH #228/#256/#257 scope is introduced.
