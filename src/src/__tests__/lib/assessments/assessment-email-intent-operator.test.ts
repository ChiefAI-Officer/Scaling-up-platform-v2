import { Prisma } from "@prisma/client";
import {
  assessmentEmailIntentPayloadHash,
  type AuthorizationSnapshotV1,
} from "@/lib/assessments/assessment-email-delivery-intents";
import type { CurrentAuthorizationFactsV1 } from "@/lib/assessments/assessment-email-intent-reauthorization";
import {
  issueIntentReviewToken,
  verifyIntentReviewToken,
} from "@/lib/assessments/assessment-email-intent-review-token";
import {
  OperatorServiceError,
  cancelHeldIntent,
  loadHeldIntentDetail,
  releaseHeldIntent,
  type OperatorDeps,
} from "@/lib/assessments/assessment-email-intent-operator";

const NOW = new Date("2026-08-03T05:00:00.000Z");
const TOKEN_SECRET =
  "task-8-operator-review-token-secret-at-least-32-characters";
const RECIPIENT = "private-recipient@example.com";
const SUBJECT = "Private frozen subject";
const HTML = "<html><body>Private frozen body</body></html>";
const RELEASE_REASON = "DRIFT_REVIEWED_SEND_FROZEN" as const;
const CANCEL_REASONS = [
  "DELIVERY_NO_LONGER_AUTHORIZED",
  "RECIPIENT_SUPERSEDED",
  "CAMPAIGN_RETIRED",
  "DUPLICATE_CONFIRMED",
  "POLICY_DECISION",
] as const;

function authorizationSnapshot(): AuthorizationSnapshotV1 {
  return {
    schemaVersion: 1,
    common: {
      campaignId: "campaign-1",
      invitationId: "invitation-1",
      respondentId: "respondent-1",
      templateId: "template-1",
      templateAlias: "qsp-v2",
      versionId: "version-1",
      accessMode: "INVITED",
      campaignStatus: "ACTIVE",
      campaignDeleted: false,
      invitationStatus: "SUBMITTED",
      invitationRevoked: false,
      closeAt: "2026-08-30T00:00:00.000Z",
      invitationExpiresAt: "2026-08-20T00:00:00.000Z",
      recipientRole: "RESPONDENT",
      emailType: "ASSESSMENT_RESULTS",
      phase2Fingerprint: "a".repeat(64),
    },
    respondentResults: {
      canonicalRecipientMailbox: RECIPIENT,
      sendResultsToRespondent: true,
      featureKey: "WAVE_D_RESULTS_EMAIL_ENABLED",
      featureEnabled: true,
      approved: true,
      approvedContentHash: "b".repeat(64),
    },
  };
}

function contentProvenance() {
  return {
    schemaVersion: 1,
    templateId: "template-1",
    versionId: "version-1",
    templateAlias: "qsp-v2",
    reportType: "ASSESSMENT_RESULTS",
    approvalHash: "b".repeat(64),
    rendererContractVersion: 1,
    sourceCommit: "c".repeat(40),
    renderInputHash: "d".repeat(64),
  };
}

function frozenIntent(overrides: Record<string, unknown> = {}) {
  const base = {
    id: "intent-1",
    submissionId: "submission-1",
    campaignId: "campaign-1",
    invitationId: "invitation-1",
    respondentId: "respondent-1",
    recipientRole: "RESPONDENT",
    emailType: "ASSESSMENT_RESULTS",
    recipientEmail: RECIPIENT,
    subject: SUBJECT,
    bodyHtml: HTML,
    snapshotSchemaVersion: 1,
    rendererContractVersion: 1,
    authorizationSnapshot: authorizationSnapshot(),
    contentProvenance: contentProvenance(),
    status: "HELD",
    version: 7,
    holdReason: "CAMPAIGN_STATUS_CHANGED",
    holdReasons: ["CAMPAIGN_STATUS_CHANGED"],
    attempts: 0,
    lastErrorClass: null,
    nextAttemptAt: new Date("2026-08-02T00:00:00.000Z"),
    heldAt: new Date("2026-08-03T04:00:00.000Z"),
    expiresAt: new Date("2026-09-02T00:00:00.000Z"),
    handedOffOutboxId: null,
    resolvedAt: null,
    resolvedBy: null,
    resolutionReasonCode: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-03T04:00:00.000Z"),
  };
  return {
    ...base,
    payloadHash: assessmentEmailIntentPayloadHash({
      snapshotSchemaVersion: base.snapshotSchemaVersion,
      recipientRole: base.recipientRole,
      emailType: base.emailType,
      recipientEmail: base.recipientEmail,
      subject: base.subject,
      bodyHtml: base.bodyHtml,
    }),
    ...overrides,
  };
}

