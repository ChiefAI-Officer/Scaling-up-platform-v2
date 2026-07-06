/**
 * Wave U (spec 19u D14/U-6) — reserved `walk-qual-` test-walk namespace in
 * reportConfigFor.
 *
 * Any alias starting with the EXACT prefix `walk-qual-` resolves to a
 * qualitative report config ({qualitative, no score table, no tier}) BEFORE
 * the exact-match map lookup. Throwaway TEST templates only — each wave's
 * launch walk needs a fresh alias (walk-qual-u, walk-qual-v, …) because
 * soft-deleted templates keep their alias claimed.
 *
 * These tests pin: the prefix works, the prefix is exact (case + hyphens),
 * and every existing alias + the unknown-alias default are unchanged.
 */

import {
  reportConfigFor,
  DEFAULT_REPORT_CONFIG,
} from "@/lib/assessments/report-config";

const WALK_EXPECTED = {
  reportType: "qualitative",
  showScoreTable: false,
  showTier: false,
};

describe("reportConfigFor — walk-qual- reserved namespace (Wave U D14)", () => {
  it("walk-qual-u resolves to the qualitative walk config", () => {
    expect(reportConfigFor("walk-qual-u")).toEqual(WALK_EXPECTED);
  });

  it("any suffix after the prefix resolves (fresh alias per wave)", () => {
    for (const a of ["walk-qual-v", "walk-qual-2026-07-05", "walk-qual-x-y-z"]) {
      expect(reportConfigFor(a)).toEqual(WALK_EXPECTED);
    }
  });

  it("the bare prefix itself resolves (startsWith semantics)", () => {
    expect(reportConfigFor("walk-qual-")).toEqual(WALK_EXPECTED);
  });

  it("requires the EXACT prefix — no hyphen-drop, no case-fold, no mid-string match", () => {
    for (const a of [
      "walkqual-x",
      "WALK-QUAL-x",
      "Walk-qual-x",
      "walk-Qual-x",
      "xwalk-qual-y",
      "my-walk-qual-u",
      "walk-quali", // missing the trailing hyphen of the prefix
    ]) {
      expect(reportConfigFor(a)).toEqual(DEFAULT_REPORT_CONFIG);
    }
  });

  // ── Regression pins: every existing alias + defaults are unchanged ──────

  it("every existing alias entry is unchanged", () => {
    expect(reportConfigFor("RockHabits")).toEqual({
      reportType: "scored",
      showScoreTable: false,
      showTier: true,
    });
    for (const a of ["qsp-v1", "qsp-v2", "leadership-vision-alignment"]) {
      expect(reportConfigFor(a)).toEqual({
        reportType: "qualitative",
        showScoreTable: false,
        showTier: true,
      });
    }
    expect(reportConfigFor("scaling-up-full")).toEqual({
      reportType: "scored",
      showScoreTable: true,
      showTier: false,
    });
  });

  it("unknown / null / undefined still fall back to the scored default", () => {
    for (const a of ["five-dysfunctions", "nope", null, undefined]) {
      expect(reportConfigFor(a)).toEqual(DEFAULT_REPORT_CONFIG);
    }
    expect(DEFAULT_REPORT_CONFIG).toEqual({
      reportType: "scored",
      showScoreTable: true,
      showTier: true,
    });
  });
});
