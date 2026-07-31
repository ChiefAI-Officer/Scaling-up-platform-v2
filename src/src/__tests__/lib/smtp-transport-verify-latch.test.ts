const mockVerify = jest.fn();
const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({ verify: mockVerify, sendMail: mockSendMail })),
  },
}));

jest.mock("@/lib/delivery-telemetry", () => ({
  recordDeliveryTelemetry: jest.fn().mockResolvedValue(undefined),
}));

import nodemailer from "nodemailer";
import { recordDeliveryTelemetry } from "@/lib/delivery-telemetry";
import {
  prepareEmailViaSMTP,
  sendEmailViaSMTP,
} from "@/lib/smtp-transport";

describe("smtp-transport — a failed verify() must not latch _verified (audit PR-4)", () => {
  const prevHost = process.env.SMTP_HOST;

  beforeAll(() => {
    process.env.SMTP_HOST = "smtp.test.local";
  });
  afterAll(() => {
    if (prevHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = prevHost;
  });
  beforeEach(() => {
    mockVerify.mockReset();
    mockSendMail.mockReset().mockResolvedValue({});
    (recordDeliveryTelemetry as jest.Mock).mockClear();
  });

  it("constructs SMTP configuration and mail options before provider handoff", () => {
    const prepared = prepareEmailViaSMTP({
      to: "prepared@x.com",
      subject: "prepared",
      html: "<p>prepared</p>",
    });

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(prepared).toEqual({ send: expect.any(Function) });
  });

  it("re-verifies on the next send after a failed verify (not permanently suppressed)", async () => {
    const rawToken = "verify-raw-token";
    const tokenHash = "b".repeat(64);
    const verifyError = new Error(`verify echoed ${rawToken}`);
    verifyError.name = `VerifyFailure-${tokenHash}`;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockVerify
      .mockRejectedValueOnce(verifyError)
      .mockResolvedValueOnce(undefined);

    await sendEmailViaSMTP({ to: "a@x.com", subject: "s", html: "<p>h</p>" });
    await sendEmailViaSMTP({ to: "b@x.com", subject: "s", html: "<p>h</p>" });

    // Buggy code latched _verified=true after the first (failed) verify, so the
    // 2nd send skipped verify (1 call). Correct behavior re-verifies (2 calls).
    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    const captured = consoleError.mock.calls
      .flat()
      .map((value) =>
        value instanceof Error
          ? `${value.name}:${value.message}:${value.stack ?? ""}`
          : String(value)
      )
      .join("\n");
    expect(captured).not.toContain(rawToken);
    expect(captured).not.toContain(tokenHash);
    consoleError.mockRestore();
  });

  it("redacts untrusted provider error fields for sensitive email telemetry", async () => {
    const rawToken = "raw-token-secret";
    const tokenHash = "a".repeat(64);
    const providerError = new Error(`provider echoed ${rawToken}`);
    providerError.name = `ProviderFailure-${tokenHash}`;
    mockSendMail.mockRejectedValueOnce(providerError);

    const prepared = prepareEmailViaSMTP({
      to: "sensitive@x.com",
      subject: "sensitive",
      html: `<a href="#t=${rawToken}">Open</a>`,
      redactErrors: true,
      telemetry: { recipientRole: "CUSTOM" },
    });

    await expect(prepared.send()).rejects.toBe(providerError);
    expect(recordDeliveryTelemetry).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "FAILED",
        errorMessage: "SENSITIVE_EMAIL_SEND_FAILED",
      })
    );
    const telemetryText = JSON.stringify(
      (recordDeliveryTelemetry as jest.Mock).mock.calls
    );
    expect(telemetryText).not.toContain(rawToken);
    expect(telemetryText).not.toContain(tokenHash);
  });
});
