/**
 * Esperto historical import — results-plan (PURE) unit tests.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §6 (results import),
 * §7 (crosswalk lock gate); plan 12a step 8, edges 11–16, ADR-0006.
 *
 * buildResultsImportPlan is pure (no DB, no React). It takes a parsed Report
 * export + a (test-)locked crosswalk + the target org's roster and produces a
 * reconstructed-campaign / skip / block plan whose answer rows mirror the live
 * submit route's `{ stableKey, value }` shape. These tests lock:
 *   - the locked:false gate (results refused, no campaigns),
 *   - exhaustiveness (an unknown answer key → block),
 *   - group-by-campaignid + namespaced externalId + min/max openAt/closeAt,
 *   - per-row answer construction (slider>0 only, no value:0; TEXT non-empty),
 *   - unresolved-member → skip (never anonymize),
 *   - zero-scorable → skip (never a neutral submission).
 */

import { readFileSync } from "fs";
import { join } from "path";

import { buildResultsImportPlan } from "../../../../lib/assessments/esperto-import/results-plan";
import { parseEspertoExport } from "../../../../lib/assessments/esperto-import/parse";
import { qspV2Crosswalk } from "../../../../lib/assessments/esperto-import/crosswalks";
import type { Crosswalk } from "../../../../lib/assessments/esperto-import/crosswalks";
import type { EspertoReport } from "../../../../lib/assessments/esperto-import/types";

const FIX_DIR = join(__dirname, "fixtures");

/** Load the real QSP v2 report fixture (3 personal rows, campaignid BDvhuDORxZ). */
function loadReport(): EspertoReport {
  const json = JSON.parse(readFileSync(join(FIX_DIR, "report-qsp-v2.json"), "utf8"));
  const parsed = parseEspertoExport(json);
  if (parsed.kind !== "report") throw new Error("fixture is not a report");
  return parsed.data;
}

/** The real crosswalk is still locked:false — build a locked copy for happy paths. */
const lockedCrosswalk: Crosswalk = { ...qspV2Crosswalk, locked: true };

const TARGET_ORG = "org-123";

/** The 3 fixture memberids, in row order. */
const FIXTURE_MEMBERIDS = ["MxRWB1GIwu", "CVMmsiWPTP", "mWSw2H9f6E"];
const FIXTURE_CAMPAIGN = "BDvhuDORxZ";

/** A roster that resolves all 3 fixture memberids. */
function fullRoster(): { id: string; externalId: string | null }[] {
  return FIXTURE_MEMBERIDS.map((m, i) => ({ id: `resp-${i}`, externalId: m }));
}

describe("buildResultsImportPlan — locked gate (§7)", () => {
  it("refuses a not-locked crosswalk: blocks crosswalk-not-locked, no campaigns", () => {
    const plan = buildResultsImportPlan({
      parsedReport: loadReport(),
      crosswalk: { ...qspV2Crosswalk, locked: false }, // force-unlocked to exercise the gate (real QSP is now locked:true)
      targetOrgId: TARGET_ORG,
      respondents: fullRoster(),
    });

    expect(plan.campaigns).toHaveLength(0);
    expect(plan.blocks).toEqual([
      { reason: "crosswalk-not-locked", detail: qspV2Crosswalk.templateAlias },
    ]);
    // No skips emitted either — the whole import is refused upfront.
    expect(plan.skips).toEqual([]);
  });
});

