import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
} from "@/lib/auth/password-reset";

describe("password-reset token helpers", () => {
  const originalSecret = process.env.APPROVAL_LINK_SECRET;

  beforeEach(() => {
    process.env.APPROVAL_LINK_SECRET = "test-reset-secret";
  });

  afterAll(() => {
    process.env.APPROVAL_LINK_SECRET = originalSecret;
  });

  it("generates and verifies a valid token", () => {
    const email = "admin@scalingup.com";
    const passwordHash = "$2a$10$examplehashvalue";
    const token = generatePasswordResetToken(email, passwordHash, 300);

    expect(verifyPasswordResetToken(token, email, passwordHash)).toBe(true);
  });

  it("rejects tampered tokens", () => {
    const email = "admin@scalingup.com";
    const passwordHash = "$2a$10$examplehashvalue";
    const token = generatePasswordResetToken(email, passwordHash, 300);
    const tampered = `${token.slice(0, -1)}x`;

    expect(verifyPasswordResetToken(tampered, email, passwordHash)).toBe(false);
  });

  it("rejects token if password hash changed", () => {
    const email = "admin@scalingup.com";
    const token = generatePasswordResetToken(email, "$2a$10$oldhash", 300);

    expect(verifyPasswordResetToken(token, email, "$2a$10$newhash")).toBe(false);
  });

  it("rejects expired tokens", () => {
    const email = "admin@scalingup.com";
    const passwordHash = "$2a$10$examplehashvalue";
    const token = generatePasswordResetToken(email, passwordHash, -1);

    expect(verifyPasswordResetToken(token, email, passwordHash)).toBe(false);
  });
});
