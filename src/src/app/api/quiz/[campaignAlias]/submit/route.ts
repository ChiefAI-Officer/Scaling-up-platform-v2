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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import {
  ScoringValidationError,
  TemplateVersionForScoringSchema,
} from "@/lib/assessments/scoring";
import {
  findActiveCoachByEmail,
  buildLeadEmail,
  lowestDecision,
  normalizeMailbox,
  type RecipientRole,
} from "@/lib/assessments/quick-assessment-lead";
import {
  buildReportEmailHtml,
  buildRespondentReportFromSubmission,
  type ReportEmailRecipientRole,
} from "@/lib/assessments/report-email";
import { isReferringCoachForeignKeyConflict } from "@/lib/assessments/referral-integrity";
import { logAudit } from "@/lib/audit";
import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import type { PagerQuestion } from "@/lib/assessments/section-pages";
import { inngest } from "@/inngest/client";
import { isCoachCurrentlyCertified } from "@/lib/auth/coach-status";
import { reportEmailChromeForCampaign } from "@/lib/assessments/wave-228-flags";
import { lockReportStyleForFirstCompletion } from "@/lib/assessments/report-style-lock";

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

const ReferralEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320);

const OptionalReferralEmailSchema = z.preprocess((value) => {
  const normalized = ReferralEmailSchema.safeParse(value);
  return normalized.success ? normalized.data : null;
}, ReferralEmailSchema.nullable());

