/**
 * Wave U (spec 19u U-3, ADR-0021) — the pure findings resolver.
 *
 * Turns a version's per-question findings rules + one respondent's answers
 * into the list of FIRED findings. Called UNCONDITIONALLY by
 * `scoreSubmission` (the Wave U flag gates authoring + rendering, never this
 * write — flags gate capability, not data correctness) and frozen into the
 * submission's `result.findings` snapshot. Reports only ever render the
 * snapshot; they never re-resolve.
 *
 * Rule shapes (the question's TYPE discriminates — ADR-0021 / spec D3):
 *   SLIDER_LIKERT / NUMBER → bands  { minScore, maxScore, text }  (inclusive)
 *   MULTI_CHOICE           → rules  { optionKey, text }  (per selected option)
 *   TEXT / anything else   → never fires
 *
 * Total-tolerant BY CONTRACT: malformed questions, rules, or answers are
 * skipped silently — this function must never throw (report/scoring paths
 * must not 500 on bad data; house rule since the Wave N hotfix).
 */

export interface ResolvedFinding {
  /** The question's stableKey. */
  stableKey: string;
  /** "SLIDER_LIKERT" | "NUMBER" | "MULTI_CHOICE" — lets renderers select
   *  (the scored report ignores slider entries; sliders render from the
   *  legacy per-row `recommendation` there). */
  questionType: string;
  /** The question's sectionStableKey, when present. */
  sectionStableKey?: string;
  questionLabel: string;
  /** The fired rule's text. */
  text: string;
}

interface BandRule {
  minScore: number;
  maxScore: number;
  text: string;
}

interface OptionRule {
  optionKey: string;
  text: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function asBandRule(raw: unknown): BandRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isFiniteNumber(r.minScore) || !isFiniteNumber(r.maxScore)) return null;
  if (typeof r.text !== "string" || r.text.trim() === "") return null;
  return { minScore: r.minScore, maxScore: r.maxScore, text: r.text };
}

function asOptionRule(raw: unknown): OptionRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.optionKey !== "string" || r.optionKey === "") return null;
  if (typeof r.text !== "string" || r.text.trim() === "") return null;
  return { optionKey: r.optionKey, text: r.text };
}

interface NormalizedQuestion {
  stableKey: string;
  type: string;
  label: string;
  sectionStableKey?: string;
  sortOrder: number;
  recommendations: unknown[];
  /** MULTI_CHOICE option keys in authored order (drives fired-rule order). */
  optionOrder: string[];
}

function normalizeQuestion(raw: unknown, arrayIdx: number): NormalizedQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  if (typeof q.stableKey !== "string" || q.stableKey === "") return null;
  if (typeof q.type !== "string") return null;
  const recs = Array.isArray(q.recommendations) ? q.recommendations : [];
  if (recs.length === 0) return null; // nothing can fire — skip early
  const options = Array.isArray(q.options) ? q.options : [];
  return {
    stableKey: q.stableKey,
    type: q.type,
    label: typeof q.label === "string" && q.label !== "" ? q.label : q.stableKey,
    sectionStableKey:
      typeof q.sectionStableKey === "string" && q.sectionStableKey.trim() !== ""
        ? q.sectionStableKey
        : undefined,
    sortOrder: isFiniteNumber(q.sortOrder) ? q.sortOrder : arrayIdx,
    recommendations: recs,
    optionOrder: options
      .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
      .map((o) => o.key)
      .filter((k): k is string => typeof k === "string"),
  };
}

/**
 * Resolve the fired findings for one respondent.
 *
 * @param questions   the version's questions JSON (array; tolerant of anything)
 * @param answersByKey stableKey → submitted value
 * @returns fired findings ordered by question sortOrder, then (within a
 *          MULTI_CHOICE question) by the question's authored option order.
 */
export function resolveFindings(
  questions: unknown,
  answersByKey: ReadonlyMap<string, unknown>
): ResolvedFinding[] {
  if (!Array.isArray(questions)) return [];

  const normalized = questions
    .map((raw, i) => normalizeQuestion(raw, i))
    .filter((q): q is NormalizedQuestion => q !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const fired: ResolvedFinding[] = [];

  for (const q of normalized) {
    const answer = answersByKey.get(q.stableKey);
    if (answer === undefined || answer === null) continue;

    if (q.type === "SLIDER_LIKERT" || q.type === "NUMBER") {
      if (!isFiniteNumber(answer)) continue;
      // Bands are validated non-overlapping upstream ⇒ at most one matches;
      // still take the FIRST match defensively on malformed data.
      for (const rawBand of q.recommendations) {
        const band = asBandRule(rawBand);
        if (!band) continue;
        if (answer >= band.minScore && answer <= band.maxScore) {
          fired.push({
            stableKey: q.stableKey,
            questionType: q.type,
            sectionStableKey: q.sectionStableKey,
            questionLabel: q.label,
            text: band.text,
          });
          break;
        }
      }
      continue;
    }

    if (q.type === "MULTI_CHOICE") {
      if (!Array.isArray(answer)) continue;
      const selected = new Set(
        answer.filter((v): v is string => typeof v === "string")
      );
      if (selected.size === 0) continue;
      const rules = q.recommendations
        .map(asOptionRule)
        .filter((r): r is OptionRule => r !== null);
      if (rules.length === 0) continue;
      const ruleByOption = new Map<string, OptionRule>();
      // First rule per optionKey wins (duplicates are a publish-tier error;
      // stay deterministic on malformed data).
      for (const r of rules) {
        if (!ruleByOption.has(r.optionKey)) ruleByOption.set(r.optionKey, r);
      }
      // Fire in the question's authored option order, NOT selection order;
      // rules whose optionKey is not among the options trail in rule order
      // (dangling keys are a publish-tier error; stay total here).
      const orderedKeys = [
        ...q.optionOrder,
        ...rules.map((r) => r.optionKey).filter((k) => !q.optionOrder.includes(k)),
      ];
      for (const key of orderedKeys) {
        if (!selected.has(key)) continue;
        const rule = ruleByOption.get(key);
        if (!rule) continue;
        fired.push({
          stableKey: q.stableKey,
          questionType: q.type,
          sectionStableKey: q.sectionStableKey,
          questionLabel: q.label,
          text: rule.text,
        });
      }
      continue;
    }

    // TEXT / unknown types never fire.
  }

  return fired;
}
