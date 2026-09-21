jest.mock("@/lib/smtp-transport", () => ({ prepareEmailViaSMTP: jest.fn() }));

import { prepareEmailViaSMTP } from "@/lib/smtp-transport";
import { sendMemberSignInLink } from "@/lib/members/send-sign-in-link";

const mockPrepare = prepareEmailViaSMTP as jest.Mock;

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
    process.env.APP_URL = "https://platform.scalingup.com";
  });
  afterEach(() => delete process.env.APP_URL);

  it("issues, audits, and dispatches one link for any live roster address", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    mockPrepare.mockReturnValue({ send });
    const db = fixture();

    await expect(
      sendMemberSignInLink(db, { email: " Member@Example.com ", via: "SELF" }),
    ).resolves.toEqual({ issued: true });
    expect(db.memberSignInToken.create).toHaveBeenCalledTimes(1);
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ to: "member@example.com", subject: "Your Scaling Up sign-in link" }),
    );
    expect(send).toHaveBeenCalledTimes(1);
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

  it("returns before SMTP settles and contains a later failure without PII", async () => {
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
    rejectSend(new Error("SMTP contained failure for member@example.com"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const payload = info.mock.calls.map(([line]) => String(line)).join("\n");
    expect(payload).toContain("member_signin.send_failed");
    expect(payload).not.toContain("member@example.com");
    expect(payload).not.toContain("SMTP contained failure");
    info.mockRestore();
  });
});
