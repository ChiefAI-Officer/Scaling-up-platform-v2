/**
 * Notifications Service (V2)
 * Handles sending notifications via Email (SMTP) and Microsoft Teams.
 * Uses shared SMTP transport from lib/smtp-transport.ts.
 */

import { sendEmailViaSMTP, type SmtpAttachment } from "@/lib/smtp-transport";
import { db } from "@/lib/db";
import { generateIcsContent, buildLocationString } from "@/lib/ics-generator";
import { formatDate } from "@/lib/utils";

// ============================================
// Types
// ============================================

const APPROVAL_TYPE_LABELS: Record<string, string> = {
    WORKSHOP_REQUEST: "Workshop Request",
    CUSTOM_PRICING: "Custom Pricing Request",
    CANCELLATION: "Cancellation Request",
    DATE_CHANGE: "Date Change Request",
    REFUND: "Refund Request",
};

export interface ApprovalRequest {
    id: string;
    type: string; // 'CUSTOM_PRICING', 'CANCELLATION', etc.
    coachName: string;
    details: string;
    requestedAt: Date;
    amount?: number; // In cents, for pricing/refund requests
}

// ============================================
// Notification Functions
// ============================================

/**
 * Send an approval request notification to Suzanne/Admins
 */
export async function sendApprovalRequest(approval: ApprovalRequest): Promise<void> {
    const approvalUrl = `${process.env.APP_URL}/admin/approvals/${approval.id}`;
    const typeLabel = APPROVAL_TYPE_LABELS[approval.type] || approval.type;
    const isCustomPricing = approval.type === "CUSTOM_PRICING" && approval.amount;
    const customPriceLine = isCustomPricing
        ? `<p style="font-size:1.1em; color:#b45309; font-weight:bold;">CUSTOM PRICE: $${(approval.amount! / 100).toLocaleString()}</p>`
        : "";
    const amountLine =
        !isCustomPricing && approval.amount
            ? `<p><strong>Amount:</strong> $${(approval.amount / 100).toFixed(2)}</p>`
            : "";
    const subjectPrefix = isCustomPricing ? "[CUSTOM PRICING] " : "";

    const html = `
    <h2 style="color: #1e293b;">${typeLabel}</h2>
    ${customPriceLine}
    <p><strong>Coach:</strong> ${approval.coachName}</p>
    <p><strong>Details:</strong> ${approval.details}</p>
    ${amountLine}
    <p><strong>Requested:</strong> ${approval.requestedAt.toLocaleString()}</p>
    <br/>
    <a href="${approvalUrl}" style="background-color: #1D4ED8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Review Request</a>
  `;

    await sendNotificationEmail({
        to: process.env.ADMIN_EMAIL || "admin@scalingup.com",
        subject: `${subjectPrefix}[ACTION REQUIRED] ${typeLabel} — ${approval.coachName}`,
        html,
    });

    if (process.env.TEAMS_WEBHOOK_URL) {
        await sendTeamsNotification({
            title: `Approval Needed: ${approval.type}`,
            text: `**Coach:** ${approval.coachName}\n\n**Details:** ${approval.details}`,
            link: approvalUrl
        });
    }
}

/**
 * Send an escalation notification (e.g. to Jeff) if approval times out
 */
export async function sendEscalation(
    approval: ApprovalRequest,
    escalateToEmail: string
): Promise<void> {
    const approvalUrl = `${process.env.APP_URL}/admin/approvals/${approval.id}`;

    const html = `
    <h2 style="color: red;">ESCALATION: Approval Timeout</h2>
    <p>This request has been pending for > 24 hours.</p>
    <p><strong>Type:</strong> ${approval.type}</p>
    <p><strong>Coach:</strong> ${approval.coachName}</p>
    <br/>
    <a href="${approvalUrl}">View ASAP</a>
  `;

    await sendNotificationEmail({
        to: escalateToEmail,
        subject: `[ESCALATION] Pending Approval: ${approval.type}`,
        html,
    });
}

/**
 * JV-26: Send registration notification to admin + coach
 */
