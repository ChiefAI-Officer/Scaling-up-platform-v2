import {
  buildInvitationHtmlOverrideAudit,
  formatInvitationHtmlOverrideAudit,
  loadInvitationHtmlOverrideRows,
  type InvitationHtmlAuditDb,
} from "@/lib/assessments/invitation-html-override-audit";

describe("invitation HTML override activation audit", () => {
  it("classifies live and soft-deleted overrides without exposing raw HTML", () => {
    const report = buildInvitationHtmlOverrideAudit({
      rows: [
        {
          campaignId: "live-1",
          templateAlias: "rockefeller",
          deletedAt: null,
          invitationBodyHtml:
            '<p>person@example.com</p><a href="{{invitationUrl}}">Open</a>',
        },
        {
          campaignId: "deleted-1",
          templateAlias: "qsp",
          deletedAt: new Date("2026-07-10T00:00:00Z"),
          invitationBodyHtml:
            '<img src="https://cdn.test/coach-secret.png"><p>#t=SECRET</p>',
        },
      ],
      currentWaveDEnabled: true,
      currentBrandedModeEnabled: false,
    });

    expect(report).toMatchObject({
      total: 2,
      live: 1,
      softDeleted: 1,
      activationBlocked: true,
    });
    expect(report.entries).toEqual([
      expect.objectContaining({
        campaignId: "live-1",
        lifecycle: "live",
        hasRecognizedUrlToken: true,
        currentMode: "full_replace",
        postActivationMode: "branded_body",
        rollbackMode: "full_replace",
      }),
      expect.objectContaining({
        campaignId: "deleted-1",
        lifecycle: "soft_deleted",
        hasRecognizedUrlToken: false,
        currentMode: "branded_fallback",
        postActivationMode: "branded_body",
        rollbackMode: "branded_fallback",
      }),
    ]);

    const output = formatInvitationHtmlOverrideAudit(report);
    expect(output).toContain("live-1");
    expect(output).toContain("rockefeller");
    expect(output).toContain("Activation blocked: yes");
    for (const forbidden of [
      "person@example.com",
      "#t=SECRET",
      "coach-secret.png",
      "<a href=",
    ]) {
      expect(output).not.toContain(forbidden);
    }
  });

  it("does not block activation when there are no live overrides", () => {
    const report = buildInvitationHtmlOverrideAudit({
      rows: [
        {
          campaignId: "deleted-1",
          templateAlias: "qsp",
          deletedAt: new Date("2026-07-10T00:00:00Z"),
          invitationBodyHtml: "<p>Body</p>",
        },
      ],
      currentWaveDEnabled: true,
      currentBrandedModeEnabled: false,
    });

    expect(report.activationBlocked).toBe(false);
  });

  it("excludes blank HTML values from the override inventory", () => {
    const report = buildInvitationHtmlOverrideAudit({
      rows: [
        {
          campaignId: "blank-live",
          templateAlias: "rockefeller",
          deletedAt: null,
          invitationBodyHtml: " \n ",
        },
      ],
      currentWaveDEnabled: true,
      currentBrandedModeEnabled: false,
    });

    expect(report).toEqual({
      total: 0,
      live: 0,
      softDeleted: 0,
      activationBlocked: false,
      entries: [],
    });
  });

  it("starts a read-only transaction before the allowlisted select", async () => {
    const calls: string[] = [];
    const db: InvitationHtmlAuditDb = {
      $transaction: async (callback) =>
        callback({
          $executeRawUnsafe: async (sql) => {
            calls.push(sql);
            return 0;
          },
          assessmentCampaign: {
            findMany: async (args) => {
              calls.push(JSON.stringify(args));
              return [
                {
                  id: "campaign-1",
                  deletedAt: null,
                  invitationBodyHtml: "<p>Body</p>",
                  template: { alias: "rockefeller" },
                },
              ];
            },
          },
        }),
    };

    await expect(loadInvitationHtmlOverrideRows(db)).resolves.toEqual([
      {
        campaignId: "campaign-1",
        templateAlias: "rockefeller",
        deletedAt: null,
        invitationBodyHtml: "<p>Body</p>",
      },
    ]);
    expect(calls[0]).toBe("SET TRANSACTION READ ONLY");
    expect(JSON.parse(calls[1])).toEqual({
      where: { invitationBodyHtml: { not: null } },
      select: {
        id: true,
        deletedAt: true,
        invitationBodyHtml: true,
        template: { select: { alias: true } },
      },
      orderBy: { id: "asc" },
    });
  });
});
