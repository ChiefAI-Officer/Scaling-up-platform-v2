/**
 * Inngest Function: Trigger Workflow Step Now (ENH-08)
 *
 * Triggered by "workflow/step.trigger" event. Immediately executes a single
 * workflow step for the given workshop, bypassing any scheduled sleep.
 *
 * Includes an idempotency guard: if a SENT execution already exists for this
 * stepId + workshopId pair, the function returns early to prevent double-sends.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import {
    interpolateTemplate,
    type WorkflowContext,
} from "@/lib/workflows/workflow-service";
import { STEP_TYPES, TRIGGER_TYPES } from "@/lib/workflows/workflow-types";
import { resolveEventStartMoment } from "@/lib/workflows/resolve-event-start-moment";
import {
    recordRecipientExecution,
    finalizeParentRollup,
} from "@/lib/workflows/recipient-execution";
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

export const triggerWorkflowStep = inngest.createFunction(
    { id: "trigger-workflow-step", retries: 2 },
    { event: "workflow/step.trigger" },
    async ({ event, step }) => {
        const { stepId, workshopId } = event.data;

        // Idempotency guard: skip if already SENT, unless forceResend is set (manual re-trigger)
        const existingSent = await step.run("check-idempotency", async () => {
            return db.workflowStepExecution.findFirst({
                where: { stepId, workshopId, status: "SENT" },
                select: { id: true },
            });
        });

        if (existingSent && !event.data.forceResend) {
            console.warn(
                `[trigger-workflow-step] Step ${stepId} already SENT for workshop ${workshopId}. Skipping.`
            );
            return { skipped: true, reason: "already_sent" };
        }

        // Fetch the step (include its workflow for context)
        const workflowStep = await step.run("fetch-step", async () => {
            return db.workflowStep.findUnique({
                where: { id: stepId },
                include: {
                    emailTemplate: true,
                    workflow: true,
                },
                // surveyTemplateId is a scalar — included automatically (not a relation)
            });
        });

        if (!workflowStep) {
            return { skipped: true, reason: "step_not_found" };
        }

        // Fetch the workshop with coach
        const workshop = await step.run("fetch-workshop", async () => {
            return db.workshop.findUnique({
                where: { id: workshopId },
                include: {
                    coach: { select: { firstName: true, lastName: true, email: true } },
                },
            });
        });

        if (!workshop) {
            return { skipped: true, reason: "workshop_not_found" };
        }

        const appUrl =
            process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";
        // BUG-MAY4 follow-on: workshop.eventDate is midnight UTC; the actual event
        // start is in eventTime + timezone. Resolve to the true UTC moment so the
        // workshopDate / workshopTime context vars match what users actually see
        // in their inbox — same swap execute-workflow.ts already got in BUG-MAY4-1a.
        const eventDate = resolveEventStartMoment({
            eventDate: new Date(workshop.eventDate),
            eventTime: workshop.eventTime,
            timezone: workshop.timezone,
        });

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

        await step.run("execute-step", async () => {
            let subject = workflowStep.subject || "";
            let body = workflowStep.body || "";

            if (workflowStep.emailTemplate) {
                subject = subject || workflowStep.emailTemplate.subject;
                body = body || workflowStep.emailTemplate.body;
            }

            subject = interpolateTemplate(subject, baseContext);
            body = interpolateTemplate(body, baseContext);

            const stepFiles = await getWorkflowStepFiles(workflowStep.id);

            const recipients: string[] = [];
            let recipientRole: FileRecipientRole = "CUSTOM";

            switch (workflowStep.stepType) {
                case STEP_TYPES.EMAIL_COACH:
                    recipientRole = "COACH";
                    recipients.push(workshop.coach.email);
                    break;

                case STEP_TYPES.EMAIL_STAFF:
                    recipientRole = "STAFF";
                    recipients.push(
                        process.env.ADMIN_EMAIL || "admin@scalingup.com"
                    );
                    break;

                case STEP_TYPES.EMAIL_CUSTOM:
                    recipientRole = "CUSTOM";
                    if (workflowStep.customRecipients) {
                        try {
                            const parsed = JSON.parse(workflowStep.customRecipients);
                            if (Array.isArray(parsed)) recipients.push(...parsed);
                        } catch {
                            recipients.push(
                                ...workflowStep.customRecipients
                                    .split(",")
                                    .map((e: string) => e.trim())
                            );
                        }
                    }
                    break;

                case STEP_TYPES.EMAIL_ATTENDEES: {
                    recipientRole = "ATTENDEE";

                    const registrations = await db.registration.findMany({
                        where: {
                            workshopId: workshop.id,
                            status: { in: ["REGISTERED", "CONFIRMED"] },
                        },
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                            company: true,
                        },
                    });

                    // Wave 6 follow-on Part 2: pre-create parent row so
                    // per-recipient children attach + parent transitions
                    // via update (parity with execute-workflow.ts).
                    const parentRow = await db.workflowStepExecution.create({
                        data: {
                            stepId: workflowStep.id,
                            workshopId: workshop.id,
                            status: "SCHEDULED",
                            scheduledFor: new Date(),
                        },
                        select: { id: true },
                    });
                    const parentId = parentRow.id;

                    const canAttach = canDeliverWorkflowAttachments({
                        recipientRole,
                        workshopStatus: workshop.status,
                    });

                    if (!canAttach && stepFiles.length > 0) {
                        await recordDeliveryTelemetry({
                            recipient: "SYSTEM",
                            subject:
                                subject ||
                                workflowStep.emailTemplate?.subject ||
                                "Workflow step execution",
                            status: "SKIPPED",
                            provider: process.env.SMTP_HOST ? "SMTP" : "MOCK",
                            workshopId: workshop.id,
                            workshopCode: workshop.workshopCode,
                            workflowId: workflowStep.workflow.id,
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
                            console.warn(
                                `[trigger-workflow-step] Skipping duplicate email ${reg.email} for step ${workflowStep.id}`
                            );
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
                            workflowStep.subject ||
                                workflowStep.emailTemplate?.subject ||
                                "",
                            personalContext
                        );
                        const personalBody = interpolateTemplate(
                            workflowStep.body ||
                                workflowStep.emailTemplate?.body ||
                                "",
                            personalContext
                        );

                        try {
                            await sendEmailViaSMTP({
                                to: reg.email,
                                subject: personalSubject,
                                html: personalBody,
                                attachments: attendeeAttachments,
                                telemetry: {
                                    workshopId: workshop.id,
                                    workshopCode: workshop.workshopCode,
                                    workflowId: workflowStep.workflow.id,
                                    workflowStepId: workflowStep.id,
                                    recipientRole,
                                    registrationId: reg.id,
                                    metadata: {
                                        attemptedAttachmentCount: stepFiles.length,
                                        attachedCount: attendeeAttachments.length,
                                        attachmentPolicyAllowed: canAttach,
                                        triggeredManually: true,
                                    },
                                },
                            });
                            // Wave 6 follow-on Part 2: per-recipient SENT child.
                            await recordRecipientExecution(db, {
                                parentId,
                                stepId: workflowStep.id,
                                workshopId: workshop.id,
                                registrationId: reg.id,
                                recipientEmail: reg.email,
                                status: "SENT",
                            });
                        } catch (smtpErr) {
                            const msg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
                            const isTerminalAuthError = /EAUTH|535|Invalid login|Authentication/i.test(msg);
                            console.error(`[trigger-workflow-step] EMAIL_ATTENDEES sendEmailViaSMTP failed for ${reg.email}:`, smtpErr);
                            if (!isTerminalAuthError) {
                                // Transient error — let Inngest retry
                                throw smtpErr;
                            }
                            // Terminal auth error — transition the existing
                            // parent to FAILED via update (was a second create).
                            await db.workflowStepExecution.update({
                                where: { id: parentId },
                                data: {
                                    status: "FAILED",
                                    executedAt: new Date(),
                                    errorMessage: msg || "SMTP send failed",
                                },
                            });
                            return; // Note: if partial-send occurred, prior attendees already received the email
                        }
                    }

                    // Wave 6 follow-on Part 2: transition parent SCHEDULED →
                    // terminal via update. Also fixes latent BUG-MAY4-1b twin —
                    // post-loop create previously wrote unconditional SENT
                    // even with 0 registrants. Now reflects actual sends.
                    const emailsSent = sentEmails.size;
                    await db.workflowStepExecution.update({
                        where: { id: parentId },
                        data: {
                            status: emailsSent > 0 ? "SENT" : "SKIPPED",
                            executedAt: new Date(),
                            ...(emailsSent === 0
                                ? { errorMessage: "No recipients at scheduled time" }
                                : {}),
                        },
                    });
                    await finalizeParentRollup(db, parentId);
                    return;
                }

                case STEP_TYPES.SEND_SURVEY_LINK: {
                    recipientRole = "ATTENDEE";

                    const registrations = await db.registration.findMany({
                        where: {
                            workshopId: workshop.id,
                            status: { in: ["REGISTERED", "CONFIRMED"] },
                        },
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                            company: true,
                        },
                    });

                    // BUG-MAY4 follow-on: distinguish "0 recipients" from
                    // "registrants exist but link generation failed". Without
                    // this short-circuit, both cases hit the same misleading
                    // 'No survey link could be generated' message below.
                    if (registrations.length === 0) {
                        await db.workflowStepExecution.create({
                            data: {
                                stepId: workflowStep.id,
                                workshopId: workshop.id,
                                status: "SKIPPED",
                                scheduledFor: new Date(),
                                executedAt: new Date(),
                                errorMessage: "No recipients at scheduled time",
                            },
                        });
                        return;
                    }

                    // Wave 6 follow-on: pre-create the parent row before the
                    // loop so per-recipient child rows have a parentId to
                    // attach to (parity with execute-workflow.ts's pre-loop
                    // scheduleWorkflowExecution path).
                    const parentRow = await db.workflowStepExecution.create({
                        data: {
                            stepId: workflowStep.id,
                            workshopId: workshop.id,
                            status: "SCHEDULED",
                            scheduledFor: new Date(),
                        },
                        select: { id: true },
                    });
                    const parentId = parentRow.id;

                    const surveyType = resolveSurveyType(workflowStep);
                    let sentCount = 0;
                    for (const reg of registrations) {
                        const surveyLink = await getOrCreateSurveyLink({
                            workshopId: workshop.id,
                            registrationId: reg.id,
                            surveyType,
                            templateId: workflowStep.surveyTemplateId ?? undefined,
                        });

                        if (!surveyLink) {
                            // Wave 6 follow-on: per-recipient FAILED child
                            // row so the on-call manual repro produces the
                            // same evidence as a scheduled fire.
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

                        try {
                            await sendEmailViaSMTP({
                                to: reg.email,
                                subject: personalSubject,
                                html: personalBody,
                                telemetry: {
                                    workshopId: workshop.id,
                                    workshopCode: workshop.workshopCode,
                                    workflowId: workflowStep.workflow.id,
                                    workflowStepId: workflowStep.id,
                                    recipientRole,
                                    registrationId: reg.id,
                                    metadata: {
                                        surveyType,
                                        surveyId: surveyLink.surveyId,
                                        triggeredManually: true,
                                    },
                                },
                            });
                            sentCount++;
                            // Wave 6 follow-on: per-recipient SENT child row.
                            await recordRecipientExecution(db, {
                                parentId,
                                stepId: workflowStep.id,
                                workshopId: workshop.id,
                                registrationId: reg.id,
                                recipientEmail: reg.email,
                                status: "SENT",
                            });
                        } catch (smtpErr) {
                            const msg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
                            const isTerminalAuthError = /EAUTH|535|Invalid login|Authentication/i.test(msg);
                            console.error(`[trigger-workflow-step] SEND_SURVEY_LINK sendEmailViaSMTP failed for ${reg.email}:`, smtpErr);
                            if (!isTerminalAuthError) {
                                // Transient error — let Inngest retry
                                throw smtpErr;
                            }
                            // Terminal auth error — transition the existing
                            // parent row to FAILED (Wave 6 follow-on: was a
                            // second create()).
                            await db.workflowStepExecution.update({
                                where: { id: parentId },
                                data: {
                                    status: "FAILED",
                                    executedAt: new Date(),
                                    errorMessage: msg || "SMTP send failed",
                                },
                            });
                            return; // Note: if partial-send occurred, prior attendees already received the email
                        }
                    }

                    // Wave 6 follow-on: transition the pre-created parent row
                    // to its terminal status via update (was a second create()).
                    await db.workflowStepExecution.update({
                        where: { id: parentId },
                        data: {
                            status: sentCount > 0 ? "SENT" : "SKIPPED",
                            executedAt: new Date(),
                            ...(sentCount === 0
                                ? {
                                      errorMessage:
                                          "No survey link could be generated",
                                  }
                                : {}),
                        },
                    });

                    // Roll the parent up over actual children (FAILED > SENT
                    // > SKIPPED). With link-gen FAILED children present, a
                    // partial-failure step surfaces as FAILED on the parent.
                    await finalizeParentRollup(db, parentId);
                    return;
                }

                case STEP_TYPES.SEND_FILE_LINK: {
                    recipientRole = "ATTENDEE";

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
                            subject:
                                subject ||
                                workflowStep.emailTemplate?.subject ||
                                "Workflow step execution",
                            status: "SKIPPED",
                            provider: process.env.SMTP_HOST ? "SMTP" : "MOCK",
                            workshopId: workshop.id,
                            workshopCode: workshop.workshopCode,
                            workflowId: workflowStep.workflow.id,
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
                                errorMessage:
                                    "Attachment policy blocked file-link delivery",
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
                        where: {
                            workshopId: workshop.id,
                            status: { in: ["REGISTERED", "CONFIRMED"] },
                        },
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                            company: true,
                        },
                    });
                    const fileLinks = buildFileLinksHtml(protectedLinks);

                    // Wave 6 follow-on Part 2: pre-create parent so per-recipient
                    // children attach + post-loop update (parity with SEND_SURVEY_LINK).
                    const parentRow = await db.workflowStepExecution.create({
                        data: {
                            stepId: workflowStep.id,
                            workshopId: workshop.id,
                            status: "SCHEDULED",
                            scheduledFor: new Date(),
                        },
                        select: { id: true },
                    });
                    const parentId = parentRow.id;

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
                            workflowStep.subject ||
                                `Workshop Files: ${workshop.title}`,
                            personalContext
                        );
                        const personalBody = interpolateTemplate(
                            workflowStep.body ||
                                `<p>Hi {{registrantName}},</p><p>Your workshop files are ready:</p>{{fileLinks}}`,
                            personalContext
                        );

                        try {
                            await sendEmailViaSMTP({
                                to: reg.email,
                                subject: personalSubject,
                                html: personalBody,
                                telemetry: {
                                    workshopId: workshop.id,
                                    workshopCode: workshop.workshopCode,
                                    workflowId: workflowStep.workflow.id,
                                    workflowStepId: workflowStep.id,
                                    recipientRole,
                                    registrationId: reg.id,
                                    metadata: {
                                        fileLinkCount: protectedLinks.length,
                                        triggeredManually: true,
                                    },
                                },
                            });
                            fileEmailsSent++;
                            // Wave 6 follow-on Part 2: per-recipient SENT child.
                            await recordRecipientExecution(db, {
                                parentId,
                                stepId: workflowStep.id,
                                workshopId: workshop.id,
                                registrationId: reg.id,
                                recipientEmail: reg.email,
                                status: "SENT",
                            });
                        } catch (smtpErr) {
                            const msg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
                            const isTerminalAuthError = /EAUTH|535|Invalid login|Authentication/i.test(msg);
                            console.error(`[trigger-workflow-step] SEND_FILE_LINK sendEmailViaSMTP failed for ${reg.email}:`, smtpErr);
                            if (!isTerminalAuthError) {
                                // Transient error — let Inngest retry
                                throw smtpErr;
                            }
                            // Terminal auth error — transition existing parent
                            // to FAILED via update (was a second create).
                            await db.workflowStepExecution.update({
                                where: { id: parentId },
                                data: {
                                    status: "FAILED",
                                    executedAt: new Date(),
                                    errorMessage: msg || "SMTP send failed",
                                },
                            });
                            return; // Note: if partial-send occurred, prior attendees already received the email
                        }
                    }

                    // Wave 6 follow-on Part 2: transition parent SCHEDULED →
                    // terminal via update. Preserves BUG-MAY4 fix: 0 registrants
                    // → SKIPPED, not false SENT.
                    await db.workflowStepExecution.update({
                        where: { id: parentId },
                        data: {
                            status: fileEmailsSent > 0 ? "SENT" : "SKIPPED",
                            executedAt: new Date(),
                            ...(fileEmailsSent === 0
                                ? { errorMessage: "No recipients at scheduled time" }
                                : {}),
                        },
                    });
                    await finalizeParentRollup(db, parentId);
                    return;
                }

                case STEP_TYPES.NOTIFICATION:
                    console.log(
                        `[Workflow Notification] ${subject}: ${body}`
                    );
                    await db.workflowStepExecution.create({
                        data: {
                            stepId: workflowStep.id,
                            workshopId: workshop.id,
                            status: "SENT",
                            scheduledFor: new Date(),
                            executedAt: new Date(),
                        },
                    });
                    return;
            }

            // Generic email send for EMAIL_COACH / EMAIL_STAFF / EMAIL_CUSTOM
            const canAttach = canDeliverWorkflowAttachments({
                recipientRole,
                workshopStatus: workshop.status,
            });
            if (!canAttach && stepFiles.length > 0) {
                await recordDeliveryTelemetry({
                    recipient: "SYSTEM",
                    subject:
                        subject ||
                        workflowStep.emailTemplate?.subject ||
                        "Workflow step execution",
                    status: "SKIPPED",
                    provider: process.env.SMTP_HOST ? "SMTP" : "MOCK",
                    workshopId: workshop.id,
                    workshopCode: workshop.workshopCode,
                    workflowId: workflowStep.workflow.id,
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

            for (const recipient of recipients) {
                try {
                    await sendEmailViaSMTP({
                        to: recipient,
                        subject,
                        html: body,
                        attachments: protectedAttachments,
                        telemetry: {
                            workshopId: workshop.id,
                            workshopCode: workshop.workshopCode,
                            workflowId: workflowStep.workflow.id,
                            workflowStepId: workflowStep.id,
                            recipientRole,
                            metadata: {
                                attemptedAttachmentCount: stepFiles.length,
                                attachedCount: protectedAttachments.length,
                                attachmentPolicyAllowed: canAttach,
                                triggeredManually: true,
                            },
                        },
                    });
                } catch (smtpErr) {
                    const msg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
                    const isTerminalAuthError = /EAUTH|535|Invalid login|Authentication/i.test(msg);
                    console.error(`[trigger-workflow-step] sendEmailViaSMTP failed for ${recipient}:`, smtpErr);
                    if (!isTerminalAuthError) {
                        // Transient error — let Inngest retry
                        throw smtpErr;
                    }
                    // Terminal auth error — record FAILED and stop retrying
                    await db.workflowStepExecution.create({
                        data: {
                            stepId: workflowStep.id,
                            workshopId: workshop.id,
                            status: "FAILED",
                            scheduledFor: new Date(),
                            executedAt: new Date(),
                            errorMessage: msg || "SMTP send failed",
                        },
                    });
                    return; // Do not re-throw — stops Inngest retry loop for auth errors
                }
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
        });

        return { success: true, stepId, workshopId };
    }
);

export default triggerWorkflowStep;