export async function sendRegistrationNotification(data: {
    workshopId?: string;
    workshopTitle: string;
    workshopCode: string | null;
    coachEmail: string;
    coachName: string;
    registrantName: string;
    registrantEmail: string;
    registrantCompany?: string;
    icsAttachment?: { filename: string; content: string };
}): Promise<void> {
    const codeLabel = data.workshopCode ? ` [${data.workshopCode}]` : "";

    const html = `
    <h2>New Registration${codeLabel}: ${data.workshopTitle}</h2>
    <p><strong>Registrant:</strong> ${data.registrantName}</p>
    <p><strong>Email:</strong> ${data.registrantEmail}</p>
    ${data.registrantCompany ? `<p><strong>Company:</strong> ${data.registrantCompany}</p>` : ""}
    <p><strong>Workshop:</strong> ${data.workshopTitle}</p>
    <p><strong>Coach:</strong> ${data.coachName}</p>
    `;

    const attachments: SmtpAttachment[] = data.icsAttachment
        ? [{ filename: data.icsAttachment.filename, content: data.icsAttachment.content, contentType: "text/calendar" }]
        : [];

    await sendNotificationEmail({
        to: process.env.ADMIN_EMAIL || "admin@scalingup.com",
        subject: `[Registration] ${data.registrantName} registered for ${data.workshopTitle}`,
        html,
        telemetry: {
            workshopId: data.workshopId,
            workshopCode: data.workshopCode || undefined,
            recipientRole: "STAFF" as const,
        },
    });

    await sendNotificationEmail({
        to: data.coachEmail,
        subject: `New registration: ${data.registrantName} for ${data.workshopTitle}`,
        html,
        telemetry: {
            workshopId: data.workshopId,
            workshopCode: data.workshopCode || undefined,
            recipientRole: "COACH" as const,
        },
    });

    if (data.icsAttachment) {
        await sendNotificationEmail({
            to: data.registrantEmail,
            subject: `You're Registered: ${data.workshopTitle}`,
            html: `
            <h2>You're Registered!</h2>
            <p>Hi ${data.registrantName},</p>
            <p>You're confirmed for <strong>${data.workshopTitle}</strong> with ${data.coachName}.</p>
            <p>We've attached a calendar file (.ics) so you can add this event to your calendar.</p>
            <p>See you there!</p>
            <p>— The Scaling Up Team</p>
            `,
            attachments,
            telemetry: {
                workshopId: data.workshopId,
                workshopCode: data.workshopCode || undefined,
                recipientRole: "ATTENDEE" as const,
            },
        });
    }
}

/**
 * JV-29: Send enriched approval email with Circle/HubSpot data
 */
export async function sendEnrichedApprovalRequest(data: {
    approvalId: string;
    type: string;
    coachName: string;
    coachEmail: string;
    details: string;
    requestedAt: Date;
    amount?: number; // In cents — populated for CUSTOM_PRICING
    customPricingNotes?: string;
    circleCertification?: {
        verified: boolean;
        confidence: number;
        certificationDate?: string;
        issues?: string[];
    };
    hubspotStanding?: {
        paymentStatus?: string;
        territory?: string;
    };
}): Promise<void> {
    const approvalUrl = `${process.env.APP_URL}/admin/approvals/${data.approvalId}`;

    let enrichmentHtml = "";

    if (data.circleCertification) {
        const cert = data.circleCertification;
        const statusColor = cert.verified ? "#22c55e" : "#ef4444";
        const statusLabel = cert.verified ? "Verified" : "Not Verified";
        enrichmentHtml += `
        <h3>Circle Certification</h3>
        <ul>
            <li><strong>Status:</strong> <span style="color:${statusColor}">${statusLabel}</span></li>
            <li><strong>Confidence:</strong> ${cert.confidence}%</li>
            ${cert.certificationDate ? `<li><strong>Certified:</strong> ${cert.certificationDate}</li>` : ""}
            ${cert.issues && cert.issues.length > 0 ? `<li><strong>Issues:</strong> ${cert.issues.join(", ")}</li>` : ""}
        </ul>`;
    }

    if (data.hubspotStanding) {
        const hs = data.hubspotStanding;
        enrichmentHtml += `
        <h3>HubSpot Standing</h3>
        <ul>
            ${hs.paymentStatus ? `<li><strong>Payment Status:</strong> ${hs.paymentStatus}</li>` : ""}
            ${hs.territory ? `<li><strong>Territory:</strong> ${hs.territory}</li>` : ""}
        </ul>`;
    }

    const typeLabel = APPROVAL_TYPE_LABELS[data.type] || data.type;
    const isCustomPricing = data.type === "CUSTOM_PRICING" && data.amount;
    const customPriceLine = isCustomPricing
        ? `<p style="font-size:1.1em; color:#b45309; font-weight:bold;">CUSTOM PRICE: $${(data.amount! / 100).toLocaleString()}</p>`
        : "";
    const subjectPrefix = isCustomPricing ? "[CUSTOM PRICING] " : "";

    const notesHtml = data.customPricingNotes
        ? `<div style="background:#fef3c7;border-left:4px solid #d97706;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;font-weight:600;color:#92400e;">Coach's Pricing Notes:</p>
            <p style="margin:8px 0 0;color:#374151;">${escapeHtml(data.customPricingNotes)}</p>
           </div>`
        : "";

    const html = `
    <h2 style="color: #1e293b;">${typeLabel}</h2>
    ${customPriceLine}
    <p><strong>Coach:</strong> ${data.coachName} (${data.coachEmail})</p>
    <p><strong>Details:</strong> ${data.details}</p>
    <p><strong>Requested:</strong> ${data.requestedAt.toLocaleString()}</p>
    ${notesHtml}
    ${enrichmentHtml}
    <br/>
    <a href="${approvalUrl}" style="background-color: #1D4ED8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Review Request</a>
    `;

    await sendNotificationEmail({
        to: process.env.ADMIN_EMAIL || "admin@scalingup.com",
        subject: `${subjectPrefix}[ACTION REQUIRED] ${typeLabel} — ${data.coachName}`,
        html,
    });

    if (process.env.TEAMS_WEBHOOK_URL) {
        await sendTeamsNotification({
            title: `Approval Needed: ${data.type}`,
            text: `**Coach:** ${data.coachName}\n\n**Details:** ${data.details}`,
            link: approvalUrl,
        });
    }
}

