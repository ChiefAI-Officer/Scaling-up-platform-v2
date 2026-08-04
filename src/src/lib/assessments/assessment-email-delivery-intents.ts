import { createHash } from "crypto";
import { z } from "zod";

export const INTENT_SNAPSHOT_SCHEMA_VERSION = 1;
export const INTENT_RENDERER_CONTRACT_VERSION = 1;
export const INTENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export type AuthorizationSnapshotV1 = {
  schemaVersion: 1;
  common: {
    campaignId: string;
    invitationId: string;
    respondentId: string;
    templateId: string;
    templateAlias: string;
    versionId: string;
    accessMode: "INVITED";
    campaignStatus: string;
    campaignDeleted: boolean;
    invitationStatus: "SUBMITTED";
    invitationRevoked: boolean;
    closeAt: string | null;
    invitationExpiresAt: string;
    recipientRole: "RESPONDENT" | "OWNING_COACH";
    emailType: "ASSESSMENT_RESULTS" | "COACH_COMPLETION";
    phase2Fingerprint: string;
  };
  respondentResults?: {
    canonicalRecipientMailbox: string;
    sendResultsToRespondent: true;
    featureKey: "WAVE_D_RESULTS_EMAIL_ENABLED";
    featureEnabled: true;
    approved: true;
    approvedContentHash: string;
  };
  coachCompletion?: {
    canonicalRecipientMailbox: string;
    notifyCoachOnCompletion: true;
    featureKey: "WAVE_D_COACH_NOTIFY_ENABLED";
    featureEnabled: true;
    coachId: string;
  };
};

export type ContentProvenanceV1 = {
  schemaVersion: 1;
  templateId: string;
  versionId: string;
  templateAlias: string;
  reportType: string;
  approvalHash: string | null;
  rendererContractVersion: 1;
  sourceCommit: string;
  renderInputHash: string;
};

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
const requiredString = z.string().min(1);

const authorizationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(INTENT_SNAPSHOT_SCHEMA_VERSION),
    common: z
      .object({
        campaignId: requiredString,
        invitationId: requiredString,
        respondentId: requiredString,
        templateId: requiredString,
        templateAlias: requiredString,
        versionId: requiredString,
        accessMode: z.literal("INVITED"),
        campaignStatus: requiredString,
        campaignDeleted: z.boolean(),
        invitationStatus: z.literal("SUBMITTED"),
        invitationRevoked: z.boolean(),
        closeAt: z.string().datetime().nullable(),
        invitationExpiresAt: z.string().datetime(),
        recipientRole: z.enum(["RESPONDENT", "OWNING_COACH"]),
        emailType: z.enum(["ASSESSMENT_RESULTS", "COACH_COMPLETION"]),
        phase2Fingerprint: sha256Hex,
      })
      .strict(),
    respondentResults: z
      .object({
        canonicalRecipientMailbox: z.string().email(),
        sendResultsToRespondent: z.literal(true),
        featureKey: z.literal("WAVE_D_RESULTS_EMAIL_ENABLED"),
        featureEnabled: z.literal(true),
        approved: z.literal(true),
        approvedContentHash: sha256Hex,
      })
      .strict()
      .optional(),
    coachCompletion: z
      .object({
        canonicalRecipientMailbox: z.string().email(),
        notifyCoachOnCompletion: z.literal(true),
        featureKey: z.literal("WAVE_D_COACH_NOTIFY_ENABLED"),
        featureEnabled: z.literal(true),
        coachId: requiredString,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const hasRespondentResults = snapshot.respondentResults !== undefined;
    const hasCoachCompletion = snapshot.coachCompletion !== undefined;

    if (hasRespondentResults === hasCoachCompletion) {
      ctx.addIssue({
        code: "custom",
        message: "Authorization snapshot must contain exactly one role-specific block.",
      });
      return;
    }

    const isRespondent = snapshot.common.recipientRole === "RESPONDENT";
    const expectedEmailType = isRespondent ? "ASSESSMENT_RESULTS" : "COACH_COMPLETION";
    const matchingBlockPresent = isRespondent ? hasRespondentResults : hasCoachCompletion;
    if (snapshot.common.emailType !== expectedEmailType || !matchingBlockPresent) {
      ctx.addIssue({
        code: "custom",
        message: "Authorization snapshot role, email type, and role-specific block must match.",
      });
    }
  });

