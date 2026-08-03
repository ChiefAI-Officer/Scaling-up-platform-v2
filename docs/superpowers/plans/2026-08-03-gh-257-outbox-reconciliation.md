# GH #257 Invited-results Outbox Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every valid invited-results email expectation commits durably with its submission, then hands the exact frozen payload to the existing assessment email outbox only after current-state reauthorization.

**Architecture:** Add a dedicated `AssessmentEmailDeliveryIntent` ledger between invited submission and the existing `AssessmentEmailOutbox`. Submission atomically stores answers plus 0–2 frozen intents; an ID-only Inngest event and a three-minute scheduled scan call one short, DB-only reconciler. The reconciler locks authoritative rows in one order, either hands the frozen payload to the unchanged ADR-0030 outbox, holds it for ADMIN/STAFF review, or expires and purges it after 30 days.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Prisma 5/PostgreSQL, Jest 30, React 19, Inngest 3, Zod 4, Node `crypto`, existing assessment report renderers and SMTP outbox worker.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-08-03-gh-257-outbox-reconciliation-design.md`.
- Architectural decisions: `docs/adr/0031-assessment-email-obligations-use-a-dedicated-intent-ledger.md` and `docs/adr/0030-assessment-email-delivery-is-at-least-once-with-an-atomic-lease.md`.
- This plan implements the residual of GH #257; it does not create or duplicate the existing issue claim.
- Never rerender, edit, replace the recipient, or reconstruct a frozen intent.
- `AssessmentEmailOutbox` remains the only SMTP delivery queue. Do not change its lease, retry, uncertainty, or terminal-state semantics.
- The intent-first route is default off behind `ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED`.
- `ASSESSMENT_SENDS_PAUSED` blocks handoff and release, but not intent creation or absolute expiry.
- Every unresolved payload has one immutable deadline: `createdAt + 30 days`.
- Only ADMIN and STAFF may inspect full held details, release, or cancel. Coaches have no recovery capability.
- Legacy detection is read-only and labels every result `UNVERIFIABLE_CANDIDATE`; it has no write, render, replay, backfill, or apply mode.
- No implementation task authorizes a production replay, backfill, manual data write, flag change, or deployment.
- All audits and logs omit addresses, subject text, HTML, answers, and raw exception messages.
- Preserve unrelated workspace changes. Before each commit, inspect `git status --short` and stage only the named files.
- Work from `src/` for Node, Jest, Prisma, ESLint, and build commands unless a step says otherwise.

## Fixed contracts

### Intent states and reasons

```ts
export const EMAIL_DELIVERY_INTENT_STATUSES = [
  "PENDING",
  "HELD",
  "HANDED_OFF",
  "CANCELLED",
  "EXPIRED",
] as const;

export const EMAIL_DELIVERY_INTENT_HOLD_CODES = [
  "CAMPAIGN_DELETED",
  "CAMPAIGN_STATUS_CHANGED",
  "CAMPAIGN_DEADLINE_CHANGED",
  "INVITATION_REVOKED",
  "INVITATION_EXPIRY_CHANGED",
  "IDENTITY_LINK_CHANGED",
  "RESPONDENT_EMAIL_CHANGED",
  "COACH_OWNER_CHANGED",
  "COACH_EMAIL_CHANGED",
  "TEMPLATE_CHANGED",
  "VERSION_CHANGED",
  "APPROVAL_REVOKED",
  "APPROVAL_HASH_CHANGED",
  "FEATURE_DISABLED",
  "PAYLOAD_INTEGRITY_FAILED",
  "SCHEMA_UNSUPPORTED",
  "RETRY_EXHAUSTED",
] as const;
```

When multiple checks fail, the first code in this array is the primary reason.
Persist the ordered allowlisted array in sanitized metadata.

### Lock order

Every automatic handoff and operator release uses this order:

1. `assessment_email_delivery_intents` — `FOR UPDATE`;
2. `assessment_submissions` — `FOR SHARE`;
3. `assessment_campaigns` — `FOR SHARE`;
4. `assessment_invitations` — `FOR SHARE`;
5. `org_respondents` — `FOR SHARE`;
6. `assessment_templates` — `FOR SHARE`;
7. `assessment_template_versions` — `FOR SHARE`;
8. `coaches` when the role is `OWNING_COACH` — `FOR SHARE`;
9. matching `assessment_email_outbox` row — `FOR UPDATE`.

Set a two-second local lock timeout and a ten-second local statement timeout.
Lock/deadlock/serialization failures are transient and use the guarded retry
path.

### Operator API

```text
GET  /api/admin/assessment-email-delivery-intents?cursor=<id>&limit=<1..50>
GET  /api/admin/assessment-email-delivery-intents/:id
POST /api/admin/assessment-email-delivery-intents/:id/release
POST /api/admin/assessment-email-delivery-intents/:id/cancel
```

Release body:

```json
{
  "expectedVersion": 3,
  "reasonCode": "DRIFT_REVIEWED_SEND_FROZEN",
  "reviewToken": "v1.<iv>.<ciphertext>.<tag>"
}
```

Cancellation body:

```json
{
  "expectedVersion": 3,
  "reasonCode": "DELIVERY_NO_LONGER_AUTHORIZED"
}
```

All four routes are ADMIN/STAFF-only. Detail and mutations use
`Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`.

## File map

**Create**

- `src/prisma/migrations/20260803140000_add_assessment_email_delivery_intents/migration.sql`
- `src/src/lib/assessments/assessment-email-delivery-intents.ts`
- `src/src/lib/assessments/assessment-email-intent-reauthorization.ts`
- `src/src/lib/assessments/assessment-email-intent-reconciler.ts`
- `src/src/lib/assessments/assessment-email-intent-review-token.ts`
- `src/src/lib/assessments/assessment-email-intent-operator.ts`
- `src/src/inngest/functions/assessment-email-intent-reconciliation.ts`
- `src/src/app/api/admin/assessment-email-delivery-intents/route.ts`
- `src/src/app/api/admin/assessment-email-delivery-intents/[id]/route.ts`
- `src/src/app/api/admin/assessment-email-delivery-intents/[id]/release/route.ts`
- `src/src/app/api/admin/assessment-email-delivery-intents/[id]/cancel/route.ts`
- `src/src/app/(dashboard)/admin/assessments/delivery-holds/page.tsx`
- `src/src/components/admin/AssessmentEmailDeliveryHolds.tsx`
- `src/scripts/audit-legacy-assessment-email-gaps.ts`
- `src/src/__tests__/prisma/assessment-email-delivery-intents-migration.test.ts`
- `src/src/__tests__/lib/assessments/assessment-email-delivery-intents.test.ts`
- `src/src/__tests__/lib/assessments/assessment-email-intent-reauthorization.test.ts`
- `src/src/__tests__/lib/assessments/assessment-email-intent-reconciler.test.ts`
- `src/src/__tests__/lib/assessments/assessment-email-intent-review-token.test.ts`
- `src/src/__tests__/lib/assessments/assessment-email-intent-operator.test.ts`
- `src/src/__tests__/components/assessments/org-survey-client-submit-retry.test.tsx`
- `src/src/__tests__/inngest/assessment-email-intent-reconciliation.test.ts`
- `src/src/__tests__/api/admin/assessment-email-delivery-intents-route.test.ts`
- `src/src/__tests__/components/admin/AssessmentEmailDeliveryHolds.test.tsx`
- `src/src/__tests__/scripts/audit-legacy-assessment-email-gaps.test.ts`
- `src/integration-tests/assessment-email-intent-reconciliation.pg.test.ts`
- `docs/runbooks/assessment-email-intent-reconciliation.md`

**Modify**

- `src/.env.example`
- `src/prisma/schema.prisma`
- `src/src/lib/assessments/wave-d-feature-flags.ts`
- `src/src/__tests__/lib/assessments/wave-d-feature-flags.test.ts`
- `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`
- `src/src/__tests__/app/org-survey/submit.test.ts`
- `src/src/inngest/types.ts`
- `src/src/app/api/inngest/route.ts`
- `src/src/lib/audit.ts`
- `src/src/components/nav/assessments-sidebar.tsx`
- `src/src/__tests__/components/nav/assessments-sidebar.test.tsx`
- `CLAUDE.md`
- `plans/CHANGELOG.md`

---

### Task 1: Add the default-off flag and additive intent ledger

**Files:**

- Modify: `src/.env.example`
- Modify: `src/prisma/schema.prisma`
- Modify: `src/src/lib/assessments/wave-d-feature-flags.ts`
- Modify: `src/src/__tests__/lib/assessments/wave-d-feature-flags.test.ts`
- Create: `src/prisma/migrations/20260803140000_add_assessment_email_delivery_intents/migration.sql`
- Create: `src/src/__tests__/prisma/assessment-email-delivery-intents-migration.test.ts`

**Interfaces:**

```ts
export function assessmentEmailDeliveryIntentsEnabled(): boolean;
```

The Prisma delegate is `assessmentEmailDeliveryIntent`. The table is
`assessment_email_delivery_intents`.

- [ ] **Step 1: Write the failing flag and migration contract tests**

Add the new flag reader to the existing truth table:

```ts
const ENABLE_FLAGS: Array<[string, () => boolean]> = [
  ["WAVE_D_AUTO_SEND_ENABLED", waveDAutoSendEnabled],
  ["WAVE_D_RESULTS_EMAIL_ENABLED", waveDResultsEmailEnabled],
  ["WAVE_D_COACH_NOTIFY_ENABLED", waveDCoachNotifyEnabled],
  ["WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", waveDCustomHtmlEmailEnabled],
  [
    "ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED",
    assessmentEmailDeliveryIntentsEnabled,
  ],
];
```

Create the migration text test with these assertions:

```ts
expect(sql).toContain('CREATE TABLE "assessment_email_delivery_intents"');
expect(sql).toContain(
  'CREATE UNIQUE INDEX "assessment_email_delivery_intents_submissionId_recipientRole_key"',
);
expect(sql).toContain(
  '("status", "nextAttemptAt", "createdAt", "id")',
);
expect(sql).toContain('("status", "expiresAt", "id")');
expect(sql).toContain('("status", "heldAt", "id")');
expect(sql).toMatch(/ON DELETE CASCADE/);
expect(sql).not.toMatch(/INSERT INTO "assessment_email_delivery_intents"/);
expect(sql).not.toMatch(/AssessmentEmailOutbox.*ALTER COLUMN/s);
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
npx jest \
  src/__tests__/lib/assessments/wave-d-feature-flags.test.ts \
  src/__tests__/prisma/assessment-email-delivery-intents-migration.test.ts \
  --runInBand
