/**
 * Version-aware assessment seeder helper.
 *
 * `ensureTemplateVersionContent` is the foundation for all 5 assessment seed
 * scripts. It appends a new DRAFT `AssessmentTemplateVersion` (vN+1) when
 * content changes, and no-ops on the latest matching version.
 *
 * Key invariants enforced by this module:
 * - Invitation subject/body are TEMPLATE-level (live campaign emails). They
 *   are NEVER updated on an existing template row.
 * - The content hash always reflects STORED invitation values for an existing
 *   template (so the hash matches what the admin's UI computed).
 * - The latest unpublished DRAFT is fail-closed: you must pass
 *   `forceSupersedeDraft: true` to overwrite reviewer edits.
 * - An audit row is written in the SAME transaction on every append.
 */

import { computeTemplateContentHash } from "./template-content-hash";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SeedContent {
  alias: string;
  name: string;
  description?: string;
  invitationSubject: string;
  invitationBodyMarkdown: string;
  language: string;
  sections: unknown[];
  questions: unknown[];
  scoringConfig: unknown;
  reportConfig?: unknown;
  aggregationMode?: string;
}

export interface SeedResult {
  action: "created" | "noop";
  templateId: string;
  versionId: string;
  versionNumber: number;
  contentHash: string;
}

export interface SeedOptions {
  forceSupersedeDraft?: boolean;
  seedRunId?: string;
}

// ---------------------------------------------------------------------------
// Minimal Prisma transaction client shape (duck-typed for testability)
// ---------------------------------------------------------------------------

