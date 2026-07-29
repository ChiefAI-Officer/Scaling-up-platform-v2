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
} from "@/lib/assessments/wave-d-feature-flags";
import { isResultsEmailApproved } from "@/lib/assessments/results-email-approval";
import { isOnScreenResultsEnabled } from "@/lib/assessments/wave-osr-flags";
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

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const AnswerInputSchema = z.object({
  stableKey: z.string().min(1),
  value: z.unknown(),
});

const SubmitBodySchema = z.object({
  answers: z.array(AnswerInputSchema),
});

/**
 * Wave OSR (#71) — the coach byline name for the report cover/footer, built the
 * SAME way the authorized DB loader builds it (respondent-report.ts) so the
 * respondent's copy and the coach/admin copy cannot drift. Null when there is no
 * creator coach (admin-created campaigns) → the renderer falls back to
 * SU-logo-only rather than a broken byline.
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

/** An outbox row ready to INSERT — fully RENDERED (subject + bodyHtml), missing
 *  only the submissionId (assigned inside the tx once the submission exists).
 *  R3-M3: rendering produces these BEFORE the transaction opens, so the heavy
 *  HTML assembly never runs while the submission row lock is held. */
interface PreparedOutboxRow {
  recipientEmail: string;
  recipientRole: "RESPONDENT" | "OWNING_COACH";
  emailType: "ASSESSMENT_RESULTS" | "COACH_COMPLETION";
  subject: string;
  bodyHtml: string;
}

