/**
 * Wave J-1 — Scaling Up Full "growth phase" computation (pure, no DB / no React).
 *
 * Esperto computes a company "growth phase" from the CEO's employee headcount and
 * shows a mid-survey interstitial tile ("You've reached phase N - <Name> phase")
 * with a verbatim narrative. This module is the pure foundation for that feature:
 *
 *   - `computeGrowthPhase(permanentFte, temporaryFte)` resolves the phase band.
 *     Driver = permanentFte + temporaryFte. Freelancers/contractors are EXCLUDED
 *     (captured in the seed for fidelity but never fed into the calc).
 *   - `GROWTH_PHASE_BANDS` + `GROWTH_PHASE_NARRATIVES` are exported so the survey
 *     plumbing (Task B) and the interstitial UI (Task C) can import them directly.
 *
 * Phase bands (source: docs/specs/v7.6/18j-su-full-source-extract.md §8–19):
 *   1–7    → Phase 1  Pioneering
 *   8–24   → Phase 2  Organization
 *   25–49  → Phase 3  Management
 *   50–149 → Phase 4  Delegation
 *   150+   → Phase 5  Standardization
 *   driver <= 0, non-finite, or NaN → no phase (returns null)
 *
 * Narratives are the **in-survey interstitial tile** copy, transcribed VERBATIM
 * from the Esperto workbook v2-tab screenshots (P1=img56, P2=img48, P3=img53,
 * P4=img47, P5=img57). ⚠️ Esperto quirk: the P4 (Delegation) tile shows the
 * IDENTICAL body text as P3 (Management) — a genuine source artifact, replicated
 * here as-is (P3 and P4 narratives are equal) until Jeff supplies distinct copy.
 */

export type GrowthPhaseNumber = 1 | 2 | 3 | 4 | 5;

export interface GrowthPhase {
  number: GrowthPhaseNumber;
  /** e.g. "Pioneering" */
  name: string;
  /** e.g. "You've reached phase 1 - Pioneering phase" */
  heading: string;
  /** Verbatim in-survey interstitial narrative. */
  narrative: string;
}

interface GrowthPhaseBand {
  number: GrowthPhaseNumber;
  name: string;
  /** Inclusive lower bound on the driver (permanent + temporary FTE). */
  min: number;
  /** Inclusive upper bound; null = open-ended (Phase 5). */
  max: number | null;
}

// ─── Phase narratives (verbatim — see header note + source extract) ─────────

const P1_NARRATIVE =
  "You as a CEO, founder or entrepreneur are also an actively involved co-worker. " +
  "Creativity and energy levels are high. You are extremely involved with your team " +
  "and everyone is aware of the current status. On the whole, this is an enormously " +
  "creative and inspiring phase with the overall objective being to formulate a clear " +
  "choice of product, market and positioning strategy. By making these often difficult " +
  "choices, you continue to grow.";

const P2_NARRATIVE =
  "In your current phase an increasing number of management processes require development. " +
  "Your role as a CEO, entrepreneur and employer is shifting towards management. Maybe you " +
  "struggle with all the different hats you have to wear, your roles and the various focus " +
  "areas. Functional responsibilities (HR/Marketing/Sales/Operations) are often the " +
  "entrepreneur's secondary functions or an employee's sub-task. Making the organization " +
  "(backoffice, product, etc.) scalable and giving it structure without losing flexibility " +
  "are key areas. Frequently the sales position requires development as it is often largely " +
  "dependent on the entrepreneur him/herself. This phase can be fun, but an extremely busy " +
  "period during your business development.";

// ⚠️ P3 and P4 share this identical body text (Esperto source artifact). Both
// GROWTH_PHASE_NARRATIVES[3] and [4] reference this same constant.
const P3_P4_NARRATIVE =
  "From this phase onwards, there is an increasing budget for hiring professionals in the " +
  "specific functional sub-areas. However, this demands additional time, making it the most " +
  "difficult stage… Growth gobbles up cash, new people cost a lot of margin, creating " +
  "complexity and coordination problems. It's becoming increasingly busy and the bottom line " +
  "is - less money. Often people who have been at a company from the beginning feel frustrated " +
  "putting the corporate culture under pressure. The hiring of a solid, operationally focused " +
  "\"second-in-command\" or having a strong management team is often a good direction to " +
  "execute. Further growth is the only way to get by.";

const P5_NARRATIVE =
  "The various leadership team members have to fully coordinate and cooperate. The probability " +
  "of increased bureaucracy increases, meaning managers must continually develop into leaders.";

// ─── Exported bands + narratives (for Tasks B & C) ──────────────────────────

export const GROWTH_PHASE_BANDS: readonly GrowthPhaseBand[] = [
  { number: 1, name: "Pioneering", min: 1, max: 7 },
  { number: 2, name: "Organization", min: 8, max: 24 },
  { number: 3, name: "Management", min: 25, max: 49 },
  { number: 4, name: "Delegation", min: 50, max: 149 },
  { number: 5, name: "Standardization", min: 150, max: null },
] as const;

function headingFor(number: GrowthPhaseNumber, name: string): string {
  return `You've reached phase ${number} - ${name} phase`;
}

const NARRATIVE_BY_NUMBER: Record<GrowthPhaseNumber, string> = {
  1: P1_NARRATIVE,
  2: P2_NARRATIVE,
  3: P3_P4_NARRATIVE,
  4: P3_P4_NARRATIVE,
  5: P5_NARRATIVE,
};

export const GROWTH_PHASE_NARRATIVES: Record<GrowthPhaseNumber, GrowthPhase> = {
  1: phaseFor(1),
  2: phaseFor(2),
  3: phaseFor(3),
  4: phaseFor(4),
  5: phaseFor(5),
};

function phaseFor(number: GrowthPhaseNumber): GrowthPhase {
  const band = GROWTH_PHASE_BANDS.find((b) => b.number === number)!;
  return {
    number,
    name: band.name,
    heading: headingFor(number, band.name),
    narrative: NARRATIVE_BY_NUMBER[number],
  };
}

// ─── Pure phase resolver ─────────────────────────────────────────────────────

/**
 * Resolve a company growth phase from employee headcount.
 *
 * @param permanentFte  permanent employees (FTE)
 * @param temporaryFte  temporary employees (FTE) — blank should be passed as 0
 * @returns the matching GrowthPhase, or null when the driver (perm + temp) is
 *          <= 0 or not a finite number (no phase computable).
 */
export function computeGrowthPhase(
  permanentFte: number,
  temporaryFte: number
): GrowthPhase | null {
  if (!Number.isFinite(permanentFte) || !Number.isFinite(temporaryFte)) {
    return null;
  }
  const driver = permanentFte + temporaryFte;
  if (!Number.isFinite(driver) || driver <= 0) {
    return null;
  }

  const band = GROWTH_PHASE_BANDS.find(
    (b) => driver >= b.min && (b.max === null || driver <= b.max)
  );
  if (!band) return null;

  return GROWTH_PHASE_NARRATIVES[band.number];
}
