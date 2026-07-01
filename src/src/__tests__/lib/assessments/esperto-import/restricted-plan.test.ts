/**
 * Esperto historical import — Wave O RESTRICTED (SU-Full) plan (PURE) unit tests.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4 (restricted shape),
 * §7 (crosswalk lock gate); Wave O per-round SU-Full historical import.
 *
 * buildRestrictedImportPlan is pure (no DB, no React). It takes a BATCH of parsed
 * restricted-individual files (one respondent each) + a resolved SU-Full crosswalk
 * + an explicit target org + roster + the pinned version's questions + the coach
 * round label, and produces a single-campaign / skip / block / warning plan plus a
 * PII-free provenance manifest. These tests lock every behavior in the contract:
 *   - round-label validation (empty / >64 / control chars) → invalid-round-label,
 *   - crosswalk-locked / crosswalk-invalid-for-version / empty-batch / multiple-cids
 *     / duplicate-respondent / unknown-answer-keys blocks,
 *   - unresolved mid → skip; incomplete respondent → skip w/ missingKeys (NOT scored),
 *   - happy path: one campaign, N rows, namespaced externalId, manifest w/ salted
 *     hashes + fingerprint + NO raw PII,
 *   - determinism (same input → same hashes/fingerprint; changed answer → new hash),
 *   - slug collision awareness ("Year 1" vs "year-1" → same slug).
 */

import {
  buildRestrictedImportPlan,
  slugifyRoundLabel,
  computeAnswerHash,
  saltedHash,
  MAX_ROUND_LABEL_LENGTH,
} from "../../../../lib/assessments/esperto-import/restricted-plan";
import type { BuildRestrictedImportPlanInput } from "../../../../lib/assessments/esperto-import/restricted-plan";
import type { Crosswalk, VersionQuestion } from "../../../../lib/assessments/esperto-import/crosswalks";
import type { EspertoRestricted } from "../../../../lib/assessments/esperto-import/types";

// ────────────────────────────────────────────────────────────────────────
// Fixtures — a small, deterministic SU-Full-shaped crosswalk + files
// ────────────────────────────────────────────────────────────────────────

const SALT = "test-fixed-salt-v1";
const TARGET_ORG = "org-sufull-1";
const CID = "cidSUFULL01";

/**
 * A locked SU-Full-style crosswalk: 3 scorable sliders + 1 free-text + 1 number,
 * plus dropped demographic keys. Every mapped stableKey exists in the pinned
 * version below (so the version guard passes). The FTE-ish demographic keys are
 * DROPPED (not mapped), mirroring the conditional-FTE rule.
 */