const PublicSubmitBodySchema = z.object({
  publicTaker: z.object({
    firstName: z.string().min(1).max(100).trim(),
    lastName: z.string().min(1).max(100).trim(),
    email: z.string().email().max(320).trim().toLowerCase(),
  }),
  answers: z
    .array(
      z.object({
        stableKey: z.string().min(1),
        value: z.unknown(),
      }),
    )
    .min(1),
  // Referral identity is optional and untrusted. A damaged/tampered referral
  // must not block the taker's submission; only a valid email proceeds to the
  // canonical active-Coach lookup below.
  referringCoachEmail: OptionalReferralEmailSchema,
  // Task 6(b): client-supplied idempotency key (optional)
  idempotencyKey: z.string().min(1).max(200).optional(),
});

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizedSubmissionIdentity(input: {
  publicTaker: { firstName: string; lastName: string; email: string };
  answers: Array<{ stableKey: string; value: unknown }>;
}): string {
  return stableJson({
    publicTaker: {
      firstName: input.publicTaker.firstName.trim(),
      lastName: input.publicTaker.lastName.trim(),
      email: input.publicTaker.email.trim().toLowerCase(),
    },
    answers: [...input.answers].sort((left, right) =>
      left.stableKey.localeCompare(right.stableKey),
    ),
  });
}

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
    const raw = await request.json().catch(() => ({}));
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
    const now = new Date();

    const findExistingIdempotentSubmission = async () => {
      if (!data.idempotencyKey) return null;

      return db.assessmentSubmission.findFirst({
        where: { idempotencyKey: data.idempotencyKey },
        select: {
          id: true,
          campaignId: true,
          result: true,
          publicTaker: true,
          answers: true,
          referringCoach: {
            select: {
              email: true,
              certificationStatus: true,
              certificationExpiry: true,
            },
          },
        },
      });
    };

    const idempotencyConflict = () =>
      NextResponse.json(
        {
          success: false,
          error: "IDEMPOTENCY_KEY_REUSED",
        },
        {
          status: 409,
          headers: { "Cache-Control": "no-store" },
        },
      );

    const resolveIdempotentReplay = (
      existing: NonNullable<
        Awaited<ReturnType<typeof findExistingIdempotentSubmission>>
      >,
      answersForIdentity: Array<{ stableKey: string; value: unknown }>,
    ) => {
      const existingIdentity = normalizedSubmissionIdentity({
        publicTaker: existing.publicTaker as {
          firstName: string;
          lastName: string;
          email: string;
        },
        answers: existing.answers as Array<{
          stableKey: string;
          value: unknown;
        }>,
      });
      const requestIdentity = normalizedSubmissionIdentity({
        publicTaker: data.publicTaker,
        answers: answersForIdentity,
      });
      if (
        existing.campaignId !== campaign.id ||
        existingIdentity !== requestIdentity
      ) {
        return idempotencyConflict();
      }

      const replayCoachEmail = isCoachCurrentlyCertified(
        existing.referringCoach,
      )
        ? existing.referringCoach?.email.trim().toLowerCase() ?? null
        : null;
      return NextResponse.json(
        {
          success: true,
          data: {
            submissionId: existing.id,
            scoreResult: existing.result,
            referringCoachEmail: replayCoachEmail,
            redirectUrl: `/quiz/${campaignAlias}/thank-you`,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    };

    const existingIdempotentSubmission =
      await findExistingIdempotentSubmission();
    if (
      existingIdempotentSubmission &&
      existingIdempotentSubmission.campaignId !== campaign.id
    ) {
      return idempotencyConflict();
    }

    if (
      !existingIdempotentSubmission &&
      (campaign.status !== "ACTIVE" ||
        campaign.openAt > now ||
        (campaign.closeAt && campaign.closeAt < now))
    ) {
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

    // A matching lost-response retry remains recoverable after campaign close.
    // Compare the same show-if-pruned answers that the first request persisted;
    // new submissions still stop at the ordinary status/window gates above.
    if (existingIdempotentSubmission) {
      return resolveIdempotentReplay(
        existingIdempotentSubmission,
        submittedAnswers,
      );
    }

    // -----------------------------------------------------------------------
    // Pre-transaction read: active coach lookup (open-relay guard)
    // -----------------------------------------------------------------------
    const coach = await findActiveCoachByEmail(db, data.referringCoachEmail);
    const canonicalCoachEmail = coach?.email.trim().toLowerCase() ?? null;

    // -----------------------------------------------------------------------
    // Build outbox payloads (pure helpers, no I/O)
    // -----------------------------------------------------------------------
    const assessmentName =
      campaign.template?.name ?? "Scaling Up Quick Assessment";
    // Template alias drives reportConfigFor (scored vs qualitative) in the email
    // path. alias is a non-null column on AssessmentTemplate; empty-string
    // fallback yields the scored default if the relation is somehow absent.
    const templateAlias = campaign.template?.alias ?? "";
    const chrome = reportEmailChromeForCampaign(campaign.id);

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

    // Build the report from data already held by this request (no DB round-trip).
    // Keeping referral identity as an argument lets a concurrent Coach deletion
    // retry produce a genuinely Scaling Up-only taker copy.
    const buildRespondentReport = (verifiedCoach: typeof coach | null) =>
      buildRespondentReportFromSubmission({
        result,
        publicTaker: data.publicTaker,
        assessmentName,
        templateAlias,
        campaignLabel: null, // campaignLabel is not rendered in the email body
        sections: version.sections,
        questions: allQuestions,
        scoringConfig: version.scoringConfig,
        rawAnswers: submittedAnswers, // the same answers persisted to submission.answers
        submittedAt: now,
        // submissionId is only known after the submission is persisted (below).
        // The email body does not render provenance for the scored public quiz,
        // so the placeholder is benign here; the qualitative path only triggers
        // on the INVITED route, where the real id IS threaded.
        submissionId: "",
        referringCoachEmail: verifiedCoach ? canonicalCoachEmail : null,
        coachName: verifiedCoach
          ? `${verifiedCoach.firstName} ${verifiedCoach.lastName}`.trim() || null
          : null,
        coachLogoUrl: verifiedCoach?.profileImage ?? null,
      });
    const respondentReport = buildRespondentReport(coach);

    // Assemble the outbox payloads. Each entry carries the rendered subject +
    // bodyHtml so the worker (role-agnostic) can send it verbatim.
    //   - TAKER_COPY      → always, to the taker; full branded report (§2).
    //   - REFERRING_COACH → only when an active coach resolved; full report.
    //   - SU_TEAM         → only when an SU address is configured; lead-alert
    //                       summary (unchanged from before).
    type PublicQuizOutboxRecipientRole =
      | RecipientRole
      | ReportEmailRecipientRole;
    const outboxPayloads: Array<{
      recipient: {
        role: PublicQuizOutboxRecipientRole;
        email: string;
      };
      subject: string;
      bodyHtml: string;
      status?: "CANCELLED";
      cancelledAt?: Date;
      cancelReason?: "SAME_MAILBOX_AS_TAKER";
    }> = [];

    // TAKER_COPY — always (the taker submitted their own email + consented).
    {
      const { subject, bodyHtml } = buildReportEmailHtml({
        report: respondentReport,
        recipientRole: "TAKER_COPY",
        chrome,
      });
      outboxPayloads.push({
        recipient: { role: "TAKER_COPY", email: data.publicTaker.email },
        subject,
        bodyHtml,
      });
    }

    // When the taker is the referring Coach (common during self-tests), their
    // taker copy already contains the full report. Avoid a redundant second
    // copy to the same mailbox.
    const activeCoachEmail = normalizeMailbox(canonicalCoachEmail);
    const takerEmail = normalizeMailbox(data.publicTaker.email);
    const suppressCoachSelfNotification =
      activeCoachEmail.length > 0 && activeCoachEmail === takerEmail;
    if (suppressCoachSelfNotification) {
      console.info("[assessment-email] coach self-notification suppressed", {
        submissionScope: "public-quiz",
        coachId: coach?.id ?? null,
      });
    }

    // REFERRING_COACH — keep an explicit role row whenever an active coach
    // resolved. Same-mailbox self-tests are retained as CANCELLED evidence
    // instead of silently erasing the coach recipient role.
    if (activeCoachEmail.length > 0) {
      if (suppressCoachSelfNotification) {
        outboxPayloads.push({
          recipient: { role: "REFERRING_COACH", email: activeCoachEmail },
          subject: "",
          bodyHtml: "",
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: "SAME_MAILBOX_AS_TAKER",
        });
      } else {
        const { subject, bodyHtml } = buildReportEmailHtml({
          report: respondentReport,
          recipientRole: "REFERRING_COACH",
          chrome,
        });
        outboxPayloads.push({
          recipient: { role: "REFERRING_COACH", email: activeCoachEmail },
          subject,
          bodyHtml,
        });
      }
    }

    // SU_TEAM — unchanged lead-alert summary, only when an SU address is set.
    const suEmail = suTeamAddress.trim().toLowerCase();
    if (suEmail.length > 0) {
      const { subject, bodyHtml } = buildLeadEmail({
        taker: data.publicTaker,
        assessmentName,
        perDomain: domainInputs,
        lowestLabel: lowest?.label ?? null,
        recipientRole: "SU_TEAM",
      });
      outboxPayloads.push({
        recipient: { role: "SU_TEAM", email: suEmail },
        subject,
        bodyHtml,
      });
    }

    // -----------------------------------------------------------------------
    // Transactional write: submission + outbox rows in a single DB transaction
    // -----------------------------------------------------------------------
    const scalingUpOnlyPayloads = () => {
      const takerCopyContent = buildReportEmailHtml({
        report: buildRespondentReport(null),
        recipientRole: "TAKER_COPY",
        chrome,
      });
      return outboxPayloads
        .filter((payload) => payload.recipient.role !== "REFERRING_COACH")
        .map((payload) =>
          payload.recipient.role === "TAKER_COPY"
            ? { ...payload, ...takerCopyContent }
            : payload,
        );
    };

    const persistSubmission = (
      referral: { id: string; email: string } | null,
      payloads: typeof outboxPayloads,
    ) =>
      db.$transaction(async (tx) => {
        // The first operation under this transaction locks the campaign style
        // with the same completion instant persisted on the submission. Any
        // later error rejects this callback, so Prisma rolls the freeze back.
        await lockReportStyleForFirstCompletion(tx, campaign.id, now);

        // The Coach may be deactivated/expired between the public pre-read and
        // this write. Re-read eligibility in the write transaction; this is
        // the linearization point for ownership, delivery, and response CTA.
        const currentReferral = referral
          ? await tx.coach.findFirst({
              where: {
                id: referral.id,
                email: referral.email,
                certificationStatus: "ACTIVE",
                OR: [
                  { certificationExpiry: null },
                  { certificationExpiry: { gt: now } },
                ],
              },
              select: { id: true, email: true },
            })
          : null;
        const verifiedReferral = currentReferral
          ? {
              id: currentReferral.id,
              email: currentReferral.email.trim().toLowerCase(),
            }
          : null;
        const effectivePayloads =
          referral && !verifiedReferral ? scalingUpOnlyPayloads() : payloads;

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
            referringCoachId: verifiedReferral?.id ?? null,
            referringCoachEmail: verifiedReferral?.email ?? null,
            idempotencyKey: data.idempotencyKey ?? null,
            submittedAt: now,
          },
          select: { id: true },
        });

        for (const payload of effectivePayloads) {
          await tx.assessmentEmailOutbox.create({
            data: {
              submissionId: sub.id,
              recipientEmail: payload.recipient.email,
              recipientRole: payload.recipient.role,
              emailType: "QUICK_ASSESSMENT_LEAD",
              subject: payload.subject,
              bodyHtml: payload.bodyHtml,
              status: payload.status,
              cancelledAt: payload.cancelledAt,
              cancelReason: payload.cancelReason,
            },
          });
        }

        return {
          submissionId: sub.id,
          referringCoachEmail: verifiedReferral?.email ?? null,
        };
      });

    let submissionId: string;
    let persistedReferringCoachEmail: string | null;
    try {
      try {
        const persisted = await persistSubmission(
          coach && canonicalCoachEmail
            ? { id: coach.id, email: canonicalCoachEmail }
            : null,
          outboxPayloads,
        );
        submissionId = persisted.submissionId;
        persistedReferringCoachEmail = persisted.referringCoachEmail;
      } catch (initialError) {
        if (
          !coach ||
          !canonicalCoachEmail ||
          !isReferringCoachForeignKeyConflict(initialError)
        ) {
          throw initialError;
        }

        const persisted = await persistSubmission(
          null,
          scalingUpOnlyPayloads(),
        );
        submissionId = persisted.submissionId;
        persistedReferringCoachEmail = persisted.referringCoachEmail;
      }
    } catch (txErr) {
      // Task 6(b): idempotency — duplicate key (P2002 on idempotencyKey partial-unique index)
      if (
        txErr instanceof Prisma.PrismaClientKnownRequestError &&
        txErr.code === "P2002" &&
        data.idempotencyKey
      ) {
        const concurrentExisting =
          await findExistingIdempotentSubmission();
        if (concurrentExisting) {
          return resolveIdempotentReplay(
            concurrentExisting,
            submittedAnswers,
          );
        }
        // Race condition: P2002 but row not found → rethrow as 500.
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
          // Only the canonical address returned by the active-Coach lookup is
          // allowed to drive the in-place report CTA. Never echo the query.
          referringCoachEmail: persistedReferringCoachEmail,
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
