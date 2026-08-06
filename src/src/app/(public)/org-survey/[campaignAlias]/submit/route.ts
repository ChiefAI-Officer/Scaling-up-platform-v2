/**
 * Assessment v7.6 — INVITED-mode submission (Task D).
 *
 * Cookie-bearing submit endpoint. Validates v6.6 strict-answer rules,
 * scores via `scoreSubmission`, writes AssessmentSubmission + flips the
 * AssessmentInvitation row to SUBMITTED in a single transaction with a
 * Postgres-level row lock (`SELECT … FOR UPDATE`) to defeat the double-
 * submit race.
 *
 * Lifecycle gate on every call — re-read invitation + campaign from DB.
 * Cookie is just an identifier; expiresAt on the cookie is not trusted.
 *
 * Error codes (HTTP 400 unless noted):
 *   EMPTY_ANSWERS, UNKNOWN_STABLE_KEY, MISSING_REQUIRED_KEY,
 *   DUPLICATE_STABLE_KEY, INVALID_TYPE, NON_INTEGER, OUT_OF_RANGE,
 *   INVALID_SCORING_CONFIG
 * 401 — no session cookie
 * 404 — session points at a vanished invitation
 * 409 — double-submit (status === SUBMITTED at lock time)
 * 410 — lifecycle gate failed
 */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getInvitationSession } from "@/lib/assessments/invitation-cookie";
import {
  ScoringValidationError,
  TemplateVersionForScoringSchema,
} from "@/lib/assessments/scoring";
import { logAudit } from "@/lib/audit";
import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import type { PagerQuestion } from "@/lib/assessments/section-pages";
import {
  SU_FULL_ALIAS,
  SU_FULL_BACKGROUND_SECTION,
} from "@/lib/assessments/assemble-survey-pages";
import {
  waveDResultsEmailEnabled,
  waveDCoachNotifyEnabled,
  assessmentSendsPaused,
  assessmentEmailDeliveryIntentsEnabled,
} from "@/lib/assessments/wave-d-feature-flags";
import { isResultsEmailApproved } from "@/lib/assessments/results-email-approval";
import { isOnScreenResultsEnabled } from "@/lib/assessments/wave-osr-flags";
import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";
import { isFindingsLogicEnabled } from "@/lib/assessments/wave-u-flags";
import { reportConfigFor } from "@/lib/assessments/report-config";
import {
  buildRespondentReportFromSubmission,
  buildReportEmailHtml,
} from "@/lib/assessments/report-email";
import {
  isScoreResult,
  type RespondentReport,
} from "@/lib/assessments/respondent-report";
import {
  buildResultsEmailHtml,
  buildCoachNotifyEmail,
} from "@/lib/assessments/results-email";
import { respondentDisplayName } from "@/lib/assessments/respondent-display-name";
import { normalizeMailbox } from "@/lib/assessments/quick-assessment-lead";
import {
  INTENT_RENDERER_CONTRACT_VERSION,
  INTENT_SNAPSHOT_SCHEMA_VERSION,
  assessmentEmailIntentPayloadHash,
  intentExpiresAt,
  sourceCommitIdentifier,
  stableCanonicalJson,
  type AuthorizationSnapshotV1,
  type ContentProvenanceV1,
} from "@/lib/assessments/assessment-email-delivery-intents";
import { inngest } from "@/inngest/client";
import { reportEmailChromeForCampaign } from "@/lib/assessments/wave-228-flags";
import {
  REPORT_STYLE_KEYS,
  type ReportStyleKey,
} from "@/lib/assessments/report-style-registry";
import { lockReportStyleForFirstCompletion } from "@/lib/assessments/report-style-lock";
import { isReportComparisonEnabled } from "@/lib/assessments/wave-report-comparison-flags";
import { createCeoReportAccessToken } from "@/lib/assessments/ceo-report-access-token";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function errorNameOnly(error: unknown, fallback = "UnknownError"): string {
  return error instanceof Error && error.name ? error.name : fallback;
}

const AnswerInputSchema = z.object({
  stableKey: z.string().min(1),
  value: z.unknown(),
});

const SubmitBodySchema = z.object({
  answers: z.array(AnswerInputSchema),
});

/**
 * Wave OSR (#71) — the coach byline name for the report cover/footer. Null when
 * there is no creator coach (admin-created campaigns) → the renderer falls back
 * to SU-logo-only rather than a broken byline.
 *
 * Intentionally NOT byte-identical to the authorized DB loader's version, which
 * is `creatorCoach ? \`${firstName} ${lastName}\` : null` with no trim: for a
 * coach row with blank names that yields " " (truthy), which `CoachLogo` then
 * trims to empty and suppresses anyway. This helper collapses that to null up
 * front. Same rendered outcome, one less way to be surprised — but do not claim
 * the two functions are identical, because they are not.
 */
function coachBylineName(
  coach: { firstName: string; lastName: string } | null | undefined,
): string | null {
  if (!coach) return null;
  const name = `${coach.firstName} ${coach.lastName}`.trim();
  return name === "" ? null : name;
}

function gateFailed(): NextResponse {
  return NextResponse.json(
    { success: false, error: "This survey is no longer available." },
    { status: 410, headers: NO_STORE_HEADERS }
  );
}

type SubmissionTransactionAbortKind = "not-found" | "gate" | "conflict";

class SubmissionTransactionAbort extends Error {
  constructor(readonly kind: SubmissionTransactionAbortKind) {
    super(kind);
    this.name = "SubmissionTransactionAbort";
  }
}

/** An outbox row ready to INSERT — fully RENDERED (subject + bodyHtml), missing
 *  only the submissionId. Task 6 prebuilds one candidate per style before the
 *  transaction, which later selects the final ordered style atomically. */
interface PreparedOutboxRow {
  recipientEmail: string;
  recipientRole: "RESPONDENT" | "OWNING_COACH";
  emailType: "ASSESSMENT_RESULTS" | "COACH_COMPLETION";
  subject: string;
  bodyHtml: string;
}

type PreparedDeliveryRow = PreparedOutboxRow & {
  canonicalRecipientMailbox: string;
  renderInputHash: string;
  contentProvenance: ContentProvenanceV1;
  /** The body carries a short-lived CEO capability and needs a second locked gate. */
  hasCeoSelfAccessUrl?: boolean;
};

