/**
 * Esperto historical import — Wave O RESTRICTED (SU-Full) plan builder (PURE — no DB, no React).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4 (restricted shape),
 * §7 (crosswalk lock gate); Wave O — per-round SU-Full historical import.
 *
 * `buildRestrictedImportPlan` is the correctness-critical core of the SU-Full
 * historical import. It turns a BATCH of parsed restricted-individual files (one
 * respondent each), a resolved SU-Full crosswalk, an explicit target org + its
 * roster, and a coach-supplied round label into a deterministic single-campaign /
 * skip / block / warning plan plus a provenance manifest. It performs ZERO DB work
 * and touches no React — the route resolves `respondents` + the pinned version
 * upstream, and a separate COMMIT layer does the actual scoring + Prisma writes.
 * This file only assembles the reconstructed round + chain shape + provenance so
 * every branch is unit-testable against fixtures.
 *
 * It MIRRORS results-plan.ts's naming/shape (ResultsAnswer, ResultsRow, block/skip
 * shapes) but for the restricted (SU-Full) export, whose one-respondent-per-file
 * batch reconstructs a SINGLE campaign (a single Esperto `cid`) representing ONE
 * historical round (e.g. "2025 Annual", "Year 1").
 *
 * REFUSAL / SAFETY contract (blocks — campaign + manifest stay null):
 *   - round label empties/too-long/control chars      → invalid-round-label.
 *   - crosswalk NOT locked (§7)                        → crosswalk-locked (Phase 1
 *                                                        keeps SU-Full locked:false,
 *                                                        so real imports are refused).
 *   - crosswalk maps a stableKey absent from the       → crosswalk-invalid-for-version
 *     pinned published version (e.g. an unconditional
 *     FTE mapping) / any type/scale drift.
 *   - empty batch                                      → empty-batch.
 *   - files span >1 distinct cid                       → multiple-cids.
 *   - same (cid, mid) in >1 file (two rounds mixed)    → duplicate-respondent.
 *   - unknown answer key (exhaustiveness)              → unknown-answer-keys.
 *
 * NON-FATAL, per-respondent (skips — row omitted, campaign still built):
 *   - mid not in roster                                → unresolved-respondent
 *                                                        (NEVER create, NEVER fail).
 *   - a scorable key missing/blank                     → incomplete-respondent
 *                                                        (NO partial-scored row).
 *
 * PROVENANCE (manifest): carries NO raw mid / reportid / email / name /
 * demographics — only salted hashes + counts. Salt is supplied by the caller
 * (env in prod; a fixed value in tests) so hashes are deterministic per-salt.
 */

import { createHash } from "crypto";

import type { Crosswalk, VersionQuestion } from "./crosswalks";
import {
  validateCrosswalkExhaustive,
  validateCrosswalkAgainstVersion,
} from "./crosswalks";
import type { ResultsAnswer } from "./results-plan";
import type { EspertoRestricted } from "./types";

// ────────────────────────────────────────────────────────────────────────
// Public types (mirror results-plan naming)
// ────────────────────────────────────────────────────────────────────────

/**
 * One reconstructed submission row (one resolved, COMPLETE respondent). Answers
 * reuse results-plan's `{ stableKey, value }` shape; `answerHash` is a salted
 * fingerprint of the canonical answers (provenance / dedupe).
 */
export interface RestrictedRow {
  /** Resolved roster respondent id (externalId === mid). */
  respondentId: string;
  /** Esperto member token — kept so commit can re-resolve identity in-tx. */
  mid: string;
  /** Esperto per-report token — kept for provenance/audit only. */
  reportid: string;
  /** Esperto file `date` (ISO-8601 w/ offset) → submission `submittedAt`. */
  submittedAt: string;
  answers: ResultsAnswer[];
  /** sha256 of the row's canonical (stableKey-sorted) answers, salted. */
  answerHash: string;
}

/**
 * The ONE reconstructed round-campaign (single Esperto `cid`). openAt/closeAt are
 * the min/max of the INCLUDED rows' submittedAt; externalId namespaces the round.
 */
export interface RestrictedCampaign {
  /** Esperto's `cid` (the single campaign token shared by every file). */
  cid: string;
  /** Namespaced round externalId — `esperto:sufull:<cid>:<roundLabelSlug>`. */
  externalId: string;
  /** Operator-facing default name, derived from the raw round label. */
  name: string;
  /** Slugified round label (also the collision key the caller dedupes on). */
  roundLabelSlug: string;
  /** Earliest included-row submittedAt → round `openAt`. */
  openAt: string;
  /** Latest included-row submittedAt → round `closeAt`. */
  closeAt: string;
  rows: RestrictedRow[];
}

