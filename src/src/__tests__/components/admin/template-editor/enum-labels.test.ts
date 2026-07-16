/**
 * Wave ED7 — shared friendly labels for author-facing enum values.
 *
 * The single-column builder's authoring surfaces must not show raw enum
 * strings (SLIDER_LIKERT, MULTI_CHOICE) to an author. Display text only —
 * option/payload VALUES stay enum strings. (Dormant legacy flag-off surfaces
 * are out of ED7 scope.)
 */
import { QUESTION_TYPE_LABELS } from "@/components/admin/template-editor/enum-labels";

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