// ============================================
// Workshop Status Notifications (Feb 25 Revisions)
// ============================================

/**
 * Rev 21: Email sent to coach + admin when a workshop is requested
 */
export async function sendWorkshopRequestedEmail(data: {
    coachEmail: string;
    coachName: string;
    workshopTitle: string;
    workshopId?: string;
    linkedinUrl?: string | null;
    customPricingNotes?: string;
}): Promise<void> {
    const dashboardUrl = `${process.env.APP_URL}/workshops`;
    const linkedinHtml = data.linkedinUrl
        ? `<p><strong>LinkedIn:</strong> <a href="${data.linkedinUrl}">${data.linkedinUrl}</a></p>`
        : "";

    const notesHtml = data.customPricingNotes
        ? `<div style="background:#fef3c7;border-left:4px solid #d97706;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;font-weight:600;color:#92400e;">Coach's Pricing Notes:</p>
            <p style="margin:8px 0 0;color:#374151;">${escapeHtml(data.customPricingNotes)}</p>
           </div>`
        : "";

    const adminHtml = `
    <h2>New Workshop Requested</h2>
    <p><strong>Coach:</strong> ${data.coachName}</p>
    <p><strong>Workshop:</strong> ${data.workshopTitle}</p>
    ${linkedinHtml}
    ${notesHtml}
    <br/>
    <a href="${dashboardUrl}" style="background-color: #1D4ED8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in Dashboard</a>
    `;

    const coachHtml = `
    <h2>Your Workshop Request Has Been Submitted</h2>
    <p>Hi ${data.coachName},</p>
    <p>Your workshop <strong>${data.workshopTitle}</strong> has been submitted for review. You'll receive a notification once it's been approved or if changes are needed.</p>
    <p>— The Scaling Up Team</p>
    `;

    await sendNotificationEmail({
        to: process.env.ADMIN_EMAIL || "admin@scalingup.com",
        subject: `[Workshop Requested] ${data.workshopTitle} — ${data.coachName}`,
        html: adminHtml,
        telemetry: { workshopId: data.workshopId, recipientRole: "STAFF" as const },
    });

    await sendNotificationEmail({
        to: data.coachEmail,
        subject: `Workshop Submitted: ${data.workshopTitle}`,
        html: coachHtml,
        telemetry: { workshopId: data.workshopId, recipientRole: "COACH" as const },
    });
}

/**
 * Rev 22: Email sent to coach when a workshop is approved
 */
export async function sendWorkshopApprovedEmail(data: {
    coachEmail: string;
    coachName: string;
    workshopTitle: string;
    workshopId?: string;
}): Promise<void> {
    const portalUrl = `${process.env.APP_URL}/portal/workshops`;

    const html = `
    <h2>Your Workshop Has Been Approved!</h2>
    <p>Hi ${data.coachName},</p>
    <p>Great news — your workshop <strong>${data.workshopTitle}</strong> has been approved and is now active.</p>
    <p>You can view your workshop and manage registrations from your portal.</p>
    <br/>
    <a href="${portalUrl}" style="background-color: #16a34a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Your Workshops</a>
    <p>— The Scaling Up Team</p>
    `;

    await sendNotificationEmail({
        to: data.coachEmail,
        subject: `Workshop Approved: ${data.workshopTitle}`,
        html,
        telemetry: { workshopId: data.workshopId, recipientRole: "COACH" as const },
    });
}

/**
 * Rev 23: Email sent to coach when a workshop is denied, with reason
 */
export async function sendWorkshopDeniedEmail(data: {
    coachEmail: string;
    coachName: string;
    workshopTitle: string;
    reason: string;
    workshopId?: string;
}): Promise<void> {
    const portalUrl = `${process.env.APP_URL}/portal/workshops`;

    const html = `
    <h2>Workshop Denied</h2>
    <p>Hi ${data.coachName},</p>
    <p>Your workshop <strong>${data.workshopTitle}</strong> has been denied.</p>
    <p><strong>Reason:</strong> ${data.reason}</p>
    <p>Please review the feedback, make any necessary edits, and resubmit your workshop from the portal.</p>
    <br/>
    <a href="${portalUrl}" style="background-color: #1D4ED8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Edit &amp; Resubmit</a>
    <p>— The Scaling Up Team</p>
    `;

    await sendNotificationEmail({
        to: data.coachEmail,
        subject: `Workshop Denied: ${data.workshopTitle}`,
        html,
        telemetry: { workshopId: data.workshopId, recipientRole: "COACH" as const },
    });
}

/**
 * Sprint 5: Workshop Built notification — sent by auto-build Inngest function after approval
 */