function currentFacts(): CurrentAuthorizationFactsV1 {
  return {
    submission: {
      exists: true,
      campaignId: "campaign-1",
      invitationId: "invitation-1",
      respondentId: "respondent-1",
    },
    campaign: {
      exists: true,
      templateId: "template-1",
      versionId: "version-1",
      accessMode: "INVITED",
      status: "CLOSED",
      deleted: false,
      closeAt: "2026-08-30T00:00:00.000Z",
      sendResultsToRespondent: true,
      notifyCoachOnCompletion: true,
      createdByCoachId: "coach-1",
    },
    invitation: {
      exists: true,
      campaignId: "campaign-1",
      respondentId: "respondent-1",
      status: "SUBMITTED",
      revoked: false,
      expiresAt: "2026-08-20T00:00:00.000Z",
    },
    respondent: {
      exists: true,
      canonicalMailbox: RECIPIENT,
    },
    template: {
      exists: true,
      alias: "qsp-v2",
      resultsEmailApproved: true,
      storedApprovedContentHash: "b".repeat(64),
      liveContentHash: "b".repeat(64),
    },
    version: { exists: true, templateId: "template-1" },
    coach: null,
    features: {
      resultsEmailEnabled: true,
      coachNotifyEnabled: true,
    },
  };
}

type Intent = ReturnType<typeof frozenIntent>;
type Outbox = {
  id: string;
  submissionId: string;
  recipientRole: string;
  status: string;
  [key: string]: unknown;
};
type Audit = { [key: string]: unknown };
type HarnessState = {
  intent: Intent | null;
  facts: CurrentAuthorizationFactsV1;
  outboxes: Outbox[];
  audits: Audit[];
};

function queryText(query: unknown): string {
  if (typeof query === "string") return query;
  if (query && typeof query === "object") {
    const sql = query as { sql?: string; strings?: string[] };
    return [sql.sql, ...(sql.strings ?? [])].filter(Boolean).join(" ");
  }
  return "";
}

function queryValues(query: unknown): unknown[] {
  if (query && typeof query === "object") {
    return (query as { values?: unknown[] }).values ?? [];
  }
  return [];
}

function deepClone<T>(value: T): T {
  if (value instanceof Date) return new Date(value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepClone(item)]),
    ) as T;
  }
  return value;
}

function applyData(target: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === "object" &&
      "increment" in value &&
      typeof (value as { increment: unknown }).increment === "number"
    ) {
      target[key] =
        Number(target[key]) + (value as { increment: number }).increment;
    } else if (value === Prisma.DbNull || value === Prisma.JsonNull) {
      target[key] = null;
    } else {
      target[key] = deepClone(value);
    }
  }
}

