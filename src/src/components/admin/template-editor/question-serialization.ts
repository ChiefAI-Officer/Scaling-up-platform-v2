/**
 * question-serialization — pure, framework-free helpers for serializing the
 * QuestionsTab draft rows into a version PATCH `questions` body, replacing
 * the always-emit-`scale` serializer inside TemplateEditorTabbed's
 * handleSaveDraft (Wave T, spec 19t §T-3 + D8).
 *
 * Extracted next to sections-serialization.ts for the same reason: the
 * round-trip must be unit-testable without dragging the "use client"
 * editor component (@dnd-kit, next/navigation, …) into the test.
 *
 * CRITICAL — content-hash stability (see lib/assessments/template-content-hash.ts).
 * The seed reseed hashes sha256(JSON.stringify({questions, sections, ...}))
 * with a FIXED key order. Therefore:
 *   - The NOT-dirty path returns the raw stored rows BYTE-FOR-BYTE (same
 *     array reference, same key order) so a no-change round-trip recomputes
 *     the SAME hash.
 *   - The dirty path spreads the RAW stored row FIRST (looked up by
 *     stableKey) so original key order + unknown/future fields
 *     (e.g. `recommendations[]`) survive, and only edited fields are
 *     overwritten.
 *
 * Per-type emission (fixes the latent scale-injection defect, spec 19t §0):
 *   - SLIDER_LIKERT → `scale{...}`; never `options`/`maxChoices`.
 *   - TEXT / NUMBER → neither `scale` nor `options`/`maxChoices` (a stale
 *     `scale` left by the old serializer is dropped).
 *   - MULTI_CHOICE  → `options[{key,label}]` (+ `maxChoices` when set);
 *     never `scale`.
 * "Never" means the property is ABSENT from the emitted object, not
 * `undefined` (the payload is JSON.stringify'd, but absence is the contract).
 *
 * Key derivation (D8): slug keys are section-prefixed, union-unique,
 * assigned once at first save and immutable afterwards (ADR-0020).
 */

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

/**
 * Wave U (spec 19u U-4) — one findings band row in the editor. min/max are
 * null while the input is empty; rows with null bounds or blank text are
 * NOT emitted (the panel may hold half-typed rows without breaking saves).
 */
export interface FindingBandDraft {
  minScore: number | null;
  maxScore: number | null;
  text: string;
}

export interface QuestionDraftRow {
  uid: string;
  stableKey: string;
  sectionStableKey: string;
  label: string;
  helpText: string;
  isRequired: boolean;
  type: string;
  sortOrder: number;
  scaleMin: number;
  scaleMax: number;
  scaleStep: number;
  anchorMin: string;
  anchorMax: string;
  options: Array<{ key: string; label: string; isNew: boolean }>;
  maxChoices: number | null;
  isInherited: boolean;
  isNewToDraft: boolean;
  /**
   * Wave U — findings rules (per-type; the question TYPE discriminates which
   * field is live): `findingBands` on SLIDER_LIKERT / NUMBER,
   * `findingOptionTexts` (optionKey → rule text; blank/absent = no rule) on
   * MULTI_CHOICE. Both are ignored for TEXT. Emission is EXPLICIT per type
   * with anti-resurrection: on a dirty save the raw row's `recommendations`
   * is always overwritten or deleted — never resurrected by the raw spread.
   */
  findingBands: FindingBandDraft[];
  findingOptionTexts: Record<string, string>;
  /**
   * Wave W — authored show-if ({ gate stableKey, gate optionKey }). null =
   * unconditional. `optionKey: ""` is a half-picked rule (gate chosen,
   * option pending) — the panel may hold it without breaking saves; only a
   * COMPLETE rule is emitted. Emission is explicit with anti-resurrection,
   * exactly the `recommendations` contract.
   */
  showIf: { questionKey: string; optionKey: string } | null;
}

export type QuestionSerializationErrorCode =
  | "EMPTY_LABEL_SLUG"
  | "DUPLICATE_STABLE_KEY"
  | "INHERITED_KEY_MUTATED"
  | "INHERITED_TYPE_MUTATED"
  | "INHERITED_OPTION_KEY_MUTATED"
  | "MULTI_CHOICE_NO_OPTIONS"
  | "MAX_CHOICES_EXCEEDS_OPTIONS";

export class QuestionSerializationError extends Error {
  readonly code: QuestionSerializationErrorCode;
  readonly stableKey?: string;

