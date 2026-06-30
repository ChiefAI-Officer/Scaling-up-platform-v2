/**
 * Wave J/K (Task 3) — SU-Full group report Appendix B: pseudonymized per-member
 * domain grid.
 *
 * Esperto's "Anonymous Team" group report carries an Appendix B — a de-identified
 * per-person grid:
 *   - rows  = "Person 1", "Person 2", … (NO names, NO job titles), in the
 *             cohort's existing display order (CEO first, then alphabetical),
 *   - cols  = the 4 domains People · Strategy · Execution · Cash (the "you"
 *             domain is CEO-personal and EXCLUDED),
 *   - cells = that person's 0–10 domain score (their frozen per-domain
 *             averagePoints), `null` where they answered none in that domain.
 *
 * The grid is built ONLY on the scored report and ONLY when `domains` are
 * present (i.e. SU-Full). It reads each member's FROZEN result verbatim (never
 * recomputes) — mirroring the existing `domains` aggregation's source.
 *
 * Pure — NO DB.
 */

import {
  buildGroupReportModel,
  APPENDIX_B_DOMAIN_KEYS,
} from "@/lib/assessments/group-report-model";
import {
  fixtureScalingUpFull,
  fixtureScalingUpFullNoCeo,
  fixtureRockefeller,
} from "./fixtures/group-report-fixtures";

describe("scored Appendix B — SU-Full pseudonymized per-member domain grid", () => {
  it("emits one row per respondent labelled 'Person N' in display order, with NO names", () => {
    const m = buildGroupReportModel(fixtureScalingUpFull());
    const appendixB = m.scored!.appendixB!;
    expect(appendixB).toBeDefined();
    // CEO (Sue) + 2 team (Dee, Ed) = 3 rows.
    expect(appendixB).toHaveLength(3);
    expect(appendixB.map((r) => r.personLabel)).toEqual([
      "Person 1",
      "Person 2",
      "Person 3",
    ]);
    // pseudonymized — no name / jobTitle field leaks onto a row.
    for (const row of appendixB) {
      expect(row).not.toHaveProperty("name");
      expect(row).not.toHaveProperty("jobTitle");
      expect(row).not.toHaveProperty("respondentId");
    }
  });

  it("carries exactly the 4 domains People/Strategy/Execution/Cash (NO 'you')", () => {
    expect(APPENDIX_B_DOMAIN_KEYS).toEqual([
      "people",
      "strategy",
      "execution",
      "cash",
    ]);
    const m = buildGroupReportModel(fixtureScalingUpFull());
    for (const row of m.scored!.appendixB!) {
      expect(Object.keys(row.domainScores).sort()).toEqual(
        ["cash", "execution", "people", "strategy"].sort(),
      );
      expect(row.domainScores).not.toHaveProperty("you");
    }
  });

  it("cells equal each person's frozen per-domain averagePoints (verbatim, never recomputed)", () => {
    const m = buildGroupReportModel(fixtureScalingUpFull());
    const [p1, p2, p3] = m.scored!.appendixB!;
    // Sue (CEO): people 8, strategy 6, execution 7, cash 9 (you 5 excluded).
    expect(p1.domainScores).toEqual({
      people: 8,
      strategy: 6,
      execution: 7,
      cash: 9,
    });
    // Dee: people 4, strategy 6, execution 5, cash 3.
    expect(p2.domainScores).toEqual({
      people: 4,
      strategy: 6,
      execution: 5,
      cash: 3,
    });
    // Ed: people 2, strategy 6, execution 3, cash 3.
    expect(p3.domainScores).toEqual({
      people: 2,
      strategy: 6,
      execution: 3,
      cash: 3,
    });
  });

  it("a domain the respondent did not answer → null cell", () => {
    // Null out Dee's `cash` domain (she answered nothing in cash).
    const input = fixtureScalingUpFull();
    const dee = input.submissions.find((s) => s.respondentId === "s-dee")!;
    const r = dee.result as {
      perDomain: Array<{ key: string; averagePoints: number | null }>;
    };
    r.perDomain.find((d) => d.key === "cash")!.averagePoints = null;
    const m = buildGroupReportModel(input);
    // Person 2 (Dee) → cash null; her other domains unchanged.
    const p2 = m.scored!.appendixB![1];
    expect(p2.domainScores.cash).toBeNull();
    expect(p2.domainScores.people).toBe(4);
  });

  it("includes the CEO as Person 1 (de-identified; CEO not distinguished)", () => {
    const m = buildGroupReportModel(fixtureScalingUpFull());
    // CEO is first in display order → Person 1 = Sue's (CEO) scores.
    expect(m.scored!.appendixB![0].domainScores.people).toBe(8);
  });

  it("no-CEO cohort still emits Person rows for the team", () => {
    const m = buildGroupReportModel(fixtureScalingUpFullNoCeo());
    const appendixB = m.scored!.appendixB!;
    expect(appendixB.map((r) => r.personLabel)).toEqual(["Person 1", "Person 2"]);
    // Person 1 = Dee (alphabetical, no CEO) → people 4.
    expect(appendixB[0].domainScores.people).toBe(4);
  });

  it("is ABSENT on a scored report without domains (Rockefeller)", () => {
    const m = buildGroupReportModel(fixtureRockefeller());
    expect(m.scored!.domains).toBeUndefined();
    expect(m.scored!.appendixB).toBeUndefined();
  });

  it("is ABSENT on an empty cohort", () => {
    const input = { ...fixtureScalingUpFull(), submissions: [] };
    const m = buildGroupReportModel(input);
    // No submissions → no domains block → no Appendix B.
    expect(m.scored!.appendixB).toBeUndefined();
  });
});
