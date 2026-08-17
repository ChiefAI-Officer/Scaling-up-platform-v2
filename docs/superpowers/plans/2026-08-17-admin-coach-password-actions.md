# Admin Coach Password Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only coach password setter, a 15-minute admin-triggered reset flow, coach security notifications, auditable credential rotation, and real revocation of stale JWT sessions.

**Architecture:** Store an additive `User.authVersion`, copy it into JWTs, and reject protected requests whose token version no longer matches the live user. All existing-user password replacements share one transactional credential-rotation helper; the admin setter commits credential/audit state before separately attempting its non-actionable coach notification.

**Tech Stack:** Next.js App Router, NextAuth v4.24.13 Credentials/JWT sessions, Prisma/PostgreSQL, bcryptjs, Zod, React/Radix Dialog, Jest/Testing Library, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-17-admin-coach-password-actions-design.md`

## Global Constraints

- Header order: **Set Password · Send Password Reset · Edit Coach**.
- `Set Password` is `ADMIN`-only; `Send Password Reset` remains `ADMIN` + `STAFF`.
- Set-password target user must be live, linked, and exactly role `COACH`.
- Passwords/hashes/tokens/URLs never appear in responses, email notices, audit payloads, or logs.
- Strong password policy remains 8–128 chars plus lowercase, uppercase, number, and special character; bcrypt cost remains `12`.
- Admin reset links expire after exactly `900` seconds; new-coach setup and public forgot-password behavior stay unchanged.
- Credential update, `authVersion` increment, and audit insert are one fail-closed transaction.
- A set-password email failure is partial success and cannot roll back or replay the credential mutation.
- Feature UI/routes are default-off behind `WAVE_COACH_PASSWORD_ACTIONS_ENABLED` and hard-killed by `WAVE_COACH_PASSWORD_ACTIONS_KILL`.
- Persisted `authVersion` enforcement is unconditional; a kill switch never resurrects stale JWTs.
- No new runtime dependencies.

---

### Task 1: Add feature flags and credential-version persistence

**Files:**
- Create: `src/src/lib/auth/coach-password-actions-flags.ts`
- Create: `src/src/__tests__/unit/coach-password-actions-flags.test.ts`
- Modify: `src/prisma/schema.prisma`
- Create: `src/prisma/migrations/20260817160000_add_user_auth_version/migration.sql`
- Modify: `src/.env.example`

**Interfaces:**
- Produces: `isCoachPasswordActionsEnabled(): boolean`
- Produces: Prisma `User.authVersion: number`

- [ ] **Step 1: Write the failing flag tests**

```ts
describe("coach password action flags", () => {
  it("is default-off", () => {
    delete process.env.WAVE_COACH_PASSWORD_ACTIONS_ENABLED;
    delete process.env.WAVE_COACH_PASSWORD_ACTIONS_KILL;
    expect(isCoachPasswordActionsEnabled()).toBe(false);
  });

  it("enables globally and lets kill win", () => {
    process.env.WAVE_COACH_PASSWORD_ACTIONS_ENABLED = "1";
    expect(isCoachPasswordActionsEnabled()).toBe(true);
    process.env.WAVE_COACH_PASSWORD_ACTIONS_KILL = "1";
    expect(isCoachPasswordActionsEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the flag test and verify RED**

Run: `npx jest src/__tests__/unit/coach-password-actions-flags.test.ts --runInBand`
Expected: FAIL because the flag module does not exist.

- [ ] **Step 3: Implement the flag helper**

```ts
function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isCoachPasswordActionsEnabled(): boolean {
  if (isOn(process.env.WAVE_COACH_PASSWORD_ACTIONS_KILL)) return false;
  return isOn(process.env.WAVE_COACH_PASSWORD_ACTIONS_ENABLED);
}
```

- [ ] **Step 4: Add the schema field and additive migration**

Add to `User`:

```prisma
authVersion Int @default(0)
```

Migration body:

```sql
ALTER TABLE "users"
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
```

Document both environment variables in `src/.env.example`, defaulting the capability off.

- [ ] **Step 5: Validate schema, migration, and flags**

Run:

```bash
npx prisma validate
npx prisma generate
node scripts/check-migration-safety.mjs
npx jest src/__tests__/unit/coach-password-actions-flags.test.ts --runInBand
```

Expected: schema valid, migration safety green, flag tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/prisma/schema.prisma src/prisma/migrations/20260817160000_add_user_auth_version/migration.sql src/.env.example src/src/lib/auth/coach-password-actions-flags.ts src/src/__tests__/unit/coach-password-actions-flags.test.ts
git commit -m "feat(auth): add coach password action flag and auth version"
```

---

### Task 2: Centralize transactional credential rotation

**Files:**
- Create: `src/src/lib/auth/password-credentials.ts`
- Create: `src/src/__tests__/lib/auth/password-credentials.test.ts`
- Modify: `src/src/lib/audit.ts`

**Interfaces:**
- Consumes: Prisma `User.authVersion`
- Produces:

```ts
type CredentialAuditAction = "ADMIN_PASSWORD_SET" | "PASSWORD_RESET" | "PASSWORD_CHANGE";

async function rotateUserPassword(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    passwordHash: string;
    action: CredentialAuditAction;
    performedBy: string;
    changes: Record<string, unknown>;
  }
): Promise<void>;
```

- [ ] **Step 1: Write failing transaction-helper tests**

Cover exact update and audit calls, including:

```ts
expect(tx.user.update).toHaveBeenCalledWith({
  where: { id: "user-1" },
  data: {
    passwordHash: "$2a$12$newhash",
    authVersion: { increment: 1 },
  },
});
expect(tx.auditLog.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    entityType: "User",
    entityId: "user-1",
    action: "ADMIN_PASSWORD_SET",
    performedBy: "admin@example.com",
  }),
});
expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain("plaintext");
```

- [ ] **Step 2: Run the helper test and verify RED**

Run: `npx jest src/__tests__/lib/auth/password-credentials.test.ts --runInBand`
Expected: FAIL because `rotateUserPassword` does not exist.

- [ ] **Step 3: Implement the minimal server-only helper**

```ts
import "server-only";
import type { Prisma } from "@prisma/client";

export async function rotateUserPassword(
  tx: Prisma.TransactionClient,
  input: RotateUserPasswordInput
): Promise<void> {
  await tx.user.update({
    where: { id: input.userId },
    data: {
      passwordHash: input.passwordHash,
      authVersion: { increment: 1 },
    },
  });
  await tx.auditLog.create({
    data: {
      entityType: "User",
      entityId: input.userId,
      action: input.action,
      performedBy: input.performedBy,
      changes: JSON.stringify(input.changes),
    },
  });
}
```

Add the three credential actions to `AuditAction` so route code cannot drift to untyped strings.

- [ ] **Step 4: Run focused tests**

Run: `npx jest src/__tests__/lib/auth/password-credentials.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/auth/password-credentials.ts src/src/lib/audit.ts src/src/__tests__/lib/auth/password-credentials.test.ts
git commit -m "feat(auth): centralize audited password rotation"
```

---

### Task 3: Revoke stale JWT sessions at every protected boundary

**Files:**
- Modify: `src/src/lib/auth/auth.ts`
- Modify: `src/src/lib/auth/authorization.ts`
- Modify: `src/src/app/(dashboard)/layout.tsx`
- Modify: `src/src/app/api/portal/profile/route.ts`
- Modify: `src/src/app/api/portal/profile/image/route.ts`
- Modify: `src/src/app/api/portal/follow-up/route.ts`
- Modify: `src/src/__tests__/lib/auth/auth-surface-guard.test.ts`
- Create: `src/src/__tests__/lib/auth/session-revocation.test.ts`
- Modify: `src/src/__tests__/lib/auth/get-api-actor-liveness.test.ts`

**Interfaces:**
- Consumes: live `User.authVersion`
- Produces: JWT `authVersion: number`, JWT/session `sessionRevoked?: boolean`
- Produces: `isSessionRevoked(session): boolean`

- [ ] **Step 1: Write failing JWT/session tests**

Extract `authorize`, `jwt`, and `session` callbacks from `authOptions`, then pin:

```ts
expect((await authorize(validCredentials))?.authVersion).toBe(4);

const matching = await jwt({ token: { id: "u1", authVersion: 4 }, user: undefined });
expect(matching.sessionRevoked).not.toBe(true);

const legacyAtZero = await jwt({ token: { id: "u1" }, user: undefined });
expect(legacyAtZero.sessionRevoked).not.toBe(true);

db.user.findUnique.mockResolvedValue({ authVersion: 5, deletedAt: null });
const stale = await jwt({ token: { id: "u1", authVersion: 4 }, user: undefined });
expect(stale.sessionRevoked).toBe(true);
```

Also pin missing/deleted users as revoked and assert that `session()` forwards `sessionRevoked`.

- [ ] **Step 2: Run the revocation tests and verify RED**

Run: `npx jest src/__tests__/lib/auth/session-revocation.test.ts --runInBand`
Expected: FAIL because JWTs do not carry or verify `authVersion`.

- [ ] **Step 3: Implement JWT versioning and legacy-zero compatibility**

Extend NextAuth types and the credentials return value. In `jwt()`:

```ts
if (user) {
  token.id = user.id;
  token.role = user.role;
  token.authVersion = user.authVersion;
  token.sessionRevoked = false;
  return token;
}

const live = await db.user.findUnique({
  where: { id: token.id },
  select: { authVersion: true, deletedAt: true },
});
const tokenVersion = typeof token.authVersion === "number" ? token.authVersion : 0;
token.sessionRevoked = !live || Boolean(live.deletedAt) || live.authVersion !== tokenVersion;
token.authVersion = tokenVersion;
return token;
```

Forward the boolean from JWT to session without exposing the version itself.

- [ ] **Step 4: Enforce the revocation marker in server gates**

Add:

```ts
export function isSessionRevoked(session: Session | null): boolean {
  return Boolean(session && "sessionRevoked" in session && session.sessionRevoked);
}
```

`requireAuth`, `getUserForApiRoute`, and dashboard layout treat revoked sessions as unauthenticated. Replace the three portal API raw-session gates with `getApiActor()` plus coach ownership resolution so stale JWTs cannot mutate/read through them. Update the auth-surface allowlist comments/categories accordingly; do not add new `[JWT-ONLY]` exceptions.

- [ ] **Step 5: Run auth boundary tests**

Run:

```bash
npx jest src/__tests__/lib/auth/session-revocation.test.ts src/__tests__/lib/auth/get-api-actor-liveness.test.ts src/__tests__/lib/auth/auth-surface-guard.test.ts src/__tests__/lib/authorization.test.ts --runInBand
```

Expected: PASS; no protected route is newly allowlisted as JWT-only.

- [ ] **Step 6: Commit**

```bash
git add src/src/lib/auth/auth.ts src/src/lib/auth/authorization.ts 'src/src/app/(dashboard)/layout.tsx' src/src/app/api/portal/profile/route.ts src/src/app/api/portal/profile/image/route.ts src/src/app/api/portal/follow-up/route.ts src/src/__tests__/lib/auth
git commit -m "feat(auth): revoke stale credential JWTs"
```

---

### Task 4: Implement admin Set Password APIs and coach notification

**Files:**
- Modify: `src/src/lib/validations.ts`
- Modify: `src/src/services/notifications.ts`
- Create: `src/src/app/api/coaches/[id]/set-password/route.ts`
- Create: `src/src/app/api/coaches/[id]/password-set-notification/route.ts`
- Create: `src/src/__tests__/api/coaches-set-password.test.ts`
- Modify: `src/src/__tests__/services/notifications.test.ts`

**Interfaces:**
- Consumes: `rotateUserPassword`, `isCoachPasswordActionsEnabled`, `strongPasswordSchema`
- Produces: `adminSetCoachPasswordSchema`
- Produces: `sendCoachPasswordSetByAdminEmail({ coachEmail, coachName }): Promise<void>`

- [ ] **Step 1: Write failing API authorization, safety, and transaction tests**

Pin `404` when flag off, `401`, `403` for staff/coach, `404` missing coach, `409` missing link/deleted target/privileged target, validation `400`, and admin success. Success expectations include:

```ts
expect(bcrypt.hash).toHaveBeenCalledWith("StrongPass1!", 12);
expect(rotateUserPassword).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({
    userId: "user-1",
    action: "ADMIN_PASSWORD_SET",
    performedBy: "admin@example.com",
  })
);
expect(JSON.stringify(responseBody)).not.toContain("StrongPass1!");
```

Pin email success and partial success (`passwordUpdated: true`, `notificationSent: false`, HTTP `200`). Pin retry route never calling bcrypt, transaction, or credential rotation.

- [ ] **Step 2: Write failing notification-content tests**

Capture the SMTP payload and assert subject/body contain administrator-change and contact-admin language, while excluding the supplied password, `passwordHash`, reset URL, and token-shaped text.

- [ ] **Step 3: Run tests and verify RED**

Run: `npx jest src/__tests__/api/coaches-set-password.test.ts src/__tests__/services/notifications.test.ts --runInBand`
Expected: new route/module exports missing.

- [ ] **Step 4: Implement schema, target guard, transaction, and notification**

Schema:

```ts
export const adminSetCoachPasswordSchema = z.object({
  newPassword: strongPasswordSchema,
  confirmNewPassword: z.string().min(1, "Please confirm the password"),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  path: ["confirmNewPassword"],
  message: "Passwords do not match",
});
```

The set route hashes only after all flag/auth/target/validation gates. Use `db.$transaction(async tx => rotateUserPassword(tx, ...))`. After commit, call the dedicated notification and convert only that failure into the partial-success response.

The retry route repeats flag/auth/target checks and calls only `sendCoachPasswordSetByAdminEmail`.

- [ ] **Step 5: Run focused API and email tests**

Run: `npx jest src/__tests__/api/coaches-set-password.test.ts src/__tests__/services/notifications.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/src/lib/validations.ts src/src/services/notifications.ts 'src/src/app/api/coaches/[id]/set-password/route.ts' 'src/src/app/api/coaches/[id]/password-set-notification/route.ts' src/src/__tests__/api/coaches-set-password.test.ts src/src/__tests__/services/notifications.test.ts
git commit -m "feat(coaches): add audited admin password setter"
```

---

### Task 5: Build the approved coach-header UI

**Files:**
- Create: `src/src/components/coaches/set-password-button.tsx`
- Modify: `src/src/components/coaches/send-password-reset-button.tsx`
- Modify: `src/src/app/(dashboard)/coaches/[id]/page.tsx`
- Create: `src/src/__tests__/components/coaches/password-actions.test.tsx`

**Interfaces:**
- Consumes: set-password and notification-retry API response contracts
- Consumes: server-side `isCoachPasswordActionsEnabled()` and `isAdmin`
- Produces: `SetPasswordButton({ coachId, coachName, coachEmail })`
- Extends: `SendPasswordResetButton` with an enhanced-dialog flag while retaining flag-off behavior

- [ ] **Step 1: Write failing component and page-structure tests**

Pin admin render order, staff absence, form validation, password clearing, confirmation copy, disabled double-submit, success, partial warning, retry, and reset-dialog 15-minute copy. Include a source/SSR structure assertion that the set button precedes reset and edit.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npx jest src/__tests__/components/coaches/password-actions.test.tsx --runInBand`
Expected: FAIL because `SetPasswordButton` is missing.