const contentProvenanceSchema = z
  .object({
    schemaVersion: z.literal(INTENT_SNAPSHOT_SCHEMA_VERSION),
    templateId: requiredString,
    versionId: requiredString,
    templateAlias: requiredString,
    reportType: requiredString,
    approvalHash: z.string().nullable(),
    rendererContractVersion: z.literal(INTENT_RENDERER_CONTRACT_VERSION),
    sourceCommit: requiredString,
    renderInputHash: sha256Hex,
  })
  .strict();

function canonicalJsonValue(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      return Number.isFinite(value) ? JSON.stringify(value) : "null";
    case "bigint":
    case "function":
    case "symbol":
    case "undefined":
      throw new TypeError("stableCanonicalJson only accepts JSON-compatible values.");
    case "object":
      if (seen.has(value)) {
        throw new TypeError("stableCanonicalJson does not support circular values.");
      }
      seen.add(value);
      try {
        if (Array.isArray(value)) {
          return `[${value.map((item) => canonicalJsonValue(item, seen)).join(",")}]`;
        }

        const object = value as Record<string, unknown>;
        return `{${Object.keys(object)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonicalJsonValue(object[key], seen)}`)
          .join(",")}}`;
      } finally {
        seen.delete(value);
      }
  }

  throw new TypeError("stableCanonicalJson encountered an unsupported value.");
}

export function stableCanonicalJson(value: unknown): string {
  return canonicalJsonValue(value, new Set());
}

export function assessmentEmailIntentPayloadHash(input: {
  snapshotSchemaVersion: number;
  recipientRole: string;
  emailType: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.snapshotSchemaVersion,
        input.recipientRole,
        input.emailType,
        input.recipientEmail,
        input.subject,
        input.bodyHtml,
      ]),
      "utf8",
    )
    .digest("hex");
}

export function intentExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + INTENT_RETENTION_MS);
}

export function sourceCommitIdentifier(env: NodeJS.ProcessEnv = process.env): string {
  return env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || "unknown";
}

export function parseAuthorizationSnapshot(value: unknown):
  | { supported: true; value: AuthorizationSnapshotV1 }
  | { supported: false } {
  const parsed = authorizationSnapshotSchema.safeParse(value);
  return parsed.success
    ? { supported: true, value: parsed.data as AuthorizationSnapshotV1 }
    : { supported: false };
}

export function parseContentProvenance(
  value: unknown,
): ContentProvenanceV1 | null {
  const parsed = contentProvenanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function terminalIntentData(input: {
  now: Date;
  status: "HANDED_OFF" | "CANCELLED" | "EXPIRED";
  outboxId?: string;
  actor: string;
  reasonCode: string;
  snapshot: AuthorizationSnapshotV1;
  provenance: ContentProvenanceV1;
}): Record<string, unknown> {
  const { common, respondentResults, coachCompletion } = input.snapshot;
  const authorizationSnapshot = {
    schemaVersion: input.snapshot.schemaVersion,
    common: {
      campaignId: common.campaignId,
      invitationId: common.invitationId,
      respondentId: common.respondentId,
      templateId: common.templateId,
      versionId: common.versionId,
      campaignDeleted: common.campaignDeleted,
      invitationRevoked: common.invitationRevoked,
      closeAt: common.closeAt,
      invitationExpiresAt: common.invitationExpiresAt,
      phase2Fingerprint: common.phase2Fingerprint,
    },
    ...(respondentResults
      ? {
          respondentResults: {
            sendResultsToRespondent: respondentResults.sendResultsToRespondent,
            featureEnabled: respondentResults.featureEnabled,
            approved: respondentResults.approved,
            approvedContentHash: respondentResults.approvedContentHash,
          },
        }
      : {}),
    ...(coachCompletion
      ? {
          coachCompletion: {
            notifyCoachOnCompletion: coachCompletion.notifyCoachOnCompletion,
            featureEnabled: coachCompletion.featureEnabled,
            coachId: coachCompletion.coachId,
          },
        }
      : {}),
  };

  return {
    status: input.status,
    handedOffOutboxId: input.outboxId ?? null,
    resolvedAt: input.now,
    resolvedBy: input.actor,
    resolutionReasonCode: input.reasonCode,
    recipientEmail: null,
    subject: null,
    bodyHtml: null,
    authorizationSnapshot,
    contentProvenance: {
      schemaVersion: input.provenance.schemaVersion,
      templateId: input.provenance.templateId,
      versionId: input.provenance.versionId,
      approvalHash: input.provenance.approvalHash,
      rendererContractVersion: input.provenance.rendererContractVersion,
      sourceCommit: input.provenance.sourceCommit,
      renderInputHash: input.provenance.renderInputHash,
    },
  };
}
