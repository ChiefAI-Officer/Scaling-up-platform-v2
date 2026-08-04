import {
  LEGACY_AUDIT_EVIDENCE_CODES,
  auditLegacyAssessmentEmailGaps,
  parseLegacyAuditArgs,
} from "../../../scripts/audit-legacy-assessment-email-gaps";

describe("legacy assessment email gap auditor", () => {
  const until = new Date("2026-08-03T12:00:00.000Z");
  const since = new Date("2026-07-28T00:00:00.000Z");

  it("requires an explicit closed-open rollout boundary", () => {
    expect(() => parseLegacyAuditArgs([])).toThrow("--until=<ISO>");
  });

  it.each([
    ["unknown argument", ["--limit=1"]],
    ["duplicate until", ["--until=2026-08-03T12:00:00.000Z", "--until=2026-08-04T12:00:00.000Z"]],
    ["duplicate since", ["--until=2026-08-03T12:00:00.000Z", "--since=2026-07-01T00:00:00.000Z", "--since=2026-07-02T00:00:00.000Z"]],
    ["malformed until", ["--until=not-a-date"]],
    ["malformed since", ["--until=2026-08-03T12:00:00.000Z", "--since=03/08/2026"]],
    ["empty until", ["--until="]],
    ["invalid range", ["--until=2026-08-03T12:00:00.000Z", "--since=2026-08-03T12:00:00.000Z"]],
  ])("rejects %s", (_label, argv) => {
    expect(() => parseLegacyAuditArgs(argv)).toThrow();
  });

  it("parses canonical ISO arguments without making them implicit", () => {
    expect(
      parseLegacyAuditArgs([
        "--since=2026-07-28T00:00:00.000Z",
        "--until=2026-08-03T12:00:00.000Z",
      ]),
    ).toEqual({ since, until });
  });

  it("emits deterministic ID-only unverifiable candidates and aggregate counts", async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        submissionId: "sub-b",
        campaignId: "campaign-b",
        invitationId: "invitation-b",
        hasRespondentOutbox: false,
        hasCoachOutbox: false,
        campaignDeleted: true,
        campaignStatus: "CLOSED",
        invitationRevoked: true,
        invitationStatus: "SUBMITTED",
        invitationExpired: true,
        respondentDeleted: true,
        respondentRoleCurrentlyEnabled: false,
        coachRoleCurrentlyEnabled: false,
        respondentApprovalCurrentlyValid: false,
        coachOwnerCurrentlyPresent: false,
      },
      {
        submissionId: "sub-a",
        campaignId: "campaign-a",
        invitationId: "invitation-a",
        hasRespondentOutbox: false,
        hasCoachOutbox: true,
        campaignDeleted: false,
        campaignStatus: "ACTIVE",
        invitationRevoked: false,
        invitationStatus: "SUBMITTED",
        invitationExpired: false,
        respondentDeleted: false,
        respondentRoleCurrentlyEnabled: true,
        coachRoleCurrentlyEnabled: true,
        respondentApprovalCurrentlyValid: true,
        coachOwnerCurrentlyPresent: true,
      },
      {
        submissionId: "sub-complete",
        campaignId: "campaign-complete",
        invitationId: "invitation-complete",
        hasRespondentOutbox: true,
        hasCoachOutbox: true,
        campaignDeleted: false,
        campaignStatus: "ACTIVE",
        invitationRevoked: false,
        invitationStatus: "SUBMITTED",
        invitationExpired: false,
        respondentDeleted: false,
        respondentRoleCurrentlyEnabled: true,
        coachRoleCurrentlyEnabled: true,
        respondentApprovalCurrentlyValid: true,
        coachOwnerCurrentlyPresent: true,
      },
    ]);

    const report = await auditLegacyAssessmentEmailGaps({
      prisma: { $queryRaw: queryRaw },
      since,
      until,
      now: new Date("2026-08-04T01:02:03.000Z"),
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(report).toEqual({
      classification: "UNVERIFIABLE_CANDIDATE",
      generatedAt: "2026-08-04T01:02:03.000Z",
      counts: {
        submissionsInspected: 3,
        missingRespondentRole: 2,
        missingCoachRole: 1,
      },
      candidates: [
        {
          submissionId: "sub-a",
          campaignId: "campaign-a",
          invitationId: "invitation-a",
          missingRoles: ["RESPONDENT"],
          currentEvidenceCodes: ["RESPONDENT_OUTBOX_MISSING"],
        },
        {
          submissionId: "sub-b",
          campaignId: "campaign-b",
          invitationId: "invitation-b",
          missingRoles: ["RESPONDENT", "OWNING_COACH"],
          currentEvidenceCodes: [
            "RESPONDENT_OUTBOX_MISSING",
            "OWNING_COACH_OUTBOX_MISSING",
            "CAMPAIGN_DELETED",
            "CAMPAIGN_NOT_ACTIVE",
            "INVITATION_REVOKED",
            "INVITATION_EXPIRED",
            "RESPONDENT_DELETED",
            "RESPONDENT_ROLE_CURRENTLY_DISABLED",
            "OWNING_COACH_ROLE_CURRENTLY_DISABLED",
            "RESPONDENT_APPROVAL_CURRENTLY_INVALID",
            "OWNING_COACH_CURRENTLY_MISSING",
          ],
        },
      ],
    });

    for (const candidate of report.candidates) {
      expect(candidate.currentEvidenceCodes).toEqual(
        candidate.currentEvidenceCodes.filter((code) =>
          LEGACY_AUDIT_EVIDENCE_CODES.includes(
            code as (typeof LEGACY_AUDIT_EVIDENCE_CODES)[number],
          ),
        ),
      );
    }
  });

  it("uses one parameterized SELECT-only query for the requested closed-open window", async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);

    await auditLegacyAssessmentEmailGaps({
      prisma: { $queryRaw: queryRaw },
      since,
      until,
      now: new Date("2026-08-04T01:02:03.000Z"),
    });

    const query = queryRaw.mock.calls[0][0] as {
      sql?: string;
      text?: string;
      values?: unknown[];
    };
    const sql = query.sql ?? query.text ?? String(query);

    expect(sql).toMatch(/^\s*(WITH|SELECT)\b/i);
    expect(sql).toContain('"submittedAt" <');
    expect(sql).toContain('"submittedAt" >=');
    expect(sql).toContain('"invitationId" IS NOT NULL');
    expect(sql).toContain('"assessment_email_outbox"');
    expect(query.values).toEqual(expect.arrayContaining([since, until]));
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|UPSERT|DELETE|MERGE|EXECUTE)\b/i);
  });

  it("serializes no payload, identity, replay, mapping, or write capability", async () => {
    const report = await auditLegacyAssessmentEmailGaps({
      prisma: {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            submissionId: "sub-safe",
            campaignId: "campaign-safe",
            invitationId: "invitation-safe",
            hasRespondentOutbox: false,
            hasCoachOutbox: true,
            campaignDeleted: false,
            campaignStatus: "ACTIVE",
            invitationRevoked: false,
            invitationStatus: "SUBMITTED",
            invitationExpired: false,
            respondentDeleted: false,
            respondentRoleCurrentlyEnabled: true,
            coachRoleCurrentlyEnabled: true,
            respondentApprovalCurrentlyValid: true,
            coachOwnerCurrentlyPresent: true,
          },
        ]),
      },
      until,
      now: new Date("2026-08-04T01:02:03.000Z"),
    });
    const serialized = JSON.stringify(report);

    expect(serialized).not.toMatch(
      /recipientEmail|subject|bodyHtml|answers|result|@|https?:\/\/|reconstruct|payload|apply|mapping|replay|backfill|insert|update|upsert|delete|execute/i,
    );
  });
});
