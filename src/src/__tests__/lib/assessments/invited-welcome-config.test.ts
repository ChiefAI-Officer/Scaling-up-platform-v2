import {
  GENERIC_INVITED_WELCOME_CONFIG,
  RESUME_NOTE,
  buildInvitedWelcomeConfig,
  interpolateWelcomeHeading,
  invitedWelcomeAuthoringInputSchema,
  invitedWelcomeConfigSchema,
  resolveLegacyInvitedWelcomeConfig,
  splitWelcomeMessage,
} from "@/lib/assessments/invited-welcome-config";

const validAuthoring = {
  eyebrow: "You're invited",
  headingTemplate: "Welcome to {{campaignName}}",
  ledeParagraphs: ["First paragraph.", "Second paragraph."],
  sharingHeading: "How your answers are shared",
  sharingDescription: "Only the facilitation team can review these answers.",
  scoresHeading: "Your category scores",
  scoresDescription: "See where the team stands across each category.",
  ctaLabel: "Start the assessment",
};

describe("invited Welcome config", () => {
  it("matches the current generic invited card", () => {
    expect(GENERIC_INVITED_WELCOME_CONFIG).toEqual({
      schemaVersion: 2,
      eyebrow: "You're invited",
      headingTemplate: "{{campaignName}}",
      ledeParagraphs: [
        "A quick check on how your team works together. You can answer in one sitting or come back later — your link stays active.",
      ],
      sharingHeading: "How your answers are shared",
      sharingDescription:
        "Your coach or facilitator and authorized Scaling Up staff can review your named individual answers.",
      scoresHeading: "Your category scores",
      scoresDescription: "See where the team stands across each category.",
      ctaLabel: "Start the assessment",
      finePrint: null,
    });
  });

  it.each([
    ["leadership-vision-alignment", 1],
    ["qsp-v2", 1],
    ["five-dysfunctions", 1],
    ["RockHabits", 2],
    ["scaling-up-full", 2],
  ] as const)("freezes bespoke copy for %s", (alias, paragraphCount) => {
    const config = resolveLegacyInvitedWelcomeConfig(alias);
    expect(config.ledeParagraphs).toHaveLength(paragraphCount);
    expect(config.finePrint).toBe(RESUME_NOTE);
  });

  it.each(["qsp-v1", "scaling-up-quick", "unknown", "constructor", "__proto__"])(
    "uses the generic config for %s",
    (alias) => {
      expect(resolveLegacyInvitedWelcomeConfig(alias)).toEqual(
        GENERIC_INVITED_WELCOME_CONFIG,
      );
    },
  );

  it("normalizes and trims accepted authoring input", () => {
    const parsed = invitedWelcomeAuthoringInputSchema.parse({
      ...validAuthoring,
      eyebrow: "  You're invited  ",
      ledeParagraphs: [" First\r\nline. ", " Second. "],
      ignored: "drop me",
    });
    expect(parsed.eyebrow).toBe("You're invited");
    expect(parsed.ledeParagraphs).toEqual(["First\nline.", "Second."]);
    expect(parsed).not.toHaveProperty("ignored");
  });

  it.each([
    ["eyebrow", "x".repeat(61)],
    ["headingTemplate", `{{campaignName}}${"x".repeat(145)}`],
    ["sharingHeading", "x".repeat(121)],
    ["sharingDescription", "x".repeat(401)],
    ["scoresHeading", "x".repeat(121)],
    ["scoresDescription", "x".repeat(401)],
    ["ctaLabel", "x".repeat(81)],
  ] as const)("rejects an overlong %s", (field, value) => {
    expect(
      invitedWelcomeAuthoringInputSchema.safeParse({
        ...validAuthoring,
        [field]: value,
      }).success,
    ).toBe(false);
  });

  it("rejects invalid paragraph counts and limits", () => {
    expect(
      invitedWelcomeAuthoringInputSchema.safeParse({
        ...validAuthoring,
        ledeParagraphs: [],
      }).success,
    ).toBe(false);
    expect(
      invitedWelcomeAuthoringInputSchema.safeParse({
        ...validAuthoring,
        ledeParagraphs: ["a", "b", "c", "d", "e"],
      }).success,
    ).toBe(false);
    expect(
      invitedWelcomeAuthoringInputSchema.safeParse({
        ...validAuthoring,
        ledeParagraphs: ["x".repeat(1001)],
      }).success,
    ).toBe(false);
    expect(
      invitedWelcomeAuthoringInputSchema.safeParse({
        ...validAuthoring,
        ledeParagraphs: ["x".repeat(900), "y".repeat(900), "z".repeat(701)],
      }).success,
    ).toBe(false);
  });

  it("requires only the campaign-name token and rejects control characters", () => {
    for (const headingTemplate of ["Welcome", "{{templateName}}", "{{campaignName}} {{coachName}}"] ) {
      expect(
        invitedWelcomeAuthoringInputSchema.safeParse({
          ...validAuthoring,
          headingTemplate,
        }).success,
      ).toBe(false);
    }
    expect(
      invitedWelcomeAuthoringInputSchema.safeParse({
        ...validAuthoring,
        scoresDescription: "Unsafe\u0007text",
      }).success,
    ).toBe(false);
  });

  it("rejects server-owned fields from authoring payloads", () => {
    expect(
      invitedWelcomeAuthoringInputSchema.safeParse({
        ...validAuthoring,
        schemaVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      invitedWelcomeAuthoringInputSchema.safeParse({
        ...validAuthoring,
        finePrint: "forged",
      }).success,
    ).toBe(false);
  });

  it("upgrades an exact V1 config in memory and preserves authored V2", () => {
    const legacyV1 = {
      schemaVersion: 1,
      eyebrow: "You're invited",
      headingTemplate: "{{campaignName}}",
      ledeParagraphs: ["Legacy paragraph."],
      sharingHeading: "Who can read this",
      scoresHeading: "Your scores",
      scoresDescription: "Review the categories.",
      ctaLabel: "Begin",
      finePrint: null,
    };

    expect(invitedWelcomeConfigSchema.parse(legacyV1)).toEqual({
      ...legacyV1,
      schemaVersion: 2,
      sharingDescription:
        "Your coach or facilitator and authorized Scaling Up staff can review your named individual answers.",
    });
    expect(
      invitedWelcomeConfigSchema.parse({
        schemaVersion: 2,
        ...validAuthoring,
        finePrint: RESUME_NOTE,
      }),
    ).toEqual({
      schemaVersion: 2,
      ...validAuthoring,
      finePrint: RESUME_NOTE,
    });
  });

  it("fails closed for malformed or future persisted configs", () => {
    expect(invitedWelcomeConfigSchema.safeParse({ ...validAuthoring }).success).toBe(false);
    expect(
      invitedWelcomeConfigSchema.safeParse({
        ...validAuthoring,
        schemaVersion: 3,
        finePrint: null,
      }).success,
    ).toBe(false);
    expect(
      invitedWelcomeConfigSchema.safeParse({
        ...validAuthoring,
        schemaVersion: 2,
        sharingDescription: undefined,
        finePrint: null,
      }).success,
    ).toBe(false);
  });

  it("builds a V2 config and preserves only server fine print", () => {
    expect(buildInvitedWelcomeConfig(validAuthoring, RESUME_NOTE)).toEqual({
      schemaVersion: 2,
      ...validAuthoring,
      finePrint: RESUME_NOTE,
    });
  });

  it("splits one textarea into normalized paragraphs", () => {
    expect(splitWelcomeMessage(" First.\r\n\r\n Second. \n \nThird. ")).toEqual([
      "First.",
      "Second.",
      "Third.",
    ]);
  });

  it("replaces every campaign-name token as plain text", () => {
    expect(
      interpolateWelcomeHeading(
        "{{campaignName}} — welcome to {{campaignName}}",
        "<strong>Q3</strong>",
      ),
    ).toBe("<strong>Q3</strong> — welcome to <strong>Q3</strong>");
  });
});
