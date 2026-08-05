import { Prisma } from "@prisma/client";
import { assessmentEmailIntentPayloadHash } from "@/lib/assessments/assessment-email-delivery-intents";
import type { CurrentAuthorizationFactsV1 } from "@/lib/assessments/assessment-email-intent-reauthorization";
import {
  reconcileAssessmentEmailIntents,
  type ReconcilerDeps,
  type ReconcileScope,
} from "@/lib/assessments/assessment-email-intent-reconciler";

const NOW = new Date("2026-08-03T00:00:00.000Z");
const RECIPIENT = "private-recipient@example.com";
const SUBJECT = "Private frozen subject";
const HTML = "<p>Private frozen body</p>";
const RAW_ERROR = `database rejected ${RECIPIENT} ${SUBJECT} ${HTML}`;

function authorizationSnapshot() {
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
  } as const;
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
  } as const;
}

function frozenIntent(
  overrides: Record<string, unknown> = {},
) {
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
    status: "PENDING",
    version: 7,
    holdReason: null,
    holdReasons: null,
    attempts: 0,
    lastErrorClass: null,
    nextAttemptAt: new Date("2026-08-02T00:00:00.000Z"),
    heldAt: null,
    expiresAt: new Date("2026-09-02T00:00:00.000Z"),
    handedOffOutboxId: null,
    resolvedAt: null,
    resolvedBy: null,
    resolutionReasonCode: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
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

function currentFacts(
  overrides: Partial<CurrentAuthorizationFactsV1> = {},
): CurrentAuthorizationFactsV1 {
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
      status: "ACTIVE",
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
    ...overrides,
  };
}

type HarnessOptions = {
  candidates?: Array<ReturnType<typeof frozenIntent>>;
  existingOutbox?: { id: string; status: string } | null;
  paused?: boolean;
  deferredCount?: number;
  databaseNow?: Date | (() => Date);
  facts?: CurrentAuthorizationFactsV1;
  now?: () => Date;
};

function queryText(query: unknown): string {
  if (typeof query === "string") return query;
  if (query && typeof query === "object") {
    const sql = query as {
      sql?: string;
      strings?: string[];
    };
    return [sql.sql, ...(sql.strings ?? [])].filter(Boolean).join(" ");
  }
  return "";
}

function queryValues(query: unknown): unknown[] {
  if (query && typeof query === "object") {
    return ((query as { values?: unknown[] }).values ?? []);
  }
  return [];
}

function makeHarness(options: HarnessOptions = {}) {
  const candidates = [...(options.candidates ?? [frozenIntent()])];
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(async (query: unknown) => {
      const sql = queryText(query);
      if (sql.includes("FOR UPDATE SKIP LOCKED")) {
        const next = candidates.shift();
        return next ? [next] : [];
      }
      if (sql.includes("deferredByPause")) {
        return [{ deferredByPause: options.deferredCount ?? 0 }];
      }
      if (sql.includes('"databaseNow"')) {
        return [{
          databaseNow:
            typeof options.databaseNow === "function"
              ? options.databaseNow()
              : (options.databaseNow ?? NOW),
        }];
      }
      if (sql.includes('"assessment_email_outbox"')) {
        return options.existingOutbox ? [options.existingOutbox] : [];
      }
      return [];
    }),
    assessmentEmailOutbox: {
      create: jest.fn().mockResolvedValue({ id: "outbox-created" }),
    },
    assessmentEmailDeliveryIntent: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    assessmentEmailDeliveryIntent: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const loadCurrentAuthorizationFacts = jest
    .fn()
    .mockResolvedValue(options.facts ?? currentFacts());
  const runOneTransaction = jest.fn(
    async <T>(work: (transaction: typeof tx) => Promise<T>) => work(tx),
  );
  const deps = {
    now: options.now ?? (() => NOW),
    isPaused: () => options.paused ?? false,
    logger,
    prisma,
    loadCurrentAuthorizationFacts,
    runOneTransaction,
  } as unknown as ReconcilerDeps;

  return {
    candidates,
    deps,
    loadCurrentAuthorizationFacts,
    logger,
    prisma,
    runOneTransaction,
    tx,
  };
}

