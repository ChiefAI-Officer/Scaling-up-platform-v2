/**
 * Wave F #22 — group-report-model SCORED aggregation tests (T5).
 *
 * Extends the T3 core + T4 qualitative: the scored dispatch now fills
 * `scored.sections` + the headline blocks (domains / scaleUpScore / tier) +
 * per-question CEO-vs-team. BINDING rules (ADR-0011, R1-HIGH-1/2):
 *   - team avg EXCLUDES the CEO,
 *   - N<2 (zero non-CEO contributors for a key) → teamAvg null, dev null,
 *   - the headline MIRRORS the per-respondent scored report (sections table /
 *     per-domain cards / scaleUpScore / tier), it does NOT invent a new shape,
 *   - the FROZEN `result` is read verbatim — NEVER recomputed.
 *
 * Pure — NO DB.
 */

import {
  buildGroupReportModel,
  type GroupScoredReport,
  type GroupScoredSection,
  type GroupScoredDomain,
  type GroupScoredQuestion,
} from "@/lib/assessments/group-report-model";
import {
  fixtureRockefeller,
  fixtureRockefellerSparseCash,
  fixtureRockefellerNoCeo,
  fixtureScalingUpFull,
  fixtureScalingUpFullDegraded,
} from "./fixtures/group-report-fixtures";

// ── helpers ─────────────────────────────────────────────────────────────────

function scoredOf(input = fixtureRockefeller()): GroupScoredReport {
  const model = buildGroupReportModel(input);
  expect(model.reportType).toBe("scored");
  expect(model.scored).toBeDefined();
  return model.scored!;
}

function findSection(
  sections: GroupScoredSection[],
  stableKey: string,
): GroupScoredSection | undefined {
  return sections.find((s) => s.stableKey === stableKey);
}

function findDomain(
  domains: GroupScoredDomain[],
  key: string,
): GroupScoredDomain | undefined {
  return domains.find((d) => d.key === key);
}

function findQuestion(
  questions: GroupScoredQuestion[],
  stableKey: string,
): GroupScoredQuestion | undefined {
  return questions.find((q) => q.stableKey === stableKey);
}

// ── dispatch ──────────────────────────────────────────────────────────────

describe("scored dispatch", () => {
  it("Rockefeller (RockHabits alias) → scored, qualitative absent", () => {
    const model = buildGroupReportModel(fixtureRockefeller());
    expect(model.reportType).toBe("scored");
    expect(model.scored).toBeDefined();
    expect(model.qualitative).toBeUndefined();
  });
});

// ── section rows: CEO-excluded team avg + dev ───────────────────────────────

describe("scored sections — CEO-excluded team average", () => {
  it("teamAvg EXCLUDES the CEO; dev = ceo - teamAvg", () => {
    const scored = scoredOf();
    // S1: ceo 3, team (amy 1, bob 2, cara 0) → teamAvg = (1+2+0)/3 = 1; dev = 2.
    const s1 = findSection(scored.sections, "S1")!;
    expect(s1.ceo).toBe(3);
    expect(s1.teamAvg).toBe(1);
    expect(s1.dev).toBe(2);
    expect(s1.n).toBe(3); // 3 non-CEO contributors
  });

  it("dev is zero when CEO equals the team average", () => {
    const scored = scoredOf();
    // S2: ceo 2, team all 2 → teamAvg = 2; dev = 0.
    const s2 = findSection(scored.sections, "S2")!;
    expect(s2.ceo).toBe(2);
    expect(s2.teamAvg).toBe(2);
    expect(s2.dev).toBe(0);
  });

  it("dev is negative when the team scores above the CEO", () => {
    const scored = scoredOf();
    // S3: ceo 1, team (amy 3, bob 3, cara 0) → teamAvg = 2; dev = -1.
    const s3 = findSection(scored.sections, "S3")!;
    expect(s3.ceo).toBe(1);
    expect(s3.teamAvg).toBe(2);
    expect(s3.dev).toBe(-1);
  });

  it("section names come from the version (not the raw stableKey)", () => {
    const scored = scoredOf();
    const s1 = findSection(scored.sections, "S1")!;
    expect(s1.name).toBe("The executive team is healthy and aligned.");
  });

  it("does NOT recompute — reads the frozen result's averagePoints verbatim", () => {
    // Tamper with the CEO's S1 averagePoints in the frozen result; the aggregate
    // must reflect the tampered value (proving it reads, never recomputes).
    const input = fixtureRockefeller();
    const ceoSub = input.submissions.find((s) => s.respondentId === "r-ceo")!;
    const result = ceoSub.result as {
      perSection: Array<{ stableKey: string; averagePoints: number }>;
    };
    const s1row = result.perSection.find((p) => p.stableKey === "S1")!;
    s1row.averagePoints = 99;
    const scored = scoredOf(input);
    expect(findSection(scored.sections, "S1")!.ceo).toBe(99);
  });
});

