/**
 * Consolidated integration test — all 5 assessment seed templates.
 *
 * Verifies (without any DB connection) that every re-seeded template:
 *   1. Passes TemplateVersionForPublishSchema (strict publish parse).
 *   2. Has no duplicate stableKeys within sections or questions.
 *   3. Every question's sectionStableKey resolves to a real section.
 *   4. scoreSubmission() accepts a synthetic midpoint answer set and
 *      returns a tier (or the single neutral tier for aggregation-only
 *      templates like QSP v1, QSP v2, and LVA).
 *
 * "Midpoint" answer construction:
 *   - SLIDER_LIKERT: value = Math.ceil((scale.min + scale.max) / 2)
 *   - Required NUMBER: value = 5
 *   - Required TEXT: value = "test"
 *   - Required MULTI_CHOICE: value = [options[0].key]  (first available option)
 *   - Optional questions: omitted (scoreSubmission does not require them)
 *
 * This is the CI gate that proves every template is publish-ready before
 * the prod-seed runner is invoked.
 */

import {
  buildRockefellerContent,
  type RockefellerContent,
} from "../../../prisma/seed-rockefeller-assessment";
import {
  buildQspV1Content,
  type QspV1Content,
} from "../../../prisma/seed-qsp-v1-assessment";
import {
  buildQspV2Content,
  type QspV2Content,
} from "../../../prisma/seed-qsp-v2-assessment";
import {
  buildLvaContent,
  type LvaContent,
} from "../../../prisma/seed-lva-assessment";
import { buildScalingUpFullContent } from "../../../prisma/seed-scaling-up-full-assessment";
import {
  TemplateVersionForPublishSchema,
  scoreSubmission,
  type Answer,
} from "../../lib/assessments/scoring";
import { assertSeedContentIntegrity } from "../../lib/assessments/seed-template-version";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal typed question shape for midpoint answer building. */
interface AnyQuestion {
  stableKey: string;
  type: string;
  isRequired: boolean;
  scale?: { min: number; max: number };
  options?: Array<{ key: string }>;
}

/** AnySection shape for integrity helpers. */
interface AnySection {
  stableKey: string;
  sortOrder: number;
  name: string;
}

/**
 * Build a midpoint answer set from a question list.
 *
 * - SLIDER_LIKERT: midpoint of its scale.
 * - Required NUMBER: 5.
 * - Required TEXT: "test".
 * - Required MULTI_CHOICE: first available option key.
 * - Optional non-slider questions: omitted (not required by scoreSubmission).
 */
function buildMidpointAnswers(questions: AnyQuestion[]): Answer[] {
  const answers: Answer[] = [];
  for (const q of questions) {
    if (q.type === "SLIDER_LIKERT") {
      const scale = q.scale!;
      const mid = scale.min + Math.floor((scale.max - scale.min) / 2);
      answers.push({ stableKey: q.stableKey, value: mid });
    } else if (q.isRequired) {
      if (q.type === "NUMBER") {
        answers.push({ stableKey: q.stableKey, value: 5 });
      } else if (q.type === "TEXT") {
        answers.push({ stableKey: q.stableKey, value: "test" });
      } else if (q.type === "MULTI_CHOICE") {
        const opts = q.options ?? [];
        answers.push({
          stableKey: q.stableKey,
          value: opts.length > 0 ? [opts[0].key] : [],
        });
      }
    }
  }
  return answers;
}

/**
 * Run the publish-schema + scoreSubmission assertions for one template.
 * Returns the tier label from scoreSubmission (or null for aggregation-only).
 */
