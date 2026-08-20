import {
  activePublishedWhere,
  DEFAULT_TEMPLATE_LANGUAGE,
} from "@/lib/assessments/active-version";
import {
  buildPhaseRecommendations,
  SU_FULL_PHASE_FEEDBACK_SOURCE_ID,
} from "@/lib/assessments/su-full-phase-feedback-catalogue";
import { CURRENT_GROWTH_PHASE_BANDS } from "@/lib/assessments/su-full-phase";
import { computeTemplateContentHash } from "@/lib/assessments/template-content-hash";
import { getPublishValidationIssues } from "@/lib/assessments/scoring";
import {
  isPrivilegedRole,
  normalizeRole,
} from "@/lib/auth/access-control";

const TEMPLATE_ALIAS = "scaling-up-full" as const;
const EXPECTED_QUESTION_COUNT = 61;
const EXPECTED_PHASE_BAND_RECORD_COUNT = 1_220;
const DRAFT_AUDIT_ACTION = "SU_FULL_PHASE_FEEDBACK_DRAFT_CREATED";
const PUBLISH_AUDIT_ACTION = "SU_FULL_PHASE_FEEDBACK_DRAFT_PUBLISHED";
const SERIALIZABLE_TRANSACTION_OPTIONS = {
  isolationLevel: "Serializable" as const,
  maxWait: 10_000,
  timeout: 55_000,
};
const MAX_SERIALIZABLE_ATTEMPTS = 2;
const SERIALIZATION_CONFLICT_CODES = new Set(["P2034", "40001"]);

export const SU_FULL_PHASE_FEEDBACK_BOUNDARIES = CURRENT_GROWTH_PHASE_BANDS.map(
  (band) => ({
    phase: band.number,
    name: band.name,
    minFte: band.min,
    maxFte: band.max,
  }),
);

type QuestionRecord = Record<string, unknown> & {
  stableKey?: unknown;
  sortOrder?: unknown;
  type?: unknown;
  phaseRecommendations?: unknown;
};

interface TemplateRow {
  id: string;
  alias: string;
  invitationSubject: string;
  invitationBodyMarkdown: string;
}

interface VersionRow {
  id: string;
  templateId: string;
  versionNumber: number;
  language: string;
  questions: unknown;
  sections: unknown;
  scoringConfig: unknown;
  reportConfig: unknown;
  contentHash: string;
  publishedAt: Date | null;
  publishedBy: string | null;
  archivedAt: Date | null;
}

interface AuditRow {
  changes: string;
  performedBy: string | null;
}

interface ActorRow {
  id: string;
  email: string;
  role: string;
  deletedAt: Date | null;
}

interface PhaseFeedbackEditionTx {
  user: {
    findUnique(args: unknown): Promise<ActorRow | null>;
  };
  assessmentTemplate: {
    findFirst(args: unknown): Promise<TemplateRow | null>;
  };
  assessmentTemplateVersion: {
    findFirst(args: unknown): Promise<VersionRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<{
      id: string;
      versionNumber: number;
    }>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  auditLog: {
    findFirst(args: unknown): Promise<AuditRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface PhaseFeedbackEditionDb {
  $transaction<T>(
    fn: (tx: PhaseFeedbackEditionTx) => Promise<T>,
    options: {
      isolationLevel: "Serializable";
      maxWait: number;
      timeout: number;
    },
  ): Promise<T>;
}

export interface PhaseFeedbackDraftReceipt {
  sourceId: typeof SU_FULL_PHASE_FEEDBACK_SOURCE_ID;
  templateId: string;
  templateAlias: typeof TEMPLATE_ALIAS;
  language: typeof DEFAULT_TEMPLATE_LANGUAGE;
  sourceVersionId: string;
  sourceVersionNumber: number;
  sourcePublishedAt: string;
  sourcePublishedBy: string | null;
  sourceArchivedAt: null;
  beforeContentHash: string;
  afterContentHash: string;
  questionCount: number;
  phaseBandRecordCount: number;
  phaseBoundaries: typeof SU_FULL_PHASE_FEEDBACK_BOUNDARIES;
  historicRowsMutated: false;
  draftVersionId: string;
  draftVersionNumber: number;
  draftPublishedAt: null;
  draftPublishedBy: null;
  draftArchivedAt: null;
  createdByEmail: string;
  createdByUserId: string;
}

export interface PhaseFeedbackDraftResult extends PhaseFeedbackDraftReceipt {
  action: "created" | "noop";
}

export interface PhaseFeedbackPublishResult extends PhaseFeedbackDraftReceipt {
  action: "published" | "noop";
  publishedAt: Date;
  publishedBy: string;
  campaignRowsRepinned: 0;
}

function actorEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email === "") {
    throw new Error("Scaling Up Full phase-feedback lifecycle requires an actor email.");
  }
  return email;
}

function hasSerializationConflictCode(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    SERIALIZATION_CONFLICT_CODES.has((error as { code: string }).code)
  );
}

