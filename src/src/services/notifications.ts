/**
 * Notifications Service (V2)
 * Handles sending notifications via Email (SMTP) and Microsoft Teams.
 * Replaces Slack notifications from V1.
 */

import nodemailer from "nodemailer";

// ============================================
// Types
// ============================================

export interface ApprovalRequest {
    id: string;
    type: string; // 'CUSTOM_PRICING', 'CANCELLATION', etc.
    coachName: string;
    details: string;
    requestedAt: Date;
}

interface EmailAttachment {
    filename: string;
    content: string | Buffer;
    contentType: string;
}

interface EmailPayload {
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
}

// ============================================
// Email Transport (SMTP)
// ============================================

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.example.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

// ============================================
// Notification Functions
// ============================================

/**
 * Send an approval request notification to Suzanne/Admins
 */
export async function sendApprovalRequest(approval: ApprovalRequest): Promise<void> {
    const approvalUrl = `${process.env.APP_URL}/admin/approvals/${approval.id}`;

    const html = `
    <h2>New Approval Request: ${approval.type}</h2>
    <p><strong>Coach:</strong> ${approval.coachName}</p>
    <p><strong>Details:</strong> ${approval.details}</p>
    <p><strong>Requested:</strong> ${approval.requestedAt.toLocaleString()}</p>
    <br/>
    <a href="${approvalUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Request</a>
  `;

    // 1. Send Email
    await sendEmail({
        to: process.env.ADMIN_EMAIL || "admin@scalingup.com",
        subject: `[ACTION REQUIRED] Approval Needed: ${approval.type}`,
        html,
    });

    // 2. Send Teams Notification (if configured)
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

    await sendEmail({
        to: escalateToEmail,
        subject: `[ESCALATION] Pending Approval: ${approval.type}`,
        html,
    });
}

/**
 * JV-26: Send registration notification to admin + coach
 */
export async function sendRegistrationNotification(data: {
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

    const attachments: EmailAttachment[] = data.icsAttachment
        ? [{ filename: data.icsAttachment.filename, content: data.icsAttachment.content, contentType: "text/calendar" }]
        : [];

    // 1. Notify admin
    await sendEmail({
        to: process.env.ADMIN_EMAIL || "admin@scalingup.com",
        subject: `[Registration] ${data.registrantName} registered for ${data.workshopTitle}`,
        html,
    });

    // 2. Notify the coach (scoped to their workshop only — JV-26)
    await sendEmail({
        to: data.coachEmail,
        subject: `New registration: ${data.registrantName} for ${data.workshopTitle}`,
        html,
    });

    // 3. Send confirmation to registrant with ICS attachment (JV-18)
    if (data.icsAttachment) {
        await sendEmail({
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

    const html = `
    <h2>New Approval Request: ${data.type}</h2>
    <p><strong>Coach:</strong> ${data.coachName} (${data.coachEmail})</p>
    <p><strong>Details:</strong> ${data.details}</p>
    <p><strong>Requested:</strong> ${data.requestedAt.toLocaleString()}</p>
    ${enrichmentHtml}
    <br/>
    <a href="${approvalUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review Request</a>
    `;

    await sendEmail({
        to: process.env.ADMIN_EMAIL || "admin@scalingup.com",
        subject: `[ACTION REQUIRED] Approval Needed: ${data.type} — ${data.coachName}`,
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
// Internal Helpers
// ============================================

async function sendEmail(payload: EmailPayload): Promise<void> {
    if (!process.env.SMTP_HOST) {
        console.log("[Mock Email] Would send:", payload.subject);
        return;
    }

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Scaling Up Platform" <noreply@scalingup.com>',
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            attachments: payload.attachments?.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType,
            })),
        });
        console.log(`Email sent to ${payload.to}: ${payload.subject}`);
    } catch (error) {
        console.error("Failed to send email:", error);
        // Don't throw, just log. Notifications shouldn't break the main flow usually.
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