export async function sendWorkshopBuiltEmail(data: {
    coachEmail: string;
    coachName: string;
    workshopTitle: string;
    workshopId?: string;
    pagesCreated: string[];
    preEventWorkflow: string | null;
    postEventWorkflow: string | null;
}): Promise<void> {
    const portalUrl = `${process.env.APP_URL}/portal/workshops${data.workshopId ? `/${data.workshopId}` : ""}`;

    const pagesList = data.pagesCreated.length > 0
        ? `<li><strong>Landing pages created:</strong> ${data.pagesCreated.map((t) => t.replace(/_/g, " ").toLowerCase()).join(", ")}</li>`
        : "";
    const preWf = data.preEventWorkflow
        ? `<li><strong>Pre-event workflow:</strong> ${data.preEventWorkflow}</li>`
        : "";
    const postWf = data.postEventWorkflow
        ? `<li><strong>Post-event workflow:</strong> ${data.postEventWorkflow}</li>`
        : "";

    const html = `
    <h2>Your Workshop Is Ready!</h2>
    <p>Hi ${data.coachName},</p>
    <p>Great news — your workshop <strong>${data.workshopTitle}</strong> has been approved and automatically set up.</p>
    <p>Here&rsquo;s what was built for you:</p>
    <ul>
        ${pagesList}
        ${preWf}
        ${postWf}
        <li><strong>Status:</strong> Pre-Event (active)</li>
    </ul>
    <p>You can view your workshop details and make edits in the coach portal:</p>
    <br/>
    <a href="${portalUrl}" style="background-color: #38a169; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Workshop</a>
    <br/><br/>
    <p>— The Scaling Up Team</p>
    `;

    await sendNotificationEmail({
        to: data.coachEmail,
        subject: `Workshop Ready: ${data.workshopTitle}`,
        html,
        telemetry: { workshopId: data.workshopId, recipientRole: "COACH" as const },
    });
}

/**
 * Send workshop completion summary email to admin
 * Includes attendee list and revenue breakdown.
 */
export async function sendWorkshopCompletionSummary(data: {
    workshopId: string;
    workshopTitle: string;
    workshopCode: string;
    eventDate: string;
    coachName: string;
    totalRegistrations: number;
    attended: number;
    paidCount: number;
    freeCount: number;
    totalRevenueCents: number;
    attendees: Array<{
        name: string;
        email: string;
        company: string;
        paid: boolean;
        amount: number;
        attended: boolean;
    }>;
}): Promise<void> {
    const eventDate = new Date(data.eventDate).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    });
    const revenue = `$${(data.totalRevenueCents / 100).toFixed(2)}`;
    const workshopUrl = `${process.env.APP_URL}/workshops/${data.workshopId}`;

    const attendeeRows = data.attendees
        .map(
            (a) =>
                `<tr>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.name}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.email}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.company || "—"}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.paid ? `$${(a.amount / 100).toFixed(0)}` : "Free"}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.attended ? "Yes" : "No"}</td>
                </tr>`
        )
        .join("");

    const html = `
    <h2>Workshop Completed: ${data.workshopTitle}</h2>
    <p><strong>Code:</strong> ${data.workshopCode} &nbsp;|&nbsp; <strong>Coach:</strong> ${data.coachName} &nbsp;|&nbsp; <strong>Date:</strong> ${eventDate}</p>

    <h3>Summary</h3>
    <table style="border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Total Registrations:</td><td>${data.totalRegistrations}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Attended:</td><td>${data.attended} / ${data.totalRegistrations}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Paid:</td><td>${data.paidCount}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Free:</td><td>${data.freeCount}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Total Revenue:</td><td style="color:#38a169;font-weight:bold;">${revenue}</td></tr>
    </table>

    <h3>Attendee List</h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
            <tr style="background:#f5f5f5;">
                <th style="padding:8px 10px;text-align:left;">Name</th>
                <th style="padding:8px 10px;text-align:left;">Email</th>
                <th style="padding:8px 10px;text-align:left;">Company</th>
                <th style="padding:8px 10px;text-align:left;">Paid</th>
                <th style="padding:8px 10px;text-align:left;">Attended</th>
            </tr>
        </thead>
        <tbody>
            ${attendeeRows || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#999;">No registrations</td></tr>'}
        </tbody>
    </table>

    <br/>
    <a href="${workshopUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Workshop</a>
    <br/><br/>
    <p>— Scaling Up Platform</p>
    `;

    await sendNotificationEmail({
        to: process.env.ADMIN_EMAIL || "admin@scalingup.com",
        subject: `Workshop Completed: ${data.workshopTitle} (${data.workshopCode})`,
        html,
        telemetry: { workshopId: data.workshopId, workshopCode: data.workshopCode, recipientRole: "STAFF" as const },
    });
}

// ============================================
// Admin Invite Email
// ============================================