interface PrismaTx {
  assessmentTemplate: {
    findUnique(args: {
      where: { alias: string };
      select: { id: true; deletedAt: true; invitationSubject: true; invitationBodyMarkdown: true };
    }): Promise<{
      id: string;
      deletedAt: Date | null;
      invitationSubject: string;
      invitationBodyMarkdown: string;
    } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  assessmentTemplateVersion: {
    findMany(args: {
      where: { templateId: string; language: string };
      orderBy: { versionNumber: "desc" };
      select: { id: true; versionNumber: true; contentHash: true; publishedAt: true };
    }): Promise<
      Array<{
        id: string;
        versionNumber: number;
        contentHash: string;
        publishedAt: Date | null;
      }>
    >;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

// ---------------------------------------------------------------------------
// assertSeedContentIntegrity
// ---------------------------------------------------------------------------

/**
 * Validate seed content before touching the DB. Throws with a descriptive
 * message on the first integrity violation found.
 */
export function assertSeedContentIntegrity(c: SeedContent): void {
  if (!Array.isArray(c.sections)) throw new Error("assertSeedContentIntegrity: sections must be an array");
  if (!Array.isArray(c.questions)) throw new Error("assertSeedContentIntegrity: questions must be an array");

  // 1. Duplicate section stableKeys
  const sectionKeys = (c.sections as Array<{ stableKey?: string }>).map((s) => s.stableKey);
  const seenSectionKeys = new Set<string>();
  for (const key of sectionKeys) {
    if (key == null) continue;
    if (seenSectionKeys.has(key)) {
      throw new Error(`assertSeedContentIntegrity: duplicate section stableKey "${key}"`);
    }
    seenSectionKeys.add(key);
  }

  const questions = c.questions as Array<{
    stableKey?: string;
    sectionStableKey?: string;
    sortOrder?: number;
    type?: string;
    options?: Array<{ key?: string }>;
  }>;

  // 2. Duplicate question stableKeys
  const seenQuestionKeys = new Set<string>();
  for (const q of questions) {
    if (q.stableKey == null) continue;
    if (seenQuestionKeys.has(q.stableKey)) {
      throw new Error(`assertSeedContentIntegrity: duplicate question stableKey "${q.stableKey}"`);
    }
    seenQuestionKeys.add(q.stableKey);
  }

  // 3. Duplicate question sortOrder
  const seenSortOrders = new Set<number>();
  for (const q of questions) {
    if (q.sortOrder == null) continue;
    if (seenSortOrders.has(q.sortOrder)) {
      throw new Error(`assertSeedContentIntegrity: duplicate question sortOrder ${q.sortOrder}`);
    }
    seenSortOrders.add(q.sortOrder);
  }

  // 4. sectionStableKey must resolve to an existing section
  for (const q of questions) {
    if (q.sectionStableKey == null) continue;
    if (!seenSectionKeys.has(q.sectionStableKey)) {
      throw new Error(
        `assertSeedContentIntegrity: question "${q.stableKey ?? "(no stableKey)"}" has unknown sectionStableKey "${q.sectionStableKey}" — not found in sections`
      );
    }
  }

  // 5. Duplicate option keys within a MULTI_CHOICE question
  for (const q of questions) {
    if (q.type !== "MULTI_CHOICE" || !Array.isArray(q.options)) continue;
    const seenOptionKeys = new Set<string>();
    for (const opt of q.options) {
      if (opt.key == null) continue;
      if (seenOptionKeys.has(opt.key)) {
        throw new Error(
          `assertSeedContentIntegrity: duplicate option key "${opt.key}" in MULTI_CHOICE question "${q.stableKey ?? "(no stableKey)"}"`
        );
      }
      seenOptionKeys.add(opt.key);
    }
  }
}

// ---------------------------------------------------------------------------
// ensureTemplateVersionContent
// ---------------------------------------------------------------------------

export async function ensureTemplateVersionContent(
  tx: PrismaTx,
  systemUserId: string,
  c: SeedContent,
  opts: SeedOptions = {}
): Promise<SeedResult> {
  // Step 0: integrity guard first
  assertSeedContentIntegrity(c);

  // Step 1: look up the template by alias
  const existing = await tx.assessmentTemplate.findUnique({
    where: { alias: c.alias },
    select: { id: true, deletedAt: true, invitationSubject: true, invitationBodyMarkdown: true },
  });

  if (existing !== null && existing.deletedAt !== null) {
    throw new Error(
      `ensureTemplateVersionContent: template "${c.alias}" is soft-deleted (deletedAt=${existing.deletedAt.toISOString()}). Refusing to append versions to a deleted template.`
    );
  }

  // Step 2: get or create the template
  let templateId: string;
  let hashSubject: string;
  let hashBody: string;

  if (existing === null) {
    // Create the template with seed's invitation values
    const created = await tx.assessmentTemplate.create({
      data: {
        alias: c.alias,
        name: c.name,
        description: c.description ?? null,
        invitationSubject: c.invitationSubject,
        invitationBodyMarkdown: c.invitationBodyMarkdown,
        aggregationMode: c.aggregationMode ?? "FULL_VISIBILITY",
        createdBy: systemUserId,
      },
    });
    templateId = created.id;
    // For a newly created template, hash uses seed's invitation values
    hashSubject = c.invitationSubject;
    hashBody = c.invitationBodyMarkdown;
  } else {
    templateId = existing.id;
    // CRITICAL: hash using STORED invitation values, not the seed's
    // This ensures the hash matches what the admin UI computed, and
    // we never silently update live campaign email content.
    hashSubject = existing.invitationSubject;
    hashBody = existing.invitationBodyMarkdown;
  }

  // Step 3: compute content hash
  const contentHash = computeTemplateContentHash({
    questions: c.questions,
    sections: c.sections,
    scoringConfig: c.scoringConfig,
    reportConfig: c.reportConfig ?? null,
    invitationSubject: hashSubject,
    invitationBodyMarkdown: hashBody,
  });

  // Step 4: load existing versions (desc by versionNumber)
  const versions = await tx.assessmentTemplateVersion.findMany({
    where: { templateId, language: c.language },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true, contentHash: true, publishedAt: true },
  });

  const latest = versions[0] ?? null;

  // Step 5: decide what to do
  if (latest !== null && latest.contentHash === contentHash) {
    // No-op — latest already matches
    return {
      action: "noop",
      templateId,
      versionId: latest.id,
      versionNumber: latest.versionNumber,
      contentHash,
    };
  }

  if (
    latest !== null &&
    latest.publishedAt === null &&
    latest.contentHash !== contentHash &&
    !opts.forceSupersedeDraft
  ) {
    throw new Error(
      `ensureTemplateVersionContent: template "${c.alias}" has an unpublished draft version ${latest.versionNumber} with a different hash. This may contain reviewer edits. Pass forceSupersedeDraft: true to override.`
    );
  }

  // Step 6: append new DRAFT version
  const nextVersionNumber = latest !== null ? latest.versionNumber + 1 : 1;

  const newVersion = await tx.assessmentTemplateVersion.create({
    data: {
      templateId,
      versionNumber: nextVersionNumber,
      language: c.language,
      questions: c.questions as object,
      sections: c.sections as object,
      scoringConfig: c.scoringConfig as object,
      reportConfig: (c.reportConfig ?? null) as object | null,
      contentHash,
      publishedAt: null,
      publishedBy: null,
    },
  });

  // Step 7: write audit row in the SAME transaction
  await tx.auditLog.create({
    data: {
      entityType: "AssessmentTemplateVersion",
      entityId: newVersion.id,
      action: "ASSESSMENT_VERSION_SEEDED",
      performedBy: systemUserId,
      changes: JSON.stringify({
        alias: c.alias,
        versionNumber: nextVersionNumber,
        previousLatest: latest?.versionNumber ?? null,
        contentHash,
        seedRunId: opts.seedRunId ?? null,
      }),
    },
  });

  return {
    action: "created",
    templateId,
    versionId: newVersion.id,
    versionNumber: nextVersionNumber,
    contentHash,
  };
}
