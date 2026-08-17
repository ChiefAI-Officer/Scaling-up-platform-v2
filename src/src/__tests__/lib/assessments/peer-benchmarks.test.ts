/**
 * Wave S — peer-benchmarks lib (spec 19s S-3 + S-5).
 *
 * Covers:
 *  - Separate editor/render alias gates: SU-Full can be configured before its
 *    paired-bar report UI is released, while LVA remains fully render-enabled.
 *  - listRatingQuestionKeys (SLIDER_LIKERT filter, version order, LVA report
 *    label overrides, malformed-input safety)
 *  - reconcileQuestionBenchmarks (atomic full-set reconcile, D14 + C3:
 *    batch replace/create, unchanged rows untouched, typed validation errors,
 *    1dp rounding, single transaction)
 *  - buildPeerComparisonSection (pure individual-report builder: 1/2/3 →
 *    0/5/10, omit rules, string-number coercion, null on empty, dev
 *    sign/rounding, label overrides, insertion order)
 */
import { LVA_TEMPLATE_ALIAS } from "@/lib/assessments/lva-report-display";
import {
  PEER_EDITOR_ENABLED_ALIASES,
  PEER_RENDER_ENABLED_ALIASES,
  isPeerEditorEnabledAlias,
  isPeerRenderEnabledAlias,
  listRatingQuestionKeys,
  getQuestionBenchmarks,
  reconcileQuestionBenchmarks,
  buildPeerComparisonSection,
  PeerBenchmarkValidationError,
  MAX_BENCHMARK_ENTRIES,
  PEER_COMPARISON_TITLE,
  PEER_COMPARISON_INTRO,
  type PeerBenchmarksDb,
  type PeerBenchmarksTx,
  type QuestionBenchmarkRow,
} from "@/lib/assessments/peer-benchmarks";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Version-shaped question rows (the published version's `questions` Json). */
const VERSION_QUESTIONS = [
  {
    stableKey: "S1_revenue",
    type: "NUMBER",
    label: "Revenue (in million)",
    sectionStableKey: "S1_financials",
  },
  {
    stableKey: "S3_recruitment",
    type: "SLIDER_LIKERT",
    label: "Recruitment of new employees",
    sectionStableKey: "S3_strengths",
  },
  {
    stableKey: "S3_market",
    type: "SLIDER_LIKERT",
    label: "The market",
    sectionStableKey: "S3_strengths",
  },
  {
    stableKey: "S3_leadership_team",
    type: "SLIDER_LIKERT",
    label: "Leadership Team",
    sectionStableKey: "S3_strengths",
  },
  {
    stableKey: "S2_products",
    type: "TEXT",
    label: "Main products in three years?",
    sectionStableKey: "S2_vision",
  },
];

/** QMeta-shaped questionsByKey (insertion order = version order). */
function lvaQuestionsByKey(): Record<string, unknown> {
  return {
    S1_revenue: {
      type: "NUMBER",
      label: "Revenue (in million)",
      sectionStableKey: "S1_financials",
    },
    S3_recruitment: {
      type: "SLIDER_LIKERT",
      label: "Recruitment of new employees",
      sectionStableKey: "S3_strengths",
      min: 1,
      max: 3,
    },
    S3_market: {
      type: "SLIDER_LIKERT",
      label: "The market",
      sectionStableKey: "S3_strengths",
      min: 1,
      max: 3,
    },
    S3_leadership_team: {
      type: "SLIDER_LIKERT",
      label: "Leadership Team",
      sectionStableKey: "S3_strengths",
      min: 1,
      max: 3,
    },
    // Slider OUTSIDE S3 — must never appear in the peers section.
    P1_q1: {
      type: "SLIDER_LIKERT",
      label: "A non-S3 slider",
      sectionStableKey: "P1_retrospective",
      min: 1,
      max: 10,
    },
    // Non-slider INSIDE S3 (defensive) — must never appear either.
    S3_note: {
      type: "TEXT",
      label: "A stray text question",
      sectionStableKey: "S3_strengths",
    },
  };
}

function answers(rows: Array<{ stableKey: string; value: unknown }>): unknown {
  return rows;
}

function bench(entries: Array<[string, number]>): Map<string, number> {
  return new Map(entries);
}

// Mock db: $transaction invokes the callback with a spied tx client.
function makeDb(existing: QuestionBenchmarkRow[]) {
  const tx = {
    assessmentBenchmark: {
      findMany: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const db = {
    $transaction: jest.fn(
      async <T>(fn: (t: PeerBenchmarksTx) => Promise<T>): Promise<T> =>
        fn(tx as unknown as PeerBenchmarksTx),
    ),
  };
  return { db: db as unknown as PeerBenchmarksDb, dbSpy: db, tx };
}

const VALID_KEYS: ReadonlySet<string> = new Set([
  "S3_recruitment",
  "S3_market",
  "S3_leadership_team",
]);

// ─────────────────────────────────────────────────────────────────────────────
// PEER_RENDER_ENABLED_ALIASES / isPeerRenderEnabledAlias
// ─────────────────────────────────────────────────────────────────────────────

describe("PEER_RENDER_ENABLED_ALIASES", () => {
  it("keeps report rendering limited to LVA", () => {
    expect(PEER_RENDER_ENABLED_ALIASES).toEqual([LVA_TEMPLATE_ALIAS]);
  });
});

describe("PEER_EDITOR_ENABLED_ALIASES", () => {
  it("allows LVA and Scaling Up Full values to be administered", () => {
    expect(PEER_EDITOR_ENABLED_ALIASES).toEqual([
      LVA_TEMPLATE_ALIAS,
      "scaling-up-full",
    ]);
  });
});

describe("isPeerEditorEnabledAlias", () => {
  it.each([LVA_TEMPLATE_ALIAS, "scaling-up-full"])(
    "is true for editor-enabled alias %j",
    (alias) => {
      expect(isPeerEditorEnabledAlias(alias)).toBe(true);
    },
  );

  it.each(["qsp-v1", "", null, undefined])(
    "is false for non-enabled alias %j",
    (alias) => {
      expect(isPeerEditorEnabledAlias(alias)).toBe(false);
    },
  );
});

describe("isPeerRenderEnabledAlias", () => {
  it("is true for the LVA alias", () => {
    expect(isPeerRenderEnabledAlias(LVA_TEMPLATE_ALIAS)).toBe(true);
  });

  it.each(["qsp-v1", "scaling-up-full", ""])(
    "is false for non-enabled alias %j",
    (alias) => {
      expect(isPeerRenderEnabledAlias(alias)).toBe(false);
    },
  );

  it("is false for null / undefined", () => {
    expect(isPeerRenderEnabledAlias(null)).toBe(false);
    expect(isPeerRenderEnabledAlias(undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listRatingQuestionKeys
// ─────────────────────────────────────────────────────────────────────────────

describe("listRatingQuestionKeys", () => {
  it("returns only SLIDER_LIKERT questions, in version order", () => {
    const out = listRatingQuestionKeys(VERSION_QUESTIONS);
    expect(out.map((q) => q.stableKey)).toEqual([
      "S3_recruitment",
      "S3_market",
      "S3_leadership_team",
    ]);
  });

  it("uses survey labels when no alias is given", () => {
    const out = listRatingQuestionKeys(VERSION_QUESTIONS);
    expect(out[0]).toEqual({
      stableKey: "S3_recruitment",
      label: "Recruitment of new employees",
    });
  });

  it("applies LVA report factor-label overrides for the LVA alias", () => {
    const out = listRatingQuestionKeys(VERSION_QUESTIONS, LVA_TEMPLATE_ALIAS);
    expect(out.map((q) => q.label)).toEqual([
      "Recruitment of new staff", // override
      "The market", // no override → survey label
      "Leadership team", // override
    ]);
  });

  it("does NOT apply LVA overrides for a different alias", () => {
    const out = listRatingQuestionKeys(VERSION_QUESTIONS, "qsp-v2");
    expect(out[0].label).toBe("Recruitment of new employees");
  });

  it("strips the legacy '(with 1 decimal)' suffix like the report does", () => {
    const out = listRatingQuestionKeys([
      {
        stableKey: "P1_q1",
        type: "SLIDER_LIKERT",
        label: "Rate the quarter (with 1 decimal)",
      },
    ]);
    expect(out[0].label).toBe("Rate the quarter");
  });

  it("returns [] for non-array input and never throws", () => {
    expect(listRatingQuestionKeys(null)).toEqual([]);
    expect(listRatingQuestionKeys(undefined)).toEqual([]);
    expect(listRatingQuestionKeys("nope")).toEqual([]);
    expect(listRatingQuestionKeys({ questions: [] })).toEqual([]);
    expect(listRatingQuestionKeys(42)).toEqual([]);
  });

  it("skips malformed entries without throwing", () => {
    const out = listRatingQuestionKeys([
      null,
      "just-a-string",
      42,
      {}, // no stableKey
      { stableKey: 7, type: "SLIDER_LIKERT", label: "bad key" },
      { stableKey: "", type: "SLIDER_LIKERT", label: "empty key" },
      { stableKey: "S3_ok", type: "SLIDER_LIKERT", label: "Good" },
      { stableKey: "S3_no_type", label: "missing type" },
    ]);
    expect(out).toEqual([{ stableKey: "S3_ok", label: "Good" }]);
  });

  it("falls back to the stableKey when a label is missing or blank", () => {
    const out = listRatingQuestionKeys([
      { stableKey: "S3_a", type: "SLIDER_LIKERT" },
      { stableKey: "S3_b", type: "SLIDER_LIKERT", label: "   " },
    ]);
    expect(out).toEqual([
      { stableKey: "S3_a", label: "S3_a" },
      { stableKey: "S3_b", label: "S3_b" },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getQuestionBenchmarks
// ─────────────────────────────────────────────────────────────────────────────

describe("getQuestionBenchmarks", () => {
  it("returns a stableKey → value map of QUESTION-kind rows for the template", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: "b1", metricKey: "S3_recruitment", value: 6.3 },
      { id: "b2", metricKey: "S3_market", value: 4 },
    ]);
    const db = { assessmentBenchmark: { findMany } };

    const map = await getQuestionBenchmarks(db, "tpl_1");

    expect(map).toEqual(
      new Map([
        ["S3_recruitment", 6.3],
        ["S3_market", 4],
      ]),
    );
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({
      templateId: "tpl_1",
      metricKind: "QUESTION",
    });
  });

  it("returns an empty map when no rows exist", async () => {
    const db = {
      assessmentBenchmark: { findMany: jest.fn().mockResolvedValue([]) },
    };
    expect(await getQuestionBenchmarks(db, "tpl_1")).toEqual(new Map());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reconcileQuestionBenchmarks
// ─────────────────────────────────────────────────────────────────────────────

describe("reconcileQuestionBenchmarks", () => {
  it("creates rows for new keys (rounded to 1dp)", async () => {
    const { db, dbSpy, tx } = makeDb([]);

    const result = await reconcileQuestionBenchmarks(db, {
      templateId: "tpl_1",
      entries: [{ stableKey: "S3_recruitment", value: 6.25 }],
      validKeys: VALID_KEYS,
    });

    expect(dbSpy.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.assessmentBenchmark.createMany).toHaveBeenCalledTimes(1);
    expect(tx.assessmentBenchmark.createMany).toHaveBeenCalledWith({
      data: [{
        templateId: "tpl_1",
        metricKind: "QUESTION",
        metricKey: "S3_recruitment",
        value: 6.3, // Math.round(6.25 * 10) / 10
      }],
    });
    expect(tx.assessmentBenchmark.update).not.toHaveBeenCalled();
    expect(tx.assessmentBenchmark.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ before: {}, after: { S3_recruitment: 6.3 } });
  });

  it("deletes rows whose key is missing from the submission (blank = pruned)", async () => {
    const { db, tx } = makeDb([
      { id: "b1", metricKey: "S3_recruitment", value: 6.3 },
      { id: "b2", metricKey: "S3_market", value: 4 },
    ]);

    const result = await reconcileQuestionBenchmarks(db, {
      templateId: "tpl_1",
      entries: [{ stableKey: "S3_market", value: 4 }],
      validKeys: VALID_KEYS,
    });

    expect(tx.assessmentBenchmark.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.assessmentBenchmark.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["b1"] } },
    });
    expect(result.before).toEqual({ S3_recruitment: 6.3, S3_market: 4 });
    expect(result.after).toEqual({ S3_market: 4 });
  });

  it("prunes STALE keys (rows no longer in validKeys) when omitted from entries", async () => {
    // A row persisted under a key that has since left the published version:
    // the editor form can no longer submit it, so a full-set save prunes it.
    const { db, tx } = makeDb([
      { id: "stale1", metricKey: "S3_retired_factor", value: 5 },
      { id: "b2", metricKey: "S3_market", value: 4 },
    ]);

    await reconcileQuestionBenchmarks(db, {
      templateId: "tpl_1",
      entries: [{ stableKey: "S3_market", value: 4 }],
      validKeys: VALID_KEYS,
    });

    expect(tx.assessmentBenchmark.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["stale1"] } },
    });
  });

  it("updates only rows whose rounded value changed", async () => {
    const { db, tx } = makeDb([
      { id: "b1", metricKey: "S3_recruitment", value: 6.3 },
      { id: "b2", metricKey: "S3_market", value: 4 },
    ]);

    await reconcileQuestionBenchmarks(db, {
      templateId: "tpl_1",
      entries: [
        { stableKey: "S3_recruitment", value: 7.1 },
        { stableKey: "S3_market", value: 4 },
      ],
      validKeys: VALID_KEYS,
    });

    expect(tx.assessmentBenchmark.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["b1"] } },
    });
    expect(tx.assessmentBenchmark.createMany).toHaveBeenCalledWith({
      data: [{
        templateId: "tpl_1",
        metricKind: "QUESTION",
        metricKey: "S3_recruitment",
        value: 7.1,
      }],
    });
  });

  it("batches changed, stale, and new rows while leaving unchanged rows untouched", async () => {
    const { db, tx } = makeDb([
      { id: "b1", metricKey: "S3_recruitment", value: 6.3 },
      { id: "b2", metricKey: "S3_market", value: 4 },
      { id: "stale", metricKey: "S3_retired_factor", value: 5 },
    ]);

    await reconcileQuestionBenchmarks(db, {
      templateId: "tpl_1",
      entries: [
        { stableKey: "S3_recruitment", value: 7.1 },
        { stableKey: "S3_market", value: 4 },
        { stableKey: "S3_leadership_team", value: 5 },
      ],
      validKeys: VALID_KEYS,
    });

    expect(tx.assessmentBenchmark.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.assessmentBenchmark.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["b1", "stale"] } },
    });
    expect(tx.assessmentBenchmark.createMany).toHaveBeenCalledTimes(1);
    expect(tx.assessmentBenchmark.createMany).toHaveBeenCalledWith({
      data: [
        {
          templateId: "tpl_1",
          metricKind: "QUESTION",
          metricKey: "S3_recruitment",
          value: 7.1,
        },
        {
          templateId: "tpl_1",
          metricKind: "QUESTION",
          metricKey: "S3_leadership_team",
          value: 5,
        },
      ],
    });
    expect(tx.assessmentBenchmark.update).not.toHaveBeenCalled();
  });

  it("does NOT touch unchanged rows (no update, no delete — id/timestamps kept)", async () => {
    const { db, tx } = makeDb([
      { id: "b1", metricKey: "S3_recruitment", value: 6.3 },
    ]);

    // 6.34 rounds to 6.3 — identical to the stored value → untouched.
    const result = await reconcileQuestionBenchmarks(db, {
      templateId: "tpl_1",
      entries: [{ stableKey: "S3_recruitment", value: 6.34 }],
      validKeys: VALID_KEYS,
    });

    expect(tx.assessmentBenchmark.update).not.toHaveBeenCalled();
    expect(tx.assessmentBenchmark.deleteMany).not.toHaveBeenCalled();
    expect(tx.assessmentBenchmark.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      before: { S3_recruitment: 6.3 },
      after: { S3_recruitment: 6.3 },
    });
  });

  it("empty entries with existing rows deletes everything (after = {})", async () => {
    const { db, tx } = makeDb([
      { id: "b1", metricKey: "S3_recruitment", value: 6.3 },
      { id: "b2", metricKey: "S3_market", value: 4 },
    ]);

    const result = await reconcileQuestionBenchmarks(db, {
      templateId: "tpl_1",
      entries: [],
      validKeys: VALID_KEYS,
    });

    expect(tx.assessmentBenchmark.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["b1", "b2"] } },
    });
    expect(result.after).toEqual({});
  });

  it("runs everything in ONE transaction (read + writes on the tx client)", async () => {
    const { db, dbSpy, tx } = makeDb([
      { id: "b1", metricKey: "S3_recruitment", value: 1 },
    ]);

    await reconcileQuestionBenchmarks(db, {
      templateId: "tpl_1",
      entries: [
        { stableKey: "S3_recruitment", value: 2 },
        { stableKey: "S3_market", value: 3 },
      ],
      validKeys: VALID_KEYS,
    });

    expect(dbSpy.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.assessmentBenchmark.findMany).toHaveBeenCalledTimes(1);
    expect(tx.assessmentBenchmark.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.assessmentBenchmark.createMany).toHaveBeenCalledTimes(1);
  });

  describe("validation (typed PeerBenchmarkValidationError, thrown BEFORE any write)", () => {
    async function expectRejection(
      entries: Array<{ stableKey: string; value: number }>,
      code: string,
      validKeys: ReadonlySet<string> = VALID_KEYS,
    ) {
      const { db, dbSpy } = makeDb([]);
      await expect(
        reconcileQuestionBenchmarks(db, { templateId: "tpl_1", entries, validKeys }),
      ).rejects.toMatchObject({ code });
      await expect(
        reconcileQuestionBenchmarks(db, { templateId: "tpl_1", entries, validKeys }),
      ).rejects.toBeInstanceOf(PeerBenchmarkValidationError);
      expect(dbSpy.$transaction).not.toHaveBeenCalled();
    }

    it("rejects an unknown stableKey", async () => {
      await expectRejection(
        [{ stableKey: "S3_not_a_factor", value: 5 }],
        "UNKNOWN_KEY",
      );
    });

    it("rejects a duplicate stableKey", async () => {
      await expectRejection(
        [
          { stableKey: "S3_market", value: 5 },
          { stableKey: "S3_market", value: 6 },
        ],
        "DUPLICATE_KEY",
      );
    });

    it.each([-0.1, 10.05, 11])("rejects out-of-bounds value %p", async (v) => {
      await expectRejection(
        [{ stableKey: "S3_market", value: v }],
        "VALUE_OUT_OF_BOUNDS",
      );
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      "rejects non-finite value %p",
      async (v) => {
        await expectRejection(
          [{ stableKey: "S3_market", value: v }],
          "VALUE_NOT_FINITE",
        );
      },
    );

    it("rejects a non-numeric value as non-finite", async () => {
      await expectRejection(
        [{ stableKey: "S3_market", value: "5" as unknown as number }],
        "VALUE_NOT_FINITE",
      );
    });

    it(`rejects more than ${MAX_BENCHMARK_ENTRIES} entries`, async () => {
      const keys = Array.from({ length: MAX_BENCHMARK_ENTRIES + 1 }, (_, i) => `S3_k${i}`);
      await expectRejection(
        keys.map((k) => ({ stableKey: k, value: 5 })),
        "TOO_MANY_ENTRIES",
        new Set(keys),
      );
    });

    it("accepts the boundary values 0 and 10", async () => {
      const { db, tx } = makeDb([]);
      await reconcileQuestionBenchmarks(db, {
        templateId: "tpl_1",
        entries: [
          { stableKey: "S3_recruitment", value: 0 },
          { stableKey: "S3_market", value: 10 },
        ],
        validKeys: VALID_KEYS,
      });
      expect(tx.assessmentBenchmark.createMany).toHaveBeenCalledTimes(1);
      expect(tx.assessmentBenchmark.createMany.mock.calls[0][0].data).toHaveLength(
        2,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPeerComparisonSection
// ─────────────────────────────────────────────────────────────────────────────

describe("buildPeerComparisonSection", () => {
  it("maps own answers 1/2/3 → 0/5/10 with Weak/Average/Strong", () => {
    const section = buildPeerComparisonSection({
      questionsByKey: lvaQuestionsByKey(),
      rawAnswers: answers([
        { stableKey: "S3_recruitment", value: 1 },
        { stableKey: "S3_market", value: 2 },
        { stableKey: "S3_leadership_team", value: 3 },
      ]),
      benchmarks: bench([
        ["S3_recruitment", 5],
        ["S3_market", 5],
        ["S3_leadership_team", 5],
      ]),
      templateAlias: LVA_TEMPLATE_ALIAS,
    });

    expect(section).not.toBeNull();
    expect(section!.items.map((i) => [i.ownRating, i.ownValue])).toEqual([
      ["Weak", 0],
      ["Average", 5],
      ["Strong", 10],
    ]);
  });

  it("carries the section identity, title and intro", () => {
    const section = buildPeerComparisonSection({
      questionsByKey: lvaQuestionsByKey(),
      rawAnswers: answers([{ stableKey: "S3_market", value: 2 }]),
      benchmarks: bench([["S3_market", 6]]),
      templateAlias: LVA_TEMPLATE_ALIAS,
    });

    expect(section).toMatchObject({
      sectionKey: "S3_strengths",
      title: PEER_COMPARISON_TITLE,
      intro: PEER_COMPARISON_INTRO,
    });
    expect(PEER_COMPARISON_TITLE).toBe(
      "Organizational Strengths and Weaknesses — compared to peers",
    );
    expect(PEER_COMPARISON_INTRO).toBe(
      "Your rating per factor next to the peer average (companies that have preceded you in this assessment).",
    );
  });

  it("omits a factor with a benchmark but no own answer", () => {
    const section = buildPeerComparisonSection({
      questionsByKey: lvaQuestionsByKey(),
      rawAnswers: answers([{ stableKey: "S3_market", value: 2 }]),
      benchmarks: bench([
        ["S3_recruitment", 6], // benchmark set, but not answered
        ["S3_market", 6],
      ]),
      templateAlias: LVA_TEMPLATE_ALIAS,
    });

    expect(section!.items.map((i) => i.stableKey)).toEqual(["S3_market"]);
  });

  it("omits a factor with an own answer but no benchmark", () => {
    const section = buildPeerComparisonSection({
      questionsByKey: lvaQuestionsByKey(),
      rawAnswers: answers([
        { stableKey: "S3_recruitment", value: 3 }, // answered, no benchmark
        { stableKey: "S3_market", value: 2 },
      ]),
      benchmarks: bench([["S3_market", 6]]),
      templateAlias: LVA_TEMPLATE_ALIAS,
    });

    expect(section!.items.map((i) => i.stableKey)).toEqual(["S3_market"]);
  });

  it.each([0, 4, 2.5, -1])(
    "omits a factor whose own value %p is outside the {1,2,3} domain",
    (v) => {
      const section = buildPeerComparisonSection({
        questionsByKey: lvaQuestionsByKey(),
        rawAnswers: answers([{ stableKey: "S3_market", value: v }]),
        benchmarks: bench([["S3_market", 6]]),
        templateAlias: LVA_TEMPLATE_ALIAS,
      });
      expect(section).toBeNull();
    },
  );

  it("coerces numeric-string answers (imported rows)", () => {
    const section = buildPeerComparisonSection({
      questionsByKey: lvaQuestionsByKey(),
      rawAnswers: answers([
        { stableKey: "S3_recruitment", value: "3" },
        { stableKey: "S3_market", value: " 2 " },
      ]),
      benchmarks: bench([
        ["S3_recruitment", 5],
        ["S3_market", 5],
      ]),
      templateAlias: LVA_TEMPLATE_ALIAS,
    });

    expect(section!.items.map((i) => [i.stableKey, i.ownValue])).toEqual([
      ["S3_recruitment", 10],
      ["S3_market", 5],
    ]);
  });

  it.each(["", "  ", "abc", "2x"])(
    "omits a factor with a non-numeric string answer %j",
    (v) => {
      const section = buildPeerComparisonSection({
        questionsByKey: lvaQuestionsByKey(),
        rawAnswers: answers([{ stableKey: "S3_market", value: v }]),
        benchmarks: bench([["S3_market", 6]]),
        templateAlias: LVA_TEMPLATE_ALIAS,
      });
      expect(section).toBeNull();
    },
  );

  it("ignores sliders outside S3 and non-sliders inside S3", () => {
    const section = buildPeerComparisonSection({
      questionsByKey: lvaQuestionsByKey(),
      rawAnswers: answers([
        { stableKey: "P1_q1", value: 2 }, // slider, wrong section
        { stableKey: "S3_note", value: "text" }, // S3, wrong type
        { stableKey: "S3_market", value: 2 },
      ]),
      benchmarks: bench([
        ["P1_q1", 6],
        ["S3_note", 6],
        ["S3_market", 6],
      ]),
      templateAlias: LVA_TEMPLATE_ALIAS,
    });

    expect(section!.items.map((i) => i.stableKey)).toEqual(["S3_market"]);
  });

  it("returns null when zero factors qualify", () => {
    expect(
      buildPeerComparisonSection({
        questionsByKey: lvaQuestionsByKey(),
        rawAnswers: answers([]),
        benchmarks: bench([["S3_market", 6]]),
        templateAlias: LVA_TEMPLATE_ALIAS,
      }),
    ).toBeNull();

    expect(
      buildPeerComparisonSection({
        questionsByKey: lvaQuestionsByKey(),
        rawAnswers: answers([{ stableKey: "S3_market", value: 2 }]),
        benchmarks: bench([]),
        templateAlias: LVA_TEMPLATE_ALIAS,
      }),
    ).toBeNull();
  });

  it("is defensive about malformed inputs (null questionsByKey, non-array answers)", () => {
    expect(
      buildPeerComparisonSection({
        questionsByKey: null,
        rawAnswers: answers([{ stableKey: "S3_market", value: 2 }]),
        benchmarks: bench([["S3_market", 6]]),
        templateAlias: LVA_TEMPLATE_ALIAS,
      }),
    ).toBeNull();

    expect(
      buildPeerComparisonSection({
        questionsByKey: lvaQuestionsByKey(),
        rawAnswers: "not-an-array",
        benchmarks: bench([["S3_market", 6]]),
        templateAlias: LVA_TEMPLATE_ALIAS,
      }),
    ).toBeNull();

    // Malformed answer rows are skipped, valid ones survive.
    const section = buildPeerComparisonSection({
      questionsByKey: lvaQuestionsByKey(),
      rawAnswers: [null, "junk", { noKey: true }, { stableKey: "S3_market", value: 2 }],
      benchmarks: bench([["S3_market", 6]]),
      templateAlias: LVA_TEMPLATE_ALIAS,
    });
    expect(section!.items).toHaveLength(1);
  });

  it("computes dev = ownValue − peers, signed, rounded to 1dp", () => {
    const section = buildPeerComparisonSection({
      questionsByKey: lvaQuestionsByKey(),
      rawAnswers: answers([
        { stableKey: "S3_recruitment", value: 2 }, // own 5
        { stableKey: "S3_market", value: 3 }, // own 10
        { stableKey: "S3_leadership_team", value: 1 }, // own 0
      ]),
      benchmarks: bench([
        ["S3_recruitment", 6.3], // 5 − 6.3 = −1.3 (float-safe)
        ["S3_market", 7.77], // 10 − 7.77 = 2.23 → 2.2
        ["S3_leadership_team", 0], // 0 − 0 = 0
      ]),
      templateAlias: LVA_TEMPLATE_ALIAS,
    });

    expect(section!.items.map((i) => [i.peers, i.dev])).toEqual([
      [6.3, -1.3],
      [7.77, 2.2],
      [0, 0],
    ]);
  });

  it("uses the LVA report factor-label overrides", () => {
    const section = buildPeerComparisonSection({
      questionsByKey: lvaQuestionsByKey(),
      rawAnswers: answers([
        { stableKey: "S3_recruitment", value: 2 },
        { stableKey: "S3_market", value: 2 },
        { stableKey: "S3_leadership_team", value: 2 },
      ]),
      benchmarks: bench([
        ["S3_recruitment", 5],
        ["S3_market", 5],
        ["S3_leadership_team", 5],
      ]),
      templateAlias: LVA_TEMPLATE_ALIAS,
    });

    expect(section!.items.map((i) => i.label)).toEqual([
      "Recruitment of new staff",
      "The market",
      "Leadership team",
    ]);
  });

  it("preserves questionsByKey insertion order regardless of answer/benchmark order", () => {
    const section = buildPeerComparisonSection({
      questionsByKey: lvaQuestionsByKey(),
      // Reversed relative to the question order:
      rawAnswers: answers([
        { stableKey: "S3_leadership_team", value: 1 },
        { stableKey: "S3_market", value: 2 },
        { stableKey: "S3_recruitment", value: 3 },
      ]),
      benchmarks: bench([
        ["S3_leadership_team", 1],
        ["S3_market", 2],
        ["S3_recruitment", 3],
      ]),
      templateAlias: LVA_TEMPLATE_ALIAS,
    });

    expect(section!.items.map((i) => i.stableKey)).toEqual([
      "S3_recruitment",
      "S3_market",
      "S3_leadership_team",
    ]);
  });
});
