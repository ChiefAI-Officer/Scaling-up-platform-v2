# Admin Coach Password Actions — Design

**Date:** 2026-08-17  
**Status:** Approved in conversation; implementation authorized  
**Scope:** Coach-detail password actions, coach notifications, 15-minute admin reset links, and real JWT-session revocation

## Goal

Add a **Set Password** action to the coach-detail header immediately before the existing **Send Password Reset** action. Administrators may replace a coach's password at any time. The coach receives a security notification telling them that an administrator set the password and that they must contact that administrator for the new access details. The password itself is never emailed.

Harden the existing **Send Password Reset** action so it sends a dedicated reset email whose action link expires after 15 minutes. A completed password change revokes the coach's existing signed-in sessions.

## Context

The current coach creation route creates or links a `User`, then emails a password-setup link. The coach-detail page already exposes **Send Password Reset**, but that route:

- permits both `ADMIN` and `STAFF`;
- issues a 24-hour token;
- reuses the new-account welcome email for existing coaches;
- changes no account state until the coach submits the reset form;
- does not write a password-reset audit record; and
- cannot revoke active sessions because authentication uses 30-day JWT sessions.

NextAuth v4's Credentials provider requires JWT sessions. The app's `Session` table is therefore not the source of truth for current credential sessions, and deleting rows from that table would not sign a coach out.

## Locked Product Decisions

1. Header order is **Set Password · Send Password Reset · Edit Coach**.
2. **Set Password** is `ADMIN`-only.
3. **Send Password Reset** remains available to `ADMIN` and `STAFF`.
4. An administrator may set a coach password at any time.
5. The admin-set password becomes the coach's permanent current credential immediately.
6. Setting the password revokes the coach's active sessions.
7. The final admin gate is a warning dialog with **Set Password & Sign Out Coach**. Typing the coach's email is not required.
8. The coach receives a non-actionable notification after an admin sets the password. It contains no password and no reset link; it tells the coach to contact their administrator for the new password/access details.
9. If that notification fails, the password remains changed. The admin receives a partial-success warning and a **Retry Notification** action that cannot change the password again.
10. **Send Password Reset** sends an actionable link with a strict 15-minute lifetime.
11. Sending a reset link does not change the password or revoke sessions. Those effects occur only after the coach successfully submits a new password.
12. Automatic new-coach welcome/setup emails are outside this button-focused change and retain their existing lifetime and behavior.

## Authorization and Target Safety

### Set Password

- Caller must resolve through the live API actor gate and have role exactly `ADMIN`.
- `STAFF` and `COACH` callers receive `403`.
- The target coach must exist, be live, and have a linked live `User`.
- The linked target user must have role exactly `COACH`.
- A coach profile linked to an `ADMIN` or `STAFF` identity returns `409` with a safe message directing the operator to the administrator-user management path. This prevents privilege-bearing credentials from being replaced through a coach-profile route.
- Missing or inconsistent coach/user linkage returns `409`; the credential route does not silently create, relink, or change identity roles.

### Send Password Reset

- Caller remains `ADMIN` or `STAFF` through the existing privileged-role gate.
- The same live-coach, linked-live-user, and target-role safeguards apply.

## User Experience

### Set Password modal

The first modal step contains:

- Coach name and email
- New password
- Confirm password
- Show/hide controls
- Existing password-policy hint
- **Cancel** and **Continue**

`Continue` performs client validation only. It never sends or persists the password.

The confirmation step states:

> This will replace the coach's current password and sign them out on all devices. The coach will be notified to contact their admin for the new password.

Actions are **Back** and **Set Password & Sign Out Coach**. The destructive action is disabled while submitting and cannot be double-submitted.

On complete success, the modal clears all password state, closes, and shows **Password set and coach notified**.

On partial email failure, the modal clears all password state and shows a persistent warning: **Password set, but notification failed.** The only follow-up mutation is **Retry Notification**.

### Send Password Reset confirmation

Replace the native browser confirmation with an application dialog that states:

- the recipient email;
- the link expires in 15 minutes; and
- the current password remains valid until the coach completes the reset.

