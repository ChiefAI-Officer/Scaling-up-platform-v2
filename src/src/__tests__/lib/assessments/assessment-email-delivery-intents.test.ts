import { createHash } from "crypto";
import {
  assessmentEmailIntentPayloadHash,
  intentExpiresAt,
  parseAuthorizationSnapshot,
  sourceCommitIdentifier,
  stableCanonicalJson,
  terminalIntentData,
  type AuthorizationSnapshotV1,
  type ContentProvenanceV1,
} from "@/lib/assessments/assessment-email-delivery-intents";

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
      closeAt: "2026-08-31T00:00:00.000Z",
      invitationExpiresAt: "2026-09-01T00:00:00.000Z",
      recipientRole: "RESPONDENT",
      emailType: "ASSESSMENT_RESULTS",
      phase2Fingerprint: "a".repeat(64),
    },
    respondentResults: {
      canonicalRecipientMailbox: "person@example.com",
      sendResultsToRespondent: true,
      featureKey: "WAVE_D_RESULTS_EMAIL_ENABLED",
      featureEnabled: true,
      approved: true,
      approvedContentHash: "b".repeat(64),
    },
  };
}

function terminalFixture() {
  const snapshot = respondentSnapshot();
  const provenance: ContentProvenanceV1 = {
    schemaVersion: 1,
    templateId: snapshot.common.templateId,
    versionId: snapshot.common.versionId,
    templateAlias: snapshot.common.templateAlias,
    reportType: "ASSESSMENT_RESULTS",
    approvalHash: "c".repeat(64),
    rendererContractVersion: 1,
    sourceCommit: "d".repeat(40),
    renderInputHash: "e".repeat(64),
  };

  return {
    now: new Date("2026-08-03T00:00:00.000Z"),
    status: "HANDED_OFF" as const,
    outboxId: "outbox-1",
    actor: "assessment-email-reconciler",
    reasonCode: "PROVIDER_HANDOFF_CONFIRMED",
    snapshot,
    provenance,
  };
}

describe("assessment email delivery intent contract", () => {
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

    expect(digest).toBe(
      createHash("sha256")
        .update(JSON.stringify([1, "RESPONDENT", "ASSESSMENT_RESULTS", "person@example.com", "Your results", "<p>Frozen</p>"]))
        .digest("hex"),
    );

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

  it("serializes object keys deterministically while preserving array order", () => {
    expect(stableCanonicalJson({ zebra: [3, { beta: true, alpha: null }], alpha: { second: 2, first: 1 } })).toBe(
      '{"alpha":{"first":1,"second":2},"zebra":[3,{"alpha":null,"beta":true}]}',
    );
  });

  it("uses an absolute 30-day deadline", () => {
    expect(intentExpiresAt(new Date("2026-08-03T00:00:00.000Z"))).toEqual(
      new Date("2026-09-02T00:00:00.000Z"),
    );
  });

  it("rejects unsupported and malformed authorization snapshots", () => {
    expect(parseAuthorizationSnapshot({ ...respondentSnapshot(), schemaVersion: 2 })).toEqual({ supported: false });
    expect(parseAuthorizationSnapshot({ schemaVersion: 1, common: {} })).toEqual({ supported: false });
  });

  it("requires exactly one role-specific snapshot matching the role and email type", () => {
    const respondent = respondentSnapshot();
    const coachBlock = {
      canonicalRecipientMailbox: "coach@example.com",
      notifyCoachOnCompletion: true,
      featureKey: "WAVE_D_COACH_NOTIFY_ENABLED",
      featureEnabled: true,
      coachId: "coach-1",
    };

    expect(parseAuthorizationSnapshot(respondent)).toEqual({ supported: true, value: respondent });
    expect(parseAuthorizationSnapshot({ ...respondent, coachCompletion: coachBlock })).toEqual({ supported: false });
    expect(parseAuthorizationSnapshot({ ...respondent, respondentResults: undefined, coachCompletion: coachBlock })).toEqual({ supported: false });
    expect(parseAuthorizationSnapshot({
      ...respondent,
      common: { ...respondent.common, emailType: "COACH_COMPLETION" },
    })).toEqual({ supported: false });
  });

  it("uses deployment commit identifiers in deterministic precedence order", () => {
    expect(sourceCommitIdentifier({ VERCEL_GIT_COMMIT_SHA: "vercel", GIT_COMMIT_SHA: "git" })).toBe("vercel");
    expect(sourceCommitIdentifier({ GIT_COMMIT_SHA: "git" })).toBe("git");
    expect(sourceCommitIdentifier({})).toBe("unknown");
  });

  it("purges every payload and PII-bearing snapshot field", () => {
    const terminal = terminalIntentData(terminalFixture());

    expect(terminal).toEqual(
      expect.objectContaining({
        status: "HANDED_OFF",
        handedOffOutboxId: "outbox-1",
        resolvedAt: new Date("2026-08-03T00:00:00.000Z"),
        resolvedBy: "assessment-email-reconciler",
        resolutionReasonCode: "PROVIDER_HANDOFF_CONFIRMED",
        recipientEmail: null,
        subject: null,
        bodyHtml: null,
      }),
    );
    expect(terminal.authorizationSnapshot).toEqual({
      schemaVersion: 1,
      common: {
        campaignId: "campaign-1",
        invitationId: "invitation-1",
        respondentId: "respondent-1",
        templateId: "template-1",
        versionId: "version-1",
        campaignDeleted: false,
        invitationRevoked: false,
        closeAt: "2026-08-31T00:00:00.000Z",
        invitationExpiresAt: "2026-09-01T00:00:00.000Z",
        phase2Fingerprint: "a".repeat(64),
      },
      respondentResults: {
        sendResultsToRespondent: true,
        featureEnabled: true,
        approved: true,
        approvedContentHash: "b".repeat(64),
      },
    });
    expect(terminal.contentProvenance).toEqual({
      schemaVersion: 1,
      templateId: "template-1",
      versionId: "version-1",
      approvalHash: "c".repeat(64),
      rendererContractVersion: 1,
      sourceCommit: "d".repeat(40),
      renderInputHash: "e".repeat(64),
    });
    expect(JSON.stringify(terminal)).not.toMatch(/person@example\.com|assessment-template|ASSESSMENT_RESULTS/);
  });
});
