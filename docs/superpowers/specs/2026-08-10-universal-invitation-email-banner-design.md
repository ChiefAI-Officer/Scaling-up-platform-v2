# Universal Assessment Invitation Email Banner Design

Date: 2026-08-10
Status: Approved in brainstorming; ready for implementation planning
Branch: `codex/invitation-email-banner-design`
Base: `origin/main` at `702d6c069d7f`
Scope: INVITED assessment email banner only

## Context

The standard assessment invitation email currently renders a Scaling Up logo,
an optional Coach image, and an Organization name in a purple banner. It does
not render the Coach's name visibly in that banner. The Coach name is used only
as image alternative text and as an optional body merge value.

Jeff's annotated QSP v1 email asks for two changes:

1. remove the Organization name (for example, `ABC Corp`) from the banner; and
2. show the Coach's name with the Coach image below the Scaling Up mark.

The screenshot came from Production campaign
`cmsjbqu1p0017yvuq5z46wdj7`. A read-only inspection found that the campaign had
no subject, Markdown, or custom-HTML override. The visible message therefore
came from the shared default invitation body and the visible banner came from
the standard branded shell.

A broader read-only Production inspection on 2026-08-10 found:

- 12 non-deleted INVITED campaigns, 11 of them ACTIVE;
- all 12 used the standard shell and none had a non-empty custom-HTML override;
- all 11 ACTIVE campaigns resolved a usable Coach image;
- the Organization line appeared on 7 ACTIVE campaigns; and
- the 4 ACTIVE Leadership Vision Alignment campaigns omitted it through the
  existing template-alias exception.

The missing visible Coach name is therefore universal across the active
standard invitation shell. The Organization line is present everywhere except
LVA. PUBLIC campaigns do not send invitation emails and are not part of this
surface.

Since that original renderer shipped, `main` has gained a shared invitation
shell and a default-off branded custom-HTML composition path through GH #220.
This design builds on those existing boundaries rather than creating a second
banner or new template data.

## Product decision

Every INVITED assessment email uses one fixed, platform-owned banner:

1. Scaling Up logo;
2. a subordinate Coach byline beneath it; and
3. no Organization/company line.

The Coach byline contains the selected Coach image when usable, the label
`Your coach`, and the Coach's full name. The Scaling Up identity remains first
and visually dominant. The Coach byline is an acknowledgement, not equal-weight
co-branding.

Coaches continue to author the subject and body. They do not receive banner
controls. Campaign custom HTML is a body fragment only; it cannot replace the
banner, CTA, fallback link, or footer while the new banner behavior is active.

## Approved visual direction

The approved layout is the **stacked Coach byline**:

```text
┌──────────────────────────────────────────────┐
│ Scaling Up                                   │
│                                              │
│ [Coach image]  YOUR COACH                    │
│                Martin Segnitz                │
└──────────────────────────────────────────────┘
```

The Organization name is absent from the banner. It may still appear in the
editable subject or body, for example:

> You've been invited to complete Quarterly Session Prep v1 for ABC Corp.

This preserves useful message context without presenting the Organization as
banner identity.

Alternatives reviewed and rejected:

- **Coach name only:** robust but discards the Coach image Jeff previously
  requested.
- **Horizontal split banner:** more compact but fragile in narrow email clients
  and visually promotes the Coach identity closer to equal weight with Scaling
  Up.

## Goals

1. Use the approved banner for every INVITED assessment invitation render.
2. Remove the Organization line from the banner for every current and future
   template alias.
3. Show a consistent Coach image-and-name byline with safe degradation.
4. Make Markdown and campaign custom HTML share exactly one shell.
5. Preserve editable subject/body behavior, including
   `{{organizationName}}`.
6. Keep initial sends, automatic fan-out, reminders, and resends on one render
   contract.
7. Ship dark, support a bounded canary, and preserve byte-identical flag-off
   output.

## Non-goals

- Results/report email redesign.
- PUBLIC assessment email behavior; PUBLIC campaigns do not send invitations.
- New banner controls in the template or campaign editor.
- A browser-style email preview subsystem.
- Rewriting existing invitation subjects or bodies.
- Removing `{{organizationName}}` from the token system.
- Rewriting or migrating stored `invitationBodyHtml` bytes.
- A database schema or Prisma migration.
- Changing recipients, invitation lifecycle, SMTP delivery, stable reminder
  links, or credential handling.