```

Expected: FAIL because the reader, model, and migration do not exist.

- [ ] **Step 3: Add the schema**

Add `deliveryIntents AssessmentEmailDeliveryIntent[]` to
`AssessmentSubmission`, then add:

```prisma
model AssessmentEmailDeliveryIntent {
  id                       String   @id @default(cuid())
  submissionId             String
  campaignId               String
  invitationId             String
  respondentId             String
  recipientRole            String
  emailType                String
  recipientEmail           String?
  subject                  String?
  bodyHtml                 String?
  payloadHash              String
  snapshotSchemaVersion    Int      @default(1)
  rendererContractVersion  Int      @default(1)
  authorizationSnapshot    Json?
  contentProvenance        Json?
  status                   String   @default("PENDING")
  version                  Int      @default(0)
  holdReason               String?
  holdReasons              Json?
  attempts                 Int      @default(0)
  lastErrorClass           String?
  nextAttemptAt            DateTime @default(now())
  heldAt                   DateTime?
  expiresAt                DateTime
  handedOffOutboxId        String?
  resolvedAt               DateTime?
  resolvedBy               String?
  resolutionReasonCode     String?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  submission AssessmentSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)

  @@unique([submissionId, recipientRole])
  @@index([status, nextAttemptAt, createdAt, id])
  @@index([status, expiresAt, id])
  @@index([status, heldAt, id])
  @@index([submissionId])
  @@map("assessment_email_delivery_intents")
}
```

Use application-allowlisted strings rather than a PostgreSQL enum so rollout is
additive when another state or reason is introduced.

- [ ] **Step 4: Write the matching additive SQL**

The migration creates only the new table, its foreign key, and indexes. Use
`TEXT` for payload and JSON columns, `TIMESTAMP(3)` for dates, and the Prisma
defaults above. Do not backfill historical submissions.

- [ ] **Step 5: Add the flag and environment declaration**

```ts
export function assessmentEmailDeliveryIntentsEnabled(): boolean {
  return isTruthy(process.env.ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED);
}
```

```dotenv
ASSESSMENT_EMAIL_DELIVERY_INTENTS_ENABLED="false"
ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET=""
```

- [ ] **Step 6: Validate and verify GREEN**

```bash
npx prisma format
npx prisma validate
npx prisma generate
node scripts/check-migration-safety.mjs
npx jest \
  src/__tests__/lib/assessments/wave-d-feature-flags.test.ts \
  src/__tests__/prisma/assessment-email-delivery-intents-migration.test.ts \
  --runInBand
```

Expected: all commands PASS.

- [ ] **Step 7: Commit the slice**

```bash
git add .env.example prisma/schema.prisma \
  prisma/migrations/20260803140000_add_assessment_email_delivery_intents/migration.sql \
  src/lib/assessments/wave-d-feature-flags.ts \
  src/__tests__/lib/assessments/wave-d-feature-flags.test.ts \
  src/__tests__/prisma/assessment-email-delivery-intents-migration.test.ts
git commit -m "feat(assessments): add email delivery intent ledger"
```

---

### Task 2: Freeze, validate, hash, and purge intent payloads

**Files:**

- Create: `src/src/lib/assessments/assessment-email-delivery-intents.ts`
- Create: `src/src/__tests__/lib/assessments/assessment-email-delivery-intents.test.ts`

**Interfaces:**

```ts
export const INTENT_SNAPSHOT_SCHEMA_VERSION = 1;
export const INTENT_RENDERER_CONTRACT_VERSION = 1;
export const INTENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export type AuthorizationSnapshotV1 = {
  schemaVersion: 1;
  common: {
    campaignId: string;
    invitationId: string;
    respondentId: string;
    templateId: string;
    templateAlias: string;
    versionId: string;
    accessMode: "INVITED";
    campaignStatus: string;
    campaignDeleted: boolean;
    invitationStatus: "SUBMITTED";
    invitationRevoked: boolean;
    closeAt: string | null;
    invitationExpiresAt: string;
    recipientRole: "RESPONDENT" | "OWNING_COACH";
    emailType: "ASSESSMENT_RESULTS" | "COACH_COMPLETION";
    phase2Fingerprint: string;
  };
  respondentResults?: {
    canonicalRecipientMailbox: string;
    sendResultsToRespondent: true;
    featureKey: "WAVE_D_RESULTS_EMAIL_ENABLED";
    featureEnabled: true;
    approved: true;
    approvedContentHash: string;
  };
  coachCompletion?: {
    canonicalRecipientMailbox: string;
    notifyCoachOnCompletion: true;
    featureKey: "WAVE_D_COACH_NOTIFY_ENABLED";
    featureEnabled: true;
    coachId: string;
  };
};