- [ ] **Step 3: Implement accessible Radix dialogs**

Use existing `Dialog`, `Input`, `Label`, and `Button`. Keep local state:

```ts
type Stage = "form" | "confirm";
type SubmitState = "idle" | "saving" | "success" | "partial" | "error";
```

The form step validates matching non-empty values before advancing. The confirm step submits once, immediately clears credential fields after any successful password update, and retains only notification status. `Retry Notification` POSTs to the bodyless retry route.

Render action container responsively:

```tsx
<div className="flex flex-wrap justify-end gap-2">
```

Only render `SetPasswordButton` when `isAdmin && enabled`. When flag off, render the legacy reset component behavior unchanged.

- [ ] **Step 4: Run UI tests and changed-file ESLint**

Run:

```bash
npx jest src/__tests__/components/coaches/password-actions.test.tsx --runInBand
npx eslint src/src/components/coaches/set-password-button.tsx src/src/components/coaches/send-password-reset-button.tsx 'src/src/app/(dashboard)/coaches/[id]/page.tsx'
```

Expected: PASS/no diagnostics.

- [ ] **Step 5: Commit**

```bash
git add src/src/components/coaches/set-password-button.tsx src/src/components/coaches/send-password-reset-button.tsx 'src/src/app/(dashboard)/coaches/[id]/page.tsx' src/src/__tests__/components/coaches/password-actions.test.tsx
git commit -m "feat(coaches): add password actions to coach header"
```

