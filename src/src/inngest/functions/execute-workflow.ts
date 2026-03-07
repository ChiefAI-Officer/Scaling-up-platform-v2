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
  calculateSendDate,
  type WorkflowContext,
} from "@/lib/workflow-service";
import { TRIGGER_TYPES, STEP_TYPES } from "@/lib/workflow-types";
import { buildLocationString } from "@/lib/ics-generator";
import {
  buildProtectedEmailAttachments,
  canDeliverWorkflowAttachments,
  getWorkflowStepFiles,
} from "@/lib/file-service";
import { getOrCreateSurveyLink } from "@/lib/survey-automation";
import { sendEmailViaSMTP } from "@/lib/smtp-transport";
import { recordDeliveryTelemetry } from "@/lib/delivery-telemetry";
import type { FileRecipientRole } from "@/lib/file-access";
import { SURVEY_TYPES } from "@/lib/survey-types";

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

    // eventDate may be serialized to string through Inngest step.run
    const eventDate = new Date(workshop.eventDate);

    // Build context for variable interpolation
    const baseContext: WorkflowContext = {
      workshopTitle: workshop.title,
      workshopCode: workshop.workshopCode,
      workshopDate: eventDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      workshopTime: workshop.eventTime || "TBD",
      workshopLocation: buildLocationString(workshop),
      workshopUrl: workshop.landingPageSlug
        ? `${appUrl}/workshop/${workshop.landingPageSlug}`
        : appUrl,
      workshopFormat: workshop.format,
      coachName: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
      coachEmail: workshop.coach.email,
    };

    let stepsExecuted = 0;
    let stepsFailed = 0;

    // Step 2: Process each workflow step
    for (const workflowStep of workflow.steps) {
      const stepName = `step-${workflowStep.sortOrder}-${workflowStep.stepType}`;

      // Determine timing
      if (workflowStep.triggerType === TRIGGER_TYPES.RELATIVE_TO_EVENT) {
        const sendAt = calculateSendDate(
          eventDate,
          workflowStep.offsetDays ?? 0,
          workflowStep.offsetHours,
          workflowStep.sendTimeOfDay,
          workshop.timezone
        );

        // Only schedule if the send time is in the future
        if (sendAt > new Date()) {
          await step.sleepUntil(`wait-${stepName}`, sendAt);
        } else {
          // Skip past steps
          await step.run(`skip-${stepName}`, async () => {
            await db.workflowStepExecution.create({
              data: {
                stepId: workflowStep.id,
                workshopId: workshop.id,
                status: "SKIPPED",
                scheduledFor: sendAt,
                executedAt: new Date(),
                errorMessage: "Send time already passed",
              },
            });
          });
          continue;
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
            case STEP_TYPES.EMAIL_COACH:
              recipientRole = "COACH";
              recipients.push(workshop.coach.email);
              break;

            case STEP_TYPES.EMAIL_STAFF:
              recipientRole = "STAFF";
              recipients.push(process.env.ADMIN_EMAIL || "admin@scalingup.com");
              break;

            case STEP_TYPES.EMAIL_CUSTOM:
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

            case STEP_TYPES.EMAIL_ATTENDEES: {
              recipientRole = "ATTENDEE";

              // Dedup guard: skip if this step was already successfully executed (Inngest retry)
              const existingExecution = await db.workflowStepExecution.findFirst({
                where: {
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SENT",
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
                where: { workshopId: workshop.id, status: "REGISTERED" },
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
              }

              // Record execution
              await db.workflowStepExecution.create({
                data: {
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SENT",
                  scheduledFor: new Date(),
                  executedAt: new Date(),
                },
              });

              stepsExecuted++;
              return; // Skip the generic send below
            }

            case STEP_TYPES.SEND_SURVEY_LINK: {
              recipientRole = "ATTENDEE";

              const existingExecution = await db.workflowStepExecution.findFirst({
                where: {
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SENT",
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
                where: { workshopId: workshop.id, status: "REGISTERED" },
                select: { id: true, email: true, firstName: true, lastName: true, company: true },
              });

              const surveyType = resolveSurveyType(workflowStep);
              let sentCount = 0;
              for (const reg of registrations) {
                const surveyLink = await getOrCreateSurveyLink({
                  workshopId: workshop.id,
                  registrationId: reg.id,
                  surveyType,
                });

                if (!surveyLink) {
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
              }

              await db.workflowStepExecution.create({
                data: {
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: sentCount > 0 ? "SENT" : "SKIPPED",
                  scheduledFor: new Date(),
                  executedAt: new Date(),
                  ...(sentCount === 0 ? { errorMessage: "No survey link could be generated" } : {}),
                },
              });

              if (sentCount > 0) {
                stepsExecuted++;
              }
              return;
            }

            case STEP_TYPES.SEND_FILE_LINK: {
              recipientRole = "ATTENDEE";

              const existingExecution = await db.workflowStepExecution.findFirst({
                where: {
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SENT",
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
                await db.workflowStepExecution.create({
                  data: {
                    stepId: workflowStep.id,
                    workshopId: workshop.id,
                    status: "SKIPPED",
                    scheduledFor: new Date(),
                    executedAt: new Date(),
                    errorMessage: "No files attached to step",
                  },
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
                await db.workflowStepExecution.create({
                  data: {
                    stepId: workflowStep.id,
                    workshopId: workshop.id,
                    status: "SKIPPED",
                    scheduledFor: new Date(),
                    executedAt: new Date(),
                    errorMessage: "Attachment policy blocked file-link delivery",
                  },
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
                where: { workshopId: workshop.id, status: "REGISTERED" },
                select: { id: true, email: true, firstName: true, lastName: true, company: true },
              });
              const fileLinks = buildFileLinksHtml(protectedLinks);

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
              }

              await db.workflowStepExecution.create({
                data: {
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SENT",
                  scheduledFor: new Date(),
                  executedAt: new Date(),
                },
              });

              stepsExecuted++;
              return;
            }

            case STEP_TYPES.NOTIFICATION:
              // Teams notification or system log
              console.log(`[Workflow Notification] ${subject}: ${body}`);
              await db.workflowStepExecution.create({
                data: {
                  stepId: workflowStep.id,
                  workshopId: workshop.id,
                  status: "SENT",
                  executedAt: new Date(),
                },
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
          await db.workflowStepExecution.create({
            data: {
              stepId: workflowStep.id,
              workshopId: workshop.id,
              status: "SENT",
              scheduledFor: new Date(),
              executedAt: new Date(),
            },
          });

          stepsExecuted++;
        });
      } catch (err) {
        stepsFailed++;

        // Record failure
        await step.run(`record-failure-${stepName}`, async () => {
          await db.workflowStepExecution.create({
            data: {
              stepId: workflowStep.id,
              workshopId: workshop.id,
              status: "FAILED",
              executedAt: new Date(),
              errorMessage: err instanceof Error ? err.message : "Unknown error",
              attempts: 1,
            },
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
