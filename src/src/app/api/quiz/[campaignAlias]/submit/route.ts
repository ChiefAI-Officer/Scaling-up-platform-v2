/**
 * Assessment v7.6 — PUBLIC quiz submission.
 *
 * Anonymous public-mode submit. The campaign's accessMode MUST be PUBLIC.
 * No invitation token; the visitor provides their own name + email. We
 * create an AssessmentSubmission with respondentId=null + invitationId=null
 * and store {firstName, lastName, email} in the publicTaker JSON column.
 *
 * Task 6 additions (Quick Assessment lead pipeline):
 *  (a) Response includes full ScoreResult + Cache-Control: no-store.
 *  (b) Client-supplied idempotencyKey — duplicate write (P2002) is silently
 *      de-duped: returns the existing submission without re-auditing or
 *      re-enqueueing.
 *  (c) Audit row written after commit (fire-and-forget).
 *  (d) Lead-notification outbox rows enqueued IN THE SAME TRANSACTION as the
 *      submission (transactional outbox pattern).
 *  (e) Inngest event fired after commit to drain the outbox.
 *
 * Body:
 *   {
 *     publicTaker: { firstName, lastName, email },
 *     answers: Array<{ stableKey, value }>,
 *     referringCoachEmail?: string,
 *     idempotencyKey?: string   (NEW — client-supplied; max 200 chars)
 *   }
 *
 * Status outcomes:
 *   - 404 CAMPAIGN_NOT_FOUND — alias unknown, or template/version missing
 *   - 403 NOT_PUBLIC — campaign is INVITED-only
 *   - 410 NOT_OPEN — campaign is DRAFT, CLOSED, before openAt, or past closeAt
 *   - 400 — invalid body or scoring validation failure
 *   - 200 { submissionId, scoreResult, redirectUrl }
 */

import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  checkDistributedDualRateLimit,
  getClientIdentifier,
  RateLimits,
  withRateLimit,
} from "@/lib/rate-limit";
import {
  ScoringValidationError,
  TemplateVersionForScoringSchema,
} from "@/lib/assessments/scoring";
import {
  findActiveCoachByEmail,
  buildLeadEmail,
  buildPublicLeadCoachNotification,
  lowestDecision,
  normalizeMailbox,
} from "@/lib/assessments/quick-assessment-lead";
import {
  buildReportEmailHtml,
  buildRespondentReportFromSubmission,
} from "@/lib/assessments/report-email";
import { logAudit } from "@/lib/audit";
import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import { resolvePublicAttribution } from "@/lib/assessments/public-attribution";
import {
  resolvePublicLeadsState,
  type PublicLeadsState,
} from "@/lib/assessments/public-leads-state";
import {
  fingerprintPublicSubmit,
  PUBLIC_SUBMIT_FINGERPRINT_VERSION,
} from "@/lib/assessments/public-submit-fingerprint";
import type { PagerQuestion } from "@/lib/assessments/section-pages";
import { inngest } from "@/inngest/client";
import {
  readJsonBodyCapped,
  RequestBodyTooLargeError,
} from "@/lib/http/read-json-body-capped";

const PUBLIC_SUBMIT_MAX_BYTES = 256 * 1024;

class HeldBacklogFullError extends Error {
  constructor() {
    super("Public-lead held backlog is full");
    this.name = "HeldBacklogFullError";
  }
}

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