---

### Task 6: Harden reset, self-change, invite, and rate-limit paths

**Files:**
- Modify: `src/src/app/api/coaches/[id]/send-password-reset/route.ts`
- Modify: `src/src/app/api/auth/reset-password/route.ts`
- Modify: `src/src/app/api/auth/change-password/route.ts`
- Modify: `src/src/app/api/auth/accept-invite/route.ts`
- Modify: `src/src/services/notifications.ts`
- Modify: `src/src/lib/global-rate-limit.ts`
- Modify: `src/src/__tests__/api/coaches-password-reset-url.test.ts`
- Modify: `src/src/__tests__/api/auth.test.ts`
- Modify: `src/src/__tests__/api/accept-invite-revive.test.ts`
- Modify: `src/src/__tests__/unit/global-rate-limit.test.ts`

**Interfaces:**
- Consumes: `rotateUserPassword`, flag helper, live-version JWT contract
- Produces: `sendCoachPasswordResetEmail({ coachEmail, coachName, resetUrl, expiresInMinutes: 15 })`

- [ ] **Step 1: Write failing reset TTL/email/state tests**

Pin the enhanced route to:

```ts
expect(generatePasswordResetToken).toHaveBeenCalledWith(
  "coach@example.com",
  "$2a$12$hash",
  15 * 60
);
expect(sendCoachPasswordResetEmail).toHaveBeenCalledWith(
  expect.objectContaining({ expiresInMinutes: 15 })
);
expect(db.user.update).not.toHaveBeenCalled();
```