const SUBMISSION_SCOPE: ReconcileScope = {
  kind: "submission",
  submissionId: "submission-1",
  maxRows: 10,
};

describe("reconcileAssessmentEmailIntents", () => {
  it("uses parameterized oldest-due selection, fixed timeouts, and the global lock order", async () => {
    const harness = makeHarness();

    await reconcileAssessmentEmailIntents(harness.deps, SUBMISSION_SCOPE);

    expect(harness.tx.$executeRaw).toHaveBeenCalledTimes(4);
    expect(queryText(harness.tx.$executeRaw.mock.calls[0][0])).toContain(
      "SET LOCAL lock_timeout = '2s'",
    );
    expect(queryText(harness.tx.$executeRaw.mock.calls[1][0])).toContain(
      "SET LOCAL statement_timeout = '10s'",
    );

    const candidateQuery = harness.tx.$queryRaw.mock.calls
      .map(([query]) => query)
      .find((query) => queryText(query).includes("FOR UPDATE SKIP LOCKED"));
    expect(candidateQuery).toBeDefined();
    expect(queryText(candidateQuery)).toMatch(
      /ORDER BY\s+CASE\s+WHEN "expiresAt" <= \(statement_timestamp\(\) AT TIME ZONE/,
    );
    expect(queryText(candidateQuery)).toContain(
      '"nextAttemptAt", "createdAt", "id"',
    );
    expect(queryText(candidateQuery)).not.toContain("submission-1");
    expect(queryValues(candidateQuery)).toEqual(
      expect.arrayContaining([true, "submission-1"]),
    );

    const sqlCalls = harness.tx.$queryRaw.mock.calls.map(([query]) =>
      queryText(query),
    );
    const lockOrder = [
      '"assessment_submissions"',
      '"assessment_campaigns"',
      '"assessment_invitations"',
      '"org_respondents"',
      '"assessment_templates"',
      '"assessment_template_versions"',
      '"assessment_email_outbox"',
    ].map((table) => sqlCalls.findIndex((sql) => sql.includes(table)));
    expect(lockOrder.every((index) => index >= 0)).toBe(true);
    expect(lockOrder).toEqual([...lockOrder].sort((a, b) => a - b));
    expect(
      sqlCalls.find((sql) => sql.includes('"assessment_email_outbox"')),
    ).toContain("FOR UPDATE");
  });

  it("locks the mapped coaches table after version and before the matching outbox", async () => {
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
    const intent = frozenIntent({
      recipientRole: "OWNING_COACH",
      emailType: "COACH_COMPLETION",
      recipientEmail: "coach@example.com",
      authorizationSnapshot: snapshot,
      payloadHash: assessmentEmailIntentPayloadHash({
        snapshotSchemaVersion: 1,
        recipientRole: "OWNING_COACH",
        emailType: "COACH_COMPLETION",
        recipientEmail: "coach@example.com",
        subject: SUBJECT,
        bodyHtml: HTML,
      }),
    });
    const harness = makeHarness({
      candidates: [intent],
      facts: currentFacts({
        coach: {
          exists: true,
          id: "coach-1",
          canonicalMailbox: "coach@example.com",
        },
      }),
    });

    await reconcileAssessmentEmailIntents(harness.deps, SUBMISSION_SCOPE);

    const sqlCalls = harness.tx.$queryRaw.mock.calls.map(([query]) =>
      queryText(query),
    );
    const versionIndex = sqlCalls.findIndex((sql) =>
      sql.includes('"assessment_template_versions"'),
    );
    const coachIndex = sqlCalls.findIndex((sql) =>
      /FROM "(?:coaches|Coach)"/.test(sql),
    );
    const outboxIndex = sqlCalls.findIndex((sql) =>
      sql.includes('"assessment_email_outbox"'),
    );
    expect(versionIndex).toBeGreaterThanOrEqual(0);
    expect(coachIndex).toBeGreaterThan(versionIndex);
    expect(outboxIndex).toBeGreaterThan(coachIndex);
    const coachQuery = harness.tx.$queryRaw.mock.calls[coachIndex][0];
    expect(queryText(coachQuery)).toContain('FROM "coaches"');
    expect(queryText(coachQuery)).not.toContain('FROM "Coach"');
    expect(queryText(coachQuery)).toContain("FOR SHARE");
    expect(queryValues(coachQuery)).toContain("coach-1");
  });

  it.each([
    {
      scope: SUBMISSION_SCOPE,
      count: 12,
      expected: 10,
    },
    {
      scope: { kind: "scheduled", maxRows: 50 } as const,
      count: 52,
      expected: 50,
    },
  ])("enforces the exact $scope.kind row budget", async ({ scope, count, expected }) => {
    const harness = makeHarness({
      candidates: Array.from({ length: count }, (_, index) =>
        frozenIntent({
          id: `intent-${index}`,
          submissionId: `submission-${index}`,
        }),
      ),
    });

    const result = await reconcileAssessmentEmailIntents(harness.deps, scope);

    expect(result.handedOff).toBe(expected);
    expect(harness.tx.assessmentEmailOutbox.create).toHaveBeenCalledTimes(
      expected,
    );
  });

  it("rejects caller-supplied limits that are not the fixed scope maximum", async () => {
    const harness = makeHarness();

    await expect(
      reconcileAssessmentEmailIntents(harness.deps, {
        kind: "submission",
        submissionId: "submission-1",
        maxRows: 9,
      } as unknown as ReconcileScope),
    ).rejects.toThrow("maxRows");
    await expect(
      reconcileAssessmentEmailIntents(harness.deps, {
        kind: "scheduled",
        maxRows: 49,
      } as unknown as ReconcileScope),
    ).rejects.toThrow("maxRows");
    expect(harness.runOneTransaction).not.toHaveBeenCalled();
  });

  it("stops before starting new work at the 45-second boundary", async () => {
    const times = [new Date(0), new Date(44_999), new Date(45_000)];
    const harness = makeHarness({
      candidates: [frozenIntent(), frozenIntent({ id: "intent-2" })],
      now: () => times.shift() ?? new Date(45_000),
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.handedOff).toBe(1);
    expect(harness.runOneTransaction).toHaveBeenCalledTimes(1);
  });

  it("keeps pending handoff work unmodified while paused but still expires unresolved work", async () => {
    const expired = frozenIntent({
      expiresAt: new Date("2026-08-02T00:00:00.000Z"),
    });
    const harness = makeHarness({
      candidates: [expired],
      deferredCount: 3,
      paused: true,
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result).toEqual(
      expect.objectContaining({
        deferredByPause: 3,
        expired: 1,
        handedOff: 0,
        retried: 0,
      }),
    );
    expect(harness.prisma.assessmentEmailDeliveryIntent.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    const candidateQueries = harness.tx.$queryRaw.mock.calls
      .map(([query]) => query)
      .filter((query) => queryText(query).includes("FOR UPDATE SKIP LOCKED"));
    expect(candidateQueries.length).toBeGreaterThan(0);
    for (const query of candidateQueries) {
      expect(queryValues(query)).toContain(false);
    }
    const deferredQuery = harness.tx.$queryRaw.mock.calls
      .map(([query]) => query)
      .find((query) => queryText(query).includes("deferredByPause"));
    expect(deferredQuery).toBeDefined();
    expect(queryText(deferredQuery)).not.toContain("submission-1");
    expect(queryText(deferredQuery)).not.toContain("FOR UPDATE");
    expect(queryValues(deferredQuery)).toEqual(
      expect.arrayContaining(["submission-1", 10]),
    );
    expect(harness.tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
      where: { id: expired.id },
      data: expect.objectContaining({
        status: "EXPIRED",
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
        version: { increment: 1 },
      }),
    });
    expect(harness.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ASSESSMENT_EMAIL_INTENT_EXPIRED",
      }),
    });
  });

  it("uses locked database time to expire a paused candidate selected after the application clock", async () => {
    const expiresAt = new Date("2026-08-03T00:00:01.000Z");
    const intent = frozenIntent({ expiresAt });
    const harness = makeHarness({
      candidates: [intent],
      paused: true,
      // The injected application clock trails both candidate selection and the
      // locked database decision. A paused expiry-only candidate must never
      // reach automatic handoff under this split.
      now: () => new Date("2026-08-03T00:00:00.000Z"),
      databaseNow: new Date("2026-08-03T00:00:02.000Z"),
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result).toEqual(
      expect.objectContaining({
        expired: 1,
        handedOff: 0,
        existingOutboxWon: 0,
      }),
    );
    expect(harness.tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
      where: { id: intent.id },
      data: expect.objectContaining({
        status: "EXPIRED",
        resolvedAt: new Date("2026-08-03T00:00:02.000Z"),
      }),
    });

    const sqlCalls = harness.tx.$queryRaw.mock.calls.map(([query]) =>
      queryText(query),
    );
    const outboxLockIndex = sqlCalls.findIndex((sql) =>
      sql.includes('"assessment_email_outbox"'),
    );
    const databaseTimeIndex = sqlCalls.findIndex((sql) =>
      sql.includes('"databaseNow"'),
    );
    expect(databaseTimeIndex).toBeGreaterThan(outboxLockIndex);
    expect(sqlCalls[databaseTimeIndex]).toContain("statement_timestamp()");
  });

  it("rechecks database time after reauthorization when the expiry boundary crosses", async () => {
    const intent = frozenIntent({
      expiresAt: new Date("2026-08-03T00:00:01.000Z"),
    });
    const databaseTimes = [
      new Date("2026-08-03T00:00:00.500Z"),
      new Date("2026-08-03T00:00:02.000Z"),
    ];
    const harness = makeHarness({
      candidates: [intent],
      databaseNow: () =>
        databaseTimes.shift() ?? new Date("2026-08-03T00:00:02.000Z"),
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result).toEqual(
      expect.objectContaining({
        expired: 1,
        handedOff: 0,
      }),
    );
    expect(harness.loadCurrentAuthorizationFacts).toHaveBeenCalledTimes(1);
    expect(harness.tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    const databaseTimeQueries = harness.tx.$queryRaw.mock.calls
      .map(([query]) => queryText(query))
      .filter((sql) => sql.includes('"databaseNow"'));
    expect(databaseTimeQueries).toHaveLength(2);
  });

  it("purges corrupt expired JSON fields with Prisma database-null sentinels", async () => {
    const intent = frozenIntent({
      authorizationSnapshot: { schemaVersion: 999 },
      contentProvenance: { schemaVersion: 999 },
      expiresAt: new Date("2026-08-02T00:00:00.000Z"),
    });
    const harness = makeHarness({
      candidates: [intent],
      paused: true,
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.expired).toBe(1);
    const updateData =
      harness.tx.assessmentEmailDeliveryIntent.update.mock.calls[0][0].data;
    expect(updateData.authorizationSnapshot).toBe(Prisma.DbNull);
    expect(updateData.contentProvenance).toBe(Prisma.DbNull);
    expect(updateData).toEqual(
      expect.objectContaining({
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
      }),
    );
  });

  it("counts paused due work even when expired rows consume the full scope", async () => {
    const harness = makeHarness({
      candidates: Array.from({ length: 10 }, (_, index) =>
        frozenIntent({
          id: `expired-intent-${index}`,
          expiresAt: new Date("2026-08-02T00:00:00.000Z"),
        }),
      ),
      deferredCount: 4,
      paused: true,
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result).toEqual(
      expect.objectContaining({
        deferredByPause: 4,
        expired: 10,
        handedOff: 0,
        retried: 0,
      }),
    );
    const deferredQueries = harness.tx.$queryRaw.mock.calls
      .map(([query]) => query)
      .filter((query) => queryText(query).includes("deferredByPause"));
    expect(deferredQueries).toHaveLength(1);
    expect(queryText(deferredQueries[0])).not.toContain("FOR UPDATE");
    expect(queryValues(deferredQueries[0])).toEqual(
      expect.arrayContaining(["submission-1", 10]),
    );
  });

  it("counts paused due work before expiry processing reaches the 45-second budget", async () => {
    const times = [new Date(0), new Date(44_999), new Date(45_000)];
    const harness = makeHarness({
      candidates: [
        frozenIntent({
          expiresAt: new Date("1969-12-31T00:00:00.000Z"),
        }),
      ],
      deferredCount: 2,
      now: () => times.shift() ?? new Date(45_000),
      paused: true,
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result).toEqual(
      expect.objectContaining({
        deferredByPause: 2,
        expired: 1,
      }),
    );
    const deferredQueries = harness.tx.$queryRaw.mock.calls
      .map(([query]) => query)
      .filter((query) => queryText(query).includes("deferredByPause"));
    expect(deferredQueries).toHaveLength(1);
  });

  it.each(["PENDING", "SENDING", "SENT", "FAILED", "CANCELLED"])(
    "adopts an existing %s outbox unchanged before expiry or reauthorization",
    async (status) => {
      const intent = frozenIntent({
        expiresAt: new Date("2026-08-02T00:00:00.000Z"),
      });
      const harness = makeHarness({
        candidates: [intent],
        existingOutbox: { id: `outbox-${status}`, status },
      });

      const result = await reconcileAssessmentEmailIntents(
        harness.deps,
        SUBMISSION_SCOPE,
      );

      expect(result).toEqual(
        expect.objectContaining({
          existingOutboxWon: 1,
          handedOff: 1,
          expired: 0,
        }),
      );
      expect(harness.loadCurrentAuthorizationFacts).not.toHaveBeenCalled();
      expect(harness.tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
      expect(
        (harness.tx.assessmentEmailOutbox as Record<string, unknown>).update,
      ).toBeUndefined();
      expect(harness.tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
        where: { id: intent.id },
        data: expect.objectContaining({
          status: "HANDED_OFF",
          handedOffOutboxId: `outbox-${status}`,
          recipientEmail: null,
          subject: null,
          bodyHtml: null,
          version: { increment: 1 },
        }),
      });
      expect(harness.tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
        }),
      });
    },
  );

  it("adopts an existing outbox and purges corrupt JSON with Prisma database-null sentinels", async () => {
    const intent = frozenIntent({
      authorizationSnapshot: { schemaVersion: 999 },
      contentProvenance: { schemaVersion: 999 },
    });
    const harness = makeHarness({
      candidates: [intent],
      existingOutbox: { id: "outbox-existing", status: "SENT" },
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result).toEqual(
      expect.objectContaining({
        handedOff: 1,
        existingOutboxWon: 1,
      }),
    );
    const updateData =
      harness.tx.assessmentEmailDeliveryIntent.update.mock.calls[0][0].data;
    expect(updateData.authorizationSnapshot).toBe(Prisma.DbNull);
    expect(updateData.contentProvenance).toBe(Prisma.DbNull);
  });

  it("hands off exact frozen bytes and provenance, audits, purges PII, and increments version once", async () => {
    const intent = frozenIntent();
    const harness = makeHarness({ candidates: [intent] });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.handedOff).toBe(1);
    expect(result.handedOffSubmissionIds).toEqual(["submission-1"]);
    expect(harness.tx.assessmentEmailOutbox.create).toHaveBeenCalledWith({
      data: {
        submissionId: intent.submissionId,
        recipientEmail: RECIPIENT,
        recipientRole: intent.recipientRole,
        emailType: intent.emailType,
        subject: SUBJECT,
        bodyHtml: HTML,
        status: "PENDING",
        authorizationProvenance: intent.authorizationSnapshot,
        contentProvenance: intent.contentProvenance,
      },
      select: { id: true },
    });
    expect(harness.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "AssessmentEmailDeliveryIntent",
        entityId: intent.id,
        action: "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
      }),
    });
    expect(harness.tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
      where: { id: intent.id },
      data: expect.objectContaining({
        status: "HANDED_OFF",
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
        version: { increment: 1 },
      }),
    });

    const terminalData =
      harness.tx.assessmentEmailDeliveryIntent.update.mock.calls[0][0].data;
    expect(JSON.stringify(terminalData.authorizationSnapshot)).not.toContain(
      RECIPIENT,
    );
    expect(JSON.stringify(terminalData.contentProvenance)).not.toContain(
      "qsp-v2",
    );
    const auditData = harness.tx.auditLog.create.mock.calls[0][0].data;
    expect(JSON.stringify(auditData)).not.toMatch(
      /private-recipient|Private frozen|Private frozen body/,
    );
  });

  it("moves deterministic drift to HELD with one version increment and an atomic code-only audit", async () => {
    const intent = frozenIntent();
    const harness = makeHarness({
      candidates: [intent],
      facts: currentFacts({
        campaign: {
          ...currentFacts().campaign,
          status: "CLOSED",
        },
      }),
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.held).toBe(1);
    expect(harness.tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
      where: { id: intent.id },
      data: expect.objectContaining({
        status: "HELD",
        holdReason: "CAMPAIGN_STATUS_CHANGED",
        holdReasons: ["CAMPAIGN_STATUS_CHANGED"],
        heldAt: NOW,
        version: { increment: 1 },
      }),
    });
    expect(harness.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ASSESSMENT_EMAIL_INTENT_HELD",
        changes: expect.stringContaining("CAMPAIGN_STATUS_CHANGED"),
      }),
    });
    expect(JSON.stringify(harness.tx.auditLog.create.mock.calls)).not.toContain(
      "CLOSED",
    );
    expect(harness.runOneTransaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      label: "unsupported snapshot",
      override: {
        snapshotSchemaVersion: 2,
        authorizationSnapshot: {
          ...authorizationSnapshot(),
          schemaVersion: 2,
        },
      },
      reason: "SCHEMA_UNSUPPORTED",
    },
    {
      label: "mutated frozen payload",
      override: { bodyHtml: `${HTML}<p>mutation</p>` },
      reason: "PAYLOAD_INTEGRITY_FAILED",
    },
  ])("holds a $label without creating an outbox", async ({ override, reason }) => {
    const harness = makeHarness({
      candidates: [frozenIntent(override)],
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.held).toBe(1);
    expect(harness.tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
      where: { id: "intent-1" },
      data: expect.objectContaining({
        status: "HELD",
        holdReason: reason,
        version: { increment: 1 },
      }),
    });
  });

  it.each([
    {
      label: "template identity",
      contentOverride: { templateId: "template-other" },
    },
    {
      label: "version identity",
      contentOverride: { versionId: "version-other" },
    },
    {
      label: "template alias",
      contentOverride: { templateAlias: "other-alias" },
    },
    {
      label: "respondent approval hash",
      contentOverride: { approvalHash: "e".repeat(64) },
    },
  ])("holds contradictory $label provenance without rewriting or handing it off", async ({
    contentOverride,
  }) => {
    const provenance = {
      ...contentProvenance(),
      ...contentOverride,
    };
    const harness = makeHarness({
      candidates: [
        frozenIntent({
          contentProvenance: provenance,
        }),
      ],
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.held).toBe(1);
    expect(harness.loadCurrentAuthorizationFacts).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
      where: { id: "intent-1" },
      data: expect.objectContaining({
        status: "HELD",
        holdReason: "PAYLOAD_INTEGRITY_FAILED",
        holdReasons: ["PAYLOAD_INTEGRITY_FAILED"],
      }),
    });
    const updateData =
      harness.tx.assessmentEmailDeliveryIntent.update.mock.calls[0][0].data;
    expect(updateData.contentProvenance).toBeUndefined();
  });

  it.each([
    {
      label: "an extra field",
      provenance: {
        ...contentProvenance(),
        recipientEmail: RECIPIENT,
      },
    },
    {
      label: "a malformed render-input hash",
      provenance: {
        ...contentProvenance(),
        renderInputHash: "D".repeat(64),
      },
    },
  ])("holds provenance with $label instead of handing it off", async ({
    provenance,
  }) => {
    const harness = makeHarness({
      candidates: [frozenIntent({ contentProvenance: provenance })],
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.held).toBe(1);
    expect(harness.loadCurrentAuthorizationFacts).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
      where: { id: "intent-1" },
      data: expect.objectContaining({
        status: "HELD",
        holdReason: "SCHEMA_UNSUPPORTED",
        holdReasons: ["SCHEMA_UNSUPPORTED"],
      }),
    });
  });

  it("requires owning-Coach provenance to retain a null approval hash", async () => {
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
    const harness = makeHarness({
      candidates: [
        frozenIntent({
          recipientRole: "OWNING_COACH",
          emailType: "COACH_COMPLETION",
          recipientEmail: "coach@example.com",
          authorizationSnapshot: snapshot,
          contentProvenance: {
            ...contentProvenance(),
            approvalHash: "e".repeat(64),
          },
          payloadHash: assessmentEmailIntentPayloadHash({
            snapshotSchemaVersion: 1,
            recipientRole: "OWNING_COACH",
            emailType: "COACH_COMPLETION",
            recipientEmail: "coach@example.com",
            subject: SUBJECT,
            bodyHtml: HTML,
          }),
        }),
      ],
      facts: currentFacts({
        coach: {
          exists: true,
          id: "coach-1",
          canonicalMailbox: "coach@example.com",
        },
      }),
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.held).toBe(1);
    expect(harness.loadCurrentAuthorizationFacts).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
      where: { id: "intent-1" },
      data: expect.objectContaining({
        holdReason: "PAYLOAD_INTEGRITY_FAILED",
      }),
    });
  });

  it("does not coerce an unknown intent role into an authorized role", async () => {
    const invalidRole = "UNKNOWN_ROLE";
    const harness = makeHarness({
      candidates: [
        frozenIntent({
          recipientRole: invalidRole,
          payloadHash: assessmentEmailIntentPayloadHash({
            snapshotSchemaVersion: 1,
            recipientRole: invalidRole,
            emailType: "ASSESSMENT_RESULTS",
            recipientEmail: RECIPIENT,
            subject: SUBJECT,
            bodyHtml: HTML,
          }),
        }),
      ],
    });

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.held).toBe(1);
    expect(harness.tx.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(harness.tx.assessmentEmailDeliveryIntent.update).toHaveBeenCalledWith({
      where: { id: "intent-1" },
      data: expect.objectContaining({
        status: "HELD",
        holdReason: "IDENTITY_LINK_CHANGED",
      }),
    });
  });

  it("fails closed when the handoff audit cannot persist", async () => {
    const harness = makeHarness();
    harness.tx.auditLog.create.mockRejectedValueOnce(
      Object.assign(new Error(RAW_ERROR), { name: "AuditWriteError" }),
    );

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.retried).toBe(1);
    expect(harness.tx.assessmentEmailOutbox.create).toHaveBeenCalledTimes(1);
    expect(harness.tx.assessmentEmailDeliveryIntent.update).not.toHaveBeenCalled();
    expect(
      harness.prisma.assessmentEmailDeliveryIntent.updateMany,
    ).toHaveBeenCalledTimes(1);
  });

  it.each([
    { attempts: 0, expectedNextAttemptAt: "2026-08-03T00:02:00.000Z" },
    { attempts: 1, expectedNextAttemptAt: "2026-08-03T00:04:00.000Z" },
    { attempts: 2, expectedNextAttemptAt: "2026-08-03T00:08:00.000Z" },
    { attempts: 3, expectedNextAttemptAt: "2026-08-03T00:16:00.000Z" },
  ])("uses guarded exponential retry bookkeeping after $attempts failures without changing the version", async ({
    attempts,
    expectedNextAttemptAt,
  }) => {
    const intent = frozenIntent({ attempts });
    const harness = makeHarness({ candidates: [intent] });
    harness.loadCurrentAuthorizationFacts.mockRejectedValueOnce(
      Object.assign(new Error(RAW_ERROR), { name: "ConnectionError" }),
    );

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.retried).toBe(1);
    expect(
      harness.prisma.assessmentEmailDeliveryIntent.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: intent.id,
        status: "PENDING",
        version: intent.version,
      },
      data: {
        attempts: { increment: 1 },
        lastErrorClass: "ConnectionError",
        nextAttemptAt: new Date(expectedNextAttemptAt),
      },
    });
    const retryData =
      harness.prisma.assessmentEmailDeliveryIntent.updateMany.mock.calls[0][0]
        .data;
    expect(retryData.version).toBeUndefined();
    expect(JSON.stringify(harness.logger.error.mock.calls)).not.toContain(
      RAW_ERROR,
    );
  });

  it("atomically holds and audits the fifth transient failure", async () => {
    const intent = frozenIntent({ attempts: 4 });
    const harness = makeHarness({ candidates: [intent] });
    harness.loadCurrentAuthorizationFacts.mockRejectedValueOnce(
      Object.assign(new Error(RAW_ERROR), { name: "TimeoutError" }),
    );

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result).toEqual(
      expect.objectContaining({ held: 1, retried: 0 }),
    );
    expect(harness.runOneTransaction).toHaveBeenCalledTimes(3);
    expect(
      harness.tx.assessmentEmailDeliveryIntent.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: intent.id,
        status: "PENDING",
        version: intent.version,
      },
      data: expect.objectContaining({
        status: "HELD",
        attempts: { increment: 1 },
        lastErrorClass: "TimeoutError",
        holdReason: "RETRY_EXHAUSTED",
        holdReasons: ["RETRY_EXHAUSTED"],
        heldAt: NOW,
        version: { increment: 1 },
      }),
    });
    expect(harness.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ASSESSMENT_EMAIL_INTENT_HELD",
        changes: expect.stringContaining("RETRY_EXHAUSTED"),
      }),
    });
    expect(JSON.stringify(harness.tx.auditLog.create.mock.calls)).not.toMatch(
      /private-recipient|Private frozen|Private frozen body|database rejected/,
    );
  });

  it("does not start fifth-failure bookkeeping at the 45-second deadline", async () => {
    const times = [new Date(0), new Date(44_999), new Date(45_000)];
    const intent = frozenIntent({ attempts: 4 });
    const harness = makeHarness({
      candidates: [intent],
      now: () => times.shift() ?? new Date(45_000),
    });
    harness.loadCurrentAuthorizationFacts.mockRejectedValueOnce(
      Object.assign(new Error(RAW_ERROR), { name: "TimeoutError" }),
    );

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result).toEqual(
      expect.objectContaining({ held: 0, retried: 0 }),
    );
    expect(harness.runOneTransaction).toHaveBeenCalledTimes(1);
    expect(
      harness.tx.assessmentEmailDeliveryIntent.updateMany,
    ).not.toHaveBeenCalled();
    expect(harness.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      error: {
        name: "PrismaClientKnownRequestError",
        code: "P2002",
        message: RAW_ERROR,
      },
      expectedClass: "PRISMA_P2002",
    },
    {
      error: {
        name: "DatabaseError",
        code: "23505",
        message: RAW_ERROR,
      },
      expectedClass: "POSTGRES_23505",
    },
  ])("keeps a second-write unique race transient", async ({ error, expectedClass }) => {
    const harness = makeHarness();
    harness.tx.assessmentEmailOutbox.create.mockRejectedValueOnce(error);

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.retried).toBe(1);
    expect(
      harness.prisma.assessmentEmailDeliveryIntent.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastErrorClass: expectedClass }),
      }),
    );
    expect(JSON.stringify(harness.logger.error.mock.calls)).not.toContain(
      RAW_ERROR,
    );
  });

  it("logs only IDs and stable class when guarded bookkeeping also fails", async () => {
    const harness = makeHarness();
    harness.loadCurrentAuthorizationFacts.mockRejectedValueOnce(
      Object.assign(new Error(RAW_ERROR), { name: "ConnectionError" }),
    );
    harness.prisma.assessmentEmailDeliveryIntent.updateMany.mockRejectedValueOnce(
      Object.assign(new Error(`second ${RAW_ERROR}`), {
        name: "BookkeepingError",
      }),
    );

    const result = await reconcileAssessmentEmailIntents(
      harness.deps,
      SUBMISSION_SCOPE,
    );

    expect(result.retried).toBe(0);
    expect(harness.runOneTransaction).toHaveBeenCalledTimes(1);
    expect(harness.logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        intentId: "intent-1",
        submissionId: "submission-1",
        errorClass: "BookkeepingError",
      }),
    );
    expect(JSON.stringify(harness.logger.error.mock.calls)).not.toMatch(
      /private-recipient|Private frozen|Private frozen body|database rejected/,
    );
  });
});
