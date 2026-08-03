import { createHash } from "crypto";
import {
  INTENT_RENDERER_CONTRACT_VERSION,
  INTENT_SNAPSHOT_SCHEMA_VERSION,
  assessmentEmailIntentPayloadHash,
  stableCanonicalJson,
  type AuthorizationSnapshotV1,
} from "@/lib/assessments/assessment-email-delivery-intents";
import { normalizeMailbox } from "@/lib/assessments/quick-assessment-lead";

export const EMAIL_DELIVERY_INTENT_HOLD_CODES = [
  "CAMPAIGN_DELETED",
  "CAMPAIGN_STATUS_CHANGED",
  "CAMPAIGN_DEADLINE_CHANGED",
  "INVITATION_REVOKED",
  "INVITATION_EXPIRY_CHANGED",
  "IDENTITY_LINK_CHANGED",
  "RESPONDENT_EMAIL_CHANGED",
  "COACH_OWNER_CHANGED",
  "COACH_EMAIL_CHANGED",
  "TEMPLATE_CHANGED",
  "VERSION_CHANGED",
  "APPROVAL_REVOKED",
  "APPROVAL_HASH_CHANGED",
  "FEATURE_DISABLED",
  "PAYLOAD_INTEGRITY_FAILED",
  "SCHEMA_UNSUPPORTED",
  "RETRY_EXHAUSTED",
] as const;

export type EmailDeliveryIntentHoldCode =
  (typeof EMAIL_DELIVERY_INTENT_HOLD_CODES)[number];

export type FrozenIntentForAuthorization = {
  submissionId: string;
  campaignId: string;
  invitationId: string;
  respondentId: string;
  recipientRole: "RESPONDENT" | "OWNING_COACH";
  emailType: "ASSESSMENT_RESULTS" | "COACH_COMPLETION";
  recipientEmail: string | null;
  subject: string | null;
  bodyHtml: string | null;
  payloadHash: string;
  snapshotSchemaVersion: number;
  rendererContractVersion: number;
};

export type CurrentAuthorizationFactsV1 = {
  submission: {
    exists: boolean;
    campaignId: string | null;
    invitationId: string | null;
    respondentId: string | null;
  };
  campaign: {
    exists: boolean;
    templateId: string | null;
    versionId: string | null;
    accessMode: string | null;
    status: string | null;
    deleted: boolean | null;
    closeAt: string | null;
    sendResultsToRespondent: boolean | null;
    notifyCoachOnCompletion: boolean | null;
    createdByCoachId: string | null;
  };
  invitation: {
    exists: boolean;
    campaignId: string | null;
    respondentId: string | null;
    status: string | null;
    revoked: boolean | null;
    expiresAt: string | null;
  };
  respondent: {
    exists: boolean;
    canonicalMailbox: string | null;
  };
  template: {
    exists: boolean;
    alias: string | null;
    resultsEmailApproved: boolean | null;
    storedApprovedContentHash: string | null;
    liveContentHash: string | null;
  };
  version: { exists: boolean; templateId: string | null };
  coach: {
    exists: boolean;
    id: string | null;
    canonicalMailbox: string | null;
  } | null;
  features: {
    resultsEmailEnabled: boolean;
    coachNotifyEnabled: boolean;
  };
};

export type ReauthorizationDecision =
  | { kind: "AUTHORIZED" }
  | {
      kind: "HELD";
      primaryReason: EmailDeliveryIntentHoldCode;
      reasons: EmailDeliveryIntentHoldCode[];
    };

function payloadIntegrityMatches(intent: FrozenIntentForAuthorization): boolean {
  if (
    intent.recipientEmail === null ||
    intent.subject === null ||
    intent.bodyHtml === null
  ) {
    return false;
  }

  return (
    assessmentEmailIntentPayloadHash({
      snapshotSchemaVersion: intent.snapshotSchemaVersion,
      recipientRole: intent.recipientRole,
      emailType: intent.emailType,
      recipientEmail: intent.recipientEmail,
      subject: intent.subject,
      bodyHtml: intent.bodyHtml,
    }) === intent.payloadHash
  );
}

