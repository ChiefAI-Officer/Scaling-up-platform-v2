/**
 * Assessment v7.6 Wave L (L3 + L4) — LVA group-report DISPLAY constants.
 *
 * Display-layer (code-only, global/retroactive — like report-config / the
 * REPORT_FILTERS, explicitly NOT the version-pinned seed) constants for the
 * Leadership Vision Alignment GROUP report's source-fidelity polish:
 *
 *   L3  — the rating value on Esperto's 0–10 scale (S3 only), via `ceil1` +
 *         the {1,2,3}-domain validation helper.
 *   L4a — the report factor-label overrides (the Esperto *report* labels differ
 *         from the *survey* labels for ~6 factors).
 *   L4b — the verbatim section intros (the Esperto report prints a sentence per
 *         section; the seed `description` is a paraphrase, not the source string).
 *
 * Everything here is gated on `templateAlias === LVA_TEMPLATE_ALIAS` at the call
 * site; the constants themselves are pure data + pure helpers (no DB, no React).
 * They apply to ALL LVA versions (the labels/intros are an Esperto-report
 * presentation contract, not a per-version content choice).
 *
 * Evidence: docs/specs/v7.6/18-lva-source-fidelity-audit.md (§3 + §2.4) and the
 * `Leadership_Vision_Alignment_Group_report_…pdf` p3–p11.
 */

/** The LVA template alias — the single gate for all LVA-only display rules. */
export const LVA_TEMPLATE_ALIAS = "leadership-vision-alignment";

/**
 * Group-report render-version provenance (R2-M1). This is a code-only render
 * change with no contentHash/versionId bump, so a stable version constant makes
 * a viewed/replayed report attributable to the exact scale + label + intro
 * ruleset in force. BUMP whenever the scale formula, label map, or intro
 * constants change. Recorded in the model provenance AND the GROUP_REPORT_VIEW
 * audit `changes` payload.
 */
export const GROUP_RENDER_VERSION = "lva-fidelity-v1";

// ─── L3 — 0–10 rating scale (S3 only) ────────────────────────────────────────

/**
 * Round UP to one decimal, float-safe (R1-M3 / audit §3). Esperto ceilings the
 * 0–10 mapped value to 1dp: 8.3333→8.4, 1.6667→1.7, while keeping exact values
 * intact: 5.0→5.0, 10.0→10.0, 6.7→6.7. The `-1e-9` epsilon prevents a value
 * that is mathematically exact (e.g. 5.0) from being pushed up by float noise.
 */
export function ceil1(x: number): number {
  const r = Math.ceil(x * 10 - 1e-9) / 10;
  // Normalize -0 (Math.ceil(-1e-9) → -0) to 0 so an all-Weak factor renders 0.0.
  return r === 0 ? 0 : r;
}

/**
 * The S3 rating value on Esperto's 0–10 axis (clean thirds: Weak=0 / Average=5 /
 * Strong=10), the arithmetic mean over all contributing answers (CEO included —
 * the buckets already aggregate the full cohort), rounded UP to 1 decimal.
 *
 * `n = strong + avg + weak` (the caller guarantees n ≥ 1 — a factor nobody
 * answered is omitted upstream).
 */
export function scaledRatingValue(
  strong: number,
  avg: number,
  weak: number,
): number {
  const n = strong + avg + weak;
  return ceil1((10 * strong + 5 * avg + 0 * weak) / n);
}

/**
 * LVA S3 answers live on the stored 1–3 scale (1=Weak, 2=Average, 3=Strong).
 * The live survey can only emit {1,2,3}, but imported/legacy rows can carry
 * out-of-domain values; the 0–10 scaling is only valid over {1,2,3}. Returns
 * true iff every value is in the domain.
 */
export function s3ValuesInDomain(values: number[]): boolean {
  return values.every((v) => v === 1 || v === 2 || v === 3);
}

// ─── L4a — report factor-label overrides ─────────────────────────────────────

/**
 * The Esperto *report* labels for the ~6 factors whose report wording differs
 * from the survey wording (group report p7/p8). Keyed by the BARE factor slug.
 * The factors NOT listed here keep their survey label (no override).
 *
 * Both the S3 rating factor keys (`S3_<slug>`) and the S4 obstacle option keys
 * (bare `<slug>`) normalize to this slug via `factorSlugOf`.
 */
export const LVA_REPORT_FACTOR_LABELS: Readonly<Record<string, string>> = {
  recruitment: "Recruitment of new staff",
  retaining_staff: "Keeping employees",
  leadership_team: "Leadership team",
  the_leadership: "The Leadership",
  internal_comms: "Internal Communication",
  growth_financing: "Financing growth",
};

/**
 * Normalize either factor-key shape to the bare slug used by the label map:
 *   - S3 rating factor key  → `S3_recruitment`  → `recruitment`
 *   - S4 obstacle option key → `recruitment`     → `recruitment`
 * Any other shape is returned unchanged (no `S3_` prefix → already bare).
 */
export function factorSlugOf(key: string): string {
  return key.startsWith("S3_") ? key.slice("S3_".length) : key;
}

/**
 * Resolve the display label for an LVA factor, preferring the Esperto report
 * override; falls through to `fallback` (the survey label) for an unknown slug.
 * Pure — never throws.
 */
export function lvaReportFactorLabel(key: string, fallback: string): string {
  return LVA_REPORT_FACTOR_LABELS[factorSlugOf(key)] ?? fallback;
}

// ─── L4b — verbatim section intros ───────────────────────────────────────────

/**
 * Verbatim Esperto group-report section intros, keyed by section stableKey
 * (group report p3–p8). Char-for-char from the source PDF — do NOT use the seed
 * `description` (a paraphrase). A section absent from this map (S5_explained,
 * S6_focus) renders NO intro.
 */
export const LVA_SECTION_INTROS: Readonly<Record<string, string>> = {
  S1_financials:
    "We've asked the leadership team what their view is on the future development of the organization. The table below shows what the team aspires the company to be in three years:",
  S2_vision:
    "We've asked the team to describe what in three years the main products, partners, competitors will be. We also asked what major initiatives were to achieve that success. And of course, we asked for possible reasons why the aspiring goals would not be reached. Here you find the results:",
  S3_strengths:
    "The team rated the company with 16 factors that affect the success of an organization. Each factor was rated with 'strong', 'average' or 'weak'.",
  S4_obstacles:
    "We asked about the biggest constraints to reach the goals of the company. This is what the team rated:",
};

/** The verbatim LVA intro for a section, or null when none exists (render nothing). */
export function lvaSectionIntro(sectionStableKey: string): string | null {
  return LVA_SECTION_INTROS[sectionStableKey] ?? null;
}
