// src/src/lib/assessments/use-answer-draft.ts
import React from "react";
type AnswersMap = Record<string, number | string | string[]>;

export function invitedDraftKey(campaignAlias: string): string {
  return `assessment-draft:inv:${campaignAlias}`;
}
export function publicDraftKey(campaignAlias: string): string {
  if (typeof window === "undefined") return `assessment-draft:pub:${campaignAlias}:ssr`; // sentinel; the hook no-ops on the server
  let id = sessionStorage.getItem("su-quiz-session");
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("su-quiz-session", id); }
  return `assessment-draft:pub:${campaignAlias}:${id}`;
}

export function useAnswerDraft(storageKey: string | null, answers: AnswersMap, setAnswers: (m: AnswersMap) => void) {
  const hydrated = React.useRef(false);
  const setAnswersRef = React.useRef(setAnswers);
  React.useLayoutEffect(() => { setAnswersRef.current = setAnswers; });
  React.useEffect(() => {
    if (!storageKey || hydrated.current || typeof window === "undefined") return;
    hydrated.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === "object") setAnswersRef.current(parsed); }
    } catch { /* ignore corrupt draft */ }
  }, [storageKey]);

  React.useEffect(() => {
    if (!storageKey || !hydrated.current || typeof window === "undefined") return;
    const t = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify(answers)); } catch { /* quota */ }
    }, 500);
    return () => clearTimeout(t);
  }, [storageKey, answers]);

  const clearDraft = React.useCallback(() => {
    if (!storageKey || typeof window === "undefined") return;
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [storageKey]);

  return { clearDraft };
}
