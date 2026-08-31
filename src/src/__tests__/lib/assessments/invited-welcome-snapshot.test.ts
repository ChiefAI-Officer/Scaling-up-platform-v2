import { loadInvitedWelcomeSnapshot } from "@/lib/assessments/invited-welcome-snapshot";
import {
  GENERIC_INVITED_WELCOME_CONFIG,
  resolveLegacyInvitedWelcomeConfig,
} from "@/lib/assessments/invited-welcome-config";

function tx(row: unknown) {
  return {
    assessmentTemplate: {
      findUnique: jest.fn().mockResolvedValue(row),
    },
  };
}

describe("loadInvitedWelcomeSnapshot", () => {
  it("upgrades a V1 default to a fresh V2 snapshot through the supplied tx", async () => {
    const stored = {
      schemaVersion: 1,
      eyebrow: "Custom",
      headingTemplate: "{{campaignName}}",
      ledeParagraphs: ["Legacy copy."],
      sharingHeading: "Who reviews this",
      scoresHeading: "Your scores",
      scoresDescription: "Review each category.",
      ctaLabel: "Begin",
      finePrint: null,
    };
    const client = tx({ alias: "custom", invitedWelcomeDefault: stored });

    const first = await loadInvitedWelcomeSnapshot(client as never, "tpl-1");
    const second = await loadInvitedWelcomeSnapshot(client as never, "tpl-1");

    expect(client.assessmentTemplate.findUnique).toHaveBeenCalledWith({
      where: { id: "tpl-1" },
      select: { alias: true, invitedWelcomeDefault: true },
    });
    expect(first).toEqual({
      ...stored,
      schemaVersion: 2,
      sharingDescription:
        "Your coach or facilitator and authorized Scaling Up staff can review your named individual answers.",
    });
    expect(first).not.toBe(stored);
    expect(first).not.toBe(second);
    expect(first.ledeParagraphs).not.toBe(stored.ledeParagraphs);
  });

  it("preserves an authored V2 Sharing explanation", async () => {
    const stored = {
      ...GENERIC_INVITED_WELCOME_CONFIG,
      sharingDescription: "Only named facilitators can review these answers.",
    };

    await expect(
      loadInvitedWelcomeSnapshot(
        tx({ alias: "custom", invitedWelcomeDefault: stored }) as never,
        "tpl-1",
      ),
    ).resolves.toEqual(stored);
  });

  it.each([null, { schemaVersion: 99 }])(
    "falls back to the exact legacy alias config for %p",
    async (invitedWelcomeDefault) => {
      const client = tx({ alias: "qsp-v2", invitedWelcomeDefault });

      await expect(
        loadInvitedWelcomeSnapshot(client as never, "tpl-1"),
      ).resolves.toEqual(resolveLegacyInvitedWelcomeConfig("qsp-v2"));
    },
  );

  it("throws if the template disappears", async () => {
    await expect(
      loadInvitedWelcomeSnapshot(tx(null) as never, "missing"),
    ).rejects.toThrow("Assessment template missing not found");
  });
});