/** A respondent skipped (not imported) with a machine-readable reason. */
export interface RestrictedSkip {
  mid: string;
  reportid: string;
  reason: "unresolved-respondent" | "incomplete-respondent";
  /** Present for incomplete-respondent — the scorable keys that were absent/blank. */
  missingKeys?: string[];
}

/** A batch-level fatal error. A non-empty `blocks` makes the plan null-campaign. */
export interface RestrictedBlock {
  reason:
    | "crosswalk-locked"
    | "crosswalk-invalid-for-version"
    | "empty-batch"
    | "invalid-round-label"
    | "invalid-file-fields"
    | "multiple-cids"
    | "duplicate-respondent"
    | "unknown-answer-keys";
  detail: string;
}

/** A non-fatal warning; the route layer may surface / require an ack. */
export interface RestrictedWarning {
  reason: string;
  detail: string;
}

/**
 * Provenance manifest — carries NO raw PII. Only salted hashes + counts, so it is
 * safe to persist/log alongside the import audit trail.
 */
export interface RoundManifest {
  cid: string;
  /** The raw coach-supplied round label (retained for operator display). */
  roundLabel: string;
  roundLabelSlug: string;
  /** Which template crosswalk produced this round (alias only). */
  versionCrosswalkAlias: string;
  /** Salted fingerprint of the whole included-row set (order-independent). */
  batchFingerprint: string;
  /**
   * Per included-row salted hashes — NO raw mid/reportid. `saltedMidHash` lets a
   * later commit reconcile "this respondent already existed in a prior import of
   * this same round" (exact/superset/divergent reuse classification) without ever
   * persisting the raw mid; it is stable given the same `hashSalt`.
   */
  respondents: { saltedMidHash: string; saltedReportIdHash: string; answerHash: string }[];
  /** Count of respondents skipped (unresolved + incomplete). */
  skippedCount: number;
}

export interface BuildRestrictedImportPlanInput {
  /** The batch: parsed restricted-individual files (one respondent each). */
  files: EspertoRestricted[];
  /** Resolved by the caller via getCrosswalkByTemplateAlias("scaling-up-full"). */
  crosswalk: Crosswalk;
  /** Coach-supplied round label, raw (validated + slugified here). */
  roundLabel: string;
  /** Explicit target org (never inferred from the files). */
  targetOrgId: string;
  /** The target org's resolved roster (id + externalId). */
  respondents: { id: string; externalId: string | null }[];
  /** The pinned published version's questions (type/scale compatibility guard). */
  versionQuestions: VersionQuestion[];
  /** stableKeys that MUST be present + in-range for a COMPLETE respondent. */
  scorableStableKeys: string[];
  /** Salt for provenance hashes (caller passes from env; tests pass a fixed value). */
  hashSalt: string;
  /**
   * "Now", as an ISO-8601 string, for the file-date sanity bound (R2-M4).
   * Optional so the module stays pure/deterministic for tests (which pass a
   * fixed value); the production caller may omit it to use the real clock.
   */
  nowIso?: string;
}

export interface RestrictedImportPlan {
  /** ONE campaign; null when any block prevents planning. */
  campaign: RestrictedCampaign | null;
  /** Per-respondent, non-fatal. */
  skips: RestrictedSkip[];
  /** Batch-level fatal reasons (campaign stays null). */
  blocks: RestrictedBlock[];
  /** Non-fatal, may require ack at the route layer. */
  warnings: RestrictedWarning[];
  /** Provenance; null when blocked. */
  manifest: RoundManifest | null;
}

// ────────────────────────────────────────────────────────────────────────
// Exported helpers
// ────────────────────────────────────────────────────────────────────────

/** Max round-label length (raw, pre-slug) — a generous but bounded cap. */
export const MAX_ROUND_LABEL_LENGTH = 64;

/** Max length for an opaque Esperto token (cid / mid / reportid). */
export const MAX_TOKEN_LENGTH = 128;

/** Absolute floor for a plausible historical file date (R2-M4) — Esperto predates this by decades of margin. */
export const MIN_SANE_DATE_ISO = "2000-01-01T00:00:00.000Z";

/** Clock-skew grace window for the "not in the future" check. */
const FUTURE_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * True if `s` contains a C0 control character (code point 0 through 31) or DEL
 * (127). Checked via char codes (not a regex escape range) so the source never
 * embeds a literal control byte.
 */
function hasControlOrNulChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** Is `s` a well-formed opaque token: non-blank, ≤128 chars, no whitespace/control chars? */
function isValidToken(s: string): boolean {
  if (typeof s !== "string") return false;
  if (s.length === 0) return false;
  if (s.length > MAX_TOKEN_LENGTH) return false;
  if (hasControlOrNulChar(s)) return false;
  if (s.trim() !== s) return false; // no leading/trailing whitespace either
  return true;
}

/** Is `dateIso` ISO-parseable and within [MIN_SANE_DATE_ISO, now + grace]? */
function isSaneFileDate(dateIso: string, nowIso: string): boolean {
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return false;
  const min = Date.parse(MIN_SANE_DATE_ISO);
  const max = Date.parse(nowIso) + FUTURE_GRACE_MS;
  return t >= min && t <= max;
}

/**
 * Slugify a coach-supplied round label. Returns the slug on success, or `null`
 * when the label is unusable (empty, too long, control chars, or empties out).
 *
 *   trim → reject empty / >64 chars / control chars → lowercase → collapse runs
 *   of non-[a-z0-9] into "-" → strip leading/trailing "-" → reject if empty.
 *
 * Collision-aware BY DESIGN: "Year 1" and "year-1" both slugify to "year-1", so
 * the caller can detect a same-round re-import by comparing slugs.
 */
export function slugifyRoundLabel(label: string): string | null {
  if (typeof label !== "string") return null;
  const trimmed = label.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_ROUND_LABEL_LENGTH) return null;
  // Reject ASCII control chars (C0 range \u0000-\u001F + DEL \u007F) — never
  // smuggle them into a slug (Unicode escapes, so no-control-regex is not tripped).
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;

  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) return null;
  return slug;
}

/** sha256 hex of `salt \u0000 value` (null-byte separator) — the single salted-hash primitive. */
export function saltedHash(salt: string, value: string): string {
  return createHash("sha256").update(`${salt}\u0000${value}`).digest("hex");
}

/**
 * Canonical, order-independent answer hash: sort answers by stableKey, JSON-encode
 * `[stableKey, value]` pairs, and salt-hash. Identical answer SETS → identical
 * hash regardless of source ordering; any value change → a different hash.
 */
export function computeAnswerHash(
  salt: string,
  answers: ResultsAnswer[],
): string {
  const canonical = [...answers]
    .sort((a, b) => (a.stableKey < b.stableKey ? -1 : a.stableKey > b.stableKey ? 1 : 0))
    .map((a) => [a.stableKey, a.value]);
  return saltedHash(salt, JSON.stringify(canonical));
}

// ────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────

/** Empty result — one place so every early-return blocks the campaign+manifest. */
function emptyPlan(): RestrictedImportPlan {
  return { campaign: null, skips: [], blocks: [], warnings: [], manifest: null };
}

/** Is a mapped value a "blank" (absent / null / empty-or-whitespace string)? */
function isBlank(raw: unknown): boolean {
  return (
    raw === null ||
    raw === undefined ||
    (typeof raw === "string" && raw.trim() === "")
  );
}

/**
 * Coerce one raw restricted value to our `{stableKey, value}` shape, per ourType.
 * Numeric strings become numbers for SLIDER_LIKERT/NUMBER; everything else that is
 * non-blank is kept as a string (TEXT / MULTI_CHOICE). Blanks return `undefined`
 * (the key is simply absent from the answer set).
 */
function coerceValue(
  ourType: string,
  raw: unknown,
): number | string | undefined {
  if (isBlank(raw)) return undefined;

  if (ourType === "SLIDER_LIKERT" || ourType === "NUMBER") {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const n = Number(raw.trim());
      if (Number.isFinite(n)) return n;
    }
    // A present-but-non-numeric value for a numeric type: keep the raw string so
    // completeness can still see "something is here" but scoring downstream flags it.
    return typeof raw === "string" ? raw : String(raw);
  }

  // TEXT / MULTI_CHOICE → string.
  return typeof raw === "string" ? raw : String(raw);
}

// ────────────────────────────────────────────────────────────────────────
// buildRestrictedImportPlan
// ────────────────────────────────────────────────────────────────────────

