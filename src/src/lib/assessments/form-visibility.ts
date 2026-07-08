import type { PagerQuestion } from "@/lib/assessments/section-pages";

type AnswersMap = Record<string, number | string | string[]>;

const LVA_ALIAS = "leadership-vision-alignment";
const LVA_GATE_KEY = "S4_biggest_obstacles";
const LVA_FOLLOWUP_PREFIX = "S5_why_";

interface VisibilityArgs {
  templateAlias?: string | null;
  questions: PagerQuestion[];
  answers: AnswersMap;
}

/**
 * The LVA hardcoded branch — Wave I, verbatim (Wave W D3: untouched).
 *
 * KEPT INTENTIONALLY (Wave W leftovers, spec 19z D2). Migrating this to the
 * generic authored `showIf` engine below was evaluated and DESCOPED: it would
 * require backfilling `showIf` onto already-published (immutable) LVA version
 * rows — otherwise campaigns pinned to a pre-showIf version lose survey-side
 * obstacle-followup hiding — AND it would flip LVA storage (today hidden S5
 * answers are stored + report-suppressed via REPORT_FILTERS; authored showIf
 * would make `pruneHiddenAnswers` drop them pre-persistence). For 18 tested
 * lines Wave W already proved safe (intersection semantics — the generic pass
 * can never resurrect an LVA-hidden question), that prod data op is not worth
 * it. Ledgered as a deferred follow-on ("LVA-migrate-to-authored-showIf").
 */
function applyLvaFilter(
  templateAlias: string | null | undefined,
  questions: PagerQuestion[],
  answers: AnswersMap,
): PagerQuestion[] {
  if (templateAlias !== LVA_ALIAS) return questions;

  const gate = questions.find((question) => question.stableKey === LVA_GATE_KEY);
  if (!gate || gate.type !== "MULTI_CHOICE") return questions;

  const selected = answers[LVA_GATE_KEY];
  const selectedKeys = new Set(Array.isArray(selected) ? selected : []);

  return questions.filter((question) => {
    if (!question.stableKey.startsWith(LVA_FOLLOWUP_PREFIX)) return true;
    const factorKey = question.stableKey.slice(LVA_FOLLOWUP_PREFIX.length);
    return selectedKeys.has(factorKey);
  });
}

/**
 * Wave W — one question's authored show-if, evaluated against the RAW answers
 * (single-level: a gate's own visibility is never consulted; chains are
 * publish-rejected). Fail-open (the LVA precedent): a malformed showIf, a
 * missing gate, or a non-MULTI_CHOICE gate SHOWS the question — the publish
 * gate makes those states unreachable on published versions, so fail-open
 * only ever protects legacy/hand-seeded data.
 */
function showIfSatisfied(
  question: PagerQuestion,
  questionByKey: Map<string, PagerQuestion>,
  answers: AnswersMap,
): boolean {
  const rule = question.showIf;
  if (!rule || typeof rule !== "object") return true;
  const { questionKey, optionKey } = rule;
  if (typeof questionKey !== "string" || questionKey.length === 0) return true;
  if (typeof optionKey !== "string" || optionKey.length === 0) return true;
  const gate = questionByKey.get(questionKey);
  if (!gate || gate.type !== "MULTI_CHOICE") return true;
  const selected = answers[questionKey];
  return Array.isArray(selected) && selected.includes(optionKey);
}

/** Wave W — the generic authored-showIf pass (all templates). */
function applyShowIfFilter(
  questions: PagerQuestion[],
  allQuestions: PagerQuestion[],
  answers: AnswersMap,
): PagerQuestion[] {
  if (!allQuestions.some((q) => q.showIf)) return questions;
  const byKey = new Map(allQuestions.map((q) => [q.stableKey, q]));
  return questions.filter((q) => showIfSatisfied(q, byKey, answers));
}

/**
 * Strict pipeline (C2): LVA alias branch FIRST, generic showIf SECOND —
 * intersection semantics; the generic pass filters the LVA branch's OUTPUT and
 * can never resurrect an LVA-hidden question.
 */
export function filterVisibleSurveyQuestions({
  templateAlias,
  questions,
  answers,
}: VisibilityArgs): PagerQuestion[] {
  const afterLva = applyLvaFilter(templateAlias, questions, answers);
  return applyShowIfFilter(afterLva, questions, answers);
}

export function visibleSurveyQuestionKeys(args: VisibilityArgs): Set<string> {
  return new Set(
    filterVisibleSurveyQuestions(args).map((question) => question.stableKey),
  );
}

/**
 * Wave W (C3/D4) — the SERVER prune entry point: the visible-key set both
 * submit routes use to drop hidden-question answers BEFORE every side effect
 * (scoring, persistence, outbox). Evaluates the GENERIC showIf rules ONLY —
 * never the LVA alias branch (D3: a tampered LVA submit stores-but-suppresses
 * exactly as today; REPORT_FILTERS already hides it report-side).
 * Client/server equivalence on generic templates is a tested property.
 */
export function resolveVisibleSurveyQuestionKeys({
  questions,
  answers,
}: {
  questions: PagerQuestion[];
  answers: AnswersMap;
}): Set<string> {
  return new Set(
    applyShowIfFilter(questions, questions, answers).map((q) => q.stableKey),
  );
}

/**
 * Wave W (C3) — the shared submit-route prune: drops answers whose question is
 * KNOWN and currently hidden by its authored showIf. Answers with UNKNOWN
 * stableKeys are kept — they must keep flowing to scoreSubmission's existing
 * UNKNOWN_STABLE_KEY rejection, not vanish silently. Same-ref when nothing is
 * hidden. Both submit routes call this ONCE, before every side effect.
 */
export function pruneHiddenAnswers<T extends { stableKey: string; value: unknown }>(
  answers: T[],
  questions: PagerQuestion[],
): T[] {
  if (!questions.some((q) => q.showIf)) return answers;
  const answersMap: AnswersMap = {};
  for (const a of answers) answersMap[a.stableKey] = a.value as AnswersMap[string];
  const visible = resolveVisibleSurveyQuestionKeys({ questions, answers: answersMap });
  const known = new Set(questions.map((q) => q.stableKey));
  const next = answers.filter((a) => !known.has(a.stableKey) || visible.has(a.stableKey));
  return next.length === answers.length ? answers : next;
}
