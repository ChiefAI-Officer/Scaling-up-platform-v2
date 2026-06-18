/**
 * Wave F #22 — group-report-model CORE tests (T3).
 *
 * Covers the SHARED model core only (cohort assembly, orphan-robustness,
 * CEO-first ordering, naming, answer normalization/validation, dispatch).
 * The per-type section aggregation (qualitative = T4, scored = T5) is NOT
 * tested here — those sections are stubbed empty by T3.
 *
 * Pure — NO DB. Fixtures are faithful to the real LVA seed shapes.
 */

import { buildGroupReportModel } from "@/lib/assessments/group-report-model";
import {
  fixtureLva,
  fixtureLvaWithOrphan,
  fixtureLvaMalformed,
} from "./fixtures/group-report-fixtures";

describe("buildGroupReportModel — dispatch", () => {
  it("resolves reportType from the alias (LVA → qualitative)", () => {
    const model = buildGroupReportModel(fixtureLva());
    expect(model.reportType).toBe("qualitative");
  });

  it("unknown alias falls back to scored", () => {
    const input = { ...fixtureLva(), alias: "some-unknown-alias" };
    const model = buildGroupReportModel(input);
    expect(model.reportType).toBe("scored");
  });

  it("exposes questionsByKey resolved from version.questions (labels/types/options)", () => {
    const model = buildGroupReportModel(fixtureLva());
    expect(model.questionsByKey.S1_gross_margin?.type).toBe("NUMBER");
    expect(model.questionsByKey.S3_recruitment?.type).toBe("SLIDER_LIKERT");
    expect(model.questionsByKey.S3_recruitment?.min).toBe(1);
    expect(model.questionsByKey.S3_recruitment?.max).toBe(3);
    expect(model.questionsByKey.S4_biggest_obstacles?.options?.length).toBe(16);
  });

  it("dispatches the qualitative container for an LVA campaign (T4 fills sections; scored absent)", () => {
    const model = buildGroupReportModel(fixtureLva());
    // The dispatched section exists for the resolved type; T4 fills it with the
    // aggregated qualitative sections. The per-type aggregation contract is
    // covered in group-report-model.qualitative.test.ts.
    expect(model.qualitative).toBeDefined();
    expect(Array.isArray(model.qualitative?.sections)).toBe(true);
    expect(model.scored).toBeUndefined();
  });

  it("scored campaigns still emit an EMPTY scored container (T5 fills it)", () => {
    // An unknown alias resolves to "scored"; T5 owns scored aggregation, so the
    // container stays empty here.
    const model = buildGroupReportModel({ ...fixtureLva(), alias: "some-unknown-alias" });
    expect(model.scored).toBeDefined();
    expect(model.scored?.sections).toEqual([]);
    expect(model.qualitative).toBeUndefined();
  });
});

describe("buildGroupReportModel — cohort assembly", () => {
  it("cohort = all completed submissions (respondentCount matches)", () => {
    const model = buildGroupReportModel(fixtureLva());
    expect(model.respondentCount).toBe(3);
    expect(model.respondents).toHaveLength(3);
  });

  it("names respondents as 'firstName lastName'", () => {
    const model = buildGroupReportModel(fixtureLva());
    const names = model.respondents.map((r) => r.name).sort();
    expect(names).toEqual(["Jeff Services", "John CEOExec", "Kathy HR"]);
  });

  it("orders CEO first, then alphabetical by display name", () => {
    const model = buildGroupReportModel(fixtureLva());
    expect(model.respondents.map((r) => r.name)).toEqual([
      "John CEOExec", // CEO first
      "Jeff Services", // then alphabetical
      "Kathy HR",
    ]);
    expect(model.respondents[0].isCEO).toBe(true);
    expect(model.respondents.slice(1).every((r) => !r.isCEO)).toBe(true);
  });

  it("empty cohort → respondentCount 0, empty respondents, no throw", () => {
    const input = { ...fixtureLva(), submissions: [] };
    const model = buildGroupReportModel(input);
    expect(model.respondentCount).toBe(0);
    expect(model.respondents).toEqual([]);
    expect(model.degraded).toBe(false);
    expect(model.reportType).toBe("qualitative");
  });
});

describe("buildGroupReportModel — orphan robustness", () => {
  it("includes an orphan submission (respondentId not in participants), names it from its own respondent, flags isOrphan", () => {
    const model = buildGroupReportModel(fixtureLvaWithOrphan());
    expect(model.respondentCount).toBe(4);
    const orphan = model.respondents.find((r) => r.respondentId === "resp-orphan");
    expect(orphan).toBeDefined();
    expect(orphan?.name).toBe("Olivia Orphan");
    expect(orphan?.isOrphan).toBe(true);
    expect(orphan?.isCEO).toBe(false);
    // Non-orphans are not flagged.
    const ceo = model.respondents.find((r) => r.respondentId === "resp-ceo");
    expect(ceo?.isOrphan).toBe(false);
  });

  it("never drops a completed submission even when participants is empty", () => {
    const input = { ...fixtureLva(), participants: [] };
    const model = buildGroupReportModel(input);
    expect(model.respondentCount).toBe(3);
    // No participant rows → nobody is CEO; all flagged orphan.
    expect(model.respondents.every((r) => !r.isCEO)).toBe(true);
    expect(model.respondents.every((r) => r.isOrphan)).toBe(true);
  });
});