async function runSerializableLifecycleTransaction<T>(
  db: PhaseFeedbackEditionDb,
  operation: (tx: PhaseFeedbackEditionTx) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction(operation, SERIALIZABLE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (
        !hasSerializationConflictCode(error) ||
        attempt === MAX_SERIALIZABLE_ATTEMPTS
      ) {
        throw error;
      }
    }
  }
  throw new Error("Scaling Up Full Serializable transaction retry exhausted.");
}

async function resolveActivePrivilegedActor(
  tx: PhaseFeedbackEditionTx,
  email: string,
): Promise<ActorRow> {
  const actor = await tx.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, deletedAt: true },
  });
  if (
    !actor ||
    actor.deletedAt !== null ||
    !isPrivilegedRole(normalizeRole(actor.role))
  ) {
    throw new Error(`Active privileged actor "${email}" was not found.`);
  }
  return actor;
}

function assertTemplate(template: TemplateRow | null): asserts template is TemplateRow {
  if (!template || template.alias !== TEMPLATE_ALIAS) {
    throw new Error(`Active template "${TEMPLATE_ALIAS}" was not found.`);
  }
}

function assertEnglishVersion(
  version: VersionRow | null,
  description: string,
): asserts version is VersionRow {
  if (!version) {
    throw new Error(`${description} was not found.`);
  }
  if (version.language !== DEFAULT_TEMPLATE_LANGUAGE) {
    throw new Error(
      `${description} must use ${DEFAULT_TEMPLATE_LANGUAGE}; found ${version.language}.`,
    );
  }
}

function assertActivePublishedVersion(
  version: VersionRow,
  description: string,
): void {
  if (version.publishedAt === null || version.archivedAt !== null) {
    throw new Error(`${description} is not an active published edition.`);
  }
}

function assertExactUnpublishedDraftState(
  version: VersionRow,
  description: string,
): void {
  if (
    version.publishedAt !== null ||
    version.publishedBy !== null ||
    version.archivedAt !== null
  ) {
    throw new Error(
      `${description} is not in the exact unpublished draft state (publishedAt, publishedBy, and archivedAt must all be null).`,
    );
  }
}

function assertPublishedRetryState(
  version: VersionRow,
  description: string,
): void {
  if (
    version.publishedAt === null ||
    version.publishedBy === null ||
    version.archivedAt !== null
  ) {
    throw new Error(
      `${description} is not in a valid published retry state.`,
    );
  }
}

function expectedQuestionKey(index: number): string {
  return `Q${String(index + 1).padStart(2, "0")}`;
}

function canonicalScoredQuestions(questions: unknown): QuestionRecord[] {
  if (!Array.isArray(questions)) {
    throw new Error("Scaling Up Full questions must be an array.");
  }
  const scored = questions.filter(
    (question): question is QuestionRecord =>
      Boolean(question) &&
      typeof question === "object" &&
      (question as QuestionRecord).type === "SLIDER_LIKERT",
  );
  if (scored.length !== EXPECTED_QUESTION_COUNT) {
    throw new Error(
      `Scaling Up Full expected ${EXPECTED_QUESTION_COUNT} scored questions, found ${scored.length}.`,
    );
  }
  for (const [index, question] of scored.entries()) {
    const expectedKey = expectedQuestionKey(index);
    if (question.stableKey !== expectedKey || question.sortOrder !== index + 1) {
      throw new Error(
        `Scaling Up Full canonical scored-question order expected ${expectedKey} at position ${index + 1}; found ${String(question.stableKey)}.`,
      );
    }
  }
  return scored;
}