  constructor(
    code: QuestionSerializationErrorCode,
    message: string,
    stableKey?: string,
  ) {
    super(message);
    this.name = "QuestionSerializationError";
    this.code = code;
    this.stableKey = stableKey;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Wave U — slider band coverage (advisory UI helper; publish enforces)
// ────────────────────────────────────────────────────────────────────────

export type SliderBandCoverage =
  | { complete: true }
  | { complete: false; message: string };

/**
 * Advisory coverage state for a SLIDER question's findings bands, shown
 * inline in the panel so the publish-time full-tiling rule never surprises
 * (spec D11). Mirrors `checkRecommendationsPublish`'s slider semantics:
 * bands (the EMITTABLE ones — numeric bounds + non-blank text) must start at
 * scale.min, end at scale.max, and be contiguous (integer scales: next.min
 * === prev.max + 1; fractional: next.min === prev.max). No bands at all is
 * complete (rules are opt-in per question).
 */
export function sliderBandCoverage(
  scaleMin: number,
  scaleMax: number,
  step: number,
  bands: FindingBandDraft[],
): SliderBandCoverage {
  const usable = bands
    .filter(
      (b) =>
        typeof b.minScore === "number" &&
        Number.isFinite(b.minScore) &&
        typeof b.maxScore === "number" &&
        Number.isFinite(b.maxScore) &&
        b.text.trim() !== "",
    )
    .map((b) => ({ min: b.minScore as number, max: b.maxScore as number }));
  if (usable.length === 0) return { complete: true };

  const sorted = [...usable].sort((a, b) => a.min - b.min);
  for (const b of sorted) {
    if (b.max < b.min) {
      return { complete: false, message: `A band has max < min (${b.max} < ${b.min})` };
    }
  }
  // Wave U launch-found fix: a band extending OUTSIDE the scale must be
  // named directly — feeding it into the gap math below produced inverted
  // garbage ranges like "missing 7–3" on a 0–3 scale.
  for (const b of sorted) {
    if (b.min < scaleMin || b.max > scaleMax) {
      return {
        complete: false,
        message: `Band ${b.min}–${b.max} extends outside the ${scaleMin}–${scaleMax} scale`,
      };
    }
  }
  const isInteger = step === 1;
  const problems: string[] = [];
  if (sorted[0].min !== scaleMin) {
    problems.push(`missing ${scaleMin}–${isInteger ? sorted[0].min - 1 : sorted[0].min}`);
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const expected = isInteger ? a.max + 1 : a.max;
    if (b.min < expected) {
      return { complete: false, message: `Bands overlap at ${b.min}` };
    }
    if (b.min > expected) {
      problems.push(`missing ${expected}–${isInteger ? b.min - 1 : b.min}`);
    }
  }
  if (sorted[sorted.length - 1].max !== scaleMax) {
    problems.push(
      `missing ${isInteger ? sorted[sorted.length - 1].max + 1 : sorted[sorted.length - 1].max}–${scaleMax}`,
    );
  }
  if (problems.length > 0) {
    return {
      complete: false,
      message: `Covers part of ${scaleMin}–${scaleMax}; ${problems.join(", ")}`,
    };
  }
  return { complete: true };
}

// ────────────────────────────────────────────────────────────────────────
// Slug / key derivation (D8)
// ────────────────────────────────────────────────────────────────────────

/** Max TOTAL length of a derived stableKey / option key. */
const MAX_KEY_LENGTH = 40;

/**
 * lower_snake a label: lowercase, every run of non-[a-z0-9] collapses to a
 * single `_`, leading/trailing `_` trimmed. Punctuation/emoji-only input
 * yields "".
 */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function trimTrailingUnderscores(s: string): string {
  return s.replace(/_+$/g, "");
}

/** Truncate to MAX_KEY_LENGTH, trimming any trailing `_` the cut exposes. */
function truncateKey(candidate: string): string {
  if (candidate.length <= MAX_KEY_LENGTH) return candidate;
  return trimTrailingUnderscores(candidate.slice(0, MAX_KEY_LENGTH));
}

/**
 * Resolve collisions against `taken` by appending `_2`, `_3`, … while
 * keeping the TOTAL length ≤ MAX_KEY_LENGTH (the base is truncated further
 * to make room for the suffix).
 */
function uniquifyKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    let stem = base;
    if (stem.length + suffix.length > MAX_KEY_LENGTH) {
      stem = trimTrailingUnderscores(
        stem.slice(0, MAX_KEY_LENGTH - suffix.length),
      );
    }
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Derive a question stableKey from its label + owning section (D8):
 * `<sectionPrefix>_<lower_snake(label)>`, where the prefix is the section
 * stableKey up to its FIRST `_` ("P1_retrospective" → "P1"; a section key
 * without `_` is used whole). Truncated to 40 chars total; collisions with
 * `taken` append `_2`/`_3` (still ≤ 40). An empty slug (punctuation/emoji-
 * only label) throws EMPTY_LABEL_SLUG.
 */
export function deriveStableKey(
  label: string,
  sectionStableKey: string,
  taken: ReadonlySet<string>,
): string {
  const slug = slugify(label);
  if (slug === "") {
    throw new QuestionSerializationError(
      "EMPTY_LABEL_SLUG",
      `Question label ${JSON.stringify(label)} produces an empty key slug — add at least one letter or digit.`,
    );
  }
  const underscoreAt = sectionStableKey.indexOf("_");
  const prefix =
    underscoreAt === -1 ? sectionStableKey : sectionStableKey.slice(0, underscoreAt);
  const base = truncateKey(`${prefix}_${slug}`);
  return uniquifyKey(base, taken);
}

/**
 * Derive a MULTI_CHOICE option key from its label: `lower_snake(label)`,
 * unique within the question's option keys via `_2`/`_3`, capped at 40
 * chars. An empty slug throws EMPTY_LABEL_SLUG.
 */
export function deriveOptionKey(
  label: string,
  taken: ReadonlySet<string>,
): string {
  const slug = slugify(label);
  if (slug === "") {
    throw new QuestionSerializationError(
      "EMPTY_LABEL_SLUG",
      `Option label ${JSON.stringify(label)} produces an empty key slug — add at least one letter or digit.`,
    );
  }
  return uniquifyKey(truncateKey(slug), taken);
}

// ────────────────────────────────────────────────────────────────────────
// Payload build
// ────────────────────────────────────────────────────────────────────────

export interface BuildQuestionsPayloadOptions {
  questionsDirty: boolean;
  rawQuestions: unknown[];
  /** Union of stableKeys across ALL published versions of the template (§T-4). */
  publishedKeys: ReadonlySet<string>;
  /** Union of option keys per published question stableKey (§T-4). */
  publishedOptionKeys: Readonly<Record<string, readonly string[]>>;
}

export interface BuildQuestionsPayloadResult {
  payload: unknown;
  /** uid → stableKey assigned at THIS save (new-to-draft rows only). */
  assignedKeys: Map<string, string>;
}

function indexRawByStableKey(
  rawQuestions: unknown[],
): Map<string, Record<string, unknown>> {
  const rawByStableKey = new Map<string, Record<string, unknown>>();
  for (const r of rawQuestions) {
    if (r && typeof r === "object") {
      const row = r as Record<string, unknown>;
      if (typeof row.stableKey === "string") {
        rawByStableKey.set(row.stableKey, row);
      }
    }
  }
  return rawByStableKey;
}

function rawOptionKeys(raw: Record<string, unknown> | undefined): Set<string> {
  const keys = new Set<string>();
  const options = raw?.options;
  if (Array.isArray(options)) {
    for (const o of options) {
      if (o && typeof o === "object") {
        const key = (o as Record<string, unknown>).key;
        if (typeof key === "string") keys.add(key);
      }
    }
  }
  return keys;
}

/**
 * Wave U3 (spec 19aa D7) — the SINGLE source of truth for turning a question
 * draft's authored findings into the emitted `recommendations` array.
 *
 * Used by BOTH `buildQuestionsPayload` (the save path, §4 below) AND the
 * editor's test-a-value preview (QuestionsTab `FindingsPreview`). Sharing this
 * is the no-drift guarantee: "which finding the preview says fires" is derived
 * from the EXACT rules a save would emit, so the preview can never disagree
 * with what a published version resolves. Returns null when the draft has no
 * emittable rule (the caller then DELETEs the key — anti-resurrection).
 *
 *   SLIDER_LIKERT / NUMBER → bands { minScore, maxScore, text } (finite bounds
 *                            + non-blank text), in row order.
 *   MULTI_CHOICE           → { optionKey, text } in the question's OPTION order
 *                            (drives fired-rule order); blank text = no rule.
 *   TEXT / anything else   → null (rules are never emitted; publish rejects them).
 */
export function buildFindingRecommendations(d: {
  type: string;
  findingBands: FindingBandDraft[];
  findingOptionTexts: Record<string, string>;
  options: ReadonlyArray<{ key: string }>;
}): Array<Record<string, unknown>> | null {
  if (d.type === "SLIDER_LIKERT" || d.type === "NUMBER") {
    const bands = d.findingBands
      .filter(
        (b) =>
          typeof b.minScore === "number" &&
          Number.isFinite(b.minScore) &&
          typeof b.maxScore === "number" &&
          Number.isFinite(b.maxScore) &&
          b.text.trim() !== "",
      )
      .map((b) => ({
        minScore: b.minScore as number,
        maxScore: b.maxScore as number,
        text: b.text,
      }));
    return bands.length > 0 ? bands : null;
  }
  if (d.type === "MULTI_CHOICE") {
    // Emit in the question's OPTION order (drives fired-rule order in the
    // resolver); blank text = no rule for that option.
    const rules = d.options
      .filter((o) => o.key !== "" && (d.findingOptionTexts[o.key] ?? "").trim() !== "")
      .map((o) => ({ optionKey: o.key, text: d.findingOptionTexts[o.key] }));
    return rules.length > 0 ? rules : null;
  }
  return null;
}

/**
 * Serialize the QuestionDraftRow rows back into a version PATCH `questions`
 * body.
 *
 * - NOT dirty → returns `rawQuestions` by REFERENCE (byte-for-byte,
 *   content-hash stable) with an empty `assignedKeys` map.
 * - Dirty → assigns slug keys to new-to-draft rows (D8, union-unique
 *   against published + raw + sibling draft keys) and new option keys,
 *   re-checks the inherited locks (key / type / persisted option keys —
 *   the client-side layer of the three-layer lock, §T-4), then emits
 *   per-type rows with the raw row spread FIRST.
 *
 * Throws QuestionSerializationError (never partially emits) on any guard
 * violation.
 */
export function buildQuestionsPayload(
  drafts: QuestionDraftRow[],
  opts: BuildQuestionsPayloadOptions,
): BuildQuestionsPayloadResult {
  if (!opts.questionsDirty) {
    // Byte-for-byte passthrough (hash-stable) — same array reference.
    return { payload: opts.rawQuestions, assignedKeys: new Map() };
  }

  const rawByStableKey = indexRawByStableKey(opts.rawQuestions);

  // ── 1. Assign stableKeys to new-to-draft rows (D8 union uniqueness) ──
  const taken = new Set<string>(opts.publishedKeys);
  for (const key of rawByStableKey.keys()) taken.add(key);
  for (const d of drafts) {
    if (d.stableKey !== "") taken.add(d.stableKey);
  }

  const assignedKeys = new Map<string, string>();
  let resolved = drafts.map((d) => {
    if (d.isNewToDraft && d.stableKey === "") {
      const key = deriveStableKey(d.label, d.sectionStableKey, taken);
      taken.add(key);
      assignedKeys.set(d.uid, key);
      return { ...d, stableKey: key };
    }
    return d;
  });

  // ── 2. Assign keys to new MULTI_CHOICE options ──
  resolved = resolved.map((d) => {
    if (d.type !== "MULTI_CHOICE") return d;
    const optTaken = new Set<string>(
      d.options.filter((o) => o.key !== "").map((o) => o.key),
    );
    let changed = false;
    const options = d.options.map((o) => {
      if (o.isNew && o.key === "") {
        const key = deriveOptionKey(o.label, optTaken);
        optTaken.add(key);
        changed = true;
        return { ...o, key };
      }
      return o;
    });
    return changed ? { ...d, options } : d;
  });

  // ── 3. Guards (all-or-nothing; run before any emission) ──
  const seenKeys = new Set<string>();
  for (const d of resolved) {
    if (seenKeys.has(d.stableKey)) {
      throw new QuestionSerializationError(
        "DUPLICATE_STABLE_KEY",
        `Duplicate question stableKey "${d.stableKey}".`,
        d.stableKey,
      );
    }
    seenKeys.add(d.stableKey);

    const raw = rawByStableKey.get(d.stableKey);
    if (d.isInherited) {
      if (!raw) {
        throw new QuestionSerializationError(
          "INHERITED_KEY_MUTATED",
          `Inherited question "${d.stableKey}" is not present in the stored draft — inherited stableKeys are immutable.`,
          d.stableKey,
        );
      }
      if (raw.type !== d.type) {
        throw new QuestionSerializationError(
          "INHERITED_TYPE_MUTATED",
          `Inherited question "${d.stableKey}" cannot change type (${String(raw.type)} → ${d.type}) — a different type is a new question.`,
          d.stableKey,
        );
      }
    }

    if (d.type === "MULTI_CHOICE") {
      if (d.options.length === 0) {
        throw new QuestionSerializationError(
          "MULTI_CHOICE_NO_OPTIONS",
          `MULTI_CHOICE question "${d.stableKey}" needs at least one option.`,
          d.stableKey,
        );
      }
      const persistedKeys = rawOptionKeys(raw);
      for (const o of d.options) {
        if (!o.isNew && !persistedKeys.has(o.key)) {
          throw new QuestionSerializationError(
            "INHERITED_OPTION_KEY_MUTATED",
            `Option key "${o.key}" on question "${d.stableKey}" does not match a persisted option key — option keys are immutable once saved.`,
            d.stableKey,
          );
        }
      }
      if (
        d.maxChoices !== null &&
        (d.maxChoices < 1 || d.maxChoices > d.options.length)
      ) {
        throw new QuestionSerializationError(
          "MAX_CHOICES_EXCEEDS_OPTIONS",
          `maxChoices (${d.maxChoices}) on question "${d.stableKey}" must be between 1 and the option count (${d.options.length}).`,
          d.stableKey,
        );
      }
    }
  }

  // ── 4. Per-type emission (raw spread FIRST — key order + unknown fields) ──
  const payload = resolved.map((d) => {
    const raw = rawByStableKey.get(d.stableKey) ?? {};
    const row: Record<string, unknown> = {
      ...raw, // preserve key order + unknown/future fields (content-hash stable)
      stableKey: d.stableKey,
      sectionStableKey: d.sectionStableKey,
      sortOrder: d.sortOrder,
      type: d.type,
      label: d.label,
      ...(d.helpText.trim() ? { helpText: d.helpText } : {}),
      isRequired: d.isRequired,
    };

    if (d.type === "SLIDER_LIKERT") {
      const rawScale =
        raw.scale && typeof raw.scale === "object"
          ? (raw.scale as Record<string, unknown>)
          : {};
      row.scale = {
        ...rawScale,
        min: d.scaleMin,
        max: d.scaleMax,
        step: d.scaleStep,
        anchorMin: d.anchorMin,
        anchorMax: d.anchorMax,
      };
      delete row.options;
      delete row.maxChoices;
    } else if (d.type === "MULTI_CHOICE") {
      delete row.scale;
      row.options = d.options.map((o) => ({ key: o.key, label: o.label }));
      if (d.maxChoices !== null) row.maxChoices = d.maxChoices;
      else delete row.maxChoices;
    } else {
      // TEXT / NUMBER — neither scale nor options/maxChoices (drops the
      // stale `scale` the pre-Wave-T serializer injected into every row).
      delete row.scale;
      delete row.options;
      delete row.maxChoices;
    }

    // ── Wave U (spec 19u U-4) — findings rules, explicit per-type emission.
    // The raw spread above may have carried the STORED `recommendations`;
    // on a dirty save the draft is authoritative: overwrite with the
    // draft-derived rules, or DELETE the key when the draft has none
    // (anti-resurrection — a rule deleted in the panel stays deleted).
    // Wave U3 (spec 19aa D7): the derivation lives in the SHARED
    // buildFindingRecommendations so the editor preview resolves the identical
    // rules a save emits (no drift).
    const recommendations = buildFindingRecommendations(d);
    if (recommendations) row.recommendations = recommendations;
    else delete row.recommendations;

    // ── Wave W (spec 19w §2.6) — showIf, explicit emission with
    // anti-resurrection. On a dirty save the draft is authoritative:
    // a COMPLETE rule overwrites the stored value; a cleared or
    // half-picked rule DELETES the key (a rule cleared in the panel
    // stays cleared — never resurrected by the raw spread).
    if (d.showIf && d.showIf.questionKey !== "" && d.showIf.optionKey !== "") {
      row.showIf = {
        questionKey: d.showIf.questionKey,
        optionKey: d.showIf.optionKey,
      };
    } else {
      delete row.showIf;
    }

    return row;
  });

  return { payload, assignedKeys };
}
