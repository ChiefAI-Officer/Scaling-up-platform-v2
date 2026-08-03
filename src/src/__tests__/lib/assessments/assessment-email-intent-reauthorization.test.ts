import {
  assessmentEmailIntentPayloadHash,
  stableCanonicalJson,
  type AuthorizationSnapshotV1,
} from "@/lib/assessments/assessment-email-delivery-intents";
import {
  EMAIL_DELIVERY_INTENT_HOLD_CODES,
  evaluateIntentReauthorization,
  reviewContextHash,
  type CurrentAuthorizationFactsV1,
  type FrozenIntentForAuthorization,
  type ReauthorizationDecision,
} from "@/lib/assessments/assessment-email-intent-reauthorization";

const APPROVED_HASH = "a".repeat(64);
const PHASE_2_FINGERPRINT = "b".repeat(64);

function respondentSnapshot(): AuthorizationSnapshotV1 {
  return {
    schemaVersion: 1,
    common: {
      campaignId: "campaign-1",
      invitationId: "invitation-1",
      respondentId: "respondent-1",
      templateId: "template-1",
      templateAlias: "assessment-template",
      versionId: "version-1",
      accessMode: "INVITED",
      campaignStatus: "ACTIVE",
      campaignDeleted: false,
      invitationStatus: "SUBMITTED",
      invitationRevoked: false,
      closeAt: "2026-07-31T00:00:00.000Z",
      invitationExpiresAt: "2026-08-01T00:00:00.000Z",
      recipientRole: "RESPONDENT",
      emailType: "ASSESSMENT_RESULTS",
      phase2Fingerprint: PHASE_2_FINGERPRINT,
    },
    respondentResults: {
      canonicalRecipientMailbox: "person@example.com",
      sendResultsToRespondent: true,
      featureKey: "WAVE_D_RESULTS_EMAIL_ENABLED",
      featureEnabled: true,
      approved: true,
      approvedContentHash: APPROVED_HASH,
    },
  };
}

function coachSnapshot(): AuthorizationSnapshotV1 {
  const snapshot = respondentSnapshot();
  return {
    ...snapshot,
    common: {
      ...snapshot.common,
      recipientRole: "OWNING_COACH",
      emailType: "COACH_COMPLETION",
    },
    respondentResults: undefined,
    coachCompletion: {
      canonicalRecipientMailbox: "coach@example.com",
      notifyCoachOnCompletion: true,
      featureKey: "WAVE_D_COACH_NOTIFY_ENABLED",
      featureEnabled: true,
      coachId: "coach-1",
    },
  };
}

function frozenIntent(
  snapshot: AuthorizationSnapshotV1 = respondentSnapshot(),
): FrozenIntentForAuthorization {
  const intent = {
    submissionId: "submission-1",
    campaignId: snapshot.common.campaignId,
    invitationId: snapshot.common.invitationId,
    respondentId: snapshot.common.respondentId,
    recipientRole: snapshot.common.recipientRole,
    emailType: snapshot.common.emailType,
    recipientEmail:
      snapshot.respondentResults?.canonicalRecipientMailbox ??
      snapshot.coachCompletion?.canonicalRecipientMailbox ??
      null,
    subject: "Your frozen assessment email",
    bodyHtml: "<p>Frozen bytes</p>",
    snapshotSchemaVersion: 1,
    rendererContractVersion: 1,
  } satisfies Omit<FrozenIntentForAuthorization, "payloadHash">;

  return {
    ...intent,
    payloadHash: assessmentEmailIntentPayloadHash({
      snapshotSchemaVersion: intent.snapshotSchemaVersion,
      recipientRole: intent.recipientRole,
      emailType: intent.emailType,
      recipientEmail: intent.recipientEmail!,
      subject: intent.subject!,
      bodyHtml: intent.bodyHtml!,
    }),
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
      status: "ACTIVE",
      deleted: false,
      closeAt: "2026-07-31T00:00:00.000Z",
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
      expiresAt: "2026-08-01T00:00:00.000Z",
    },
    respondent: {
      exists: true,
      canonicalMailbox: "  PERSON@EXAMPLE.COM  ",
    },
    template: {
      exists: true,
      alias: "assessment-template",
      resultsEmailApproved: true,
      storedApprovedContentHash: APPROVED_HASH,
      liveContentHash: APPROVED_HASH,
    },
    version: {
      exists: true,
      templateId: "template-1",
    },
    coach: {
      exists: true,
      id: "coach-1",
      canonicalMailbox: "ＣＯＡＣＨ@example.com",
    },
    features: {
      resultsEmailEnabled: true,
      coachNotifyEnabled: true,
    },
  };
}