export type ContentProvenanceV1 = {
  schemaVersion: 1;
  templateId: string;
  versionId: string;
  templateAlias: string;
  reportType: string;
  approvalHash: string | null;
  rendererContractVersion: 1;
  sourceCommit: string;
  renderInputHash: string;
};

export function stableCanonicalJson(value: unknown): string;
export function assessmentEmailIntentPayloadHash(input: {
  snapshotSchemaVersion: number;
  recipientRole: string;
  emailType: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
}): string;
export function intentExpiresAt(createdAt: Date): Date;
export function sourceCommitIdentifier(env?: NodeJS.ProcessEnv): string;
export function parseAuthorizationSnapshot(value: unknown):
  | { supported: true; value: AuthorizationSnapshotV1 }
  | { supported: false };
export function terminalIntentData(input: {
  now: Date;
  status: "HANDED_OFF" | "CANCELLED" | "EXPIRED";
  outboxId?: string;
  actor: string;
  reasonCode: string;
  snapshot: AuthorizationSnapshotV1;
  provenance: ContentProvenanceV1;
}): Record<string, unknown>;
```

- [ ] **Step 1: Write failing pure-contract tests**

Pin the tuple order and purge behavior:

```ts
it("hashes the fixed payload tuple and detects every mutation", () => {
  const base = {
    snapshotSchemaVersion: 1,
    recipientRole: "RESPONDENT",
    emailType: "ASSESSMENT_RESULTS",
    recipientEmail: "person@example.com",
    subject: "Your results",
    bodyHtml: "<p>Frozen</p>",
  };
  const digest = assessmentEmailIntentPayloadHash(base);
  expect(digest).toMatch(/^[a-f0-9]{64}$/);
  const mutations = [
    { ...base, snapshotSchemaVersion: 2 },
    { ...base, recipientRole: "OWNING_COACH" },
    { ...base, emailType: "COACH_COMPLETION" },
    { ...base, recipientEmail: "other@example.com" },
    { ...base, subject: "Changed subject" },
    { ...base, bodyHtml: "<p>Changed</p>" },
  ];
  for (const mutation of mutations) {
    expect(assessmentEmailIntentPayloadHash(mutation)).not.toBe(digest);
  }
});

it("uses an absolute 30-day deadline", () => {
  expect(intentExpiresAt(new Date("2026-08-03T00:00:00.000Z"))).toEqual(
    new Date("2026-09-02T00:00:00.000Z"),
  );
});

it("purges every payload and PII-bearing snapshot field", () => {
  expect(terminalIntentData(terminalFixture())).toEqual(
    expect.objectContaining({
      recipientEmail: null,
      subject: null,
      bodyHtml: null,
      authorizationSnapshot: expect.not.objectContaining({
        respondentResults: expect.anything(),
        coachCompletion: expect.anything(),
      }),
    }),
  );
});
```

Also assert stable object-key ordering, unsupported schema rejection, invalid
role-specific snapshot rejection, and source-commit precedence
`VERCEL_GIT_COMMIT_SHA` → `GIT_COMMIT_SHA` → `"unknown"`.

- [ ] **Step 2: Run the test and verify RED**

```bash
npx jest src/__tests__/lib/assessments/assessment-email-delivery-intents.test.ts --runInBand
```

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement the pure contract**

Use `createHash("sha256")` over:

```ts
JSON.stringify([
  input.snapshotSchemaVersion,
  input.recipientRole,
  input.emailType,
  input.recipientEmail,
  input.subject,
  input.bodyHtml,
])
```

Use Zod discriminated refinement to require exactly one role-specific snapshot
block. `terminalIntentData` retains IDs, booleans, stable hashes, versions,
reason codes, and timestamps only. It nulls recipient, subject, body, canonical
mailbox, and any name or address field in the same update.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the slice**

```bash
git add src/lib/assessments/assessment-email-delivery-intents.ts \
  src/__tests__/lib/assessments/assessment-email-delivery-intents.test.ts
git commit -m "feat(assessments): define frozen email intent contract"
```

---

### Task 3: Make invited submission atomically create frozen intents

**Files:**

- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`
- Modify: `src/src/__tests__/app/org-survey/submit.test.ts`
- Create: `src/src/__tests__/components/assessments/org-survey-client-submit-retry.test.tsx`
- Modify: `src/src/inngest/types.ts`

**Interfaces:**

The existing prepared row gains:

```ts
type PreparedDeliveryRow = PreparedOutboxRow & {
  canonicalRecipientMailbox: string;
  renderInputHash: string;
  contentProvenance: ContentProvenanceV1;
};
```

The post-commit event is:

```ts
await inngest.send({
  name: "assessment/email-delivery-intent.created",
  data: { submissionId },
});
```

Add `AssessmentEmailDeliveryIntentCreated` and
`"assessment/email-delivery-intent.created"` to the typed Inngest schema in
this task so the submit-route commit remains type-correct on its own.

- [ ] **Step 1: Extend submit-route tests and verify RED**

Add coverage for:

```ts
it("flag on atomically creates two intents and no direct outbox rows");
it("flag on still creates valid intents while sends are globally paused");
it("flag off preserves the existing direct-outbox path and paused early return");
it("creates no intent for a gate-off, render-failed, or stale-fingerprint row");
it("lets an intent create failure fail the whole submit request");
it("dispatches one ID-only event after commit");
it("keeps the 200 response when post-commit event dispatch fails");
it("preserves the autosaved answer draft after a retryable 500");
```

The central assertions are:

```ts
expect(tx.assessmentEmailDeliveryIntent.create).toHaveBeenCalledTimes(2);
expect(tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
expect(tx.assessmentInvitation.update).toHaveBeenCalledAfter(
  tx.assessmentEmailDeliveryIntent.create,
);
expect(inngest.send).toHaveBeenCalledWith({
  name: "assessment/email-delivery-intent.created",
  data: { submissionId: "submission-1" },
});
expect(JSON.stringify(inngest.send.mock.calls)).not.toContain("@example.com");
```

- [ ] **Step 2: Run targeted submit tests and verify RED**

```bash
npx jest src/__tests__/app/org-survey/submit.test.ts --runInBand
```

Expected: FAIL because the intent delegate and event path are not used.

- [ ] **Step 3: Separate route selection from delivery authorization**

Evaluate `assessmentEmailDeliveryIntentsEnabled()` once per request. Pass
`respectGlobalPause: !intentMode` into the pure row builder so:

- legacy mode retains its current pause early return and direct-outbox loop;
- intent mode evaluates all other gates and freezes valid rows during pause.

Continue rendering before the transaction. Compute `renderInputHash` from the
stable canonical form of the exact report-model input and `rawAnswers`, never
by storing those values in provenance.

Extend the locked Phase-2 select with every fact used by
`AuthorizationSnapshotV1`: template ID/alias/approval fields, pinned version
ID/template ID, respondent email, campaign ownership/toggles/status/deadline,
invitation links/status/revocation/expiry, and owning Coach email. Do not build
an authorization snapshot from the unlocked Phase-1 relation.

- [ ] **Step 4: Replace only the flag-on persistence branch**

After the existing invitation lock, locked re-read, submission create, and
Phase-1/Phase-2 fingerprint filtering:

```ts
if (intentMode) {
  for (const row of rowsToPersist) {
    const snapshot = buildAuthorizationSnapshotV1({
      locked,
      row,
      phase2Fingerprint,
    });
    await tx.assessmentEmailDeliveryIntent.create({
      data: {
        submissionId: submission.id,
        campaignId: locked.campaignId,
        invitationId,
        respondentId: locked.respondentId,
        recipientRole: row.recipientRole,
        emailType: row.emailType,
        recipientEmail: row.recipientEmail,
        subject: row.subject,
        bodyHtml: row.bodyHtml,
        payloadHash: assessmentEmailIntentPayloadHash({
          snapshotSchemaVersion: 1,
          recipientRole: row.recipientRole,
          emailType: row.emailType,
          recipientEmail: row.recipientEmail,
          subject: row.subject,
          bodyHtml: row.bodyHtml,
        }),
        snapshotSchemaVersion: 1,
        rendererContractVersion: 1,
        authorizationSnapshot: snapshot,
        contentProvenance: row.contentProvenance,
        expiresAt: intentExpiresAt(submittedAt),
      },
    });
  }
} else {
  await persistLegacyDirectOutboxRows(tx, submission.id, rowsToPersist);
}
```

Do not catch intent persistence errors. They must abort submission and leave
the invitation retryable.

- [ ] **Step 5: Dispatch after commit, fail soft, and log IDs only**

Dispatch only when `intentMode` and at least one intent was created. Catch the
event error outside the transaction, log the submission/campaign/invitation
IDs and `error.name`, and preserve the successful response.

- [ ] **Step 6: Verify GREEN and client retry regression**

```bash
npx jest \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/lib/assessments/outbox-enqueue-failure.test.ts \
  --runInBand
```

Expected: PASS. Re-read
`src/src/components/assessments/org-survey-client.tsx` and confirm the existing
client still clears the draft only after a 2xx response. The new component
test must submit a fixture, return 500, and assert the ready phase and
localStorage draft remain; then return 200 and assert the draft clears.

- [ ] **Step 7: Commit the slice**

```bash
git add 'src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/components/assessments/org-survey-client-submit-retry.test.tsx \
  src/inngest/types.ts
git commit -m "feat(assessments): persist invited email intents atomically"
```

---

### Task 4: Implement deterministic current-state reauthorization

**Files:**

- Create: `src/src/lib/assessments/assessment-email-intent-reauthorization.ts`
- Create: `src/src/__tests__/lib/assessments/assessment-email-intent-reauthorization.test.ts`

**Interfaces:**

```ts
export type CurrentAuthorizationFactsV1 = {
  submission: {
    exists: boolean;
    campaignId: string | null;
    invitationId: string | null;
    respondentId: string | null;
  };
  campaign: {
    exists: boolean;
    templateId: string | null;
    versionId: string | null;
    accessMode: string | null;
    status: string | null;
    deleted: boolean | null;
    closeAt: string | null;
    sendResultsToRespondent: boolean | null;
    notifyCoachOnCompletion: boolean | null;
    createdByCoachId: string | null;
  };
  invitation: {
    exists: boolean;
    campaignId: string | null;
    respondentId: string | null;
    status: string | null;
    revoked: boolean | null;
    expiresAt: string | null;
  };
  respondent: {
    exists: boolean;
    canonicalMailbox: string | null;
  };
  template: {
    exists: boolean;
    alias: string | null;
    resultsEmailApproved: boolean | null;
    storedApprovedContentHash: string | null;
    liveContentHash: string | null;
  };
  version: { exists: boolean; templateId: string | null };
  coach: {
    exists: boolean;
    id: string | null;
    canonicalMailbox: string | null;
  } | null;
  features: {
    resultsEmailEnabled: boolean;
    coachNotifyEnabled: boolean;
  };
};

export type ReauthorizationDecision =
  | { kind: "AUTHORIZED" }
  | {
      kind: "HELD";
      primaryReason: EmailDeliveryIntentHoldCode;
      reasons: EmailDeliveryIntentHoldCode[];
    };

export function evaluateIntentReauthorization(input: {
  intent: FrozenIntentForAuthorization;
  snapshot: AuthorizationSnapshotV1;
  current: CurrentAuthorizationFactsV1;
}): ReauthorizationDecision;

export function reviewContextHash(input: {
  intentId: string;
  intentVersion: number;
  current: CurrentAuthorizationFactsV1;
}): string;
```

- [ ] **Step 1: Write the complete failing decision table**

Use `it.each` to pin every hold code. Include these two load-bearing cases:

```ts
it("does not treat natural passage beyond unchanged deadlines as drift", () => {
  expect(evaluateIntentReauthorization(unchangedFactsAfterDeadline())).toEqual({
    kind: "AUTHORIZED",
  });
});

it("orders multiple reasons by the global stable allowlist", () => {
  expect(evaluateIntentReauthorization(multipleDrifts())).toEqual({
    kind: "HELD",
    primaryReason: "CAMPAIGN_DELETED",
    reasons: [
      "CAMPAIGN_DELETED",
      "RESPONDENT_EMAIL_CHANGED",
      "FEATURE_DISABLED",
    ],
  });
});
```

Cover missing/mismatched identity links, deadline mutation, explicit stored
status mutation, revocation, template/version mutation, respondent/coach
mailbox mutation using the existing `normalizeMailbox`, approval revocation or
stored/live/frozen hash mutation, feature disable, schema version, and payload
mutation.

- [ ] **Step 2: Run and verify RED**

```bash
npx jest src/__tests__/lib/assessments/assessment-email-intent-reauthorization.test.ts --runInBand
```

Expected: FAIL because the evaluator does not exist.

- [ ] **Step 3: Implement a pure allowlisted evaluator**

Build a `Set<EmailDeliveryIntentHoldCode>`, add reasons without data values,
then return reasons filtered through `EMAIL_DELIVERY_INTENT_HOLD_CODES`. Do not
compare current clock time to an unchanged `closeAt` or invitation `expiresAt`.
Use the shared payload-hash function and the existing `normalizeMailbox`
helper.

`reviewContextHash` uses stable canonical JSON of every current fact displayed
on the detail page plus intent ID and version. It never includes frozen
recipient, subject, or HTML.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the slice**

```bash
git add src/lib/assessments/assessment-email-intent-reauthorization.ts \
  src/__tests__/lib/assessments/assessment-email-intent-reauthorization.test.ts
git commit -m "feat(assessments): reauthorize frozen email intents"
```

---

### Task 5: Build the short transactional reconciler

**Files:**

- Create: `src/src/lib/assessments/assessment-email-intent-reconciler.ts`
- Create: `src/src/__tests__/lib/assessments/assessment-email-intent-reconciler.test.ts`
- Modify: `src/src/lib/audit.ts`

**Interfaces:**

```ts
export type ReconcileScope =
  | { kind: "submission"; submissionId: string; maxRows: 10 }
  | { kind: "scheduled"; maxRows: 50 };

export type ReconcileResult = {
  handedOff: number;
  held: number;
  expired: number;
  deferredByPause: number;
  retried: number;
  existingOutboxWon: number;
  handedOffSubmissionIds: string[];
};

export async function reconcileAssessmentEmailIntents(
  deps: ReconcilerDeps,
  scope: ReconcileScope,
): Promise<ReconcileResult>;
```

- [ ] **Step 1: Write failing service tests**

Pin:

- oldest due selection, event scope 10, scheduled scope 50, and 45-second budget;
- pause defers pending work without incrementing attempts, while expiry runs;
- existing outbox in each of `PENDING`, `SENDING`, `SENT`, `FAILED`, and
  `CANCELLED` wins unchanged;
- authorized handoff copies exact bytes and provenance;
- deterministic drift moves to `HELD`;
- handoff, hold, and expiry audits are in the same transaction;
- terminal transitions null payload fields and PII snapshot fields;
- transient errors back off exponentially and hold on attempt five;
- logs and audit changes omit payload data and raw exception messages.

Use an injected `runOneTransaction` seam for unit tests. The core atomic
assertion is:

```ts
expect(tx.assessmentEmailOutbox.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    recipientEmail: frozen.recipientEmail,
    subject: frozen.subject,
    bodyHtml: frozen.bodyHtml,
    status: "PENDING",
  }),
});
expect(tx.auditLog.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    entityType: "AssessmentEmailDeliveryIntent",
    action: "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
  }),
});
expect(tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
  where: { id: frozen.id },
  data: expect.objectContaining({
    status: "HANDED_OFF",
    recipientEmail: null,
    subject: null,
    bodyHtml: null,
  }),
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npx jest src/__tests__/lib/assessments/assessment-email-intent-reconciler.test.ts --runInBand
```

Expected: FAIL because the reconciler is absent.

- [ ] **Step 3: Implement candidate selection and locks**

Each loop iteration opens one interactive transaction and runs:

```sql
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
```

Then select one candidate:

```sql
SELECT *
FROM "assessment_email_delivery_intents"
WHERE (
  "status" IN ('PENDING', 'HELD')
  AND "expiresAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
)
OR (
  "status" = 'PENDING'
  AND "nextAttemptAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
  AND $1::boolean
)
ORDER BY
  CASE WHEN "expiresAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
    THEN 0 ELSE 1 END,
  "nextAttemptAt", "createdAt", "id"
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

`$1` is false while globally paused, so expiry remains active. Add the event
submission predicate with `Prisma.sql`; never interpolate raw SQL strings.
Lock the authoritative rows in the fixed global order.

- [ ] **Step 4: Implement the state decisions**

Inside the same transaction:

1. existing outbox wins before expiry or reauthorization;
2. expired unresolved work becomes `EXPIRED`;
3. unsupported/corrupt payload becomes `HELD`;
4. authorized work creates one outbox row and becomes `HANDED_OFF`;
5. drift becomes `HELD`.

For an existing outbox winner, record its ID and never update it. If a unique
outbox race aborts the transaction, classify it transiently; the next attempt
observes the winner.

Every actual state transition increments `version` exactly once. A transient
`PENDING` → `PENDING` retry update does not increment it.

- [ ] **Step 5: Implement guarded transient bookkeeping**

After a failed transaction, update only:

```ts
where: {
  id: selected.id,
  status: "PENDING",
  version: selected.version,
}
```

Increment attempts, store `error.name` or a stable Prisma/PostgreSQL class,
and set `nextAttemptAt` to `now + 2^attempts minutes`. On the fifth failure,
atomically hold with `RETRY_EXHAUSTED` and write the hold audit. If this update
also fails, log IDs and error class only; leave the original row for cron.

- [ ] **Step 6: Add audit actions**

Extend `AuditAction` with:

```ts
| "ASSESSMENT_EMAIL_INTENT_DETAIL_VIEWED"
| "ASSESSMENT_EMAIL_INTENT_HELD"
| "ASSESSMENT_EMAIL_INTENT_HANDED_OFF"
| "ASSESSMENT_EMAIL_INTENT_RELEASED"
| "ASSESSMENT_EMAIL_INTENT_CANCELLED"
| "ASSESSMENT_EMAIL_INTENT_EXPIRED"
```

The reconciler writes `tx.auditLog.create` directly; do not use fail-soft
`logAudit`.

- [ ] **Step 7: Verify GREEN**

```bash
npx jest \
  src/__tests__/lib/assessments/assessment-email-intent-reconciler.test.ts \
  src/__tests__/inngest/quick-assessment-lead-email.test.ts \
  --runInBand
```

Expected: PASS, including the unchanged ADR-0030 worker suite.

- [ ] **Step 8: Commit the slice**

```bash
git add src/lib/audit.ts \
  src/lib/assessments/assessment-email-intent-reconciler.ts \
  src/__tests__/lib/assessments/assessment-email-intent-reconciler.test.ts
git commit -m "feat(assessments): reconcile delivery intents atomically"
```

---

### Task 6: Wire the event fast path and scheduled repair

**Files:**

- Create: `src/src/inngest/functions/assessment-email-intent-reconciliation.ts`
- Modify: `src/src/app/api/inngest/route.ts`
- Create: `src/src/__tests__/inngest/assessment-email-intent-reconciliation.test.ts`

**Interfaces:**

```ts
type AssessmentEmailDeliveryIntentCreated = {
  data: { submissionId: string };
};
```

Function IDs:

```text
assessment-email-intent-reconciliation
assessment-email-intent-reconciliation-cron
```

- [ ] **Step 1: Write failing function-registration tests**

Assert:

```ts
expect(eventFunction.trigger).toEqual({
  event: "assessment/email-delivery-intent.created",
});
expect(cronFunction.trigger).toEqual({ cron: "*/3 * * * *" });
expect(reconcileAssessmentEmailIntents).toHaveBeenCalledWith(
  expect.anything(),
  { kind: "submission", submissionId: "submission-1", maxRows: 10 },
);
```

When handoffs occur, assert the function emits only existing outbox-drain
events:

```ts
expect(step.sendEvent).toHaveBeenCalledWith(
  "request-outbox-drain",
  expect.arrayContaining([
    {
      name: "assessment/quick-lead.enqueued",
      data: { submissionId: "submission-1" },
    },
  ]),
);
```

Deduplicate returned submission IDs before `sendEvent`.

- [ ] **Step 2: Run and verify RED**

```bash
npx jest src/__tests__/inngest/assessment-email-intent-reconciliation.test.ts --runInBand
```

Expected: FAIL because the event schema and functions do not exist.

- [ ] **Step 3: Implement both thin Inngest functions**

The event function calls the shared reconciler with max 10. The cron calls it
with max 50. Both use a 45-second service budget. Neither imports the SMTP
transport or calls `drainLeadOutbox`; they emit the existing ID-only outbox
event after successful handoff.

Register both in `src/src/app/api/inngest/route.ts`. The reconciler ignores the
route-selection flag so disabling new intent creation never strands existing
rows.

- [ ] **Step 4: Verify GREEN**

```bash
npx jest \
  src/__tests__/inngest/assessment-email-intent-reconciliation.test.ts \
  src/__tests__/inngest/quick-assessment-lead-email.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the slice**

```bash
git add src/inngest/functions/assessment-email-intent-reconciliation.ts \
  src/app/api/inngest/route.ts \
  src/__tests__/inngest/assessment-email-intent-reconciliation.test.ts
git commit -m "feat(assessments): schedule email intent reconciliation"
```

---

### Task 7: Prove atomicity and concurrency against PostgreSQL

**Files:**

- Create: `src/integration-tests/assessment-email-intent-reconciliation.pg.test.ts`

**Interfaces:**

Reuse the safety contract from the existing PostgreSQL suites:

```text
TEST_DATABASE_URL must be set
ASSESSMENT_EMAIL_LEASE_TEST_ALLOW must equal isolated-schema
TEST_DATABASE_URL must not equal DATABASE_URL
```

- [ ] **Step 1: Add the isolated-schema harness and first failing proof**

Create an isolated schema and the minimal pre-migration tables with the exact
mapped names and columns used by the service. Apply the exact new migration
file, then seed the submission/campaign/invitation/respondent/template/version/
coach rows required and use two Prisma clients.

First prove:

```ts
it("rolls back submission when a required intent insert fails");
it("lets exactly one of event and cron create the outbox row");
```

The concurrency assertion is:

```ts
expect(await countOutboxRows("submission-1", "RESPONDENT")).toBe(1);
expect(await readIntent("intent-1")).toEqual(
  expect.objectContaining({
    status: "HANDED_OFF",
    recipientEmail: null,
    subject: null,
    bodyHtml: null,
  }),
);
expect(await countIntentAudits("intent-1", "ASSESSMENT_EMAIL_INTENT_HANDED_OFF"))
  .toBe(1);
```

