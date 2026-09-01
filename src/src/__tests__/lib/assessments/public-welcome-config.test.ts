import { resolvePublicWelcomeConfig } from "@/lib/assessments/public-welcome-config";
import { resolveLegacyInvitedWelcomeConfig } from "@/lib/assessments/invited-welcome-config";

describe("resolvePublicWelcomeConfig", () => {
  it("treats a schema-v1 migration backfill as an unedited template default", () => {
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

    expect(
      resolvePublicWelcomeConfig(storedV1Backfill, "sunhub-quick-quiz"),
    ).toBeNull();
  });

  it.each(["sunhub-quick-quiz", "scaling-up-quick", "scaling-up-full"])(
    "treats the schema-v2 code baseline for %s as unedited",
    (templateAlias) => {
      const storedV2Baseline = resolveLegacyInvitedWelcomeConfig(templateAlias);

      expect(
        resolvePublicWelcomeConfig(storedV2Baseline, templateAlias),
      ).toBeNull();
    },
  );

  it.each([
    ["sharingDescription", "Only authorized staff review your answers."],
    ["ledeParagraphs", ["An authored public Welcome message."]],
    ["ctaLabel", "Start now"],
  ] as const)("returns an authored config when only %s changed", (key, value) => {
    const baseline = resolveLegacyInvitedWelcomeConfig("scaling-up-quick");
    const edited = { ...baseline, [key]: value };

    expect(resolvePublicWelcomeConfig(edited, "scaling-up-quick")).toEqual(edited);
  });

  it.each([
    undefined,
    null,
    { schemaVersion: 99 },
    { schemaVersion: 1, eyebrow: "partial" },
  ])("uses the public presentation for absent or malformed config %#", (stored) => {
    expect(resolvePublicWelcomeConfig(stored, "scaling-up-quick")).toBeNull();
  });
});
