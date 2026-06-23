/**
 * Inngest Function: Execute Workflow (JV-11 + JV-22)
 *
 * Triggered by "workflow/schedule" event when a workflow is assigned to a workshop.
 * Processes all active steps in the workflow, scheduling emails at the correct times
 * relative to the workshop's event date.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import {
  interpolateTemplate,
  type WorkflowContext,
} from "@/lib/workflows/workflow-service";
import { TRIGGER_TYPES, STEP_TYPES } from "@/lib/workflows/workflow-types";
import {
  scheduleWorkflowExecution,
  recordWorkflowExecution,
} from "@/lib/workflows/record-workflow-execution";
// ENH-MAY6-10: per-recipient child rows for the workflow execution audit.
import {
  recordRecipientExecution,
} from "@/lib/workflows/recipient-execution";
// PR-3 (audit Inngest dedup): reuse-or-synthesize ONE parent per delivery batch
// + send-each-recipient-at-most-once across retries.
import {
  ensureExecutionParent,
  sendFanoutRecipients,
  isTerminalSmtpError,
} from "@/lib/workflows/fanout-delivery";
import { resolveEventStartMoment } from "@/lib/workflows/resolve-event-start-moment";
import { orderStepsForExecution } from "@/lib/workflows/order-steps-for-execution";
import { buildLocationString } from "@/lib/ics-generator";
import { formatTimeWithZone, formatZoneAbbrev } from "@/lib/utils";
import {
  buildProtectedEmailAttachments,
  canDeliverWorkflowAttachments,
  getWorkflowStepFiles,
} from "@/lib/files/file-service";
import { getOrCreateSurveyLink } from "@/lib/surveys/survey-automation";
import { sendEmailViaSMTP } from "@/lib/smtp-transport";
import { recordDeliveryTelemetry } from "@/lib/delivery-telemetry";
import type { FileRecipientRole } from "@/lib/files/file-access";
import { SURVEY_TYPES } from "@/lib/surveys/survey-types";

function resolveSurveyType(workflowStep: {
  triggerType: string;
  offsetDays: number | null;
}): string {
  if (workflowStep.triggerType === TRIGGER_TYPES.ON_REGISTRATION) {
    return SURVEY_TYPES.PRE_WORKSHOP;
  }

  if (workflowStep.triggerType === TRIGGER_TYPES.ON_APPROVAL) {
    return SURVEY_TYPES.PRE_WORKSHOP;
  }

  return (workflowStep.offsetDays ?? 0) < 0
    ? SURVEY_TYPES.PRE_WORKSHOP
    : SURVEY_TYPES.POST_WORKSHOP;
}

function buildFileLinksHtml(
  links: Array<{ filename: string; path: string }>
): string {
  return `<ul>${links
    .map(
      (link) =>
        `<li><a href="${link.path}" target="_blank" rel="noreferrer">${link.filename}</a></li>`
    )
    .join("")}</ul>`;
}

export const executeWorkflow = inngest.createFunction(
  { id: "execute-workflow", retries: 2 },
  { event: "workflow/schedule" },
  async ({ event, step }) => {
    const { workshopId, workflowAssignmentId } = event.data;

    // Step 1: Fetch the assignment, workflow steps, and workshop data
    const assignment = await step.run("fetch-assignment", async () => {
      return db.workflowAssignment.findUnique({
        where: { id: workflowAssignmentId },
        include: {
          workflow: {
            include: {
              steps: {
                where: { isActive: true },
                orderBy: { sortOrder: "asc" },
                include: { emailTemplate: true },
              },
            },
          },
          workshop: {
            include: {
              coach: { select: { firstName: true, lastName: true, email: true } },
            },
          },
        },
      });
    });

    if (!assignment || !assignment.isActive) {
      return { skipped: true, reason: "Assignment not found or inactive" };
    }

    const { workflow, workshop } = assignment;
    const appUrl = process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";

    // BUG-MAY4-1a: Workshop.eventDate is stored as midnight UTC; the actual
    // time-of-day lives in workshop.eventTime ("16:00 - 18:00") and the IANA
    // zone in workshop.timezone. Combine them to the true start moment so
    // calculateSendDate offsets land on real wall-clock times instead of
    // ~20 hours before the event.
    const eventDate = resolveEventStartMoment({
      eventDate: new Date(workshop.eventDate),
      eventTime: workshop.eventTime,
      timezone: workshop.timezone,
    });

    // Build context for variable interpolation
    const baseContext: WorkflowContext = {
      workshopTitle: workshop.title,
      workshopCode: workshop.workshopCode,
      workshopDate: eventDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }),
      // Carry the DST-aware zone abbreviation (e.g. "9:00 AM EDT"). Anchor on the
      // RAW stored workshop.eventDate (midnight UTC of the event day), NOT the
      // resolved start-moment above — formatZoneAbbrev derives the correct DST
      // offset from the event's UTC calendar date.
      workshopTime: formatTimeWithZone(
        workshop.eventTime,
        new Date(workshop.eventDate),
        workshop.timezone,
      ),
      workshopTimezone: formatZoneAbbrev(
        new Date(workshop.eventDate),
        workshop.timezone,
      ),
      workshopLocation: workshop.format === "VIRTUAL"
        ? (workshop.virtualLink ?? "")
        : buildLocationString(workshop),
      workshopUrl: workshop.landingPageSlug
        ? `${appUrl}/workshop/${workshop.landingPageSlug}`
        : appUrl,
      workshopFormat: workshop.format ?? "",
      coachName: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
      coachEmail: workshop.coach.email,
    };

    let stepsExecuted = 0;
    let stepsFailed = 0;

    // BUG-MAY6-1: Sort steps by their computed sendAt before iteration. The
    // sequential step.sleepUntil loop below only moves time forward, so any
    // step whose offset is earlier-in-time than a previous step's would skip
    // its sleep (past-guard) and fire immediately. Sorting ensures each
    // RELATIVE step sleeps until exactly its scheduled time. Non-RELATIVE
    // steps carry no sendAt and execute first in their original sortOrder.
    const orderedSteps = orderStepsForExecution(
      workflow.steps,
      eventDate,
      workshop.timezone,
    );

    // Step 2: Process each workflow step
    for (const { step: workflowStep, sendAt: precomputedSendAt } of orderedSteps) {
      const stepName = `step-${workflowStep.sortOrder}-${workflowStep.stepType}`;

      // BUG-09: track scheduledFor + the SCHEDULED row id (if any) so the
      // terminal write can preserve the originally-computed time and the
      // portal renderer shows future-scheduled work immediately.
      let effectiveScheduledFor: Date = new Date();
      let executionId: string | undefined;

      // Determine timing
      if (workflowStep.triggerType === TRIGGER_TYPES.RELATIVE_TO_EVENT && precomputedSendAt) {
        const sendAt = precomputedSendAt;
        effectiveScheduledFor = sendAt;

        // Schedule for future; if already past, fire immediately (no sleep)
        if (sendAt > new Date()) {
          // BUG-09: persist a SCHEDULED row pre-sleep so the Workflow Status
          // card shows "scheduled for tomorrow 8:00 AM" before the step
          // fires. step.run keys this on stepName so retries/replays don't
          // duplicate the row.
          const scheduled = await step.run(`schedule-execution-${stepName}`, async () => {
            return scheduleWorkflowExecution(db, {
              stepId: workflowStep.id,
              workshopId: workshop.id,
              scheduledFor: sendAt,
            });
          });
          executionId = scheduled.id;
          await step.sleepUntil(`wait-${stepName}`, sendAt);
        } else {
          console.warn(
            `[execute-workflow] Step ${workflowStep.id} scheduled for past (${sendAt.toISOString()}). Firing immediately.`
          );
        }
      }

      // Execute the step based on type
      try {
        await step.run(`execute-${stepName}`, async () => {
          // Guard: re-check assignment liveness — fetch-assignment is memoized
          // by Inngest and will replay its cached result (isActive: true) even
          // after the workshop is canceled/deleted during step.sleepUntil.
          // This fresh query is NOT memoized (first run of this specific step),
          // so it reflects the current DB state at execution time.
          const freshAssignment = await db.workflowAssignment.findUnique({
            where: { id: workflowAssignmentId },
            select: { isActive: true },
          });
          if (!freshAssignment || !freshAssignment.isActive) {
            return;
          }

          // Resolve email subject and body
          let subject = workflowStep.subject || "";
          let body = workflowStep.body || "";

          if (workflowStep.emailTemplate) {
            subject = subject || workflowStep.emailTemplate.subject;
            body = body || workflowStep.emailTemplate.body;
          }

          // Interpolate variables
          subject = interpolateTemplate(subject, baseContext);
          body = interpolateTemplate(body, baseContext);

          // JV-12/P1: Fetch attachments and apply stage + role delivery protection
          const stepFiles = await getWorkflowStepFiles(workflowStep.id);

          // Determine recipients based on step type
          const recipients: string[] = [];
          let recipientRole: FileRecipientRole = "CUSTOM";

          switch (workflowStep.stepType) {
            case STEP_TYPES.EMAIL_COACH: {
              // Dedup guard — prevent double-send on Inngest retry
              const existingExecution = await db.workflowStepExecution.findFirst({
                where: { stepId: workflowStep.id, workshopId: workshop.id, status: "SENT" },
              });
              if (existingExecution) {
                console.warn(
                  `[execute-workflow] EMAIL_COACH step ${workflowStep.id} already sent for workshop ${workshop.id}. Skipping duplicate.`
                );
                stepsExecuted++;
                return;
              }
              recipientRole = "COACH";
              recipients.push(workshop.coach.email);
              break;
            }

            case STEP_TYPES.EMAIL_STAFF: {
              // Dedup guard — prevent double-send on Inngest retry
              const existingExecution = await db.workflowStepExecution.findFirst({
                where: { stepId: workflowStep.id, workshopId: workshop.id, status: "SENT" },
              });
              if (existingExecution) {
                console.warn(
                  `[execute-workflow] EMAIL_STAFF step ${workflowStep.id} already sent for workshop ${workshop.id}. Skipping duplicate.`
                );
                stepsExecuted++;
                return;
              }
              recipientRole = "STAFF";
              recipients.push(process.env.ADMIN_EMAIL || "admin@scalingup.com");
              break;
            }

            case STEP_TYPES.EMAIL_CUSTOM: {
              // Dedup guard — prevent double-send on Inngest retry
              const existingExecution = await db.workflowStepExecution.findFirst({
                where: { stepId: workflowStep.id, workshopId: workshop.id, status: "SENT" },
              });
              if (existingExecution) {
                console.warn(
                  `[execute-workflow] EMAIL_CUSTOM step ${workflowStep.id} already sent for workshop ${workshop.id}. Skipping duplicate.`
                );
                stepsExecuted++;
                return;
              }
              recipientRole = "CUSTOM";
              if (workflowStep.customRecipients) {
                try {
                  const parsed = JSON.parse(workflowStep.customRecipients);
                  if (Array.isArray(parsed)) recipients.push(...parsed);
                } catch {
                  // Treat as comma-separated
                  recipients.push(
                    ...workflowStep.customRecipients.split(",").map((e: string) => e.trim())
                  );
                }
              }
              break;
            }

            case STEP_TYPES.EMAIL_ATTENDEES: {
              recipientRole = "ATTENDEE";

              // Dedup guard: skip if this step was already successfully executed (Inngest retry).
              // ENH-MAY6-10: filter to parentId: null so per-recipient child SENT rows
              // don't trigger the dedup. Only the parent rollup signals "step finished."
              const existingExecution = await db.workflowStepExecution.findFirst({
                where: {
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SENT",
                  parentId: null,
                },
              });
              if (existingExecution) {
                console.warn(
                  `[execute-workflow] EMAIL_ATTENDEES step ${workflowStep.id} already sent for workshop ${workshop.id}. Skipping duplicate.`
                );
                stepsExecuted++;
                return;
              }

              // Fetch all registrations for this workshop
              const registrations = await db.registration.findMany({
                where: { workshopId: workshop.id, status: { in: ["REGISTERED", "CONFIRMED"] } },
                select: { id: true, email: true, firstName: true, lastName: true, company: true },
              });
              const canAttach = canDeliverWorkflowAttachments({
                recipientRole,
                workshopStatus: workshop.status,
              });
              if (!canAttach && stepFiles.length > 0) {
                await recordDeliveryTelemetry({
                  recipient: "SYSTEM",
                  subject: subject || workflowStep.emailTemplate?.subject || "Workflow step execution",
                  status: "SKIPPED",
                  provider: process.env.SMTP_HOST ? "SMTP" : "MOCK",
                  workshopId: workshop.id,
                  workshopCode: workshop.workshopCode,
                  workflowId: workflow.id,
                  workflowStepId: workflowStep.id,
                  recipientRole,
                  metadata: {
                    reason: "attachment_policy_blocked",
                    workshopStatus: workshop.status,
                    attemptedAttachmentCount: stepFiles.length,
                  },
                });
              }
              const attendeeAttachments = canAttach
                ? buildProtectedEmailAttachments({
                    files: stepFiles,
                    workshopId: workshop.id,
                    workshopStatus: workshop.status,
                    recipientRole,
                  })
                : [];

              // BUG-MAY4-1b: 0 registrants → SKIPPED (not false SENT).
              if (registrations.length === 0) {
                await recordWorkflowExecution(db, {
                  executionId,
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SKIPPED",
                  scheduledFor: effectiveScheduledFor,
                  executedAt: new Date(),
                  error: "No recipients at scheduled time",
                });
                stepsExecuted++;
                return;
              }

              // PR-3 (audit dedup): anchor the fan-out on ONE reused parent.
              // Scheduled path already has a portal-visible parent (executionId);
              // the immediate path has none → synthesize one keyed by a stable
              // deliveryBatchKey so an Inngest retry reuses it and skips
              // already-SENT recipients instead of re-emailing them.
              const parentId =
                executionId ??
                (await ensureExecutionParent(db, {
                  deliveryBatchKey: `wf:${workflowAssignmentId}:${workflowStep.id}`,
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  scheduledFor: effectiveScheduledFor,
                }));
              const regById = new Map(registrations.map((r) => [r.id, r]));

              // sendFanoutRecipients skips prior-SENT children, sends the rest,
              // records each SENT immediately, and rolls the parent up.
              await sendFanoutRecipients(db, {
                parentId,
                stepId: workflowStep.id,
                workshopId: workshop.id,
                recipients: registrations.map((r) => ({ registrationId: r.id, email: r.email })),
                isTerminalError: isTerminalSmtpError,
                sendOne: async ({ registrationId }) => {
                  const reg = regById.get(registrationId);
                  if (!reg) return;
                  const personalContext: WorkflowContext = {
                    ...baseContext,
                    registrantName: `${reg.firstName} ${reg.lastName}`,
                    registrantEmail: reg.email,
                    registrantCompany: reg.company || "",
                  };
                  const personalSubject = interpolateTemplate(
                    workflowStep.subject || workflowStep.emailTemplate?.subject || "",
                    personalContext
                  );
                  const personalBody = interpolateTemplate(
                    workflowStep.body || workflowStep.emailTemplate?.body || "",
                    personalContext
                  );
                  await sendEmailViaSMTP({
                    to: reg.email,
                    subject: personalSubject,
                    html: personalBody,
                    attachments: attendeeAttachments,
                    telemetry: {
                      workshopId: workshop.id,
                      workshopCode: workshop.workshopCode,
                      workflowId: workflow.id,
                      workflowStepId: workflowStep.id,
                      recipientRole,
                      registrationId: reg.id,
                      metadata: {
                        attemptedAttachmentCount: stepFiles.length,
                        attachedCount: attendeeAttachments.length,
                        attachmentPolicyAllowed: canAttach,
                      },
                    },
                  });
                },
              });

              stepsExecuted++;
              return; // Skip the generic send below
            }

            case STEP_TYPES.SEND_SURVEY_LINK: {
              recipientRole = "ATTENDEE";

              // ENH-MAY6-10: dedup guard filters to parent rows only.
              const existingExecution = await db.workflowStepExecution.findFirst({
                where: {
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SENT",
                  parentId: null,
                },
              });
              if (existingExecution) {
                console.warn(
                  `[execute-workflow] SEND_SURVEY_LINK step ${workflowStep.id} already sent for workshop ${workshop.id}. Skipping duplicate.`
                );
                stepsExecuted++;
                return;
              }

              const registrations = await db.registration.findMany({
                where: { workshopId: workshop.id, status: { in: ["REGISTERED", "CONFIRMED"] } },
                select: { id: true, email: true, firstName: true, lastName: true, company: true },
              });

              if (registrations.length === 0) {
                await recordWorkflowExecution(db, {
                  executionId,
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SKIPPED",
                  scheduledFor: effectiveScheduledFor,
                  executedAt: new Date(),
                  error: "No recipients at scheduled time",
                });
                return;
              }

              const surveyType = resolveSurveyType(workflowStep);

              // PR-3 (audit dedup): reuse the scheduled parent, else synthesize.
              const parentId =
                executionId ??
                (await ensureExecutionParent(db, {
                  deliveryBatchKey: `wf:${workflowAssignmentId}:${workflowStep.id}`,
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  scheduledFor: effectiveScheduledFor,
                }));

              // Resolve each recipient's survey link up front. A link-gen
              // failure records a per-recipient FAILED child under the reused
              // parent (so the rollup surfaces FAILED) and drops that recipient;
              // the rest fan out. On retry, getOrCreateSurveyLink is idempotent
              // and a previously-failed link may now resolve (FAILED→SENT upsert).
              const regById = new Map(registrations.map((r) => [r.id, r]));
              const linkByReg = new Map<string, { surveyUrl: string; surveyId: string }>();
              for (const reg of registrations) {
                const surveyLink = await getOrCreateSurveyLink({
                  workshopId: workshop.id,
                  registrationId: reg.id,
                  surveyType,
                  templateId: workflowStep.surveyTemplateId ?? undefined, // BUG-06: use pinned template if set
                });
                if (!surveyLink) {
                  await recordRecipientExecution(db, {
                    parentId,
                    stepId: workflowStep.id,
                    workshopId: workshop.id,
                    registrationId: reg.id,
                    recipientEmail: reg.email,
                    status: "FAILED",
                    errorMessage: "link_generation_failed",
                  });
                  continue;
                }
                linkByReg.set(reg.id, surveyLink);
              }

              const sendable = registrations.filter((r) => linkByReg.has(r.id));
              if (sendable.length === 0) {
                // Every recipient failed link generation → nothing to send.
                // Finalize the reused parent FAILED with the operator-facing
                // message (per-recipient FAILED children carry the granular reason).
                await recordWorkflowExecution(db, {
                  executionId: parentId,
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "FAILED",
                  scheduledFor: effectiveScheduledFor,
                  executedAt: new Date(),
                  error: "No survey link could be generated",
                });
                return;
              }
              const outcome = await sendFanoutRecipients(db, {
                parentId,
                stepId: workflowStep.id,
                workshopId: workshop.id,
                recipients: sendable.map((r) => ({ registrationId: r.id, email: r.email })),
                isTerminalError: isTerminalSmtpError,
                sendOne: async ({ registrationId }) => {
                  const reg = regById.get(registrationId);
                  const surveyLink = linkByReg.get(registrationId);
                  if (!reg || !surveyLink) return;
                  const personalContext: WorkflowContext = {
                    ...baseContext,
                    registrantName: `${reg.firstName} ${reg.lastName}`,
                    registrantEmail: reg.email,
                    registrantCompany: reg.company || "",
                    surveyUrl: surveyLink.surveyUrl,
                  };
                  const defaultSubject =
                    surveyType === SURVEY_TYPES.PRE_WORKSHOP
                      ? `Pre-Workshop Survey: ${workshop.title}`
                      : `Workshop Feedback: ${workshop.title}`;
                  const defaultBody =
                    surveyType === SURVEY_TYPES.PRE_WORKSHOP
                      ? `<p>Hi {{registrantName}},</p><p>Please complete your pre-workshop survey here:</p><p><a href="{{surveyUrl}}">Complete Survey</a></p>`
                      : `<p>Hi {{registrantName}},</p><p>Please share your workshop feedback here:</p><p><a href="{{surveyUrl}}">Open Survey</a></p>`;
                  const personalSubject = interpolateTemplate(
                    workflowStep.subject || defaultSubject,
                    personalContext
                  );
                  const personalBody = interpolateTemplate(
                    workflowStep.body || defaultBody,
                    personalContext
                  );
                  await sendEmailViaSMTP({
                    to: reg.email,
                    subject: personalSubject,
                    html: personalBody,
                    telemetry: {
                      workshopId: workshop.id,
                      workshopCode: workshop.workshopCode,
                      workflowId: workflow.id,
                      workflowStepId: workflowStep.id,
                      recipientRole,
                      registrationId: reg.id,
                      metadata: {
                        surveyType,
                        surveyId: surveyLink.surveyId,
                      },
                    },
                  });
                },
              });
              // sendFanoutRecipients rolls the parent up over ALL children
              // (FAILED link-gen + SENT) with FAILED > SENT > SKIPPED precedence.

              if (outcome.sent > 0) {
                stepsExecuted++;
              }
              return;
            }

            case STEP_TYPES.SEND_FILE_LINK: {
              recipientRole = "ATTENDEE";

              // ENH-MAY6-10: dedup guard filters to parent rows only.
              const existingExecution = await db.workflowStepExecution.findFirst({
                where: {
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SENT",
                  parentId: null,
                },
              });
              if (existingExecution) {
                console.warn(
                  `[execute-workflow] SEND_FILE_LINK step ${workflowStep.id} already sent for workshop ${workshop.id}. Skipping duplicate.`
                );
                stepsExecuted++;
                return;
              }

              if (stepFiles.length === 0) {
                await recordWorkflowExecution(db, {
                  executionId,
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SKIPPED",
                  scheduledFor: effectiveScheduledFor,
                  executedAt: new Date(),
                  error: "No files attached to step",
                });
                return;
              }

              const canAttach = canDeliverWorkflowAttachments({
                recipientRole,
                workshopStatus: workshop.status,
              });

              if (!canAttach) {
                await recordDeliveryTelemetry({
                  recipient: "SYSTEM",
                  subject: subject || workflowStep.emailTemplate?.subject || "Workflow step execution",
                  status: "SKIPPED",
                  provider: process.env.SMTP_HOST ? "SMTP" : "MOCK",
                  workshopId: workshop.id,
                  workshopCode: workshop.workshopCode,
                  workflowId: workflow.id,
                  workflowStepId: workflowStep.id,
                  recipientRole,
                  metadata: {
                    reason: "attachment_policy_blocked",
                    workshopStatus: workshop.status,
                    attemptedAttachmentCount: stepFiles.length,
                  },
                });
                await recordWorkflowExecution(db, {
                  executionId,
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SKIPPED",
                  scheduledFor: effectiveScheduledFor,
                  executedAt: new Date(),
                  error: "Attachment policy blocked file-link delivery",
                });
                return;
              }

              const protectedLinks = buildProtectedEmailAttachments({
                files: stepFiles,
                workshopId: workshop.id,
                workshopStatus: workshop.status,
                recipientRole,
              });
              const registrations = await db.registration.findMany({
                where: { workshopId: workshop.id, status: { in: ["REGISTERED", "CONFIRMED"] } },
                select: { id: true, email: true, firstName: true, lastName: true, company: true },
              });
              const fileLinks = buildFileLinksHtml(protectedLinks);

              // 0 recipients → SKIPPED (parity with prior loop-over-empty behavior).
              if (registrations.length === 0) {
                await recordWorkflowExecution(db, {
                  executionId,
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SKIPPED",
                  scheduledFor: effectiveScheduledFor,
                  executedAt: new Date(),
                  error: "No recipients at scheduled time",
                });
                return;
              }

              // PR-3 (audit dedup): reuse the scheduled parent, else synthesize.
              const parentId =
                executionId ??
                (await ensureExecutionParent(db, {
                  deliveryBatchKey: `wf:${workflowAssignmentId}:${workflowStep.id}`,
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  scheduledFor: effectiveScheduledFor,
                }));
              const regById = new Map(registrations.map((r) => [r.id, r]));

              const outcome = await sendFanoutRecipients(db, {
                parentId,
                stepId: workflowStep.id,
                workshopId: workshop.id,
                recipients: registrations.map((r) => ({ registrationId: r.id, email: r.email })),
                isTerminalError: isTerminalSmtpError,
                sendOne: async ({ registrationId }) => {
                  const reg = regById.get(registrationId);
                  if (!reg) return;
                  const personalContext: WorkflowContext = {
                    ...baseContext,
                    registrantName: `${reg.firstName} ${reg.lastName}`,
                    registrantEmail: reg.email,
                    registrantCompany: reg.company || "",
                    fileLinks,
                  };
                  const personalSubject = interpolateTemplate(
                    workflowStep.subject || `Workshop Files: ${workshop.title}`,
                    personalContext
                  );
                  const personalBody = interpolateTemplate(
                    workflowStep.body ||
                      `<p>Hi {{registrantName}},</p><p>Your workshop files are ready:</p>{{fileLinks}}`,
                    personalContext
                  );
                  await sendEmailViaSMTP({
                    to: reg.email,
                    subject: personalSubject,
                    html: personalBody,
                    telemetry: {
                      workshopId: workshop.id,
                      workshopCode: workshop.workshopCode,
                      workflowId: workflow.id,
                      workflowStepId: workflowStep.id,
                      recipientRole,
                      registrationId: reg.id,
                      metadata: {
                        fileLinkCount: protectedLinks.length,
                      },
                    },
                  });
                },
              });

              if (outcome.sent > 0) stepsExecuted++;
              return;
            }

            case STEP_TYPES.NOTIFICATION:
              // Teams notification or system log
              console.log(`[Workflow Notification] ${subject}: ${body}`);
              await recordWorkflowExecution(db, {
                executionId,
                stepId: workflowStep.id,
                workshopId: workshop.id,
                status: "SENT",
                scheduledFor: effectiveScheduledFor,
                executedAt: new Date(),
              });
              stepsExecuted++;
              return;
          }

          const canAttach = canDeliverWorkflowAttachments({
            recipientRole,
            workshopStatus: workshop.status,
          });
          if (!canAttach && stepFiles.length > 0) {
            await recordDeliveryTelemetry({
              recipient: "SYSTEM",
              subject: subject || workflowStep.emailTemplate?.subject || "Workflow step execution",
              status: "SKIPPED",
              provider: process.env.SMTP_HOST ? "SMTP" : "MOCK",
              workshopId: workshop.id,
              workshopCode: workshop.workshopCode,
              workflowId: workflow.id,
              workflowStepId: workflowStep.id,
              recipientRole,
              metadata: {
                reason: "attachment_policy_blocked",
                workshopStatus: workshop.status,
                attemptedAttachmentCount: stepFiles.length,
              },
            });
          }
          const protectedAttachments = canAttach
            ? buildProtectedEmailAttachments({
                files: stepFiles,
                workshopId: workshop.id,
                workshopStatus: workshop.status,
                recipientRole,
              })
            : [];

          // Send to collected recipients with attachments
          for (const recipient of recipients) {
            await sendEmailViaSMTP({
              to: recipient,
              subject,
              html: body,
              attachments: protectedAttachments,
              telemetry: {
                workshopId: workshop.id,
                workshopCode: workshop.workshopCode,
                workflowId: workflow.id,
                workflowStepId: workflowStep.id,
                recipientRole,
                metadata: {
                  attemptedAttachmentCount: stepFiles.length,
                  attachedCount: protectedAttachments.length,
                  attachmentPolicyAllowed: canAttach,
                },
              },
            });
          }

          // Record execution
          await recordWorkflowExecution(db, {
            executionId,
            stepId: workflowStep.id,
            workshopId: workshop.id,
            status: "SENT",
            scheduledFor: effectiveScheduledFor,
            executedAt: new Date(),
          });

          stepsExecuted++;
        });
      } catch (err) {
        stepsFailed++;

        // Record failure (BUG-09: preserve scheduledFor + transition SCHEDULED row if any)
        await step.run(`record-failure-${stepName}`, async () => {
          await recordWorkflowExecution(db, {
            executionId,
            stepId: workflowStep.id,
            workshopId: workshop.id,
            status: "FAILED",
            scheduledFor: effectiveScheduledFor,
            executedAt: new Date(),
            error: err instanceof Error ? err.message : "Unknown error",
            attempts: 1,
          });
        });
      }
    }

    return {
      success: true,
      workshopId,
      workflowId: workflow.id,
      stepsExecuted,
      stepsFailed,
      totalSteps: workflow.steps.length,
    };
  }
);

export default executeWorkflow;
