// src/src/lib/assessments/prune-answers.ts

type AnswersMap = Record<string, number | string | string[]>;

/** Drop any answer whose stableKey isn't a currently-rendered question (Wave C R3-M2). */
export function pruneAnswersToQuestions(
  answers: AnswersMap,
  knownStableKeys: Set<string>,
): AnswersMap {
  const keys = Object.keys(answers);
  if (keys.every((k) => knownStableKeys.has(k))) return answers; // unchanged → same ref
  const next: AnswersMap = {};
  for (const k of keys) if (knownStableKeys.has(k)) next[k] = answers[k];
  return next;
}
