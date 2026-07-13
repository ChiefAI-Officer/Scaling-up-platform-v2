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