interface SharedWaveDEmailRenderCache {
  /** `undefined` = not attempted, `null` = attempted but safely dropped. */
  results?: { bodyHtml: string } | null;
  coach?: {
    subject: string;
    bodyHtml: string;
    renderInputHash: string;
  } | null;
}

interface EnqueueArgs {
  campaign: {
    id: string;
    templateId: string;
    accessMode: string;
    sendResultsToRespondent: boolean;
    notifyCoachOnCompletion: boolean;
    createdByCoachId: string | null;
    creatorCoach: {
      email: string;
      firstName: string;
      lastName: string;
      profileImage: string | null;
    } | null;
    // Wave OSR: version CONTENT is no longer read here — the report model that
    // needed it is built by the caller. Only the id remains (fingerprinting).
    version: { id: string; templateId: string };
    template: {
      id: string;
      name: string;
      alias: string;
      resultsEmailSubject: string | null;
      resultsEmailBodyMarkdown: string | null;
      resultsEmailContentApproved: boolean;
      resultsEmailContentApprovedHash: string | null;
    } | null;
  };
  respondent: { email: string; firstName: string; lastName: string } | null;
  respondentId: string;
  reportRenderInputHash: string;
  respectGlobalPause: boolean;
  prepareIntentMetadata: boolean;
  renderCache: SharedWaveDEmailRenderCache;
  /**
   * Wave OSR: one prebuilt style candidate. The transaction selects exactly
   * one model and shares it between #15 email and on-screen payload.
   */
  report: RespondentReport | null;
  /** Prepared in Phase 1 only after the CEO capability gate succeeds. */
  ceoSelfAccessUrl: string | null;
}

