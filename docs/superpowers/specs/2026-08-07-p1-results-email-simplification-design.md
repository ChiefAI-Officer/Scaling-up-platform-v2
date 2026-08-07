# P1 Respondent Results Email Simplification

**Status:** Design approved in conversation; pending written-spec review

**Date:** 2026-08-07

**Scope:** Admin results-email settings, results-email first-name personalization, and existing-campaign email controls

**Source:** `/var/folders/gs/ydb0h0vd6672l0wjz6jgs7fw0000gn/T/handoff-p1-codex-deep-dive-2026-08-07.md`

## 1. Problem

The respondent-results email path already exists and works, but three narrow gaps make it confusing or unreachable:

1. The admin Results email card presents an approval gate and a new-campaign default as if they were two competing send controls.
2. `AssessmentCampaign.sendResultsToRespondent` and `AssessmentCampaign.notifyCoachOnCompletion` are stored at campaign creation but cannot be changed on an existing campaign.
3. The Results email editor advertises five insertion tokens even though none are currently substituted.

The work is a correction to existing behavior, not a new email system.

## 2. Outcome

After this work:

1. An admin sees plainly that the first Results email toggle lets coaches enable results emails for respondents, while the nested toggle only pre-selects that choice for new campaigns.
2. A coach can change the two existing email choices on an open existing campaign.
3. The Results email editor looks like a simple subject-and-message composer and offers exactly one working personalization token: `{{respondentFirstName}}`.

## 3. Simplicity Constraint

Only changes required for the three approved outcomes are in scope.

The implementation must reuse:

- the existing Prisma fields;
- the existing campaign PATCH route;
- the existing `CampaignDetail` component;
- the existing Wave D and Wave Q flags;
- the existing template approval hash;
- the existing results-email renderer and delivery path; and
- the existing immediate-save and echo-verification pattern used by Results on screen.

It must not add a schema field, migration, API route, feature flag, generic token engine, notification framework, settings framework, or unrelated refactor.

## 4. Goals

1. Clarify the relationship between admin availability, the new-campaign preset, and the coach's per-campaign choice.
2. Preserve all existing admin save, approval, and default-toggle behavior.
3. Make `sendResultsToRespondent` editable on existing DRAFT and ACTIVE campaigns.
4. Make `notifyCoachOnCompletion` editable through the same existing-campaign interface.
5. Keep CLOSED campaigns read-only.
6. Keep respondent-results email protected by both the Wave D flag and current hash-valid template approval.
7. Substitute `{{respondentFirstName}}` safely in the Results email subject and message.
8. Preserve the locked submit-time authorization, outbox, delivery-intent, and report-generation paths.

## 5. Non-goals

This release does not:

- add or change the Prisma schema;
- add a per-template gate for Results on screen;
- implement `{{templateName}}`, `{{tierLabel}}`, `{{tierMessage}}`, `{{perSectionList}}`, or any other Results email token;
- introduce rich-email composition, previews, blocks, attachments, or formatting controls;
- rewrite or migrate stored Results email copy;
- seed Results email copy;
- change public-quiz emails;
- change report content, scoring, tiers, findings, peer data, or branding;
- change invitation-email interpolation;
- change the coach-notification email content;
- change how saving edited Results email copy revokes approval;
- disable `sendResultsDefault` while copy is unapproved;
- add a new warning, status system, or save workflow;
- change delivery-intent reauthorization or retroactive delivery behavior; or
- reopen dropped Issue C.

## 6. Approaches Considered

### 6.1 Extend the existing paths directly — selected

Apply the wording and hierarchy correction in the existing admin components, extend the existing campaign PATCH and detail component with the two existing fields, and implement the one approved token inside the existing Results email renderer.

This is the smallest approach and follows the precedent already established by `showResultsOnScreen`.

### 6.2 Reuse the invitation-email interpolation system — rejected

Invitation emails and Results emails have different variable sets, rendering paths, and authorization rules. Sharing their interpolation layer would couple two paths to save a few lines of single-token substitution.

### 6.3 Introduce generic notification settings and email templating — rejected

A generic framework would add new interfaces and concepts without serving an approved requirement.

## 7. Approved Admin Experience

### 7.1 Results email composer

The existing Results email card remains one card with:

- description: **The email respondents receive with their results.**;
- **Subject**;
- **Message**;
- one insertion control labeled **First name**;
- the existing **Save** action;
- the availability toggle; and
- the nested new-campaign preset.