Retain a flag-off regression expecting the old 24-hour welcome-email call.

- [ ] **Step 2: Write failing credential-version tests for completion paths**

Reset and self-change must call `rotateUserPassword` inside `db.$transaction`. Revived invite users must update with `authVersion: { increment: 1 }`; brand-new invite users keep the default zero.

- [ ] **Step 3: Write failing rate-classification tests**

Expect auth classification for POSTs to:

```text
/api/coaches/c1/set-password
/api/coaches/c1/password-set-notification
/api/coaches/c1/send-password-reset
```

- [ ] **Step 4: Run the focused matrix and verify RED**

Run:

```bash
npx jest src/__tests__/api/coaches-password-reset-url.test.ts src/__tests__/api/auth.test.ts src/__tests__/api/accept-invite-revive.test.ts src/__tests__/unit/global-rate-limit.test.ts --runInBand
```

Expected: failures on 900-second TTL, dedicated email, credential rotation, invite increment, and new path classification.

- [ ] **Step 5: Implement the enhanced reset flow and all existing-user increments**

Feature-on reset-send uses `900` seconds and `sendCoachPasswordResetEmail`; feature-off preserves the current 24-hour `sendCoachWelcomeEmail` path. Reset completion and self-change use the shared transaction helper. Invite revival increments `authVersion` in the same existing transaction. Add the three coach credential routes to the Edge-safe auth classifier regexes.

