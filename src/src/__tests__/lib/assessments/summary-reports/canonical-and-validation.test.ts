import {
  SnapshotCanonicalizationError,
  canonicalJson,
  sha256Hex,
} from "@/lib/assessments/summary-reports/canonical";
import { SUMMARY_REPORT_REGISTRY } from "@/lib/assessments/summary-reports/registry";
import type { SelectedSummarySource } from "@/lib/assessments/summary-reports/canonical";
import { validateComposition } from "@/lib/assessments/summary-reports/validation";

const scalingCeoFull = SUMMARY_REPORT_REGISTRY[0];

function source(
  submissionId: string,
  role: SelectedSummarySource["role"],
  position: number,
): SelectedSummarySource {
  return { submissionId, sourceCampaignId: "campaign-1", role, position };
}

describe("canonicalJson", () => {
  it("sorts plain-object keys recursively while preserving array order", () => {
    expect(canonicalJson({ z: [{ b: 2, a: 1 }, "second", "first"], a: true })).toBe(
      '{"a":true,"z":[{"a":1,"b":2},"second","first"]}',
    );
  });

  it.each([
    undefined,
    new Date("2026-08-27T00:00:00.000Z"),
    1n,
    () => undefined,
    Symbol("snapshot"),
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects unsupported snapshot value %#", (value) => {
    expect(() => canonicalJson(value)).toThrow(SnapshotCanonicalizationError);
  });

  it("rejects cyclic objects deterministically", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    expect(() => canonicalJson(cyclic)).toThrow("Cannot canonicalize cyclic object");
  });

  it("rejects sparse arrays instead of serializing holes", () => {
    expect(() => canonicalJson(new Array(1))).toThrow(SnapshotCanonicalizationError);
  });

  it("rejects arrays with symbol keys", () => {
    const array = ["source"] as string[] & { [key: symbol]: string };
    array[Symbol("source")] = "hidden";

    expect(() => canonicalJson(array)).toThrow(SnapshotCanonicalizationError);
  });
});

describe("sha256Hex", () => {
  it("is stable for strings and UTF-8 bytes", () => {
    const expected = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    expect(sha256Hex("test")).toBe(expected);
    expect(sha256Hex(new Uint8Array([116, 101, 115, 116]))).toBe(expected);
  });
});

describe("validateComposition", () => {
  it("returns all safe errors for duplicate submissions, a missing CEO, and invalid Team positions", () => {
    const result = validateComposition(scalingCeoFull, [
      source("submission-1", "TEAM", 0),
      source("submission-1", "TEAM", 2),
    ]);

    expect(result).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_submission", submissionId: "submission-1" }),
        expect.objectContaining({ code: "role_minimum", message: expect.stringContaining("CEO") }),
        expect.objectContaining({ code: "invalid_role_positions", message: expect.stringContaining("TEAM") }),
      ]),
    });
  });

  it("rejects a duplicated CEO", () => {
    const result = validateComposition(scalingCeoFull, [
      source("ceo-1", "CEO", 0),
      source("ceo-2", "CEO", 1),
    ]);

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ code: "role_maximum", message: expect.stringContaining("CEO") })],
    });
  });

  it("rejects duplicate Team positions", () => {
    const result = validateComposition(scalingCeoFull, [
      source("ceo-1", "CEO", 0),
      source("team-1", "TEAM", 0),
      source("team-2", "TEAM", 0),
    ]);

    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({ code: "invalid_role_positions", message: expect.stringContaining("TEAM") }),
      ],
    });
  });

  it("accepts a CEO at position zero and sequential Team positions within their roles", () => {
    expect(
      validateComposition(scalingCeoFull, [
        source("ceo-1", "CEO", 0),
        source("team-1", "TEAM", 0),
        source("team-2", "TEAM", 1),
      ]),
    ).toEqual({ ok: true });
  });
});