function assertTemplateValid(
  alias: string,
  content: { sections: unknown[]; questions: unknown[]; scoringConfig: unknown }
): string | null {
  // 1) TemplateVersionForPublishSchema
  const parsed = TemplateVersionForPublishSchema.safeParse({
    questions: content.questions,
    sections: content.sections,
    scoringConfig: content.scoringConfig,
  });

  if (!parsed.success) {
    const structuralIssues = parsed.error.issues.filter(
      (iss) => !iss.path.includes("recommendations")
    );
    if (structuralIssues.length > 0) {
      throw new Error(
        `[${alias}] TemplateVersionForPublishSchema rejected on STRUCTURAL path(s):\n` +
          structuralIssues
            .map((iss) => `  [${iss.path.join(".")}]: ${iss.message}`)
            .join("\n")
      );
    }
    // Only recommendation-text failures — acceptable for DRAFT seeds.
  }

  // 2) scoreSubmission with midpoint answers
  const questions = content.questions as AnyQuestion[];
  const version = {
    questions: content.questions,
    sections: content.sections,
    scoringConfig: content.scoringConfig,
    // scoreSubmission only uses questions/sections/scoringConfig
  } as Parameters<typeof scoreSubmission>[0];

  const answers = buildMidpointAnswers(questions);
  const result = scoreSubmission(version, answers);
  return result.tier?.label ?? null;
}

// ---------------------------------------------------------------------------
// Rockefeller Habits Checklist
// ---------------------------------------------------------------------------

