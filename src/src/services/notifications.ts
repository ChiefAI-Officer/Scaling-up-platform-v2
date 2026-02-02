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

interface EmailPayload {
    to: string;
    subject: string;
    html: string;
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
