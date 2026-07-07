/**
 * Wave X (spec 19x, X-3 + X-1) — restricted plan: MULTI_CHOICE index decode
 * (D7), per-instrument externalId prefix (D2), and SU-Full default-path
 * byte-identity.
 *
 * The decode: Esperto emits a MULTI_CHOICE answer as a comma-separated list
 * of 1-BASED indices into the question's option order (LVA Q16a: "15,10,9").
 * The adapter decodes against the pinned version's options; malformed values
 * skip THAT respondent with reason "invalid-multi-choice" (never truncate,
 * never guess), other respondents import normally.
 */
import { buildRestrictedImportPlan } from "@/lib/assessments/esperto-import/restricted-plan";
import type { BuildRestrictedImportPlanInput } from "@/lib/assessments/esperto-import/restricted-plan";
import type { Crosswalk, VersionQuestion } from "@/lib/assessments/esperto-import/crosswalks";
import type { EspertoRestricted } from "@/lib/assessments/esperto-import/types";

const SALT = "test-fixed-salt-v1";
const TARGET_ORG = "org-lva-1";
const CID = "cidLVA01";
const NOW = "2026-07-07T12:00:00Z";

/** LVA-style crosswalk slice: 2 sliders + the MC pick + 2 why-texts. */
const mcCrosswalk: Crosswalk = {
  templateAlias: "leadership-vision-alignment",
  espertoVariant: null,
  locked: true, // unit tests exercise the decode, not the lock gate
  map: [
    { espertoKey: "Q16_1", stableKey: "S3_alpha", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q16_2", stableKey: "S3_beta", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q16a", stableKey: "S4_picks", ourType: "MULTI_CHOICE" },
    { espertoKey: "Q17_1", stableKey: "S5_why_alpha", ourType: "TEXT" },
    { espertoKey: "Q17_2", stableKey: "S5_why_beta", ourType: "TEXT" },
  ],
  droppedKeys: [{ key: "currency", reason: "no platform question" }],
};

const mcVersionQuestions: VersionQuestion[] = [
  { stableKey: "S3_alpha", type: "SLIDER_LIKERT", scale: { min: 1, max: 3 } },
  { stableKey: "S3_beta", type: "SLIDER_LIKERT", scale: { min: 1, max: 3 } },
  {
    stableKey: "S4_picks",
    type: "MULTI_CHOICE",
    options: [{ key: "alpha" }, { key: "beta" }, { key: "gamma" }],
    maxChoices: 2,
  },
  { stableKey: "S5_why_alpha", type: "TEXT" },
  { stableKey: "S5_why_beta", type: "TEXT" },
];

const SCORABLE = ["S3_alpha", "S3_beta"];

function file(mid: string, q16a: unknown, extra: Partial<Record<string, unknown>> = {}): EspertoRestricted {
  return {
    reportid: `rep-${mid}`,
    date: "2025-05-01T10:00:00-04:00",
    name: "Some Co",
    tags: [],
    mat: "mat-lva",
    cid: CID,
    mid,
    raw: { Q16_1: 2, Q16_2: 3, Q16a: q16a, Q17_1: "", Q17_2: "", ...extra },
    processed: {},
  };
}

function input(
  files: EspertoRestricted[],
  overrides: Partial<BuildRestrictedImportPlanInput> = {},
): BuildRestrictedImportPlanInput {
  return {
    files,
    crosswalk: mcCrosswalk,
    roundLabel: "2025 Round",
    targetOrgId: TARGET_ORG,
    respondents: files.map((f) => ({ id: `resp-${f.mid}`, externalId: f.mid })),
    versionQuestions: mcVersionQuestions,
    scorableStableKeys: SCORABLE,
    hashSalt: SALT,
    nowIso: NOW,
    ...overrides,
  };
}

describe("MULTI_CHOICE index decode (D7)", () => {
  it("decodes comma-separated 1-based indices into option keys, preserving the file's pick order", () => {
    const plan = buildRestrictedImportPlan(input([file("M1", "3,1")]));
    expect(plan.blocks).toEqual([]);
    expect(plan.skips).toEqual([]);
    const answers = plan.campaign!.rows[0].answers;
    const mc = answers.find((a) => a.stableKey === "S4_picks");
    expect(mc?.value).toEqual(["gamma", "alpha"]);
  });

  it("a blank MC value simply omits the key (unanswered)", () => {
    const plan = buildRestrictedImportPlan(input([file("M1", "")]));
    expect(plan.skips).toEqual([]);
    const answers = plan.campaign!.rows[0].answers;
    expect(answers.find((a) => a.stableKey === "S4_picks")).toBeUndefined();
  });

  it.each([
    ["non-integer token", "a,b"],
    ["zero index", "0,1"],
    ["out-of-range index", "4"],
    ["duplicate index", "1,1"],
    ["over maxChoices", "1,2,3"],
  ])("%s → that respondent skips with invalid-multi-choice; others import", (_label, bad) => {
    const plan = buildRestrictedImportPlan(input([file("BAD", bad), file("OK", "2")]));
    expect(plan.blocks).toEqual([]);
    expect(plan.skips).toHaveLength(1);
    expect(plan.skips[0]).toMatchObject({ mid: "BAD", reason: "invalid-multi-choice" });
    expect(typeof plan.skips[0].detail).toBe("string");
    expect(plan.campaign!.rows).toHaveLength(1);
    expect(plan.campaign!.rows[0].mid).toBe("OK");
  });

  it("numeric (non-string) MC raw value decodes as a single index", () => {
    // Esperto could emit a single pick as a bare number.
    const plan = buildRestrictedImportPlan(input([file("M1", 2)]));
    expect(plan.skips).toEqual([]);
    const mc = plan.campaign!.rows[0].answers.find((a) => a.stableKey === "S4_picks");
    expect(mc?.value).toEqual(["beta"]);
  });
});

describe("per-instrument externalId prefix (D2)", () => {
  it("defaults to the SU-Full prefix when no instrument is passed (Wave O byte-identity)", () => {
    const plan = buildRestrictedImportPlan(input([file("M1", "1")]));
    expect(plan.campaign!.externalId).toBe(`esperto:sufull:${CID}:2025-round`);
  });

  it("uses the passed instrument's prefix", () => {
    const plan = buildRestrictedImportPlan(
      input([file("M1", "1")], { instrument: { externalIdPrefix: "esperto:lva" } }),
    );
    expect(plan.campaign!.externalId).toBe(`esperto:lva:${CID}:2025-round`);
  });
});

describe("PII: the export `name` field never reaches the plan output", () => {
  it("no plan structure (campaign/rows/manifest/skips/warnings) carries the respondent/company name", () => {
    const f = file("M1", "1");
    f.name = "SENSITIVE-PERSON-NAME";
    const plan = buildRestrictedImportPlan(input([f]));
    expect(JSON.stringify(plan)).not.toContain("SENSITIVE-PERSON-NAME");
  });
});
