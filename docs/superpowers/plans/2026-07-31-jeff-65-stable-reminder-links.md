# Jeff #65 Stable Reminder Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every original invitation and bulk-reminder link until the shared invitation reaches an existing terminal lifecycle gate.

**Architecture:** Add an additive `AssessmentInvitationToken` child table while retaining `AssessmentInvitation.tokenHash` as the newest-token compatibility mirror. The parent also persists the last-known-deliverable hash, expiry, and monotonic sequence independently of predecessor traversal. A focused token service owns row locking, promotion, staging, delivery state, quarantine, and child-first resolution; the existing invitation, reminder, and exchange paths call it only when the Jeff #65 flag is enabled.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Prisma 5/PostgreSQL, Jest 30, Nodemailer SMTP, existing assessment feature-flag conventions.

## Global Constraints

- Product contract: `docs/specs/v7.6/20-jeff-65-stable-reminder-links-contract.md`.
- Approved design: `docs/superpowers/specs/2026-07-31-jeff-65-stable-reminder-links-design.md`.
- Persist SHA-256 hashes only; raw tokens must never enter logs, responses, audits, or database columns.
- The parent Invitation remains the sole lifecycle authority and shared-expiry source.
- Flag off and kill must retain the current parent-only runtime path.
- Manual **Resend** remains parent-only and works through enabled exchange fallback.
- No UI, email copy, email chrome, public-assessment, expiry-policy, or batch-cap changes.
- Partial reminder failures extend the existing 503 JSON error with a visible
  do-not-retry warning, completed/remaining identifiers, and `retrySafe: false`;
  the existing caller surfaces `body.error`, so no UI component change is needed.
- Every implementation slice follows red → green TDD at the approved public seams.

## File map

**Create**

- `src/src/lib/assessments/wave-j65-flags.ts` — pure kill/global/campaign-alias flag decision.
- `src/src/lib/assessments/stable-invitation-tokens.ts` — all multi-token persistence and lookup behavior.
- `src/src/__tests__/lib/assessments/wave-j65-flags.test.ts` — flag seam.
- `src/src/__tests__/lib/assessments/stable-invitation-tokens.test.ts` — service seam and serialized state-machine receipts (not PostgreSQL lock scheduling).
- `src/prisma/migrations/20260731110000_add_stable_invitation_tokens/migration.sql` — enums, table, indexes, foreign key, and backfill.
- `src/src/__tests__/prisma/stable-invitation-tokens-migration.test.ts` — migration contract.

**Modify**

- `src/.env.example` — default-off Jeff #65 flag declarations.
- `src/prisma/schema.prisma` — token model, enums, and parent relation.
- `src/src/app/(public)/org-survey/[campaignAlias]/exchange/route.ts` — enabled child-first lookup.
- `src/src/__tests__/app/org-survey/exchange.test.ts` — sibling lookup and lifecycle regression.
- `src/src/app/api/assessment-campaigns/[id]/reminders/route.ts` — enabled append-not-replace flow.
- `src/src/__tests__/api/assessment-campaigns/reminders-post.test.ts` — successful, uncertain, rejected, and flag-off behavior.
- `src/src/lib/assessments/invite-send.ts` — enabled original-token registration and delivery transitions.
- `src/src/__tests__/lib/invite-send.test.ts` — original invite dual-write.
- `src/src/app/api/assessment-campaigns/[id]/invite/route.ts` — pass the evaluated Jeff #65 mode.
- `src/src/inngest/functions/assessment-invite-fanout.ts` — pass the same evaluated mode to background sends.
- `src/src/__tests__/inngest/assessment-invite-fanout.test.ts` — fan-out flag plumbing.
- `CLAUDE.md` and `plans/CHANGELOG.md` — implementation status, scope, flag, and reporting classification.

---

### Task 1: Jeff #65 feature-flag seam

**Files:**

- Create: `src/src/lib/assessments/wave-j65-flags.ts`
- Create: `src/src/__tests__/lib/assessments/wave-j65-flags.test.ts`
- Modify: `src/.env.example`

**Interfaces:**

- Produces:

```ts
export function isStableInvitationLinksEnabled(campaignAlias?: string): boolean;
```

