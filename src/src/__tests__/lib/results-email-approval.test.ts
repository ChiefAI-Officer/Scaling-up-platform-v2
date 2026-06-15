/**
 * Assessment v7.6 (Wave D, SEC-H2) — results-email approval hash helper tests.
 *
 * The F0 "Results Email" approval is bound to a sha256 hash of the exact
 * approved (subject + body) content. A stale approval (hash no longer matches
 * the current content) MUST read as NOT approved.
 */

import {
  resultsEmailContentHash,
  isResultsEmailApproved,
} from "@/lib/assessments/results-email-approval";

describe("resultsEmailContentHash", () => {
  it("returns a 64-char hex sha256 string", () => {
    expect(resultsEmailContentHash("Subject", "Body")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same inputs", () => {
    expect(resultsEmailContentHash("Subject", "Body")).toBe(
      resultsEmailContentHash("Subject", "Body"),
    );
  });

  it("changes when the subject changes", () => {
    expect(resultsEmailContentHash("A", "Body")).not.toBe(
      resultsEmailContentHash("B", "Body"),
    );
  });

  it("changes when the body changes", () => {
    expect(resultsEmailContentHash("Subject", "X")).not.toBe(
      resultsEmailContentHash("Subject", "Y"),
    );
  });

  it("treats null subject/body as empty strings (stable)", () => {
    expect(resultsEmailContentHash(null, null)).toBe(
      resultsEmailContentHash("", ""),
    );
  });

  it("does not collide across the subject/body boundary", () => {
    // ["ab", ""] must NOT hash the same as ["a", "b"].
    expect(resultsEmailContentHash("ab", "")).not.toBe(
      resultsEmailContentHash("a", "b"),
    );
  });
});

describe("isResultsEmailApproved", () => {
  const subject = "Your results";
  const body = "Here is your report.";
  const matchingHash = resultsEmailContentHash(subject, body);

  it("true only when approved AND hash matches current content", () => {
    expect(
      isResultsEmailApproved({
        resultsEmailContentApproved: true,
        resultsEmailContentApprovedHash: matchingHash,
        resultsEmailSubject: subject,
        resultsEmailBodyMarkdown: body,
      }),
    ).toBe(true);
  });

  it("false when the boolean flag is off (even if the hash matches)", () => {
    expect(
      isResultsEmailApproved({
        resultsEmailContentApproved: false,
        resultsEmailContentApprovedHash: matchingHash,
        resultsEmailSubject: subject,
        resultsEmailBodyMarkdown: body,
      }),
    ).toBe(false);
  });

  it("false when the stored hash is null", () => {
    expect(
      isResultsEmailApproved({
        resultsEmailContentApproved: true,
        resultsEmailContentApprovedHash: null,
        resultsEmailSubject: subject,
        resultsEmailBodyMarkdown: body,
      }),
    ).toBe(false);
  });

  it("false when the content was edited after approval (hash mismatch)", () => {
    expect(
      isResultsEmailApproved({
        resultsEmailContentApproved: true,
        resultsEmailContentApprovedHash: matchingHash,
        resultsEmailSubject: subject,
        resultsEmailBodyMarkdown: "EDITED body after approval",
      }),
    ).toBe(false);
  });
});
