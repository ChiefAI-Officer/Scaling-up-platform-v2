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
  scoreSubmission,
  ScoringValidationError,
  TemplateVersionForScoringSchema,
} from "@/lib/assessments/scoring";
import {
  findActiveCoachByEmail,
  buildLeadEmail,
  lowestDecision,
} from "@/lib/assessments/quick-assessment-lead";
import {
  buildReportEmailHtml,
  buildRespondentReportFromSubmission,
} from "@/lib/assessments/report-email";
import { logAudit } from "@/lib/audit";
import { inngest } from "@/inngest/client";

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
        stableKey: z.string().min(1),
        value: z.unknown(),
      }),
    )
    .min(1),
  referringCoachEmail: z.string().email().max(320).optional().nullable(),
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
        template: { select: { name: true } },
      },
    });
    if (!campaign) {
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
    // Score the submission (pure, no I/O)
    // -----------------------------------------------------------------------
    let result;
    try {
      result = scoreSubmission(versionParsed.data, data.answers);
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
    // Pre-transaction read: active coach lookup (open-relay guard)
    // -----------------------------------------------------------------------
    const coach = await findActiveCoachByEmail(db, data.referringCoachEmail);

    // -----------------------------------------------------------------------
    // Build outbox payloads (pure helpers, no I/O)
    // -----------------------------------------------------------------------
    const assessmentName =
      campaign.template?.name ?? "Scaling Up Quick Assessment";

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

    // Build the per-respondent report ONCE, server-side, from the data we
    // already hold (no DB round-trip). Shared by both report emails so the
    // taker and coach copies are byte-identical (Spec 16 §3).
    const respondentReport = buildRespondentReportFromSubmission({
      result,
      publicTaker: data.publicTaker,
      assessmentName,
      campaignLabel: null, // campaignLabel is not rendered in the email body
      sections: version.sections,
      questions: allQuestions,
      scoringConfig: version.scoringConfig,
      submittedAt: now,
      submissionId: "", // provenance not rendered in the email body
      referringCoachEmail: data.referringCoachEmail ?? null,
    });

    // Assemble the outbox payloads. Each entry carries the rendered subject +
    // bodyHtml so the worker (role-agnostic) can send it verbatim.
    //   - TAKER_COPY      → always, to the taker; full branded report (§2).
    //   - REFERRING_COACH → only when an active coach resolved; full report.
    //   - SU_TEAM         → only when an SU address is configured; lead-alert
    //                       summary (unchanged from before).
    const outboxPayloads: Array<{
      recipient: { role: string; email: string };
      subject: string;
      bodyHtml: string;
    }> = [];

    // TAKER_COPY — always (the taker submitted their own email + consented).
    {
      const { subject, bodyHtml } = buildReportEmailHtml({
        report: respondentReport,
        recipientRole: "TAKER_COPY",
      });
      outboxPayloads.push({
        recipient: { role: "TAKER_COPY", email: data.publicTaker.email },
        subject,
        bodyHtml,
      });
    }

    // REFERRING_COACH — full report (upgrade from the old lead alert), only
    // when the open-relay guard resolved an active coach.
    const activeCoachEmail = coach?.email?.trim().toLowerCase() ?? "";
    if (activeCoachEmail.length > 0) {
      const { subject, bodyHtml } = buildReportEmailHtml({
        report: respondentReport,
        recipientRole: "REFERRING_COACH",
      });
      outboxPayloads.push({
        recipient: { role: "REFERRING_COACH", email: activeCoachEmail },
        subject,
        bodyHtml,
      });
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
    let submissionId: string;
    try {
      submissionId = await db.$transaction(async (tx) => {
        const sub = await tx.assessmentSubmission.create({
          data: {
            campaignId: campaign.id,
            respondentId: null,
            invitationId: null,
            answers: data.answers as Prisma.InputJsonValue,
            result: result as unknown as Prisma.InputJsonValue,
            publicTaker: {
              firstName: data.publicTaker.firstName,
              lastName: data.publicTaker.lastName,
              email: data.publicTaker.email,
            } as Prisma.InputJsonValue,
            referringCoachEmail: data.referringCoachEmail ?? null,
            idempotencyKey: data.idempotencyKey ?? null,
          },
          select: { id: true },
        });

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
            },
          });
        }

        return sub.id;
      });
    } catch (txErr) {
      // Task 6(b): idempotency — duplicate key (P2002 on idempotencyKey partial-unique index)
      if (
        txErr instanceof Prisma.PrismaClientKnownRequestError &&
        txErr.code === "P2002" &&
        data.idempotencyKey
      ) {
        const existing = await db.assessmentSubmission.findFirst({
          where: { idempotencyKey: data.idempotencyKey, campaignId: campaign.id },
          select: { id: true, result: true },
        });
        if (!existing) {
          // Race condition: P2002 but row not found → rethrow as 500.
          throw txErr;
        }
        // Return de-duped response — no audit, no inngest.
        const redirectUrl = `/quiz/${campaignAlias}/thank-you`;
        return NextResponse.json(
          {
            success: true,
            data: {
              submissionId: existing.id,
              scoreResult: existing.result,
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
