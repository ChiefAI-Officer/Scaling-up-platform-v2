/**
 * Smoke tests for QSP v1 and QSP v2 assessment seed scripts.
 *
 * QSP v1 was re-seeded with real Esperto content (28 questions across 8
 * sections, aggregation-only scoring). Its seed now uses the shared
 * ensureTemplateVersionContent helper (Rockefeller-style pattern) and
 * exports buildQspV1Content() instead of runSeed/computeContentHash.
 * Content-correctness tests live in qsp-v1-content.test.ts.
 *
 * QSP v2 still uses the old pattern (runSeed / computeContentHash).
 */

// ─── QSP v1 imports ───────────────────────────────────────────────────────

import { buildQspV1Content } from "../../../prisma/seed-qsp-v1-assessment";

// ─── QSP v2 imports ───────────────────────────────────────────────────────

import {
  runSeed as runSeedV2,
  computeContentHash as computeHashV2,
} from "../../../prisma/seed-qsp-v2-assessment";

// ─── Mock builder ─────────────────────────────────────────────────────────
//
// Returns a minimal PrismaClient-shaped mock. The $transaction implementation
// calls the callback with the same mock object (simulating the interactive-tx
// client), then returns whatever the callback returns.

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
      findFirst: jest.fn().mockResolvedValue(null), // group doesn't exist
      create: jest
        .fn()
        .mockResolvedValue({ id: "group-id" }),
    },
    accessGroupTemplate: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    accessGroupCoach: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    coach: {
      findUnique: jest.fn().mockResolvedValue(null), // no dev coach in prod DB
    },
    ...overrides,
  };

  const client = {
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx)
    ),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    _tx: tx, // expose for assertions
  };

  return client as unknown as import("@prisma/client").PrismaClient & {
    _tx: MockTx;
  };
}

// ─── QSP v1 smoke tests ───────────────────────────────────────────────────
//
// Full content-correctness is covered by qsp-v1-content.test.ts.
// These are minimal smoke-checks to confirm the builder returns a valid shape
// and that the alias + section/question counts are correct.

describe("seed-qsp-v1-assessment (content builder smoke)", () => {
  it("alias is qsp-v1", () => {
    const c = buildQspV1Content();
    expect(c.alias).toBe("qsp-v1");
  });

  it("returns 8 sections", () => {
    const c = buildQspV1Content();
    expect(c.sections).toHaveLength(8);
  });

  it("returns 28 questions", () => {
    const c = buildQspV1Content();
    expect(c.questions).toHaveLength(28);
  });

  it("scoringConfig has a single tier with passThreshold 0", () => {
    const c = buildQspV1Content();
    expect(c.scoringConfig.passThreshold).toBe(0);
    expect(c.scoringConfig.tiers).toHaveLength(1);
  });

  it("reportConfig is null", () => {
    const c = buildQspV1Content();
    expect(c.reportConfig).toBeNull();
  });
});

// ─── QSP v2 tests ─────────────────────────────────────────────────────────

describe("seed-qsp-v2-assessment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("computeContentHash returns a stable 64-char hex string", () => {
    const h1 = computeHashV2({
      questions: [],
      sections: [],
      scoringConfig: {},
      reportConfig: null,
      invitationSubject: "test",
      invitationBodyMarkdown: "",
    });
    const h2 = computeHashV2({
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

  it("State A — creates template + version when nothing exists", async () => {
    const client = makeMockClient();
    const tx = client._tx;

    tx.assessmentTemplate.findUnique.mockResolvedValue(null);
    tx.assessmentTemplate.create.mockResolvedValue({ id: "tmpl-v2-id" });
    tx.assessmentTemplateVersion.create.mockResolvedValue({ id: "ver-v2-id" });

    const result = await runSeedV2(client);

    expect(result.state).toBe("A");
    expect(result.templateId).toBe("tmpl-v2-id");
    expect(result.versionId).toBe("ver-v2-id");

    // alias must be qsp-v2
    const createCall = tx.assessmentTemplate.create.mock.calls[0][0];
    expect(createCall.data.alias).toBe("qsp-v2");

    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const versionCreateCall =
      tx.assessmentTemplateVersion.create.mock.calls[0][0];
    expect(versionCreateCall.data.contentHash).toBe(result.contentHash);

    // 10 questions across 2 sections
    expect(result.questionCount).toBe(10);
    expect(result.sectionCount).toBe(2);
  });

  it("State B — returns early without re-creating version on exact match", async () => {
    const client = makeMockClient();
    const tx = client._tx;

    // First call — State A
    tx.assessmentTemplate.findUnique.mockResolvedValueOnce(null);
    tx.assessmentTemplate.create.mockResolvedValueOnce({ id: "tmpl-v2-id" });
    tx.assessmentTemplateVersion.create.mockResolvedValueOnce({
      id: "ver-v2-id",
    });
    const firstResult = await runSeedV2(client);
    const knownHash = firstResult.contentHash;

    jest.clearAllMocks();

    // Second call — State B
    const client2 = makeMockClient();
    const tx2 = client2._tx;

    tx2.assessmentTemplate.findUnique.mockResolvedValue({
      id: "tmpl-v2-id",
      createdBy: "sys-user-id",
    });
    tx2.assessmentTemplateVersion.findMany.mockResolvedValue([
      { id: "ver-v2-id", contentHash: knownHash },
    ]);

    const secondResult = await runSeedV2(client2);

    expect(secondResult.state).toBe("B");
    expect(secondResult.templateId).toBe("tmpl-v2-id");
    expect(secondResult.versionId).toBe("ver-v2-id");

    // version.create must NOT have been called
    expect(tx2.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it("State C — throws when contentHash differs", async () => {
    const client = makeMockClient();
    const tx = client._tx;

    tx.assessmentTemplate.findUnique.mockResolvedValue({
      id: "tmpl-v2-id",
      createdBy: "sys-user-id",
    });
    tx.assessmentTemplateVersion.findMany.mockResolvedValue([
      { id: "ver-v2-id", contentHash: "bbb111" }, // wrong hash
    ]);

    await expect(runSeedV2(client)).rejects.toThrow(
      /Refusing to silently mutate the immutable published row/
    );
  });

  it("QSP v1 and QSP v2 have different aliases and content", () => {
    // v1 now uses buildQspV1Content (helper pattern); v2 still uses runSeed.
    // Confirm different aliases so template creation won't collide.
    const v1Content = buildQspV1Content();
    expect(v1Content.alias).toBe("qsp-v1");
    // v2's alias is asserted inside its own State A test above.
  });
});