function attachPhaseRecommendations(questions: unknown): unknown[] {
  const scored = canonicalScoredQuestions(questions);
  const scoredSet = new Set(scored);
  return (questions as unknown[]).map((rawQuestion) => {
    if (!scoredSet.has(rawQuestion as QuestionRecord)) return rawQuestion;
    const question = rawQuestion as QuestionRecord;
    const stableKey = String(question.stableKey);
    return {
      ...question,
      phaseRecommendations: buildPhaseRecommendations(stableKey),
    };
  });
}

function assertCanonicalPhaseRecommendations(questions: unknown): void {
  const scored = canonicalScoredQuestions(questions);
  let recordCount = 0;
  for (const question of scored) {
    const stableKey = String(question.stableKey);
    const expected = buildPhaseRecommendations(stableKey);
    if (JSON.stringify(question.phaseRecommendations) !== JSON.stringify(expected)) {
      throw new Error(
        `Scaling Up Full question ${stableKey} does not match the audited phase-feedback catalogue.`,
      );
    }
    recordCount += expected.reduce((count, row) => count + row.bands.length, 0);
  }
  if (recordCount !== EXPECTED_PHASE_BAND_RECORD_COUNT) {
    throw new Error(
      `Scaling Up Full expected ${EXPECTED_PHASE_BAND_RECORD_COUNT} phase-band records, found ${recordCount}.`,
    );
  }
}

function hashVersion(template: TemplateRow, version: VersionRow): string {
  return computeTemplateContentHash({
    questions: version.questions,
    sections: version.sections,
    scoringConfig: version.scoringConfig,
    reportConfig: version.reportConfig ?? null,
    invitationSubject: template.invitationSubject,
    invitationBodyMarkdown: template.invitationBodyMarkdown,
  });
}

function receiptFor(
  template: TemplateRow,
  source: VersionRow,
  draft: Pick<VersionRow, "id" | "versionNumber">,
  afterContentHash: string,
  creator: Pick<ActorRow, "id" | "email">,
): PhaseFeedbackDraftReceipt {
  if (source.publishedAt === null || source.archivedAt !== null) {
    throw new Error("Scaling Up Full receipt source is not published and unarchived.");
  }
  return {
    sourceId: SU_FULL_PHASE_FEEDBACK_SOURCE_ID,
    templateId: template.id,
    templateAlias: TEMPLATE_ALIAS,
    language: DEFAULT_TEMPLATE_LANGUAGE,
    sourceVersionId: source.id,
    sourceVersionNumber: source.versionNumber,
    sourcePublishedAt: source.publishedAt.toISOString(),
    sourcePublishedBy: source.publishedBy,
    sourceArchivedAt: null,
    beforeContentHash: source.contentHash,
    afterContentHash,
    questionCount: EXPECTED_QUESTION_COUNT,
    phaseBandRecordCount: EXPECTED_PHASE_BAND_RECORD_COUNT,
    phaseBoundaries: SU_FULL_PHASE_FEEDBACK_BOUNDARIES,
    historicRowsMutated: false,
    draftVersionId: draft.id,
    draftVersionNumber: draft.versionNumber,
    draftPublishedAt: null,
    draftPublishedBy: null,
    draftArchivedAt: null,
    createdByEmail: creator.email,
    createdByUserId: creator.id,
  };
}

function parseReceipt(changes: string, versionNumber: number): Record<string, unknown> {
  try {
    const parsed = JSON.parse(changes) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(
      `Scaling Up Full version ${versionNumber} has an invalid phase-feedback audit receipt.`,
    );
  }
}

function receiptSourceVersionId(
  raw: Record<string, unknown>,
  versionNumber: number,
): string {
  if (typeof raw.sourceVersionId !== "string" || raw.sourceVersionId.trim() === "") {
    throw new Error(
      `Scaling Up Full version ${versionNumber} has an invalid predecessor in its phase-feedback draft audit receipt.`,
    );
  }
  return raw.sourceVersionId;
}

