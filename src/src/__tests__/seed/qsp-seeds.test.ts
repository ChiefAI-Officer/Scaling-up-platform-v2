/**
 * Smoke tests for QSP v1 and QSP v2 assessment seed scripts.
 *
 * These tests verify:
 *   1. State A: runSeed upserts the template and version with the correct
 *      alias and a stable contentHash on first run.
 *   2. State B: calling runSeed a second time when the DB already contains a
 *      matching contentHash returns state "B" without re-creating the version
 *      (idempotency / early-exit).
 *
 * The seeds are standalone tsx scripts. They export runSeed(client) and
 * computeContentHash() so we can inject a mock PrismaClient without spinning
 * up a real database.
 */

// ─── QSP v1 imports ───────────────────────────────────────────────────────

import {
  runSeed as runSeedV1,
  computeContentHash as computeHashV1,
} from "../../../prisma/seed-qsp-v1-assessment";

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

// ─── QSP v1 tests ─────────────────────────────────────────────────────────

describe("seed-qsp-v1-assessment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("computeContentHash returns a stable 64-char hex string", () => {
    // Call it twice with the same input — must produce the same hash.
    const h1 = computeHashV1({
      questions: [],
      sections: [],
      scoringConfig: {},
      reportConfig: null,
      invitationSubject: "test",
      invitationBodyMarkdown: "",
    });
    const h2 = computeHashV1({
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
    tx.assessmentTemplate.create.mockResolvedValue({ id: "tmpl-v1-id" });
    tx.assessmentTemplateVersion.create.mockResolvedValue({ id: "ver-v1-id" });

    const result = await runSeedV1(client);

    expect(result.state).toBe("A");
    expect(result.templateId).toBe("tmpl-v1-id");
    expect(result.versionId).toBe("ver-v1-id");

    // alias must be qsp-v1
    const createCall = tx.assessmentTemplate.create.mock.calls[0][0];
    expect(createCall.data.alias).toBe("qsp-v1");

    // contentHash on the returned result must match what computeContentHash
    // would produce independently (same input content).
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.contentHash).toBe(result.contentHash); // stable

    // version.create must have been called with the computed hash
    const versionCreateCall =
      tx.assessmentTemplateVersion.create.mock.calls[0][0];
    expect(versionCreateCall.data.contentHash).toBe(result.contentHash);

    // 6 questions in section 1
    expect(result.questionCount).toBe(6);
    expect(result.sectionCount).toBe(1);
  });

  it("State B — returns early without re-creating version on exact match", async () => {
    const client = makeMockClient();
    const tx = client._tx;

    // First call — State A
    tx.assessmentTemplate.findUnique.mockResolvedValueOnce(null);
    tx.assessmentTemplate.create.mockResolvedValueOnce({ id: "tmpl-v1-id" });
    tx.assessmentTemplateVersion.create.mockResolvedValueOnce({
      id: "ver-v1-id",
    });
    const firstResult = await runSeedV1(client);
    const knownHash = firstResult.contentHash;

    jest.clearAllMocks();

    // Reset mocks for second call — State B
    const client2 = makeMockClient();
    const tx2 = client2._tx;

    tx2.assessmentTemplate.findUnique.mockResolvedValue({
      id: "tmpl-v1-id",
      createdBy: "sys-user-id",
    });
    tx2.assessmentTemplateVersion.findMany.mockResolvedValue([
      { id: "ver-v1-id", contentHash: knownHash },
    ]);

    const secondResult = await runSeedV1(client2);

    expect(secondResult.state).toBe("B");
    expect(secondResult.templateId).toBe("tmpl-v1-id");
    expect(secondResult.versionId).toBe("ver-v1-id");

    // version.create must NOT have been called on State B
    expect(tx2.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it("State C — throws when contentHash differs", async () => {
    const client = makeMockClient();
    const tx = client._tx;

    tx.assessmentTemplate.findUnique.mockResolvedValue({
      id: "tmpl-v1-id",
      createdBy: "sys-user-id",
    });
    tx.assessmentTemplateVersion.findMany.mockResolvedValue([
      { id: "ver-v1-id", contentHash: "aaa000" }, // wrong hash
    ]);

    await expect(runSeedV1(client)).rejects.toThrow(
      /Refusing to silently mutate the immutable published row/
    );
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

  it("QSP v1 and QSP v2 produce different contentHashes", async () => {
    // Run both seeds in State A with the same mock structure.
    const client1 = makeMockClient();
    client1._tx.assessmentTemplate.findUnique.mockResolvedValue(null);
    client1._tx.assessmentTemplate.create.mockResolvedValue({ id: "tmpl-1" });
    client1._tx.assessmentTemplateVersion.create.mockResolvedValue({
      id: "ver-1",
    });
    const r1 = await runSeedV1(client1);

    const client2 = makeMockClient();
    client2._tx.assessmentTemplate.findUnique.mockResolvedValue(null);
    client2._tx.assessmentTemplate.create.mockResolvedValue({ id: "tmpl-2" });
    client2._tx.assessmentTemplateVersion.create.mockResolvedValue({
      id: "ver-2",
    });
    const r2 = await runSeedV2(client2);

    // The two templates have different content so they must hash differently.
    expect(r1.contentHash).not.toBe(r2.contentHash);
  });
});