interface EnqueueArgs {
  campaign: {
    id: string;
    accessMode: string;
    sendResultsToRespondent: boolean;
    notifyCoachOnCompletion: boolean;
    createdByCoachId: string | null;
    creatorCoach: { email: string } | null;
    // Wave OSR: version CONTENT is no longer read here — the report model that
    // needed it is built by the caller. Only the id remains (fingerprinting).
    version: { id: string };
    template: {
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
  /**
   * Wave OSR: the respondent report model, built ONCE by the caller (Phase 1,
   * lock-free) and shared by the #15 results email and the on-screen payload.
   * `null` when the build failed — the #15 row is then dropped, exactly as it
   * was when the build lived inside this function.
   */
  report: RespondentReport | null;
}

/**
 * Builds the Wave D results (#15) + coach-notify (#16) outbox rows for an
 * INVITED submission — RENDERING ONLY, no DB. (R3-M3) This runs BEFORE the
 * submit transaction opens, so the heavy report-HTML assembly never executes
 * while the submission row lock is held; the tx merely INSERTs the prepared
 * rows (stamped with the submissionId).
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
}: EnqueueArgs): PreparedOutboxRow[] {
  const rows: PreparedOutboxRow[] = [];

  // Global kill switch — nothing is enqueued while sends are paused.
  if (assessmentSendsPaused()) return rows;

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
    try {
      const { bodyHtml: reportHtml, renderError } = buildReportEmailHtml({
        report,
        recipientRole: "TAKER_COPY",
      });
      // M4: buildReportEmailHtml never throws — on a qualitative body-render
      // failure it degrades to a safe body + a renderError signal. Surface it
      // (the submission still succeeds) so the fallback is diagnosable.
      //
      // R3-M1 / T11-M4: the assessment /admin/observability dashboard (spec-06)
      // is v1 DB-derived with NO metric counter backend, so there is no
      // lightweight counter to increment. Emit a STRUCTURED, greppable
      // render-failure log instead — labeled by templateAlias / reportType /
      // recipientRole / emailType — which is the v1 alert source (a dashboard
      // panel is a tracked follow-up; see 17e-ops-runbook §Observability).
      if (renderError) {
        console.error("[assessment-report] render-failure", {
          templateAlias: template.alias,
          reportType: reportConfigFor(template.alias).reportType,
          renderPath: "email",
          recipientRole: "RESPONDENT",
          emailType: "ASSESSMENT_RESULTS",
          campaignId: campaign.id,
          error: renderError,
        });
      }
      const bodyHtml = buildResultsEmailHtml({
        bodyMarkdown: template.resultsEmailBodyMarkdown ?? "",
        reportHtml,
      });
      rows.push({
        recipientEmail: respondentEmail,
        recipientRole: "RESPONDENT",
        emailType: "ASSESSMENT_RESULTS",
        subject: template.resultsEmailSubject ?? "Your assessment results",
        bodyHtml,
      });
    } catch (err) {
      // Do NOT abort the submission — drop this email only.
      console.error("[assessment-submit] #15 results render skipped:", err);
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
    try {
      const { subject, bodyHtml } = buildCoachNotifyEmail({
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
      });
      rows.push({
        recipientEmail: coachEmail,
        recipientRole: "OWNING_COACH",
        emailType: "COACH_COMPLETION",
        subject,
        bodyHtml,
      });
    } catch (err) {
      console.error("[assessment-submit] #16 coach-notify render skipped:", err);
    }
  }

  return rows;
}

/**
 * C-M2: the render-input fingerprint for the prepared Wave-D email rows. The
 * #15 results row depends on the respondent toggle + the template's results-
 * email approval hash + alias + the pinned version id; the #16 coach-notify row
 * depends on the coach toggle + the owning-coach identity. Captured in Phase 1
 * (lock-free) and re-derived UNDER the lock in Phase 2 — a field change between
 * the two means the corresponding prepared row is stale and must be dropped.
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
  sendResultsToRespondent: boolean;
  notifyCoachOnCompletion: boolean;
  showResultsOnScreen: boolean;
  createdByCoachId: string | null;
  creatorCoach: { email: string } | null;
  version: { id: string };
  template: {
    alias: string;
    resultsEmailContentApprovedHash: string | null;
  } | null;
}): EmailRenderFingerprint {
  return {
    results: JSON.stringify([
      campaign.sendResultsToRespondent,
      campaign.template?.resultsEmailContentApprovedHash ?? null,
      campaign.template?.alias ?? null,
      campaign.version.id,
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignAlias: string }> }
) {
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
      // ── Phase 1 (no lock, no tx): read → gate → score → RENDER emails ──────
      // R3-M3: the heavy report-HTML assembly runs HERE, BEFORE the transaction
      // opens, so it never executes while the submission row lock is held. The
      // tx below re-locks, re-validates the gates/conflict, and merely INSERTs
      // these pre-rendered rows. Versions are immutable once published, so the
      // ScoreResult computed here is deterministic and re-used for the write.
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
              organization: { select: { name: true } },
              // Wave D: per-campaign send toggles + the owning coach (#16).
              // Wave OSR (#71): profileImage + names build the coach byline that
              // PR #230 shipped on the coach/admin report (Jeff #63/#67/#73/#78/#81)
              // — without them the respondent's copy is NOT the same artifact.
              creatorCoach: {
                select: {
                  email: true,
                  profileImage: true,
                  firstName: true,
                  lastName: true,
                },
              },
              version: {
                select: {
                  id: true,
                  questions: true,
                  sections: true,
                  scoringConfig: true,
                },
              },
              // Wave D #15: admin-authored results email + approval gate.
              template: {
                select: {
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
        // Fail-safe: no participant row → treat as non-CEO (drop the section),
        // matching the survey-render policy (me/route.ts + org-survey-client).
        if (participant?.isCEO !== true) {
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

      // Wave OSR (#71): build the respondent report model ONCE, here in Phase 1
      // (lock-free), and share it between the #15 results email and the
      // on-screen payload. It is the SAME artifact for a new audience — see
      // ADR-0027.
      //
      // The build is wrapped because a model failure must NEVER fail the
      // submission. Throwing here would return 500 AFTER a later commit, and
      // the client's retry would then hit the hard double-submit 409 above — an
      // unrecoverable dead-end with the respondent's answers already saved.
      // `null` degrades to: no #15 email row, no on-screen payload, normal
      // thank-you. Mirrors buildWaveDOutboxRows' per-email swallow contract.
      // #7: only build when some consumer could actually use it. Disclosure is
      // still decided under the lock — a Phase-1-false / Phase-2-true flip is
      // already suppressed by the fingerprint compare, so guarding on the
      // (unlocked) Phase-1 read cannot leak a report that should be hidden. It
      // only avoids building a model nobody reads, which today is every
      // submission (no template has approved results-email copy).
      const mayNeedReport =
        (isOnScreenResultsEnabled() &&
          invitation.campaign.showResultsOnScreen === true) ||
        invitation.campaign.sendResultsToRespondent === true;

      let respondentReport: RespondentReport | null = null;
      if (mayNeedReport) {
        try {
          respondentReport = buildRespondentReportFromSubmission({
            result: scoreResult as never,
            publicTaker: {
              firstName: invitation.respondent?.firstName ?? "",
              lastName: invitation.respondent?.lastName ?? "",
              email: invitation.respondent?.email ?? "",
            },
            assessmentName: invitation.campaign.template?.name ?? "an assessment",
            // Load-bearing: BrandedReport dispatches scored-vs-qualitative on
            // reportConfigFor(report.templateAlias). Because the SERVER builds
            // the model, this can never be silently omitted by a caller.
            templateAlias: invitation.campaign.template?.alias ?? "",
            campaignLabel: null,
            sections: invitation.campaign.version.sections,
            questions: invitation.campaign.version.questions,
            scoringConfig: invitation.campaign.version.scoringConfig,
            rawAnswers,
            submittedAt,
            submissionId: "", // not interpolated into the body; FK set at INSERT
            referringCoachEmail: null,
            // Wave OSR (#71) — the invited path knows these; the public quiz does not.
            companyName: invitation.campaign.organization?.name ?? "",
            jobTitle: invitation.respondent?.jobTitle ?? null,
            coachLogoUrl: invitation.campaign.creatorCoach?.profileImage ?? null,
            coachName: coachBylineName(invitation.campaign.creatorCoach),
            // #6: surface a malformed frozen result as the degraded notice rather
            // than silently rendering an incomplete report.
            degraded: !isScoreResult(scoreResult),
          });
        } catch (err) {
          console.error(
            "[assessment-submit] respondent report model build failed — submission unaffected:",
            err
          );
        }
      }

      // RENDER 0–2 outbox rows OUTSIDE the tx (the lock-free, CPU-heavy step).
      const preparedRows = buildWaveDOutboxRows({
        campaign: invitation.campaign,
        respondent: invitation.respondent,
        respondentId: invitation.respondentId,
        report: respondentReport,
      });

      // C-M2: capture the render-input fingerprints these rows were prepared
      // from (Phase-1, lock-free). Phase 2 re-reads the same fields UNDER the
      // lock and drops any prepared row whose inputs changed during the
      // Phase-1 → Phase-2 window (approval revoked/edited, toggle flipped, the
      // pinned version swapped). The submission still commits — only the stale
      // email row is skipped.
      const phase1Fingerprint = emailRenderFingerprint(invitation.campaign);

      // ── Phase 2 (locked tx): re-validate → create submission → INSERT rows ─
      const result = await db.$transaction(async (tx) => {
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
            campaign: {
              select: {
                alias: true,
                deletedAt: true,
                status: true,
                openAt: true,
                closeAt: true,
                // C-M2: the email render-input fields, re-read under the lock so
                // the prepared #15/#16 rows can be re-validated before INSERT.
                sendResultsToRespondent: true,
                notifyCoachOnCompletion: true,
                // Wave OSR (#71): the on-screen disclosure decision is made
                // from THIS locked read, never from the Phase-1 read.
                showResultsOnScreen: true,
                createdByCoachId: true,
                creatorCoach: { select: { email: true } },
                version: { select: { id: true } },
                template: {
                  select: {
                    alias: true,
                    resultsEmailContentApprovedHash: true,
                  },
                },
              },
            },
          },
        });

        if (!locked || locked.campaign.alias !== campaignAlias) {
          return { kind: "not-found" as const };
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
          return { kind: "gate" as const };
        }
        if (locked.status === "SUBMITTED") {
          return { kind: "conflict" as const };
        }

        const submission = await tx.assessmentSubmission.create({
          data: {
            campaignId: locked.campaignId,
            respondentId: locked.respondentId,
            invitationId,
            answers: rawAnswers as unknown as object, // ALL answers stored
            result: scoreResult as unknown as object,
          },
          select: { id: true },
        });

        // ── C-M2: re-validate the email render inputs UNDER the lock. The
        // prepared rows were rendered/decided from the Phase-1 (unlocked) read;
        // if the results-email approval/content/toggle or the coach-notify
        // toggle/identity changed in the Phase-1 → Phase-2 window, the matching
        // prepared row is stale and must be DROPPED (never inserted). Mirrors
        // the per-email skip-on-failure handling used in the INSERT loop below —
        // the submission itself is unaffected.
        const phase2Fingerprint = emailRenderFingerprint(locked.campaign);
        const rowsToEnqueue = preparedRows.filter((row) => {
          if (row.emailType === "ASSESSMENT_RESULTS") {
            if (phase2Fingerprint.results !== phase1Fingerprint.results) {
              console.warn(
                `[assessment-submit] #15 results row dropped — render inputs changed under lock (campaignId=${locked.campaignId})`
              );
              return false;
            }
          } else if (row.emailType === "COACH_COMPLETION") {
            if (phase2Fingerprint.coach !== phase1Fingerprint.coach) {
              console.warn(
                `[assessment-submit] #16 coach-notify row dropped — render inputs changed under lock (campaignId=${locked.campaignId})`
              );
              return false;
            }
          }
          return true;
        });

        // ── Wave D: INSERT the pre-rendered outbox rows IN-TX (transactional
        // outbox). The submission + its outbox rows commit atomically; the
        // double-submit 409 above guarantees exactly-once. Each INSERT is
        // guarded so a write failure for one email NEVER rolls back the
        // submission — it is simply skipped (the unique [submissionId,
        // recipientRole] keeps it idempotent on replay).
        for (const row of rowsToEnqueue) {
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
            // R2-L8: the outbox row has no metadata column (no migration), so
            // record which renderer produced the (frozen) bodyHtml as a
            // structured log line — keeps send-side provenance after #25
            // removed the visible footer stamp. No PII (no answer text).
            const alias = locked.campaign.template?.alias ?? null;
            console.info("[assessment-report] enqueued", {
              templateAlias: alias,
              reportType: reportConfigFor(alias).reportType,
              emailType: row.emailType,
              recipientRole: row.recipientRole,
              versionId: locked.campaign.version?.id ?? null,
            });
          } catch (err) {
            console.error(
              `[assessment-submit] outbox enqueue skipped (${row.recipientRole}):`,
              err
            );
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
          discloseOnScreen,
        };
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
            ...(onScreenReport ? { report: onScreenReport } : {}),
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
    console.error("[assessment-submit] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit answers" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
