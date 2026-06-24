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

import { sendEmailViaSMTP } from "@/lib/smtp-transport";

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
  });

  it("re-verifies on the next send after a failed verify (not permanently suppressed)", async () => {
    mockVerify
      .mockRejectedValueOnce(new Error("verify failed"))
      .mockResolvedValueOnce(undefined);

    await sendEmailViaSMTP({ to: "a@x.com", subject: "s", html: "<p>h</p>" });
    await sendEmailViaSMTP({ to: "b@x.com", subject: "s", html: "<p>h</p>" });

    // Buggy code latched _verified=true after the first (failed) verify, so the
    // 2nd send skipped verify (1 call). Correct behavior re-verifies (2 calls).
    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });
});