- [ ] **Step 2: Run and verify RED**

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
ASSESSMENT_EMAIL_LEASE_TEST_ALLOW=isolated-schema \
npx jest --config jest.pg.config.js \
  integration-tests/assessment-email-intent-reconciliation.pg.test.ts \
  --runInBand
```

Expected: FAIL until the service SQL and migration satisfy the real database.
If `TEST_DATABASE_URL` is unavailable, record this gate as not run and do not
substitute a production database.

- [ ] **Step 3: Complete the database proof matrix**

Add tests for:

- a relevant mutation that locks first is observed as drift;
- handoff that locks first completes before the mutation proceeds;
- each existing outbox status wins without mutation;
- audit failure rolls back outbox creation, resolution, and purge;
- unique constraints hold for both intent and outbox identities;
- expiry runs during pause and purges atomically;
- lock timeout and serialization failure retain retryable work.

Use barriers implemented with promises and explicit transactions; do not use
timing-only sleeps as the proof.

- [ ] **Step 4: Run all PostgreSQL regressions**

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
ASSESSMENT_EMAIL_LEASE_TEST_ALLOW=isolated-schema \
npm run test:assessment-email-lease-pg
```

Expected: PASS for the new suite plus
`assessment-email-lease.pg.test.ts` and `tx-swallowed-error.pg.test.ts`.

- [ ] **Step 5: Commit the proof**

```bash
git add integration-tests/assessment-email-intent-reconciliation.pg.test.ts
git commit -m "test(assessments): prove intent reconciliation on postgres"
```

---

### Task 8: Issue actor-bound review tokens and implement operator transactions

**Files:**

- Create: `src/src/lib/assessments/assessment-email-intent-review-token.ts`
- Create: `src/src/lib/assessments/assessment-email-intent-operator.ts`
- Create: `src/src/__tests__/lib/assessments/assessment-email-intent-review-token.test.ts`
- Create: `src/src/__tests__/lib/assessments/assessment-email-intent-operator.test.ts`
- Modify: `src/integration-tests/assessment-email-intent-reconciliation.pg.test.ts`

**Interfaces:**

```ts
export type ReviewTokenClaimsV1 = {
  schemaVersion: 1;
  actorUserId: string;
  intentId: string;
  intentVersion: number;
  reviewContextHash: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export function issueIntentReviewToken(
  claims: Omit<ReviewTokenClaimsV1, "schemaVersion" | "issuedAt" | "expiresAt" | "nonce">,
  options?: { now?: Date; secret?: string },
): string;

export function verifyIntentReviewToken(
  token: string,
  expected: {
    actorUserId: string;
    intentId: string;
    intentVersion: number;
    reviewContextHash: string;
  },
  options?: { now?: Date; secret?: string },
): ReviewTokenClaimsV1;

export async function loadHeldIntentDetail(...): Promise<HeldIntentDetail>;
export async function releaseHeldIntent(...): Promise<OperatorResolution>;
export async function cancelHeldIntent(...): Promise<OperatorResolution>;
```

- [ ] **Step 1: Write failing token tests**

Test valid 15-minute use and rejection for expired, malformed, cross-actor,
wrong-intent, stale-version, changed-context, and wrong-secret tokens. Assert
the token text contains neither address, subject, nor HTML.

- [ ] **Step 2: Implement encrypted, authenticated tokens**

Require a secret of at least 32 characters. Derive a 256-bit key with SHA-256,
then use AES-256-GCM with a random 12-byte IV. Encode:

```text
v1.<base64url iv>.<base64url ciphertext>.<base64url auth tag>
```

The encrypted JSON contains only `ReviewTokenClaimsV1`. Reject any schema
version other than 1.

- [ ] **Step 3: Write failing operator-service tests**

Pin:

- detail uses a repeatable-read transaction, locks/re-reads current facts,
  writes `ASSESSMENT_EMAIL_INTENT_DETAIL_VIEWED`, and returns only after audit;
- detail audit failure returns no payload or token;
- release reuses the fixed lock order and rejects pause, expiry, bad status,
  stale version, unsupported schema, bad payload hash, and stale review facts;
- release creates or adopts one outbox row, writes audit, resolves, and purges
  atomically;
- cancellation needs no review token, creates no outbox row, writes audit, and
  purges atomically;
- reason codes are allowlisted and no free text is accepted.

- [ ] **Step 4: Implement detail, release, and cancellation**

`loadHeldIntentDetail` runs:

```ts
db.$transaction(
  async (tx) => {
    const intent = await readHeldIntentAndCurrentFacts(tx, id);
    const contextHash = reviewContextHash({
      intentId: intent.id,
      intentVersion: intent.version,
      current: intent.current,
    });
    await tx.auditLog.create({
      data: detailViewedAudit(actor, intent),
    });
    return {
      ...toHeldIntentDetail(intent),
      reviewToken: issueIntentReviewToken({
        actorUserId: actor.userId,
        intentId: intent.id,
        intentVersion: intent.version,
        reviewContextHash: contextHash,
      }),
    };
  },
  { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
);
```

Release re-locks and recomputes the context hash before token verification.
It treats an existing outbox row as the winner. Cancellation verifies only
held status, version, expiry, and reason because it cannot send.

- [ ] **Step 5: Extend the PostgreSQL proof with operator races**

Add the proofs that depend on this task:

- release racing automatic reconciliation creates one outbox row;
- automatic and release paths acquire authoritative rows in the fixed order;
- stale reviewed facts reject release after a concurrent mutation; and
- release audit failure rolls back outbox creation, resolution, and purge.

- [ ] **Step 6: Verify GREEN**

```bash
npx jest \
  src/__tests__/lib/assessments/assessment-email-intent-review-token.test.ts \
  src/__tests__/lib/assessments/assessment-email-intent-operator.test.ts \
  --runInBand
```

Then run the isolated PostgreSQL command from Task 7. Expected: PASS.

- [ ] **Step 7: Commit the slice**

```bash
git add src/lib/assessments/assessment-email-intent-review-token.ts \
  src/lib/assessments/assessment-email-intent-operator.ts \
  src/__tests__/lib/assessments/assessment-email-intent-review-token.test.ts \
  src/__tests__/lib/assessments/assessment-email-intent-operator.test.ts \
  integration-tests/assessment-email-intent-reconciliation.pg.test.ts
git commit -m "feat(assessments): secure held intent resolution"
```

---

### Task 9: Expose narrow ADMIN/STAFF operator APIs

**Files:**

- Create: `src/src/app/api/admin/assessment-email-delivery-intents/route.ts`
- Create: `src/src/app/api/admin/assessment-email-delivery-intents/[id]/route.ts`
- Create: `src/src/app/api/admin/assessment-email-delivery-intents/[id]/release/route.ts`
- Create: `src/src/app/api/admin/assessment-email-delivery-intents/[id]/cancel/route.ts`
- Create: `src/src/__tests__/api/admin/assessment-email-delivery-intents-route.test.ts`

**Interfaces:**

List item:

```ts
type HeldIntentListItem = {
  id: string;
  version: number;
  submissionId: string;
  campaignId: string;
  recipientRole: string;
  emailType: string;
  maskedRecipient: string;
  holdReason: string;
  createdAt: string;
  heldAt: string;
  expiresAt: string;
  provenance: {
    templateId: string;
    versionId: string;
    templateAlias: string;
    reportType: string;
    rendererContractVersion: number;
  };
};
```

- [ ] **Step 1: Write the failing route matrix**

For every endpoint assert 401 unauthenticated, 403 Coach, and 200/409 for
ADMIN and STAFF as applicable. Also pin rate limiting first:

```ts
expect(withRateLimit).toHaveBeenCalled();
expect(getApiActor).not.toHaveBeenCalled();
```

Assert response headers and body exclusions:

```ts
expect(response.headers.get("cache-control")).toBe("private, no-store");
expect(response.headers.get("referrer-policy")).toBe("no-referrer");
expect(JSON.stringify(listBody)).not.toContain("person@example.com");
expect(detailBody.data).not.toHaveProperty("bodyHtml");
```

Validate limit `1..50`, opaque cursor, integer `expectedVersion`, fixed release
reason, fixed cancellation reasons, and absence of recipient/subject/body edit
fields.

- [ ] **Step 2: Run and verify RED**

```bash
npx jest src/__tests__/api/admin/assessment-email-delivery-intents-route.test.ts --runInBand
```

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement list without selecting full payload**

Use parameterized raw SQL to compute `maskedRecipient` in PostgreSQL and return
only the masked expression:

```sql
CASE
  WHEN POSITION('@' IN "recipientEmail") > 1
  THEN LEFT("recipientEmail", 1) || '***@' ||
       SPLIT_PART("recipientEmail", '@', 2)
  ELSE '***'
END AS "maskedRecipient"
```

Filter `status = 'HELD'`, order by `heldAt`, `createdAt`, `id`, fetch
`limit + 1`, and expose a base64url-encoded JSON cursor containing that exact
three-field keyset. Decode with a strict Zod schema and use parameterized
keyset predicates; never concatenate the cursor into SQL. Do not select
subject or body.

- [ ] **Step 4: Implement detail and mutations**

Use `withRateLimit(request, RateLimits.standard)` before auth. Use
`getApiActor` and `isPrivilegedRole`. Parse bodies with strict Zod objects so
unknown edit fields are rejected. Map stale state/token/facts to 409, expired
intent to 410, pause to 423, invalid body to 400, and audit persistence failure
to 500.

- [ ] **Step 5: Verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit the slice**

```bash
git add src/app/api/admin/assessment-email-delivery-intents \
  src/__tests__/api/admin/assessment-email-delivery-intents-route.test.ts
git commit -m "feat(admin): add delivery hold operator APIs"
```

---

### Task 10: Add the Delivery Holds queue and inert preview

**Files:**

- Create: `src/src/app/(dashboard)/admin/assessments/delivery-holds/page.tsx`
- Create: `src/src/components/admin/AssessmentEmailDeliveryHolds.tsx`
- Create: `src/src/__tests__/components/admin/AssessmentEmailDeliveryHolds.test.tsx`
- Modify: `src/src/lib/assessments/assessment-email-intent-operator.ts`
- Modify: `src/src/__tests__/lib/assessments/assessment-email-intent-operator.test.ts`
- Modify: `src/src/__tests__/api/admin/assessment-email-delivery-intents-route.test.ts`
- Modify: `src/src/components/nav/assessments-sidebar.tsx`
- Modify: `src/src/__tests__/components/nav/assessments-sidebar.test.tsx`

**Interfaces:**

The detail service returns `previewDocument`, not raw `bodyHtml`. Build the
preview server-side with `sanitize-html` and this effective policy:

```text
default-src 'none';
base-uri 'none';
connect-src 'none';
font-src 'none';
form-action 'none';
frame-src 'none';
img-src data:;
media-src 'none';
object-src 'none';
script-src 'none';
style-src 'unsafe-inline';
navigate-to 'none';
```

- [ ] **Step 1: Write failing component and navigation tests**

Assert:

```tsx
expect(screen.getByText("Delivery Holds").closest("a")).toHaveAttribute(
  "href",
  "/admin/assessments/delivery-holds",
);
expect(screen.queryByText("Delivery Holds")).not.toBeInTheDocument(); // Coach render

const preview = screen.getByTitle("Frozen email preview");
expect(preview).toHaveAttribute("sandbox", "");
expect(preview).toHaveAttribute("referrerpolicy", "no-referrer");
expect(preview.getAttribute("srcdoc")).toContain("default-src 'none'");
expect(preview.getAttribute("srcdoc")).not.toContain("https://tracker.example");
```

Also cover masked list, full recipient/subject only after detail, reason
selection, version/token submission, stale-review refresh prompt, cancel
without token, and absence of edit/download/export/copy controls.

- [ ] **Step 2: Run and verify RED**

```bash
npx jest \
  src/__tests__/components/admin/AssessmentEmailDeliveryHolds.test.tsx \
  src/__tests__/api/admin/assessment-email-delivery-intents-route.test.ts \
  src/__tests__/components/nav/assessments-sidebar.test.tsx \
  --runInBand
```

Expected: FAIL because the page/component/link do not exist.

- [ ] **Step 3: Build a preview-only sanitizer**

In the operator module, create `buildInertIntentPreviewDocument(bodyHtml)`.
Allow conservative email structure and inline style only. Remove scripts,
forms, frames, objects, embeds, SVG, audio/video, event attributes, `href`,
`srcset`, CSS `url(...)`, and every image source except
`data:image/png|jpeg|gif|webp;base64`. Prepend the CSP meta tag and a
`no-referrer` meta tag. This transforms only the preview copy; the stored and
released bytes remain unchanged.

- [ ] **Step 4: Build the queue**

The server page repeats the ADMIN/STAFF gate already present in the admin
assessment layout. The client:

- fetches the masked held list;
- opens one audited detail at a time;
- renders recipient and subject as text;
- places only `previewDocument` into `<iframe sandbox="">`;
- shows stable snapshot/current drift fields;
- posts `expectedVersion`, reason code, and review token on release;
- posts `expectedVersion` and reason code on cancel;
- removes a resolved row and clears detail on success.

Add the sidebar link adjacent to Observability.

- [ ] **Step 5: Verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit the slice**

```bash
git add 'src/app/(dashboard)/admin/assessments/delivery-holds/page.tsx' \
  src/components/admin/AssessmentEmailDeliveryHolds.tsx \
  src/components/nav/assessments-sidebar.tsx \
  src/lib/assessments/assessment-email-intent-operator.ts \
  src/__tests__/components/admin/AssessmentEmailDeliveryHolds.test.tsx \
  src/__tests__/api/admin/assessment-email-delivery-intents-route.test.ts \
  src/__tests__/lib/assessments/assessment-email-intent-operator.test.ts \
  src/__tests__/components/nav/assessments-sidebar.test.tsx
git commit -m "feat(admin): add assessment delivery holds queue"
```

---

### Task 11: Add read-only legacy audit and operational runbook

**Files:**

- Create: `src/scripts/audit-legacy-assessment-email-gaps.ts`
- Create: `src/src/__tests__/scripts/audit-legacy-assessment-email-gaps.test.ts`
- Create: `docs/runbooks/assessment-email-intent-reconciliation.md`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**

Auditor output:

```ts
type LegacyAuditReport = {
  classification: "UNVERIFIABLE_CANDIDATE";
  generatedAt: string;
  counts: {
    submissionsInspected: number;
    missingRespondentRole: number;
    missingCoachRole: number;
  };
  candidates: Array<{
    submissionId: string;
    campaignId: string;
    invitationId: string;
    missingRoles: Array<"RESPONDENT" | "OWNING_COACH">;
    currentEvidenceCodes: string[];
  }>;
};
```

- [ ] **Step 1: Write failing auditor-contract tests**

Assert the classifier emits IDs, allowlisted current-evidence codes, and
counts. Assert serialized output contains no `recipientEmail`, `subject`,
`bodyHtml`, `answers`, `result`, `@`, URL, payload reconstruction, apply
mapping, or write command.

- [ ] **Step 2: Run and verify RED**

```bash
npx jest src/__tests__/scripts/audit-legacy-assessment-email-gaps.test.ts --runInBand
```

Expected: FAIL because the auditor does not exist.

- [ ] **Step 3: Implement a SELECT-only auditor**

