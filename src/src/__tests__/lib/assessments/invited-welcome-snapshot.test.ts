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
  it("reloads and returns a fresh valid stored default through the supplied tx", async () => {
    const stored = { ...GENERIC_INVITED_WELCOME_CONFIG, eyebrow: "Custom" };
    const client = tx({ alias: "custom", invitedWelcomeDefault: stored });

    const first = await loadInvitedWelcomeSnapshot(client as never, "tpl-1");
    const second = await loadInvitedWelcomeSnapshot(client as never, "tpl-1");

    expect(client.assessmentTemplate.findUnique).toHaveBeenCalledWith({
      where: { id: "tpl-1" },
      select: { alias: true, invitedWelcomeDefault: true },
    });
    expect(first).toEqual(stored);
    expect(first).not.toBe(stored);
    expect(first).not.toBe(second);
    expect(first.ledeParagraphs).not.toBe(stored.ledeParagraphs);
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
