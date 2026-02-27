import {
  canRoleAccessAttachment,
  createFileAccessToken,
  verifyFileAccessToken,
} from "@/lib/file-access";

describe("file-access", () => {
  it("creates and verifies a signed token", () => {
    const token = createFileAccessToken({
      fileId: "file_123",
      workshopId: "ws_456",
      recipientRole: "ATTENDEE",
      ttlSeconds: 60,
    });

    const payload = verifyFileAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.fileId).toBe("file_123");
    expect(payload?.workshopId).toBe("ws_456");
    expect(payload?.recipientRole).toBe("ATTENDEE");
  });

  it("rejects expired tokens", () => {
    const token = createFileAccessToken({
      fileId: "file_123",
      recipientRole: "COACH",
      ttlSeconds: -1,
    });

    expect(verifyFileAccessToken(token)).toBeNull();
  });

  it("enforces role + stage access rules", () => {
    expect(
      canRoleAccessAttachment({
        recipientRole: "STAFF",
        workshopStatus: "REQUESTED",
      })
    ).toBe(true);

    expect(
      canRoleAccessAttachment({
        recipientRole: "COACH",
        workshopStatus: "REQUESTED",
      })
    ).toBe(false);

    expect(
      canRoleAccessAttachment({
        recipientRole: "COACH",
        workshopStatus: "AWAITING_APPROVAL",
      })
    ).toBe(false);

    expect(
      canRoleAccessAttachment({
        recipientRole: "COACH",
        workshopStatus: "AWAITING_APPROVAL",
        minStatus: "AWAITING_APPROVAL",
      })
    ).toBe(true);

    expect(
      canRoleAccessAttachment({
        recipientRole: "ATTENDEE",
        workshopStatus: "AWAITING_APPROVAL",
      })
    ).toBe(false);

    expect(
      canRoleAccessAttachment({
        recipientRole: "ATTENDEE",
        workshopStatus: "PRE_EVENT",
      })
    ).toBe(true);
  });
});