- Changing the accepted Coach-image host policy.

## Approaches considered

### 1. Refine the existing shared shell — selected

Extend the existing shared invitation shell with the approved Coach byline and
make every active body renderer compose through it.

This has the smallest durable surface, automatically covers all send paths,
requires no data migration, and prevents the Markdown and custom-HTML shells
from drifting.

### 2. Expand template-alias exceptions

Add every known template alias to the Organization-line suppression set and
add Coach-name markup separately.

Rejected because unknown and future aliases would fail open to the unwanted
Organization line. The result would encode a universal brand rule as an
ever-growing exception list.

### 3. Add configurable banner fields

Store banner controls on templates or campaigns and expose them in the editor.

Rejected because it contradicts the approved fixed-standard ownership model,
introduces schema/UI/validation work, and permits inconsistent or broken
branding.

## Component boundaries

### Coach byline resolver

Add one pure resolver that chooses the identity once and returns a complete
presentation model plus PII-free degradation metadata:

```ts
type InvitationCoachByline =
  | { mode: "image_name"; coachName: string; coachImageUrl: string }
  | { mode: "name_only"; coachName: string }
  | { mode: "scaling_up_only" };

type InvitationCoachResolution = {
  byline: InvitationCoachByline;
  logoRejectedReason:
    | "no-coach"
    | "missing-name"
    | "no-image"
    | "invalid-url"
    | null;
};
```

Selection order:

1. campaign creator Coach, when present;
2. otherwise the Organization owner Coach; and
3. otherwise no Coach identity.

The resolver derives name and image from the same selected Coach. It never
falls through to the Organization owner's image when a campaign creator exists
without a usable image.

Degradation rules:

- non-blank name plus safe HTTPS image → `image_name`;
- non-blank name plus missing/rejected image → `name_only`;
- no resolvable non-blank name → `scaling_up_only`, even if an image exists.

The existing HTTPS image gate remains the safety authority. Raw rejected URLs
never leave the resolver.

### Shared invitation shell

`buildInvitationEmailShell` remains the only HTML shell composer. Introduce a
new shell/chrome variant for the approved banner while retaining the existing
`legacy` and `waveP` output for rollback and flag-off byte identity.

When the new variant is active, the shell:

- renders the Scaling Up CID logo first;
- renders the Coach byline beneath it according to the resolved mode;
- never renders `organizationName` in the banner;
- uses the current Wave-P CTA dimensions;
- owns the primary CTA and visible fallback URL; and
- owns the current Scaling Up footer.

The existing `showOrgLine` and LVA alias exception remain only for the old
rollback variants. The new variant never consults them. They can be removed in
a later cleanup only after the new behavior becomes permanent.

The Coach image is decorative beside the visible Coach name and uses empty
alternative text to avoid duplicate screen-reader output. If the email client
blocks images, the Coach's visible name still identifies the sender.

### Body renderers

Both body sources terminate at the shared shell:

```text
Markdown body → escape + Markdown-lite rendering ─┐
                                                  ├→ shared shell → SMTP
Custom HTML → escape tokens → sanitize fragment ──┘
```

Custom HTML remains raw in storage. At send time it is interpolated with
escaped values, sanitized by the existing strict sanitizer, and passed to the
shell as a body fragment. It never becomes trusted shell markup.

If sanitization yields an empty fragment without throwing, the shell still
produces a usable invitation containing the banner, CTA, fallback URL, and
footer.

### Plain-text composer

The new banner mode uses one plain-text composer for Markdown and custom-HTML
bodies:

```text
Scaling Up Platform
Coach: Martin Segnitz      # omitted in scaling_up_only mode

<rendered body text>

Start the assessment: <canonical invitation URL>
```

The canonical URL is always present. The Organization appears only when the
authored body includes its merge token or literal text.

### Send orchestration

`prepareAssessmentInvitationEmail` remains the single composition decision
point. Initial invite, automatic fan-out, reminder, and resend entry points
continue to feed the same mailer contract. They do not select or implement
banner markup independently.

The subject remains separate, token-allowlisted, and unable to receive the
invitation credential.

## Feature controls

Add a three-lever, default-off gate:

- `WAVE_INVITATION_BANNER_ENABLED`
- `WAVE_INVITATION_BANNER_CANARY`
- `WAVE_INVITATION_BANNER_KILL`

The kill switch overrides the global enable and canary. The canary matches the
existing exact Organization-ID or Template-ID convention used by the Wave-P
invitation chrome.

When the new banner gate is off, current HTML and text output remain
byte-identical, including the LVA-only Organization suppression and the current
GH #220 custom-HTML mode selection.

When the new banner gate is on:

- the new shell variant is selected;
- non-empty custom HTML is always treated as a branded body fragment when the
  Wave-D custom-HTML capability is enabled;
- the legacy complete-replacement custom-HTML path is not selectable; and
- tokenless custom HTML remains safe because the shell owns the canonical CTA
  and URL.

This new gate therefore enforces the approved universal invariant directly. It
does not rely on operators keeping the separate default-off
`ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED` flag synchronized. That older
flag retains its current meaning only while the new banner gate is off.

The older `ASSESSMENT_INVITE_BRANDED=0` legacy-renderer switch likewise applies
only to non-universal legacy/Wave-P rendering. An explicitly selected
`universalBanner` bypasses that older switch; `WAVE_INVITATION_BANNER_KILL` is
the rollback control for universal rendering. This keeps custom-HTML body-only
authoring and delivery on the same shell-ownership decision.

Disabling or killing the new banner restores the current behavior without
changing stored data.

## Authoring experience

No banner controls are added.

When the new banner behavior is active, Campaign Wizard and Campaign Detail
describe the advanced field as **Custom HTML body (advanced)** and explain that
Scaling Up branding, available Coach identity, CTA, fallback link, and footer
are added automatically.

This authoring contract is INVITED-only. PUBLIC campaign pages and PATCH
validation do not derive body-only semantics from global, Organization, or
Template universal-banner enablement.

The invitation URL token remains optional in custom body HTML because the shell
owns the canonical link. Existing token-placement restrictions still apply to
any URL token the author chooses to include.

The standard invitation editor continues to expose only Subject and Message.
`{{organizationName}}` remains available in the token list. Existing template
and campaign copy is not rewritten, so Coach names or Organization names may
still appear in authored body text.

No email preview is added. The approved real-renderer visual acceptance
artifacts serve the design review, while the product editor remains focused on
content rather than platform-owned chrome.

## Error handling and security

- Missing or rejected Coach images degrade to name-only without failing send.
- Missing Coach identity degrades to Scaling Up-only without failing send.
- Authored HTML values remain escaped before interpolation.
- The existing strict sanitizer remains the sole authority for Coach-authored
  markup.
- Trusted shell composition happens after body sanitization.
- The invitation credential remains excluded from subject/header values.
- Unexpected sanitizer, composition, or SMTP errors continue through the
  existing strict failed-send path.
- No new catch converts a failed send into a successful send.
- No raw Coach name, image URL, respondent value, or invitation URL is added to
  logs or telemetry.
- The new-campaign client receives only canary IDs that the authenticated Coach
  can already access as an Organization or Template. The complete environment
  allowlist is never serialized to the browser.

## Telemetry

Retain the current renderer/body-source values for continuity. Add one PII-free
field for the resolved banner state:

```text
coachBylineMode = image_name | name_only | scaling_up_only
```

The field contains no Coach name or image URL. The resolver's PII-free
`logoRejectedReason` retains the existing `no-coach`, `no-image`, and
`invalid-url` diagnostics and adds `missing-name` for the new rule that an
image cannot render without a visible Coach name.

## Test strategy

### Pure identity resolution

- creator with valid name and image → `image_name`;
- creator with name and no image → `name_only`;
- creator with name and rejected image → `name_only`;
- no creator plus owner with valid name/image → owner `image_name`;
- creator without image never borrows the owner's image;
- blank selected-Coach name plus image → `scaling_up_only`; and
- neither creator nor owner → `scaling_up_only`.

### Shell rendering

- Scaling Up logo precedes Coach image and visible Coach name;
- label is exactly `Your coach`;
- Organization name is absent for every known alias;
- Organization name is absent for unknown/future aliases;
- image-and-name, name-only, and Scaling Up-only markup are correct;
- image markup has safe/escaped source and decorative alternative text;
- CTA, fallback URL, and footer remain present; and
- flag-off legacy/Wave-P snapshots remain byte-identical.

