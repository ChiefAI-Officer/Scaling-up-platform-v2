/**
 * Wave J/K (Task 3) — SU-Full group report Appendix B: pseudonymized per-member
 * domain grid.
 *
 * Esperto's "Anonymous Team" group report carries an Appendix B — a de-identified
 * per-person grid:
 *   - rows  = the CEO row labelled "CEO" (a role, de-identified — matches the
 *             Esperto source 18j-su-full-source-extract.md §133) + the non-CEO
 *             members numbered "Person 1".."Person N", in the cohort's display
 *             order (CEO first, then alphabetical). NO names, NO job titles.
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
  it("labels the CEO row 'CEO' + numbers the non-CEO members 'Person N' in display order, with NO names", () => {
    const m = buildGroupReportModel(fixtureScalingUpFull());
    const appendixB = m.scored!.appendixB!;
    expect(appendixB).toBeDefined();
    // CEO (Sue, first) + 2 team (Dee, Ed) = 3 rows. CEO row = "CEO"; the
    // non-CEO members are numbered Person 1, Person 2 (Esperto source).
    expect(appendixB).toHaveLength(3);
    expect(appendixB.map((r) => r.personLabel)).toEqual([
      "CEO",
      "Person 1",
      "Person 2",
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
    const [ceo, p1, p2] = m.scored!.appendixB!;
    // CEO (Sue): people 8, strategy 6, execution 7, cash 9 (you 5 excluded).
    expect(ceo.personLabel).toBe("CEO");
    expect(ceo.domainScores).toEqual({
      people: 8,
      strategy: 6,
      execution: 7,
      cash: 9,
    });
    // Person 1 = Dee: people 4, strategy 6, execution 5, cash 3.
    expect(p1.domainScores).toEqual({
      people: 4,
      strategy: 6,
      execution: 5,
      cash: 3,
    });
    // Person 2 = Ed: people 2, strategy 6, execution 3, cash 3.
    expect(p2.domainScores).toEqual({
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
    // Dee is Person 1 (the first non-CEO) → cash null; her other domains unchanged.
    const p1 = m.scored!.appendixB![1];
    expect(p1.personLabel).toBe("Person 1");
    expect(p1.domainScores.cash).toBeNull();
    expect(p1.domainScores.people).toBe(4);
  });

  it("labels the CEO row 'CEO' (a role, de-identified — not 'Person 1')", () => {
    const m = buildGroupReportModel(fixtureScalingUpFull());
    // CEO is first in display order → row label "CEO" with Sue's (CEO) scores.
    const ceoRow = m.scored!.appendixB![0];
    expect(ceoRow.personLabel).toBe("CEO");
    expect(ceoRow.domainScores.people).toBe(8);
  });

  it("no-CEO cohort numbers everyone 'Person N' (no CEO row)", () => {
    const m = buildGroupReportModel(fixtureScalingUpFullNoCeo());
    const appendixB = m.scored!.appendixB!;
    expect(appendixB.map((r) => r.personLabel)).toEqual(["Person 1", "Person 2"]);
    // No "CEO" row in a no-CEO cohort.
    expect(appendixB.some((r) => r.personLabel === "CEO")).toBe(false);
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