export function evaluateIntentReauthorization(input: {
  intent: FrozenIntentForAuthorization;
  snapshot: AuthorizationSnapshotV1;
  current: CurrentAuthorizationFactsV1;
}): ReauthorizationDecision {
  const { intent, snapshot, current } = input;
  const { common } = snapshot;
  const reasons = new Set<EmailDeliveryIntentHoldCode>();
  const add = (reason: EmailDeliveryIntentHoldCode) => reasons.add(reason);

  if (!current.campaign.exists) {
    add("CAMPAIGN_DELETED");
  } else {
    if (
      current.campaign.deleted === true ||
      current.campaign.deleted !== common.campaignDeleted
    ) {
      add("CAMPAIGN_DELETED");
    }
    if (
      current.campaign.accessMode !== common.accessMode ||
      current.campaign.status !== common.campaignStatus
    ) {
      add("CAMPAIGN_STATUS_CHANGED");
    }
    if (current.campaign.closeAt !== common.closeAt) {
      add("CAMPAIGN_DEADLINE_CHANGED");
    }
    if (current.campaign.templateId !== common.templateId) {
      add("TEMPLATE_CHANGED");
    }
    if (current.campaign.versionId !== common.versionId) {
      add("VERSION_CHANGED");
    }
  }

  if (!current.invitation.exists) {
    add("IDENTITY_LINK_CHANGED");
  } else {
    if (
      current.invitation.campaignId !== common.campaignId ||
      current.invitation.respondentId !== common.respondentId
    ) {
      add("IDENTITY_LINK_CHANGED");
    }
    if (
      current.invitation.status !== common.invitationStatus ||
      current.invitation.revoked === true ||
      current.invitation.revoked !== common.invitationRevoked
    ) {
      add("INVITATION_REVOKED");
    }
    if (current.invitation.expiresAt !== common.invitationExpiresAt) {
      add("INVITATION_EXPIRY_CHANGED");
    }
  }

  if (
    !current.submission.exists ||
    current.submission.campaignId !== common.campaignId ||
    current.submission.invitationId !== common.invitationId ||
    current.submission.respondentId !== common.respondentId ||
    intent.campaignId !== common.campaignId ||
    intent.invitationId !== common.invitationId ||
    intent.respondentId !== common.respondentId ||
    intent.recipientRole !== common.recipientRole ||
    intent.emailType !== common.emailType
  ) {
    add("IDENTITY_LINK_CHANGED");
  }

  if (!current.respondent.exists) {
    add("IDENTITY_LINK_CHANGED");
  }

  if (!current.template.exists) {
    add("TEMPLATE_CHANGED");
  } else if (current.template.alias !== common.templateAlias) {
    add("TEMPLATE_CHANGED");
  }

  if (
    !current.version.exists ||
    current.version.templateId !== common.templateId
  ) {
    add("VERSION_CHANGED");
  }

  if (!payloadIntegrityMatches(intent)) {
    add("PAYLOAD_INTEGRITY_FAILED");
  }

  const supportedRoleContract =
    (common.recipientRole === "RESPONDENT" &&
      common.emailType === "ASSESSMENT_RESULTS" &&
      snapshot.respondentResults !== undefined &&
      snapshot.coachCompletion === undefined) ||
    (common.recipientRole === "OWNING_COACH" &&
      common.emailType === "COACH_COMPLETION" &&
      snapshot.coachCompletion !== undefined &&
      snapshot.respondentResults === undefined);

  if (
    snapshot.schemaVersion !== INTENT_SNAPSHOT_SCHEMA_VERSION ||
    intent.snapshotSchemaVersion !== INTENT_SNAPSHOT_SCHEMA_VERSION ||
    intent.rendererContractVersion !== INTENT_RENDERER_CONTRACT_VERSION ||
    !supportedRoleContract
  ) {
    add("SCHEMA_UNSUPPORTED");
  }

  if (common.recipientRole === "RESPONDENT" && snapshot.respondentResults) {
    const frozen = snapshot.respondentResults;
    if (
      current.respondent.exists &&
      normalizeMailbox(current.respondent.canonicalMailbox) !==
        frozen.canonicalRecipientMailbox
    ) {
      add("RESPONDENT_EMAIL_CHANGED");
    }
    if (
      current.campaign.sendResultsToRespondent !==
        frozen.sendResultsToRespondent ||
      !current.features.resultsEmailEnabled
    ) {
      add("FEATURE_DISABLED");
    }
    if (
      current.template.exists &&
      current.template.resultsEmailApproved !== frozen.approved
    ) {
      add("APPROVAL_REVOKED");
    }
    if (
      current.template.exists &&
      (current.template.storedApprovedContentHash !==
        frozen.approvedContentHash ||
        current.template.liveContentHash !== frozen.approvedContentHash)
    ) {
      add("APPROVAL_HASH_CHANGED");
    }
  }

  if (common.recipientRole === "OWNING_COACH" && snapshot.coachCompletion) {
    const frozen = snapshot.coachCompletion;
    if (
      current.campaign.createdByCoachId !== frozen.coachId ||
      current.coach === null ||
      !current.coach.exists ||
      current.coach.id !== frozen.coachId
    ) {
      add("COACH_OWNER_CHANGED");
    }
    if (
      current.coach !== null &&
      current.coach.exists &&
      current.coach.id === frozen.coachId &&
      normalizeMailbox(current.coach.canonicalMailbox) !==
        frozen.canonicalRecipientMailbox
    ) {
      add("COACH_EMAIL_CHANGED");
    }
    if (
      current.campaign.notifyCoachOnCompletion !==
        frozen.notifyCoachOnCompletion ||
      !current.features.coachNotifyEnabled
    ) {
      add("FEATURE_DISABLED");
    }
  }

  const orderedReasons = EMAIL_DELIVERY_INTENT_HOLD_CODES.filter((reason) =>
    reasons.has(reason),
  );
  if (orderedReasons.length === 0) {
    return { kind: "AUTHORIZED" };
  }

  return {
    kind: "HELD",
    primaryReason: orderedReasons[0],
    reasons: orderedReasons,
  };
}

export function reviewContextHash(input: {
  intentId: string;
  intentVersion: number;
  current: CurrentAuthorizationFactsV1;
}): string {
  return createHash("sha256")
    .update(
      stableCanonicalJson({
        schemaVersion: 1,
        intentId: input.intentId,
        intentVersion: input.intentVersion,
        current: input.current,
      }),
      "utf8",
    )
    .digest("hex");
}
