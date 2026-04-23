/**
 * Shared SMTP Transport
 * Single source of truth for nodemailer configuration and email delivery with telemetry.
 * Used by: services/email-sender.ts, services/notifications.ts, inngest/execute-workflow.ts
 */

import nodemailer from "nodemailer";
import { recordDeliveryTelemetry, type DeliveryTelemetryEvent } from "@/lib/delivery-telemetry";

export interface SmtpAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: SmtpAttachment[];
  telemetry?: Omit<DeliveryTelemetryEvent, "recipient" | "subject" | "status" | "provider">;
}

let _transporter: nodemailer.Transporter | null = null;
let _verified = false;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.example.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      requireTLS: true,
      tls: { minVersion: "TLSv1.2" },
      // Fail fast instead of hanging on an unresponsive SMTP server.
      // Defaults (2min/30s) can exceed Vercel serverless function budget
      // and kill the process silently mid-loop when sending to many recipients.
      connectionTimeout: 10_000, // 10s to open TCP socket
      greetingTimeout: 10_000,   // 10s to receive SMTP banner
      socketTimeout: 20_000,     // 20s max per-connection inactivity
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return _transporter;
}

/**
 * Send an email via SMTP with automatic telemetry recording.
 * Falls back to mock logging when SMTP_HOST is not configured.
 * Throws on failure — callers that want to swallow errors should catch.
 */
export async function sendEmailViaSMTP(options: SendEmailOptions): Promise<void> {
  const provider = process.env.SMTP_HOST ? "SMTP" : "MOCK";

  if (!process.env.SMTP_HOST) {
    console.log(
      `[Mock Email] To: ${options.to}, Subject: ${options.subject}, Attachments: ${options.attachments?.length || 0}`
    );
    if (options.telemetry) {
      await recordDeliveryTelemetry({
        recipient: options.to,
        subject: options.subject,
        status: "MOCK",
        provider,
        ...options.telemetry,
      });
    }
    return;
  }

  try {
    const transporter = getTransporter();
    if (!_verified) {
      try {
        await transporter.verify();
        console.log("[smtp-transport] SMTP verify() succeeded: host=" + process.env.SMTP_HOST);
      } catch (verifyErr) {
        console.error("[smtp-transport] SMTP verify() FAILED:", verifyErr);
      }
      _verified = true;
    }
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Scaling Up Platform" <noreply@scalingup.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        ...(a.content !== undefined ? { content: a.content } : {}),
        ...(a.path !== undefined ? { path: a.path } : {}),
        contentType: a.contentType,
      })),
    });

    if (options.telemetry) {
      await recordDeliveryTelemetry({
        recipient: options.to,
        subject: options.subject,
        status: "SENT",
        provider,
        ...options.telemetry,
      });
    }
    console.log(`Email sent to ${options.to}: ${options.subject}`);
  } catch (error) {
    if (options.telemetry) {
      await recordDeliveryTelemetry({
        recipient: options.to,
        subject: options.subject,
        status: "FAILED",
        provider,
        errorMessage: error instanceof Error ? error.message : "Unknown email send error",
        ...options.telemetry,
      });
    }
    throw error;
  }
}