- Environment:
  - `WAVE_J65_STABLE_LINKS_KILL`
  - `WAVE_J65_STABLE_LINKS_ENABLED`
  - `WAVE_J65_STABLE_LINKS_CANARY`

- [ ] **Step 1: Write the failing flag truth-table test**

```ts
it.each([
  [{}, undefined, false],
  [{ WAVE_J65_STABLE_LINKS_ENABLED: "1" }, undefined, true],
  [{ WAVE_J65_STABLE_LINKS_CANARY: "alpha,beta" }, "beta", true],
  [{ WAVE_J65_STABLE_LINKS_CANARY: "alpha,beta" }, "gamma", false],
  [{
    WAVE_J65_STABLE_LINKS_ENABLED: "1",
    WAVE_J65_STABLE_LINKS_KILL: "1",
  }, "alpha", false],
])("applies kill, global, and exact-alias precedence", (env, alias, expected) => {
  Object.assign(process.env, env);
  expect(isStableInvitationLinksEnabled(alias)).toBe(expected);
});
```

- [ ] **Step 2: Run the single test and verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/lib/assessments/wave-j65-flags.test.ts --runInBand
```

Expected: FAIL because `wave-j65-flags` does not exist.

- [ ] **Step 3: Implement the pure helper**

```ts
function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

function canaryMatches(csv: string | undefined, alias: string | undefined): boolean {
  if (!alias) return false;
  return (csv ?? "").split(/[\s,]+/).filter(Boolean).includes(alias);
}

export function isStableInvitationLinksEnabled(campaignAlias?: string): boolean {
  if (isOn(process.env.WAVE_J65_STABLE_LINKS_KILL)) return false;
  return (
    isOn(process.env.WAVE_J65_STABLE_LINKS_ENABLED) ||
    canaryMatches(process.env.WAVE_J65_STABLE_LINKS_CANARY, campaignAlias)
  );
}
```

- [ ] **Step 4: Document all three default-off variables**

Append to `.env.example`:

```dotenv
WAVE_J65_STABLE_LINKS_ENABLED="false"
WAVE_J65_STABLE_LINKS_CANARY=""
WAVE_J65_STABLE_LINKS_KILL="false"
```

- [ ] **Step 5: Run the single test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit the slice**

```bash
git add .env.example \
  src/src/lib/assessments/wave-j65-flags.ts \
  src/src/__tests__/lib/assessments/wave-j65-flags.test.ts
git commit -m "feat(assessments): gate stable invitation links"
```

---

### Task 2: Additive token schema and backfill

**Files:**

- Modify: `src/prisma/schema.prisma`
- Create: `src/prisma/migrations/20260731110000_add_stable_invitation_tokens/migration.sql`
- Create: `src/src/__tests__/prisma/stable-invitation-tokens-migration.test.ts`

**Interfaces:**

- Produces Prisma delegates `assessmentInvitationToken` and enums:

```ts
type AssessmentInvitationTokenSource =
  | "LEGACY_CURRENT"
  | "ORIGINAL"
  | "REMINDER";

type AssessmentInvitationTokenDeliveryState =
  | "STAGED"
  | "SENT"
  | "UNCERTAIN"
  | "REJECTED";
```

- [ ] **Step 1: Write the failing migration contract**

Read the migration SQL as text and assert literal evidence for:

```ts
expect(sql).toContain('CREATE TYPE "AssessmentInvitationTokenSource"');
expect(sql).toContain('CREATE TYPE "AssessmentInvitationTokenDeliveryState"');
expect(sql).toContain('CREATE TABLE "assessment_invitation_tokens"');
expect(sql).toContain('CREATE UNIQUE INDEX');
expect(sql).toContain('"invitationId"');
expect(sql).toMatch(/ON DELETE CASCADE/);
expect(sql).toMatch(/INSERT INTO "assessment_invitation_tokens"/);
expect(sql).toMatch(/FROM "assessment_invitations"/);
expect(sql).not.toMatch(/rawToken/i);
```

- [ ] **Step 2: Run the migration test and verify RED**

```bash
npx jest src/__tests__/prisma/stable-invitation-tokens-migration.test.ts --runInBand
```

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Add the Prisma model and enums**

Add `tokens AssessmentInvitationToken[]` to `AssessmentInvitation`, then define:

```prisma
model AssessmentInvitationToken {
  id                  String                                 @id @default(cuid())
  invitationId        String
  tokenHash           String                                 @unique
  sequence            Int
  expiresAtSnapshot   DateTime
  source              AssessmentInvitationTokenSource
  deliveryState       AssessmentInvitationTokenDeliveryState
  deliveryConfirmedAt DateTime?
  createdAt           DateTime                               @default(now())
  updatedAt           DateTime                               @updatedAt

  invitation AssessmentInvitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)

  @@index([invitationId])
  @@unique([invitationId, sequence])
  @@map("assessment_invitation_tokens")
}