// ── N<2 fallback ────────────────────────────────────────────────────────────

describe("scored sections — N<2 fallback", () => {
  it("a section with zero non-CEO contributors → teamAvg null, dev null", () => {
    const scored = scoredOf(fixtureRockefellerSparseCash());
    // S3: only the CEO has an S3 averagePoints; amy + bob left it blank.
    const s3 = findSection(scored.sections, "S3")!;
    expect(s3.ceo).toBe(2);
    expect(s3.teamAvg).toBeNull();
    expect(s3.dev).toBeNull();
    expect(s3.n).toBe(0);
  });

  it("a healthy section in the same fixture still computes a team avg", () => {
    const scored = scoredOf(fixtureRockefellerSparseCash());
    // S1: ceo 3, team (amy 1, bob 2) → teamAvg = 1.5; dev = 1.5; n = 2.
    const s1 = findSection(scored.sections, "S1")!;
    expect(s1.ceo).toBe(3);
    expect(s1.teamAvg).toBe(1.5);
    expect(s1.dev).toBe(1.5);
    expect(s1.n).toBe(2);
  });
});

// ── CEO with no submission ──────────────────────────────────────────────────

describe("scored sections — CEO with no submission", () => {
  it("ceo is null but team aggregates still render", () => {
    const scored = scoredOf(fixtureRockefellerNoCeo());
    // S1: no CEO; team (amy 1, bob 2, cara 0) → teamAvg = 1; ceo null; dev null.
    const s1 = findSection(scored.sections, "S1")!;
    expect(s1.ceo).toBeNull();
    expect(s1.teamAvg).toBe(1);
    expect(s1.dev).toBeNull(); // dev null when ceo is null
    expect(s1.n).toBe(3);
  });
});

// ── per-question CEO-vs-team ────────────────────────────────────────────────

describe("scored per-question", () => {
  it("teamMean EXCLUDES the CEO; carries a question label + n", () => {
    const scored = scoredOf();
    // Q1_1: ceo 3, team (amy 1, bob 2, cara 0) → teamMean = 1; n = 3.
    const q = findQuestion(scored.questions, "Q1_1")!;
    expect(q.ceo).toBe(3);
    expect(q.teamMean).toBe(1);
    expect(q.n).toBe(3);
    expect(typeof q.label).toBe("string");
    expect(q.label).not.toBe("Q1_1"); // a human label, not the raw key
  });

  it("a question with zero non-CEO values → teamMean null, n 0", () => {
    const scored = scoredOf(fixtureRockefellerSparseCash());
    // Q3_1: only the CEO answered (amy/bob omitted S3).
    const q = findQuestion(scored.questions, "Q3_1")!;
    expect(q.ceo).toBe(2);
    expect(q.teamMean).toBeNull();
    expect(q.n).toBe(0);
  });

  it("CEO with no submission → per-question ceo null, team still aggregates", () => {
    const scored = scoredOf(fixtureRockefellerNoCeo());
    const q = findQuestion(scored.questions, "Q1_1")!;
    expect(q.ceo).toBeNull();
    expect(q.teamMean).toBe(1); // (1+2+0)/3
    expect(q.n).toBe(3);
  });
});

// ── headline blocks: domains / scaleUpScore / tier ──────────────────────────

describe("scored headline — section-only template (Rockefeller)", () => {
  it("domains + scaleUpScore are ABSENT when the result carries neither", () => {
    const scored = scoredOf();
    expect(scored.domains).toBeUndefined();
    expect(scored.scaleUpScore).toBeUndefined();
  });

  it("tier block is present from each submission's tier.label", () => {
    const scored = scoredOf();
    expect(scored.tier).toBeDefined();
    expect(scored.tier!.ceo).toBe("Green");
    // team (amy Yellow, bob Green, cara Red) → distribution counts.
    const dist = scored.tier!.teamDistribution;
    const byLabel = new Map(dist.map((d) => [d.label, d.count]));
    expect(byLabel.get("Green")).toBe(1); // bob
    expect(byLabel.get("Yellow")).toBe(1); // amy
    expect(byLabel.get("Red")).toBe(1); // cara
  });
});