describe("buildGroupReportModel — CEO resolution", () => {
  it("marks CEO from the participant row only", () => {
    const model = buildGroupReportModel(fixtureLva());
    const ceo = model.respondents.find((r) => r.isCEO);
    expect(ceo?.respondentId).toBe("resp-ceo");
  });

  it("no respondent marked CEO when the CEO participant has no completed submission", () => {
    const base = fixtureLva();
    const input = {
      ...base,
      submissions: base.submissions.filter((s) => s.respondentId !== "resp-ceo"),
    };
    const model = buildGroupReportModel(input);
    expect(model.respondentCount).toBe(2);
    expect(model.respondents.every((r) => !r.isCEO)).toBe(true);
    // Ordering falls back to pure alphabetical with no CEO.
    expect(model.respondents.map((r) => r.name)).toEqual([
      "Jeff Services",
      "Kathy HR",
    ]);
  });
});

describe("buildGroupReportModel — naming fallbacks", () => {
  it("falls back to jobTitle when name is empty", () => {
    const input = {
      ...fixtureLva(),
      participants: [],
      submissions: [
        {
          respondentId: "r1",
          answers: [],
          result: {},
          respondent: { firstName: "", lastName: "  ", jobTitle: "Operations Lead" },
        },
      ],
    };
    const model = buildGroupReportModel(input);
    expect(model.respondents[0].name).toBe("Operations Lead");
  });

  it("falls back to 'Respondent' when name AND jobTitle are empty", () => {
    const input = {
      ...fixtureLva(),
      participants: [],
      submissions: [
        {
          respondentId: "r1",
          answers: [],
          result: {},
          respondent: { firstName: null, lastName: null, jobTitle: null },
        },
      ],
    };
    const model = buildGroupReportModel(input);
    expect(model.respondents[0].name).toBe("Respondent");
  });

  it("names an orphan with no respondent relation 'Unknown respondent'", () => {
    const input = {
      ...fixtureLva(),
      participants: [],
      submissions: [
        { respondentId: "ghost", answers: [], result: {}, respondent: null },
      ],
    };
    const model = buildGroupReportModel(input);
    expect(model.respondents[0].name).toBe("Unknown respondent");
    expect(model.respondents[0].isOrphan).toBe(true);
  });
});

describe("buildGroupReportModel — answer normalization", () => {
  it("keeps a finite 0 as a PRESENT normalized answer (NUMBER)", () => {
    const model = buildGroupReportModel(fixtureLva());
    const ceoAnswers = model.answersByRespondent.get("resp-ceo");
    expect(ceoAnswers?.has("S1_gross_margin")).toBe(true);
    expect(ceoAnswers?.get("S1_gross_margin")).toBe(0);
    expect(ceoAnswers?.get("S1_branches")).toBe(0);
  });

  it("normalizes a MULTI_CHOICE to known option keys, dropping unknown + de-duping", () => {
    const model = buildGroupReportModel(fixtureLvaMalformed());
    const a = model.answersByRespondent.get("resp-ceo");
    expect(a?.get("S4_biggest_obstacles")).toEqual(["cash"]);
  });

  it("drops a type-mismatched NUMBER (string) and flags degraded, but keeps the submission in the cohort", () => {
    const model = buildGroupReportModel(fixtureLvaMalformed());
    expect(model.respondentCount).toBe(1); // submission NOT dropped
    expect(model.degraded).toBe(true);
    const a = model.answersByRespondent.get("resp-ceo");
    expect(a?.has("S1_revenue")).toBe(false); // string for NUMBER → dropped
  });

  it("drops a non-finite SLIDER (NaN) and flags degraded", () => {
    const model = buildGroupReportModel(fixtureLvaMalformed());
    expect(model.degraded).toBe(true);
    const a = model.answersByRespondent.get("resp-ceo");
    expect(a?.has("S3_recruitment")).toBe(false);
  });

  it("drops a type-mismatched TEXT (number) value", () => {
    const model = buildGroupReportModel(fixtureLvaMalformed());
    const a = model.answersByRespondent.get("resp-ceo");
    expect(a?.has("S2_main_products")).toBe(false);
  });

  it("ignores an answer row for an unknown stableKey and flags degraded", () => {
    const model = buildGroupReportModel(fixtureLvaMalformed());
    expect(model.degraded).toBe(true);
    const a = model.answersByRespondent.get("resp-ceo");
    expect(a?.has("S99_unknown_key")).toBe(false);
  });

  it("a clean cohort is not degraded", () => {
    const model = buildGroupReportModel(fixtureLva());
    expect(model.degraded).toBe(false);
  });

  it("keeps a valid TEXT answer", () => {
    const model = buildGroupReportModel(fixtureLva());
    const a = model.answersByRespondent.get("resp-ceo");
    expect(a?.get("S2_main_products")).toBe("SaaS platform.");
  });

  it("keeps a valid SLIDER answer (finite number)", () => {
    const model = buildGroupReportModel(fixtureLva());
    const a = model.answersByRespondent.get("resp-ceo");
    expect(typeof a?.get("S3_recruitment")).toBe("number");
  });

  it("keys answersByRespondent by respondentId for every cohort member", () => {
    const model = buildGroupReportModel(fixtureLvaWithOrphan());
    for (const r of model.respondents) {
      expect(model.answersByRespondent.has(r.respondentId)).toBe(true);
    }
  });
});

describe("buildGroupReportModel — never throws", () => {
  it("tolerates a completely malformed input shape", () => {
    // Intentionally wrong shapes; the function must not throw.
    const bad = {
      alias: "leadership-vision-alignment",
      version: { questions: "nope" as unknown },
      participants: "nope" as unknown,
      submissions: [
        { respondentId: null, answers: "nope" as unknown, result: 123 as unknown },
        { respondentId: "x", answers: null as unknown, result: null as unknown },
      ] as unknown,
    } as unknown as Parameters<typeof buildGroupReportModel>[0];
    expect(() => buildGroupReportModel(bad)).not.toThrow();
  });
});
