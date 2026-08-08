import {
  buildSunHubQuickQuizContent,
  SUNHUB_QUICK_QUIZ_ALIAS,
} from "../../../prisma/seed-sunhub-quick-quiz";
import {
  scoreSubmission,
  TemplateVersionForScoringSchema,
  type Answer,
  type TemplateVersionForScoring,
} from "../../lib/assessments/scoring";

const content = buildSunHubQuickQuizContent();

const SOURCE_QUESTIONS = [
  "Sales come easy",
  "I would enthusiastically rehire everyone on my team",
  "People are begging to invest or loan us money",
  "We have efficient processes",
  "I’m relaxed and focused",
  "We dominate our niche",
  "We’re generating lots of cash",
  "All of our clients are raving fans",
] as const;

const SOURCE_SECTION_NAMES = [
  "About your strategy",
  "About your people",
  "About your cash",
  "About your execution",
  "About your people",
  "About your strategy",
  "About your cash",
  "About your execution",
] as const;

describe("SunHub quick quiz source fixture", () => {
  it("uses a new alias and does not collide with the 32-question assessment", () => {
    expect(SUNHUB_QUICK_QUIZ_ALIAS).toBe("sunhub-quick-quiz");
    expect(content.alias).toBe(SUNHUB_QUICK_QUIZ_ALIAS);
    expect(content.alias).not.toBe("scaling-up-quick");
  });

  it("contains the exact eight source questions in order", () => {
    expect(content.questions).toHaveLength(8);
    expect(
      (content.questions as Array<{ label: string }>).map((question) => question.label),
    ).toEqual(SOURCE_QUESTIONS);
  });

  it("uses eight one-question pages in the source category order", () => {
    expect(content.sections).toHaveLength(8);
    expect(
      (content.sections as Array<{ name: string }>).map((section) => section.name),
    ).toEqual(SOURCE_SECTION_NAMES);

    for (const section of content.sections as Array<{ stableKey: string }>) {
      expect(
        (content.questions as Array<{ sectionStableKey?: string }>).filter(
          (question) => question.sectionStableKey === section.stableKey,
        ),
      ).toHaveLength(1);
    }
  });

  it("isolates every section and question behind fresh sunhub stable keys", () => {
    const sectionKeys = (
      content.sections as Array<{ stableKey: string }>
    ).map((section) => section.stableKey);
    const questionKeys = (
      content.questions as Array<{ stableKey: string }>
    ).map((question) => question.stableKey);

    expect([...sectionKeys, ...questionKeys]).toHaveLength(16);
    expect(new Set([...sectionKeys, ...questionKeys]).size).toBe(16);
    for (const stableKey of [...sectionKeys, ...questionKeys]) {
      expect(stableKey).toMatch(/^sunhub_/);
    }
  });

  it("uses the source 0–10 integer scale and anchors on every question", () => {
    for (const question of content.questions as Array<{
      type: string;
      isRequired: boolean;
      scale: {
        min: number;
        max: number;
        step: number;
        anchorMin: string;
        anchorMax: string;
      };
    }>) {
      expect(question).toMatchObject({
        type: "SLIDER_LIKERT",
        isRequired: true,
        scale: {
          min: 0,
          max: 10,
          step: 1,
          anchorMin: "Not true",
          anchorMax: "Completely true",
        },
      });
    }
  });

  it("contains the four source feedback bands", () => {
    const tiers = (
      content.scoringConfig as {
        tiers: Array<{ label: string; message: string }>;
      }
    ).tiers;

    expect(tiers.map((tier) => tier.label)).toEqual([
      "0–24%",
      "25–49%",
      "50–74%",
      "75–100%",
    ]);
    expect(tiers.map((tier) => tier.message)).toEqual([
      "Ouch! It’s been tough to scale easily. We can help. If action followed knowledge, we’d all have six packs. —Niel Malan",
      "Good start. Though wondering if there is an easier way to scale. Believe you can and you’re halfway there. —Theodore Roosevelt",
      "You’re close. With a little more finesse you can nail the scale. Professionals do it all; amateurs only do the fun parts.",
      "You rock (or fib!). You’re ready. Keep moving; grab profit share! If everything seems in control, you’re just not going fast enough. —Mario Andretti",
    ]);
  });

  it("passes the scoring/publish contract", () => {
    expect(
      TemplateVersionForScoringSchema.safeParse({
        questions: content.questions,
        sections: content.sections,
        scoringConfig: content.scoringConfig,
      }),
    ).toMatchObject({ success: true });
  });
});

describe("SunHub quick quiz score boundaries", () => {
  const version = {
    questions: content.questions,
    sections: content.sections,
    scoringConfig: content.scoringConfig,
  } as TemplateVersionForScoring;

  const stableKeys = (content.questions as Array<{ stableKey: string }>).map(
    (question) => question.stableKey,
  );

  function answersForTotal(total: number): Answer[] {
    const base = Math.floor(total / stableKeys.length);
    const remainder = total % stableKeys.length;
    return stableKeys.map((stableKey, index) => ({
      stableKey,
      value: base + (index < remainder ? 1 : 0),
    }));
  }

  it.each([
    [19, 24, "0–24%"],
    [20, 25, "25–49%"],
    [39, 49, "25–49%"],
    [40, 50, "50–74%"],
    [59, 74, "50–74%"],
    [60, 75, "75–100%"],
    [80, 100, "75–100%"],
  ])("maps total %i to displayed score %i and tier %s", (total, score, label) => {
    const result = scoreSubmission(version, answersForTotal(total));
    expect(result.scaleUpScore).toBe(score);
    expect(result.tier?.label).toBe(label);
    expect(result.perDomain).toBeUndefined();
  });
});