The subject and message remain ordinary text/Markdown fields styled as normal
email text, not code-style monospace. In the active
Settings UI, the insertion control keeps its existing behavior and appends
`{{respondentFirstName}}` to the Message field. The same exact token also works
when typed manually in either Subject or Message.

Tokenized placeholders may demonstrate:

```text
Subject: Your results are ready

Message:
Hi {{respondentFirstName}},

Your results are ready to view.
```

These are input examples only. This release does not seed or rewrite stored copy.

### 7.2 Approved availability wording

The first toggle uses:

**Allow coaches to enable results emails for respondents**

**Coaches decide separately for each campaign.**

This toggle remains the existing `resultsEmailContentApproved` control. It approves the currently saved copy and makes the campaign-level respondent-results choice available. It does not select that campaign choice or send an email by itself.

The nested Wave Q toggle uses:

**Pre-select for new campaigns**

**New campaigns start with respondent results emails enabled.**

This remains the existing `sendResultsDefault` control. It only determines the initial state of `sendResultsToRespondent` for a new campaign. Coaches can change the campaign choice.

### 7.3 Preserved admin behavior

- Saving edited Results email content keeps the existing behavior that clears approval.
- The approval toggle remains disabled while the Results email card is dirty.
- `sendResultsDefault` remains an independent immediate PATCH.
- `sendResultsDefault` remains settable while copy is unapproved and stored inertly until approval, as required by the accepted Wave Q design.
- Changing `sendResultsDefault` does not revoke Results email approval.
- No new approval warning or status line is added.

### 7.4 Active and rollback surfaces

The same wording and one-token contract apply to:

- `src/src/components/admin/template-editor/SettingsTab.tsx`; and
- the ED10 flag-off rollback surface in `src/src/components/admin/template-editor/MetadataTab.tsx`.

Settings offers the one existing insertion action. Metadata keeps its existing
read-only variable-list presentation but lists only
`{{respondentFirstName}}`. This prevents the rollback UI from restoring
misleading copy or unsupported token promises without adding new interaction
to the rollback surface.

## 8. Approved Existing-Campaign Experience

### 8.1 Perspective and hosts

The primary perspective is the coach portal's existing campaign detail page.

`CampaignDetail` is shared by:

- `src/src/app/(portal)/portal/assessments/[id]/page.tsx`; and
- `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx`.

Both hosts receive the same stored-state and capability wiring. The work does not create separate admin and coach implementations.

### 8.2 Email notifications card

For a DRAFT or ACTIVE campaign, the existing campaign detail page shows an **Email notifications** card when at least one existing email capability is available.

The card contains only the two existing choices:

1. **Email each respondent their results**
   - Supporting copy: **Applies to future submissions.**
   - Disabled when respondent-results email is not enabled for the selected template.
   - Disabled-state explanation: **Not available for this assessment. Ask an admin to enable respondent results email.**
2. **Email me when someone completes the assessment**

The card is separate from the existing Invitation email card. It does not add a new email type or copy editor.

The existing Results on screen card remains unchanged.

### 8.3 Persistence behavior

Each checkbox:

1. moves optimistically;
2. disables while its request is in flight;
3. PATCHes only its own existing field;
4. requires the returned campaign row to echo the requested stored value;
5. refreshes server state after success; and
6. reverts and shows the existing destructive toast pattern after an error or mismatched echo.

CLOSED campaigns do not render these editable controls, matching the existing PATCH route's `409` contract.

## 9. Server Contract

### 9.1 No schema change

The existing fields remain the source of truth:

```prisma
sendResultsToRespondent   Boolean @default(false)
notifyCoachOnCompletion   Boolean @default(false)
showResultsOnScreen       Boolean @default(false)
```

### 9.2 Campaign PATCH

`updateAssessmentCampaignSchema` and `PATCH /api/assessment-campaigns/[id]` admit:

```ts
sendResultsToRespondent?: boolean;
notifyCoachOnCompletion?: boolean;
```

The route follows the existing `showResultsOnScreen` pattern:

- `sendResultsToRespondent: true` is writable only when `waveDResultsEmailEnabled()` is true and `isResultsEmailApproved(template)` is true;
- `sendResultsToRespondent: false` may clear the stored choice while the Wave D results-email capability is active;
- `notifyCoachOnCompletion` is writable only when `waveDCoachNotifyEnabled()` is true;
- unauthorized or flag-gated fields are not written;
- the existing ownership, DRAFT/ACTIVE, CLOSED, audit, and response contracts remain unchanged; and
- the returned campaign row is the client-visible persistence echo.

