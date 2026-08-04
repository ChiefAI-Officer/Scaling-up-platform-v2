import {
  reportEmailAttachments,
} from "@/lib/assessments/report-email-attachments";
import {
  REPORT_EMAIL_LOGO_CID,
  REPORT_EMAIL_LOGO_SRC,
} from "@/lib/assessments/report-email-chrome";
import { SU_LOGO_PNG } from "@/lib/assets/invitation-logo";

describe("reportEmailAttachments", () => {
  it("returns one static inline PNG for the exact src token", () => {
    expect(
      reportEmailAttachments(
        `<img src="${REPORT_EMAIL_LOGO_SRC}" alt="Scaling Up" />`,
      ),
    ).toEqual([
      {
        filename: "su-report-logo-v1.png",
        content: SU_LOGO_PNG,
        contentType: "image/png",
        cid: REPORT_EMAIL_LOGO_CID,
      },
    ]);
  });

  it.each([
    "plain text cid:su-report-logo-v1",
    "src=&quot;cid:su-report-logo-v1&quot;",
    '<img data-src="cid:su-report-logo-v1" />',
    '&lt;img src="cid:su-report-logo-v1" /&gt;',
    '<img src="cid:sulogo" />',
    '<img src="cid:su-report-logo-v10" />',
    "<p>legacy report</p>",
  ])("returns no attachment for %s", (bodyHtml) => {
    expect(reportEmailAttachments(bodyHtml)).toEqual([]);
  });

  it("still returns one attachment when cover and footer reference the same CID", () => {
    const token = `<img src="${REPORT_EMAIL_LOGO_SRC}" />`;
    expect(reportEmailAttachments(`${token}${token}`)).toHaveLength(1);
  });
});