enum AssessmentInvitationTokenSource {
  LEGACY_CURRENT
  ORIGINAL
  REMINDER
}

enum AssessmentInvitationTokenDeliveryState {
  STAGED
  SENT
  UNCERTAIN
  REJECTED
}
```

Add `stableTokenSequence`, `stableFallbackTokenHash`,
`stableFallbackExpiresAt`, and `stableFallbackTokenSequence` to the parent.
The migration initializes the safe fallback from the existing parent hash and
expiry and initializes the backfilled child at sequence zero.

- [ ] **Step 4: Write the additive SQL and truthful backfill**

The SQL must:

1. create the enums and table;
2. add primary, unique-hash, invitation, and cascade constraints; and
3. insert one row per existing invitation with:

```sql
CASE
  WHEN "status" IN ('SENT', 'VIEWED', 'SUBMITTED')
  THEN 'SENT'::"AssessmentInvitationTokenDeliveryState"
  ELSE 'UNCERTAIN'::"AssessmentInvitationTokenDeliveryState"
END
```

Use `'legacy_' || assessment_invitations.id` for deterministic, non-secret
backfill IDs, `createdAt` from the parent, `COALESCE(sentAt, createdAt)` for
`updatedAt`, and `sentAt` for `deliveryConfirmedAt`.

- [ ] **Step 5: Generate Prisma and run migration checks**

```bash
npx prisma generate
npx jest src/__tests__/prisma/stable-invitation-tokens-migration.test.ts --runInBand
node scripts/check-migration-safety.mjs
```

Expected: migration test PASS; safety gate reports all migrations safe.

- [ ] **Step 6: Commit the slice**

```bash
git add prisma/schema.prisma \
  prisma/migrations/20260731110000_add_stable_invitation_tokens/migration.sql \
  src/__tests__/prisma/stable-invitation-tokens-migration.test.ts
git commit -m "feat(assessments): add invitation token history"
```

---

### Task 3: Stable-token service

**Files:**

- Create: `src/src/lib/assessments/stable-invitation-tokens.ts`
- Create: `src/src/__tests__/lib/assessments/stable-invitation-tokens.test.ts`

**Interfaces:**

- Consumes: Prisma token delegate and the enums from Task 2.
- Produces:

```ts
export type StableTokenDb = Pick<
  PrismaClient,
  "$transaction" | "assessmentInvitation" | "assessmentInvitationToken"
>;

export type StableTokenLookupDb = Pick<
  PrismaClient,
  "assessmentInvitation" | "assessmentInvitationToken"
>;

export const invitationForExchangeArgs = Prisma.validator<
  Prisma.AssessmentInvitationDefaultArgs
>()({
  include: {
    campaign: {
      select: {
        id: true,
        alias: true,
        status: true,
        openAt: true,
        closeAt: true,
        deletedAt: true,
      },
    },
  },
});

export type InvitationWithCampaign =
  Prisma.AssessmentInvitationGetPayload<typeof invitationForExchangeArgs>;

export interface StagedStableToken {
  tokenId: string;
  invitationId: string;
  newTokenHash: string;
  previousTokenHash: string;
  previousExpiresAt: Date;
}

export async function stageStableInvitationToken(
  db: StableTokenDb,
  input: {
    invitationId: string;
    newTokenHash: string;
    expiresAt: Date;
    source: "ORIGINAL" | "REMINDER";
  },
): Promise<StagedStableToken>;