function makeHarness(options: {
  intent?: Intent | null;
  facts?: CurrentAuthorizationFactsV1;
  outboxes?: Outbox[];
  lockedOutboxOverride?: Outbox | null;
  paused?: boolean;
  now?: Date;
} = {}) {
  let committed: HarnessState = deepClone({
    intent:
      options.intent === undefined ? frozenIntent() : options.intent,
    facts: options.facts ?? currentFacts(),
    outboxes: options.outboxes ?? [],
    audits: [],
  });
  let failNextAudit = false;
  const events: string[] = [];
  const queries: unknown[] = [];
  const transactionOptions: Array<Record<string, unknown>> = [];
  const now = options.now ?? NOW;

  function transactionFor(state: HarnessState) {
    return {
      $executeRaw: jest.fn(async (query: unknown) => {
        queries.push(query);
        events.push(`sql:${queryText(query)}`);
        return 0;
      }),
      $queryRaw: jest.fn(async (query: unknown) => {
        queries.push(query);
        const sql = queryText(query);
        events.push(`sql:${sql}`);
        if (sql.includes('"assessment_email_delivery_intents"')) {
          const requestedId = queryValues(query)[0];
          return state.intent !== null &&
            state.intent.id === requestedId
            ? [deepClone(state.intent)]
            : [];
        }
        if (sql.includes('"assessment_email_outbox"')) {
          if (options.lockedOutboxOverride !== undefined) {
            return options.lockedOutboxOverride === null
              ? []
              : [deepClone(options.lockedOutboxOverride)];
          }
          const [submissionId, recipientRole] = queryValues(query);
          return state.outboxes
            .filter(
              (row) =>
                row.submissionId === submissionId &&
                row.recipientRole === recipientRole,
            )
            .map((row) => deepClone(row));
        }
        return [];
      }),
      assessmentEmailOutbox: {
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          events.push("outbox.create");
          const row = {
            id: `outbox-created-${state.outboxes.length + 1}`,
            ...deepClone(args.data),
          } as Outbox;
          state.outboxes.push(row);
          return { id: row.id };
        }),
      },
      assessmentEmailDeliveryIntent: {
        update: jest.fn(
          async (args: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            events.push("intent.update");
            if (state.intent === null || state.intent.id !== args.where.id) {
              throw new Error("missing test intent");
            }
            applyData(
              state.intent as unknown as Record<string, unknown>,
              args.data,
            );
            return deepClone(state.intent);
          },
        ),
      },
      auditLog: {
        create: jest.fn(async (args: { data: Audit }) => {
          events.push("audit.create");
          if (failNextAudit) {
            failNextAudit = false;
            throw new Error(
              `raw audit failure ${RECIPIENT} ${SUBJECT} ${HTML}`,
            );
          }
          state.audits.push(deepClone(args.data));
          return {};
        }),
      },
    };
  }

  const deps = {
    now: () => new Date(now),
    isPaused: () => options.paused ?? false,
    runTransaction: async <T>(
      work: (tx: ReturnType<typeof transactionFor>) => Promise<T>,
      txOptions: Record<string, unknown>,
    ) => {
      transactionOptions.push(txOptions);
      const working = deepClone(committed);
      try {
        const result = await work(transactionFor(working));
        committed = working;
        return result;
      } catch (error) {
        throw error;
      }
    },
    loadCurrentAuthorizationFacts: async () => {
      events.push("facts.load");
      return deepClone(committed.facts);
    },
    reviewTokens: {
      issue: (
        claims: Parameters<typeof issueIntentReviewToken>[0],
        issuedAt: Date,
      ) => {
        events.push("token.issue");
        return issueIntentReviewToken(claims, {
          now: issuedAt,
          secret: TOKEN_SECRET,
        });
      },
      verify: (
        token: string,
        expected: Parameters<typeof verifyIntentReviewToken>[1],
        verifiedAt: Date,
      ) => {
        events.push("token.verify");
        return verifyIntentReviewToken(token, expected, {
          now: verifiedAt,
          secret: TOKEN_SECRET,
        });
      },
    },
  } as unknown as OperatorDeps;

  return {
    deps,
    events,
    queries,
    transactionOptions,
    getState: () => deepClone(committed),
    setFacts: (facts: CurrentAuthorizationFactsV1) => {
      committed.facts = deepClone(facts);
    },
    setIntent: (updates: Record<string, unknown>) => {
      if (committed.intent === null) throw new Error("missing test intent");
      applyData(
        committed.intent as unknown as Record<string, unknown>,
        updates,
      );
    },
    failNextAudit: () => {
      failNextAudit = true;
    },
  };
}

async function reviewedRelease(harness: ReturnType<typeof makeHarness>) {
  const detail = await loadHeldIntentDetail(harness.deps, {
    intentId: "intent-1",
    actor: { userId: "operator-1" },
  });
  return releaseHeldIntent(harness.deps, {
    intentId: "intent-1",
    actor: { userId: "operator-1" },
    expectedVersion: 7,
    reasonCode: RELEASE_REASON,
    reviewToken: detail.reviewToken,
  });
}

async function expectOperatorError(
  work: () => Promise<unknown>,
  code: string,
) {
  try {
    await work();
    throw new Error("Expected operator service to reject.");
  } catch (error) {
    expect(error).toBeInstanceOf(OperatorServiceError);
    expect((error as OperatorServiceError).code).toBe(code);
    expect((error as Error).message).not.toContain(RECIPIENT);
    expect((error as Error).message).not.toContain(SUBJECT);
    expect((error as Error).message).not.toContain(HTML);
  }
}