- [ ] **Step 6: Run focused and adjacent auth tests**

Run:

```bash
npx jest src/__tests__/api/coaches-password-reset-url.test.ts src/__tests__/api/coaches-set-password.test.ts src/__tests__/api/auth.test.ts src/__tests__/api/accept-invite-revive.test.ts src/__tests__/unit/password-reset.test.ts src/__tests__/unit/global-rate-limit.test.ts src/__tests__/lib/auth/session-revocation.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 'src/src/app/api/coaches/[id]/send-password-reset/route.ts' src/src/app/api/auth/reset-password/route.ts src/src/app/api/auth/change-password/route.ts src/src/app/api/auth/accept-invite/route.ts src/src/services/notifications.ts src/src/lib/global-rate-limit.ts src/src/__tests__
git commit -m "feat(auth): harden coach password reset flows"
```

---

### Task 7: Verify, visually review, document, and release

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Modify: implementation files only if verification finds defects

**Interfaces:**
- Consumes: complete feature and feature flags
- Produces: release evidence, SoT entry, Production deployment

- [ ] **Step 1: Run focused tests and changed-file ESLint**

Run the complete focused matrix from Tasks 1–6 plus ESLint on every changed `.ts`/`.tsx` file. Expected: all pass/no diagnostics.

- [ ] **Step 2: Run repository gates**