const lockedCrosswalk: Crosswalk = {
  templateAlias: "scaling-up-full",
  espertoVariant: "ScalingUpAssessment",
  locked: true,
  map: [
    { espertoKey: "Q1_1", stableKey: "SUF_rate_a", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q1_2", stableKey: "SUF_rate_b", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q1_3", stableKey: "SUF_rate_c", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q2", stableKey: "SUF_headcount", ourType: "NUMBER" },
    { espertoKey: "Remarks", stableKey: "SUF_closing", ourType: "TEXT" },
  ],
  droppedKeys: [
    { key: "demo_role", reason: "demographic — not scored" },
    { key: "demo_fte", reason: "FTE demographic — conditional, dropped in this version" },
  ],
};

/** The pinned published version's questions — every mapped stableKey is present. */
const versionQuestions: VersionQuestion[] = [
  { stableKey: "SUF_rate_a", type: "SLIDER_LIKERT", scale: { min: 0, max: 10 } },
  { stableKey: "SUF_rate_b", type: "SLIDER_LIKERT", scale: { min: 0, max: 10 } },
  { stableKey: "SUF_rate_c", type: "SLIDER_LIKERT", scale: { min: 0, max: 10 } },
  { stableKey: "SUF_headcount", type: "NUMBER" },
  { stableKey: "SUF_closing", type: "TEXT" },
];

/** The scorable keys required for a COMPLETE respondent (the 3 sliders + number). */
const SCORABLE = ["SUF_rate_a", "SUF_rate_b", "SUF_rate_c", "SUF_headcount"];

/** Build a complete restricted file for a given mid/reportid/date. */
function completeFile(
  mid: string,
  reportid: string,
  date: string,
  overrides: Partial<Record<string, unknown>> = {},
): EspertoRestricted {
  return {
    reportid,
    date,
    name: "Some Company",
    tags: [],
    mat: "mat-token",
    cid: CID,
    mid,
    raw: {
      Q1_1: 7,
      Q1_2: 5,
      Q1_3: 9,
      Q2: 42,
      Remarks: "closing note",
      demo_role: "CEO",
      demo_fte: "40",
      ...overrides,
    },
    processed: {},
  };
}

/** Three complete files, distinct mids, ascending dates, one cid. */
function threeCompleteFiles(): EspertoRestricted[] {
  return [
    completeFile("MID_A", "rep-A", "2025-03-01T10:00:00-04:00", { Q1_1: 7 }),
    completeFile("MID_B", "rep-B", "2025-03-02T11:00:00-04:00", { Q1_1: 6 }),
    completeFile("MID_C", "rep-C", "2025-03-03T12:00:00-04:00", { Q1_1: 8 }),
  ];
}

/** A roster resolving all three mids. */
function fullRoster(): { id: string; externalId: string | null }[] {
  return [
    { id: "resp-A", externalId: "MID_A" },
    { id: "resp-B", externalId: "MID_B" },
    { id: "resp-C", externalId: "MID_C" },
  ];
}

/** Base input with all valid inputs — override per test. */
function baseInput(
  overrides: Partial<BuildRestrictedImportPlanInput> = {},
): BuildRestrictedImportPlanInput {
  return {
    files: threeCompleteFiles(),
    crosswalk: lockedCrosswalk,
    roundLabel: "2025 Annual",
    targetOrgId: TARGET_ORG,
    respondents: fullRoster(),
    versionQuestions,
    scorableStableKeys: SCORABLE,
    hashSalt: SALT,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────
// slugifyRoundLabel
// ────────────────────────────────────────────────────────────────────────

describe("slugifyRoundLabel", () => {
  it("slugifies '2025 Annual' → '2025-annual'", () => {
    expect(slugifyRoundLabel("2025 Annual")).toBe("2025-annual");
  });

  it("collapses runs of non-alphanumerics and strips leading/trailing dashes", () => {
    expect(slugifyRoundLabel("  Year //  1!! ")).toBe("year-1");
  });

  it("is collision-aware: 'Year 1' and 'year-1' slugify identically", () => {
    expect(slugifyRoundLabel("Year 1")).toBe("year-1");
    expect(slugifyRoundLabel("year-1")).toBe("year-1");
    expect(slugifyRoundLabel("Year 1")).toBe(slugifyRoundLabel("year-1"));
  });

  it("rejects empty / whitespace-only → null", () => {
    expect(slugifyRoundLabel("")).toBeNull();
    expect(slugifyRoundLabel("   ")).toBeNull();
  });

  it("rejects labels longer than MAX_ROUND_LABEL_LENGTH → null", () => {
    expect(slugifyRoundLabel("x".repeat(MAX_ROUND_LABEL_LENGTH))).not.toBeNull();
    expect(slugifyRoundLabel("x".repeat(MAX_ROUND_LABEL_LENGTH + 1))).toBeNull();
  });

  it("rejects control characters → null", () => {
    expect(slugifyRoundLabel("bad\u0000label")).toBeNull();
    expect(slugifyRoundLabel("tab\tlabel")).toBeNull();
    expect(slugifyRoundLabel("nl\nlabel")).toBeNull();
  });

  it("rejects a label that slugifies to nothing (all punctuation) → null", () => {
    expect(slugifyRoundLabel("!!! --- ///")).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────
// Happy path
// ────────────────────────────────────────────────────────────────────────

describe("buildRestrictedImportPlan — happy path (3 complete resolved respondents)", () => {
  it("builds ONE campaign with 3 rows and the namespaced externalId", () => {
    const plan = buildRestrictedImportPlan(baseInput());

    expect(plan.blocks).toEqual([]);
    expect(plan.skips).toEqual([]);
    expect(plan.campaign).not.toBeNull();

    const c = plan.campaign!;
    expect(c.cid).toBe(CID);
    expect(c.roundLabelSlug).toBe("2025-annual");
    expect(c.externalId).toBe(`esperto:sufull:${CID}:2025-annual`);
    expect(c.name).toContain("scaling-up-full");
    expect(c.name).toContain("2025 Annual");
    expect(c.rows).toHaveLength(3);
  });

  it("sets openAt/closeAt to min/max of included rows' submittedAt", () => {
    const c = buildRestrictedImportPlan(baseInput()).campaign!;
    expect(c.openAt).toBe("2025-03-01T10:00:00-04:00");
    expect(c.closeAt).toBe("2025-03-03T12:00:00-04:00");
    const byMid = new Map(c.rows.map((r) => [r.mid, r]));
    expect(byMid.get("MID_A")!.submittedAt).toBe("2025-03-01T10:00:00-04:00");
    expect(byMid.get("MID_C")!.submittedAt).toBe("2025-03-03T12:00:00-04:00");
  });

  it("resolves each row to its roster respondentId by externalId === mid", () => {
    const c = buildRestrictedImportPlan(baseInput()).campaign!;
    const byMid = new Map(c.rows.map((r) => [r.mid, r]));
    expect(byMid.get("MID_A")!.respondentId).toBe("resp-A");
    expect(byMid.get("MID_B")!.respondentId).toBe("resp-B");
    expect(byMid.get("MID_C")!.respondentId).toBe("resp-C");
  });

  it("flattens answers via the crosswalk map (sliders/number as numbers, text as string; drops demographics)", () => {
    const c = buildRestrictedImportPlan(baseInput()).campaign!;
    const rowA = c.rows.find((r) => r.mid === "MID_A")!;
    const byKey = new Map(rowA.answers.map((a) => [a.stableKey, a.value]));
    expect(byKey.get("SUF_rate_a")).toBe(7);
    expect(byKey.get("SUF_rate_b")).toBe(5);
    expect(byKey.get("SUF_rate_c")).toBe(9);
    expect(byKey.get("SUF_headcount")).toBe(42);
    expect(byKey.get("SUF_closing")).toBe("closing note");
    // Demographic keys are dropped, never mapped into answers.
    expect(byKey.has("demo_role")).toBe(false);
    expect(byKey.has("demo_fte")).toBe(false);
  });

  it("produces a manifest with 3 salted respondent entries + fingerprint", () => {
    const m = buildRestrictedImportPlan(baseInput()).manifest!;
    expect(m).not.toBeNull();
    expect(m.cid).toBe(CID);
    expect(m.roundLabel).toBe("2025 Annual");
    expect(m.roundLabelSlug).toBe("2025-annual");
    expect(m.versionCrosswalkAlias).toBe("scaling-up-full");
    expect(m.respondents).toHaveLength(3);
    expect(m.skippedCount).toBe(0);
    expect(m.batchFingerprint).toMatch(/^[0-9a-f]{64}$/);
    for (const r of m.respondents) {
      expect(r.saltedMidHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.saltedReportIdHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.answerHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("manifest carries NO raw PII (no raw mids or reportids anywhere in its JSON)", () => {
    const plan = buildRestrictedImportPlan(baseInput());
    const json = JSON.stringify(plan.manifest);
    for (const mid of ["MID_A", "MID_B", "MID_C"]) {
      expect(json).not.toContain(mid);
    }
    for (const rid of ["rep-A", "rep-B", "rep-C"]) {
      expect(json).not.toContain(rid);
    }
    // and no raw name/demographics leaked either
    expect(json).not.toContain("Some Company");
    expect(json).not.toContain("mat-token");
  });

  it("row answerHash equals the standalone computeAnswerHash of its answers", () => {
    const c = buildRestrictedImportPlan(baseInput()).campaign!;
    const rowA = c.rows.find((r) => r.mid === "MID_A")!;
    expect(rowA.answerHash).toBe(computeAnswerHash(SALT, rowA.answers));
  });

  it("manifest saltedReportIdHash equals saltedHash(salt, reportid)", () => {
    // We can't read raw reportids from the manifest, but we know the mapping.
    const m = buildRestrictedImportPlan(baseInput()).manifest!;
    const expected = new Set(
      ["rep-A", "rep-B", "rep-C"].map((rid) => saltedHash(SALT, rid)),
    );
    for (const r of m.respondents) {
      expect(expected.has(r.saltedReportIdHash)).toBe(true);
    }
  });

  it("manifest saltedMidHash equals saltedHash(salt, mid), enabling later reconciliation by mid without storing it raw", () => {
    const m = buildRestrictedImportPlan(baseInput()).manifest!;
    const expected = new Set(
      ["MID_A", "MID_B", "MID_C"].map((mid) => saltedHash(SALT, mid)),
    );
    for (const r of m.respondents) {
      expect(expected.has(r.saltedMidHash)).toBe(true);
    }
    // Distinct mids must yield distinct hashes (no collisions across the batch).
    const hashes = new Set(m.respondents.map((r) => r.saltedMidHash));
    expect(hashes.size).toBe(m.respondents.length);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Blocks
// ────────────────────────────────────────────────────────────────────────

describe("buildRestrictedImportPlan — blocks", () => {
  it("blocks invalid-round-label (empty) with null campaign + manifest", () => {
    const plan = buildRestrictedImportPlan(baseInput({ roundLabel: "   " }));
    expect(plan.campaign).toBeNull();
    expect(plan.manifest).toBeNull();
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].reason).toBe("invalid-round-label");
  });

  it("blocks invalid-round-label (>64 chars)", () => {
    const plan = buildRestrictedImportPlan({
      ...baseInput(),
      roundLabel: "y".repeat(MAX_ROUND_LABEL_LENGTH + 1),
    });
    expect(plan.campaign).toBeNull();
    expect(plan.blocks.map((b) => b.reason)).toEqual(["invalid-round-label"]);
  });

  it("blocks invalid-round-label (control chars)", () => {
    const plan = buildRestrictedImportPlan(baseInput({ roundLabel: "bad\u0000round" }));
    expect(plan.campaign).toBeNull();
    expect(plan.blocks.map((b) => b.reason)).toEqual(["invalid-round-label"]);
  });

  it("blocks crosswalk-locked when the crosswalk is not locked (real SU-Full is locked:false)", () => {
    const plan = buildRestrictedImportPlan(
      baseInput({ crosswalk: { ...lockedCrosswalk, locked: false } }),
    );
    expect(plan.campaign).toBeNull();
    expect(plan.manifest).toBeNull();
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].reason).toBe("crosswalk-locked");
  });

  it("blocks crosswalk-invalid-for-version when a mapped stableKey is absent from the pinned version (e.g. unconditional FTE)", () => {
    // A crosswalk that maps an FTE stableKey the pinned version does NOT have.
    const fteCrosswalk: Crosswalk = {
      ...lockedCrosswalk,
      map: [
        ...lockedCrosswalk.map,
        { espertoKey: "demo_fte", stableKey: "SUF_fte_count", ourType: "NUMBER" },
      ],
    };
    const plan = buildRestrictedImportPlan(baseInput({ crosswalk: fteCrosswalk }));
    expect(plan.campaign).toBeNull();
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].reason).toBe("crosswalk-invalid-for-version");
    expect(plan.blocks[0].detail).toContain("SUF_fte_count");
  });

  it("blocks empty-batch when no files are supplied", () => {
    const plan = buildRestrictedImportPlan(baseInput({ files: [] }));
    expect(plan.campaign).toBeNull();
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].reason).toBe("empty-batch");
  });

  it("blocks multiple-cids when files span more than one cid", () => {
    const files = threeCompleteFiles();
    files[2] = { ...files[2], cid: "OTHER_CID" };
    const plan = buildRestrictedImportPlan(baseInput({ files }));
    expect(plan.campaign).toBeNull();
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].reason).toBe("multiple-cids");
    expect(plan.blocks[0].detail).toContain("OTHER_CID");
  });

  it("blocks duplicate-respondent when the same (cid, mid) appears in >1 file (two rounds mixed)", () => {
    const files = [
      completeFile("MID_A", "rep-A1", "2025-03-01T10:00:00-04:00"),
      completeFile("MID_A", "rep-A2", "2026-03-01T10:00:00-04:00"), // same mid, later round
      completeFile("MID_B", "rep-B", "2025-03-02T10:00:00-04:00"),
    ];
    const plan = buildRestrictedImportPlan(baseInput({ files }));
    expect(plan.campaign).toBeNull();
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].reason).toBe("duplicate-respondent");
    // Detail names the SALTED mid hash, never the raw mid, and hints at two rounds.
    expect(plan.blocks[0].detail).toContain(saltedHash(SALT, "MID_A"));
    expect(plan.blocks[0].detail).not.toContain("MID_A");
    expect(plan.blocks[0].detail).toMatch(/round/i);
  });

  it("blocks unknown-answer-keys when a raw key is neither mapped nor dropped", () => {
    const files = threeCompleteFiles();
    files[0] = {
      ...files[0],
      raw: { ...files[0].raw, Q99_mystery: 3 },
    };
    const plan = buildRestrictedImportPlan(baseInput({ files }));
    expect(plan.campaign).toBeNull();
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].reason).toBe("unknown-answer-keys");
    expect(plan.blocks[0].detail).toContain("Q99_mystery");
  });
});

// ────────────────────────────────────────────────────────────────────────
// Skips (non-fatal, per-respondent)
// ────────────────────────────────────────────────────────────────────────

describe("buildRestrictedImportPlan — skips", () => {
  it("skips an unresolved mid (not in roster) — never create, never fail the batch", () => {
    // Roster resolves only A and B.
    const partialRoster = [
      { id: "resp-A", externalId: "MID_A" },
      { id: "resp-B", externalId: "MID_B" },
    ];
    const plan = buildRestrictedImportPlan(baseInput({ respondents: partialRoster }));

    expect(plan.blocks).toEqual([]);
    expect(plan.campaign).not.toBeNull();
    expect(plan.campaign!.rows).toHaveLength(2);
    expect(plan.skips).toContainEqual({
      mid: "MID_C",
      reportid: "rep-C",
      reason: "unresolved-respondent",
    });
    // The skipped respondent is NOT in the manifest respondent list.
    expect(plan.manifest!.respondents).toHaveLength(2);
    expect(plan.manifest!.skippedCount).toBe(1);
  });

  it("skips an incomplete respondent (missing a scorable) with missingKeys, NOT scored", () => {
    const files = threeCompleteFiles();
    // Blank out one scorable slider on MID_B (empty string) + drop the number.
    files[1] = {
      ...files[1],
      raw: { ...files[1].raw, Q1_2: "", Q2: null },
    };
    const plan = buildRestrictedImportPlan(baseInput({ files }));

    expect(plan.blocks).toEqual([]);
    // MID_B skipped; A and C imported.
    expect(plan.campaign!.rows.map((r) => r.mid).sort()).toEqual(["MID_A", "MID_C"]);
    const skip = plan.skips.find((s) => s.mid === "MID_B")!;
    expect(skip.reason).toBe("incomplete-respondent");
    expect(skip.reportid).toBe("rep-B");
    expect(skip.missingKeys!.sort()).toEqual(["SUF_headcount", "SUF_rate_b"]);
    // NO partial-scored row emitted for MID_B.
    expect(plan.campaign!.rows.some((r) => r.mid === "MID_B")).toBe(false);
    expect(plan.manifest!.skippedCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Determinism
// ────────────────────────────────────────────────────────────────────────

describe("buildRestrictedImportPlan — determinism", () => {
  it("same input → identical fingerprint and answer hashes", () => {
    const p1 = buildRestrictedImportPlan(baseInput());
    const p2 = buildRestrictedImportPlan(baseInput());
    expect(p1.manifest!.batchFingerprint).toBe(p2.manifest!.batchFingerprint);
    const h1 = p1.campaign!.rows.map((r) => r.answerHash).sort();
    const h2 = p2.campaign!.rows.map((r) => r.answerHash).sort();
    expect(h1).toEqual(h2);
  });

  it("a changed answer produces a different answerHash and a different fingerprint", () => {
    const base = buildRestrictedImportPlan(baseInput());
    const files = threeCompleteFiles();
    files[0] = { ...files[0], raw: { ...files[0].raw, Q1_1: 3 } }; // was 7
    const changed = buildRestrictedImportPlan(baseInput({ files }));

    const baseA = base.campaign!.rows.find((r) => r.mid === "MID_A")!.answerHash;
    const changedA = changed.campaign!.rows.find((r) => r.mid === "MID_A")!.answerHash;
    expect(changedA).not.toBe(baseA);
    expect(changed.manifest!.batchFingerprint).not.toBe(base.manifest!.batchFingerprint);
  });

  it("computeAnswerHash is order-independent over the answer set", () => {
    const a = [
      { stableKey: "SUF_rate_a", value: 7 },
      { stableKey: "SUF_rate_b", value: 5 },
    ];
    const b = [
      { stableKey: "SUF_rate_b", value: 5 },
      { stableKey: "SUF_rate_a", value: 7 },
    ];
    expect(computeAnswerHash(SALT, a)).toBe(computeAnswerHash(SALT, b));
  });

  it("a different salt changes the hashes (salt is actually used)", () => {
    const answers = [{ stableKey: "SUF_rate_a", value: 7 }];
    expect(computeAnswerHash("salt-one", answers)).not.toBe(
      computeAnswerHash("salt-two", answers),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────
// buildRestrictedImportPlan — strict boundary validation (R2-M4)
// ────────────────────────────────────────────────────────────────────────

describe("buildRestrictedImportPlan — strict field validation (R2-M4)", () => {
  const FIXED_NOW = "2026-07-01T12:00:00.000Z";

  it("blocks invalid-file-fields when a file's cid is empty", () => {
    const files = threeCompleteFiles();
    files[0] = { ...files[0], cid: "" };
    const plan = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    expect(plan.campaign).toBeNull();
    expect(plan.manifest).toBeNull();
    expect(plan.blocks.map((b) => b.reason)).toEqual(["invalid-file-fields"]);
  });

  it("blocks invalid-file-fields when a file's mid is empty", () => {
    const files = threeCompleteFiles();
    files[1] = { ...files[1], mid: "   " };
    const plan = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    expect(plan.blocks.map((b) => b.reason)).toEqual(["invalid-file-fields"]);
  });

  it("blocks invalid-file-fields when a file's reportid is empty", () => {
    const files = threeCompleteFiles();
    files[2] = { ...files[2], reportid: "" };
    const plan = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    expect(plan.blocks.map((b) => b.reason)).toEqual(["invalid-file-fields"]);
  });

  it("blocks invalid-file-fields when cid/mid/reportid contain control characters", () => {
    const files = threeCompleteFiles();
    files[0] = { ...files[0], mid: "MID_A evil" };
    const plan = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    expect(plan.blocks.map((b) => b.reason)).toEqual(["invalid-file-fields"]);
  });

  it("blocks invalid-file-fields when cid/mid/reportid exceed the max token length", () => {
    const files = threeCompleteFiles();
    files[0] = { ...files[0], cid: "x".repeat(129) };
    const plan = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    expect(plan.blocks.map((b) => b.reason)).toEqual(["invalid-file-fields"]);
  });

  it("blocks invalid-file-fields when a file's date is not ISO-parseable", () => {
    const files = threeCompleteFiles();
    files[0] = { ...files[0], date: "not-a-date" };
    const plan = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    expect(plan.blocks.map((b) => b.reason)).toEqual(["invalid-file-fields"]);
  });

  it("blocks invalid-file-fields when a file's date is absurdly old (pre-2000)", () => {
    const files = threeCompleteFiles();
    files[0] = { ...files[0], date: "1970-01-01T00:00:00Z" };
    const plan = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    expect(plan.blocks.map((b) => b.reason)).toEqual(["invalid-file-fields"]);
  });

  it("blocks invalid-file-fields when a file's date is in the future (beyond clock-skew grace)", () => {
    const files = threeCompleteFiles();
    files[0] = { ...files[0], date: "2026-07-05T00:00:00Z" }; // > FIXED_NOW + 1 day
    const plan = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    expect(plan.blocks.map((b) => b.reason)).toEqual(["invalid-file-fields"]);
  });

  it("allows a date within the small clock-skew grace window", () => {
    const files = threeCompleteFiles();
    files[0] = { ...files[0], date: "2026-07-01T18:00:00Z" }; // few hours ahead of FIXED_NOW
    const plan = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    expect(plan.blocks).toEqual([]);
    expect(plan.campaign).not.toBeNull();
  });

  it("does not echo raw cid/mid/reportid/date values into the block detail", () => {
    const files = threeCompleteFiles();
    files[0] = { ...files[0], mid: "SUPER-SECRET-MID-VALUE" };
    const plan = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    expect(plan.blocks.map((b) => b.reason)).toEqual([]);
    // (mid is well-formed here; this test only guards the shape — a real
    // invalid case is asserted not to leak below.)
    files[0] = { ...files[0], mid: "SUPER-SECRET-MID-VALUE " };
    const plan2 = buildRestrictedImportPlan(
      baseInput({ files, nowIso: FIXED_NOW }),
    );
    const detail = plan2.blocks.map((b) => b.detail).join(" ");
    expect(detail).not.toContain("SUPER-SECRET-MID-VALUE");
  });

  it("accepts a valid batch unchanged when nowIso is omitted (defaults to real now)", () => {
    // Sanity: omitting nowIso must not break the happy path (uses real wall-clock).
    const plan = buildRestrictedImportPlan(baseInput());
    expect(plan.blocks).toEqual([]);
    expect(plan.campaign).not.toBeNull();
  });
});