The PATCH route must load only the template fields needed to compute live Results email approval. It must not expose approval hashes to the client.

### 9.3 Shared campaign projection

The shared campaign-detail projection includes:

```ts
sendResultsToRespondent: boolean;
notifyCoachOnCompletion: boolean;
```

Each host passes server-computed capability state to `CampaignDetail`:

- whether the Results email capability is active;
- whether the selected template's Results email content is currently approved; and
- whether coach completion notification is active.

The client does not recompute feature flags or approval hashes.

## 10. First-name Personalization Contract

### 10.1 Supported token

The Results email subject and message recognize exactly:

```text
{{respondentFirstName}}
```

No spaced alias or additional token is introduced.

The invited respondent's `firstName` is required by the current respondent model, so this contract adds no fallback word.

### 10.2 Subject safety

Before insertion into the plain-text subject, control characters are removed from the respondent first name. This follows the repository's existing email-subject safety pattern and prevents header injection.

### 10.3 Message safety

The Results email message continues through the existing escape-first Markdown-lite renderer.

The first name is inserted only as an HTML-escaped value and must not become Markdown or raw HTML. The resulting safe introduction remains followed by the existing report HTML.

### 10.4 Preserved content and approval

- Unsupported token-like text remains literal text; it is not interpreted or deleted.
- Stored authored copy is not migrated.
- The existing approval hash continues binding the authored subject and message, including the token marker.
- The rendered first name is recipient data, not template content, and does not change the template approval contract.
- Frozen outbox or delivery-intent rows continue carrying the rendered subject and HTML according to the existing delivery path.

## 11. Authorization and Failure Behavior

The existing submit-time gates remain authoritative:

- INVITED campaign;
- `campaign.sendResultsToRespondent`;
- Wave D results-email capability;
- current hash-valid template approval;
- respondent email;
- successful report construction; and
- the locked reauthorization checks used by the submit transaction and delivery-intent path.

No gate is relaxed.

If Results email rendering fails, the existing behavior remains:

1. skip that email;
2. log the render failure; and
3. allow the respondent's assessment submission to succeed.

Revoking template approval does not rewrite campaign fields. It makes respondent-results email unavailable and blocks delivery until approval becomes valid again.

## 12. Test Contract

### 12.1 Results email

Tests pin:

- first-name substitution in the subject;
- first-name substitution in the message;
- repeated occurrences of the exact token;
- subject control-character removal;
- HTML-safe message insertion;
- unchanged non-token content; and
- unsupported tokens remaining literal.

### 12.2 Campaign PATCH

Tests pin:

- both fields accepted by update validation;
- authorized true and false writes persist;
- respondent-results true is not written while the Wave D flag is off;
- respondent-results true is not written without current hash-valid template approval;
- coach notification is not written while its flag is off;
- the returned row echoes persisted state;
- audit logging retains the existing update behavior;
- DRAFT and ACTIVE remain editable;
- CLOSED remains `409`; and
- non-owners retain the existing not-found response.

### 12.3 Campaign UI

Tests pin:

- stored values render correctly;
- the Results email row is hidden when its capability is off;
- the Results email row is disabled when template approval is invalid;
- coach notification remains independently visible under its own flag;
- CLOSED campaigns render neither editable email control;
- each checkbox sends only its own PATCH field;
- a successful echo retains the optimistic value;
- an HTTP failure reverts it; and
- a mismatched echo reverts it.

### 12.4 Admin UI

Tests pin:

- the approved availability and preset wording;
- only the First name insertion control is offered;
- unsupported token controls and tokenized examples are absent;
- active Settings and rollback Metadata remain aligned; and
- existing Save, approval-disabled-while-dirty, approval clearing, and independent-default behavior remain unchanged.

### 12.5 Regression and validation

Run from `src/`:

```bash
npx eslint <changed files>
npx jest <targeted suites> --runInBand
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

The targeted regression set includes the existing Results email, approval, submit-time authorization, delivery-intent reauthorization, campaign PATCH, CampaignDetail, Settings, Metadata, and Results on screen suites.

No new E2E framework, fixtures, or broad refactor test program is introduced.

## 13. Approved Scope Summary

The release contains exactly:

1. Issue A as wording and visual hierarchy only;
2. Issue B as existing-field PATCH and existing-campaign UI reachability;
3. Issue D as one working `{{respondentFirstName}}` token and removal of four false UI promises; and
4. focused tests and required repository validation.

Everything else remains unchanged.
