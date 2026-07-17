/**
 * Wave ED7 — shared friendly labels for author-facing enum values.
 *
 * The single-column builder's authoring surfaces must not show raw enum
 * strings (SLIDER_LIKERT, MULTI_CHOICE) to an author. Display text only —
 * option/payload VALUES stay enum strings. (Dormant legacy flag-off surfaces
 * are out of ED7 scope.)
 */
import {
  QUESTION_TYPE_LABELS,
  ACCESS_MODE_LABELS,
  AGGREGATION_MODE_LABELS,
  LANGUAGE_LABELS,
} from "@/components/admin/template-editor/enum-labels";

describe("QUESTION_TYPE_LABELS", () => {
  it("covers all 4 engine question types with friendly names", () => {
    expect(QUESTION_TYPE_LABELS.SLIDER_LIKERT).toBe("Slider");
    expect(QUESTION_TYPE_LABELS.MULTI_CHOICE).toBe("Multiple choice");
    expect(QUESTION_TYPE_LABELS.NUMBER).toBe("Number");
    expect(QUESTION_TYPE_LABELS.TEXT).toBe("Short text");
  });

  it("covers the dormant v1.5 placeholder types shown in the locked select", () => {
    expect(QUESTION_TYPE_LABELS.TEXTAREA).toBe("Paragraph");
    expect(QUESTION_TYPE_LABELS.COMPOUND).toBe("Compound");
  });

  it("contains no raw enum formatting (underscores / all-caps)", () => {
    for (const label of Object.values(QUESTION_TYPE_LABELS)) {
      expect(label).not.toMatch(/_/);
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });
});

// Wave ED10 (spec 19am-plan, T2) — friendly labels for the header
// access/aggregation pills + (reserved) language display. Same degrade-to-self
// convention as QUESTION_TYPE_LABELS: consumers render `LABELS[value] ?? value`.

describe("ACCESS_MODE_LABELS", () => {
  it("maps the stored access enums to friendly names", () => {
    expect(ACCESS_MODE_LABELS.INVITED).toBe("Invited");
    expect(ACCESS_MODE_LABELS.PUBLIC).toBe("Public");
  });

  it("degrades an unknown value to itself (LABELS[value] ?? value)", () => {
    expect(ACCESS_MODE_LABELS.SOMETHING_ELSE ?? "SOMETHING_ELSE").toBe(
      "SOMETHING_ELSE",
    );
  });

  it("contains no raw enum formatting (underscores / all-caps)", () => {
    for (const label of Object.values(ACCESS_MODE_LABELS)) {
      expect(label).not.toMatch(/_/);
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });
});

describe("AGGREGATION_MODE_LABELS", () => {
  it("maps the stored aggregation enums to friendly names", () => {
    expect(AGGREGATION_MODE_LABELS.FULL_VISIBILITY).toBe("Everyone");
    expect(AGGREGATION_MODE_LABELS.CEO_ONLY).toBe("CEO-only");
  });

  it("degrades an unknown value to itself (LABELS[value] ?? value)", () => {
    expect(AGGREGATION_MODE_LABELS.MYSTERY_MODE ?? "MYSTERY_MODE").toBe(
      "MYSTERY_MODE",
    );
  });

  it("contains no raw enum formatting (underscores / all-caps)", () => {
    for (const label of Object.values(AGGREGATION_MODE_LABELS)) {
      expect(label).not.toMatch(/_/);
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });
});

describe("LANGUAGE_LABELS", () => {
  it("is keyed by the REAL stored values (camelCase, NOT hyphenated)", () => {
    // DEFAULT_TEMPLATE_LANGUAGE = "enUS" in active-version.ts — no hyphens.
    expect(LANGUAGE_LABELS.enUS).toBe("English (US)");
    expect(LANGUAGE_LABELS.enGB).toBe("English (UK)");
    expect(LANGUAGE_LABELS.esES).toBe("Spanish (Spain)");
    expect(LANGUAGE_LABELS.frFR).toBe("French (France)");
    // The hyphenated form is NOT a key (guards against the en-US regression).
    expect(LANGUAGE_LABELS["en-US"]).toBeUndefined();
  });

  it("degrades an unknown value to itself (LABELS[value] ?? value)", () => {
    expect(LANGUAGE_LABELS.deDE ?? "deDE").toBe("deDE");
  });
});