function evaluateRespondent(
  mutate?: (fixture: {
    intent: FrozenIntentForAuthorization;
    snapshot: AuthorizationSnapshotV1;
    current: CurrentAuthorizationFactsV1;
  }) => void,
): ReauthorizationDecision {
  const fixture = {
    intent: frozenIntent(),
    snapshot: respondentSnapshot(),
    current: currentFacts(),
  };
  mutate?.(fixture);
  return evaluateIntentReauthorization(fixture);
}

function evaluateCoach(
  mutate?: (fixture: {
    intent: FrozenIntentForAuthorization;
    snapshot: AuthorizationSnapshotV1;
    current: CurrentAuthorizationFactsV1;
  }) => void,
): ReauthorizationDecision {
  const snapshot = coachSnapshot();
  const fixture = {
    intent: frozenIntent(snapshot),
    snapshot,
    current: currentFacts(),
  };
  mutate?.(fixture);
  return evaluateIntentReauthorization(fixture);
}

function held(reason: (typeof EMAIL_DELIVERY_INTENT_HOLD_CODES)[number]) {
  return {
    kind: "HELD",
    primaryReason: reason,
    reasons: [reason],
  };
}

describe("assessment email intent current-state reauthorization", () => {
  it("pins the complete global hold-code order", () => {
    expect(EMAIL_DELIVERY_INTENT_HOLD_CODES).toEqual([
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
    ]);
  });

  it.each([
    [
      "CAMPAIGN_DELETED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.campaign.exists = false;
      },
    ],
    [
      "CAMPAIGN_STATUS_CHANGED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.campaign.status = "CLOSED";
      },
    ],
    [
      "CAMPAIGN_DEADLINE_CHANGED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.campaign.closeAt = "2026-08-31T00:00:00.000Z";
      },
    ],
    [
      "INVITATION_REVOKED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.invitation.revoked = true;
      },
    ],
    [
      "INVITATION_EXPIRY_CHANGED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.invitation.expiresAt = "2026-09-01T00:00:00.000Z";
      },
    ],
    [
      "IDENTITY_LINK_CHANGED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.submission.respondentId = "respondent-2";
      },
    ],
    [
      "RESPONDENT_EMAIL_CHANGED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.respondent.canonicalMailbox = "other@example.com";
      },
    ],
    [
      "COACH_OWNER_CHANGED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateCoach>[0]>>[0]) => {
        fixture.current.campaign.createdByCoachId = "coach-2";
      },
      "coach",
    ],
    [
      "COACH_EMAIL_CHANGED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateCoach>[0]>>[0]) => {
        fixture.current.coach!.canonicalMailbox = "other-coach@example.com";
      },
      "coach",
    ],
    [
      "TEMPLATE_CHANGED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.template.alias = "replacement-template";
      },
    ],
    [
      "VERSION_CHANGED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.campaign.versionId = "version-2";
      },
    ],
    [
      "APPROVAL_REVOKED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.template.resultsEmailApproved = false;
      },
    ],
    [
      "APPROVAL_HASH_CHANGED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.template.liveContentHash = "c".repeat(64);
      },
    ],
    [
      "FEATURE_DISABLED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.current.features.resultsEmailEnabled = false;
      },
    ],
    [
      "PAYLOAD_INTEGRITY_FAILED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.intent.subject = "Mutated subject";
      },
    ],
    [
      "SCHEMA_UNSUPPORTED",
      (fixture: Parameters<NonNullable<Parameters<typeof evaluateRespondent>[0]>>[0]) => {
        fixture.intent.rendererContractVersion = 2;
      },
    ],
  ] as const)(
    "returns the stable %s decision",
    (reason, mutate, role = "respondent") => {
      const decision =
        role === "coach"
          ? evaluateCoach(mutate as Parameters<typeof evaluateCoach>[0])
          : evaluateRespondent(mutate as Parameters<typeof evaluateRespondent>[0]);
      expect(decision).toEqual(held(reason));
    },
  );

  it.each([
    [
      "a missing submission",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.submission.exists = false;
      },
    ],
    [
      "a changed submission campaign link",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.submission.campaignId = "campaign-2";
      },
    ],
    [
      "a changed submission invitation link",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.submission.invitationId = "invitation-2";
      },
    ],
    [
      "a changed submission respondent link",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.submission.respondentId = "respondent-2";
      },
    ],
    [
      "a missing invitation",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.invitation.exists = false;
      },
    ],
    [
      "a changed invitation campaign link",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.invitation.campaignId = "campaign-2";
      },
    ],
    [
      "a changed invitation respondent link",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.invitation.respondentId = "respondent-2";
      },
    ],
    [
      "a missing respondent",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.respondent.exists = false;
      },
    ],
  ])("holds IDENTITY_LINK_CHANGED for %s", (_label, mutate) => {
    expect(
      evaluateRespondent(({ current }) => {
        mutate(current);
      }),
    ).toEqual(held("IDENTITY_LINK_CHANGED"));
  });

  it.each([
    [
      "a non-invited access mode",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.campaign.accessMode = "PUBLIC";
      },
    ],
    [
      "a changed stored campaign status",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.campaign.status = "CLOSED";
      },
    ],
  ])("holds CAMPAIGN_STATUS_CHANGED for %s", (_label, mutate) => {
    expect(
      evaluateRespondent(({ current }) => {
        mutate(current);
      }),
    ).toEqual(held("CAMPAIGN_STATUS_CHANGED"));
  });

  it.each([
    [
      "soft deletion",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.campaign.deleted = true;
      },
    ],
    [
      "a changed deletion marker",
      (
        facts: CurrentAuthorizationFactsV1,
        snapshot: AuthorizationSnapshotV1,
      ) => {
        snapshot.common.campaignDeleted = true;
        facts.campaign.deleted = false;
      },
    ],
  ])("holds CAMPAIGN_DELETED for %s", (_label, mutate) => {
    expect(
      evaluateRespondent(({ current, snapshot }) => {
        mutate(current, snapshot);
      }),
    ).toEqual(held("CAMPAIGN_DELETED"));
  });

  it.each([
    [
      "a changed invitation stored status",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.invitation.status = "STARTED";
      },
    ],
    [
      "a changed invitation revocation marker",
      (
        facts: CurrentAuthorizationFactsV1,
        snapshot: AuthorizationSnapshotV1,
      ) => {
        snapshot.common.invitationRevoked = true;
        facts.invitation.revoked = false;
      },
    ],
  ])("holds INVITATION_REVOKED for %s", (_label, mutate) => {
    expect(
      evaluateRespondent(({ current, snapshot }) => {
        mutate(current, snapshot);
      }),
    ).toEqual(held("INVITATION_REVOKED"));
  });

  it.each([
    [
      "a missing template",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.template.exists = false;
      },
    ],
    [
      "a changed campaign template",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.campaign.templateId = "template-2";
      },
    ],
    [
      "a changed template alias",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.template.alias = "replacement-template";
      },
    ],
  ])("holds TEMPLATE_CHANGED for %s", (_label, mutate) => {
    expect(
      evaluateRespondent(({ current }) => {
        mutate(current);
      }),
    ).toEqual(held("TEMPLATE_CHANGED"));
  });

  it.each([
    [
      "a missing pinned version",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.version.exists = false;
      },
    ],
    [
      "a changed campaign version",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.campaign.versionId = "version-2";
      },
    ],
    [
      "a version linked to another template",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.version.templateId = "template-2";
      },
    ],
  ])("holds VERSION_CHANGED for %s", (_label, mutate) => {
    expect(
      evaluateRespondent(({ current }) => {
        mutate(current);
      }),
    ).toEqual(held("VERSION_CHANGED"));
  });

  it.each([
    [
      "the send-results campaign toggle",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.campaign.sendResultsToRespondent = false;
      },
    ],
    [
      "the results feature",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.features.resultsEmailEnabled = false;
      },
    ],
  ])("holds respondent FEATURE_DISABLED when disabling %s", (_label, mutate) => {
    expect(
      evaluateRespondent(({ current }) => {
        mutate(current);
      }),
    ).toEqual(held("FEATURE_DISABLED"));
  });

  it.each([
    [
      "the notify-coach campaign toggle",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.campaign.notifyCoachOnCompletion = false;
      },
    ],
    [
      "the coach-notify feature",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.features.coachNotifyEnabled = false;
      },
    ],
  ])("holds coach FEATURE_DISABLED when disabling %s", (_label, mutate) => {
    expect(
      evaluateCoach(({ current }) => {
        mutate(current);
      }),
    ).toEqual(held("FEATURE_DISABLED"));
  });

  it.each([
    [
      "stored approval hash",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.template.storedApprovedContentHash = "c".repeat(64);
      },
    ],
    [
      "live approval hash",
      (facts: CurrentAuthorizationFactsV1) => {
        facts.template.liveContentHash = "c".repeat(64);
      },
    ],
    [
      "frozen approved hash",
      (_facts: CurrentAuthorizationFactsV1, snapshot: AuthorizationSnapshotV1) => {
        snapshot.respondentResults!.approvedContentHash = "c".repeat(64);
      },
    ],
  ])("holds APPROVAL_HASH_CHANGED for a changed %s", (_label, mutate) => {
    expect(
      evaluateRespondent(({ current, snapshot }) => {
        mutate(current, snapshot);
      }),
    ).toEqual(held("APPROVAL_HASH_CHANGED"));
  });

  it("authorizes the respondent path with an equivalent normalized mailbox", () => {
    expect(evaluateRespondent()).toEqual({ kind: "AUTHORIZED" });
  });

  it("authorizes the coach path with an NFKC-normalized equivalent mailbox", () => {
    expect(evaluateCoach()).toEqual({ kind: "AUTHORIZED" });
  });

  it("does not treat natural passage beyond unchanged deadlines as drift", () => {
    jest.useFakeTimers().setSystemTime(new Date("2027-01-01T00:00:00.000Z"));
    try {
      expect(evaluateRespondent()).toEqual({
        kind: "AUTHORIZED",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("orders and deduplicates multiple reasons by the global stable allowlist", () => {
    expect(
      evaluateRespondent(({ current }) => {
        current.campaign.exists = false;
        current.campaign.deleted = true;
        current.respondent.canonicalMailbox = "other@example.com";
        current.features.resultsEmailEnabled = false;
        current.campaign.sendResultsToRespondent = false;
      }),
    ).toEqual({
      kind: "HELD",
      primaryReason: "CAMPAIGN_DELETED",
      reasons: [
        "CAMPAIGN_DELETED",
        "RESPONDENT_EMAIL_CHANGED",
        "FEATURE_DISABLED",
      ],
    });
  });

  it.each([
    [
      "snapshotSchemaVersion",
      (intent: FrozenIntentForAuthorization) => {
        intent.snapshotSchemaVersion = 2;
      },
    ],
    [
      "recipientRole",
      (intent: FrozenIntentForAuthorization) => {
        intent.recipientRole = "OWNING_COACH";
      },
    ],
    [
      "emailType",
      (intent: FrozenIntentForAuthorization) => {
        intent.emailType = "COACH_COMPLETION";
      },
    ],
    [
      "recipientEmail",
      (intent: FrozenIntentForAuthorization) => {
        intent.recipientEmail = "other@example.com";
      },
    ],
    [
      "subject",
      (intent: FrozenIntentForAuthorization) => {
        intent.subject = "Changed subject";
      },
    ],
    [
      "bodyHtml",
      (intent: FrozenIntentForAuthorization) => {
        intent.bodyHtml = "<p>Changed HTML</p>";
      },
    ],
  ])("detects a frozen payload tuple mutation to %s", (_field, mutate) => {
    const decision = evaluateRespondent(({ intent }) => {
      mutate(intent);
    });
    expect(decision.kind).toBe("HELD");
    if (decision.kind === "HELD") {
      expect(decision.reasons).toContain("PAYLOAD_INTEGRITY_FAILED");
    }
  });

  it.each(["recipientEmail", "subject", "bodyHtml"] as const)(
    "holds PAYLOAD_INTEGRITY_FAILED when frozen %s is missing",
    (field) => {
      const decision = evaluateRespondent(({ intent }) => {
        intent[field] = null;
      });
      expect(decision.kind).toBe("HELD");
      if (decision.kind === "HELD") {
        expect(decision.reasons).toContain("PAYLOAD_INTEGRITY_FAILED");
      }
    },
  );

  it.each([
    [
      "snapshot schema",
      (intent: FrozenIntentForAuthorization) => {
        intent.snapshotSchemaVersion = 2;
        intent.payloadHash = assessmentEmailIntentPayloadHash({
          snapshotSchemaVersion: intent.snapshotSchemaVersion,
          recipientRole: intent.recipientRole,
          emailType: intent.emailType,
          recipientEmail: intent.recipientEmail!,
          subject: intent.subject!,
          bodyHtml: intent.bodyHtml!,
        });
      },
    ],
    [
      "renderer contract",
      (intent: FrozenIntentForAuthorization) => {
        intent.rendererContractVersion = 2;
      },
    ],
  ])("holds SCHEMA_UNSUPPORTED for an unsupported %s", (_label, mutate) => {
    expect(
      evaluateRespondent(({ intent }) => {
        mutate(intent);
      }),
    ).toEqual(held("SCHEMA_UNSUPPORTED"));
  });

  it("holds IDENTITY_LINK_CHANGED when intent role and email type do not match the snapshot", () => {
    expect(
      evaluateRespondent(({ intent }) => {
        intent.recipientRole = "OWNING_COACH";
        intent.emailType = "COACH_COMPLETION";
        intent.payloadHash = assessmentEmailIntentPayloadHash({
          snapshotSchemaVersion: intent.snapshotSchemaVersion,
          recipientRole: intent.recipientRole,
          emailType: intent.emailType,
          recipientEmail: intent.recipientEmail!,
          subject: intent.subject!,
          bodyHtml: intent.bodyHtml!,
        });
      }),
    ).toEqual(held("IDENTITY_LINK_CHANGED"));
  });

  it("holds COACH_OWNER_CHANGED when the current owning coach is unavailable", () => {
    expect(
      evaluateCoach(({ current }) => {
        current.coach = null;
      }),
    ).toEqual(held("COACH_OWNER_CHANGED"));
  });
});

describe("assessment email intent review context hash", () => {
  function hashInput() {
    return {
      intentId: "intent-1",
      intentVersion: 7,
      current: currentFacts(),
    };
  }

  it("is deterministic for the same intent identity, version, and current facts", () => {
    const input = hashInput();
    const reorderedCurrent = JSON.parse(
      stableCanonicalJson(input.current),
    ) as CurrentAuthorizationFactsV1;

    expect(reviewContextHash(input)).toBe(
      reviewContextHash({
        ...input,
        current: reorderedCurrent,
      }),
    );
  });

  it.each([
    [
      "intent ID",
      (input: ReturnType<typeof hashInput>) => {
        input.intentId = "intent-2";
      },
    ],
    [
      "intent version",
      (input: ReturnType<typeof hashInput>) => {
        input.intentVersion += 1;
      },
    ],
    ...Object.entries(currentFacts()).flatMap(([section, facts]) =>
      Object.keys(facts ?? {}).map(
        (field) =>
          [
            `current.${section}.${field}`,
            (input: ReturnType<typeof hashInput>) => {
              const sectionFacts = input.current[
                section as keyof CurrentAuthorizationFactsV1
              ] as unknown as Record<string, unknown>;
              const value = sectionFacts[field];
              sectionFacts[field] =
                typeof value === "boolean"
                  ? !value
                  : typeof value === "string"
                    ? `${value}-changed`
                    : value === null
                      ? "changed"
                      : null;
            },
          ] as const,
      ),
    ),
  ])("changes when %s changes", (_label, mutate) => {
    const original = hashInput();
    const changed = hashInput();
    mutate(changed);
    expect(reviewContextHash(changed)).not.toBe(reviewContextHash(original));
  });

  it("excludes extra frozen recipient, subject, and HTML fields", () => {
    const input = hashInput();
    const withFrozenPayload = {
      ...input,
      recipientEmail: "frozen@example.com",
      subject: "Frozen subject",
      bodyHtml: "<p>Frozen HTML</p>",
    };

    expect(reviewContextHash(withFrozenPayload)).toBe(reviewContextHash(input));
  });

  it("changes when the current coach fact becomes unavailable", () => {
    const original = hashInput();
    const changed = hashInput();
    changed.current.coach = null;

    expect(reviewContextHash(changed)).not.toBe(reviewContextHash(original));
  });
});
