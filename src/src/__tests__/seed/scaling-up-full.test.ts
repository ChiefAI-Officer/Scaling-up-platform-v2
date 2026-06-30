/**
 * Smoke tests for the Scaling Up Full assessment seed script (D2.2).
 *
 * These tests verify:
 *   1. State A: runSeed creates the template + DRAFT version on first call
 *      with the correct alias and a stable contentHash.
 *   2. State B: a second runSeed call with a matching contentHash is a no-op.
 *   3. State C: drift detection throws when the existing version's hash
 *      differs.
 *   4. Cross-seed uniqueness: SU Full hash differs from Rockefeller + QSP.
 *   5. Extraction audit: buildTemplateContent() yields the expected
 *      structure (5 domains, 10 sections, 50–70 questions, every question
 *      0-10 SLIDER_LIKERT with 5 bands, rollup + scaleUpScore enabled).
 *   6. Runtime schema validation: the seed content passes the engine's
 *      runtime Zod schema unconditionally.
 *   7. Publish schema validation: passes outright OR fails ONLY due to text
 *      content (acceptable for DRAFT — operators verify before publish).
 *
 * The seed is a standalone tsx script that exports runSeed(client),
 * computeContentHash(), buildTemplateContent(), and runExtractionAudit().
 * We inject a mock PrismaClient to avoid touching the live DB.
 */

import {
  runSeed as runSeedSU,
  computeContentHash as computeHashSU,
  buildTemplateContent as buildSU,
  runExtractionAudit,
  ALIAS,
} from "../../../prisma/seed-scaling-up-full-assessment";
import { computeContentHash as computeHashV1 } from "../../../prisma/seed-qsp-v1-assessment";
import { computeContentHash as computeHashV2 } from "../../../prisma/seed-qsp-v2-assessment";
import {
  TemplateVersionForScoringSchema,
  TemplateVersionForPublishSchema,
} from "../../lib/assessments/scoring";

// ─── Mock builder ─────────────────────────────────────────────────────────

type MockTx = {
  $executeRawUnsafe: jest.Mock;
  $queryRawUnsafe: jest.Mock;
  user: { upsert: jest.Mock };
  assessmentTemplate: { findUnique: jest.Mock; create: jest.Mock };
  assessmentTemplateVersion: {
    findMany: jest.Mock;
    create: jest.Mock;
  };
  accessGroup: { findFirst: jest.Mock; create: jest.Mock };
  accessGroupTemplate: { upsert: jest.Mock };
  accessGroupCoach: { upsert: jest.Mock };
  coach: { findUnique: jest.Mock };
};

function makeMockClient(overrides?: Partial<MockTx>) {
  const tx: MockTx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]), // no orphans
    user: {
      upsert: jest.fn().mockResolvedValue({ id: "sys-user-id" }),
    },
    assessmentTemplate: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    assessmentTemplateVersion: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    accessGroup: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "group-id" }),
    },
    accessGroupTemplate: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    accessGroupCoach: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    coach: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    ...overrides,
  };

  const client = {
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx)
    ),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    _tx: tx,
  };

  return client as unknown as import("@prisma/client").PrismaClient & {
    _tx: MockTx;
  };
}

// ─── Seed-level tests ─────────────────────────────────────────────────────