describe("scored headline — domains template (Scaling Up Full)", () => {
  it("emits per-domain {ceo, teamAvg, dev} mirroring per-respondent domain cards", () => {
    const model = buildGroupReportModel(fixtureScalingUpFull());
    expect(model.reportType).toBe("scored");
    const scored = model.scored!;
    expect(scored.domains).toBeDefined();
    // people: ceo 8, team (dee 4, ed 2) → teamAvg = 3; dev = 5.
    const people = findDomain(scored.domains!, "people")!;
    expect(people.label).toBe("People");
    expect(people.ceo).toBe(8);
    expect(people.teamAvg).toBe(3);
    expect(people.dev).toBe(5);
    // strategy: ceo 6, team (6, 6) → teamAvg 6; dev 0.
    const strategy = findDomain(scored.domains!, "strategy")!;
    expect(strategy.ceo).toBe(6);
    expect(strategy.teamAvg).toBe(6);
    expect(strategy.dev).toBe(0);
  });

  it("emits a scaleUpScore block {ceo, teamAvg}, team-only mean", () => {
    const scored = buildGroupReportModel(fixtureScalingUpFull()).scored!;
    expect(scored.scaleUpScore).toBeDefined();
    expect(scored.scaleUpScore!.ceo).toBe(70);
    // team (dee 50, ed 46) → teamAvg = 48.
    expect(scored.scaleUpScore!.teamAvg).toBe(48);
  });

  it("emits a tier block with the CEO label + a team distribution", () => {
    const scored = buildGroupReportModel(fixtureScalingUpFull()).scored!;
    expect(scored.tier).toBeDefined();
    expect(scored.tier!.ceo).toBe("Exemplary");
    const byLabel = new Map(
      scored.tier!.teamDistribution.map((d) => [d.label, d.count]),
    );
    expect(byLabel.get("On the way")).toBe(1); // dee
    expect(byLabel.get("Not ready")).toBe(1); // ed
    expect(byLabel.has("Exemplary")).toBe(false); // CEO excluded from team dist
  });

  it("a domain with no non-CEO data → teamAvg null, dev null (N<2)", () => {
    // Build a SUF fixture where only the CEO has a `cash` domain value.
    const input = fixtureScalingUpFull();
    for (const sub of input.submissions) {
      if (sub.respondentId === "s-ceo") continue;
      const r = sub.result as {
        perDomain: Array<{ key: string; averagePoints: number | null }>;
      };
      const cash = r.perDomain.find((d) => d.key === "cash")!;
      cash.averagePoints = null; // team has no cash data
    }
    const scored = buildGroupReportModel(input).scored!;
    const cash = findDomain(scored.domains!, "cash")!;
    expect(cash.ceo).toBe(9);
    expect(cash.teamAvg).toBeNull();
    expect(cash.dev).toBeNull();
  });
});

// ── robustness ──────────────────────────────────────────────────────────────

describe("scored aggregation — robustness", () => {
  it("a submission with a malformed result is skipped (degraded), others aggregate", () => {
    const model = buildGroupReportModel(fixtureScalingUpFullDegraded());
    expect(model.degraded).toBe(true);
    const scored = model.scored!;
    // ed's result is "not-an-object" → skipped. people team now = dee only (4).
    const people = findDomain(scored.domains!, "people")!;
    expect(people.ceo).toBe(8);
    expect(people.teamAvg).toBe(4); // dee only
    expect(people.dev).toBe(4);
  });

  it("never throws on a completely malformed scored input", () => {
    const bad = {
      alias: "RockHabits",
      version: { questions: "nope" as unknown, sections: 123 as unknown },
      participants: "nope" as unknown,
      submissions: [
        { respondentId: "x", answers: "nope" as unknown, result: null as unknown },
      ] as unknown,
    } as unknown as Parameters<typeof buildGroupReportModel>[0];
    expect(() => buildGroupReportModel(bad)).not.toThrow();
    const model = buildGroupReportModel(bad);
    expect(model.scored).toBeDefined();
    expect(model.scored!.sections).toEqual([]);
  });

  it("an empty cohort → empty sections, no throw", () => {
    const input = { ...fixtureRockefeller(), submissions: [] };
    const scored = scoredOf(input);
    expect(scored.sections).toEqual([]);
    expect(scored.questions).toEqual([]);
    // No tier rows → tier block still defined but empty.
    expect(scored.tier?.ceo ?? null).toBeNull();
    expect(scored.tier?.teamDistribution ?? []).toEqual([]);
  });
});
