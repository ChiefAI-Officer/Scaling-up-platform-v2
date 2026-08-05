/**
 * Wave P (Jeff item #5) — respondent display-name fallback helpers.
 *
 * respondentDisplayName: joins first+last, trims; falls back to the trimmed
 * EMAIL when the name is blank (never a generic like "a responder"); "" when
 * both blank. CRITICAL: trims BEFORE truthiness — the OrgRespondent path can
 * produce " " (a truthy single space) from two empty name fields.
 *
 * greetingName: first whitespace token for respondent-facing greetings
 * ("Dear …", "Keep scaling, …"); degrades to "there" when blank OR when the
 * value contains "@" — an email address must never appear as a greeting.
 */

import {
  respondentDisplayName,
  greetingName,
  respondentNameMatchesEmail,
} from "@/lib/assessments/respondent-display-name";

describe("respondentDisplayName", () => {
  it("returns the joined first+last name when present", () => {
    expect(respondentDisplayName("Jane", "Doe", "jane@example.com")).toBe(
      "Jane Doe",
    );
  });

  it("falls back to the email when both name parts are blank", () => {
    expect(respondentDisplayName("", "", "jane@example.com")).toBe(
      "jane@example.com",
    );
  });

  it("falls back to the email when name parts are null/undefined", () => {
    expect(respondentDisplayName(null, undefined, "jane@example.com")).toBe(
      "jane@example.com",
    );
  });

  it("falls back to the email when the joined name is whitespace-only (the truthy-single-space trap)", () => {
    // Two empty parts joined with " " produce " " — trim BEFORE truthiness.
    expect(respondentDisplayName("", "", "jane@example.com")).toBe(
      "jane@example.com",
    );
    expect(respondentDisplayName("  ", "  ", "jane@example.com")).toBe(
      "jane@example.com",
    );
  });

  it("uses a single non-blank name part without stray spaces", () => {
    expect(respondentDisplayName("Jane", "", "jane@example.com")).toBe("Jane");
    expect(respondentDisplayName("", "Doe", "jane@example.com")).toBe("Doe");
  });

  it("trims extra spaces inside the parts", () => {
    expect(respondentDisplayName(" Jane ", " Doe ", "jane@example.com")).toBe(
      "Jane Doe",
    );
  });

  it("trims the email fallback", () => {
    expect(respondentDisplayName("", "", "  jane@example.com  ")).toBe(
      "jane@example.com",
    );
  });

  it("returns '' when name AND email are all blank/nullish", () => {
    expect(respondentDisplayName("", "", "")).toBe("");
    expect(respondentDisplayName(null, null, null)).toBe("");
    expect(respondentDisplayName(undefined, undefined, undefined)).toBe("");
    expect(respondentDisplayName(" ", " ", "  ")).toBe("");
  });
});

describe("greetingName", () => {
  it("returns the first whitespace token of a normal name", () => {
    expect(greetingName("Jane Doe")).toBe("Jane");
  });

  it("returns a single-token name as itself", () => {
    expect(greetingName("Jane")).toBe("Jane");
  });

  it("trims before tokenizing", () => {
    expect(greetingName("  Jane   Doe  ")).toBe("Jane");
  });

  it("returns 'there' for blank/nullish input", () => {
    expect(greetingName("")).toBe("there");
    expect(greetingName("   ")).toBe("there");
    expect(greetingName(null)).toBe("there");
    expect(greetingName(undefined)).toBe("there");
  });

  it("returns 'there' when the value contains '@' (email must never be a greeting)", () => {
    expect(greetingName("jane@example.com")).toBe("there");
    expect(greetingName("  jane@example.com  ")).toBe("there");
  });
});

describe("respondentNameMatchesEmail", () => {
  it("matches the normalized email fallback without matching blanks", () => {
    expect(
      respondentNameMatchesEmail(
        "  JANE@EXAMPLE.COM ",
        "jane@example.com",
      ),
    ).toBe(true);
    expect(respondentNameMatchesEmail("Jane Doe", "jane@example.com")).toBe(
      false,
    );
    expect(respondentNameMatchesEmail("", "")).toBe(false);
    expect(respondentNameMatchesEmail(null, null)).toBe(false);
  });
});