function assertDraftReceipt(
  raw: Record<string, unknown>,
  template: TemplateRow,
  source: VersionRow,
  draft: VersionRow,
  creator: ActorRow,
): PhaseFeedbackDraftReceipt {
  const expected = receiptFor(
    template,
    source,
    draft,
    draft.contentHash,
    creator,
  );
  for (const key of [
    "sourceId",
    "templateId",
    "templateAlias",
    "language",
    "sourceVersionId",
    "sourceVersionNumber",
    "sourcePublishedAt",
    "sourcePublishedBy",
    "sourceArchivedAt",
    "beforeContentHash",
    "afterContentHash",
    "questionCount",
    "phaseBandRecordCount",
    "historicRowsMutated",
    "draftVersionId",
    "draftVersionNumber",
    "draftPublishedAt",
    "draftPublishedBy",
    "draftArchivedAt",
    "createdByEmail",
    "createdByUserId",
  ] as const) {
    if (raw[key] !== expected[key]) {
      throw new Error(
        `Scaling Up Full version ${draft.versionNumber} does not match its phase-feedback draft audit receipt.`,
      );
    }
  }
  if (JSON.stringify(raw.phaseBoundaries) !== JSON.stringify(expected.phaseBoundaries)) {
    throw new Error(
      `Scaling Up Full version ${draft.versionNumber} does not match its phase-feedback draft audit receipt.`,
    );
  }
  return expected;
}

function assertPublishReceipt(
  raw: Record<string, unknown>,
  receipt: PhaseFeedbackDraftReceipt,
  draft: VersionRow,
  performedBy: string | null,
): { publishedByEmail: string; publishedByUserId: string } {
  for (const key of [
    "sourceId",
    "templateId",
    "templateAlias",
    "language",
    "sourceVersionId",
    "sourceVersionNumber",
    "sourcePublishedAt",
    "sourcePublishedBy",
    "sourceArchivedAt",
    "beforeContentHash",
    "afterContentHash",
    "questionCount",
    "phaseBandRecordCount",
    "historicRowsMutated",
    "draftVersionId",
    "draftVersionNumber",
    "draftPublishedAt",
    "draftPublishedBy",
    "draftArchivedAt",
    "createdByEmail",
    "createdByUserId",
  ] as const) {
    if (raw[key] !== receipt[key]) {
      throw new Error(
        `Scaling Up Full version ${draft.versionNumber} does not match its publish audit receipt.`,
      );
    }
  }
  if (
    JSON.stringify(raw.phaseBoundaries) !== JSON.stringify(receipt.phaseBoundaries) ||
    raw.finalPublishedAt !== draft.publishedAt?.toISOString() ||
    raw.finalPublishedBy !== draft.publishedBy ||
    raw.finalArchivedAt !== (draft.archivedAt?.toISOString() ?? null) ||
    typeof raw.publishedByEmail !== "string" ||
    raw.publishedByEmail.trim() === "" ||
    performedBy === null ||
    raw.publishedByEmail !== performedBy ||
    typeof raw.publishedByUserId !== "string" ||
    raw.publishedByUserId !== draft.publishedBy ||
    raw.draftRowsPublished !== 1 ||
    raw.campaignRowsRepinned !== 0
  ) {
    throw new Error(
      `Scaling Up Full version ${draft.versionNumber} does not match its publish audit receipt.`,
    );
  }
  return {
    publishedByEmail: raw.publishedByEmail,
    publishedByUserId: raw.publishedByUserId,
  };
}

function assertVersionHash(
  template: TemplateRow,
  version: VersionRow,
  description: string,
): void {
  if (hashVersion(template, version) !== version.contentHash) {
    throw new Error(`${description} does not match its standard content hash.`);
  }
}

async function findDraftAudit(
  tx: PhaseFeedbackEditionTx,
  version: VersionRow,
): Promise<{ receipt: Record<string, unknown>; performedBy: string | null }> {
  const audit = await tx.auditLog.findFirst({
    where: {
      entityType: "AssessmentTemplateVersion",
      entityId: version.id,
      action: DRAFT_AUDIT_ACTION,
    },
    orderBy: { timestamp: "desc" },
    select: { changes: true, performedBy: true },
  });
  if (!audit) {
    throw new Error(
      `Scaling Up Full version ${version.versionNumber} has no phase-feedback draft audit receipt.`,
    );
  }
  return {
    receipt: parseReceipt(audit.changes, version.versionNumber),
    performedBy: audit.performedBy,
  };
}