export async function sendAdminInviteEmail(data: {
    recipientEmail: string;
    recipientName?: string;
    invitedByName: string;
    inviteUrl: string;
}): Promise<void> {
    const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">You've Been Invited as an Admin</h2>
      <p style="color: #4a4a4a;">Hi${data.recipientName ? ` ${data.recipientName}` : ''},</p>
      <p style="color: #4a4a4a;">
        <strong>${data.invitedByName}</strong> has invited you to join the
        <strong>Scaling Up Workshop Platform</strong> as an administrator.
      </p>
      <p style="color: #4a4a4a;">
        As an admin, you'll have full access to manage workshops, coaches, approvals,
        workflows, surveys, and all platform settings.
      </p>
      <br/>
      <div style="text-align: center;">
        <a href="${data.inviteUrl}"
           style="display: inline-block; background-color: #1D4ED8; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Accept Invitation &amp; Set Password
        </a>
      </div>
      <br/>
      <p style="color: #9ca3af; font-size: 14px;">This invitation expires in 7 days.</p>
      <p style="color: #9ca3af; font-size: 14px;">If you did not expect this invitation, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
      <p style="color: #9ca3af; font-size: 12px;">&mdash; Scaling Up Workshop Platform</p>
    </div>
  `;

    await sendNotificationEmail({
        to: data.recipientEmail,
        subject: "You've been invited as an admin — Scaling Up Platform",
        html,
        telemetry: {
            recipientRole: "STAFF",
            metadata: { type: "admin_invite" },
        },
    });
}

// ============================================
// FIG-007: Custom Price Change Request Email
// ============================================

/**
 * FIG-007: Notify admin when a coach proposes a price change.
 * The workshop price is NOT changed — this creates a CUSTOM_PRICING
 * ApprovalQueue entry and sends this email to trigger manual review.
 */
export async function sendCustomPriceChangeEmail(params: {
    adminEmail: string;
    coachName: string;
    workshopTitle: string;
    workshopCode: string;
    workshopId: string;
    oldPriceCents: number;
    newPriceCents: number;
    customPricingNotes?: string;
}): Promise<void> {
    const approvalUrl = `${process.env.APP_URL}/admin/approvals`;
    const workshopUrl = `${process.env.APP_URL}/workshops/${params.workshopId}`;
    const oldPrice = params.oldPriceCents === 0 ? "Free" : `$${(params.oldPriceCents / 100).toFixed(2)}`;
    const newPrice = params.newPriceCents === 0 ? "Free" : `$${(params.newPriceCents / 100).toFixed(2)}`;
    const notesHtml = params.customPricingNotes
        ? `<div style="background:#fef3c7;border-left:4px solid #d97706;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;font-weight:600;color:#92400e;">Coach&apos;s notes:</p>
            <p style="margin:8px 0 0;color:#374151;">${escapeHtml(params.customPricingNotes)}</p>
           </div>`
        : "";

    const html = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#1e293b;">[CUSTOM PRICING] Price Change Request</h2>
      <p style="color:#4a4a4a;">Coach <strong>${escapeHtml(params.coachName)}</strong> has requested a price change requiring admin approval.</p>
      <table style="border-collapse:collapse;margin:16px 0;width:100%;font-size:14px;">
        <tr>
          <td style="padding:6px 12px 6px 0;font-weight:600;color:#374151;">Workshop:</td>
          <td style="padding:6px 0;color:#1e293b;">
            <a href="${workshopUrl}" style="color:#1D4ED8;text-decoration:none;">${escapeHtml(params.workshopTitle)}</a>
            &nbsp;<span style="font-family:monospace;font-size:12px;color:#6b7280;">(${escapeHtml(params.workshopCode)})</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;font-weight:600;color:#374151;">Old Price:</td>
          <td style="padding:6px 0;color:#6b7280;text-decoration:line-through;">${oldPrice}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;font-weight:600;color:#374151;">New Price:</td>
          <td style="padding:6px 0;color:#b45309;font-weight:700;font-size:1.05em;">${newPrice}</td>
        </tr>
      </table>
      ${notesHtml}
      <p style="color:#4a4a4a;font-size:14px;">The workshop price has <strong>not</strong> been changed. Approve or deny this request in the approval queue.</p>
      <br/>
      <div style="text-align:center;">
        <a href="${approvalUrl}" style="display:inline-block;background-color:#1D4ED8;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
          Review in Approval Queue
        </a>
      </div>
      <br/>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="color:#9ca3af;font-size:12px;">&mdash; Scaling Up Workshop Platform</p>
    </div>
  `;

    await sendNotificationEmail({
        to: params.adminEmail,
        subject: `[CUSTOM PRICING] Price Change Request — ${params.coachName} / ${params.workshopTitle}`,
        html,
        telemetry: {
            workshopId: params.workshopId,
            workshopCode: params.workshopCode,
            recipientRole: "STAFF" as const,
            metadata: { type: "custom_pricing_request" },
        },
    });
}

// ============================================
// Workshop Date Change — ICS Reschedule Notification
// ============================================

/**
 * Send updated ICS calendar files to all confirmed registrants when a
 * workshop's date or time changes. Uses METHOD:REQUEST so calendar clients
 * update the existing event rather than creating a duplicate.
 */