describe("buildResultsImportPlan — happy path (locked + full roster)", () => {
  it("reconstructs ONE campaign (namespaced externalId) with 3 rows", () => {
    const plan = buildResultsImportPlan({
      parsedReport: loadReport(),
      crosswalk: lockedCrosswalk,
      targetOrgId: TARGET_ORG,
      respondents: fullRoster(),
    });

    expect(plan.blocks).toEqual([]);
    expect(plan.skips).toEqual([]);
    expect(plan.campaigns).toHaveLength(1);

    const c = plan.campaigns[0];
    expect(c.espertoCampaignId).toBe(FIXTURE_CAMPAIGN);
    expect(c.externalId).toBe(`esperto:${FIXTURE_CAMPAIGN}`);
    expect(c.name).toContain(lockedCrosswalk.templateAlias);
    expect(c.name).toContain(FIXTURE_CAMPAIGN);
    expect(c.rows).toHaveLength(3);
  });

  it("sets openAt/closeAt = min/max of the row dates; submittedAt = each row's date", () => {
    const plan = buildResultsImportPlan({
      parsedReport: loadReport(),
      crosswalk: lockedCrosswalk,
      targetOrgId: TARGET_ORG,
      respondents: fullRoster(),
    });
    const c = plan.campaigns[0];

    // Fixture dates: row1 15:53:27, row2 15:55:53, row3 15:58:38 (all -04:00).
    expect(c.openAt).toBe("2026-06-04T15:53:27-04:00");
    expect(c.closeAt).toBe("2026-06-04T15:58:38-04:00");

    const byMember = new Map(c.rows.map((r) => [r.memberid, r]));
    expect(byMember.get("MxRWB1GIwu")!.submittedAt).toBe("2026-06-04T15:53:27-04:00");
    expect(byMember.get("CVMmsiWPTP")!.submittedAt).toBe("2026-06-04T15:55:53-04:00");
    expect(byMember.get("mWSw2H9f6E")!.submittedAt).toBe("2026-06-04T15:58:38-04:00");
  });

  it("resolves each row to its roster respondentId by externalId === memberid", () => {
    const plan = buildResultsImportPlan({
      parsedReport: loadReport(),
      crosswalk: lockedCrosswalk,
      targetOrgId: TARGET_ORG,
      respondents: fullRoster(),
    });
    const byMember = new Map(plan.campaigns[0].rows.map((r) => [r.memberid, r]));
    expect(byMember.get("MxRWB1GIwu")!.respondentId).toBe("resp-0");
    expect(byMember.get("CVMmsiWPTP")!.respondentId).toBe("resp-1");
    expect(byMember.get("mWSw2H9f6E")!.respondentId).toBe("resp-2");
  });

  it("builds {stableKey,value} answers: sliders >0 only (NO value:0), TEXT non-empty only", () => {
    const plan = buildResultsImportPlan({
      parsedReport: loadReport(),
      crosswalk: lockedCrosswalk,
      targetOrgId: TARGET_ORG,
      respondents: fullRoster(),
    });
    const row1 = plan.campaigns[0].rows.find((r) => r.memberid === "MxRWB1GIwu")!;
    const byKey = new Map(row1.answers.map((a) => [a.stableKey, a.value]));

    // NUMBER Q1=6 → included as a number.
    expect(byKey.get("P1_overall_rating")).toBe(6);
    // SLIDER Q9=5 → included.
    expect(byKey.get("P2_checkin_slider")).toBe(5);
    // Slider matrix Q3_1=6, Q3_2=7, Q3_3=4, Q3_4=6, Q3_6=4 → all included.
    expect(byKey.get("P1_rate_success_rocks")).toBe(6);
    expect(byKey.get("P1_rate_pride")).toBe(4);
    // TEXT Q2 non-empty → included as a string.
    expect(byKey.get("P1_rating_explanation")).toBe("adfasdf dfd f dfa sdfads ");
    // Empty TEXT Q5b/Q5c → omitted entirely.
    expect(byKey.has("P1_core_values_story_2")).toBe(false);
    expect(byKey.has("P1_core_values_story_3")).toBe(false);
    // No answer carries a slider value of 0, ever.
    for (const a of row1.answers) {
      if (typeof a.value === "number") {
        expect(a.value).toBeGreaterThan(0);
      }
    }
  });

  it("emits no answer for a value of exactly 0 (slider min is 1; 0 is unanswered)", () => {
    // Synthesize a report whose Q1 (NUMBER) is 0 and Q9 (SLIDER) is 0, but a
    // matrix slider is a real value so the row is still scorable.
    const base = loadReport();
    const row = { ...base.personal[0] } as Record<string, unknown>;
    row.raw_Q1 = 0; // NUMBER zero → omit
    row.raw_Q9 = 0; // slider zero → omit
    const report: EspertoReport = { ...base, personal: [row as never] };

    const plan = buildResultsImportPlan({
      parsedReport: report,
      crosswalk: lockedCrosswalk,
      targetOrgId: TARGET_ORG,
      respondents: fullRoster(),
    });
    const r = plan.campaigns[0].rows[0];
    const byKey = new Map(r.answers.map((a) => [a.stableKey, a.value]));
    expect(byKey.has("P1_overall_rating")).toBe(false);
    expect(byKey.has("P2_checkin_slider")).toBe(false);
    // The matrix sliders (Q3_*) are still real → row remains scorable.
    expect(byKey.get("P1_rate_success_rocks")).toBe(6);
  });
});

