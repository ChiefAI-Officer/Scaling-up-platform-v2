import {
  DEFAULT_INVITATION_BODY,
  DEFAULT_INVITATION_SUBJECT,
  DEFAULT_INVITATION_VERSION,
} from "@/lib/assessments/invitation-defaults";

describe("invitation defaults", () => {
  describe("DEFAULT_INVITATION_BODY", () => {
    it("is a non-empty string", () => {
      expect(typeof DEFAULT_INVITATION_BODY).toBe("string");
      expect(DEFAULT_INVITATION_BODY.length).toBeGreaterThan(0);
    });

    it.each([
      "{{respondentFirstName}}",
      "{{templateName}}",
      "{{organizationName}}",
    ])("contains the token %s", (token) => {
      expect(DEFAULT_INVITATION_BODY).toContain(token);
    });

    it("embeds no CTA link of its own (no markdown link syntax, no raw URL)", () => {
      expect(DEFAULT_INVITATION_BODY).not.toContain("](");
      expect(DEFAULT_INVITATION_BODY).not.toMatch(/http/i);
    });
  });

  describe("DEFAULT_INVITATION_SUBJECT", () => {
    it("is a non-empty string", () => {
      expect(typeof DEFAULT_INVITATION_SUBJECT).toBe("string");
      expect(DEFAULT_INVITATION_SUBJECT.length).toBeGreaterThan(0);
    });

    it("is static (contains no token)", () => {
      expect(DEFAULT_INVITATION_SUBJECT).not.toContain("{{");
    });
  });

  describe("DEFAULT_INVITATION_VERSION", () => {
    it("is a non-empty string", () => {
      expect(typeof DEFAULT_INVITATION_VERSION).toBe("string");
      expect(DEFAULT_INVITATION_VERSION.length).toBeGreaterThan(0);
    });
  });
});
