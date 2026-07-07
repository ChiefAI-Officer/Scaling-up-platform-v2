/**
 * Wave X — restricted-import instrument registry (the adapter boundary, D2).
 *
 * Spec ref: docs/specs/v7.6/19x-wave-x-lva-rockefeller-import.md (X-1, D2/D3/
 * D8/D9); ADR-0022.
 *
 * One record per importable instrument. The registry owns:
 *   - `batchKind` — the request's versioned selector (stale clients can only
 *     ever send the SU-Full batchKind, so selection is stale-safe, D3);
 *   - flag gating (`isEnabled`) — SU-Full stays on the independent Wave O
 *     flag; LVA + Rockefeller share the Wave X flag. Killing one wave never
 *     touches the other's instruments;
 *   - shape detection (D3) — DATA-DERIVED from the crosswalks: an export's
 *     answer keys must be a SUBSET of the instrument's key universe
 *     (crosswalk map ∪ droppedKeys — Esperto's JSON omits empty keys per-key,
 *     so subset, never equality) AND contain at least one key DISTINCTIVE to
 *     that instrument (universe minus the other instruments' universes) —
 *     32 of Rockefeller's 40 codes are also SU-Full codes, so subset alone
 *     cannot disambiguate. Selection is the intent; detection is the guard;
 *   - the `mat` schema-identity gate (D8) — `knownMats` lists ONLY mats the
 *     crosswalk was verified against (null = no gate);
 *   - the completeness policy (D9) — "required-set" (scored instruments:
 *     partial scores mislead) vs "slider-core-set" (qualitative LVA: the
 *     16-factor matrix IS the instrument; blank texts import as unanswered);
 *   - the campaign externalId prefix (`esperto:<instrument>` namespacing).
 *
 * Version pinning and value coercion are deliberately NOT per-instrument —
 * they stay pipeline-generic (spec D2, Codex C5 partial).
 */

import { isEspertoSuFullImportEnabled } from "../wave-o-flags";
import { isEspertoLvaRockImportEnabled } from "../wave-x-flags";
import {
  lvaCrosswalk,
  rockefellerCrosswalk,
  scalingUpFullCrosswalk,
  type Crosswalk,
} from "./crosswalks";

export interface RestrictedInstrument {
  instrumentKey: "sufull" | "lva" | "rockefeller";
  /** Versioned request selector — the route zod accepts exactly the registry's batchKinds. */
  batchKind: string;
  /** Our template alias (the seed's TEMPLATE_ALIAS). */
  templateAlias: string;
  /** Campaign externalId namespace: `<prefix>:<cid>:<roundLabelSlug>`. */
  externalIdPrefix: string;
  /** Import-UI label (honest framing). */
  uiLabel: string;
  /** Per-instrument wave flag (call-time env reads). */
  isEnabled: (opts?: { organizationId?: string; templateId?: string }) => boolean;
  /** D8 — mats the crosswalk was VERIFIED against; null = no gate. */
  knownMats: readonly string[] | null;
  /** D9 — completeness-gate key derivation policy. */
  completeness: "required-set" | "slider-core-set";
  /**
   * D3 — whether the route layer runs the shape-agreement check
   * (`detectShapeMatches`) on every file. FALSE for SU-Full: Wave O shipped
   * without it and its exhaustiveness guard already hard-fails foreign keys;
   * enforcing anchors retroactively could turn a legitimate partial file's
   * per-respondent skip into a whole-batch block (byte-identity rule).
   */
  shapeChecked: boolean;
  /**
   * Optional per-instrument cross-field consistency probe, run per file at
   * preview. Returns a PII-free warning string or null. Never blocks.
   */
  fileConsistencyWarning?: (raw: Record<string, unknown>) => string | null;
}

/**
 * LVA — Q16a↔Q17 correlation probe: the comma-separated pick indices in Q16a
 * should be exactly the indices whose why-text Q17_N is non-empty (the
 * sample's own self-validation). A mismatch is a data-quality WARNING (the
 * answers are still the answers), never a block.
 */
export function lvaQ16aQ17ConsistencyWarning(
  raw: Record<string, unknown>,
): string | null {
  const q16a = raw["Q16a"];
  if (q16a === undefined || q16a === null || String(q16a).trim() === "") return null;
  const picked = new Set(
    String(q16a)
      .split(",")
      .map((t) => t.trim())
      .filter((t) => /^\d+$/.test(t))
      .map(Number),
  );
  const answered = new Set<number>();
  for (let n = 1; n <= 16; n++) {
    const why = raw[`Q17_${n}`];
    if (typeof why === "string" && why.trim() !== "") answered.add(n);
  }
  const pickedNotAnswered = [...picked].filter((n) => !answered.has(n));
  const answeredNotPicked = [...answered].filter((n) => !picked.has(n));
  if (pickedNotAnswered.length === 0 && answeredNotPicked.length === 0) return null;
  const parts: string[] = [];
  if (pickedNotAnswered.length > 0) {
    parts.push(`picked factor index(es) ${pickedNotAnswered.join(", ")} have no why-text`);
  }
  if (answeredNotPicked.length > 0) {
    parts.push(`why-text(s) present for unpicked factor index(es) ${answeredNotPicked.join(", ")}`);
  }
  return `Q16a↔Q17 mismatch: ${parts.join("; ")}`;
}

