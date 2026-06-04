// src/src/__tests__/lib/assessments/use-answer-draft.test.tsx
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { useAnswerDraft, publicDraftKey, invitedDraftKey } from "@/lib/assessments/use-answer-draft";

function Harness({ storageKey }: { storageKey: string | null }) {
  const [answers, setAnswers] = React.useState<Record<string, number | string | string[]>>({});
  const { clearDraft } = useAnswerDraft(storageKey, answers, setAnswers);
  return (
    <div>
      <span data-testid="ans">{JSON.stringify(answers)}</span>
      <button onClick={() => setAnswers({ q1: 2 })}>set</button>
      <button onClick={() => clearDraft()}>clear</button>
    </div>
  );
}

describe("useAnswerDraft", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it("hydrates answers from localStorage on mount", () => {
    localStorage.setItem("k1", JSON.stringify({ q1: 3 }));
    render(<Harness storageKey="k1" />);
    expect(screen.getByTestId("ans").textContent).toBe(JSON.stringify({ q1: 3 }));
  });

  it("debounce-writes answers and clearDraft removes the entry", () => {
    render(<Harness storageKey="k1" />);
    act(() => { screen.getByText("set").click(); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(JSON.parse(localStorage.getItem("k1")!)).toEqual({ q1: 2 });
    act(() => { screen.getByText("clear").click(); });
    expect(localStorage.getItem("k1")).toBeNull();
  });

  it("does nothing when storageKey is null", () => {
    render(<Harness storageKey={null} />);
    act(() => { screen.getByText("set").click(); jest.advanceTimersByTime(600); });
    expect(localStorage.length).toBe(0);
  });

  it("ignores a corrupt (non-JSON) stored draft", () => {
    localStorage.setItem("k1", "not-json");
    render(<Harness storageKey="k1" />);
    expect(screen.getByTestId("ans").textContent).toBe("{}");
  });

  it("publicDraftKey isolates two sessions via a sessionStorage UUID", () => {
    const k1 = publicDraftKey("camp");
    sessionStorage.clear(); // simulate a different session
    const k2 = publicDraftKey("camp");
    expect(k1).not.toBe(k2);
    expect(invitedDraftKey("camp")).toBe("assessment-draft:inv:camp");
  });
});