async function resolveDraftReceiptCreator(
  tx: PhaseFeedbackEditionTx,
  audit: { performedBy: string | null },
  version: VersionRow,
): Promise<ActorRow> {
  if (audit.performedBy === null || audit.performedBy.trim() === "") {
    throw new Error(
      `Scaling Up Full version ${version.versionNumber} has no durable creator on its phase-feedback draft audit receipt.`,
    );
  }
  const creator = await tx.user.findUnique({
    where: { email: audit.performedBy },
    select: { id: true, email: true, role: true, deletedAt: true },
  });
  if (!creator || creator.email !== audit.performedBy) {
    throw new Error(
      `Scaling Up Full version ${version.versionNumber} has an invalid creator on its phase-feedback draft audit receipt.`,
    );
  }
  return creator;
}

export async function createScalingUpFullPhaseFeedbackDraft(
  db: PhaseFeedbackEditionDb,
  actorEmailInput: string,
): Promise<PhaseFeedbackDraftResult> {
  const email = actorEmail(actorEmailInput);

  return runSerializableLifecycleTransaction(
    db,
    async (tx) => {
      const [actor, template] = await Promise.all([
        resolveActivePrivilegedActor(tx, email),
        tx.assessmentTemplate.findFirst({
          where: { alias: TEMPLATE_ALIAS, deletedAt: null },
          select: {
            id: true,
            alias: true,
            invitationSubject: true,
            invitationBodyMarkdown: true,
          },
        }),
      ]);
      assertTemplate(template);

      const [latestVersion, activeVersion] = await Promise.all([
        tx.assessmentTemplateVersion.findFirst({
          where: {
            templateId: template.id,
            language: DEFAULT_TEMPLATE_LANGUAGE,
          },
          orderBy: { versionNumber: "desc" },
          select: versionSelect,
        }),
        tx.assessmentTemplateVersion.findFirst({
          where: {
            templateId: template.id,
            language: DEFAULT_TEMPLATE_LANGUAGE,
            ...activePublishedWhere,
          },
          orderBy: { versionNumber: "desc" },
          select: versionSelect,
        }),
      ]);
      assertEnglishVersion(latestVersion, "Latest Scaling Up Full English edition");
      assertEnglishVersion(activeVersion, "Active published Scaling Up Full English edition");
      assertActivePublishedVersion(
        activeVersion,
        "Active published Scaling Up Full English edition",
      );
      if (activeVersion.templateId !== template.id) {
        throw new Error("Active published version is not a Scaling Up Full edition.");
      }

      canonicalScoredQuestions(activeVersion.questions);
      assertVersionHash(template, activeVersion, "Active published Scaling Up Full edition");
      const questions = attachPhaseRecommendations(activeVersion.questions);
      assertCanonicalPhaseRecommendations(questions);
      const afterContentHash = computeTemplateContentHash({
        questions,
        sections: activeVersion.sections,
        scoringConfig: activeVersion.scoringConfig,
        reportConfig: activeVersion.reportConfig ?? null,
        invitationSubject: template.invitationSubject,
        invitationBodyMarkdown: template.invitationBodyMarkdown,
      });
      if (latestVersion.publishedAt === null) {
        assertExactUnpublishedDraftState(
          latestVersion,
          `Scaling Up Full version ${latestVersion.versionNumber}`,
        );
        if (latestVersion.contentHash !== afterContentHash) {
          throw new Error(
            `Template "${TEMPLATE_ALIAS}" already has unpublished draft version ${latestVersion.versionNumber}; refusing to supersede it.`,
          );
        }
        assertCanonicalPhaseRecommendations(latestVersion.questions);
        assertVersionHash(template, latestVersion, "Existing Scaling Up Full draft");
        const draftAudit = await findDraftAudit(tx, latestVersion);
        const creator = await resolveDraftReceiptCreator(
          tx,
          draftAudit,
          latestVersion,
        );
        const receipt = assertDraftReceipt(
          draftAudit.receipt,
          template,
          activeVersion,
          latestVersion,
          creator,
        );
        return {
          action: "noop",
          ...receipt,
        };
      }

      if (activeVersion.contentHash === afterContentHash) {
        assertCanonicalPhaseRecommendations(activeVersion.questions);
        throw new Error(
          `Scaling Up Full phase feedback is already published in version ${activeVersion.versionNumber}; no unpublished draft exists.`,
        );
      }

      const created = await tx.assessmentTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: latestVersion.versionNumber + 1,
          language: DEFAULT_TEMPLATE_LANGUAGE,
          questions,
          sections: activeVersion.sections,
          scoringConfig: activeVersion.scoringConfig,
          reportConfig: activeVersion.reportConfig ?? null,
          contentHash: afterContentHash,
          publishedAt: null,
          publishedBy: null,
        },
      });
      const receipt = receiptFor(
        template,
        activeVersion,
        created,
        afterContentHash,
        actor,
      );

      await tx.auditLog.create({
        data: {
          entityType: "AssessmentTemplateVersion",
          entityId: created.id,
          action: DRAFT_AUDIT_ACTION,
          performedBy: actor.email,
          changes: JSON.stringify(receipt),
        },
      });

      return {
        action: "created",
        ...receipt,
      };
    },
  );
}

