import { SU_LOGO_CID } from "@/lib/assets/invitation-logo";
import { escapeHtml } from "@/lib/templates/interpolate-content-html";

export interface MemberSignInEmail {
  subject: string;
  html: string;
  text: string;
}

function durationLabel(issuedAt: Date, expiresAt: Date): string {
  const hours = Math.max(1, Math.round((expiresAt.getTime() - issuedAt.getTime()) / 3_600_000));
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function utcExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(expiresAt);
}

export function renderMemberSignInEmail(input: {
  firstName: string;
  rawToken: string;
  appUrl: string;
  issuedAt: Date;
  expiresAt: Date;
}): MemberSignInEmail {
  const url = new URL("/member/sign-in", input.appUrl);
  url.searchParams.set("t", input.rawToken);
  const safeUrl = escapeHtml(url.toString());
  const safeName = escapeHtml(input.firstName.trim() || "there");
  const duration = durationLabel(input.issuedAt, input.expiresAt);
  const expiry = utcExpiry(input.expiresAt);

  return {
    subject: "Your Scaling Up sign-in link",
    html: `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;">
  <div style="background:#522583;padding:28px 32px;">
    <img src="cid:${SU_LOGO_CID}" alt="Scaling Up" width="180" style="display:block;border:0;max-width:180px;height:auto;" />
  </div>
  <div style="padding:28px 32px;">
    <p>Hi ${safeName},</p>
    <p>Here's your link to your Scaling Up assessments and reports. There's no password to enter.</p>
    <div style="text-align:center;margin:28px 0 12px;">
      <a href="${safeUrl}" style="display:inline-block;background:#522583;color:#ffffff;padding:16px 34px;text-decoration:none;border-radius:8px;font-weight:700;">View my reports</a>
    </div>
    <p style="color:#6b7280;font-size:12px;text-align:center;">This link works once and expires in ${duration} — at ${expiry}.</p>
    <p style="margin-top:28px;"><strong>Didn't ask for this?</strong> You can ignore this email — the link expires on its own and nothing changes.</p>
  </div>
  <div style="padding:18px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">&mdash; Scaling Up Platform</div>
</div>`.trim(),
    text: [
      "Scaling Up Platform",
      "",
      `Hi ${input.firstName.trim() || "there"},`,
      "",
      "Here's your link to your Scaling Up assessments and reports. There's no password to enter.",
      "Use the secure View my reports button in the HTML version of this email.",
      `This link works once and expires in ${duration} — at ${expiry}.`,
      "",
      "Didn't ask for this? You can ignore this email — the link expires on its own and nothing changes.",
    ].join("\n"),
  };
}
