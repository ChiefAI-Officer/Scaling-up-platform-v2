/**
 * Tests for ensureTemplateVersionContent() — the version-aware assessment seeder helper.
 * All DB calls are mocked; no real database is touched.
 */

import {
  ensureTemplateVersionContent,
  assertSeedContentIntegrity,
  type SeedContent,
} from "@/lib/assessments/seed-template-version";
import { computeTemplateContentHash } from "@/lib/assessments/template-content-hash";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid SeedContent fixture */
function makeContent(overrides: Partial<SeedContent> = {}): SeedContent {
  return {
    alias: "test-template",
    name: "Test Template",
    description: "A test template",
    invitationSubject: "Welcome",
    invitationBodyMarkdown: "Hello {{name}}",
    language: "en",
    sections: [{ stableKey: "sec1", title: "Section 1" }],
    questions: [
      {
        stableKey: "q1",
        sectionStableKey: "sec1",
        sortOrder: 1,
        type: "SLIDER_LIKERT",
        label: "Q1",
      },
    ],
    scoringConfig: { tiers: [] },
    reportConfig: null,
    aggregationMode: "FULL_VISIBILITY",
    ...overrides,
  };
}

type FakeTxOptions = {
  /** null means template does not exist */
  existingTemplate?: {
    id: string;
    deletedAt: Date | null;
    invitationSubject: string;
    invitationBodyMarkdown: string;
  } | null;
  existingVersions?: Array<{
    id: string;
    versionNumber: number;
    contentHash: string;
    publishedAt: Date | null;
  }>;
};

type CallRecord = {
  method: string;
  args: unknown;
};

function makeTx(opts: FakeTxOptions = {}) {
  const calls: CallRecord[] = [];

  const existingTemplate =
    opts.existingTemplate !== undefined
      ? opts.existingTemplate
      : {
          id: "tmpl-1",
          deletedAt: null,
          invitationSubject: "Welcome",
          invitationBodyMarkdown: "Hello {{name}}",
        };

  const existingVersions = opts.existingVersions ?? [];

  let nextVersionId = 100;

  const tx = {
    assessmentTemplate: {
      findUnique: jest.fn(async (...args: unknown[]) => {
        calls.push({ method: "assessmentTemplate.findUnique", args });
        return existingTemplate;
      }),
      create: jest.fn(async (args: unknown) => {
        calls.push({ method: "assessmentTemplate.create", args });
        return { id: "tmpl-new", ...((args as { data: object }).data) };
      }),
      update: jest.fn(async (args: unknown) => {
        calls.push({ method: "assessmentTemplate.update", args });
        return {};
      }),
    },
    assessmentTemplateVersion: {
      findMany: jest.fn(async () => {
        calls.push({ method: "assessmentTemplateVersion.findMany", args: {} });
        return existingVersions;
      }),
      create: jest.fn(async (args: unknown) => {
        calls.push({ method: "assessmentTemplateVersion.create", args });
        const id = `ver-${nextVersionId++}`;
        return { id, ...((args as { data: object }).data) };
      }),
    },
    auditLog: {
      create: jest.fn(async (args: unknown) => {
        calls.push({ method: "auditLog.create", args });
        return { id: "audit-1" };
      }),
    },
    _calls: calls,
  };

  return tx;
}

// ---------------------------------------------------------------------------
// assertSeedContentIntegrity
// ---------------------------------------------------------------------------