From `src/`:

```bash
npm test -- --runInBand
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

From repo root:

```bash
git diff --check
git status --short
```

Expected: all suites green, migration approved, build succeeds, clean diff formatting.

- [ ] **Step 3: Visually review desktop and mobile**

Run the app with both feature flags enabled locally or on Preview. Inspect an admin coach-detail page at desktop and 320px width. Verify approved action order, wrapping/no overflow, both dialog steps, warning copy, focus behavior, and success/partial states without using a real coach credential.

- [ ] **Step 4: Update SoT with actual evidence**

Prepend a `2026-08-17` changelog entry with anchor `admin-coach-password-actions-implemented`, exact tests/build results, migration/flag behavior, security boundaries, and email semantics. Update `CLAUDE.md` `LAST_UPDATED_ISO` and `LAST_UPDATED_SLUG` to match. Do not claim Preview/Production evidence before it exists.

- [ ] **Step 5: Re-run freshness and final verification**

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
git diff --check
```

- [ ] **Step 6: Commit implementation evidence**

```bash
git add CLAUDE.md plans/CHANGELOG.md src docs/superpowers/plans/2026-08-17-admin-coach-password-actions.md
git commit -m "feat: complete admin coach password actions"
```

- [ ] **Step 7: Push branch and open a ready PR**

```bash
git push -u origin codex/admin-coach-password-actions
gh pr create --base main --head codex/admin-coach-password-actions --title "feat: add admin coach password actions" --body "Adds the approved admin-only coach password setter, 15-minute admin reset links, coach notifications, audited password rotation, and JWT credential-version revocation. Full verification evidence is recorded in plans/CHANGELOG.md."
```

Wait for Build, Migration Safety Gate, Vercel, and relevant required checks. Fix failures on the same branch and rerun local gates before repushing.

- [ ] **Step 8: Merge and launch flags**

After all required checks and review are green, merge through the protected-branch PR workflow. Set `WAVE_COACH_PASSWORD_ACTIONS_ENABLED=1` for Production and leave `WAVE_COACH_PASSWORD_ACTIONS_KILL` unset/false, then redeploy the exact merged `main` SHA.

- [ ] **Step 9: Production smoke**

Verify the exact deployment is Ready and owns both canonical aliases. Confirm both health endpoints report healthy database and safe auth posture. Use only an approved disposable/test coach to verify admin button visibility, a 15-minute reset email, password-set notification, and stale-session rejection. Never alter the pictured Suzanne account.

- [ ] **Step 10: Record Production receipt**

Add the exact PR, merge SHA, deployment ID, flag state, health results, and controlled smoke evidence to the newest changelog entry in a follow-up receipt commit/PR if protected `main` requires it.
