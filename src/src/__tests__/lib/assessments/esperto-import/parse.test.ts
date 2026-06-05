/**
 * Esperto historical import — parse/classify layer unit tests.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §12.
 *
 * Drives the four sanitized fixtures (structure byte-identical to the real
 * Esperto exports; identity faked) through classifyEspertoExport +
 * parseEspertoExport, and asserts malformed input throws EspertoParseError.
 *
 * The fixtures are loaded as RAW JSON (readFileSync + JSON.parse) so the parser
 * receives plain `unknown` — the realistic uploaded-file input path.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { classifyEspertoExport, EspertoParseError } from "../../../../lib/assessments/esperto-import/classify";
import { parseEspertoExport } from "../../../../lib/assessments/esperto-import/parse";

const FIX_DIR = join(__dirname, "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIX_DIR, name), "utf8"));
}

const members = loadFixture("members.json");
const report = loadFixture("report-qsp-v2.json");
const restrictedIndividual = loadFixture("restricted-individual.json");
const restrictedAggregate = loadFixture("restricted-aggregate.json");

describe("classifyEspertoExport", () => {
  it("classifies the members fixture", () => {
    expect(classifyEspertoExport(members)).toBe("members");
  });

  it("classifies the report (QSP v2) fixture", () => {
    expect(classifyEspertoExport(report)).toBe("report");
  });

  it("classifies the restricted-individual fixture (no group* keys)", () => {
    expect(classifyEspertoExport(restrictedIndividual)).toBe(
      "restricted-individual",
    );
  });

  it("classifies the restricted-aggregate fixture (≥1 group* key)", () => {
    expect(classifyEspertoExport(restrictedAggregate)).toBe(
      "restricted-aggregate",
    );
  });

  it("distinguishes aggregate from individual purely on group* keys", () => {
    // Same object shape; only the processed block's group* keys differ.
    const indProcessed = (restrictedIndividual as { processed: object })
      .processed;
    const aggProcessed = (restrictedAggregate as { processed: object })
      .processed;
    expect(
      Object.keys(indProcessed).some((k) => k.startsWith("group")),
    ).toBe(false);
    expect(
      Object.keys(aggProcessed).some((k) => k.startsWith("group")),
    ).toBe(true);
  });
});

describe("parseEspertoExport — happy paths", () => {
  it("parses members into { kind: 'members', data } with 3 rows", () => {
    const parsed = parseEspertoExport(members);
    expect(parsed.kind).toBe("members");
    if (parsed.kind !== "members") throw new Error("narrowing");
    expect(parsed.data).toHaveLength(3);
    expect(parsed.data[0]).toMatchObject({
      memberid: expect.any(String),
      email: expect.any(String),
      level: expect.any(String),
      testuser: expect.any(Boolean),
    });
    // Identity is faked but structure intact.
    expect(parsed.data[0].email).toBe("ceo@example.com");
    expect(parsed.data.map((m) => m.email).sort()).toEqual([
      "ceo@example.com",
      "cfo@example.com",
      "svc@example.com",
    ]);
  });

  it("parses report into { kind: 'report', data } with 3 personal rows", () => {
    const parsed = parseEspertoExport(report);
    expect(parsed.kind).toBe("report");
    if (parsed.kind !== "report") throw new Error("narrowing");
    expect(parsed.data.personal).toHaveLength(3);
    const row0 = parsed.data.personal[0];
    expect(row0.variant).toBe("QuartSessPrepv2");
    expect(row0.campaignid).toBe("BDvhuDORxZ");
    // memberid present + dynamic raw_ answer keys survive passthrough.
    expect(typeof row0.memberid).toBe("string");
    expect(row0).toHaveProperty("raw_Q1");
    expect(typeof row0.raw_Q1).toBe("number");
    expect(row0).toHaveProperty("raw_Q2");
    expect(typeof row0.raw_Q2).toBe("string");
  });

  it("report memberids join the members roster", () => {
    const m = parseEspertoExport(members);
    const r = parseEspertoExport(report);
    if (m.kind !== "members" || r.kind !== "report") throw new Error("narrow");
    const rosterIds = new Set(m.data.map((x) => x.memberid));
    const reportIds = r.data.personal.map((x) => x.memberid);
    // Every report row's memberid resolves to a roster member.
    for (const id of reportIds) {
      expect(rosterIds.has(id)).toBe(true);
    }
    // And at least one specific known join survives sanitization.
    expect(rosterIds.has("mWSw2H9f6E")).toBe(true);
  });

  it("preserves an optional specialparticipant on a report row", () => {
    const r = parseEspertoExport(report);
    if (r.kind !== "report") throw new Error("narrow");
    const withSpecial = r.data.personal.find(
      (row) => row.specialparticipant !== undefined,
    );
    expect(withSpecial?.specialparticipant).toBe("role=buyer");
  });

  it("parses restricted-individual with mid present and no group* keys", () => {
    const parsed = parseEspertoExport(restrictedIndividual);
    expect(parsed.kind).toBe("restricted-individual");
    if (parsed.kind !== "restricted-individual") throw new Error("narrow");
    expect(parsed.data.mid).toBe("mWSw2H9f6E");
    expect(typeof parsed.data.mat).toBe("string"); // token, not null
    expect(parsed.data.raw).toHaveProperty("Q4_1");
    expect(
      Object.keys(parsed.data.processed).some((k) => k.startsWith("group")),
    ).toBe(false);
  });

  it("parses restricted-aggregate (mat null, group* keys present)", () => {
    const parsed = parseEspertoExport(restrictedAggregate);
    expect(parsed.kind).toBe("restricted-aggregate");
    if (parsed.kind !== "restricted-aggregate") throw new Error("narrow");
    expect(parsed.data.mat).toBeNull();
    expect(parsed.data.mid).toBe("mWSw2H9f6E");
    expect(
      Object.keys(parsed.data.processed).some((k) => k.startsWith("group")),
    ).toBe(true);
  });
});

describe("parseEspertoExport — malformed input throws EspertoParseError", () => {
  it("throws on an empty object", () => {
    expect(() => parseEspertoExport({})).toThrow(EspertoParseError);
  });

  it("throws on an empty array", () => {
    expect(() => parseEspertoExport([])).toThrow(EspertoParseError);
  });

  it("throws on an array of the wrong shape", () => {
    expect(() => parseEspertoExport([{ foo: "bar" }])).toThrow(
      EspertoParseError,
    );
  });

  it("throws on null", () => {
    expect(() => parseEspertoExport(null)).toThrow(EspertoParseError);
  });

  it("throws on a primitive", () => {
    expect(() => parseEspertoExport(42)).toThrow(EspertoParseError);
    expect(() => parseEspertoExport("nope")).toThrow(EspertoParseError);
  });

  it("throws on a report whose personal rows lack variant/campaignid", () => {
    expect(() =>
      parseEspertoExport({ personal: [{ reportid: "x" }], summary: [] }),
    ).toThrow(EspertoParseError);
  });

  it("carries a typed reason + details on the thrown error", () => {
    try {
      parseEspertoExport({});
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EspertoParseError);
      const err = e as EspertoParseError;
      expect(typeof err.reason).toBe("string");
      expect(err.reason).toBe("unrecognized export shape");
      expect(err.details).toBeDefined();
    }
  });

  it("surfaces a validation reason when classify passes but zod fails", () => {
    // Looks like a members export to the classifier (array, has the 3 probe
    // keys) but a member field has the wrong type → zod validation failure.
    const badMembers = [
      { memberid: "x", email: "a@b.c", level: "lead", testuser: "nope" },
    ];
    try {
      parseEspertoExport(badMembers);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EspertoParseError);
      expect((e as EspertoParseError).reason).toBe("members validation failed");
    }
  });
});

describe("passthrough tolerance — unknown top-level metadata is kept, not rejected", () => {
  it("tolerates an unknown extra key on a report export", () => {
    const r = parseEspertoExport(report);
    if (r.kind !== "report") throw new Error("narrow");
    const withMeta = {
      ...(report as object),
      __espertoExportVersion: "v9.9-future",
    };
    const parsed = parseEspertoExport(withMeta);
    expect(parsed.kind).toBe("report");
    // The unknown key survives validation (passthrough).
    expect(
      (parsed.data as unknown as Record<string, unknown>)
        .__espertoExportVersion,
    ).toBe("v9.9-future");
  });

  it("tolerates an unknown extra key on a member row", () => {
    const m = members as Array<Record<string, unknown>>;
    const withMeta = [
      { ...m[0], __futureFlag: true },
      ...m.slice(1),
    ];
    const parsed = parseEspertoExport(withMeta);
    expect(parsed.kind).toBe("members");
    if (parsed.kind !== "members") throw new Error("narrow");
    expect(
      (parsed.data[0] as unknown as Record<string, unknown>).__futureFlag,
    ).toBe(true);
  });

  it("tolerates an unknown extra key on a restricted export", () => {
    const withMeta = {
      ...(restrictedIndividual as object),
      __extra: { nested: 1 },
    };
    const parsed = parseEspertoExport(withMeta);
    expect(parsed.kind).toBe("restricted-individual");
    expect(
      (parsed.data as unknown as Record<string, unknown>).__extra,
    ).toEqual({ nested: 1 });
  });
});
