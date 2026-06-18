/**
 * Assessment v7.6 Wave E — shared per-question metadata builder.
 *
 * Single source of truth for turning a version's raw `questions` JSON into a
 * `stableKey → QuestionMeta` map. Consumed by BOTH report loaders:
 *   - respondent-report.ts (the authorized on-screen loader), and
 *   - report-email.ts's buildRespondentReportFromSubmission (the email twin),
 * so the two paths carry identical type+label+section+scale+options metadata
 * and can never drift (co-validate C-M1).
 *
 * PURE — no DB, no React, no network. report-email.ts must be able to import
 * this without pulling in any DB code, so this module stays dependency-free.
 *
 * `options` ({key,label}[]) is what lets the qualitative model resolve a stored
 * MULTI_CHOICE answer (an array of option KEYS) back to its human LABELS
 * (co-validate C-H1). Only well-formed {key,label} entries are captured.
 *
 * `min`/`max` come from the question's `scale` and let 1–N ratings render
 * (Weak/Average/Strong matrices, percent bars, statement tables).
 */

export interface QuestionMetaOption {
  key: string;
  label: string;
}

export interface QuestionMeta {
  type: string;
  label: string;
  sectionStableKey?: string;
  min?: number;
  max?: number;
  /** MULTI_CHOICE option list ({key,label}); present only when well-formed. */
  options?: QuestionMetaOption[];
}

interface RawScale {
  min?: number;
  max?: number;
}

interface RawQuestion {
  stableKey: string;
  label: string;
  type?: string;
  sectionStableKey?: string;
  scale?: RawScale;
  options?: unknown;
}

function isRawQuestion(v: unknown): v is RawQuestion {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.stableKey === "string" && typeof r.label === "string";
}

function isOption(v: unknown): v is QuestionMetaOption {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.key === "string" && typeof o.label === "string";
}

/**
 * Builds a `stableKey → QuestionMeta` map from a version's raw `questions`.
 *
 * - First-wins on a duplicate stableKey (warns once, mirroring the prior
 *   hand-rolled loader behavior).
 * - Captures `scale.min`/`scale.max` (numbers only) and well-formed
 *   `{key,label}` options (malformed entries are dropped; the `options` key is
 *   omitted entirely when none survive).
 * - Non-array / malformed input → empty map (never throws).
 */
export function buildQuestionMetaByKey(
  questions: unknown,
): Record<string, QuestionMeta> {
  const map: Record<string, QuestionMeta> = {};
  if (!Array.isArray(questions)) return map;

  const seen = new Set<string>();
  for (const q of questions as unknown[]) {
    if (!isRawQuestion(q)) continue;
    if (seen.has(q.stableKey)) {
      console.warn(
        `[question-meta] duplicate stableKey "${q.stableKey}" in version.questions — keeping first occurrence`,
      );
      continue;
    }
    seen.add(q.stableKey);

    const meta: QuestionMeta = {
      type: typeof q.type === "string" ? q.type : "UNKNOWN",
      label: q.label,
    };
    if (typeof q.sectionStableKey === "string") {
      meta.sectionStableKey = q.sectionStableKey;
    }
    if (q.scale && typeof q.scale === "object") {
      if (typeof q.scale.min === "number") meta.min = q.scale.min;
      if (typeof q.scale.max === "number") meta.max = q.scale.max;
    }
    if (Array.isArray(q.options)) {
      const opts = (q.options as unknown[])
        .filter(isOption)
        .map((o) => ({ key: o.key, label: o.label }));
      if (opts.length > 0) meta.options = opts;
    }

    map[q.stableKey] = meta;
  }

  return map;
}
