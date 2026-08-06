import {
  createCeoReportAccessToken,
  verifyCeoReportAccessToken,
} from "@/lib/assessments/ceo-report-access-token";
import { createHmac } from "node:crypto";

const SECRET = "test-secret-at-least-thirty-two-characters";

function claims() {
  return {
    focusCampaignId: "campaign-1",
    invitationId: "invite-1",
    respondentId: "respondent-1",
  };
}

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

describe("CEO report access token", () => {
  beforeEach(() => {
    process.env.ASSESSMENT_REPORT_ACCESS_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.ASSESSMENT_REPORT_ACCESS_SECRET;
  });

  test("accepts a signed complete purpose-bound claim and rejects a tampered signature", () => {
    const now = 1_800_000_000;
    const token = createCeoReportAccessToken(claims(), 60, now);

    expect(verifyCeoReportAccessToken(token, now)).toEqual({
      version: 1,
      purpose: "assessment-report-comparison-self",
      ...claims(),
      expiresAt: now + 60,
    });
    expect(verifyCeoReportAccessToken(`${token}tampered`, now)).toBeNull();
  });

  test("rejects non-canonical base64url payload and signature segments", () => {
    const now = 1_800_000_000;
    const token = createCeoReportAccessToken(claims(), 60, now);
    const [payload, signature] = token.split(".");
    const paddedPayload = `${payload}=`;

    expect(verifyCeoReportAccessToken(`${payload}.${signature}!`, now)).toBeNull();
    expect(verifyCeoReportAccessToken(`${payload}.${signature}=`, now)).toBeNull();
    expect(verifyCeoReportAccessToken(`${paddedPayload}.${sign(paddedPayload)}`, now)).toBeNull();
  });

  test("fails closed for malformed parts and incomplete or invalid signed claims", () => {
    const now = 1_800_000_000;
    const token = createCeoReportAccessToken(claims(), 60, now);
    const [, signature] = token.split(".");

    expect(verifyCeoReportAccessToken("not-a-token", now)).toBeNull();
    expect(verifyCeoReportAccessToken(`${token}.extra`, now)).toBeNull();
    expect(verifyCeoReportAccessToken(`${encode({ version: 1 })}.${signature}`, now)).toBeNull();
    expect(verifyCeoReportAccessToken(`${encode({ version: 2, purpose: "assessment-report-comparison-self", ...claims(), expiresAt: now + 60 })}.${signature}`, now)).toBeNull();
    expect(verifyCeoReportAccessToken(`${encode({ version: 1, purpose: "another-purpose", ...claims(), expiresAt: now + 60 })}.${signature}`, now)).toBeNull();
    expect(verifyCeoReportAccessToken(`${encode({ version: 1, purpose: "assessment-report-comparison-self", ...claims(), expiresAt: Number.POSITIVE_INFINITY })}.${signature}`, now)).toBeNull();
  });

  test("rejects expiry at the exact boundary and tokens signed with another secret", () => {
    const now = 1_800_000_000;
    const token = createCeoReportAccessToken(claims(), 1, now);

    expect(verifyCeoReportAccessToken(token, now + 1)).toBeNull();
    process.env.ASSESSMENT_REPORT_ACCESS_SECRET = "another-test-secret-at-least-thirty-two";
    expect(verifyCeoReportAccessToken(token, now)).toBeNull();
  });

  test("refuses missing or short production secrets rather than issuing or accepting a capability", () => {
    delete process.env.ASSESSMENT_REPORT_ACCESS_SECRET;
    expect(() => createCeoReportAccessToken(claims())).toThrow("ASSESSMENT_REPORT_ACCESS_SECRET");
    expect(verifyCeoReportAccessToken("anything")).toBeNull();

    process.env.ASSESSMENT_REPORT_ACCESS_SECRET = "too-short";
    expect(() => createCeoReportAccessToken(claims())).toThrow("ASSESSMENT_REPORT_ACCESS_SECRET");
    expect(verifyCeoReportAccessToken("anything")).toBeNull();
  });
});
