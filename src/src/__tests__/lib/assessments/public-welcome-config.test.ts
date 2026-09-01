import { resolvePublicWelcomeConfig } from "@/lib/assessments/public-welcome-config";
import {
  DEFAULT_INVITED_WELCOME_SHARING_DESCRIPTION,
  resolveLegacyInvitedWelcomeConfig,
} from "@/lib/assessments/invited-welcome-config";

describe("resolvePublicWelcomeConfig", () => {
  it("normalizes and returns a schema-v1 migration backfill", () => {
    const storedV1Backfill = {
      schemaVersion: 1,
      eyebrow: "You're invited",
      headingTemplate: "{{campaignName}}",
      ledeParagraphs: [
        "A quick check on how your team works together. You can answer in one sitting or come back later — your link stays active.",
      ],
      sharingHeading: "How your answers are shared",
      scoresHeading: "Your category scores",
      scoresDescription: "See where the team stands across each category.",
      ctaLabel: "Start the assessment",
      finePrint: null,
    };

    expect(resolvePublicWelcomeConfig(storedV1Backfill)).toEqual({
      ...storedV1Backfill,
      schemaVersion: 2,
      sharingDescription: DEFAULT_INVITED_WELCOME_SHARING_DESCRIPTION,
    });
  });

  it.each([
    "sunhub-quick-quiz",
    "scaling-up-quick",
    "scaling-up-full",
    "unmapped-template",
    "__proto__",
    "constructor",
  ])(
    "returns the stored schema-v2 configuration for %s without alias selection",
    (templateAlias) => {
      const storedV2Baseline = resolveLegacyInvitedWelcomeConfig(templateAlias);

      expect(resolvePublicWelcomeConfig(storedV2Baseline)).toEqual(
        storedV2Baseline,
      );
    },
  );

  it.each([
    ["sharingDescription", "Only authorized staff review your answers."],
    ["ledeParagraphs", ["An authored public Welcome message."]],
    ["ctaLabel", "Start now"],
  ] as const)("returns an authored config when only %s changed", (key, value) => {
    const baseline = resolveLegacyInvitedWelcomeConfig("scaling-up-quick");
    const edited = { ...baseline, [key]: value };

    expect(resolvePublicWelcomeConfig(edited)).toEqual(edited);
  });

  it.each([
    undefined,
    null,
    { schemaVersion: 99 },
    { schemaVersion: 1, eyebrow: "partial" },
  ])("uses the public presentation for absent or malformed config %#", (stored) => {
    expect(resolvePublicWelcomeConfig(stored)).toBeNull();
  });
});