export async function registerNewOriginalToken(
  db: StableTokenDb,
  input: { invitationId: string; tokenHash: string; expiresAt: Date },
): Promise<{ tokenId: string }>;

export async function confirmStableInvitationToken(
  db: StableTokenDb,
  input: { tokenId: string; invitationId: string; confirmedAt: Date; reminder: boolean },
): Promise<void>;

export async function markStableInvitationTokenUncertain(
  db: StableTokenDb,
  tokenId: string,
): Promise<void>;

export async function removeRegisteredStableInvitationToken(
  db: StableTokenDb,
  tokenId: string,
): Promise<void>;

export async function rollbackRejectedStableInvitationToken(
  db: StableTokenDb,
  staged: StagedStableToken,
): Promise<void>;

export async function resolveInvitationByStableTokenHash(
  db: StableTokenLookupDb,
  tokenHash: string,
): Promise<InvitationWithCampaign | null>;

export function classifyInvitationSendError(
  error: unknown,
): "DEFINITE_REJECTION" | "UNCERTAIN";
```

- [ ] **Step 1: Write a failing promotion/staging test**

The test transaction mock must assert this public behavior:

```ts
const staged = await stageStableInvitationToken(db, {
  invitationId: "inv-1",
  newTokenHash: "new-hash",
  expiresAt: new Date("2026-12-01T00:00:00Z"),
  source: "REMINDER",
});

expect(tx.$executeRaw).toHaveBeenCalled(); // parent row lock
expect(tx.assessmentInvitationToken.upsert).toHaveBeenCalledWith(
  expect.objectContaining({
    where: { tokenHash: "old-hash" },
    create: expect.objectContaining({ source: "LEGACY_CURRENT" }),
  }),
);
expect(staged.previousTokenHash).toBe("old-hash");
```

- [ ] **Step 2: Run the service test and verify RED**

```bash
npx jest src/__tests__/lib/assessments/stable-invitation-tokens.test.ts --runInBand
```

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement row-locked staging**

Inside `db.$transaction`, execute:

```ts
await tx.$executeRaw`
  SELECT "id"
  FROM "assessment_invitations"
  WHERE "id" = ${input.invitationId}
  FOR UPDATE
`;
```

Then re-read `tokenHash`, `expiresAt`, `status`, `sentAt`, promote the locked
current hash idempotently, create the `STAGED` child, and update the parent mirror
plus shared expiry.

- [ ] **Step 4: Verify promotion/staging GREEN**

Run the Step 2 command. Expected: first slice PASS.

- [ ] **Step 5: Add red-green slices for delivery outcomes**

Add one test at a time for:

- `confirmStableInvitationToken` sets `SENT`, `deliveryConfirmedAt`, and atomically
  increments reminder counters only when `reminder` is true;
- unclassified errors become `UNCERTAIN`;
- an error with numeric `responseCode` from 500 through 599 is
  `DEFINITE_REJECTION`;
- removing a rejected newly registered original deletes only that child;
- rejected rollback deletes its child and uses `updateMany` with
  `{ id: invitationId, tokenHash: newTokenHash }`;
- a zero-count rollback does not overwrite a newer mirror; and
- `registerNewOriginalToken` creates an `ORIGINAL/STAGED` child idempotently.

After each test, run the Step 2 command and implement only enough to pass.

- [ ] **Step 6: Add the lookup slice**

```ts
const invitation = await resolveInvitationByStableTokenHash(db, "hash");
expect(db.assessmentInvitationToken.findUnique).toHaveBeenCalledWith(
  expect.objectContaining({ where: { tokenHash: "hash" } }),
);
expect(invitation?.id).toBe("inv-1");
```

Implement child-first lookup and parent fallback with the exact campaign selection
the exchange route already requires.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
npx jest src/__tests__/lib/assessments/stable-invitation-tokens.test.ts --runInBand
git add src/src/lib/assessments/stable-invitation-tokens.ts \
  src/src/__tests__/lib/assessments/stable-invitation-tokens.test.ts
git commit -m "feat(assessments): manage stable invitation tokens"
```

---

### Task 4: Enabled exchange path

**Files:**

- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/exchange/route.ts`
- Modify: `src/src/__tests__/app/org-survey/exchange.test.ts`

**Interfaces:**

- Consumes:

```ts
isStableInvitationLinksEnabled(campaignAlias)
resolveInvitationByStableTokenHash(db, tokenHash)
```

- Preserves all existing response codes, lifecycle gates, `VIEWED` update, cookie,
  and no-store behavior.

- [ ] **Step 1: Write the failing sibling-token route test**

Mock the flag on and stable resolver:

```ts
mockIsStableInvitationLinksEnabled.mockReturnValue(true);
mockResolveInvitationByStableTokenHash.mockResolvedValue(activeInvitation);

const response = await POST(reqWithToken("older-reminder"), aliasParams("demo"));

expect(response.status).toBe(204);
expect(mockResolveInvitationByStableTokenHash).toHaveBeenCalledWith(
  db,
  hashToken("older-reminder"),
);
expect(sessionState.invitationId).toBe("inv-1");
```

- [ ] **Step 2: Run the exchange suite and verify RED**

```bash
npx jest src/__tests__/app/org-survey/exchange.test.ts --runInBand
```

Expected: FAIL because the route still uses the parent directly.

- [ ] **Step 3: Add the minimal enabled branch**

Compute the flag from `campaignAlias`. When enabled, call the stable resolver;
otherwise execute the existing `assessmentInvitation.findUnique` expression
unchanged.

- [ ] **Step 4: Run exchange tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Add lifecycle and kill regressions**

Table-drive the same resolved invitation through revoked, expired, submitted,
closed, close-date-passed, soft-deleted, and alias-mismatch cases. Assert kill/off
does not call the stable resolver.

- [ ] **Step 6: Commit**

```bash
git add 'src/src/app/(public)/org-survey/[campaignAlias]/exchange/route.ts' \
  src/src/__tests__/app/org-survey/exchange.test.ts
git commit -m "feat(assessments): exchange sibling invitation links"
```

---

### Task 5: Bulk-reminder append flow

**Files:**

- Modify: `src/src/app/api/assessment-campaigns/[id]/reminders/route.ts`
- Modify: `src/src/__tests__/api/assessment-campaigns/reminders-post.test.ts`

**Interfaces:**

- Consumes flag and all Task 3 staging/delivery functions.
- Keeps the existing JSON response fields and skip selection.

- [ ] **Step 1: Write the failing successful-reminder test**

With the flag on, assert call order and outcome:

```ts
expect(mockStageStableInvitationToken).toHaveBeenCalledWith(
  db,
  expect.objectContaining({
    invitationId: "inv-r1",
    source: "REMINDER",
  }),
);
expect(sendAssessmentInvitationEmail).toHaveBeenCalled();
expect(mockConfirmStableInvitationToken).toHaveBeenCalledWith(
  db,
  expect.objectContaining({ reminder: true }),
);
```

Also assert the legacy direct `assessmentInvitation.update({ tokenHash })` did not
run in the enabled path.

- [ ] **Step 2: Run the reminder suite and verify RED**

```bash
npx jest src/__tests__/api/assessment-campaigns/reminders-post.test.ts --runInBand
```

- [ ] **Step 3: Implement the enabled successful path**

Evaluate the flag once from `campaign.alias`. Under enabled mode:

1. stage before email;
2. send using the same raw token;
3. confirm after successful return; and
4. count the response as sent even if post-send telemetry persistence fails,
   because the staged link remains exchangeable.

Leave the disabled loop byte-identical.

- [ ] **Step 4: Verify success GREEN**

Run the Step 2 command.

- [ ] **Step 5: Add red-green error slices**

Add one test at a time:

- generic SMTP throw calls `markStableInvitationTokenUncertain`, preserves the
  staged link, returns one failed entry, and never logs a raw token;
- SMTP `responseCode: 550` calls rejected rollback;
- staging failure sends no email and reports failure;
- confirm persistence failure still reports the email sent and leaves `STAGED`;
- flag off retains the original send-first/overwrite-after-success behavior; and
- two targeted participants receive distinct staged hashes.

- [ ] **Step 6: Commit**

```bash
git add 'src/src/app/api/assessment-campaigns/[id]/reminders/route.ts' \
  src/src/__tests__/api/assessment-campaigns/reminders-post.test.ts
