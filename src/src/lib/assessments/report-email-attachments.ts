import {
  REPORT_EMAIL_LOGO_CID,
  REPORT_EMAIL_LOGO_SRC,
} from "@/lib/assessments/report-email-chrome";
import { SU_LOGO_PNG } from "@/lib/assets/invitation-logo";
import type { SmtpAttachment } from "@/lib/smtp-transport";

const REPORT_EMAIL_LOGO_IMG_TOKEN = `<img src="${REPORT_EMAIL_LOGO_SRC}"`;

export function reportEmailAttachments(bodyHtml: string): SmtpAttachment[] {
  if (!bodyHtml.includes(REPORT_EMAIL_LOGO_IMG_TOKEN)) return [];

  return [
    {
      filename: "su-report-logo-v1.png",
      content: SU_LOGO_PNG,
      contentType: "image/png",
      cid: REPORT_EMAIL_LOGO_CID,
    },
  ];
}