export async function sendWorkshopDateChangeEmail({
  workshopId,
  workshopTitle,
  workshopCode,
  coachName,
  coachEmail,
  eventDate,
  eventTime,
  timezone,
  virtualLink,
  venueName,
  venueAddress,
  workshopFormat,
  durationHours,
  landingPageUrl,
}: {
  workshopId: string;
  workshopTitle: string;
  workshopCode: string;
  coachName: string;
  coachEmail: string;
  eventDate: Date;
  eventTime?: string | null;
  timezone?: string | null;
  virtualLink?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  workshopFormat?: string | null;
  durationHours?: number;
  landingPageUrl?: string;
}): Promise<void> {
  const registrants = await db.registration.findMany({
    where: {
      workshopId,
      paymentStatus: { in: ["FREE", "COMPLETED"] },
    },
    select: { email: true, firstName: true, lastName: true },
  });

  if (registrants.length === 0) return;

  // buildLocationString expects `format` — map workshopFormat → format
  const location = buildLocationString({
    format: workshopFormat ?? "IN_PERSON",
    virtualLink: virtualLink ?? null,
    venueName: venueName ?? null,
    venueAddress: venueAddress ?? null,
  });

  const icsContent = generateIcsContent({
    uid: `workshop-${workshopId}@scaling-up-platform.com`,
    title: workshopTitle,
    eventDate,
    eventTime: eventTime ?? null,
    timezone: timezone ?? "UTC",
    durationHours: durationHours ?? 8,
    location,
    url: landingPageUrl,
    organizer: { name: coachName, email: coachEmail },
    method: "REQUEST",
  });

  const icsAttachment: SmtpAttachment = {
    filename: `${workshopCode}-updated.ics`,
    content: icsContent,
    contentType: "text/calendar; method=REQUEST",
  };

  const formattedDate = formatDate(eventDate);

  // Sequential send — avoids SMTP rate limiting.
  // NOTE: calls sendEmailViaSMTP directly (not sendNotificationEmail) because
  // sendNotificationEmail swallows SMTP errors with .catch — which would
  // defeat Inngest retries that depend on this function throwing on failure.
  console.log(
    `[sendWorkshopDateChangeEmail] starting: workshopId=${workshopId} registrants=${registrants.length}`
  );
  const failures: Array<{ email: string; error: unknown }> = [];
  for (const registrant of registrants) {
    console.log(`[sendWorkshopDateChangeEmail] sending to ${registrant.email}`);
    try {
      await sendEmailViaSMTP({
        to: registrant.email,
        subject: `Workshop date updated: ${workshopTitle}`,
        html: `
        <p>Hi ${escapeHtml(registrant.firstName ?? "")},</p>
        <p>The date or time for <strong>${workshopTitle}</strong> (${workshopCode}) has been updated.</p>
        <p><strong>New date:</strong> ${formattedDate}${eventTime ? ` at ${eventTime}` : ""}</p>
        <p>We've attached an updated calendar invite. Open it to update the event in your calendar.</p>
        ${landingPageUrl ? `<p><a href="${landingPageUrl}">View workshop details</a></p>` : ""}
        <p>Questions? Reply to this email or contact your workshop organizer.</p>
      `,
        attachments: [icsAttachment],
        telemetry: {
          workshopId,
          workshopCode,
          recipientRole: "ATTENDEE" as const,
          metadata: { attachmentCount: 1 },
        },
      });
    } catch (err) {
      console.error(`[sendWorkshopDateChangeEmail] Failed to send to ${registrant.email}:`, err);
      failures.push({ email: registrant.email, error: err });
    }
  }

  console.log(
    `[sendWorkshopDateChangeEmail] done: sent=${registrants.length - failures.length}/${registrants.length} failed=${failures.length}`
  );

  if (failures.length > 0) {
    throw new Error(
      `sendWorkshopDateChangeEmail: ${failures.length}/${registrants.length} recipient(s) failed. ` +
        `First error: ${(failures[0].error as Error)?.message ?? failures[0].error}`
    );
  }
}

// ============================================
// Coach Welcome / Password Set Email (MR-44)
// ============================================

export async function sendCoachWelcomeEmail(data: {
    coachEmail: string;
    coachName: string;
    passwordSetUrl: string;
}): Promise<void> {
    const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Welcome to the Scaling Up Workshop Platform</h2>
      <p style="color: #4a4a4a;">Hi ${data.coachName},</p>
      <p style="color: #4a4a4a;">
        Your coach account has been created on the <strong>Scaling Up Workshop Platform</strong>.
        To get started, please set your password by clicking the button below.
      </p>
      <br/>
      <div style="text-align: center;">
        <a href="${data.passwordSetUrl}"
           style="display: inline-block; background-color: #1D4ED8; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Set Your Password
        </a>
      </div>
      <br/>
      <p style="color: #9ca3af; font-size: 14px;">This link expires in 24 hours.</p>
      <p style="color: #9ca3af; font-size: 14px;">If you did not expect this email, you can safely ignore it.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
      <p style="color: #9ca3af; font-size: 12px;">&mdash; Scaling Up Workshop Platform</p>
    </div>
  `;

    await sendNotificationEmail({
        to: data.coachEmail,
        subject: "Welcome to Scaling Up — Set your password",
        html,
        telemetry: {
            recipientRole: "COACH",
            metadata: { type: "coach_welcome" },
        },
    });
}

// ============================================
// Sprint 4: Approval Info Request Emails
// ============================================

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export async function sendApprovalInfoRequestEmail(data: {
    coachEmail: string;
    coachName: string;
    workshopTitle: string;
    workshopId: string;
    question: string;
}): Promise<void> {
    const portalUrl = `${process.env.APP_URL}/portal/workshops/${data.workshopId}`;
    const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Additional Information Requested</h2>
      <p style="color: #4a4a4a;">Hi ${data.coachName},</p>
      <p style="color: #4a4a4a;">
        Our team has reviewed your workshop request for <strong>${data.workshopTitle}</strong> and
        needs some additional information before we can approve it.
      </p>
      <div style="background: #f8f9fa; border-left: 4px solid #1D4ED8; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1a1a1a; font-weight: 600;">Question from our team:</p>
        <p style="margin: 8px 0 0; color: #374151;">${escapeHtml(data.question)}</p>
      </div>
      <p style="color: #4a4a4a;">
        Please log in to your portal and submit your response on the workshop detail page.
      </p>
      <br/>
      <div style="text-align: center;">
        <a href="${portalUrl}"
           style="display: inline-block; background-color: #1D4ED8; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Respond in Portal
        </a>
      </div>
      <br/>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
      <p style="color: #9ca3af; font-size: 12px;">&mdash; Scaling Up Workshop Platform</p>
    </div>
  `;

    await sendNotificationEmail({
        to: data.coachEmail,
        subject: `Action Required: Additional info needed for "${data.workshopTitle}"`,
        html,
        telemetry: {
            workshopId: data.workshopId,
            recipientRole: "COACH",
            metadata: { type: "approval_info_request" },
        },
    });
}

