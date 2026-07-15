/**
 * ED6 Task 9 — render-count guard (co-validate §15.6).
 *
 * `questionCardPropsAreEqual` IS React.memo's re-render gate for QuestionCard.
 * The parent rebuilds the whole `Map<uid, CardViewModel>` on every render, so a
 * card's `vm` object identity always changes; the guard must return TRUE (skip
 * re-render) when the card's field VALUES are unchanged — that is exactly what
 * lets editing one card avoid re-rendering the other 60. These assertions pin
 * that contract deterministically (more robust than a flaky DOM render-spy).
 */
import {
  questionCardPropsAreEqual,
  type QuestionCardProps,
} from "@/components/admin/template-editor/QuestionCard";
import type { CardViewModel } from "@/components/admin/template-editor/single-column-view-model";

const noop = () => {};
const sections = [
  { stableKey: "S1", name: "One" },
  { stableKey: "S2", name: "Two" },
];

function vm(over: Partial<CardViewModel> = {}): CardViewModel {
  const { badges: badgeOver, ...rest } = over;
  return {
    uid: "q1",
    stableKey: "S1_q",
    type: "NUMBER",
    label: "Revenue",
    sectionStableKey: "S1",
    position: 1,
    badges: {
      findings: false,
      showIf: false,
      required: false,
      unassigned: false,
      ...(badgeOver ?? {}),
    },
    ...rest,
  };
}

function props(over: Partial<QuestionCardProps> = {}): QuestionCardProps {
  return {
    vm: vm(),
    isFocused: false,
    isReadOnly: false,
    sections,
    onFocus: noop,
    onDuplicate: noop,
    onDelete: noop,
    onMove: noop,
    registerFocusRef: noop,
    ...over,
  };
}

describe("QuestionCard render guard (ED6 T9)", () => {
  it("SKIPS re-render when a fresh vm object has identical values (another card was edited)", () => {
    // A brand-new vm object + fresh handler identities — exactly what the parent
    // produces when card B is untouched but the Map/handlers were rebuilt.
    expect(
      questionCardPropsAreEqual(
        props(),
        props({ vm: vm(), onFocus: () => {}, onDuplicate: () => {} }),
      ),
    ).toBe(true);
  });

  it("re-renders when the label changes", () => {
    expect(questionCardPropsAreEqual(props(), props({ vm: vm({ label: "New" }) }))).toBe(false);
  });

  it("re-renders when focus toggles", () => {
    expect(questionCardPropsAreEqual(props(), props({ isFocused: true }))).toBe(false);
  });

  it("NEVER skips a focused card (it renders the live expanded body — T11)", () => {
    expect(
      questionCardPropsAreEqual(props({ isFocused: true }), props({ isFocused: true })),
    ).toBe(false);
  });

  it("re-renders when a state badge changes", () => {
    expect(
      questionCardPropsAreEqual(props(), props({ vm: vm({ badges: { findings: true } }) })),
    ).toBe(false);
  });

  it("re-renders when position or section changes", () => {
    expect(questionCardPropsAreEqual(props(), props({ vm: vm({ position: 2 }) }))).toBe(false);
    expect(
      questionCardPropsAreEqual(props(), props({ vm: vm({ sectionStableKey: "S2" }) })),
    ).toBe(false);
  });

  it("re-renders when the section list (move-select options) changes", () => {
    expect(
      questionCardPropsAreEqual(
        props(),
        props({
          sections: [
            { stableKey: "S1", name: "Renamed" },
            { stableKey: "S2", name: "Two" },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("re-renders when isReadOnly changes", () => {
    expect(questionCardPropsAreEqual(props(), props({ isReadOnly: true }))).toBe(false);
  });
});