describe("held assessment email intent operator services", () => {
  it("loads one consistent HELD detail in RepeatableRead, audits before issuing its actor-bound token, and returns all reviewed current facts", async () => {
    const harness = makeHarness();

    const detail = await loadHeldIntentDetail(harness.deps, {
      intentId: "intent-1",
      actor: { userId: "operator-1" },
    });

    expect(harness.transactionOptions).toEqual([
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      }),
    ]);
    expect(detail).toEqual(
      expect.objectContaining({
        id: "intent-1",
        version: 7,
        status: "HELD",
        recipientEmail: RECIPIENT,
        subject: SUBJECT,
        bodyHtml: HTML,
        current: currentFacts(),
        reviewContextHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        reviewToken: expect.stringMatching(/^v1\./),
      }),
    );
    expect(harness.events.indexOf("facts.load")).toBeGreaterThanOrEqual(0);
    expect(harness.events.indexOf("audit.create")).toBeGreaterThan(
      harness.events.indexOf("facts.load"),
    );
    expect(harness.events.indexOf("token.issue")).toBeGreaterThan(
      harness.events.indexOf("audit.create"),
    );
    expect(harness.getState().audits).toEqual([
      expect.objectContaining({
        action: "ASSESSMENT_EMAIL_INTENT_DETAIL_VIEWED",
        performedBy: "operator-1",
      }),
    ]);
  });

  it("returns no detail payload or token and rolls the audit back when detail audit persistence fails", async () => {
    const harness = makeHarness();
    harness.failNextAudit();

    await expectOperatorError(
      () =>
        loadHeldIntentDetail(harness.deps, {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
        }),
      "AUDIT_FAILED",
    );

    expect(harness.events).not.toContain("token.issue");
    expect(harness.getState().audits).toEqual([]);
  });

  it("fails detail with stable not-found and not-held errors", async () => {
    const missing = makeHarness({ intent: null });
    await expectOperatorError(
      () =>
        loadHeldIntentDetail(missing.deps, {
          intentId: "missing",
          actor: { userId: "operator-1" },
        }),
      "INTENT_NOT_FOUND",
    );

    const resolved = makeHarness({
      intent: frozenIntent({ status: "HANDED_OFF" }),
    });
    await expectOperatorError(
      () =>
        loadHeldIntentDetail(resolved.deps, {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
        }),
      "INTENT_NOT_HELD",
    );
  });

  it("releases exact frozen bytes/provenance into one new PENDING outbox, audits, hands off, purges, and increments the version once", async () => {
    const harness = makeHarness();

    const result = await reviewedRelease(harness);
    const state = harness.getState();

    expect(result).toEqual({
      intentId: "intent-1",
      status: "HANDED_OFF",
      version: 8,
      outboxId: "outbox-created-1",
      existingOutboxWon: false,
    });
    expect(state.outboxes).toEqual([
      expect.objectContaining({
        submissionId: "submission-1",
        recipientEmail: RECIPIENT,
        recipientRole: "RESPONDENT",
        emailType: "ASSESSMENT_RESULTS",
        subject: SUBJECT,
        bodyHtml: HTML,
        status: "PENDING",
        authorizationProvenance: authorizationSnapshot(),
        contentProvenance: contentProvenance(),
      }),
    ]);
    expect(state.intent).toEqual(
      expect.objectContaining({
        status: "HANDED_OFF",
        version: 8,
        handedOffOutboxId: "outbox-created-1",
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
        resolvedBy: "operator-1",
        resolutionReasonCode: RELEASE_REASON,
      }),
    );
    expect(state.audits.at(-1)).toEqual(
      expect.objectContaining({
        action: "ASSESSMENT_EMAIL_INTENT_RELEASED",
        performedBy: "operator-1",
      }),
    );
  });

  it.each(["PENDING", "SENDING", "SENT", "FAILED", "CANCELLED"])(
    "adopts an existing %s outbox unchanged after every release precondition",
    async (status) => {
      const existing = {
        id: `outbox-${status}`,
        submissionId: "submission-1",
        recipientRole: "RESPONDENT",
        status,
        subject: "existing bytes remain unchanged",
      };
      const harness = makeHarness({ outboxes: [existing] });

      const result = await reviewedRelease(harness);
      const state = harness.getState();

      expect(result).toEqual(
        expect.objectContaining({
          outboxId: `outbox-${status}`,
          existingOutboxWon: true,
        }),
      );
      expect(state.outboxes).toEqual([existing]);
      expect(state.intent).toEqual(
        expect.objectContaining({
          status: "HANDED_OFF",
          version: 8,
          handedOffOutboxId: `outbox-${status}`,
          recipientEmail: null,
          subject: null,
          bodyHtml: null,
        }),
      );
    },
  );

  it("uses the operator fixed physical-table lock order, parameterized IDs, and local timeouts", async () => {
    const harness = makeHarness();

    await reviewedRelease(harness);

    const sql = harness.queries.map(queryText);
    expect(sql.some((text) => text.includes("lock_timeout = '2s'"))).toBe(true);
    expect(sql.some((text) => text.includes("statement_timeout = '10s'"))).toBe(
      true,
    );
    const lockOrder = [
      '"assessment_email_delivery_intents"',
      '"assessment_submissions"',
      '"assessment_campaigns"',
      '"assessment_invitations"',
      '"org_respondents"',
      '"assessment_templates"',
      '"assessment_template_versions"',
      '"assessment_email_outbox"',
    ].map((table) =>
      sql.findIndex(
        (text) =>
          text.includes(table) &&
          (text.includes("FOR UPDATE") || text.includes("FOR SHARE")),
      ),
    );
    expect(lockOrder.every((index) => index >= 0)).toBe(true);
    expect(lockOrder).toEqual([...lockOrder].sort((a, b) => a - b));
    for (const query of harness.queries) {
      expect(queryText(query)).not.toContain("intent-1");
      expect(queryText(query)).not.toContain("submission-1");
    }
    expect(harness.queries.flatMap(queryValues)).toEqual(
      expect.arrayContaining([
        "intent-1",
        "submission-1",
        "campaign-1",
        "invitation-1",
        "respondent-1",
        "template-1",
        "version-1",
        "RESPONDENT",
      ]),
    );
  });

  it("locks the physical coaches table after version and before outbox for an owning-Coach release", async () => {
    const snapshot = {
      ...authorizationSnapshot(),
      common: {
        ...authorizationSnapshot().common,
        recipientRole: "OWNING_COACH" as const,
        emailType: "COACH_COMPLETION" as const,
      },
      respondentResults: undefined,
      coachCompletion: {
        canonicalRecipientMailbox: "coach@example.com",
        notifyCoachOnCompletion: true as const,
        featureKey: "WAVE_D_COACH_NOTIFY_ENABLED" as const,
        featureEnabled: true as const,
        coachId: "coach-1",
      },
    };
    const coachHtml = "<p>Exact private coach bytes</p>";
    const coachIntent = frozenIntent({
      recipientRole: "OWNING_COACH",
      emailType: "COACH_COMPLETION",
      recipientEmail: "coach@example.com",
      bodyHtml: coachHtml,
      authorizationSnapshot: snapshot,
      contentProvenance: {
        ...contentProvenance(),
        reportType: "COACH_COMPLETION",
        approvalHash: null,
      },
      payloadHash: assessmentEmailIntentPayloadHash({
        snapshotSchemaVersion: 1,
        recipientRole: "OWNING_COACH",
        emailType: "COACH_COMPLETION",
        recipientEmail: "coach@example.com",
        subject: SUBJECT,
        bodyHtml: coachHtml,
      }),
    });
    const facts = currentFacts();
    facts.coach = {
      exists: true,
      id: "coach-1",
      canonicalMailbox: "coach@example.com",
    };
    const harness = makeHarness({ intent: coachIntent, facts });
    const detail = await loadHeldIntentDetail(harness.deps, {
      intentId: "intent-1",
      actor: { userId: "operator-1" },
    });
    harness.queries.length = 0;

    await releaseHeldIntent(harness.deps, {
      intentId: "intent-1",
      actor: { userId: "operator-1" },
      expectedVersion: 7,
      reasonCode: RELEASE_REASON,
      reviewToken: detail.reviewToken,
    });

    const sql = harness.queries.map(queryText);
    const versionIndex = sql.findIndex((text) =>
      text.includes('"assessment_template_versions"'),
    );
    const coachIndex = sql.findIndex((text) =>
      text.includes('FROM "coaches"'),
    );
    const outboxIndex = sql.findIndex((text) =>
      text.includes('"assessment_email_outbox"'),
    );
    expect(versionIndex).toBeGreaterThanOrEqual(0);
    expect(coachIndex).toBeGreaterThan(versionIndex);
    expect(outboxIndex).toBeGreaterThan(coachIndex);
    expect(sql[coachIndex]).toContain("FOR SHARE");
    expect(queryValues(harness.queries[coachIndex])).toContain("coach-1");
  });

  it.each([
    {
      label: "global pause",
      options: { paused: true },
      mutate: undefined,
      code: "SENDS_PAUSED",
    },
    {
      label: "absolute intent expiry",
      options: {
        intent: frozenIntent({
          expiresAt: new Date("2026-08-03T05:00:00.000Z"),
        }),
      },
      mutate: undefined,
      code: "INTENT_EXPIRED",
    },
    {
      label: "changed status",
      options: {},
      mutate: (harness: ReturnType<typeof makeHarness>) =>
        harness.setIntent({ status: "CANCELLED" }),
      code: "INTENT_NOT_HELD",
    },
    {
      label: "changed version",
      options: {},
      mutate: (harness: ReturnType<typeof makeHarness>) =>
        harness.setIntent({ version: 8 }),
      code: "VERSION_CONFLICT",
    },
    {
      label: "unsupported snapshot",
      options: {},
      mutate: (harness: ReturnType<typeof makeHarness>) =>
        harness.setIntent({
          snapshotSchemaVersion: 2,
          authorizationSnapshot: {
            ...authorizationSnapshot(),
            schemaVersion: 2,
          },
        }),
      code: "SNAPSHOT_UNSUPPORTED",
    },
    {
      label: "unsupported renderer",
      options: {},
      mutate: (harness: ReturnType<typeof makeHarness>) =>
        harness.setIntent({ rendererContractVersion: 2 }),
      code: "RENDERER_UNSUPPORTED",
    },
    {
      label: "invalid provenance",
      options: {},
      mutate: (harness: ReturnType<typeof makeHarness>) =>
        harness.setIntent({
          contentProvenance: {
            ...contentProvenance(),
            versionId: "version-other",
          },
        }),
      code: "PROVENANCE_INVALID",
    },
    {
      label: "payload hash mismatch",
      options: {},
      mutate: (harness: ReturnType<typeof makeHarness>) =>
        harness.setIntent({ bodyHtml: `${HTML}<p>tampered</p>` }),
      code: "PAYLOAD_INTEGRITY_FAILED",
    },
  ])("rejects release for $label without outbox or terminal mutation", async ({
    options,
    mutate,
    code,
  }) => {
    const harness = makeHarness(options);
    const detail = await loadHeldIntentDetail(harness.deps, {
      intentId: "intent-1",
      actor: { userId: "operator-1" },
    });
    mutate?.(harness);

    await expectOperatorError(
      () =>
        releaseHeldIntent(harness.deps, {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
          expectedVersion: 7,
          reasonCode: RELEASE_REASON,
          reviewToken: detail.reviewToken,
        }),
      code,
    );

    const state = harness.getState();
    expect(state.outboxes).toEqual([]);
    expect(state.intent?.status).not.toBe("HANDED_OFF");
  });

  it("rejects release when reviewed current facts change and requires a new detail review", async () => {
    const harness = makeHarness();
    const detail = await loadHeldIntentDetail(harness.deps, {
      intentId: "intent-1",
      actor: { userId: "operator-1" },
    });
    const changed = currentFacts();
    changed.campaign.closeAt = "2026-08-31T00:00:00.000Z";
    harness.setFacts(changed);

    await expectOperatorError(
      () =>
        releaseHeldIntent(harness.deps, {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
          expectedVersion: 7,
          reasonCode: RELEASE_REASON,
          reviewToken: detail.reviewToken,
        }),
      "REVIEW_CONTEXT_CHANGED",
    );
    expect(harness.getState().outboxes).toEqual([]);
  });

  it("maps expired, cross-actor, wrong-intent, and malformed review tokens to stable service codes", async () => {
    const harness = makeHarness();
    const detail = await loadHeldIntentDetail(harness.deps, {
      intentId: "intent-1",
      actor: { userId: "operator-1" },
    });
    const cases = [
      {
        code: "REVIEW_TOKEN_ACTOR_MISMATCH",
        actor: { userId: "operator-2" },
        token: detail.reviewToken,
      },
      {
        code: "REVIEW_TOKEN_INTENT_MISMATCH",
        actor: { userId: "operator-1" },
        token: issueIntentReviewToken(
          {
            actorUserId: "operator-1",
            intentId: "intent-other",
            intentVersion: 7,
            reviewContextHash: detail.reviewContextHash,
          },
          { now: NOW, secret: TOKEN_SECRET },
        ),
      },
      {
        code: "REVIEW_TOKEN_VERSION_MISMATCH",
        actor: { userId: "operator-1" },
        token: issueIntentReviewToken(
          {
            actorUserId: "operator-1",
            intentId: "intent-1",
            intentVersion: 6,
            reviewContextHash: detail.reviewContextHash,
          },
          { now: NOW, secret: TOKEN_SECRET },
        ),
      },
      {
        code: "REVIEW_TOKEN_INVALID",
        actor: { userId: "operator-1" },
        token: "malformed",
      },
    ];
    for (const testCase of cases) {
      await expectOperatorError(
        () =>
          releaseHeldIntent(harness.deps, {
            intentId: "intent-1",
            actor: testCase.actor,
            expectedVersion: 7,
            reasonCode: RELEASE_REASON,
            reviewToken: testCase.token,
          }),
        testCase.code,
      );
    }

    const expiredHarness = makeHarness({
      now: new Date("2026-08-03T05:15:00.000Z"),
    });
    const contextHash = detail.reviewContextHash;
    const expiredToken = issueIntentReviewToken(
      {
        actorUserId: "operator-1",
        intentId: "intent-1",
        intentVersion: 7,
        reviewContextHash: contextHash,
      },
      { now: NOW, secret: TOKEN_SECRET },
    );
    await expectOperatorError(
      () =>
        releaseHeldIntent(expiredHarness.deps, {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
          expectedVersion: 7,
          reasonCode: RELEASE_REASON,
          reviewToken: expiredToken,
        }),
      "REVIEW_TOKEN_EXPIRED",
    );
  });

  it("rejects a non-allowlisted release reason before opening a transaction", async () => {
    const harness = makeHarness();

    await expectOperatorError(
      () =>
        releaseHeldIntent(harness.deps, {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
          expectedVersion: 7,
          reasonCode: "free text with private content",
          reviewToken: "token",
        } as never),
      "RELEASE_REASON_NOT_ALLOWED",
    );

    expect(harness.transactionOptions).toEqual([]);
  });

  it("rejects a mismatched row returned for the matching outbox ownership lock", async () => {
    const harness = makeHarness({
      lockedOutboxOverride: {
        id: "outbox-bad-owner",
        submissionId: "submission-other",
        recipientRole: "RESPONDENT",
        status: "PENDING",
      },
    });
    const detail = await loadHeldIntentDetail(harness.deps, {
      intentId: "intent-1",
      actor: { userId: "operator-1" },
    });

    await expectOperatorError(
      () =>
        releaseHeldIntent(harness.deps, {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
          expectedVersion: 7,
          reasonCode: RELEASE_REASON,
          reviewToken: detail.reviewToken,
        }),
      "OUTBOX_OWNERSHIP_CONFLICT",
    );
  });

  it("rolls back new outbox creation, release audit, handoff, version increment, and purge when release audit fails", async () => {
    const harness = makeHarness();
    const detail = await loadHeldIntentDetail(harness.deps, {
      intentId: "intent-1",
      actor: { userId: "operator-1" },
    });
    harness.failNextAudit();

    await expectOperatorError(
      () =>
        releaseHeldIntent(harness.deps, {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
          expectedVersion: 7,
          reasonCode: RELEASE_REASON,
          reviewToken: detail.reviewToken,
        }),
      "AUDIT_FAILED",
    );

    const state = harness.getState();
    expect(state.outboxes).toEqual([]);
    expect(state.intent).toEqual(
      expect.objectContaining({
        status: "HELD",
        version: 7,
        recipientEmail: RECIPIENT,
        subject: SUBJECT,
        bodyHtml: HTML,
      }),
    );
    expect(state.audits).toHaveLength(1);
  });

  it.each(CANCEL_REASONS)(
    "cancels atomically without a review token or any outbox mutation for reason %s",
    async (reasonCode) => {
      const harness = makeHarness();

      const result = await cancelHeldIntent(harness.deps, {
        intentId: "intent-1",
        actor: { userId: "operator-1" },
        expectedVersion: 7,
        reasonCode,
      });
      const state = harness.getState();

      expect(result).toEqual({
        intentId: "intent-1",
        status: "CANCELLED",
        version: 8,
        outboxId: null,
        existingOutboxWon: false,
      });
      expect(state.outboxes).toEqual([]);
      expect(harness.events).not.toContain("token.verify");
      expect(state.intent).toEqual(
        expect.objectContaining({
          status: "CANCELLED",
          version: 8,
          handedOffOutboxId: null,
          recipientEmail: null,
          subject: null,
          bodyHtml: null,
          resolvedBy: "operator-1",
          resolutionReasonCode: reasonCode,
        }),
      );
      expect(state.audits).toEqual([
        expect.objectContaining({
          action: "ASSESSMENT_EMAIL_INTENT_CANCELLED",
          performedBy: "operator-1",
        }),
      ]);
    },
  );

  it("cancellation checks only HELD, exact version, absolute expiry, and allowlisted reason", async () => {
    const invalidSnapshot = {
      ...frozenIntent(),
      snapshotSchemaVersion: 99,
      rendererContractVersion: 99,
      authorizationSnapshot: { schemaVersion: 99 },
      contentProvenance: null,
      bodyHtml: `${HTML}<p>hash mismatch</p>`,
    } as unknown as Intent;
    const harness = makeHarness({ intent: invalidSnapshot });

    await cancelHeldIntent(harness.deps, {
      intentId: "intent-1",
      actor: { userId: "operator-1" },
      expectedVersion: 7,
      reasonCode: "POLICY_DECISION",
    });

    expect(harness.getState().intent).toEqual(
      expect.objectContaining({
        status: "CANCELLED",
        version: 8,
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
      }),
    );
  });

  it.each([
    {
      label: "not held",
      intent: frozenIntent({ status: "HANDED_OFF" }),
      expectedVersion: 7,
      reason: "POLICY_DECISION",
      code: "INTENT_NOT_HELD",
    },
    {
      label: "stale version",
      intent: frozenIntent(),
      expectedVersion: 6,
      reason: "POLICY_DECISION",
      code: "VERSION_CONFLICT",
    },
    {
      label: "expired",
      intent: frozenIntent({ expiresAt: NOW }),
      expectedVersion: 7,
      reason: "POLICY_DECISION",
      code: "INTENT_EXPIRED",
    },
    {
      label: "arbitrary reason",
      intent: frozenIntent(),
      expectedVersion: 7,
      reason: "private free text",
      code: "CANCELLATION_REASON_NOT_ALLOWED",
    },
  ])("rejects cancellation when $label", async ({
    intent,
    expectedVersion,
    reason,
    code,
  }) => {
    const harness = makeHarness({ intent });

    await expectOperatorError(
      () =>
        cancelHeldIntent(harness.deps, {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
          expectedVersion,
          reasonCode: reason,
        } as never),
      code,
    );

    expect(harness.getState().outboxes).toEqual([]);
  });

  it("rolls back cancellation and exposes only a stable audit failure when cancellation audit persistence fails", async () => {
    const harness = makeHarness();
    harness.failNextAudit();

    await expectOperatorError(
      () =>
        cancelHeldIntent(harness.deps, {
          intentId: "intent-1",
          actor: { userId: "operator-1" },
          expectedVersion: 7,
          reasonCode: "POLICY_DECISION",
        }),
      "AUDIT_FAILED",
    );

    expect(harness.getState()).toEqual(
      expect.objectContaining({
        outboxes: [],
        audits: [],
        intent: expect.objectContaining({
          status: "HELD",
          version: 7,
          recipientEmail: RECIPIENT,
          subject: SUBJECT,
          bodyHtml: HTML,
        }),
      }),
    );
  });

  it("keeps audit metadata free of addresses, subjects, HTML, current facts, and raw errors", async () => {
    const releaseHarness = makeHarness();
    await reviewedRelease(releaseHarness);
    const serialized = JSON.stringify(releaseHarness.getState().audits);

    expect(serialized).not.toContain(RECIPIENT);
    expect(serialized).not.toContain(SUBJECT);
    expect(serialized).not.toContain(HTML);
    expect(serialized).not.toContain("canonicalMailbox");
    expect(serialized).not.toContain("CLOSED");
  });
});