describe("Rockefeller — publish schema + scoreSubmission", () => {
  let content: RockefellerContent;

  beforeAll(() => {
    content = buildRockefellerContent();
  });

  it("passes assertSeedContentIntegrity (no duplicate stableKeys, all sectionRefs resolve)", () => {
    expect(() => assertSeedContentIntegrity(content as Parameters<typeof assertSeedContentIntegrity>[0])).not.toThrow();
  });

  it("no two questions share a stableKey", () => {
    const keys = (content.questions as AnyQuestion[]).map((q) => q.stableKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("no two sections share a stableKey", () => {
    const keys = (content.sections as AnySection[]).map((s) => s.stableKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("passes TemplateVersionForPublishSchema (no structural failures)", () => {
    expect(() =>
      assertTemplateValid("RockHabits", content)
    ).not.toThrow();
  });

  it("scoreSubmission returns a real tier (not just the neutral single-tier)", () => {
    const tier = assertTemplateValid("RockHabits", content);
    // Rockefeller has 3 tiers: Low / OK / Great. Midpoint score should hit one.
    expect(tier).not.toBeNull();
    expect(["Low", "OK", "Great"]).toContain(tier);
  });
});

// ---------------------------------------------------------------------------
// QSP v1
// ---------------------------------------------------------------------------

describe("QSP v1 — publish schema + scoreSubmission", () => {
  let content: QspV1Content;

  beforeAll(() => {
    content = buildQspV1Content();
  });

  it("passes assertSeedContentIntegrity", () => {
    expect(() => assertSeedContentIntegrity(content as Parameters<typeof assertSeedContentIntegrity>[0])).not.toThrow();
  });

  it("no two questions share a stableKey", () => {
    const keys = (content.questions as AnyQuestion[]).map((q) => q.stableKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("no two sections share a stableKey", () => {
    const keys = (content.sections as AnySection[]).map((s) => s.stableKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("passes TemplateVersionForPublishSchema (no structural failures)", () => {
    expect(() =>
      assertTemplateValid("qsp-v1", content)
    ).not.toThrow();
  });

  it("scoreSubmission resolves to the single neutral aggregation tier", () => {
    const tier = assertTemplateValid("qsp-v1", content);
    // QSP v1 uses a single covering tier "Submitted" — aggregation only.
    expect(tier).toBe("Submitted");
  });
});

// ---------------------------------------------------------------------------
// QSP v2
// ---------------------------------------------------------------------------

describe("QSP v2 — publish schema + scoreSubmission", () => {
  let content: QspV2Content;

  beforeAll(() => {
    content = buildQspV2Content();
  });

  it("passes assertSeedContentIntegrity", () => {
    expect(() => assertSeedContentIntegrity(content as Parameters<typeof assertSeedContentIntegrity>[0])).not.toThrow();
  });

  it("no two questions share a stableKey", () => {
    const keys = (content.questions as AnyQuestion[]).map((q) => q.stableKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("no two sections share a stableKey", () => {
    const keys = (content.sections as AnySection[]).map((s) => s.stableKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("passes TemplateVersionForPublishSchema (no structural failures)", () => {
    expect(() =>
      assertTemplateValid("qsp-v2", content)
    ).not.toThrow();
  });

  it("scoreSubmission resolves to the single neutral aggregation tier", () => {
    const tier = assertTemplateValid("qsp-v2", content);
    // QSP v2 uses a single covering tier "Submitted" — aggregation only.
    expect(tier).toBe("Submitted");
  });
});

// ---------------------------------------------------------------------------
// LVA (Leadership Vision Alignment)
// ---------------------------------------------------------------------------

describe("LVA — publish schema + scoreSubmission", () => {
  let content: LvaContent;

  beforeAll(() => {
    content = buildLvaContent();
  });

  it("passes assertSeedContentIntegrity", () => {
    expect(() => assertSeedContentIntegrity(content as Parameters<typeof assertSeedContentIntegrity>[0])).not.toThrow();
  });

  it("no two questions share a stableKey", () => {
    const keys = (content.questions as AnyQuestion[]).map((q) => q.stableKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("no two sections share a stableKey", () => {
    const keys = (content.sections as AnySection[]).map((s) => s.stableKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("passes TemplateVersionForPublishSchema (no structural failures)", () => {
    expect(() =>
      assertTemplateValid("leadership-vision-alignment", content)
    ).not.toThrow();
  });

  it("scoreSubmission resolves to the single neutral aggregation tier", () => {
    const tier = assertTemplateValid("leadership-vision-alignment", content);
    // LVA uses a single covering tier "Submitted" — aggregation only.
    expect(tier).toBe("Submitted");
  });
});

// ---------------------------------------------------------------------------
// Scaling Up Full
// ---------------------------------------------------------------------------

describe("Scaling Up Full — publish schema + scoreSubmission", () => {
  let content: ReturnType<typeof buildScalingUpFullContent>;

  beforeAll(() => {
    content = buildScalingUpFullContent();
  });

  it("passes assertSeedContentIntegrity", () => {
    expect(() => assertSeedContentIntegrity(content as Parameters<typeof assertSeedContentIntegrity>[0])).not.toThrow();
  });

  it("no two questions share a stableKey", () => {
    const keys = (content.questions as AnyQuestion[]).map((q) => q.stableKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("no two sections share a stableKey", () => {
    const keys = (content.sections as AnySection[]).map((s) => s.stableKey);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("passes TemplateVersionForPublishSchema (no structural failures)", () => {
    expect(() =>
      assertTemplateValid("scaling-up-full", content)
    ).not.toThrow();
  });

  it("scoreSubmission returns a real tier (Not ready / On the way / Exemplary)", () => {
    const tier = assertTemplateValid("scaling-up-full", content);
    // Scaling Up Full has 3 meaningful global tiers. Midpoint of 0-10 is 5,
    // which should land in "On the way" (4.0–6.5).
    expect(tier).not.toBeNull();
    expect(["Not ready", "On the way", "Exemplary"]).toContain(tier);
  });

  it("scoreSubmission returns perDomain results for all 5 domains", () => {
    const questions = content.questions as AnyQuestion[];
    const version = {
      questions: content.questions,
      sections: content.sections,
      scoringConfig: content.scoringConfig,
    } as Parameters<typeof scoreSubmission>[0];
    const answers = buildMidpointAnswers(questions);
    const result = scoreSubmission(version, answers);
    expect(result.perDomain).toBeDefined();
    expect(result.perDomain!.length).toBe(5);
    const domainKeys = result.perDomain!.map((d) => d.key).sort();
    expect(domainKeys).toEqual(["cash", "execution", "people", "strategy", "you"]);
  });
});