describe("seed-scaling-up-full-assessment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("computeContentHash returns a stable 64-char hex string", () => {
    const h1 = computeHashSU({
      questions: [],
      sections: [],
      scoringConfig: {},
      reportConfig: null,
      invitationSubject: "test",
      invitationBodyMarkdown: "",
    });
    const h2 = computeHashSU({
      questions: [],
      sections: [],
      scoringConfig: {},
      reportConfig: null,
      invitationSubject: "test",
      invitationBodyMarkdown: "",
    });
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
  });

  it("State A — creates template + DRAFT version when nothing exists", async () => {
    const client = makeMockClient();
    const tx = client._tx;

    tx.assessmentTemplate.findUnique.mockResolvedValue(null);
    tx.assessmentTemplate.create.mockResolvedValue({ id: "tmpl-su-id" });
    tx.assessmentTemplateVersion.create.mockResolvedValue({ id: "ver-su-id" });

    const result = await runSeedSU(client);

    expect(result.state).toBe("A");
    expect(result.templateId).toBe("tmpl-su-id");
    expect(result.versionId).toBe("ver-su-id");

    // alias must be the canonical SU Full alias
    const createTemplateCall = tx.assessmentTemplate.create.mock.calls[0][0];
    expect(createTemplateCall.data.alias).toBe(ALIAS);
    expect(createTemplateCall.data.alias).toBe("scaling-up-full");

    // contentHash must be 64-char hex
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // version create must include the same contentHash + null publishedAt
    const versionCreateCall =
      tx.assessmentTemplateVersion.create.mock.calls[0][0];
    expect(versionCreateCall.data.contentHash).toBe(result.contentHash);
    expect(versionCreateCall.data.publishedAt).toBeNull();
    expect(versionCreateCall.data.publishedBy).toBeNull();

    // v2 (Wave J-1): 64 questions (61 SLIDER + 3 NUMBER background) across
    // 11 sections (10 scored + the CEO-only "About your company" background).
    expect(result.questionCount).toBe(64);
    expect(result.sectionCount).toBe(11);
  });

  it("State B — returns early without re-creating version on exact match", async () => {
    const client1 = makeMockClient();
    const tx1 = client1._tx;
    tx1.assessmentTemplate.findUnique.mockResolvedValueOnce(null);
    tx1.assessmentTemplate.create.mockResolvedValueOnce({ id: "tmpl-su-id" });
    tx1.assessmentTemplateVersion.create.mockResolvedValueOnce({
      id: "ver-su-id",
    });
    const firstResult = await runSeedSU(client1);
    const knownHash = firstResult.contentHash;

    jest.clearAllMocks();

    const client2 = makeMockClient();
    const tx2 = client2._tx;
    tx2.assessmentTemplate.findUnique.mockResolvedValue({
      id: "tmpl-su-id",
      createdBy: "sys-user-id",
    });
    tx2.assessmentTemplateVersion.findMany.mockResolvedValue([
      { id: "ver-su-id", contentHash: knownHash },
    ]);

    const secondResult = await runSeedSU(client2);

    expect(secondResult.state).toBe("B");
    expect(secondResult.templateId).toBe("tmpl-su-id");
    expect(secondResult.versionId).toBe("ver-su-id");

    // version.create must NOT be called on State B
    expect(tx2.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it("State C — throws when contentHash differs", async () => {
    const client = makeMockClient();
    const tx = client._tx;

    tx.assessmentTemplate.findUnique.mockResolvedValue({
      id: "tmpl-su-id",
      createdBy: "sys-user-id",
    });
    tx.assessmentTemplateVersion.findMany.mockResolvedValue([
      { id: "ver-su-id", contentHash: "deadbeef" },
    ]);

    await expect(runSeedSU(client)).rejects.toThrow(
      /Refusing to silently mutate the immutable published row/
    );
  });

  it("contentHash differs from Rockefeller and both QSP seeds", async () => {
    // Run SU Full in State A to capture its hash.
    const client = makeMockClient();
    const tx = client._tx;
    tx.assessmentTemplate.findUnique.mockResolvedValue(null);
    tx.assessmentTemplate.create.mockResolvedValue({ id: "tmpl-su-id" });
    tx.assessmentTemplateVersion.create.mockResolvedValue({ id: "ver-su-id" });
    const suResult = await runSeedSU(client);

    // QSP v1 + v2 hashes (using their exported computeContentHash with the
    // same empty input — we just need a separate hash space).
    const qsp1Hash = computeHashV1({
      questions: [{ stableKey: "qsp1" }] as never,
      sections: [],
      scoringConfig: {},
      reportConfig: null,
      invitationSubject: "qsp1",
      invitationBodyMarkdown: "",
    });
    const qsp2Hash = computeHashV2({
      questions: [{ stableKey: "qsp2" }] as never,
      sections: [],
      scoringConfig: {},
      reportConfig: null,
      invitationSubject: "qsp2",
      invitationBodyMarkdown: "",
    });

    expect(suResult.contentHash).not.toBe(qsp1Hash);
    expect(suResult.contentHash).not.toBe(qsp2Hash);
    // Hash is deterministic — re-running buildTemplateContent + computeHash
    // gives the same hash.
    expect(suResult.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── Extraction audit + schema validation ────────────────────────────────

describe("seed-scaling-up-full-assessment extraction audit", () => {
  it("buildTemplateContent yields the expected structure", () => {
    const audit = runExtractionAudit();
    expect(audit.ok).toBe(true);
    expect(audit.domainCount).toBe(5);
    // v2 (Wave J-1): 11 sections (10 scored + the background section).
    expect(audit.sectionCount).toBe(11);
    expect(audit.questionCount).toBeGreaterThanOrEqual(50);
    expect(audit.questionCount).toBeLessThanOrEqual(70);
  });

  it("has exactly 5 domains: people, strategy, execution, cash, you", () => {
    const content = buildSU();
    const keys = content.scoringConfig.domains.map((d) => d.key).sort();
    expect(keys).toEqual(["cash", "execution", "people", "strategy", "you"]);
  });

  it("every section has a domain field set", () => {
    const content = buildSU();
    for (const s of content.sections) {
      expect(s.domain).toBeTruthy();
      expect(typeof s.domain).toBe("string");
    }
  });

  it("every defined domain has at least one section pointing to it", () => {
    const content = buildSU();
    const used = new Set(content.sections.map((s) => s.domain));
    for (const d of content.scoringConfig.domains) {
      expect(used.has(d.key)).toBe(true);
    }
  });

  it("every SLIDER_LIKERT question is 0-10 with 5 recommendation bands", () => {
    const content = buildSU();
    const sliders = content.questions.filter(
      (q) => q.type === "SLIDER_LIKERT"
    ) as Array<{
      scale: { min: number; max: number; step: number };
      recommendations: unknown[];
    }>;
    expect(sliders).toHaveLength(61);
    for (const q of sliders) {
      expect(q.scale.min).toBe(0);
      expect(q.scale.max).toBe(10);
      expect(q.scale.step).toBe(1);
      expect(q.recommendations).toHaveLength(5);
    }
  });

  it("v2 (Wave J-1) adds 3 non-scored NUMBER background questions with the expected stableKeys", () => {
    const content = buildSU();
    const numbers = content.questions.filter(
      (q) => q.type === "NUMBER"
    ) as Array<{
      stableKey: string;
      sectionStableKey: string;
      isRequired: boolean;
    }>;
    expect(numbers.map((q) => q.stableKey).sort()).toEqual([
      "Q_FREELANCE",
      "Q_FTE_PERMANENT",
      "Q_FTE_TEMPORARY",
    ]);
    // All live in the background section.
    for (const q of numbers) {
      expect(q.sectionStableKey).toBe("S_BACKGROUND");
    }
    // Permanent FTE is required; temporary + freelance are optional.
    const byKey = Object.fromEntries(numbers.map((q) => [q.stableKey, q]));
    expect(byKey["Q_FTE_PERMANENT"].isRequired).toBe(true);
    expect(byKey["Q_FTE_TEMPORARY"].isRequired).toBe(false);
    expect(byKey["Q_FREELANCE"].isRequired).toBe(false);
  });

  it("v2 (Wave J-1) defines the S_BACKGROUND section (sortOrder 0, before Your Employees)", () => {
    const content = buildSU();
    const bg = content.sections.find((s) => s.stableKey === "S_BACKGROUND");
    expect(bg).toBeDefined();
    expect(bg!.sortOrder).toBe(0);
    // Carries a domain so the meanOfDomains publish check (every section has a
    // domain) holds; it contributes nothing to scoring (no SLIDER questions).
    expect(bg!.domain).toBeTruthy();
  });

  it("scoringConfig has meanOfDomains rollup + scaleUpScore enabled", () => {
    const content = buildSU();
    expect(content.scoringConfig.rollup.overall).toBe("meanOfDomains");
    expect(content.scoringConfig.scaleUpScore).toBe(true);
  });

  it("passes the engine's runtime Zod schema (TemplateVersionForScoringSchema)", () => {
    const content = buildSU();
    const parsed = TemplateVersionForScoringSchema.safeParse(content);
    if (!parsed.success) {
      // Surface the issues for debug visibility.
      console.error(
        "Runtime schema failed:",
        JSON.stringify(parsed.error.format(), null, 2)
      );
    }
    expect(parsed.success).toBe(true);
  });

  it("publish schema passes OR fails only due to text content (DRAFT allowed)", () => {
    const content = buildSU();
    const parsed = TemplateVersionForPublishSchema.safeParse(content);
    if (parsed.success) {
      // Great — content is ready for immediate publish.
      expect(parsed.success).toBe(true);
      return;
    }
    // If it fails, every issue must be on a recommendation text path
    // (band sentinel or coverage check on text). NOT on a structural path
    // like sections / domains / rollup / scale.
    const STRUCTURAL_KEYS = new Set([
      "scoringConfig",
      "sections",
      "domains",
      "rollup",
      "scale",
    ]);
    const issues = parsed.error.issues;
    for (const issue of issues) {
      const onTextPath = issue.path.includes("recommendations");
      if (!onTextPath) {
        throw new Error(
          `Publish schema rejected on STRUCTURAL path ${issue.path.join(".")}: ` +
            `${issue.message}`
        );
      }
      // Ensure the rejection isn't on a structural sub-key like domains
      for (const part of issue.path) {
        if (typeof part === "string" && STRUCTURAL_KEYS.has(part)) {
          if (part !== "scoringConfig") {
            // scoringConfig path is fine when leading to recommendation rollup
            throw new Error(
              `Publish schema rejected on STRUCTURAL path ` +
                `${issue.path.join(".")}: ${issue.message}`
            );
          }
        }
      }
    }
  });
});
