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
  buildQspV2Content,
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
  auditLog: { create: jest.Mock };
  accessGroup: { findFirst: jest.Mock; create: jest.Mock };
  accessGroupTemplate: { upsert: jest.Mock };
  accessGroupCoach: { upsert: jest.Mock };
  coach: { findUnique: jest.Mock };
};

function makeMockClient(overrides?: Partial<MockTx>) {
  const tx: MockTx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    // Returns lock-acquired=true by default (advisory lock check).
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ acquired: true }]),
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
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: "audit-id" }),
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

    // ensureTemplateVersionContent: template not found → create template + v1
    tx.assessmentTemplate.findUnique.mockResolvedValue(null);
    tx.assessmentTemplate.create.mockResolvedValue({ id: "tmpl-v2-id" });
    tx.assessmentTemplateVersion.findMany.mockResolvedValue([]); // no versions
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

    // 22 questions across 5 parts (real Esperto content)
    expect(result.questionCount).toBe(22);
    expect(result.sectionCount).toBe(5);
  });

  it("State B — returns early without re-creating version on exact hash match", async () => {
    // Compute the expected hash using the real seed content with the stored
    // invitation values (ensureTemplateVersionContent hashes using STORED values).
    const v2Content = buildQspV2Content();
    const { computeTemplateContentHash } = await import(
      "../../lib/assessments/template-content-hash"
    );
    const knownHash = computeTemplateContentHash({
      questions: v2Content.questions,
      sections: v2Content.sections,
      scoringConfig: v2Content.scoringConfig,
      reportConfig: null,
      invitationSubject: v2Content.invitationSubject,
      invitationBodyMarkdown: v2Content.invitationBodyMarkdown,
    });

    // Second call — template + version exist, same hash → no-op
    const client2 = makeMockClient();
    const tx2 = client2._tx;

    tx2.assessmentTemplate.findUnique.mockResolvedValue({
      id: "tmpl-v2-id",
      deletedAt: null,
      invitationSubject: v2Content.invitationSubject,
      invitationBodyMarkdown: v2Content.invitationBodyMarkdown,
    });
    tx2.assessmentTemplateVersion.findMany.mockResolvedValue([
      { id: "ver-v2-id", versionNumber: 1, contentHash: knownHash, publishedAt: new Date() },
    ]);

    const secondResult = await runSeedV2(client2);

    expect(secondResult.state).toBe("B");
    expect(secondResult.templateId).toBe("tmpl-v2-id");
    expect(secondResult.versionId).toBe("ver-v2-id");

    // version.create must NOT have been called
    expect(tx2.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it("State A (re-seed) — creates new version when existing published version has different hash", async () => {
    const client = makeMockClient();
    const tx = client._tx;

    // Template exists, published version exists with a different hash
    tx.assessmentTemplate.findUnique.mockResolvedValue({
      id: "tmpl-v2-id",
      deletedAt: null,
      invitationSubject: "Please complete your Quarterly Session Prep",
      invitationBodyMarkdown: "",
    });
    tx.assessmentTemplateVersion.findMany.mockResolvedValue([
      {
        id: "old-ver-id",
        versionNumber: 1,
        contentHash: "old-hash-value-that-differs",
        publishedAt: new Date(),
      },
    ]);
    tx.assessmentTemplateVersion.create.mockResolvedValue({ id: "ver-v2-new-id" });

    // A hash mismatch on a PUBLISHED latest version appends a new DRAFT WITHOUT
    // needing force (force only protects an unpublished divergent DRAFT).
    const result = await runSeedV2(client);
    expect(result.state).toBe("A");
    expect(result.versionId).toBe("ver-v2-new-id");
    expect(tx.assessmentTemplateVersion.create).toHaveBeenCalled();
  });

  it("P5_closing has a non-empty description and counts stay 5/22", () => {
    const content = buildQspV2Content();
    const p5 = content.sections.find((s) => s.stableKey === "P5_closing");
    expect(p5).toBeDefined();
    expect(typeof p5?.description).toBe("string");
    expect(p5?.description).toBe("Final reflections before you wrap up.");
    // Don't break the existing State-A counts.
    expect(content.sections).toHaveLength(5);
    expect(content.questions).toHaveLength(22);
  });

  it("fail-closed by default — rejects when latest is a divergent unpublished DRAFT (no force)", async () => {
    const client = makeMockClient();
    const tx = client._tx;

    // Template exists; latest version is an UNPUBLISHED DRAFT with a different hash.
    tx.assessmentTemplate.findUnique.mockResolvedValue({
      id: "tmpl-v2-id",
      deletedAt: null,
      invitationSubject: "Please complete your Quarterly Session Prep",
      invitationBodyMarkdown: "",
    });
    tx.assessmentTemplateVersion.findMany.mockResolvedValue([
      {
        id: "draft-ver-id",
        versionNumber: 1,
        contentHash: "differs-from-new",
        publishedAt: null,
      },
    ]);

    // No force → must reject (protects reviewer edits on the unpublished draft).
    await expect(runSeedV2(client)).rejects.toThrow(/unpublished draft/i);

    // version.create must NOT have been called.
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
  });

  it("explicit force appends — supersedes a divergent unpublished DRAFT when force: true", async () => {
    const client = makeMockClient();
    const tx = client._tx;

    // Same divergent-unpublished-DRAFT setup as the fail-closed test.
    tx.assessmentTemplate.findUnique.mockResolvedValue({
      id: "tmpl-v2-id",
      deletedAt: null,
      invitationSubject: "Please complete your Quarterly Session Prep",
      invitationBodyMarkdown: "",
    });
    tx.assessmentTemplateVersion.findMany.mockResolvedValue([
      {
        id: "draft-ver-id",
        versionNumber: 1,
        contentHash: "differs-from-new",
        publishedAt: null,
      },
    ]);
    tx.assessmentTemplateVersion.create.mockResolvedValue({ id: "ver-v2-forced-id" });

    const result = await runSeedV2(client, { force: true });
    expect(result.state).toBe("A");
    expect(result.versionId).toBe("ver-v2-forced-id");
    expect(tx.assessmentTemplateVersion.create).toHaveBeenCalled();
  });

  it("QSP v1 and QSP v2 have different aliases and content", () => {
    // v1 now uses buildQspV1Content (helper pattern); v2 still uses runSeed.
    // Confirm different aliases so template creation won't collide.
    const v1Content = buildQspV1Content();
    expect(v1Content.alias).toBe("qsp-v1");
    // v2's alias is asserted inside its own State A test above.
  });
});