export async function publishScalingUpFullPhaseFeedbackDraft(
  db: PhaseFeedbackEditionDb,
  draftVersionIdInput: string,
  actorEmailInput: string,
): Promise<PhaseFeedbackPublishResult> {
  const draftVersionId = draftVersionIdInput.trim();
  if (draftVersionId === "") {
    throw new Error("Scaling Up Full phase-feedback publish requires a draft version ID.");
  }
  const email = actorEmail(actorEmailInput);

  return runSerializableLifecycleTransaction(
    db,
    async (tx) => {
      const [actor, template] = await Promise.all([
        resolveActivePrivilegedActor(tx, email),
        tx.assessmentTemplate.findFirst({
          where: { alias: TEMPLATE_ALIAS, deletedAt: null },
          select: {
            id: true,
            alias: true,
            invitationSubject: true,
            invitationBodyMarkdown: true,
          },
        }),
      ]);
      assertTemplate(template);

      const draft = await tx.assessmentTemplateVersion.findFirst({
        where: {
          id: draftVersionId,
          templateId: template.id,
          language: DEFAULT_TEMPLATE_LANGUAGE,
        },
        select: versionSelect,
      });
      assertEnglishVersion(draft, `Scaling Up Full draft "${draftVersionId}"`);
      if (draft.templateId !== template.id) {
        throw new Error(`Scaling Up Full draft "${draftVersionId}" was not found.`);
      }
      if (draft.publishedAt === null) {
        assertExactUnpublishedDraftState(
          draft,
          `Scaling Up Full version ${draft.versionNumber}`,
        );
      } else {
        assertPublishedRetryState(
          draft,
          `Scaling Up Full version ${draft.versionNumber}`,
        );
      }
      assertCanonicalPhaseRecommendations(draft.questions);
      assertVersionHash(template, draft, `Scaling Up Full version ${draft.versionNumber}`);

      const draftAudit = await findDraftAudit(tx, draft);
      const creator = await resolveDraftReceiptCreator(tx, draftAudit, draft);
      const rawReceipt = draftAudit.receipt;
      const recordedSourceId = receiptSourceVersionId(
        rawReceipt,
        draft.versionNumber,
      );
      const [recordedSource, activeVersion] = await Promise.all([
        tx.assessmentTemplateVersion.findFirst({
          where: { id: recordedSourceId },
          select: versionSelect,
        }),
        tx.assessmentTemplateVersion.findFirst({
          where: {
            templateId: template.id,
            language: DEFAULT_TEMPLATE_LANGUAGE,
            ...activePublishedWhere,
          },
          orderBy: { versionNumber: "desc" },
          select: versionSelect,
        }),
      ]);
      assertEnglishVersion(
        recordedSource,
        "Recorded published Scaling Up Full predecessor",
      );
      assertActivePublishedVersion(
        recordedSource,
        "Recorded published Scaling Up Full predecessor",
      );
      if (recordedSource.templateId !== template.id) {
        throw new Error("Recorded published predecessor is not a Scaling Up Full edition.");
      }
      if (
        recordedSource.id === draft.id ||
        recordedSource.versionNumber >= draft.versionNumber
      ) {
        throw new Error(
          `Scaling Up Full version ${recordedSource.versionNumber} is not a predecessor of draft ${draft.versionNumber}.`,
        );
      }
      assertVersionHash(
        template,
        recordedSource,
        "Recorded published Scaling Up Full predecessor",
      );
      const receipt = assertDraftReceipt(
        rawReceipt,
        template,
        recordedSource,
        draft,
        creator,
      );

      assertEnglishVersion(activeVersion, "Active published Scaling Up Full edition");
      assertActivePublishedVersion(
        activeVersion,
        "Active published Scaling Up Full edition",
      );
      if (activeVersion.templateId !== template.id) {
        throw new Error("Active published version is not a Scaling Up Full edition.");
      }
      assertVersionHash(template, activeVersion, "Active published Scaling Up Full edition");

      if (draft.publishedAt !== null) {
        if (activeVersion.id !== draft.id) {
          throw new Error(
            `Scaling Up Full version ${draft.versionNumber} is no longer the active published edition.`,
          );
        }
        const publishAudit = await tx.auditLog.findFirst({
          where: {
            entityType: "AssessmentTemplateVersion",
            entityId: draft.id,
            action: PUBLISH_AUDIT_ACTION,
          },
          orderBy: { timestamp: "desc" },
          select: { changes: true, performedBy: true },
        });
        if (!publishAudit) {
          throw new Error(
            `Scaling Up Full version ${draft.versionNumber} has no publish audit receipt.`,
          );
        }
        const publishedReceipt = parseReceipt(publishAudit.changes, draft.versionNumber);
        const publisher = assertPublishReceipt(
          publishedReceipt,
          receipt,
          draft,
          publishAudit.performedBy,
        );
        return {
          action: "noop",
          publishedAt: draft.publishedAt,
          publishedBy: publisher.publishedByEmail,
          campaignRowsRepinned: 0,
          ...receipt,
        };
      }

      if (
        recordedSource.id !== activeVersion.id ||
        recordedSource.versionNumber !== activeVersion.versionNumber ||
        recordedSource.contentHash !== activeVersion.contentHash
      ) {
        throw new Error(
          `Scaling Up Full draft ${draft.versionNumber} has a stale active predecessor; refusing to publish.`,
        );
      }

      const publishIssues = getPublishValidationIssues({
        questions: draft.questions,
        sections: draft.sections,
        scoringConfig: draft.scoringConfig,
      });
      if (publishIssues.length > 0) {
        throw new Error(
          `Scaling Up Full version ${draft.versionNumber} failed publish validation: ${JSON.stringify(publishIssues)}.`,
        );
      }

      const publishedAt = new Date();
      const updated = await tx.assessmentTemplateVersion.updateMany({
        where: {
          id: draft.id,
          templateId: template.id,
          versionNumber: draft.versionNumber,
          language: DEFAULT_TEMPLATE_LANGUAGE,
          contentHash: draft.contentHash,
          publishedAt: null,
          publishedBy: null,
          archivedAt: null,
        },
        data: { publishedAt, publishedBy: actor.id },
      });
      if (updated.count !== 1) {
        throw new Error(
          `Scaling Up Full version ${draft.versionNumber} changed before publish; refusing to continue.`,
        );
      }

      await tx.auditLog.create({
        data: {
          entityType: "AssessmentTemplateVersion",
          entityId: draft.id,
          action: PUBLISH_AUDIT_ACTION,
          performedBy: actor.email,
          changes: JSON.stringify({
            ...receipt,
            finalPublishedAt: publishedAt.toISOString(),
            finalPublishedBy: actor.id,
            finalArchivedAt: null,
            publishedByEmail: actor.email,
            publishedByUserId: actor.id,
            draftRowsPublished: 1,
            campaignRowsRepinned: 0,
          }),
        },
      });

      return {
        action: "published",
        publishedAt,
        publishedBy: actor.email,
        campaignRowsRepinned: 0,
        ...receipt,
      };
    },
  );
}

const versionSelect = {
  id: true,
  templateId: true,
  versionNumber: true,
  language: true,
  questions: true,
  sections: true,
  scoringConfig: true,
  reportConfig: true,
  contentHash: true,
  publishedAt: true,
  publishedBy: true,
  archivedAt: true,
} as const;
