/**
 * ENH-MAY6-11 — shared composer for the attendee registration confirmation
 * email. Both the FREE path (services/notifications.ts
 * sendRegistrationNotification) and the PAID path
 * (services/notifications.ts sendPaidRegistrationNotificationStrict) call
 * this so the admin override applies uniformly.
 *
 * Behavior:
 *   1. Kill switch (Round 3 H1): if env TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED
 *      != "true", short-circuit to hardcoded HTML. Flip the env var to "false"
 *      in Vercel + redeploy and registration emails immediately revert.
 *   2. If a DB row exists, interpolate {{token}}s in subject + body and
 *      return that. Token VALUES are HTML-escaped (Round 2 M3) so registrant-
 *      controlled fields can't inject markup.
 *   3. If no DB row, return hardcoded HTML defaults verbatim. Lets prod
 *      deploy with zero backfill — admin save creates the row on first edit.
 *
 * Wave 13-A: extended with location fields (format, virtualLink, venueName,
 * venueAddress) so the hardcoded default shows a location block.
 */

import { db } from "@/lib/db";
import { buildLocationString } from "@/lib/ics-generator";

export interface RegistrationConfirmationContext {
  workshopTitle: string;
  coachName: string;
  registrantName: string;
  registrantEmail: string;
  format?: string | null;        // "VIRTUAL" | "IN_PERSON" | "HYBRID"
  virtualLink?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;  // JSON string from DB
}

export interface ComposedEmail {
  subject: string;
  html: string;
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

function interpolateTokens(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match,
  );
}

function isOverrideEnabled(): boolean {
  return process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED === "true";
}

/**
 * Build a location block HTML snippet for the hardcoded email template.
 * Rules:
 *   VIRTUAL + virtualLink → join link (no directions)
 *   VIRTUAL no link → generic message
 *   IN_PERSON/HYBRID + venueName → venue + Get Directions
 *   no format or no venueName → empty string (backwards compat)
 */
function buildLocationBlock(ctx: RegistrationConfirmationContext): string {
  const { format, virtualLink, venueName, venueAddress } = ctx;

  if (format === "VIRTUAL") {
    if (virtualLink) {
      const safeLink = virtualLink.startsWith("https://") || virtualLink.startsWith("http://") ? virtualLink : null;
      if (safeLink) {
        return `<p><strong>Join online:</strong> <a href="${escapeHtml(safeLink)}">${escapeHtml(safeLink)}</a></p>`;
      }
      // Link present but not a safe URL — fall through to generic note
    }
    return `<p>This is a virtual workshop. Join details will be shared by the coach.</p>`;
  }

  if ((format === "IN_PERSON" || format === "HYBRID") && venueName) {
    const locationStr = buildLocationString({ format, venueName, venueAddress, virtualLink });
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationStr)}`;
    return `<p><strong>Location:</strong> ${escapeHtml(venueName)}</p><p><a href="${mapsUrl}">Get Directions</a></p>`;
  }

  return "";
}

function hardcodedDefaults(ctx: RegistrationConfirmationContext): ComposedEmail {
  const locationBlock = buildLocationBlock(ctx);
  return {
    subject: `You're Registered: ${ctx.workshopTitle}`,
    html: `
            <h2>You're Registered!</h2>
            <p>Hi ${ctx.registrantName},</p>
            <p>You're confirmed for <strong>${ctx.workshopTitle}</strong> with ${ctx.coachName}.</p>
            <p>We've attached a calendar file (.ics) so you can add this event to your calendar.</p>
            ${locationBlock}
            <p>See you there!</p>
            <p>— The Scaling Up Team</p>
            `,
  };
}

export async function composeRegistrationConfirmationEmail(
  ctx: RegistrationConfirmationContext,
): Promise<ComposedEmail> {
  if (!isOverrideEnabled()) {
    return hardcodedDefaults(ctx);
  }

  const row = await db.transactionalEmailTemplate.findUnique({
    where: { emailType: "REGISTRATION_CONFIRMATION" },
  });

  if (!row) {
    return hardcodedDefaults(ctx);
  }

  // Round 2 M3: every token value is HTML-escaped before interpolation.
  const escapedTokens: Record<string, string> = {
    workshopTitle: escapeHtml(ctx.workshopTitle),
    coachName: escapeHtml(ctx.coachName),
    registrantName: escapeHtml(ctx.registrantName),
    registrantEmail: escapeHtml(ctx.registrantEmail),
    format: escapeHtml(ctx.format ?? ""),
    virtualLink: escapeHtml(ctx.virtualLink ?? ""),
    venueName: escapeHtml(ctx.venueName ?? ""),
    venueAddress: escapeHtml(ctx.venueAddress ?? ""),
  };

  return {
    subject: interpolateTokens(row.subject, escapedTokens),
    html: interpolateTokens(row.body, escapedTokens),
  };
}