The final action is **Send Reset Email**. Success and failure remain visible without relying on a transient browser prompt.

## API Design

### `POST /api/coaches/[id]/set-password`

Request:

```json
{
  "newPassword": "string",
  "confirmNewPassword": "string"
}
```

Validation reuses the shared strong-password rules: 8–128 characters with lowercase, uppercase, number, and special character, plus equality confirmation.

Successful response:

```json
{
  "success": true,
  "passwordUpdated": true,
  "notificationSent": true
}
```

Partial-success response remains HTTP `200` because the primary credential operation succeeded:

```json
{
  "success": true,
  "passwordUpdated": true,
  "notificationSent": false,
  "warning": "Password set, but notification failed."
}
```

The server must never echo the submitted password or hash.

### `POST /api/coaches/[id]/password-set-notification`

Admin-only, bodyless retry route. It re-runs target safety checks and sends only the password-set notification. It never accepts a password, changes a hash, increments `authVersion`, or replays the password mutation.

### `POST /api/coaches/[id]/send-password-reset`

Retain the existing route and privilege model, but:

- validate the linked user and role;
- generate the signed token with a `900`-second TTL;
- send the dedicated existing-account reset template; and
- return no token or reset URL to the client.

No credential, version, or session state changes when this route runs.

### `POST /api/auth/reset-password`

After token verification and strong-password validation, atomically:

- update `passwordHash`;
- increment `authVersion`; and
- write a `PASSWORD_RESET` audit event.

The password-hash fingerprint already embedded in reset tokens makes the successful link and all older links unusable after the hash changes.

## Credential Mutation and Audit Boundary

Create one small server-only credential rotation helper that accepts a transaction client, target user ID, prepared bcrypt hash, audit action, actor, and safe metadata. It performs the password update, `authVersion` increment, and audit insert in the same database transaction.

The helper is used by:

- admin **Set Password** (`ADMIN_PASSWORD_SET`);
- token reset completion (`PASSWORD_RESET`);
- authenticated self-service change (`PASSWORD_CHANGE`); and
- accepted-invite replacement of an existing user's credential (`PASSWORD_CHANGE` or the route's existing invite-specific audit plus version increment).

Creating a brand-new user starts at `authVersion = 0` and does not require an increment because no earlier JWT exists.

Audit is fail-closed for credential changes: if the audit row cannot be written, the password and version updates roll back. Audit metadata may include actor role, route mechanism, and target coach ID, but never plaintext passwords, password hashes, reset tokens, or reset URLs.

## JWT Session Revocation

Add `User.authVersion Int @default(0)` with an additive migration.

At successful credentials sign-in:

- return the live `authVersion` from `authorize()`;
- store it in the encrypted JWT.

On subsequent JWT/session checks:

- load the live user's `authVersion` and liveness state;
- treat a missing legacy token version as `0`;
- mark the token/session revoked when the user is missing, soft-removed, or the versions differ.

Treating missing pre-deployment versions as `0` preserves existing sessions for untouched users while ensuring that incrementing a user's database version invalidates every pre-deployment token for that user.

Every protected server boundary must reject a revoked session:

- dashboard layout;
- coach portal layout through `requireAuth` / `requireCoach`;
- `getApiActor` / `getUserForApiRoute`; and
- protected API routes that currently call `getServerSession` directly.

Middleware may perform the initial cookie-presence redirect, but the live server boundary is authoritative before protected data is served or a mutation occurs. A structural regression test prevents protected coach APIs from trusting middleware alone.

The revoked cookie need not be centrally deleted to revoke access. The next protected request redirects to login or returns `401`; successful login with the current password issues a JWT carrying the current version.

## Email Design

### Password set by administrator

Subject: **Your Scaling Up password was changed by an administrator**

Content:

- address the coach by name;
- state that an administrator set a new password;
- state that active sessions were signed out;
- tell the coach to contact their administrator for the new password/access details;
- advise contacting support/admin if unexpected;
- contain no password, reset token, or action link.

### Password reset requested by administrator/staff

