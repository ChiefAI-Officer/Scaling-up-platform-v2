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
  finalizeParentRollup,
} from "@/lib/workflows/recipient-execution";
import { resolveEventStartMoment } from "@/lib/workflows/resolve-event-start-moment";
import { orderStepsForExecution } from "@/lib/workflows/order-steps-for-execution";
import { buildLocationString } from "@/lib/ics-generator";
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
      workshopTime: workshop.eventTime || "TBD",
      workshopLocation: buildLocationString(workshop),
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

              const sentEmails = new Set<string>();
              for (const reg of registrations) {
                const normalizedEmail = reg.email.toLowerCase();
                if (sentEmails.has(normalizedEmail)) {
                  console.warn(`[execute-workflow] Skipping duplicate email ${reg.email} for step ${workflowStep.id}`);
                  continue;
                }
                sentEmails.add(normalizedEmail);

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

                // ENH-MAY6-10: per-recipient audit row for the admin
                // execution-status screen ("a line for each person it emails").
                if (executionId) {
                  await recordRecipientExecution(db, {
                    parentId: executionId,
                    stepId: workflowStep.id,
                    workshopId: workshop.id,
                    registrationId: reg.id,
                    recipientEmail: reg.email,
                    status: "SENT",
                  });
                }
              }

              // BUG-MAY4-1b: 0 registrants → SKIPPED (not false SENT)
              const emailsSent = sentEmails.size;
              await recordWorkflowExecution(db, {
                executionId,
                stepId: workflowStep.id,
                workshopId: workshop.id,
                status: emailsSent > 0 ? "SENT" : "SKIPPED",
                scheduledFor: effectiveScheduledFor,
                executedAt: new Date(),
                ...(emailsSent === 0 ? { error: "No recipients at scheduled time" } : {}),
              });

              // BUG-MAY6-9 / Wave 6 Tier B: roll parent up over actual children
              // (FAILED > SENT > SKIPPED). No-op when no children exist.
              if (executionId) {
                await finalizeParentRollup(db, executionId);
              }

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
              let sentCount = 0;
              for (const reg of registrations) {
                const surveyLink = await getOrCreateSurveyLink({
                  workshopId: workshop.id,
                  registrationId: reg.id,
                  surveyType,
                  templateId: workflowStep.surveyTemplateId ?? undefined, // BUG-06: use pinned template if set
                });

                if (!surveyLink) {
                  // BUG-MAY6-9 / Wave 6 Tier B: record per-recipient FAILED
                  // child so ops sees the link-gen failure instead of a
                  // silent skip. Gated on executionId — the immediate path
                  // has no parent and is documented as a deferred Beta gap.
                  if (executionId) {
                    await recordRecipientExecution(db, {
                      parentId: executionId,
                      stepId: workflowStep.id,
                      workshopId: workshop.id,
                      registrationId: reg.id,
                      recipientEmail: reg.email,
                      status: "FAILED",
                      errorMessage: "link_generation_failed",
                    });
                  }
                  continue;
                }

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
                sentCount++;

                // ENH-MAY6-10: per-recipient audit row.
                if (executionId) {
                  await recordRecipientExecution(db, {
                    parentId: executionId,
                    stepId: workflowStep.id,
                    workshopId: workshop.id,
                    registrationId: reg.id,
                    recipientEmail: reg.email,
                    status: "SENT",
                  });
                }
              }

              await recordWorkflowExecution(db, {
                executionId,
                stepId: workflowStep.id,
                workshopId: workshop.id,
                status: sentCount > 0 ? "SENT" : "SKIPPED",
                scheduledFor: effectiveScheduledFor,
                executedAt: new Date(),
                ...(sentCount === 0 ? { error: "No survey link could be generated" } : {}),
              });

              // BUG-MAY6-9 / Wave 6 Tier B: parent rollup uses FAILED > SENT >
              // SKIPPED precedence so a step with link-gen failures + sends
              // surfaces as FAILED on the parent row.
              if (executionId) {
                await finalizeParentRollup(db, executionId);
              }

              if (sentCount > 0) {
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

              let fileEmailsSent = 0;
              for (const reg of registrations) {
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
                fileEmailsSent++;

                // ENH-MAY6-10: per-recipient audit row.
                if (executionId) {
                  await recordRecipientExecution(db, {
                    parentId: executionId,
                    stepId: workflowStep.id,
                    workshopId: workshop.id,
                    registrationId: reg.id,
                    recipientEmail: reg.email,
                    status: "SENT",
                  });
                }
              }

              await recordWorkflowExecution(db, {
                executionId,
                stepId: workflowStep.id,
                workshopId: workshop.id,
                status: fileEmailsSent > 0 ? "SENT" : "SKIPPED",
                scheduledFor: effectiveScheduledFor,
                executedAt: new Date(),
                ...(fileEmailsSent === 0 ? { error: "No recipients at scheduled time" } : {}),
              });

              // BUG-MAY6-9 / Wave 6 Tier B: parent rollup. SEND_FILE_LINK
              // throws on SMTP error so FAILED children only land via future
              // SMTP error classification work — today this is a no-op when
              // no children exist (matches existing behavior).
              if (executionId) {
                await finalizeParentRollup(db, executionId);
              }

              if (fileEmailsSent > 0) stepsExecuted++;
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
