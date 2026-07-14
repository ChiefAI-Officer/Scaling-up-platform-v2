/**
 * Unit tests for useEditorSelection (ED3 Task 3).
 *
 * Covers the setters and the batched `resetSelection` helper + its stable
 * identity. The tab-switch RESET *behavior* (that resetSelection reproduces)
 * is pinned end-to-end through the public UI in
 * editor-byte-equivalence.test.tsx.
 */

import { act, renderHook } from "@testing-library/react";

import { useEditorSelection } from "../useEditorSelection";

describe("useEditorSelection", () => {
  it("starts with no section selected and no question focused", () => {
    const { result } = renderHook(() => useEditorSelection());
    expect(result.current.selectedSectionStableKey).toBeNull();
    expect(result.current.focusedQuestionUid).toBeNull();
  });

  it("setSelectedSectionStableKey / setFocusedQuestionUid update independently", () => {
    const { result } = renderHook(() => useEditorSelection());

    act(() => result.current.setSelectedSectionStableKey("S2"));
    expect(result.current.selectedSectionStableKey).toBe("S2");
    expect(result.current.focusedQuestionUid).toBeNull();

    act(() => result.current.setFocusedQuestionUid("S2_q3"));
    expect(result.current.selectedSectionStableKey).toBe("S2");
    expect(result.current.focusedQuestionUid).toBe("S2_q3");

    act(() => result.current.setFocusedQuestionUid(null));
    expect(result.current.focusedQuestionUid).toBeNull();
    expect(result.current.selectedSectionStableKey).toBe("S2");
  });

  it("resetSelection sets BOTH slices in one call", () => {
    const { result } = renderHook(() => useEditorSelection());

    act(() => {
      result.current.setSelectedSectionStableKey("S2");
      result.current.setFocusedQuestionUid("S2_q3");
    });
    expect(result.current.selectedSectionStableKey).toBe("S2");
    expect(result.current.focusedQuestionUid).toBe("S2_q3");

    // Reproduce a remount reset to the first section + its first question.
    act(() => result.current.resetSelection("S1", "S1_q1"));
    expect(result.current.selectedSectionStableKey).toBe("S1");
    expect(result.current.focusedQuestionUid).toBe("S1_q1");

    // Reset can also clear both (no sections case).
    act(() => result.current.resetSelection(null, null));
    expect(result.current.selectedSectionStableKey).toBeNull();
    expect(result.current.focusedQuestionUid).toBeNull();
  });

  it("resetSelection keeps a stable identity across renders", () => {
    const { result, rerender } = renderHook(() => useEditorSelection());
    const first = result.current.resetSelection;

    act(() => result.current.setFocusedQuestionUid("S1_q9"));
    rerender();

    expect(result.current.resetSelection).toBe(first);
  });
});

/**
 * ED5 (Wave ED5 Task 3, audit C) — collapsedSections slice.
 *
 * `EditorOutline` used to own section-collapse as LOCAL state, which reset
 * every time it unmounted (the flag-ON "Edit" tab body — a Radix
 * `TabsContent` that is not force-mounted — unmounts on tab-away and
 * remounts on tab-back, unlike `focusedQuestionUid` which already lived here
 * and so persisted). Lifting collapse into this always-mounted hook closes
 * that inconsistency. Additive only — the fields above are untouched.
 */
describe("useEditorSelection — collapsedSections slice", () => {
  it("a section starts expanded (not collapsed)", () => {
    const { result } = renderHook(() => useEditorSelection());
    expect(result.current.isSectionCollapsed("S1")).toBe(false);
  });

  it("toggleSectionCollapsed flips collapsed state per-key", () => {
    const { result } = renderHook(() => useEditorSelection());

    act(() => result.current.toggleSectionCollapsed("S1"));
    expect(result.current.isSectionCollapsed("S1")).toBe(true);
    expect(result.current.isSectionCollapsed("S2")).toBe(false);

    act(() => result.current.toggleSectionCollapsed("S1"));
    expect(result.current.isSectionCollapsed("S1")).toBe(false);
  });

  it("setSectionCollapsed sets an explicit value regardless of prior state", () => {
    const { result } = renderHook(() => useEditorSelection());

    act(() => result.current.setSectionCollapsed("S1", true));
    expect(result.current.isSectionCollapsed("S1")).toBe(true);

    act(() => result.current.setSectionCollapsed("S1", false));
    expect(result.current.isSectionCollapsed("S1")).toBe(false);

    // Idempotent: setting the same value again is a no-op effect-wise.
    act(() => result.current.setSectionCollapsed("S1", false));
    expect(result.current.isSectionCollapsed("S1")).toBe(false);
  });

  it("collapse state persists across re-renders of the same hook instance", () => {
    const { result, rerender } = renderHook(() => useEditorSelection());

    act(() => result.current.toggleSectionCollapsed("S1"));
    rerender();
    expect(result.current.isSectionCollapsed("S1")).toBe(true);
  });

  it("toggleSectionCollapsed / setSectionCollapsed / isSectionCollapsed keep stable identities across renders", () => {
    const { result, rerender } = renderHook(() => useEditorSelection());
    const firstToggle = result.current.toggleSectionCollapsed;
    const firstSet = result.current.setSectionCollapsed;
    const firstIs = result.current.isSectionCollapsed;

    act(() => result.current.setFocusedQuestionUid("S1_q9"));
    rerender();

    expect(result.current.toggleSectionCollapsed).toBe(firstToggle);
    expect(result.current.setSectionCollapsed).toBe(firstSet);
    expect(result.current.isSectionCollapsed).toBe(firstIs);
  });
});