### Body and text paths

- Markdown and custom HTML compose through the same new shell;
- custom HTML cannot replace banner, CTA, fallback URL, or footer;
- token values cannot inject markup;
- sanitizer-empty custom HTML still yields a usable shell;
- `{{organizationName}}` continues to resolve in subject/body copy;
- the plain-text variant contains optional Coach attribution and the canonical
  invitation URL; and
- current custom-HTML behavior remains unchanged while the new banner gate is
  off.

### Send entry points

- initial invite;
- automatic fan-out;
- reminder; and
- resend.

Each entry point must resolve and forward the same Coach byline source data and
must not contain renderer-specific banner markup.

### Scope guards

- results/report email renderers remain byte-identical;
- PUBLIC campaign flows remain unchanged; and
- no migration/schema changes are introduced.

## Visual acceptance

Generate acceptance fixtures in a non-production environment through the real
application renderer for:

1. Coach image plus name;
2. name-only fallback;
3. Scaling Up-only fallback;
4. Markdown body;
5. custom-HTML body;
6. narrow/mobile width; and
7. image-blocked rendering.

Acceptance verifies hierarchy, wrapping, spacing, and the absence of the
Organization line. A hand-written replica is not sufficient evidence.

No customer email is sent for visual verification without separate explicit
authorization.

## Rollout

1. Merge and deploy with the new banner variables absent/default-off.
2. Run a fresh read-only Production audit of:
   - live and soft-deleted custom-HTML overrides;
   - current/post-activation/rollback custom-HTML modes;
   - selected Coach identity coverage; and
   - image/name degradation modes.
3. Stop if any live custom-HTML override has not been manually reviewed.
4. Enable a bounded canary by exact test Organization ID or Template ID and
   redeploy.
5. Confirm the exact deployment is Ready, owns the Production aliases, and
   reports healthy database/auth posture.
6. Verify real-renderer output for every visual-acceptance state and inspect
   PII-free byline-mode telemetry.
7. Enable globally only after canary acceptance.
8. Let organic sends confirm delivery behavior. Do not manufacture a customer
   invitation solely for rollout verification.

Production flag mutation, redeployment, or customer email delivery requires
separate explicit authorization and is not part of design or implementation
planning.

## Rollback

Set `WAVE_INVITATION_BANNER_KILL=1` or disable the global/canary enablement and
redeploy.

- Existing standard invites return to the current Wave-P shell.
- LVA returns to its existing alias-specific Organization suppression.
- Custom HTML returns to the current GH #220 flag-controlled mode.
- Stored template/campaign copy and raw HTML remain unchanged.
- No database cleanup, migration rollback, outbox replay, or resend is needed.

## Acceptance criteria

1. Every enabled INVITED invitation uses the approved stacked banner.
2. Scaling Up appears first and remains visually dominant.
3. The selected Coach's image and visible full name come from the same Coach.
4. Missing/rejected images degrade to name-only; missing identity degrades to
   Scaling Up-only.
5. No Organization name is automatically rendered in the banner for any
   current, unknown, or future template alias.
6. `{{organizationName}}` remains available and functional in editable subject
   and body copy.
7. Markdown and custom-HTML bodies share one shell.
8. Custom HTML cannot replace platform-owned banner, CTA, fallback URL, or
   footer while the new banner is active.
9. Initial sends, automatic sends, reminders, and resends follow the same
   contract.
10. Plain-text invitations include optional Coach attribution and the canonical
    assessment URL.
11. Results/report emails and PUBLIC flows remain unchanged.
12. Flag-off output is byte-identical, and rollback requires no data mutation.
13. No schema migration or new banner editor is introduced.

## Approved decisions summary

- Visual direction: stacked Coach byline (Option A).
- Organization name: remove from banner only; retain the merge token for body
  copy.
- Banner ownership: fixed platform standard; not editor-configurable.
- Missing-image behavior: name-only; never mix identities.
- Missing-creator behavior: Organization owner fallback.
- Custom HTML: body-only under the universal banner.
- Scope: invitation family only; results/report emails excluded.
- Architecture: refine the existing shared invitation shell.