describe("buildResultsImportPlan — skips & blocks", () => {
  it("skips a row whose memberid is not in the roster (unresolved-member, never anonymize)", () => {
    // Roster resolves only the first two members.
    const partialRoster = [
      { id: "resp-0", externalId: "MxRWB1GIwu" },
      { id: "resp-1", externalId: "CVMmsiWPTP" },
    ];
    const plan = buildResultsImportPlan({
      parsedReport: loadReport(),
      crosswalk: lockedCrosswalk,
      targetOrgId: TARGET_ORG,
      respondents: partialRoster,
    });

    expect(plan.blocks).toEqual([]);
    expect(plan.skips).toContainEqual({
      memberid: "mWSw2H9f6E",
      campaignid: FIXTURE_CAMPAIGN,
      reason: "unresolved-member",
    });
    // Only the two resolved rows are imported.
    expect(plan.campaigns[0].rows).toHaveLength(2);
    expect(plan.campaigns[0].rows.map((r) => r.memberid).sort()).toEqual(
      ["CVMmsiWPTP", "MxRWB1GIwu"],
    );
  });

  it("blocks an unknown answer key (raw_Q99) via the exhaustiveness guard", () => {
    const base = loadReport();
    const row = { ...base.personal[0], raw_Q99: 3 } as Record<string, unknown>;
    const report: EspertoReport = { ...base, personal: [row as never] };

    const plan = buildResultsImportPlan({
      parsedReport: report,
      crosswalk: lockedCrosswalk,
      targetOrgId: TARGET_ORG,
      respondents: fullRoster(),
    });

    expect(plan.blocks).toContainEqual(
      expect.objectContaining({ reason: "unknown-answer-key" }),
    );
    const block = plan.blocks.find((b) => b.reason === "unknown-answer-key")!;
    expect(block.detail).toContain("Q99");
  });

  it("skips a row with zero scorable sliders (zero-scorable, no neutral submission)", () => {
    // Blank out every SLIDER_LIKERT (Q3_* + Q9); leave NUMBER/TEXT intact.
    const base = loadReport();
    const row = { ...base.personal[0] } as Record<string, unknown>;
    for (const k of ["Q3_1", "Q3_2", "Q3_3", "Q3_4", "Q3_6", "Q9"]) {
      row["raw_" + k] = 0;
    }
    const report: EspertoReport = { ...base, personal: [row as never] };

    const plan = buildResultsImportPlan({
      parsedReport: report,
      crosswalk: lockedCrosswalk,
      targetOrgId: TARGET_ORG,
      respondents: fullRoster(),
    });

    expect(plan.skips).toContainEqual({
      memberid: "MxRWB1GIwu",
      campaignid: FIXTURE_CAMPAIGN,
      reason: "zero-scorable",
    });
    // No row emitted for that member; the campaign exists but is empty.
    expect(plan.campaigns[0].rows).toHaveLength(0);
  });
});

describe("buildResultsImportPlan — answer-value-anomaly (Codex final review)", () => {
  it("BLOCKS a present-but-wrong-type value instead of silently omitting it", () => {
    const report = loadReport();
    // Q1 → P1_overall_rating (NUMBER): inject a non-numeric, non-blank value.
    (report.personal[0] as Record<string, unknown>).raw_Q1 = "not-a-number";
    // Q2 → P1_rating_explanation (TEXT): inject a non-string, non-blank value.
    (report.personal[1] as Record<string, unknown>).raw_Q2 = 42;
    const plan = buildResultsImportPlan({
      parsedReport: report,
      crosswalk: lockedCrosswalk,
      targetOrgId: TARGET_ORG,
      respondents: fullRoster(),
    });
    const anomalies = plan.blocks.filter((b) => b.reason === "answer-value-anomaly");
    expect(anomalies.length).toBeGreaterThanOrEqual(2);
    expect(anomalies.some((b) => b.detail?.includes("P1_overall_rating"))).toBe(true);
    expect(anomalies.some((b) => b.detail?.includes("P1_rating_explanation"))).toBe(true);
  });

  it("does NOT flag legitimate blanks/0 (empty string, 0, missing → omitted, no block)", () => {
    const report = loadReport();
    // Legitimate unanswered states must NOT become anomalies.
    (report.personal[0] as Record<string, unknown>).raw_Q2 = ""; // blank TEXT
    (report.personal[0] as Record<string, unknown>).raw_Q1 = 0; // 0 NUMBER (unanswered sentinel)
    const plan = buildResultsImportPlan({
      parsedReport: report,
      crosswalk: lockedCrosswalk,
      targetOrgId: TARGET_ORG,
      respondents: fullRoster(),
    });
    expect(plan.blocks.filter((b) => b.reason === "answer-value-anomaly")).toHaveLength(0);
  });
});