function ceoSelfAccessUrl(token: string): string | null {
  try {
    const origin = new URL(process.env.APP_URL ?? "");
    const localHost =
      origin.hostname === "localhost" ||
      origin.hostname === "127.0.0.1" ||
      origin.hostname === "[::1]" ||
      origin.hostname.endsWith(".test");
    if (
      origin.username ||
      origin.password ||
      (origin.protocol !== "https:" &&
        !(origin.protocol === "http:" && localHost))
    ) {
      return null;
    }
    return `${origin.origin}/assessments/self-report#t=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

/**
 * Builds the Wave D results (#15) + coach-notify (#16) outbox rows for an
 * INVITED submission — RENDERING ONLY, no DB. The caller builds the closed
 * style catalog before the completion transaction so rendering does not
 * extend the campaign row-lock duration.
 *
 * Each email is independently gated and independently guarded: a render failure
 * for one is swallowed (that email is dropped) so the submission itself — and
 * the other email — are unaffected. Returns 0–2 fully-rendered rows. PURE.
 */
function buildWaveDOutboxRows({
  campaign,
  respondent,
  respondentId,
  report,
  reportRenderInputHash,
  respectGlobalPause,
  prepareIntentMetadata,
  renderCache,
  ceoSelfAccessUrl,
}: EnqueueArgs): PreparedDeliveryRow[] {
  const rows: PreparedDeliveryRow[] = [];

  // Global kill switch — nothing is enqueued while sends are paused.
  if (respectGlobalPause && assessmentSendsPaused()) return rows;

  const isInvited = campaign.accessMode === "INVITED";

  // ── #15 RESPONDENT results ────────────────────────────────────────────────
  const template = campaign.template;
  const respondentEmail = respondent?.email?.trim();
  if (
    isInvited &&
    campaign.sendResultsToRespondent &&
    waveDResultsEmailEnabled() &&
    template !== null &&
    isResultsEmailApproved(template) &&
    respondentEmail &&
    // Wave OSR: the model is now built once by the caller. A failed build
    // drops this email exactly as the old in-place try/catch did.
    report !== null
  ) {
    if (renderCache.results === undefined) {
      try {
        // Report style changes the on-screen/PDF presentation only. The email
        // renderer deliberately does not read `reportStyle`, so render its
        // byte-identical HTML once while keeping each style's canonical report
        // model and provenance hash distinct.
        const chrome = reportEmailChromeForCampaign(campaign.id);
        const { bodyHtml: reportHtml, renderError } = buildReportEmailHtml({
          report,
          recipientRole: "TAKER_COPY",
          chrome,
        });
        // M4: buildReportEmailHtml never throws — on a qualitative body-render
        // failure it degrades to a safe body + a renderError signal. Surface it
        // (the submission still succeeds) so the fallback is diagnosable.
        if (renderError) {
          console.error("[assessment-report] render-failure", {
            templateAlias: template.alias,
            reportType: reportConfigFor(template.alias).reportType,
            renderPath: "email",
            recipientRole: "RESPONDENT",
            emailType: "ASSESSMENT_RESULTS",
            campaignId: campaign.id,
            errorName: "ReportRenderError",
          });
        }
        renderCache.results =
          !renderError || !prepareIntentMetadata
            ? {
                bodyHtml: buildResultsEmailHtml({
                  bodyMarkdown: template.resultsEmailBodyMarkdown ?? "",
                  reportHtml,
                  ceoSelfAccessUrl,
                }),
              }
            : null;
      } catch (err) {
        renderCache.results = null;
        // Do NOT abort the submission — drop this email only.
        console.error("[assessment-submit] #15 results render skipped", {
          campaignId: campaign.id,
          recipientRole: "RESPONDENT",
          emailType: "ASSESSMENT_RESULTS",
          errorName: errorNameOnly(err),
        });
      }
    }

    if (renderCache.results) {
      const contentProvenance: ContentProvenanceV1 = prepareIntentMetadata
        ? {
            schemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
            templateId: template.id,
            versionId: campaign.version.id,
            templateAlias: template.alias,
            reportType: reportConfigFor(template.alias).reportType,
            approvalHash: template.resultsEmailContentApprovedHash,
            rendererContractVersion: INTENT_RENDERER_CONTRACT_VERSION,
            sourceCommit: sourceCommitIdentifier(),
            renderInputHash: reportRenderInputHash,
          }
        : {
            schemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
            templateId: template.id,
            versionId: campaign.version.id,
            templateAlias: template.alias,
            reportType: "unused-in-legacy-mode",
            approvalHash: template.resultsEmailContentApprovedHash,
            rendererContractVersion: INTENT_RENDERER_CONTRACT_VERSION,
            sourceCommit: "unused-in-legacy-mode",
            renderInputHash: "",
          };
      rows.push({
        recipientEmail: respondentEmail,
        canonicalRecipientMailbox: prepareIntentMetadata
          ? normalizeMailbox(respondentEmail)
          : "",
        recipientRole: "RESPONDENT",
        emailType: "ASSESSMENT_RESULTS",
        subject: template.resultsEmailSubject ?? "Your assessment results",
        bodyHtml: renderCache.results.bodyHtml,
        renderInputHash: prepareIntentMetadata ? reportRenderInputHash : "",
        contentProvenance,
        hasCeoSelfAccessUrl: ceoSelfAccessUrl !== null,
      });
    }
  }

  // ── #16 OWNING_COACH notify ───────────────────────────────────────────────
  const coachEmail = campaign.creatorCoach?.email?.trim();
  if (
    campaign.notifyCoachOnCompletion &&
    waveDCoachNotifyEnabled() &&
    campaign.createdByCoachId &&
    coachEmail
  ) {
    if (renderCache.coach === undefined) {
      try {
        const coachRenderInput = {
          appUrl: process.env.APP_URL ?? "",
          campaignId: campaign.id,
          respondentId,
          assessmentName: campaign.template?.name ?? "an assessment",
          // Jeff #50 — show the coach WHO completed it. respondentDisplayName
          // falls back to the email when the roster name is blank (Wave P).
          respondentName: respondentDisplayName(
            respondent?.firstName,
            respondent?.lastName,
            respondent?.email,
          ),
        };
        renderCache.coach = {
          ...buildCoachNotifyEmail(coachRenderInput),
          renderInputHash: prepareIntentMetadata
            ? stableInputHash(coachRenderInput)
            : "",
        };
      } catch (err) {
        renderCache.coach = null;
        console.error("[assessment-submit] #16 coach-notify render skipped", {
          campaignId: campaign.id,
          recipientRole: "OWNING_COACH",
          emailType: "COACH_COMPLETION",
          errorName: errorNameOnly(err),
        });
      }
    }

    if (renderCache.coach) {
      const { subject, bodyHtml, renderInputHash } = renderCache.coach;
      const contentProvenance: ContentProvenanceV1 = prepareIntentMetadata
        ? {
            schemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
            templateId: campaign.template?.id ?? campaign.templateId,
            versionId: campaign.version.id,
            templateAlias: campaign.template?.alias ?? "unknown",
            reportType: reportConfigFor(
              campaign.template?.alias ?? null,
            ).reportType,
            approvalHash: null,
            rendererContractVersion: INTENT_RENDERER_CONTRACT_VERSION,
            sourceCommit: sourceCommitIdentifier(),
            renderInputHash,
          }
        : {
            schemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
            templateId: campaign.template?.id ?? campaign.templateId,
            versionId: campaign.version.id,
            templateAlias: campaign.template?.alias ?? "unknown",
            reportType: "unused-in-legacy-mode",
            approvalHash: null,
            rendererContractVersion: INTENT_RENDERER_CONTRACT_VERSION,
            sourceCommit: "unused-in-legacy-mode",
            renderInputHash,
          };
      rows.push({
        recipientEmail: coachEmail,
        canonicalRecipientMailbox: prepareIntentMetadata
          ? normalizeMailbox(coachEmail)
          : "",
        recipientRole: "OWNING_COACH",
        emailType: "COACH_COMPLETION",
        subject,
        bodyHtml,
        renderInputHash,
        contentProvenance,
      });
    }
  }

  return rows;
}

function stableInputHash(value: unknown): string {
  const jsonCompatible = JSON.parse(JSON.stringify(value)) as unknown;
  return createHash("sha256")
    .update(stableCanonicalJson(jsonCompatible), "utf8")
    .digest("hex");
}

/**
 * C-M2: the render-input fingerprint for the prepared Wave-D email rows. The
 * #15 results row depends on the respondent toggle + the template's results-
 * email approval hash + alias + the pinned version id + resolved chrome and,
 * only for branded chrome, creator-coach presentation; the #16 coach-notify
 * row depends on the coach toggle + the owning-coach identity. Captured in
 * Phase 1 (lock-free) and re-derived UNDER the lock in Phase 2 — a field change
 * between the two means the corresponding prepared row is stale and must be
 * dropped.
 *
 * Compared by string-equality (#15 / #16 keys), so the exact field list is the
 * load-bearing contract: extend BOTH this builder and the Phase-2 locked select
 * together, or the compare silently stops covering the new input.
 */
interface EmailRenderFingerprint {
  /** Drives the #15 ASSESSMENT_RESULTS row render/gate. */
  results: string;
  /** Drives the #16 COACH_COMPLETION row render/gate. */
  coach: string;
  /**
   * Wave OSR (#71): drives the on-screen disclosure decision. Unlike the two
   * email keys this gates a RESPONSE BODY rather than an outbox row, but the
   * staleness hazard is identical — the Phase-1 read is unlocked, so an
   * operator un-ticking the box mid-submit must suppress the payload.
   */
  onScreen: string;
}

function emailRenderFingerprint(campaign: {
  id: string;
  sendResultsToRespondent: boolean;
  notifyCoachOnCompletion: boolean;
  showResultsOnScreen: boolean;
  createdByCoachId: string | null;
  creatorCoach: {
    email: string;
    firstName: string;
    lastName: string;
    profileImage: string | null;
  } | null;
  version: { id: string };
  template: {
    alias: string;
    resultsEmailContentApprovedHash: string | null;
  } | null;
}): EmailRenderFingerprint {
  const chrome = reportEmailChromeForCampaign(campaign.id);
  const brandedCoach =
    chrome === "gh228"
      ? [
          campaign.createdByCoachId,
          campaign.creatorCoach?.firstName ?? null,
          campaign.creatorCoach?.lastName ?? null,
          campaign.creatorCoach?.profileImage ?? null,
        ]
      : null;
  return {
    results: JSON.stringify([
      campaign.sendResultsToRespondent,
      campaign.template?.resultsEmailContentApprovedHash ?? null,
      campaign.template?.alias ?? null,
      campaign.version.id,
      chrome,
      brandedCoach,
    ]),
    coach: JSON.stringify([
      campaign.notifyCoachOnCompletion,
      campaign.createdByCoachId,
      campaign.creatorCoach?.email ?? null,
    ]),
    onScreen: JSON.stringify([
      campaign.showResultsOnScreen,
      campaign.template?.alias ?? null,
      campaign.version.id,
    ]),
  };
}

interface LockedInvitationForIntent {
  status: string;
  revokedAt: Date | null;
  expiresAt: Date;
  campaignId: string;
  respondentId: string;
  respondent: { email: string } | null;
  campaign: {
    templateId: string;
    accessMode: string;
    deletedAt: Date | null;
    status: string;
    closeAt: Date | null;
    sendResultsToRespondent: boolean;
    notifyCoachOnCompletion: boolean;
    createdByCoachId: string | null;
    creatorCoach: { id: string; email: string } | null;
    version: { id: string; templateId: string };
    template: {
      id: string;
      alias: string;
      resultsEmailSubject: string | null;
      resultsEmailBodyMarkdown: string | null;
      resultsEmailContentApproved: boolean;
      resultsEmailContentApprovedHash: string | null;
    };
  };
}

function intentRowAuthorizedUnderLock(
  locked: LockedInvitationForIntent,
  row: PreparedDeliveryRow,
): boolean {
  const template = locked.campaign.template;
  const identityMatches =
    locked.campaign.accessMode === "INVITED" &&
    locked.campaign.templateId === template.id &&
    locked.campaign.version.templateId === template.id &&
    row.contentProvenance.templateId === template.id &&
    row.contentProvenance.versionId === locked.campaign.version.id &&
    row.contentProvenance.templateAlias === template.alias;

  if (!identityMatches) return false;

  if (row.emailType === "ASSESSMENT_RESULTS") {
    return (
      locked.campaign.sendResultsToRespondent &&
      isResultsEmailApproved(template) &&
      template.resultsEmailContentApprovedHash !== null &&
      row.contentProvenance.approvalHash ===
        template.resultsEmailContentApprovedHash &&
      normalizeMailbox(locked.respondent?.email) ===
        row.canonicalRecipientMailbox
    );
  }

  return (
    locked.campaign.notifyCoachOnCompletion &&
    locked.campaign.createdByCoachId !== null &&
    locked.campaign.creatorCoach?.id === locked.campaign.createdByCoachId &&
    normalizeMailbox(locked.campaign.creatorCoach?.email) ===
      row.canonicalRecipientMailbox
  );
}

function buildAuthorizationSnapshotV1(input: {
  locked: LockedInvitationForIntent;
  row: PreparedDeliveryRow;
  phase2Fingerprint: EmailRenderFingerprint;
  invitationId: string;
}): AuthorizationSnapshotV1 {
  const { locked, row, phase2Fingerprint } = input;
  const template = locked.campaign.template;
  const commonFacts = {
    campaignId: locked.campaignId,
    invitationId: input.invitationId,
    respondentId: locked.respondentId,
    templateId: template.id,
    templateAlias: template.alias,
    versionId: locked.campaign.version.id,
    accessMode: "INVITED" as const,
    campaignStatus: locked.campaign.status,
    campaignDeleted: locked.campaign.deletedAt !== null,
    invitationStatus: "SUBMITTED" as const,
    invitationRevoked: locked.revokedAt !== null,
    closeAt: locked.campaign.closeAt?.toISOString() ?? null,
    invitationExpiresAt: locked.expiresAt.toISOString(),
    recipientRole: row.recipientRole,
    emailType: row.emailType,
  };
  const acceptedRenderFingerprint =
    row.emailType === "ASSESSMENT_RESULTS"
      ? phase2Fingerprint.results
      : phase2Fingerprint.coach;

  if (row.emailType === "ASSESSMENT_RESULTS") {
    const respondentResults = {
      canonicalRecipientMailbox: normalizeMailbox(locked.respondent?.email),
      sendResultsToRespondent: true as const,
      featureKey: "WAVE_D_RESULTS_EMAIL_ENABLED" as const,
      featureEnabled: true as const,
      approved: true as const,
      approvedContentHash:
        template.resultsEmailContentApprovedHash as string,
    };
    return {
      schemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
      common: {
        ...commonFacts,
        phase2Fingerprint: stableInputHash({
          common: commonFacts,
          respondentResults,
          acceptedRenderFingerprint,
        }),
      },
      respondentResults,
    };
  }

  const coachCompletion = {
    canonicalRecipientMailbox: normalizeMailbox(
      locked.campaign.creatorCoach?.email,
    ),
    notifyCoachOnCompletion: true as const,
    featureKey: "WAVE_D_COACH_NOTIFY_ENABLED" as const,
    featureEnabled: true as const,
    coachId: locked.campaign.createdByCoachId as string,
  };
  return {
    schemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
    common: {
      ...commonFacts,
      phase2Fingerprint: stableInputHash({
        common: commonFacts,
        coachCompletion,
        acceptedRenderFingerprint,
      }),
    },
    coachCompletion,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignAlias: string }> }
) {
  const intentMode = assessmentEmailDeliveryIntentsEnabled();
  try {
    const { campaignAlias } = await params;
    const session = await getInvitationSession(campaignAlias);

    if (!session.invitationId || session.campaignAlias !== campaignAlias) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const parsed = SubmitBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Malformed answers payload" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const { answers } = parsed.data;

    if (answers.length === 0) {
      return NextResponse.json(
        { success: false, error: "EMPTY_ANSWERS" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const invitationId = session.invitationId;

    try {
      // ── Phase 1 (no lock, no tx): read → gate → score → render candidates ─
      // The tx below locks, re-validates the gates/conflict, freezes the final
      // appearance, and selects one prebuilt candidate. Versions are immutable
      // once published, so the ScoreResult here is safe to re-use.
      const invitation = await db.assessmentInvitation.findUnique({
        where: { id: invitationId },
        include: {
          // Wave D #15: the respondent's email is the #15 recipient.
          respondent: {
            // Wave OSR (#71): jobTitle joins the byline block on the report cover.
            select: {
              email: true,
              firstName: true,
              lastName: true,
              jobTitle: true,
            },
          },
          campaign: {
            include: {
              // Wave OSR (#71): the org name fills the cover subtitle (an empty
              // one renders an orphan " · ").
              organization: { select: { id: true, name: true } },
              // Wave D: per-campaign send toggles + the owning coach (#16).
              // Wave OSR (#71): profileImage + names build the coach byline that
              // PR #230 shipped on the coach/admin report (Jeff #63/#67/#73/#78/#81)
              // — without them the respondent's copy is NOT the same artifact.
              creatorCoach: {
                select: {
                  id: true,
                  email: true,
                  profileImage: true,
                  firstName: true,
                  lastName: true,
                },
              },
              version: {
                select: {
                  id: true,
                  templateId: true,
                  questions: true,
                  sections: true,
                  scoringConfig: true,
                },
              },
              // Wave D #15: admin-authored results email + approval gate.
              template: {
                select: {
                  id: true,
                  name: true,
                  alias: true,
                  resultsEmailSubject: true,
                  resultsEmailBodyMarkdown: true,
                  resultsEmailContentApproved: true,
                  resultsEmailContentApprovedHash: true,
                },
              },
            },
          },
        },
      });

      if (!invitation || invitation.campaign.alias !== campaignAlias) {
        return NextResponse.json(
          { success: false, error: "Invitation not found" },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const nowPre = new Date();
      // SEC-M6: a soft-deleted campaign is no longer available.
      const preGateFailed =
        invitation.campaign.deletedAt !== null ||
        invitation.revokedAt !== null ||
        nowPre >= invitation.expiresAt ||
        invitation.campaign.status !== "ACTIVE" ||
        nowPre < invitation.campaign.openAt ||
        (invitation.campaign.closeAt !== null &&
          nowPre >= invitation.campaign.closeAt);
      if (preGateFailed) return gateFailed();
      if (invitation.status === "SUBMITTED") {
        return NextResponse.json(
          { success: false, error: "Already submitted" },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      // Build the scoring input — pass ALL question types; Phase B
      // scoreSubmission skips non-SLIDER_LIKERT answers gracefully.
      const allQuestions = invitation.campaign.version.questions as Array<
        Record<string, unknown>
      >;

      // #79 / Wave J-1 — SU-Full has a CEO-only S_BACKGROUND section that
      // contains a REQUIRED NUMBER (Q_FTE_CONTRACT). The client hides that
      // section from non-CEO respondents (org-survey-client + assembleSurveyPages
      // both drop it), so their payload never carries those keys. The
      // submit/scoring path must apply the SAME audience policy BEFORE the
      // required-key check, or every non-CEO respondent trips
      // MISSING_REQUIRED_KEY and can never submit. Only SU-Full needs the
      // participant lookup — every other template scores the full set unchanged.
      let scoredQuestions = allQuestions;
      let scoredSections = invitation.campaign.version.sections as Array<
        Record<string, unknown>
      >;
      let phase1IsCeo = false;
      if (invitation.campaign.template?.alias === SU_FULL_ALIAS) {
        const participant = await db.assessmentCampaignParticipant.findUnique({
          where: {
            campaignId_respondentId: {
              campaignId: invitation.campaignId,
              respondentId: invitation.respondentId,
            },
          },
          select: { isCEO: true },
        });
        phase1IsCeo = participant?.isCEO === true;
        // Fail-safe: no participant row → treat as non-CEO (drop the section),
        // matching the survey-render policy (me/route.ts + org-survey-client).
        if (!phase1IsCeo) {
          // Mirror assembleSurveyPages EXACTLY: drop the CEO-only section from
          // BOTH the questions AND the sections, so scoring never sees an empty
          // S_BACKGROUND section that a non-CEO respondent never had.
          scoredQuestions = allQuestions.filter(
            (q) => q.sectionStableKey !== SU_FULL_BACKGROUND_SECTION,
          );
          scoredSections = scoredSections.filter(
            (s) => s.stableKey !== SU_FULL_BACKGROUND_SECTION,
          );
        }
      }

      const versionParsed = TemplateVersionForScoringSchema.safeParse({
        questions: scoredQuestions,
        sections: scoredSections,
        scoringConfig: invitation.campaign.version.scoringConfig,
      });
      if (!versionParsed.success) {
        return NextResponse.json(
          { success: false, error: "Template version schema invalid" },
          { status: 500, headers: NO_STORE_HEADERS }
        );
      }
      // Prune-then-score via the ONE shared seam (spec 19ac). rawAnswers stays
      // the PRUNED set (persisted + emitted downstream). May throw
      // ScoringValidationError → caught by outer catch.
      const { result: scoreResult, prunedAnswers: rawAnswers } = computeScoreResult(
        versionParsed.data,
        scoredQuestions as unknown as PagerQuestion[],
        answers.map((a) => ({ stableKey: a.stableKey, value: a.value })),
      );

      // Single instant shared by the report's submittedAt + the invitation's
      // SUBMITTED stamp, so the emailed report date matches the DB row.
      const submittedAt = new Date();

      // Wave OSR (#71): prebuild one model per closed-catalog style outside the
      // transaction. The final ordered style selects ONE model, shared between
      // #15 results email and on-screen payload — see ADR-0027.
      //
      // Each build is wrapped because a model failure must NEVER fail the
      // submission. A null selected candidate degrades to: no #15 email row,
      // no on-screen payload, normal thank-you.
      // #7: only build when some consumer could actually use it. Disclosure is
      // still decided under the lock — a Phase-1-false / Phase-2-true flip is
      // already suppressed by the fingerprint compare, so guarding on the
      // (unlocked) Phase-1 read cannot leak a report that should be hidden. It
      // only avoids building a model nobody reads, which today is every
      // submission (no template has approved results-email copy).
      //
      // 🔑 LOAD-BEARING INVARIANT, easy to break from a distance:
      // `showResultsOnScreen` MUST remain part of `emailRenderFingerprint`'s
      // `onScreen` value. That is the whole reason this unlocked read is safe —
      // `discloseOnScreen` requires phase1.onScreen === phase2.onScreen, so
      // fingerprint equality implies the Phase-1 read was also true, which
      // implies `mayNeedReport` was true. Remove the toggle from the fingerprint
      // (or add a disclosure condition that is not fingerprinted) and this
      // becomes a SILENT missing-report bug: the respondent submits with the
      // toggle on and gets the thank-you page, with no error logged anywhere.
      const mayNeedReport =
        (isOnScreenResultsEnabled() &&
          invitation.campaign.showResultsOnScreen === true) ||
        invitation.campaign.sendResultsToRespondent === true;

      // Prepare the short-lived CEO capability before rendering. It binds the
      // invitation (the submission does not exist yet); Phase 2 revalidates the
      // CEO designation under lock before any capability-bearing row persists.
      const phase1CeoSelfAccessAuthorized =
        invitation.campaign.template?.alias === SU_FULL_ALIAS &&
        phase1IsCeo &&
        invitation.campaign.accessMode === "INVITED" &&
        (invitation.campaign.showResultsOnScreen ||
          invitation.campaign.sendResultsToRespondent) &&
        isReportComparisonEnabled({
          organizationId: invitation.campaign.organization.id,
          templateId: invitation.campaign.templateId,
        });
      let preparedCeoSelfAccessUrl: string | null = null;
      if (phase1CeoSelfAccessAuthorized) {
        try {
          preparedCeoSelfAccessUrl = ceoSelfAccessUrl(
            createCeoReportAccessToken({
              focusCampaignId: invitation.campaign.id,
              invitationId,
              respondentId: invitation.respondentId,
            }),
          );
        } catch (err) {
          console.warn(
            "[assessment-submit] CEO self-access link unavailable — submission unaffected",
            {
              campaignId: invitation.campaign.id,
              invitationId,
              errorName: errorNameOnly(err),
            },
          );
        }
      }

      let respondentReport: RespondentReport | null = null;

      // Prebuild the closed style catalog outside the transaction. The lock
      // later selects exactly one immutable candidate using the final ordered
      // style, keeping CPU-heavy report/email rendering off the row lock while
      // preserving atomic submission + delivery persistence.
      const reportCandidates = new Map<
        ReportStyleKey,
        { report: RespondentReport | null; rows: PreparedDeliveryRow[] }
      >();
      const sharedEmailRenders: SharedWaveDEmailRenderCache = {};
      for (const reportStyle of REPORT_STYLE_KEYS) {
        let report: RespondentReport | null = null;
        let reportRenderInputHash = "";
        if (mayNeedReport) {
          const reportModelInput = {
            result: scoreResult as never,
            publicTaker: {
              firstName: invitation.respondent?.firstName ?? "",
              lastName: invitation.respondent?.lastName ?? "",
              email: invitation.respondent?.email ?? "",
            },
            assessmentName:
              invitation.campaign.template?.name ?? "an assessment",
            templateAlias: invitation.campaign.template?.alias ?? "",
            reportStyle,
            campaignLabel: null,
            sections: invitation.campaign.version.sections,
            questions: invitation.campaign.version.questions,
            scoringConfig: invitation.campaign.version.scoringConfig,
            rawAnswers,
            submittedAt,
            submissionId: "",
            referringCoachEmail: null,
            companyName: invitation.campaign.organization?.name ?? "",
            jobTitle: invitation.respondent?.jobTitle ?? null,
            coachLogoUrl:
              invitation.campaign.creatorCoach?.profileImage ?? null,
            coachName: coachBylineName(invitation.campaign.creatorCoach),
            degraded: !isScoreResult(scoreResult),
          };
          if (intentMode) {
            reportRenderInputHash = stableInputHash(reportModelInput);
          }
          try {
            report = buildRespondentReportFromSubmission(reportModelInput);
          } catch (err) {
            console.error(
              "[assessment-submit] respondent report candidate build failed",
              {
                campaignId: invitation.campaign.id,
                versionId: invitation.campaign.version.id,
                reportStyle,
                errorName: errorNameOnly(err),
              },
            );
          }
        }

        reportCandidates.set(reportStyle, {
          report,
          rows: buildWaveDOutboxRows({
            campaign: invitation.campaign,
            respondent: invitation.respondent,
            respondentId: invitation.respondentId,
            report,
            reportRenderInputHash,
            respectGlobalPause: !intentMode,
            prepareIntentMetadata: intentMode,
            renderCache: sharedEmailRenders,
            ceoSelfAccessUrl: preparedCeoSelfAccessUrl,
          }),
        });
      }

      // C-M2: capture the Phase-1 render-input fingerprint before opening the
      // transaction. Phase 2 re-reads the same fields UNDER the lock and drops
      // any row built from those Phase-1 inputs when they changed during the
      // window (approval revoked/edited, toggle flipped, pinned version
      // swapped). The submission still commits — only the stale email row is
      // skipped.
      const phase1Fingerprint = emailRenderFingerprint(invitation.campaign);

      // ── Phase 2 (locked tx): re-validate → freeze → create submission ─────
      const result = await db.$transaction(async (tx) => {
        // Lock the campaign row before any other transactional operation, so a
        // concurrent report-style update deterministically orders with this
        // first completion. This must remain in this transaction: any later
        // failed validation or write then rolls the freeze back with the submit.
        const reportStyle = await lockReportStyleForFirstCompletion(
          tx,
          invitation.campaignId,
          submittedAt,
        );

        // SELECT FOR UPDATE on the invitation row — Postgres-level lock to
        // prevent concurrent submit races for the same invitation.
        await tx.$executeRaw`SELECT id FROM assessment_invitations WHERE id = ${invitationId} FOR UPDATE`;

        // Re-read the gate-relevant fields UNDER the lock (the Phase-1 read was
        // unlocked; a concurrent submit / revoke / close could have raced).
        const locked = await tx.assessmentInvitation.findUnique({
          where: { id: invitationId },
          select: {
            status: true,
            revokedAt: true,
            expiresAt: true,
            campaignId: true,
            respondentId: true,
            respondent: { select: { email: true } },
            campaign: {
              select: {
                id: true,
                alias: true,
                templateId: true,
                organizationId: true,
                accessMode: true,
                deletedAt: true,
                status: true,
                openAt: true,
                closeAt: true,
                // C-M2: capture email render inputs under the lock so the
                // selected #15/#16 candidate can be validated before INSERT.
                sendResultsToRespondent: true,
                notifyCoachOnCompletion: true,
                // Wave OSR (#71): the on-screen disclosure decision is made
                // from THIS locked read, never from the Phase-1 read.
                showResultsOnScreen: true,
                createdByCoachId: true,
                creatorCoach: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    profileImage: true,
                  },
                },
                version: { select: { id: true, templateId: true } },
                template: {
                  select: {
                    id: true,
                    alias: true,
                    resultsEmailSubject: true,
                    resultsEmailBodyMarkdown: true,
                    resultsEmailContentApproved: true,
                    resultsEmailContentApprovedHash: true,
                  },
                },
              },
            },
          },
        });

        if (!locked || locked.campaign.alias !== campaignAlias) {
          throw new SubmissionTransactionAbort("not-found");
        }
        const now = new Date();
        if (
          locked.campaign.deletedAt !== null ||
          locked.revokedAt !== null ||
          now >= locked.expiresAt ||
          locked.campaign.status !== "ACTIVE" ||
          now < locked.campaign.openAt ||
          (locked.campaign.closeAt !== null && now >= locked.campaign.closeAt)
        ) {
          throw new SubmissionTransactionAbort("gate");
        }
        if (locked.status === "SUBMITTED") {
          throw new SubmissionTransactionAbort("conflict");
        }

        const selectedCandidate = reportCandidates.get(reportStyle);
        if (!selectedCandidate) {
          const candidateError = new Error(
            `Missing report candidate for ${reportStyle}`,
          );
          candidateError.name = "MissingReportCandidateError";
          throw candidateError;
        }
        respondentReport = selectedCandidate.report;
        const preparedRows = selectedCandidate.rows;

        let ceoSelfAccessAuthorized = false;
        if (preparedCeoSelfAccessUrl !== null) {
          // CEO is a campaign-participant designation, never a platform role.
          // Lock its exact row before reading it: an isCEO revocation must queue
          // behind this submit transaction instead of committing between our
          // authorization decision and the capability-bearing outbox INSERT.
          await tx.$executeRaw`SELECT id FROM assessment_campaign_participants WHERE campaign_id = ${locked.campaignId} AND respondent_id = ${locked.respondentId} FOR UPDATE`;
          // This current locked read is the authorization decision for every
          // capability-bearing email row and the response disclosure below.
          const lockedParticipant = await tx.assessmentCampaignParticipant.findUnique({
            where: {
              campaignId_respondentId: {
                campaignId: locked.campaignId,
                respondentId: locked.respondentId,
              },
            },
            select: { isCEO: true },
          });
          ceoSelfAccessAuthorized =
            locked.campaign.template?.alias === SU_FULL_ALIAS &&
            isReportComparisonEnabled({
              organizationId: locked.campaign.organizationId,
              templateId: locked.campaign.templateId,
            }) &&
            lockedParticipant?.isCEO === true &&
            locked.campaign.accessMode === "INVITED" &&
            (locked.campaign.showResultsOnScreen ||
              locked.campaign.sendResultsToRespondent);
        }

        // One explicit ledger instant owns all intent lifecycle timestamps.
        // Report/invitation submittedAt remains the earlier disclosure instant;
        // intent retention is exactly 30 days from this persisted creation time.
        const intentCreatedAt = new Date();

        const submission = await tx.assessmentSubmission.create({
          data: {
            campaignId: locked.campaignId,
            respondentId: locked.respondentId,
            invitationId,
            answers: rawAnswers as unknown as object, // ALL answers stored
            result: scoreResult as unknown as object,
            submittedAt,
          },
          select: { id: true },
        });

        // Capture the final gate/render fingerprint while the invitation and
        // campaign state are locked. Post-commit rendering uses this immutable
        // decision snapshot without extending the row-lock duration.
        const phase2Fingerprint = emailRenderFingerprint(locked.campaign);
        const rowsToPersist = preparedRows.filter((row) => {
          if (row.hasCeoSelfAccessUrl && !ceoSelfAccessAuthorized) {
            console.warn(
              `[assessment-submit] CEO self-access results row dropped — authorization changed under lock (campaignId=${locked.campaignId})`,
            );
            return false;
          }
          if (
            row.emailType === "ASSESSMENT_RESULTS" &&
            phase2Fingerprint.results !== phase1Fingerprint.results
          ) {
            console.warn(
              `[assessment-submit] #15 results row dropped — render inputs changed under lock (campaignId=${locked.campaignId})`,
            );
            return false;
          }
          if (
            row.emailType === "COACH_COMPLETION" &&
            phase2Fingerprint.coach !== phase1Fingerprint.coach
          ) {
            console.warn(
              `[assessment-submit] #16 coach-notify row dropped — render inputs changed under lock (campaignId=${locked.campaignId})`,
            );
            return false;
          }
          if (
            intentMode &&
            !intentRowAuthorizedUnderLock(
              locked as LockedInvitationForIntent,
              row,
            )
          ) {
            console.warn(
              `[assessment-submit] delivery intent row dropped — authorization inputs changed under lock (campaignId=${locked.campaignId}, recipientRole=${row.recipientRole})`,
            );
            return false;
          }
          return true;
        });

        if (intentMode) {
          for (const row of rowsToPersist) {
            const snapshot = buildAuthorizationSnapshotV1({
              locked: locked as LockedInvitationForIntent,
              row,
              phase2Fingerprint,
              invitationId,
            });
            await tx.assessmentEmailDeliveryIntent.create({
              data: {
                submissionId: submission.id,
                campaignId: locked.campaignId,
                invitationId,
                respondentId: locked.respondentId,
                recipientEmail: row.recipientEmail,
                recipientRole: row.recipientRole,
                emailType: row.emailType,
                subject: row.subject,
                bodyHtml: row.bodyHtml,
                payloadHash: assessmentEmailIntentPayloadHash({
                  snapshotSchemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
                  recipientRole: row.recipientRole,
                  emailType: row.emailType,
                  recipientEmail: row.recipientEmail,
                  subject: row.subject,
                  bodyHtml: row.bodyHtml,
                }),
                snapshotSchemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
                rendererContractVersion: INTENT_RENDERER_CONTRACT_VERSION,
                authorizationSnapshot: snapshot,
                contentProvenance: row.contentProvenance,
                createdAt: intentCreatedAt,
                nextAttemptAt: intentCreatedAt,
                expiresAt: intentExpiresAt(intentCreatedAt),
              },
            });
          }
        } else {
          for (const row of rowsToPersist) {
            try {
              await tx.assessmentEmailOutbox.create({
                data: {
                  submissionId: submission.id,
                  recipientEmail: row.recipientEmail,
                  recipientRole: row.recipientRole,
                  emailType: row.emailType,
                  subject: row.subject,
                  bodyHtml: row.bodyHtml,
                },
              });
              const alias = locked.campaign.template?.alias ?? null;
              console.info("[assessment-report] enqueued", {
                templateAlias: alias,
                reportType: reportConfigFor(alias).reportType,
                emailType: row.emailType,
                recipientRole: row.recipientRole,
                versionId: locked.campaign.version?.id ?? null,
              });
            } catch (err) {
              // Every row reaching this point is fully rendered and authorized.
              // A persistence failure therefore has no safe "skip" outcome:
              // committing would lose the required delivery with no durable
              // retry obligation. Abort so the invitation stays retryable.
              console.error("[assessment-submit] outbox enqueue FAILED IN-TX", {
                submissionId: submission.id,
                campaignId: locked.campaignId,
                invitationId,
                recipientRole: row.recipientRole,
                emailType: row.emailType,
                consequence:
                  "transaction aborted — this submission will NOT commit and the respondent must resubmit",
                errorName: errorNameOnly(err),
              });
              throw err;
            }
          }
        }

        await tx.assessmentInvitation.update({
          where: { id: invitationId },
          data: { status: "SUBMITTED", submittedAt },
        });

        // ── Wave OSR (#71): decide on-screen disclosure HERE, under the lock.
        // Three independent conditions, all required:
        //   1. the flag (server-side; there is no client-visible lever),
        //   2. the LOCKED toggle value — not the Phase-1 read,
        //   3. an unchanged fingerprint, so a flip inside the Phase-1 → Phase-2
        //      window suppresses the payload just like a stale email row.
        // The report is never returned "universally with the client hiding it".
        const onScreenFlagOn = isOnScreenResultsEnabled();
        const discloseOnScreen =
          onScreenFlagOn &&
          locked.campaign.showResultsOnScreen === true &&
          phase2Fingerprint.onScreen === phase1Fingerprint.onScreen;

        if (
          !discloseOnScreen &&
          onScreenFlagOn &&
          phase2Fingerprint.onScreen !== phase1Fingerprint.onScreen
        ) {
          console.warn(
            `[assessment-submit] on-screen report suppressed — disclosure inputs changed under lock (campaignId=${locked.campaignId})`
          );
        }

        return {
          kind: "ok" as const,
          submissionId: submission.id,
          invitationId,
          campaignId: locked.campaignId,
          createdIntentCount: intentMode ? rowsToPersist.length : 0,
          discloseOnScreen,
          ceoSelfAccessAuthorized,
        };
      }).catch((error) => {
        if (!(error instanceof SubmissionTransactionAbort)) throw error;
        switch (error.kind) {
          case "not-found":
            return { kind: "not-found" as const };
          case "gate":
            return { kind: "gate" as const };
          case "conflict":
            return { kind: "conflict" as const };
        }
      });

      if (result.kind === "not-found") {
        return NextResponse.json(
          { success: false, error: "Invitation not found" },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      if (result.kind === "gate") return gateFailed();
      if (result.kind === "conflict") {
        return NextResponse.json(
          { success: false, error: "Already submitted" },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      await logAudit({
        entityType: "AssessmentSubmission",
        entityId: result.submissionId,
        action: "CREATE",
        performedBy: `invitation:${result.invitationId}`,
        changes: {
          campaignId: result.campaignId,
          invitationId: result.invitationId,
        },
      });

      if (intentMode && result.createdIntentCount > 0) {
        try {
          await inngest.send({
            name: "assessment/email-delivery-intent.created",
            data: { submissionId: result.submissionId },
          });
        } catch (error) {
          console.error(
            "[assessment-submit] delivery-intent event dispatch failed",
            {
              submissionId: result.submissionId,
              campaignId: result.campaignId,
              invitationId: result.invitationId,
              errorName: errorNameOnly(error, "UnknownDispatchError"),
            },
          );
        }
      }

      // Wave OSR (#71): attach the respondent's OWN report for in-place
      // rendering when the locked decision permitted it and the model built.
      // Only ever this respondent's individual result — never cohort/aggregate
      // data, which is why CEO_ONLY needs no check here (spec 19an §3).
      //
      // NO AuditLog row is written for this view: there is no report ROUTE, so
      // the Report access gate (ADR-0012) was never in the path, and the viewer
      // is the data subject reading their own data. The log below records that a
      // payload was ISSUED — it is not, and must not be described as, proof the
      // respondent VIEWED it.
      const onScreenReport =
        result.discloseOnScreen && respondentReport !== null
          ? respondentReport
          : undefined;
      const reportStylesAvailable = isReportStylesEnabled({
        templateId: invitation.campaign.templateId,
        campaignId: invitation.campaign.id,
      });
      const reportFindingsAvailable = isFindingsLogicEnabled();

      if (onScreenReport) {
        console.info("[assessment-report] onscreen_report_payload_issued", {
          templateAlias: invitation.campaign.template?.alias ?? null,
          reportType: reportConfigFor(
            invitation.campaign.template?.alias ?? null
          ).reportType,
          campaignId: result.campaignId,
          versionId: invitation.campaign.version?.id ?? null,
        });
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            submissionId: result.submissionId,
            reportStylesAvailable,
            reportFindingsAvailable,
            ...(onScreenReport ? { report: onScreenReport } : {}),
            ...(result.discloseOnScreen &&
            result.ceoSelfAccessAuthorized &&
            preparedCeoSelfAccessUrl
              ? { ceoSelfAccessUrl: preparedCeoSelfAccessUrl }
              : {}),
          },
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    } catch (err) {
      if (err instanceof ScoringValidationError) {
        return NextResponse.json(
          { success: false, error: err.code, details: err.details },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("[assessment-submit] error", {
      errorName: errorNameOnly(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to submit answers" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
