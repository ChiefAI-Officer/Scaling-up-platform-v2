/**
 * ED6 Task 6 — pure per-card view-model builder (co-validate §15.6).
 * Badges are the honest-data signal; a plain slider yields all-false badges.
 */
import {
  buildCardViewModels,
  type CardViewModel,
} from "@/components/admin/template-editor/single-column-view-model";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

const sections = [
  { uid: "s1", stableKey: "S1", name: "Section One" },
  { uid: "s2", stableKey: "S2", name: "Section Two" },
] as unknown as SectionDraft[];

function mkRow(over: Partial<QuestionDraftRow> & { uid: string }): QuestionDraftRow {
  return {
    uid: over.uid,
    stableKey: over.stableKey ?? over.uid,
    sectionStableKey: "S1",
    label: "",
    helpText: "",
    isRequired: false,
    type: "SLIDER_LIKERT",
    sortOrder: 1,
    scaleMin: 0,
    scaleMax: 3,
    scaleStep: 1,
    anchorMin: "",
    anchorMax: "",
    options: [],
    maxChoices: null,
    isInherited: false,
    isNewToDraft: true,
    findingBands: [],
    findingOptionTexts: {},
    showIf: null,
    ...over,
  } as QuestionDraftRow;
}

describe("buildCardViewModels (ED6)", () => {
  it("a plain slider has all-false badges", () => {
    const vm = buildCardViewModels(
      [mkRow({ uid: "q1", type: "SLIDER_LIKERT" })],
      sections,
      { conditionalEnabled: true },
    );
    expect(vm.get("q1")!.badges).toEqual({
      findings: false,
      showIf: false,
      required: false,
      unassigned: false,
    });
  });

  it("lights the findings badge for findingBands OR a non-blank option text", () => {
    const vm = buildCardViewModels(
      [
        mkRow({ uid: "bands", findingBands: [{}] as never }),
        mkRow({ uid: "opt", findingOptionTexts: { a: "do X" } }),
        mkRow({ uid: "blank", findingOptionTexts: { a: "  " } }),
      ],
      sections,
      { conditionalEnabled: true },
    );
    expect(vm.get("bands")!.badges.findings).toBe(true);
    expect(vm.get("opt")!.badges.findings).toBe(true);
    expect(vm.get("blank")!.badges.findings).toBe(false);
  });

  it("show-if badge only lights for a valid rule AND when conditionalEnabled", () => {
    const rows = [
      mkRow({ uid: "cond", showIf: { questionKey: "S1_g", optionKey: "a" } }),
      mkRow({ uid: "empty", showIf: { questionKey: "", optionKey: "" } }),
    ];
    const on = buildCardViewModels(rows, sections, { conditionalEnabled: true });
    expect(on.get("cond")!.badges.showIf).toBe(true);
    expect(on.get("empty")!.badges.showIf).toBe(false);
    const off = buildCardViewModels(rows, sections, {
      conditionalEnabled: false,
    });
    expect(off.get("cond")!.badges.showIf).toBe(false);
  });

  it("required + unassigned badges", () => {
    const vm = buildCardViewModels(
      [
        mkRow({ uid: "req", isRequired: true }),
        mkRow({ uid: "orphan", sectionStableKey: "GONE" }),
      ],
      sections,
      { conditionalEnabled: true },
    );
    expect(vm.get("req")!.badges.required).toBe(true);
    expect(vm.get("orphan")!.badges.unassigned).toBe(true);
    expect(vm.get("req")!.badges.unassigned).toBe(false);
  });

  it("position is 1-based within the section by ascending sortOrder, one entry per uid", () => {
    const vm = buildCardViewModels(
      [
        mkRow({ uid: "b", sectionStableKey: "S1", sortOrder: 2 }),
        mkRow({ uid: "a", sectionStableKey: "S1", sortOrder: 1 }),
        mkRow({ uid: "x", sectionStableKey: "S2", sortOrder: 5 }),
      ],
      sections,
      { conditionalEnabled: true },
    );
    expect(vm.size).toBe(3);
    expect(vm.get("a")!.position).toBe(1);
    expect(vm.get("b")!.position).toBe(2);
    expect(vm.get("x")!.position).toBe(1); // first in its own section
  });

  it("carries through identity fields", () => {
    const vm: Map<string, CardViewModel> = buildCardViewModels(
      [mkRow({ uid: "q1", stableKey: "S1_REV", type: "NUMBER", label: "Revenue?" })],
      sections,
      { conditionalEnabled: true },
    );
    const c = vm.get("q1")!;
    expect(c.stableKey).toBe("S1_REV");
    expect(c.type).toBe("NUMBER");
    expect(c.label).toBe("Revenue?");
  });
});
