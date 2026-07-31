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

  it("keeps legacy sends on their independent verification path", async () => {
    mockVerify.mockRejectedValue(new Error("legacy verify unavailable"));

    await Promise.all([
      sendEmailViaSMTP({ to: "legacy-a@x.com", subject: "s", html: "<p>h</p>" }),
      sendEmailViaSMTP({ to: "legacy-b@x.com", subject: "s", html: "<p>h</p>" }),
    ]);

    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it("shares one failed cold-start verify and clears the latch for a later retry", async () => {
    const rawToken = "verify-raw-token";
    const tokenHash = "b".repeat(64);
    const verifyError = new Error(`verify echoed ${rawToken}`);
    verifyError.name = `VerifyFailure-${tokenHash}`;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    let rejectColdVerify!: (reason: Error) => void;
    const coldVerify = new Promise<void>((_resolve, reject) => {
      rejectColdVerify = reject;
    });
    mockVerify
      .mockReturnValueOnce(coldVerify)
      .mockRejectedValue(new Error("retry still unavailable"));

    const first = sendEmailViaSMTP({
      to: "a@x.com",
      subject: "s",
      html: "<p>h</p>",
      coalesceVerification: true,
    });
    const second = sendEmailViaSMTP({
      to: "b@x.com",
      subject: "s",
      html: "<p>h</p>",
      coalesceVerification: true,
    });
    rejectColdVerify(verifyError);
    await Promise.all([first, second]);

    await sendEmailViaSMTP({
      to: "retry@x.com",
      subject: "s",
      html: "<p>h</p>",
      coalesceVerification: true,
    });

    // The concurrent pair shares call 1. The later send retries with call 2.
    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(mockSendMail).toHaveBeenCalledTimes(3);
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

  it("shares one successful cold-start verify and keeps the verified fast path", async () => {
    let resolveColdVerify!: () => void;
    const coldVerify = new Promise<void>((resolve) => {
      resolveColdVerify = resolve;
    });
    mockVerify.mockReturnValueOnce(coldVerify);

    const first = sendEmailViaSMTP({
      to: "a@x.com",
      subject: "s",
      html: "<p>h</p>",
      coalesceVerification: true,
    });
    const second = sendEmailViaSMTP({
      to: "b@x.com",
      subject: "s",
      html: "<p>h</p>",
      coalesceVerification: true,
    });
    resolveColdVerify();
    await Promise.all([first, second]);
    await sendEmailViaSMTP({
      to: "fast-path@x.com",
      subject: "s",
      html: "<p>h</p>",
      coalesceVerification: true,
    });

    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(3);
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
