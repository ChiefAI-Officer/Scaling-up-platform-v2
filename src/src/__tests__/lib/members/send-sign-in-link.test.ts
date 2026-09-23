jest.mock("@/lib/smtp-transport", () => ({ prepareEmailViaSMTP: jest.fn() }));
jest.mock("next/server", () => ({ after: jest.fn() }));

import { prepareEmailViaSMTP } from "@/lib/smtp-transport";
import { sendMemberSignInLink } from "@/lib/members/send-sign-in-link";
import { after } from "next/server";

const mockPrepare = prepareEmailViaSMTP as jest.Mock;
const mockAfter = after as jest.Mock;
let afterCallback: (() => void | Promise<void>) | undefined;

function fixture(eligible = true) {
  const db = {
    orgRespondent: {
      findMany: jest.fn().mockResolvedValue(
        eligible
          ? [{ id: "member-1", organizationId: "org-1", teamId: null, roleType: "employee" }]
          : [],
      ),
      findUnique: jest.fn().mockResolvedValue({ firstName: "Sam" }),
    },
    memberSignInToken: {
      create: jest.fn().mockResolvedValue({ id: "token-1" }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  return db;
}

describe("sendMemberSignInLink", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    afterCallback = undefined;
    mockAfter.mockImplementation((callback: () => void | Promise<void>) => {
      afterCallback = callback;
    });
    process.env.APP_URL = "https://platform.scalingup.com";
  });
  afterEach(() => delete process.env.APP_URL);

  it("issues, audits, and schedules one observable link for any live roster address", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    mockPrepare.mockReturnValue({ send });
    const db = fixture();

    await expect(
      sendMemberSignInLink(db, { email: " Member@Example.com ", via: "SELF" }),
    ).resolves.toEqual({ issued: true });
    expect(db.memberSignInToken.create).toHaveBeenCalledTimes(1);
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.com",
        subject: "Your Scaling Up sign-in link",
        redactErrors: true,
        telemetry: {
          recipientRole: "CUSTOM",
          metadata: {
            emailType: "MEMBER_SIGN_IN_LINK",
            issuedVia: "SELF",
            campaignId: null,
            tokenId: "token-1",
          },
        },
      }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(afterCallback).toEqual(expect.any(Function));
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "MEMBER_LINK_ISSUED", entityId: "token-1" }),
    });
  });

  it("does nothing and records no address for an unknown email", async () => {
    const db = fixture(false);
    await expect(
      sendMemberSignInLink(db, { email: "unknown@example.com", via: "SELF" }),
    ).resolves.toEqual({ issued: false });
    expect(db.memberSignInToken.create).not.toHaveBeenCalled();
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain("unknown@example.com");
  });

  it("keeps the post-response callback pending until SMTP settles", async () => {
    let resolveSend!: () => void;
    const send = jest.fn(
      () => new Promise<void>((resolve) => { resolveSend = resolve; }),
    );
    mockPrepare.mockReturnValue({ send });
    const db = fixture();

    await expect(
      sendMemberSignInLink(db, { email: "member@example.com", via: "SELF" }),
    ).resolves.toEqual({ issued: true });

    expect(send).not.toHaveBeenCalled();
    const completion = Promise.resolve(afterCallback?.());
    let completed = false;
    void completion.then(() => { completed = true; });
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(completed).toBe(false);

    resolveSend();
    await completion;
    expect(completed).toBe(true);
  });

  it("contains a post-response SMTP failure without PII", async () => {
    let rejectSend!: (error: Error) => void;
    const send = jest.fn(
      () => new Promise<void>((_resolve, reject) => { rejectSend = reject; }),
    );
    mockPrepare.mockReturnValue({ send });
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    const db = fixture();

    await expect(
      sendMemberSignInLink(db, { email: "member@example.com", via: "SELF" }),
    ).resolves.toEqual({ issued: true });
    const completion = Promise.resolve(afterCallback?.());
    rejectSend(new Error("SMTP contained failure for member@example.com"));
    await completion;
    const payload = info.mock.calls.map(([line]) => String(line)).join("\n");
    expect(payload).toContain("member_signin.send_failed");
    expect(payload).not.toContain("member@example.com");
    expect(payload).not.toContain("SMTP contained failure");
    info.mockRestore();
  });
});