export const RESTRICTED_INSTRUMENTS: readonly RestrictedInstrument[] = [
  {
    instrumentKey: "sufull",
    batchKind: "esperto-sufull-restricted-v1",
    templateAlias: "scaling-up-full",
    externalIdPrefix: "esperto:sufull",
    uiLabel: "Scaling Up Full (historical)",
    isEnabled: isEspertoSuFullImportEnabled,
    knownMats: null, // Wave O launched without a mat gate — byte-identical behavior.
    completeness: "required-set",
    shapeChecked: false, // Wave O byte-identity — see field doc.
  },
  {
    instrumentKey: "lva",
    batchKind: "esperto-lva-restricted-v1",
    templateAlias: "leadership-vision-alignment",
    externalIdPrefix: "esperto:lva",
    uiLabel: "Leadership Vision Alignment (historical)",
    isEnabled: isEspertoLvaRockImportEnabled,
    // D8: populated ONLY at lock time with mats the crosswalk was verified
    // against (predeclared decision rule — spec 19x D8).
    knownMats: null,
    completeness: "slider-core-set",
    shapeChecked: true,
    fileConsistencyWarning: lvaQ16aQ17ConsistencyWarning,
  },
  {
    instrumentKey: "rockefeller",
    batchKind: "esperto-rockhabits-restricted-v1",
    templateAlias: "RockHabits",
    externalIdPrefix: "esperto:rockhabits",
    uiLabel: "Rockefeller Habits Checklist (historical)",
    isEnabled: isEspertoLvaRockImportEnabled,
    knownMats: null, // populated at lock time (D8)
    completeness: "required-set",
    shapeChecked: true,
  },
];

export function getInstrumentByBatchKind(batchKind: string): RestrictedInstrument | null {
  return RESTRICTED_INSTRUMENTS.find((i) => i.batchKind === batchKind) ?? null;
}

// ────────────────────────────────────────────────────────────────────────
// D3 — shape detection, data-derived from the crosswalk registry
// ────────────────────────────────────────────────────────────────────────

const CROSSWALK_BY_ALIAS: Record<string, Crosswalk> = {
  "scaling-up-full": scalingUpFullCrosswalk,
  "leadership-vision-alignment": lvaCrosswalk,
  RockHabits: rockefellerCrosswalk,
};

function universeOf(alias: string): Set<string> {
  const cw = CROSSWALK_BY_ALIAS[alias];
  const keys = new Set<string>();
  if (!cw) return keys;
  for (const e of cw.map) keys.add(e.espertoKey);
  for (const d of cw.droppedKeys) keys.add(d.key);
  return keys;
}

/** universe(instrument) minus the union of every OTHER instrument's universe. */
function distinctiveOf(alias: string): Set<string> {
  const own = universeOf(alias);
  const others = new Set<string>();
  for (const inst of RESTRICTED_INSTRUMENTS) {
    if (inst.templateAlias === alias) continue;
    for (const k of universeOf(inst.templateAlias)) others.add(k);
  }
  return new Set([...own].filter((k) => !others.has(k)));
}

/**
 * Does this export's answer-key shape agree with the SELECTED instrument?
 * Subset-of-universe + ≥1 distinctive anchor. A failed check is the
 * wrong-files signal — the batch rejects at preview, nothing is written.
 */
export function detectShapeMatches(
  instrument: Pick<RestrictedInstrument, "templateAlias" | "uiLabel">,
  answerKeys: string[],
): { ok: true } | { ok: false; reason: string } {
  if (answerKeys.length === 0) {
    return { ok: false, reason: "the file contains no answer keys" };
  }
  const universe = universeOf(instrument.templateAlias);
  const foreign = answerKeys.filter((k) => !universe.has(k));
  if (foreign.length > 0) {
    return {
      ok: false,
      reason: `${foreign.length} answer key(s) do not belong to ${instrument.uiLabel} (e.g. ${foreign
        .slice(0, 3)
        .join(", ")})`,
    };
  }
  const distinctive = distinctiveOf(instrument.templateAlias);
  if (!answerKeys.some((k) => distinctive.has(k))) {
    return {
      ok: false,
      reason: `the file carries no key distinctive to ${instrument.uiLabel} — ambiguous shape (possibly a different instrument's export)`,
    };
  }
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────
// D9 — completeness policy
// ────────────────────────────────────────────────────────────────────────

export interface CompletenessQuestionView {
  stableKey: string;
  isRequired: boolean;
  type: string;
}

/**
 * The key set the per-respondent completeness gate enforces, derived from the
 * pinned version's questions under the instrument's policy.
 */
export function completenessKeysFor(
  instrument: Pick<RestrictedInstrument, "completeness">,
  fullQuestions: CompletenessQuestionView[],
): string[] {
  if (instrument.completeness === "slider-core-set") {
    return fullQuestions.filter((q) => q.type === "SLIDER_LIKERT").map((q) => q.stableKey);
  }
  return fullQuestions.filter((q) => q.isRequired === true).map((q) => q.stableKey);
}

// ────────────────────────────────────────────────────────────────────────
// D8 — mat schema-identity gate
// ────────────────────────────────────────────────────────────────────────

/**
 * `knownMats: null` = no gate. A non-null list admits ONLY mats the crosswalk
 * was verified against — an unknown/absent `mat` hard-rejects at preview.
 */
export function checkMatAllowed(
  instrument: Pick<RestrictedInstrument, "knownMats" | "uiLabel">,
  mat: string | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (instrument.knownMats === null) return { ok: true };
  if (typeof mat === "string" && instrument.knownMats.includes(mat)) return { ok: true };
  return {
    ok: false,
    reason: `unverified Esperto form version (mat ${mat ?? "<missing>"}) for ${instrument.uiLabel} — the crosswalk needs re-verification against this form before import`,
  };
}