describe("assertSeedContentIntegrity", () => {
  it("passes for valid content", () => {
    expect(() => assertSeedContentIntegrity(makeContent())).not.toThrow();
  });

  it("throws on duplicate section stableKeys", () => {
    const c = makeContent({
      sections: [
        { stableKey: "sec1", title: "S1" },
        { stableKey: "sec1", title: "S1 dup" },
      ],
    });
    expect(() => assertSeedContentIntegrity(c)).toThrow(/duplicate section stableKey/i);
  });

  it("throws on duplicate question stableKeys", () => {
    const c = makeContent({
      questions: [
        { stableKey: "q1", sectionStableKey: "sec1", sortOrder: 1, type: "SLIDER_LIKERT", label: "Q1" },
        { stableKey: "q1", sectionStableKey: "sec1", sortOrder: 2, type: "SLIDER_LIKERT", label: "Q1 dup" },
      ],
    });
    expect(() => assertSeedContentIntegrity(c)).toThrow(/duplicate question stableKey/i);
  });

  it("throws on duplicate question sortOrder", () => {
    const c = makeContent({
      questions: [
        { stableKey: "q1", sectionStableKey: "sec1", sortOrder: 1, type: "SLIDER_LIKERT", label: "Q1" },
        { stableKey: "q2", sectionStableKey: "sec1", sortOrder: 1, type: "SLIDER_LIKERT", label: "Q2" },
      ],
    });
    expect(() => assertSeedContentIntegrity(c)).toThrow(/duplicate.*sortOrder/i);
  });

  it("throws when sectionStableKey does not resolve to any section", () => {
    const c = makeContent({
      questions: [
        { stableKey: "q1", sectionStableKey: "sec-missing", sortOrder: 1, type: "SLIDER_LIKERT", label: "Q1" },
      ],
    });
    expect(() => assertSeedContentIntegrity(c)).toThrow(/sectionStableKey.*not found|unknown sectionStableKey/i);
  });

  it("throws on duplicate option keys within a MULTI_CHOICE question", () => {
    const c = makeContent({
      questions: [
        {
          stableKey: "q1",
          sectionStableKey: "sec1",
          sortOrder: 1,
          type: "MULTI_CHOICE",
          label: "Q1",
          options: [
            { key: "opt-a", label: "Option A" },
            { key: "opt-a", label: "Option A dup" },
          ],
        },
      ],
    });
    expect(() => assertSeedContentIntegrity(c)).toThrow(/duplicate option key/i);
  });

  it("does NOT treat multiple null sortOrder or null stableKey as duplicates", () => {
    // Multiple questions with sortOrder == null (or missing) must be skipped
    // by the dedupe check and NOT throw. Likewise for null/missing stableKey.
    const c = makeContent({
      questions: [
        // Both have no sortOrder and no stableKey — should be skipped by == null guards
        { sectionStableKey: "sec1", type: "TEXT", label: "Q A" },
        { sectionStableKey: "sec1", type: "TEXT", label: "Q B" },
      ],
    });
    expect(() => assertSeedContentIntegrity(c)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Core behavior
// ---------------------------------------------------------------------------

describe("ensureTemplateVersionContent", () => {
  const SYSTEM_USER = "sys-user-1";

  it("creates version 1 when template does not exist", async () => {
    const c = makeContent();
    const tx = makeTx({ existingTemplate: null, existingVersions: [] });

    const result = await ensureTemplateVersionContent(tx as never, SYSTEM_USER, c);

    expect(result.action).toBe("created");
    expect(result.versionNumber).toBe(1);
    expect(result.contentHash).toBeTruthy();
    // Template must be created
    expect(tx.assessmentTemplate.create).toHaveBeenCalledTimes(1);
    // Version must be created with publishedAt = null (DRAFT)
    const versionCreateCall = tx.assessmentTemplateVersion.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(versionCreateCall.data.publishedAt).toBeNull();
    expect(versionCreateCall.data.versionNumber).toBe(1);
  });

  it("appends versionNumber 2 as DRAFT when latest version has a different hash", async () => {
    const c = makeContent();
    // Hash for stored invitation values (same as seed values here)
    const differentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const existingTemplate = {
      id: "tmpl-1",
      deletedAt: null,
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    };
    const existingVersions = [
      { id: "ver-1", versionNumber: 1, contentHash: differentHash, publishedAt: new Date("2024-01-01") },
    ];

    const tx = makeTx({ existingTemplate, existingVersions });
    const result = await ensureTemplateVersionContent(tx as never, SYSTEM_USER, c);

    expect(result.action).toBe("created");
    expect(result.versionNumber).toBe(2);
    const versionCreateCall = tx.assessmentTemplateVersion.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(versionCreateCall.data.publishedAt).toBeNull();
    expect(versionCreateCall.data.versionNumber).toBe(2);
  });

  it("no-ops only when the LATEST version matches the hash", async () => {
    const c = makeContent();
    const existingTemplate = {
      id: "tmpl-1",
      deletedAt: null,
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    };
    // Compute the real hash that would be generated
    const realHash = computeTemplateContentHash({
      questions: c.questions,
      sections: c.sections,
      scoringConfig: c.scoringConfig,
      reportConfig: c.reportConfig ?? null,
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    });
    const existingVersions = [
      { id: "ver-1", versionNumber: 1, contentHash: realHash, publishedAt: new Date("2024-01-01") },
    ];

    const tx = makeTx({ existingTemplate, existingVersions });
    const result = await ensureTemplateVersionContent(tx as never, SYSTEM_USER, c);

    expect(result.action).toBe("noop");
    expect(result.versionNumber).toBe(1);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("no-ops when the latest version is an UNPUBLISHED draft whose hash matches", async () => {
    const c = makeContent();
    const existingTemplate = {
      id: "tmpl-1",
      deletedAt: null,
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    };
    const realHash = computeTemplateContentHash({
      questions: c.questions,
      sections: c.sections,
      scoringConfig: c.scoringConfig,
      reportConfig: c.reportConfig ?? null,
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    });
    // Latest is an UNPUBLISHED draft (publishedAt: null) but its hash matches
    const existingVersions = [
      { id: "ver-2", versionNumber: 2, contentHash: realHash, publishedAt: null },
      { id: "ver-1", versionNumber: 1, contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", publishedAt: new Date("2024-01-01") },
    ];

    const tx = makeTx({ existingTemplate, existingVersions });
    const result = await ensureTemplateVersionContent(tx as never, SYSTEM_USER, c);

    // Hash matches → no-op regardless of draft status
    expect(result.action).toBe("noop");
    expect(result.versionNumber).toBe(2);
    expect(tx.assessmentTemplateVersion.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("still appends v4 when only an abandoned lower version (v1) matches but latest (v3) differs", async () => {
    const c = makeContent();
    const existingTemplate = {
      id: "tmpl-1",
      deletedAt: null,
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    };
    const realHash = computeTemplateContentHash({
      questions: c.questions,
      sections: c.sections,
      scoringConfig: c.scoringConfig,
      reportConfig: c.reportConfig ?? null,
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    });
    const differentHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    // v1 matches our hash, v2 and v3 are different (published)
    const existingVersions = [
      // findMany returns desc by versionNumber, so latest first
      { id: "ver-3", versionNumber: 3, contentHash: differentHash, publishedAt: new Date("2024-03-01") },
      { id: "ver-2", versionNumber: 2, contentHash: differentHash, publishedAt: new Date("2024-02-01") },
      { id: "ver-1", versionNumber: 1, contentHash: realHash, publishedAt: new Date("2024-01-01") },
    ];

    const tx = makeTx({ existingTemplate, existingVersions });
    const result = await ensureTemplateVersionContent(tx as never, SYSTEM_USER, c);

    // Latest (v3) differs from our hash, so must append v4
    expect(result.action).toBe("created");
    expect(result.versionNumber).toBe(4);
  });

  it("fails closed when latest is unpublished DRAFT with differing hash and no forceSupersedeDraft", async () => {
    const c = makeContent();
    const existingTemplate = {
      id: "tmpl-1",
      deletedAt: null,
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    };
    const differentHash = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    const existingVersions = [
      // Latest is DRAFT (publishedAt null) with different hash
      { id: "ver-2", versionNumber: 2, contentHash: differentHash, publishedAt: null },
      { id: "ver-1", versionNumber: 1, contentHash: differentHash, publishedAt: new Date("2024-01-01") },
    ];

    const tx = makeTx({ existingTemplate, existingVersions });

    await expect(
      ensureTemplateVersionContent(tx as never, SYSTEM_USER, c)
    ).rejects.toThrow(/unpublished draft/i);
  });

  it("appends when forceSupersedeDraft is true and latest is an unpublished DRAFT with differing hash", async () => {
    const c = makeContent();
    const existingTemplate = {
      id: "tmpl-1",
      deletedAt: null,
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    };
    const differentHash = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
    const existingVersions = [
      { id: "ver-1", versionNumber: 1, contentHash: differentHash, publishedAt: null },
    ];

    const tx = makeTx({ existingTemplate, existingVersions });
    const result = await ensureTemplateVersionContent(
      tx as never,
      SYSTEM_USER,
      c,
      { forceSupersedeDraft: true }
    );

    expect(result.action).toBe("created");
    expect(result.versionNumber).toBe(2);
  });

  it("throws when template has deletedAt set", async () => {
    const c = makeContent();
    const existingTemplate = {
      id: "tmpl-1",
      deletedAt: new Date("2024-01-01"),
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    };

    const tx = makeTx({ existingTemplate });

    await expect(
      ensureTemplateVersionContent(tx as never, SYSTEM_USER, c)
    ).rejects.toThrow(/soft.deleted|deleted/i);
  });

  it("does NOT call assessmentTemplate.update for an existing template and hashes against STORED invitation", async () => {
    // The stored template has DIFFERENT invitation values than the seed content.
    // The hash must be computed using STORED values (so it matches what's in DB).
    const c = makeContent({
      invitationSubject: "New Subject from Seed",
      invitationBodyMarkdown: "New body from seed",
    });
    const storedInvSubject = "Original Subject";
    const storedInvBody = "Original body";
    const existingTemplate = {
      id: "tmpl-1",
      deletedAt: null,
      invitationSubject: storedInvSubject,
      invitationBodyMarkdown: storedInvBody,
    };
    // Hash using STORED invitation (not seed's). This is what the DB has.
    const expectedHash = computeTemplateContentHash({
      questions: c.questions,
      sections: c.sections,
      scoringConfig: c.scoringConfig,
      reportConfig: c.reportConfig ?? null,
      invitationSubject: storedInvSubject,
      invitationBodyMarkdown: storedInvBody,
    });
    // Existing version has a different hash → will append
    const differentHash = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const existingVersions = [
      { id: "ver-1", versionNumber: 1, contentHash: differentHash, publishedAt: new Date("2024-01-01") },
    ];

    const tx = makeTx({ existingTemplate, existingVersions });
    const result = await ensureTemplateVersionContent(tx as never, SYSTEM_USER, c);

    // Must NOT update the template row's invitation fields
    expect(tx.assessmentTemplate.update).not.toHaveBeenCalled();
    // Hash on the created version must match the STORED invitation hash
    expect(result.contentHash).toBe(expectedHash);
  });

  it("writes an audit row on append", async () => {
    const c = makeContent();
    const differentHash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const existingTemplate = {
      id: "tmpl-1",
      deletedAt: null,
      invitationSubject: c.invitationSubject,
      invitationBodyMarkdown: c.invitationBodyMarkdown,
    };
    const existingVersions = [
      { id: "ver-1", versionNumber: 1, contentHash: differentHash, publishedAt: new Date("2024-01-01") },
    ];

    const tx = makeTx({ existingTemplate, existingVersions });
    await ensureTemplateVersionContent(tx as never, SYSTEM_USER, c, { seedRunId: "run-abc" });

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = tx.auditLog.create.mock.calls[0][0] as {
      data: {
        entityType: string;
        action: string;
        performedBy: string;
        changes: string;
      };
    };
    expect(auditCall.data.entityType).toBe("AssessmentTemplateVersion");
    expect(auditCall.data.action).toBe("ASSESSMENT_VERSION_SEEDED");
    expect(auditCall.data.performedBy).toBe(SYSTEM_USER);
    // changes should encode metadata including seedRunId
    const changes = JSON.parse(auditCall.data.changes);
    expect(changes.seedRunId).toBe("run-abc");
    expect(changes.alias).toBe(c.alias);
    expect(changes.versionNumber).toBe(2);
    expect(changes.previousLatest).toBe(1);
  });
});
