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
import { recordRecipientExecution } from "@/lib/workflows/recipient-execution";
// PR-3 (audit Inngest dedup): reuse-or-synthesize ONE parent per delivery batch
// + send-each-recipient-at-most-once across retries.
import {
    ensureExecutionParent,
    sendFanoutRecipients,
    isTerminalSmtpError,
} from "@/lib/workflows/fanout-delivery";
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

export const triggerWorkflowStep = inngest.createFunction(
    { id: "trigger-workflow-step", retries: 2 },
    { event: "workflow/step.trigger" },
    async ({ event, step }) => {
        const { stepId, workshopId } = event.data;

        // PR-3 (audit dedup): a stable delivery-batch key for this manual trigger.
        // The trigger-now route mints a fresh manualTriggerId per click, so retries
        // of one click reuse the parent (skip already-SENT recipients) while a new
        // click gets a new key → new parent → full re-send. The id:-less fallback
        // only covers legacy events in flight across the deploy.
        const manualBatchKey = `manual:${event.data.manualTriggerId ?? `${stepId}:${workshopId}`}`;

        // Idempotency guard: skip if already SENT, unless forceResend is set (manual re-trigger).
        // PR-3: filter to parentId:null so a per-recipient child SENT row can't trip
        // this step-level guard (which would under-send the unsent recipients).
        const existingSent = await step.run("check-idempotency", async () => {
            return db.workflowStepExecution.findFirst({
                where: { stepId, workshopId, status: "SENT", parentId: null },
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
            // Carry the DST-aware zone abbreviation (e.g. "9:00 AM EDT"). Anchor on
            // the RAW stored workshop.eventDate (midnight UTC of the event day), NOT
            // the resolved start-moment above — formatZoneAbbrev derives the correct
            // DST offset from the event's UTC calendar date.
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

                    // PR-3 (audit dedup): reuse ONE parent per manual trigger
                    // (keyed by the per-click manualTriggerId) so an Inngest
                    // retry of this trigger skips already-SENT attendees. A new
                    // click = new key = new parent = full re-send.
                    const parentId = await ensureExecutionParent(db, {
                        deliveryBatchKey: `${manualBatchKey}:${workflowStep.id}`,
                        stepId: workflowStep.id,
                        workshopId: workshop.id,
                    });

                    if (registrations.length === 0) {
                        await db.workflowStepExecution.update({
                            where: { id: parentId },
                            data: {
                                status: "SKIPPED",
                                executedAt: new Date(),
                                errorMessage: "No recipients at scheduled time",
                            },
                        });
                        return;
                    }

                    const regById = new Map(registrations.map((r) => [r.id, r]));
                    await sendFanoutRecipients(db, {
                        parentId,
                        stepId: workflowStep.id,
                        workshopId: workshop.id,
                        recipients: registrations.map((r) => ({
                            registrationId: r.id,
                            email: r.email,
                        })),
                        isTerminalError: isTerminalSmtpError,
                        sendOne: async ({ registrationId }) => {
                            const reg = regById.get(registrationId);
                            if (!reg) throw new Error(`fan-out invariant: registration ${registrationId} missing from batch map`);
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
                        },
                    });
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

                    // PR-3 (audit dedup): reuse ONE parent per manual trigger.
                    const parentId = await ensureExecutionParent(db, {
                        deliveryBatchKey: `${manualBatchKey}:${workflowStep.id}`,
                        stepId: workflowStep.id,
                        workshopId: workshop.id,
                    });

                    const surveyType = resolveSurveyType(workflowStep);

                    // Resolve each recipient's survey link up front. A link-gen
                    // failure records a per-recipient FAILED child under the
                    // reused parent and drops that recipient; the rest fan out.
                    const regById = new Map(registrations.map((r) => [r.id, r]));
                    const linkByReg = new Map<
                        string,
                        { surveyUrl: string; surveyId: string }
                    >();
                    for (const reg of registrations) {
                        const surveyLink = await getOrCreateSurveyLink({
                            workshopId: workshop.id,
                            registrationId: reg.id,
                            surveyType,
                            templateId: workflowStep.surveyTemplateId ?? undefined,
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

                    const sendable = registrations.filter((r) =>
                        linkByReg.has(r.id)
                    );
                    if (sendable.length === 0) {
                        // Every recipient failed link generation → nothing to
                        // send. Finalize the reused parent FAILED with the legacy
                        // operator-facing message (per-recipient FAILED children
                        // carry the granular "link_generation_failed" reason).
                        await db.workflowStepExecution.update({
                            where: { id: parentId },
                            data: {
                                status: "FAILED",
                                executedAt: new Date(),
                                errorMessage: "No survey link could be generated",
                            },
                        });
                        return;
                    }
                    await sendFanoutRecipients(db, {
                        parentId,
                        stepId: workflowStep.id,
                        workshopId: workshop.id,
                        recipients: sendable.map((r) => ({
                            registrationId: r.id,
                            email: r.email,
                        })),
                        isTerminalError: isTerminalSmtpError,
                        sendOne: async ({ registrationId }) => {
                            const reg = regById.get(registrationId);
                            const surveyLink = linkByReg.get(registrationId);
                            if (!reg || !surveyLink) throw new Error(`fan-out invariant: registration ${registrationId} missing reg/link in batch maps`);
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
                        },
                    });
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

                    // PR-3 (audit dedup): reuse ONE parent per manual trigger.
                    const parentId = await ensureExecutionParent(db, {
                        deliveryBatchKey: `${manualBatchKey}:${workflowStep.id}`,
                        stepId: workflowStep.id,
                        workshopId: workshop.id,
                    });

                    if (registrations.length === 0) {
                        await db.workflowStepExecution.update({
                            where: { id: parentId },
                            data: {
                                status: "SKIPPED",
                                executedAt: new Date(),
                                errorMessage: "No recipients at scheduled time",
                            },
                        });
                        return;
                    }

                    const regById = new Map(registrations.map((r) => [r.id, r]));
                    await sendFanoutRecipients(db, {
                        parentId,
                        stepId: workflowStep.id,
                        workshopId: workshop.id,
                        recipients: registrations.map((r) => ({
                            registrationId: r.id,
                            email: r.email,
                        })),
                        isTerminalError: isTerminalSmtpError,
                        sendOne: async ({ registrationId }) => {
                            const reg = regById.get(registrationId);
                            if (!reg) throw new Error(`fan-out invariant: registration ${registrationId} missing from batch map`);
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
                        },
                    });
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