The command requires `--until=<ISO date>` as the explicitly supplied
intent-first rollout boundary and accepts optional `--since=<ISO date>`.
Reject unknown arguments. Query invited submissions in that closed-open
window and compare current outbox role presence. Use
`$queryRaw` only; the module must not call any Prisma create, update, upsert,
delete, executeRaw, renderer, SMTP, or Inngest function.

Do not add an npm script that points at production. The implementation PR does
not run this command against production.

- [ ] **Step 4: Write the operational runbook**

Document:

- flag-off schema deployment, read-only empty-queue check, non-production
  exercise, enable, and rollback sequence;
- why the reconciler must remain deployed when the route flag is disabled;
- read-only SQL for PENDING/HELD counts, oldest age, 24-hour approaching
  expiry, holds by reason/role, retry exhausted, expiries in 24 hours,
  successful handoffs, and existing-outbox-won outcomes;
- structured-log queries for event dispatch failures and reconciliation
  latency;
- thresholds:
  - alert when oldest due PENDING exceeds 10 minutes;
  - alert when any unresolved payload has less than 24 hours remaining;
  - alert immediately on `RETRY_EXHAUSTED`;
  - investigate any event-dispatch failures lasting two cron intervals;
  - review expiry count above zero daily;
- operator response for pause, holds, release, cancellation, expiry, and
  source rollback;
- explicit prohibition on production replay/backfill/manual writes without a
  separately approved operating plan.

- [ ] **Step 5: Update source-of-truth freshness**

Update `CLAUDE.md` `LAST_UPDATED_ISO` and `LAST_UPDATED_SLUG`, then prepend a
focused `plans/CHANGELOG.md` entry covering the new ledger, flag, reconciliation
contract, operator controls, retention, tests, and no-production-operation
boundary.

- [ ] **Step 6: Verify GREEN**

```bash
npx jest src/__tests__/scripts/audit-legacy-assessment-email-gaps.test.ts --runInBand
rg -n "UNVERIFIABLE_CANDIDATE|oldest due PENDING|RETRY_EXHAUSTED|replay|backfill" \
  docs/runbooks/assessment-email-intent-reconciliation.md
```

Expected: test PASS and each required runbook concept is found.

- [ ] **Step 7: Commit the slice**

```bash
git add scripts/audit-legacy-assessment-email-gaps.ts \
  src/__tests__/scripts/audit-legacy-assessment-email-gaps.test.ts \
  ../docs/runbooks/assessment-email-intent-reconciliation.md \
  ../CLAUDE.md ../plans/CHANGELOG.md
git commit -m "docs(assessments): operationalize email intent reconciliation"
```

---

### Task 12: Run the complete regression and acceptance gate

**Files:**

- Verify all files listed in this plan.
- Modify only files that fail an acceptance check, and keep fixes within the
  approved design.

- [ ] **Step 1: Run focused unit and route suites**

```bash
npx jest \
  src/__tests__/lib/assessments/assessment-email-delivery-intents.test.ts \
  src/__tests__/lib/assessments/assessment-email-intent-reauthorization.test.ts \
  src/__tests__/lib/assessments/assessment-email-intent-reconciler.test.ts \
  src/__tests__/lib/assessments/assessment-email-intent-review-token.test.ts \
  src/__tests__/lib/assessments/assessment-email-intent-operator.test.ts \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/components/assessments/org-survey-client-submit-retry.test.tsx \
  src/__tests__/lib/assessments/outbox-enqueue-failure.test.ts \
  src/__tests__/inngest/assessment-email-intent-reconciliation.test.ts \
  src/__tests__/inngest/quick-assessment-lead-email.test.ts \
  src/__tests__/api/admin/assessment-email-delivery-intents-route.test.ts \
  src/__tests__/components/admin/AssessmentEmailDeliveryHolds.test.tsx \
  src/__tests__/components/nav/assessments-sidebar.test.tsx \
  src/__tests__/scripts/audit-legacy-assessment-email-gaps.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run Prisma and migration gates**

```bash
npx prisma format
npx prisma validate
npx prisma generate
node scripts/check-migration-safety.mjs
```

Expected: PASS.

- [ ] **Step 3: Run real PostgreSQL proofs**

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
ASSESSMENT_EMAIL_LEASE_TEST_ALLOW=isolated-schema \
npm run test:assessment-email-lease-pg
```

Expected: PASS when an isolated test database is available. Never point this
at production.

- [ ] **Step 4: Run type, lint, whitespace, and build gates**

```bash
npx tsc --noEmit
npx eslint \
  'src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  src/app/api/admin/assessment-email-delivery-intents \
  'src/app/(dashboard)/admin/assessments/delivery-holds/page.tsx' \
  src/components/admin/AssessmentEmailDeliveryHolds.tsx \
  src/components/nav/assessments-sidebar.tsx \
  src/inngest/functions/assessment-email-intent-reconciliation.ts \
  src/inngest/types.ts \
  src/lib/audit.ts \
  src/lib/assessments/assessment-email-delivery-intents.ts \
  src/lib/assessments/assessment-email-intent-reauthorization.ts \
  src/lib/assessments/assessment-email-intent-reconciler.ts \
  src/lib/assessments/assessment-email-intent-review-token.ts \
  src/lib/assessments/assessment-email-intent-operator.ts \
  scripts/audit-legacy-assessment-email-gaps.ts
git diff --check origin/main...HEAD
CI=true npx next build --turbopack
```

Expected: PASS.

- [ ] **Step 5: Perform the acceptance review**

Prove from tests and diff that:

1. every expected flag-on email has an outbox row or durable intent;
2. no code path rerenders or replaces a frozen intent;
3. every drift result is allowlisted and deterministic;
4. concurrent event, cron, and release paths produce one outbox row;
5. existing outbox rows in all statuses are unchanged and authoritative;
6. handoff/resolution, audit, and purge are atomic;
7. only ADMIN/STAFF can inspect details, release, or cancel;
8. release uses exact bytes and rechecks pause, token facts, version, expiry,
   schema, hash, and duplicate ownership;
9. unresolved PII purges on handoff, cancellation, or absolute expiry;
10. legacy candidates remain read-only and unverifiable;
11. the ADR-0030 worker has no semantic diff; and
12. no production replay, backfill, manual write, flag change, or deployment
    occurred.

- [ ] **Step 6: Scan for incomplete plan artifacts and unsafe output**

```bash
rg -n "T[O]DO|T[B]D|place[Hh]older|similar to T[a]sk|recipientEmail.*console|bodyHtml.*console|subject.*console" \
  src/src/lib/assessments \
  src/src/inngest/functions/assessment-email-intent-reconciliation.ts \
  src/src/app/api/admin/assessment-email-delivery-intents \
  src/scripts/audit-legacy-assessment-email-gaps.ts \
  docs/runbooks/assessment-email-intent-reconciliation.md
```

Expected: no incomplete implementation markers and no payload-bearing log
statements. Review any legitimate match manually.

- [ ] **Step 7: Commit only acceptance fixes**

If Steps 1–6 required changes:

```bash
git status --short
git add <only-the-files-fixed-for-acceptance>
git commit -m "test(assessments): complete intent reconciliation gates"
```

If no changes were required, do not create an empty commit.

## Execution handoff

Recommended execution mode: **Subagent-Driven Development** in this task,
because schema, pure contracts, reconciler, operator APIs, UI, and PostgreSQL
proofs are independently reviewable slices while still benefiting from
task-by-task review. Use `superpowers:subagent-driven-development` and execute
Tasks 1–12 in order. If agent slots are unavailable, use
`superpowers:executing-plans` in a dedicated implementation session.

Do not begin implementation until the user explicitly authorizes execution.