export function buildRestrictedImportPlan(
  input: BuildRestrictedImportPlanInput,
): RestrictedImportPlan {
  const {
    files,
    crosswalk,
    roundLabel,
    respondents,
    versionQuestions,
    scorableStableKeys,
    hashSalt,
    nowIso = new Date().toISOString(),
  } = input;

  // ── 1. Round-label validation. An unusable label blocks upfront (before we
  //    trust anything else in the batch). ───────────────────────────────────
  const roundLabelSlug = slugifyRoundLabel(roundLabel);
  if (roundLabelSlug === null) {
    const plan = emptyPlan();
    plan.blocks.push({
      reason: "invalid-round-label",
      detail: `round label "${roundLabel}" is empty, too long (>${MAX_ROUND_LABEL_LENGTH}), contains control characters, or slugifies to nothing`,
    });
    return plan;
  }

  // ── 2. Crosswalk locked gate (§7). Phase 1 keeps SU-Full locked:false, so a
  //    real import is refused until a human clears the lock checklist. ────────
  if (crosswalk.locked !== true) {
    const plan = emptyPlan();
    plan.blocks.push({
      reason: "crosswalk-locked",
      detail: `crosswalk "${crosswalk.templateAlias}" is not locked; SU-Full historical import is refused until the lock checklist clears`,
    });
    return plan;
  }

  // ── 3. Crosswalk-vs-version compatibility (ADR-0001 / §7). This is where a
  //    crosswalk mapping a key ABSENT from the pinned version (e.g. an
  //    unconditional FTE mapping) is caught — the SU-Full crosswalk must only map
  //    keys present in the pinned version (FTE mapping must be conditional). ──
  const versionCheck = validateCrosswalkAgainstVersion(crosswalk, versionQuestions);
  if (!versionCheck.ok) {
    const plan = emptyPlan();
    plan.blocks.push({
      reason: "crosswalk-invalid-for-version",
      detail: versionCheck.problems.join("; "),
    });
    return plan;
  }

  // ── 4. Empty batch. Nothing to plan. ─────────────────────────────────────
  if (files.length === 0) {
    const plan = emptyPlan();
    plan.blocks.push({
      reason: "empty-batch",
      detail: "no restricted-individual files supplied",
    });
    return plan;
  }

  // ── 4b. Strict per-file field validation (R2-M4). Every file's cid/mid/
  //    reportid must be a well-formed opaque token, and `date` must be
  //    ISO-parseable and within a sane historical window. Runs before any
  //    later step trusts these fields as identity/timestamps. Detail never
  //    echoes the raw (possibly malformed) values. ──────────────────────────
  const invalidFileIndexes: number[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (
      !isValidToken(f.cid) ||
      !isValidToken(f.mid) ||
      !isValidToken(f.reportid) ||
      !isSaneFileDate(f.date, nowIso)
    ) {
      invalidFileIndexes.push(i);
    }
  }
  if (invalidFileIndexes.length > 0) {
    const plan = emptyPlan();
    plan.blocks.push({
      reason: "invalid-file-fields",
      detail: `${invalidFileIndexes.length} of ${files.length} file(s) have a malformed cid/mid/reportid or an unparseable/out-of-range date (file index(es): ${invalidFileIndexes.join(", ")})`,
    });
    return plan;
  }

  // ── 5. Single cid. All files must share ONE campaign token. ──────────────
  const distinctCids = Array.from(new Set(files.map((f) => f.cid)));
  if (distinctCids.length > 1) {
    const plan = emptyPlan();
    plan.blocks.push({
      reason: "multiple-cids",
      detail: `batch spans ${distinctCids.length} distinct cids (${distinctCids.join(", ")}); a round is exactly one cid`,
    });
    return plan;
  }
  const cid = distinctCids[0];

  // ── 6. Duplicate-respondent tripwire. The same (cid, mid) in >1 file means
  //    two rounds got mixed into one batch — block (name the salted mid). ─────
  const seenMids = new Set<string>();
  const duplicateMids = new Set<string>();
  for (const f of files) {
    if (seenMids.has(f.mid)) duplicateMids.add(f.mid);
    else seenMids.add(f.mid);
  }
  if (duplicateMids.size > 0) {
    const plan = emptyPlan();
    const hashes = Array.from(duplicateMids).map((m) => saltedHash(hashSalt, m));
    plan.blocks.push({
      reason: "duplicate-respondent",
      detail: `(cid ${cid}) member(s) [salted ${hashes.join(", ")}] appear in more than one file — this looks like two rounds mixed into one batch`,
    });
    return plan;
  }

  // ── 7. Exhaustiveness. Over the union of every file's raw answer keys, any key
  //    not in `map` ∪ `droppedKeys` is unknown → block. Demographic keys are in
  //    `droppedKeys` already, so they never count as unknown. ────────────────
  const unknownKeys = new Set<string>();
  for (const f of files) {
    const { unknownKeys: u } = validateCrosswalkExhaustive(
      crosswalk,
      Object.keys(f.raw),
    );
    for (const k of u) unknownKeys.add(k);
  }
  if (unknownKeys.size > 0) {
    const plan = emptyPlan();
    plan.blocks.push({
      reason: "unknown-answer-keys",
      detail: `unmapped answer key(s): ${Array.from(unknownKeys).sort().join(", ")}`,
    });
    return plan;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // No blocks. Build the single campaign: flatten → resolve → complete → hash.
  // ─────────────────────────────────────────────────────────────────────────

  const plan: RestrictedImportPlan = {
    campaign: null,
    skips: [],
    blocks: [],
    warnings: [],
    manifest: null,
  };

  // Roster lookup: externalId → respondent id.
  const respByExternalId = new Map<string, string>();
  for (const r of respondents) {
    if (r.externalId) respByExternalId.set(r.externalId, r.id);
  }

  // The scorable-key set the completeness gate enforces.
  const scorableSet = scorableStableKeys;

  const rows: RestrictedRow[] = [];
  const manifestRespondents: { saltedMidHash: string; saltedReportIdHash: string; answerHash: string }[] = [];

  for (const file of files) {
    // 8. Respondent resolution — mid → roster respondent by externalId. An
    //    unresolved mid is SKIPPED (never create, never fail the batch).
    const respondentId = respByExternalId.get(file.mid);
    if (!respondentId) {
      plan.skips.push({
        mid: file.mid,
        reportid: file.reportid,
        reason: "unresolved-respondent",
      });
      continue;
    }

    // 7b/flatten. Map raw Q-codes via crosswalk.map (skip droppedKeys implicitly:
    //    only mapped keys become answers). Blank values are omitted.
    const answers: ResultsAnswer[] = [];
    for (const entry of crosswalk.map) {
      const raw = file.raw[entry.espertoKey];
      const value = coerceValue(entry.ourType, raw);
      if (value === undefined) continue;
      answers.push({ stableKey: entry.stableKey, value });
    }

    // 9. Completeness gate. Every scorable key must be present + non-blank in the
    //    mapped answers. Missing any → skip incomplete-respondent (NO partial row).
    const presentKeys = new Set(answers.map((a) => a.stableKey));
    const missingKeys = scorableSet.filter((k) => !presentKeys.has(k));
    if (missingKeys.length > 0) {
      plan.skips.push({
        mid: file.mid,
        reportid: file.reportid,
        reason: "incomplete-respondent",
        missingKeys,
      });
      continue;
    }

    // 10. answerHash (canonical, salted). submittedAt = the file `date`, preserved.
    const answerHash = computeAnswerHash(hashSalt, answers);
    rows.push({
      respondentId,
      mid: file.mid,
      reportid: file.reportid,
      submittedAt: file.date,
      answers,
      answerHash,
    });
    manifestRespondents.push({
      saltedMidHash: saltedHash(hashSalt, file.mid),
      saltedReportIdHash: saltedHash(hashSalt, file.reportid),
      answerHash,
    });
  }

  // 11. openAt/closeAt = min/max of the INCLUDED rows' submittedAt (ISO strings
  //     sort lexicographically for same-offset timestamps; commit normalizes UTC).
  //     A batch with zero included rows still yields a campaign (empty round) so
  //     the operator sees the skips against a concrete round.
  const includedDates = rows.map((r) => r.submittedAt);
  const openAt =
    includedDates.length > 0
      ? includedDates.reduce((min, d) => (d < min ? d : min), includedDates[0])
      : file0DateOr(files);
  const closeAt =
    includedDates.length > 0
      ? includedDates.reduce((max, d) => (d > max ? d : max), includedDates[0])
      : file0DateOr(files);

  const campaign: RestrictedCampaign = {
    cid,
    externalId: `esperto:sufull:${cid}:${roundLabelSlug}`,
    name: `${crosswalk.templateAlias} — imported — ${roundLabel.trim()}`,
    roundLabelSlug,
    openAt,
    closeAt,
    rows,
  };

  // 10 (fingerprint). batchFingerprint = salted hash of the SORTED `<mid>:<answerHash>`
  //     list for included rows — order-independent, PII-free.
  const fingerprintSource = rows
    .map((r) => `${r.mid}:${r.answerHash}`)
    .sort()
    .join("\n");
  const batchFingerprint = saltedHash(hashSalt, fingerprintSource);

  const manifest: RoundManifest = {
    cid,
    roundLabel,
    roundLabelSlug,
    versionCrosswalkAlias: crosswalk.templateAlias,
    batchFingerprint,
    respondents: manifestRespondents,
    skippedCount: plan.skips.length,
  };

  plan.campaign = campaign;
  plan.manifest = manifest;
  return plan;
}

/** Fallback open/close for a round with zero included rows — the first file's date. */
function file0DateOr(files: EspertoRestricted[]): string {
  return files.length > 0 ? files[0].date : "";
}