Subject: **Reset your Scaling Up password**

Content:

- state that an administrator requested a password reset;
- provide one **Reset Password** CTA;
- state that the link expires in 15 minutes;
- state that the current password remains valid until the reset is completed;
- advise ignoring the email or contacting the administrator if unexpected.

These are separate functions from the new-coach welcome email so copy and telemetry reflect the actual event.

## Failure Semantics

- Invalid input: `400`, no database or email change.
- Unauthenticated: `401`.
- Wrong caller role: `403`.
- Coach/user missing: `404` for missing coach, `409` for invalid linkage or privileged target identity.
- Credential transaction failure: `500`, no password/version/audit change and no notification attempt.
- Admin-set notification failure after commit: HTTP `200` partial success with `notificationSent: false`; password/version/audit remain committed.
- Notification retry failure: `502` or existing email-service failure shape; credential remains untouched.
- Reset-email failure: `500`; no persistent account state changed.
- Expired, tampered, wrong-email, or password-fingerprint-mismatched reset tokens return the same generic invalid/expired message.
- Rate limiting applies to set-password, notification retry, reset-send, and public reset submission.

## Feature Flag and Rollback

Add:

- `WAVE_COACH_PASSWORD_ACTIONS_ENABLED`
- `WAVE_COACH_PASSWORD_ACTIONS_KILL`

The flag gates the new **Set Password** UI/routes and the revised admin reset-email UX/15-minute TTL. Flag off preserves the existing visible reset flow. Production launch requires enabled `1` and kill unset/false.

`authVersion` enforcement and already-recorded increments are an unconditional security invariant once deployed. The kill switch must never resurrect a revoked session. The additive column is safe to leave in place during rollback.

## Tests and Acceptance

### Schema and migration

- Migration safety gate accepts the additive non-null integer with default.
- Prisma client exposes `authVersion`.

### Set Password API

- `401` unauthenticated; `403` staff/coach; admin succeeds.
- Missing coach, missing user link, deleted user, and privileged target identity fail safely.
- Weak/mismatched password rejected before bcrypt/database work.
- bcrypt uses cost `12`.
- password update, version increment, and audit are one transaction.
- audit failure rolls back the credential change.
- response, audit, logs, and email contain no password/hash.
- email success and partial-failure response shapes are pinned.
- retry route sends email without calling credential mutation.

### Send Password Reset

- admin and staff permitted; coach denied.
- generated token uses exactly `900` seconds.
- dedicated email copy says 15 minutes and does not use welcome copy.
- no state changes merely from sending.
- expired and tampered token coverage remains green.

### Session revocation

- sign-in JWT carries the current version.
- missing legacy version behaves as `0`.
- matching version remains live.
- incremented version revokes old JWTs across portal, dashboard, and API gates.
- a fresh login after rotation receives the new version.
- password reset and self-change increment the version.
- mutation routes cannot rely only on middleware cookie presence.

### UI

- admin sees **Set Password** in the approved header position; staff does not.
- both authorized roles retain **Send Password Reset**.
- password fields clear on cancel, success, and partial success.
- final confirmation text and button label are pinned.
- double submission is prevented.
- success, partial notification failure, retry success/failure, and reset-send states render accessibly.
- desktop and 320px mobile header/action layout has no horizontal overflow.

### Release verification

- changed-file ESLint;
- focused Jest suites;
- repository test suite;
- migration safety check;
- production-equivalent `CI=true npx next build --turbopack`;
- Preview visual review for desktop and mobile;
- Preview end-to-end credential/session/email test with a disposable coach;
- PR required checks;
- Production deployment readiness and health checks;
- controlled Production smoke using a disposable/test coach only, never the pictured real coach.

## Non-goals

- Emailing or displaying the admin-set password after submission
- Forcing the coach to change an admin-set password
- Blocking normal access beyond revoking the old sessions
- Letting staff set passwords
- Creating or relinking missing user identities from the credential route
- Replacing Credentials authentication or migrating to database sessions
- Changing new-coach welcome/setup behavior
- Building general administrator-user credential management