export async function sendApprovalCoachRespondedEmail(data: {
    adminEmail: string;
    coachName: string;
    workshopTitle: string;
    approvalId: string;
    coachResponse: string;
}): Promise<void> {
    const approvalUrl = `${process.env.APP_URL}/admin/approvals`;
    const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Coach Responded to Info Request</h2>
      <p style="color: #4a4a4a;"><strong>${data.coachName}</strong> has responded to your information request for <strong>${data.workshopTitle}</strong>.</p>
      <div style="background: #f8f9fa; border-left: 4px solid #22c55e; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1a1a1a; font-weight: 600;">Coach&apos;s response:</p>
        <p style="margin: 8px 0 0; color: #374151; white-space: pre-wrap;">${escapeHtml(data.coachResponse)}</p>
      </div>
      <p style="color: #4a4a4a;">The approval is now back in the pending queue for your review.</p>
      <br/>
      <div style="text-align: center;">
        <a href="${approvalUrl}"
           style="display: inline-block; background-color: #1D4ED8; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Review in Approval Queue
        </a>
      </div>
      <br/>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
      <p style="color: #9ca3af; font-size: 12px;">&mdash; Scaling Up Workshop Platform</p>
    </div>
  `;

    await sendNotificationEmail({
        to: data.adminEmail,
        subject: `Coach Responded: "${data.workshopTitle}" — Ready for Review`,
        html,
        telemetry: {
            recipientRole: "STAFF",
            metadata: { type: "approval_coach_responded", approvalId: data.approvalId },
        },
    });
}

export async function sendCounterOfferEmail(data: {
    coachEmail: string;
    coachName: string;
    workshopTitle: string;
    workshopId: string;
    originalPriceCents: number;
    counterOfferCents: number;
    counterOfferNote?: string;
}): Promise<void> {
    const portalUrl = `${process.env.APP_URL}/portal/workshops/${data.workshopId}`;
    const originalFormatted = `$${(data.originalPriceCents / 100).toFixed(2)}`;
    const offerFormatted = `$${(data.counterOfferCents / 100).toFixed(2)}`;
    const noteBlock = data.counterOfferNote
        ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;margin:20px 0;border-radius:4px;">
            <p style="margin:0;color:#92400e;font-weight:600;">Note from admin:</p>
            <p style="margin:8px 0 0;color:#374151;">${escapeHtml(data.counterOfferNote)}</p>
          </div>`
        : "";
    const html = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#1a1a1a;">Counter-Offer on Your Price Request</h2>
      <p style="color:#4a4a4a;">Hi <strong>${escapeHtml(data.coachName)}</strong>, the admin has sent a counter-offer for <strong>${escapeHtml(data.workshopTitle)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr>
          <td style="padding:12px;border:1px solid #e5e7eb;color:#9ca3af;text-decoration:line-through;">Your request: ${originalFormatted}</td>
        </tr>
        <tr>
          <td style="padding:12px;border:1px solid #f59e0b;background:#fffbeb;color:#d97706;font-weight:700;font-size:18px;">Admin offering: ${offerFormatted}</td>
        </tr>
      </table>
      ${noteBlock}
      <p style="color:#4a4a4a;">Visit your portal to accept or decline this offer.</p>
      <br/>
      <div style="text-align:center;">
        <a href="${portalUrl}" style="display:inline-block;background-color:#1D4ED8;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">
          Review Offer in Portal
        </a>
      </div>
      <br/>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="color:#9ca3af;font-size:12px;">&mdash; Scaling Up Workshop Platform</p>
    </div>
  `;
    await sendNotificationEmail({
        to: data.coachEmail,
        subject: `Counter-Offer: "${data.workshopTitle}" — Please Review`,
        html,
        telemetry: {
            workshopId: data.workshopId,
            recipientRole: "COACH",
            metadata: { type: "counter_offer", workshopId: data.workshopId },
        },
    });
}

export async function sendCounterOfferAcceptedEmail(data: {
    adminEmail: string;
    coachName: string;
    workshopTitle: string;
    approvalId: string;
    acceptedPriceCents: number;
}): Promise<void> {
    const approvalsUrl = `${process.env.APP_URL}/admin/approvals`;
    const priceFormatted = `$${(data.acceptedPriceCents / 100).toFixed(2)}`;
    const html = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#1a1a1a;">Counter-Offer Accepted</h2>
      <p style="color:#4a4a4a;"><strong>${escapeHtml(data.coachName)}</strong> has accepted your counter-offer of <strong>${priceFormatted}</strong> for <strong>${escapeHtml(data.workshopTitle)}</strong>.</p>
      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;margin:20px 0;border-radius:4px;">
        <p style="margin:0;color:#166534;font-weight:600;">The price has been applied to the workshop.</p>
      </div>
      <br/>
      <div style="text-align:center;">
        <a href="${approvalsUrl}" style="display:inline-block;background-color:#1D4ED8;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">
          View Approval Queue
        </a>
      </div>
      <br/>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="color:#9ca3af;font-size:12px;">&mdash; Scaling Up Workshop Platform</p>
    </div>
  `;
    await sendNotificationEmail({
        to: data.adminEmail,
        subject: `Counter-Offer Accepted: "${data.workshopTitle}" — ${priceFormatted}`,
        html,
        telemetry: {
            recipientRole: "STAFF",
            metadata: { type: "counter_offer_accepted", approvalId: data.approvalId },
        },
    });
}

export async function sendCoachDeclinedCounterEmail(data: {
    adminEmail: string;
    coachName: string;
    workshopTitle: string;
    approvalId: string;
    newPriceCents?: number;
}): Promise<void> {
    const approvalsUrl = `${process.env.APP_URL}/admin/approvals`;
    const isNewOffer = typeof data.newPriceCents === "number";
    const newPriceFormatted = isNewOffer ? `$${(data.newPriceCents! / 100).toFixed(2)}` : "";
    const subject = isNewOffer
        ? `New Counter-Offer from Coach: "${data.workshopTitle}"`
        : `Counter-Offer Declined: "${data.workshopTitle}"`;
    const bodyText = isNewOffer
        ? `<strong>${escapeHtml(data.coachName)}</strong> declined your counter-offer and proposed a new price of <strong>${newPriceFormatted}</strong> for <strong>${escapeHtml(data.workshopTitle)}</strong>. The approval is back in the pending queue.`
        : `<strong>${escapeHtml(data.coachName)}</strong> declined your counter-offer for <strong>${escapeHtml(data.workshopTitle)}</strong> with no alternative price. The negotiation has ended.`;
    const html = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#1a1a1a;">${isNewOffer ? "New Counter-Offer from Coach" : "Counter-Offer Declined"}</h2>
      <p style="color:#4a4a4a;">${bodyText}</p>
      <br/>
      <div style="text-align:center;">
        <a href="${approvalsUrl}" style="display:inline-block;background-color:#1D4ED8;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">
          View Approval Queue
        </a>
      </div>
      <br/>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
      <p style="color:#9ca3af;font-size:12px;">&mdash; Scaling Up Workshop Platform</p>
    </div>
  `;
    await sendNotificationEmail({
        to: data.adminEmail,
        subject,
        html,
        telemetry: {
            recipientRole: "STAFF",
            metadata: { type: isNewOffer ? "counter_declined_new_price" : "counter_declined_final", approvalId: data.approvalId },
        },
    });
}

// ============================================
// Internal Helpers
// ============================================

async function sendNotificationEmail(options: {
    to: string;
    subject: string;
    html: string;
    attachments?: SmtpAttachment[];
    telemetry?: {
        workshopId?: string;
        workshopCode?: string;
        recipientRole?: "STAFF" | "COACH" | "ATTENDEE" | "CUSTOM";
        metadata?: Record<string, unknown>;
    };
}): Promise<void> {
    try {
        await sendEmailViaSMTP({
            to: options.to,
            subject: options.subject,
            html: options.html,
            attachments: options.attachments,
            telemetry: options.telemetry ? {
                ...options.telemetry,
                metadata: {
                    attachmentCount: options.attachments?.length ?? 0,
                    ...(options.telemetry.metadata ?? {}),
                },
            } : undefined,
        });
    } catch (error) {
        console.error("Failed to send notification email:", error);
        // Don't throw — notifications shouldn't break the main flow.
    }
}

async function sendTeamsNotification(data: { title: string; text: string; link: string }): Promise<void> {
    try {
        await fetch(process.env.TEAMS_WEBHOOK_URL!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                "@type": "MessageCard",
                "@context": "http://schema.org/extensions",
                "themeColor": "0076D7",
                "summary": data.title,
                "sections": [{
                    "activityTitle": data.title,
                    "text": data.text,
                    "potentialAction": [{
                        "@type": "OpenUri",
                        "name": "View Request",
                        "targets": [{ "os": "default", "uri": data.link }]
                    }]
                }]
            })
        });
    } catch (error) {
        console.error("Failed to send Teams notification:", error);
    }
}