const PublicSubmitBodySchema = z.object({
  publicTaker: z.object({
    firstName: z.string().min(1).max(100).trim(),
    lastName: z.string().min(1).max(100).trim(),
    email: z.string().email().max(320).trim().toLowerCase(),
  }),
  answers: z
    .array(
      z.object({
        stableKey: z.string().min(1).max(200),
        value: z.union([
          z.number().finite(),
          z.boolean(),
          z.string().max(10_000),
          z.array(z.string().max(2_000)).max(100),
          z.null(),
        ]),
      }),
    )
    .min(1)
    .max(500),
  referringCoachEmail: z.string().email().max(320).optional().nullable(),
  referralKey: z.string().min(1).max(256).trim().optional().nullable(),
  // Task 6(b): client-supplied idempotency key (optional)
  idempotencyKey: z.string().min(1).max(200).optional(),
});

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignAlias: string }> },
) {
  try {
    // Public endpoint — same rate-limit class as other public submission endpoints.
    const rate = await withRateLimit(request, RateLimits.standard);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rate.headers },
      );
    }

    const { campaignAlias } = await params;
    let raw: unknown;
    try {
      raw = await readJsonBodyCapped(request, PUBLIC_SUBMIT_MAX_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json(
          { success: false, error: "REQUEST_TOO_LARGE" },
          { status: 413 },
        );
      }
      raw = {};
    }
    const parsed = PublicSubmitBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // -----------------------------------------------------------------------
    // Campaign gate checks
    // -----------------------------------------------------------------------
    const campaign = await db.assessmentCampaign.findUnique({
      where: { alias: campaignAlias },
      select: {
        id: true,
        status: true,
        accessMode: true,
        openAt: true,
        closeAt: true,
        templateId: true,
        versionId: true,
        deletedAt: true,
        template: { select: { name: true, alias: true } },
      },
    });
    // SEC-M6: a soft-deleted campaign is invisible — treat as not-found.
    if (!campaign || campaign.deletedAt !== null) {
      return NextResponse.json(
        { success: false, error: "CAMPAIGN_NOT_FOUND" },
        { status: 404 },
      );
    }
    if (campaign.accessMode !== "PUBLIC") {
      return NextResponse.json(
        { success: false, error: "NOT_PUBLIC" },
        { status: 403 },
      );
    }
    if (campaign.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "NOT_OPEN" },
        { status: 410 },
      );
    }
    const now = new Date();
    if (campaign.openAt > now) {
      return NextResponse.json(
        { success: false, error: "NOT_OPEN" },
        { status: 410 },
      );
    }
    if (campaign.closeAt && campaign.closeAt < now) {
      return NextResponse.json(
        { success: false, error: "NOT_OPEN" },
        { status: 410 },
      );
    }

    // -----------------------------------------------------------------------
    // Version load + scoring schema validation
    // -----------------------------------------------------------------------
    const version = await db.assessmentTemplateVersion.findUnique({
      where: { id: campaign.versionId },
      select: {
        id: true,
        questions: true,
        sections: true,
        scoringConfig: true,
        publishedAt: true,
      },
    });
    if (!version || version.publishedAt === null) {
      return NextResponse.json(
        { success: false, error: "CAMPAIGN_NOT_FOUND" },
        { status: 404 },
      );
    }

    const allQuestions = version.questions as Array<Record<string, unknown>>;
    const versionParsed = TemplateVersionForScoringSchema.safeParse({
      questions: allQuestions,
      sections: version.sections,
      scoringConfig: version.scoringConfig,
    });
    if (!versionParsed.success) {
      return NextResponse.json(
        { success: false, error: "Template version schema invalid" },
        { status: 500 },
      );
    }

    // -----------------------------------------------------------------------
    // Prune-then-score via the ONE shared seam (spec 19ac). Wave W (C3/D4):
    // drop answers whose question is hidden by its authored showIf BEFORE
    // every side effect (scoring, email rows, persistence) — a crafted
    // submit must not smuggle hidden-question answers into reports. Unknown
    // stableKeys are kept for scoreSubmission's UNKNOWN_STABLE_KEY rejection;
    // no-op (same ref) when the version has no showIf.
    // -----------------------------------------------------------------------
    let result;
    let submittedAnswers;
    try {
      ({ result, prunedAnswers: submittedAnswers } = computeScoreResult(
        versionParsed.data,
        allQuestions as unknown as PagerQuestion[],
        data.answers,
      ));
    } catch (err) {
      if (err instanceof ScoringValidationError) {
        return NextResponse.json(
          {
            success: false,
            error: err.code,
            details: err.details,
          },
          { status: 400 },
        );
      }
      throw err;
    }

    // -----------------------------------------------------------------------
    // Build outbox payloads (pure helpers, no I/O)
    // -----------------------------------------------------------------------
    const assessmentName =
      campaign.template?.name ?? "Scaling Up Quick Assessment";
    // Template alias drives reportConfigFor (scored vs qualitative) in the email
    // path. alias is a non-null column on AssessmentTemplate; empty-string
    // fallback yields the scored default if the relation is somehow absent.
    const templateAlias = campaign.template?.alias ?? "";

    // SU team address: prefer QUICK_ASSESSMENT_TEAM_EMAIL, fall back to
    // ESCALATION_EMAIL, then ADMIN_EMAIL. Empty string → no SU_TEAM row enqueued.
    const suTeamAddress =
      process.env.QUICK_ASSESSMENT_TEAM_EMAIL ||
      process.env.ESCALATION_EMAIL ||
      process.env.ADMIN_EMAIL ||
      "";

    const lowest = lowestDecision(result.perDomain ?? []);
    const domainInputs = (result.perDomain ?? []).map((d) => ({
      label: d.label,
      averagePoints: d.averagePoints,
    }));

    const suEmail = suTeamAddress.trim().toLowerCase();
    const takerEmail = normalizeMailbox(data.publicTaker.email);
    let publicLeadsEnv = process.env;
    let initialPublicLeadsState = resolvePublicLeadsState(publicLeadsEnv, {
      coachId: null,
    });
    const canaryConfigured = Boolean(
      process.env.WAVE_PUBLIC_LEADS_CANARY_COACH_IDS?.trim(),
    );
    if (
      (!initialPublicLeadsState.legacyDelivery || canaryConfigured) &&
      initialPublicLeadsState.mode !== "POLICY_UNAVAILABLE"
    ) {
      const limiterSecret =
        process.env.PUBLIC_LEADS_LIMITER_SECRET?.trim() ?? "";
      try {
        if (!limiterSecret) {
          throw new Error("PUBLIC_LEADS_LIMITER_SECRET_MISSING");
        }
        const digest = (value: string) =>
          createHmac("sha256", limiterSecret).update(value).digest("hex");
        const distributed = await checkDistributedDualRateLimit({
          campaignKey: digest(
            `${campaign.id}:${getClientIdentifier(request)}`,
          ),
          emailKey: digest(`${campaign.id}:${takerEmail}`),
          intervalMs: 60_000,
          campaignMax: Number(
            process.env.PUBLIC_LEADS_CAMPAIGN_RATE_LIMIT ?? 120,
          ),
          emailMax: Number(process.env.PUBLIC_LEADS_EMAIL_RATE_LIMIT ?? 10),
        });
        if (!distributed.success) {
          return NextResponse.json(
            { success: false, error: "Too many requests" },
            {
              status: 429,
              headers: distributed.retryAfter
                ? { "Retry-After": String(distributed.retryAfter) }
                : {},
            },
          );
        }
      } catch (error) {
        console.error("[public-leads] distributed limiter unavailable", {
          errorClass:
            error instanceof Error ? error.constructor.name : "unknown",
        });
        publicLeadsEnv = {
          ...process.env,
          PUBLIC_LEADS_DISTRIBUTED_LIMITER_READY: "0",
        };
        initialPublicLeadsState = resolvePublicLeadsState(publicLeadsEnv, {
          coachId: null,
        });
      }
    }
    const fingerprintSecret =
      process.env.PUBLIC_LEADS_IDEMPOTENCY_SECRET?.trim() ?? "";
    if (
      (!initialPublicLeadsState.legacyDelivery || canaryConfigured) &&
      !fingerprintSecret
    ) {
      return NextResponse.json(
        { success: false, error: "SUBMISSION_TEMPORARILY_UNAVAILABLE" },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }
    const requestFingerprint = fingerprintSecret
      ? fingerprintPublicSubmit({
          secret: fingerprintSecret,
          publicTaker: data.publicTaker,
          answers: submittedAnswers,
          referralCredential:
            data.referralKey ?? data.referringCoachEmail ?? null,
        })
      : null;
    const heldGlobalCap = Number(process.env.PUBLIC_LEADS_HELD_GLOBAL_CAP);
    const heldCampaignCap = Number(
      process.env.PUBLIC_LEADS_HELD_CAMPAIGN_CAP,
    );
    if (
      initialPublicLeadsState.holdTakerAndTeamMail &&
      (!Number.isSafeInteger(heldGlobalCap) ||
        heldGlobalCap <= 0 ||
        !Number.isSafeInteger(heldCampaignCap) ||
        heldCampaignCap <= 0)
    ) {
      return NextResponse.json(
        { success: false, error: "SUBMISSION_TEMPORARILY_UNAVAILABLE" },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }

    // Flag-off remains on the original lookup/delivery path. Once the new
    // contract is requested (including a canary probe), attribution is
    // resolved and locked inside the submission transaction instead.
    const legacyCoach =
      initialPublicLeadsState.legacyDelivery && !canaryConfigured
        ? await findActiveCoachByEmail(db, data.referringCoachEmail)
        : null;

    type OutboxPayload = {
      recipient: { role: string; email: string };
      subject: string;
      bodyHtml: string;
      status?: string;
      featureKey?: string;
      authorizationProvenance?: Prisma.InputJsonValue;
      contentProvenance?: Prisma.InputJsonValue;
    };

    const buildBasePayloads = (input: {
      referringCoachEmail: string | null;
      state: PublicLeadsState;
    }): OutboxPayload[] => {
      const respondentReport = buildRespondentReportFromSubmission({
        result,
        publicTaker: data.publicTaker,
        assessmentName,
        templateAlias,
        campaignLabel: null,
        sections: version.sections,
        questions: allQuestions,
        scoringConfig: version.scoringConfig,
        rawAnswers: submittedAnswers,
        submittedAt: now,
        submissionId: "",
        referringCoachEmail: input.referringCoachEmail,
        publicLeadActions: !input.state.legacyDelivery,
      });
      const takerCopy = buildReportEmailHtml({
        report: respondentReport,
        recipientRole: "TAKER_COPY",
      });
      const genericTakerCopy = buildReportEmailHtml({
        report: { ...respondentReport, referringCoachEmail: null },
        recipientRole: "TAKER_COPY",
      });
      const featureMetadata = input.state.legacyDelivery
        ? {}
        : {
            featureKey: "PUBLIC_LEADS",
            authorizationProvenance: {
              policyVersion: input.state.policyVersion,
              state: input.state.mode,
            } as Prisma.InputJsonValue,
            contentProvenance: {
              kind: "PUBLIC_TAKER_REPORT",
              version: 1,
              genericBodyHtml: genericTakerCopy.bodyHtml,
            } as Prisma.InputJsonValue,
          };
      const heldStatus = input.state.holdTakerAndTeamMail
        ? { status: "HELD" }
        : {};
      const payloads: OutboxPayload[] = [
        {
          recipient: {
            role: "TAKER_COPY",
            email: data.publicTaker.email,
          },
          subject: takerCopy.subject,
          bodyHtml: takerCopy.bodyHtml,
          ...heldStatus,
          ...featureMetadata,
        },
      ];

      if (suEmail.length > 0) {
        const teamCopy = buildLeadEmail({
          taker: data.publicTaker,
          assessmentName,
          perDomain: domainInputs,
          lowestLabel: lowest?.label ?? null,
          recipientRole: "SU_TEAM",
        });
        payloads.push({
          recipient: { role: "SU_TEAM", email: suEmail },
          subject: teamCopy.subject,
          bodyHtml: teamCopy.bodyHtml,
          ...heldStatus,
          ...featureMetadata,
          ...(input.state.legacyDelivery
            ? {}
            : {
                contentProvenance: {
                  kind: "PUBLIC_LEAD_TEAM_NOTIFICATION",
                  version: 1,
                } as Prisma.InputJsonValue,
              }),
        });
      }

      return payloads;
    };

    // -----------------------------------------------------------------------
    // Transactional write: submission + outbox rows in a single DB transaction
    // -----------------------------------------------------------------------
    let submissionId: string;
    let validatedCoachContactEmail: string | null = null;
    let publicLeadPresentationEnabled = false;
    try {
      submissionId = await db.$transaction(async (tx) => {
        let state = initialPublicLeadsState;
        let attribution = null as Awaited<
          ReturnType<typeof resolvePublicAttribution>
        >;

        // Policy/limiter failure modes deliberately avoid touching attribution
        // data. A canary needs one locked lookup to learn whether the candidate
        // coach is in the allowlist.
        if (
          state.captureOwnership ||
          (canaryConfigured && state.legacyDelivery)
        ) {
          attribution = await resolvePublicAttribution(
            tx,
            {
              referralKey: data.referralKey,
              legacyEmail: data.referringCoachEmail,
            },
            now,
          );
          state = resolvePublicLeadsState(publicLeadsEnv, {
            coachId: attribution?.coachId ?? null,
          });
        }

        const owner = state.captureOwnership ? attribution : null;
        validatedCoachContactEmail =
          state.presentationEnabled && owner
            ? owner.emailSnapshot
            : null;
        publicLeadPresentationEnabled = state.presentationEnabled;
        if (state.holdTakerAndTeamMail) {
          await tx.$queryRaw(Prisma.sql`
            SELECT pg_advisory_xact_lock(
              hashtext('public-leads-held-global'),
              hashtext(${campaign.id})
            )
          `);
          const heldCounts = await tx.$queryRaw<
            Array<{ globalCount: bigint; campaignCount: bigint }>
          >(Prisma.sql`
            SELECT
              COUNT(*) AS "globalCount",
              COUNT(*) FILTER (
                WHERE submission."campaignId" = ${campaign.id}
              ) AS "campaignCount"
            FROM "assessment_email_outbox" AS outbox
            INNER JOIN "assessment_submissions" AS submission
              ON submission."id" = outbox."submissionId"
            WHERE outbox."status" = 'HELD'
          `);
          const counts = heldCounts[0];
          if (
            !counts ||
            Number(counts.globalCount) >= heldGlobalCap ||
            Number(counts.campaignCount) >= heldCampaignCap
          ) {
            throw new HeldBacklogFullError();
          }
        }
        const normalizedTakerName =
          `${data.publicTaker.firstName} ${data.publicTaker.lastName}`
            .trim()
            .toLowerCase();

        const sub = await tx.assessmentSubmission.create({
          data: {
            campaignId: campaign.id,
            respondentId: null,
            invitationId: null,
            answers: submittedAnswers as Prisma.InputJsonValue,
            result: result as unknown as Prisma.InputJsonValue,
            publicTaker: {
              firstName: data.publicTaker.firstName,
              lastName: data.publicTaker.lastName,
              email: data.publicTaker.email,
            } as Prisma.InputJsonValue,
            referringCoachEmail: data.referringCoachEmail ?? null,
            idempotencyKey: data.idempotencyKey ?? null,
            ...(state.legacyDelivery
              ? {}
              : {
                  referringCoachId: owner?.coachId ?? null,
                  referringCoachEmailSnapshot:
                    owner?.emailSnapshot ?? null,
                  attributionSource: owner?.source ?? null,
                  publicLeadPolicyVersion: state.policyVersion,
                  publicTakerNameNormalized: normalizedTakerName,
                  publicTakerEmailNormalized: takerEmail,
                  requestFingerprint,
                  requestFingerprintVersion:
                    PUBLIC_SUBMIT_FINGERPRINT_VERSION,
                }),
          },
          select: { id: true },
        });

        const reportCoachEmail = state.legacyDelivery
          ? normalizeMailbox(legacyCoach?.email ?? attribution?.emailSnapshot)
          : owner?.emailSnapshot ?? null;
        const outboxPayloads = buildBasePayloads({
          referringCoachEmail: reportCoachEmail || null,
          state,
        });
        const activeCoachEmail = normalizeMailbox(reportCoachEmail);
        const suppressCoachSelfNotification =
          activeCoachEmail.length > 0 && activeCoachEmail === takerEmail;

        if (suppressCoachSelfNotification) {
          console.info("[assessment-email] coach self-notification suppressed", {
            submissionScope: "public-quiz",
            coachId:
              owner?.coachId ??
              legacyCoach?.id ??
              attribution?.coachId ??
              null,
          });
        }

        if (
          state.legacyDelivery &&
          activeCoachEmail.length > 0 &&
          !suppressCoachSelfNotification
        ) {
          const respondentReport = buildRespondentReportFromSubmission({
            result,
            publicTaker: data.publicTaker,
            assessmentName,
            templateAlias,
            campaignLabel: null,
            sections: version.sections,
            questions: allQuestions,
            scoringConfig: version.scoringConfig,
            rawAnswers: submittedAnswers,
            submittedAt: now,
            submissionId: "",
            referringCoachEmail: activeCoachEmail,
          });
          const coachCopy = buildReportEmailHtml({
            report: respondentReport,
            recipientRole: "REFERRING_COACH",
          });
          // Preserve the legacy row ordering while the flag is off.
          outboxPayloads.splice(1, 0, {
            recipient: {
              role: "REFERRING_COACH",
              email: activeCoachEmail,
            },
            subject: coachCopy.subject,
            bodyHtml: coachCopy.bodyHtml,
          });
        } else if (
          state.sendCoachNotification &&
          owner &&
          activeCoachEmail.length > 0 &&
          !suppressCoachSelfNotification
        ) {
          const coachCopy = buildPublicLeadCoachNotification({
            taker: data.publicTaker,
            assessmentName,
            reportUrl: `${new URL(request.url).origin}/assessments/public-leads/${sub.id}/report`,
          });
          outboxPayloads.push({
            recipient: {
              role: "REFERRING_COACH",
              email: activeCoachEmail,
            },
            subject: coachCopy.subject,
            bodyHtml: coachCopy.bodyHtml,
            featureKey: "PUBLIC_LEADS",
            authorizationProvenance: {
              ownerCoachId: owner.coachId,
              policyVersion: state.policyVersion,
              state: state.mode,
            } as Prisma.InputJsonValue,
            contentProvenance: {
              kind: "PUBLIC_LEAD_COACH_NOTIFICATION",
              version: 1,
            } as Prisma.InputJsonValue,
          });
        }

        // Enqueue outbox rows inside the same transaction.
        for (const payload of outboxPayloads) {
          await tx.assessmentEmailOutbox.create({
            data: {
              submissionId: sub.id,
              recipientEmail: payload.recipient.email,
              recipientRole: payload.recipient.role,
              emailType: "QUICK_ASSESSMENT_LEAD",
              subject: payload.subject,
              bodyHtml: payload.bodyHtml,
              ...(payload.status ? { status: payload.status } : {}),
              ...(payload.featureKey
                ? {
                    featureKey: payload.featureKey,
                    authorizationProvenance:
                      payload.authorizationProvenance,
                    contentProvenance: payload.contentProvenance,
                  }
                : {}),
            },
          });
        }

        return sub.id;
      });
    } catch (txErr) {
      if (txErr instanceof HeldBacklogFullError) {
        return NextResponse.json(
          { success: false, error: "SUBMISSION_TEMPORARILY_UNAVAILABLE" },
          { status: 503, headers: { "Retry-After": "60" } },
        );
      }
      // Task 6(b): idempotency — duplicate key (P2002 on idempotencyKey partial-unique index)
      if (
        txErr instanceof Prisma.PrismaClientKnownRequestError &&
        txErr.code === "P2002" &&
        data.idempotencyKey
      ) {
        const existing = await db.assessmentSubmission.findFirst({
          where: { idempotencyKey: data.idempotencyKey, campaignId: campaign.id },
          select: {
            id: true,
            result: true,
            requestFingerprint: true,
            requestFingerprintVersion: true,
            referringCoachEmailSnapshot: true,
          },
        });
        if (!existing) {
          // Race condition: P2002 but row not found → rethrow as 500.
          throw txErr;
        }
        if (
          requestFingerprint &&
          (existing.requestFingerprint !== requestFingerprint ||
            existing.requestFingerprintVersion !==
              PUBLIC_SUBMIT_FINGERPRINT_VERSION)
        ) {
          return NextResponse.json(
            { success: false, error: "SUBMISSION_RETRY_MISMATCH" },
            { status: 409 },
          );
        }
        // Return de-duped response — no audit, no inngest.
        const redirectUrl = `/quiz/${campaignAlias}/thank-you`;
        return NextResponse.json(
          {
            success: true,
            data: {
              submissionId: existing.id,
              scoreResult: existing.result,
              coachContactEmail: initialPublicLeadsState.presentationEnabled
                ? existing.referringCoachEmailSnapshot
                : null,
              publicLeadActions:
                initialPublicLeadsState.presentationEnabled,
              redirectUrl,
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      // Any other error → rethrow → outer catch → 500.
      throw txErr;
    }

    // -----------------------------------------------------------------------
    // Post-commit: audit + Inngest (fire-and-forget; outside the transaction)
    // -----------------------------------------------------------------------
    await logAudit({
      entityType: "AssessmentSubmission",
      entityId: submissionId,
      action: "CREATE",
      performedBy: data.publicTaker.email,
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    // Best-effort trigger of the immediate drain. If this throws (Inngest
    // outage/misconfig) the submission is already committed and the outbox
    // rows persist; the scheduled cron drain (quickAssessmentLeadEmailCron)
    // picks them up on its next tick, so we must NOT 500 the taker here.
    try {
      await inngest.send({
        name: "assessment/quick-lead.enqueued",
        data: { submissionId },
      });
    } catch (sendErr) {
      console.error(
        "quick-lead enqueue send failed (cron drain will retry):",
        sendErr,
      );
    }

    // -----------------------------------------------------------------------
    // Response: include full ScoreResult + Cache-Control: no-store
    // -----------------------------------------------------------------------
    const redirectUrl = `/quiz/${campaignAlias}/thank-you`;
    return NextResponse.json(
      {
        success: true,
        data: {
          submissionId,
          scoreResult: result,
          coachContactEmail: validatedCoachContactEmail,
          publicLeadActions: publicLeadPresentationEnabled,
          redirectUrl,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error submitting public quiz:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit" },
      { status: 500 },
    );
  }
}
