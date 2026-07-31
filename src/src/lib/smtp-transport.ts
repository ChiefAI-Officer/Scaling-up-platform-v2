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
  cid?: string; // inline-image Content-ID (referenced as <img src="cid:...">)
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string; // plain-text alternative → multipart/alternative
  attachments?: SmtpAttachment[];
  telemetry?: Omit<DeliveryTelemetryEvent, "recipient" | "subject" | "status" | "provider">;
  /** Persist only an allowlisted error classification for credential-bearing emails. */
  redactErrors?: boolean;
}

export interface PreparedEmail {
  send(): Promise<void>;
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
 * Complete deterministic validation, SMTP configuration, and mail-option
 * construction before exposing the provider-facing handoff.
 */
export function prepareEmailViaSMTP(options: SendEmailOptions): PreparedEmail {
  if (
    typeof options.to !== "string" ||
    options.to.trim().length === 0 ||
    typeof options.subject !== "string" ||
    typeof options.html !== "string"
  ) {
    throw new Error("Invalid email options");
  }

  const smtpConfigured = Boolean(process.env.SMTP_HOST);
  if (smtpConfigured) {
    const configuredPort = Number.parseInt(process.env.SMTP_PORT || "587", 10);
    if (
      !Number.isInteger(configuredPort) ||
      configuredPort < 1 ||
      configuredPort > 65_535
    ) {
      throw new Error("Invalid SMTP port");
    }
  }

  const provider = smtpConfigured ? "SMTP" : "MOCK";
  const transporter = smtpConfigured ? getTransporter() : null;
  const mailOptions = {
    from:
      process.env.SMTP_FROM ||
      '"Scaling Up Platform" <noreply@scalingup.com>',
    to: options.to,
    subject: options.subject,
    html: options.html,
    ...(options.text !== undefined ? { text: options.text } : {}),
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      ...(a.content !== undefined ? { content: a.content } : {}),
      ...(a.path !== undefined ? { path: a.path } : {}),
      ...(a.cid !== undefined ? { cid: a.cid } : {}),
      contentType: a.contentType,
    })),
  };

  return {
    async send(): Promise<void> {
      if (!transporter) {
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
        if (!_verified) {
          try {
            await transporter.verify();
            console.log(
              "[smtp-transport] SMTP verify() succeeded: host=" +
                process.env.SMTP_HOST
            );
            // Only latch on success — a failed verify must not permanently
            // suppress re-verification for the rest of the process lifetime.
            _verified = true;
          } catch {
            console.error("[smtp-transport] SMTP verify() FAILED");
          }
        }
        await transporter.sendMail(mailOptions);

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
            errorMessage:
              options.redactErrors
                ? "SENSITIVE_EMAIL_SEND_FAILED"
                : error instanceof Error
                ? error.message
                : "Unknown email send error",
            ...options.telemetry,
          });
        }
        throw error;
      }
    }
  };
}

/**
 * Send an email via SMTP with automatic telemetry recording.
 * Falls back to mock logging when SMTP_HOST is not configured.
 * Throws on failure — callers that want to swallow errors should catch.
 */
export async function sendEmailViaSMTP(options: SendEmailOptions): Promise<void> {
  const prepared = prepareEmailViaSMTP(options);
  await prepared.send();
}
