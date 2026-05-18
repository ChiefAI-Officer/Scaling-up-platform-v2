/**
 * Assessment v7.6 — invitation-tokens helpers.
 */

import {
  generateRawToken,
  hashToken,
  timingSafeMatch,
} from "@/lib/assessments/invitation-tokens";

describe("generateRawToken", () => {
  it("emits a base64url string with no padding or unsafe chars", () => {
    const t = generateRawToken();
    expect(typeof t).toBe("string");
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces unique values across calls", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toBe(b);
  });
});

describe("hashToken", () => {
  it("returns the SHA-256 hex digest of the input", () => {
    // Known vector: sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(hashToken("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("is deterministic", () => {
    const t = "abc123";
    expect(hashToken(t)).toBe(hashToken(t));
  });

  it("produces 64-char hex output", () => {
    const t = generateRawToken();
    const h = hashToken(t);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("timingSafeMatch", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeMatch("abc", "abc")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(timingSafeMatch("abc", "abd")).toBe(false);
  });

  it("returns false for strings of differing length without throwing", () => {
    expect(timingSafeMatch("abc", "abcd")).toBe(false);
    expect(timingSafeMatch("", "x")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeMatch("", "")).toBe(true);
  });
});