git commit -m "fix(assessments): preserve reminder invitation links"
```

---

### Task 6: Original-invite dual-write in manual and fan-out paths

**Files:**

- Modify: `src/src/lib/assessments/invite-send.ts`
- Modify: `src/src/__tests__/lib/invite-send.test.ts`
- Modify: `src/src/app/api/assessment-campaigns/[id]/invite/route.ts`
- Modify: `src/src/inngest/functions/assessment-invite-fanout.ts`
- Modify: `src/src/__tests__/inngest/assessment-invite-fanout.test.ts`

**Interfaces:**

- Extend `SendInvitesInput` with:

```ts
stableLinksEnabled?: boolean;
```

- Extend `SendInvitesDeps` with an optional adapter:

```ts
stableTokens?: {
  stageExistingOriginal(input: {
    invitationId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<StagedStableToken>;
  registerOriginal(input: {
    invitationId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ tokenId: string }>;
  confirm(input: {
    tokenId: string;
    invitationId: string;
    confirmedAt: Date;
  }): Promise<void>;
  uncertain(tokenId: string): Promise<void>;
  removeRegistered(tokenId: string): Promise<void>;
  rollbackRejected(staged: StagedStableToken): Promise<void>;
};
```

- [ ] **Step 1: Write the failing original dual-write test**

```ts
const result = await sendInvitesBatch(depsWithStableAdapter, {
  campaign: CAMPAIGN,
  recipients: [participant("r1")],
  baseUrl: "https://app.example.com",
  stableLinksEnabled: true,
});

expect(stableTokens.registerOriginal).toHaveBeenCalledWith({
  invitationId: "inv-r1",
  tokenHash: expect.any(String),
});
expect(stableTokens.confirm).toHaveBeenCalled();
expect(result.sent).toEqual(["r1"]);
```

- [ ] **Step 2: Run invite-send tests and verify RED**

```bash
npx jest src/__tests__/lib/invite-send.test.ts --runInBand
```

- [ ] **Step 3: Implement optional enabled registration**

Before email:

- require the adapter when `stableLinksEnabled` is true;
- for a new parent row, initialize a never-delivered parent fallback, then stage
  its deliverable hash as `ORIGINAL/STAGED`;
- for an existing `PENDING` row, call `stageExistingOriginal` instead of the
  legacy direct re-key so the locked previous hash is promoted before the parent
  mirror changes;
- on success confirm it;
- on an unclassified send exception mark it uncertain;
- on a classified 5xx rejection durably quarantine the exact child as
  `REJECTED`, compare-and-swap the parent mirror to its persisted safe fallback,
  and, if synchronous repair retries exhaust, strictly persist the ID-only
  repair intent before attempting an ID-only Inngest fast-path event; a bounded
  scheduled drain owns durable recovery; and
- leave the existing disabled code path and result shape unchanged.

The raw token never reaches logs, event payloads, or audits. Success and uncertain
delivery advance the parent fallback only when their child sequence is newer, so
delayed confirmations cannot regress the safe restore point. Exact rejected
children fail closed.

- [ ] **Step 4: Verify invite-send GREEN**

Run the Step 2 command.

- [ ] **Step 5: Wire both callers**

In the manual route and fan-out, evaluate:

```ts
const stableLinksEnabled = isStableInvitationLinksEnabled(campaign.alias);
```

When enabled, supply an adapter backed by the Task 3 service. Otherwise omit it.
Pass `stableLinksEnabled` in the input.

- [ ] **Step 6: Add fan-out plumbing regression**

Assert an enabled campaign passes `stableLinksEnabled: true` and a disabled
campaign passes false/undefined without changing batching or heartbeat behavior.

- [ ] **Step 7: Run the focused original-send suites and commit**

```bash
npx jest \
  src/__tests__/lib/invite-send.test.ts \
  src/__tests__/api/assessment-campaigns/invite-route.test.ts \
  src/__tests__/inngest/assessment-invite-fanout.test.ts \
  --runInBand
npx tsc --noEmit
git add src/src/lib/assessments/invite-send.ts \
  src/src/__tests__/lib/invite-send.test.ts \
  'src/src/app/api/assessment-campaigns/[id]/invite/route.ts' \
  src/src/inngest/functions/assessment-invite-fanout.ts \
  src/src/__tests__/inngest/assessment-invite-fanout.test.ts
git commit -m "feat(assessments): retain original invitation tokens"
```

---

### Task 7: Source of truth and complete verification

**Files:**

- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**

- Top changelog slug and `CLAUDE.md` freshness anchor must match.
- Status must say implemented and locally verified, not merged or launched.
- The fresh consolidated-report count does not increase until production launch.

- [ ] **Step 1: Write the SoT entry**

Record:

- the child-token architecture and retained parent mirror;
- original/reminder/manual-Resend boundaries;
- exact flag names and kill behavior;
- migration and backfill;
- validation evidence;
- rollout still default-off; and
- no UI/copy change.

- [ ] **Step 2: Run focused feature tests**

```bash
npx jest \
  src/__tests__/lib/assessments/wave-j65-flags.test.ts \
  src/__tests__/prisma/stable-invitation-tokens-migration.test.ts \
  src/__tests__/lib/assessments/stable-invitation-tokens.test.ts \
  src/__tests__/app/org-survey/exchange.test.ts \
  src/__tests__/api/assessment-campaigns/reminders-post.test.ts \
  src/__tests__/lib/invite-send.test.ts \
  src/__tests__/api/assessment-campaigns/invite-route.test.ts \
  src/__tests__/inngest/assessment-invite-fanout.test.ts \
  src/__tests__/lint/changelog-freshness.test.ts \
  --runInBand
```

- [ ] **Step 3: Run changed-file lint, typecheck, and migration safety**

```bash
npx eslint \
  src/lib/assessments/wave-j65-flags.ts \
  src/lib/assessments/stable-invitation-tokens.ts \
  'src/app/(public)/org-survey/[campaignAlias]/exchange/route.ts' \
  'src/app/api/assessment-campaigns/[id]/reminders/route.ts' \
  src/lib/assessments/invite-send.ts \
  'src/app/api/assessment-campaigns/[id]/invite/route.ts' \
  src/inngest/functions/assessment-invite-fanout.ts
npx tsc --noEmit
node scripts/check-migration-safety.mjs
git diff --check
```

- [ ] **Step 4: Run the complete Jest suite once**

```bash
npx jest --runInBand
```

If baseline failures occur, run the same command in a clean worktree at the fixed
point and compare failed suite and assertion names exactly. Do not classify a
failure as pre-existing without that evidence.

- [ ] **Step 5: Run the production build gate**

```bash
CI=true npx next build --turbopack
```

- [ ] **Step 6: Commit SoT and any final verification-only corrections**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(sot): record Jeff 65 implementation"
```

- [ ] **Step 7: Run two-axis code review**

Use `/code-review` with the recorded fixed point and the approved design spec.
Address every actionable Standards or Spec finding, rerun affected tests plus
typecheck, commit the corrections, and repeat review until both axes have no
actionable findings.

- [ ] **Step 8: Re-run final evidence after the last review fix**

At minimum rerun focused tests, changed-file ESLint, typecheck, migration safety,
changelog freshness, `git diff --check`, and the Turbopack build. If a review fix
touches broadly shared behavior, rerun the full Jest suite.

---

### Fix Round 4: Prevent bounded outbox head-of-line starvation

- [x] Capture RED regressions for resolved duplicates, deleted targets, malformed
  metadata, transient retry rotation, and 50 head rows starving row 51.
- [x] Make every selected pending audit transition to resolved, terminal, or
  failed-attempt state; never delete audit history.
- [x] Enqueue a deterministic ID-only retry intent at the tail after each
  transient failure, with the monotonic attempt count retained only on the
  failed-attempt audit.
- [x] Share deterministic missing-target terminalization between the direct event
  and scheduled drain.
- [x] Add the `AuditLog(action, timestamp)` Prisma/schema index to the existing
  additive migration and pin its non-destructive SQL in the migration contract.
- [x] Rerun affected and focused matrices, Prisma gates, migration safety,
  changed-file lint/type/privacy/diff/freshness, and Turbopack; record exact
  evidence without rerunning the full Jest suite.
