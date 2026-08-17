/**
 * Assessment v7.6 Wave S — LVA peer benchmarks (Jeff July-1 #12 + #13).
 *
 * Spec: docs/specs/v7.6/19s-wave-s-lva-peers-design.md (S-3 lib + S-5
 * individual-report builder). Peer averages are ADMIN-SET `AssessmentBenchmark`
 * rows (metricKind QUESTION, template-level — see spec S-1/C1 for why NOT
 * version-level), never aggregated live. LVA is admin-entered; Scaling Up Full
 * also has a governed source snapshot (ADR-0019 amendment).
 *
 * This module is the single home for:
 *  - Separate editor/render alias gates. Scaling Up Full's verified values can
 *    be administered before its paired-bar report UI is released; report
 *    joins remain limited to aliases with a completed render path.
 *  - `listRatingQuestionKeys` — the editor's row source: SLIDER_LIKERT
 *    questions of the published version, labelled the way the REPORT prints
 *    them (LVA report factor-label overrides, legacy-suffix strip).
 *  - `getQuestionBenchmarks` / `reconcileQuestionBenchmarks` — thin DB
 *    helpers. The reconcile is the atomic full-set save (D8/D14, mechanism per
 *    co-validate C3): one transaction, batch-replace changed rows, remove
 *    missing rows, and batch-create new rows; unchanged rows keep their id +
 *    timestamps.
 *  - `buildPeerComparisonSection` — the PURE individual-report builder (S-5).
 *    Deliberately NOT part of `buildQualitativeModel`: that model is shared
 *    with the results email, and keeping the peers section a separate builder
 *    keeps the email byte-identical by construction (D9).
 *
 * DB access is typed STRUCTURALLY (minimal delegate interfaces, house style —
 * see transfer-ownership.ts) so callers can pass the Prisma client, a tx
 * client, or a test mock. Everything else is pure: no React, no flag reads.
 */

import {
  LVA_TEMPLATE_ALIAS,
  lvaReportFactorLabel,
} from "@/lib/assessments/lva-report-display";
import { stripLegacyDecimalSuffix } from "@/lib/assessments/question-label";
import { SCALING_UP_FULL_TEMPLATE_ALIAS } from "@/lib/assessments/su-full-question-benchmarks";

// ─── Editor/render-enabled aliases ─────────────────────────────────────────────

/**
 * Template aliases whose peer benchmarks have a completed report render path.
 */
export const PEER_RENDER_ENABLED_ALIASES: readonly string[] = [
  LVA_TEMPLATE_ALIAS,
];

/**
 * Template aliases whose per-question peer values can be administered.
 * Scaling Up Full is intentionally editor-only until its paired-bar report UI
 * ships; keeping these gates separate prevents unfinished report rendering.
 */
export const PEER_EDITOR_ENABLED_ALIASES: readonly string[] = [
  LVA_TEMPLATE_ALIAS,
  SCALING_UP_FULL_TEMPLATE_ALIAS,
];

/** Whether a template alias is peer-render-enabled. Null/undefined → false. */
export function isPeerRenderEnabledAlias(
  alias: string | null | undefined,
): boolean {
  return (
    typeof alias === "string" && PEER_RENDER_ENABLED_ALIASES.includes(alias)
  );
}

/** Whether a template alias exposes the peer-benchmark admin editor. */
export function isPeerEditorEnabledAlias(
  alias: string | null | undefined,
): boolean {
  return (
    typeof alias === "string" && PEER_EDITOR_ENABLED_ALIASES.includes(alias)
  );
}

// ─── Editor row source — rating-question keys of a published version ────────

export interface RatingQuestionKey {
  stableKey: string;
  /** Display label — what the REPORT prints (overrides applied for LVA). */
  label: string;
}

interface RawVersionQuestion {
  stableKey: string;
  type: string;
  label?: unknown;
}

function isRawVersionQuestion(v: unknown): v is RawVersionQuestion {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.stableKey === "string" &&
    r.stableKey !== "" &&
    typeof r.type === "string"
  );
}

/**
 * The SLIDER_LIKERT questions of a published version's `questions` Json, in
 * version order, as `{ stableKey, label }` rows for the benchmarks editor.
 *
 * Defensive: a non-array input or a malformed entry (missing/blank stableKey,
 * missing type) is skipped — never throws. A missing/blank label falls back to
 * the stableKey so a key can never disappear from the editor (and thus from
 * the reconcile's validKeys) over a cosmetic content defect.
 *
 * When `templateAlias` is the LVA alias, labels get the Esperto REPORT
 * factor-label overrides (`LVA_REPORT_FACTOR_LABELS`) exactly like the group
 * report's rating section, so the admin sees what the report prints. All
 * labels get the legacy "(with 1 decimal)" suffix strip, same as the reports.
 */
export function listRatingQuestionKeys(
  versionQuestions: unknown,
  templateAlias?: string | null,
): RatingQuestionKey[] {
  if (!Array.isArray(versionQuestions)) return [];

  const isLva = templateAlias === LVA_TEMPLATE_ALIAS;
  const out: RatingQuestionKey[] = [];

  for (const raw of versionQuestions as unknown[]) {
    if (!isRawVersionQuestion(raw)) continue;
    if (raw.type !== "SLIDER_LIKERT") continue;

    const surveyLabel =
      typeof raw.label === "string" && raw.label.trim() !== ""
        ? stripLegacyDecimalSuffix(raw.label)
        : raw.stableKey;
    const label = isLva
      ? lvaReportFactorLabel(raw.stableKey, surveyLabel)
      : surveyLabel;

    out.push({ stableKey: raw.stableKey, label });
  }

  return out;
}

// ─── Structural DB types (minimal delegates, house style) ────────────────────

/** The benchmark row shape this module reads (select id/metricKey/value). */
export interface QuestionBenchmarkRow {
  id: string;
  metricKey: string;
  value: number;
}

/** Read side — satisfied by the Prisma client, a tx client, or a mock. */
export interface PeerBenchmarksReadDb {
  assessmentBenchmark: {
    findMany(args: {
      where: { templateId: string; metricKind: "QUESTION" };
      select: { id: true; metricKey: true; value: true };
    }): Promise<QuestionBenchmarkRow[]>;
  };
}

/** Write side — the client the reconcile transaction runs against. */
export interface PeerBenchmarksTx extends PeerBenchmarksReadDb {
  assessmentBenchmark: PeerBenchmarksReadDb["assessmentBenchmark"] & {
    createMany(args: {
      data: Array<{
        templateId: string;
        metricKind: "QUESTION";
        metricKey: string;
        value: number;
      }>;
    }): Promise<unknown>;
    deleteMany(args: {
      where: { id: { in: string[] } };
    }): Promise<unknown>;
  };
}

/** A client that can open the reconcile transaction (the root Prisma client). */
export interface PeerBenchmarksDb {
  $transaction<T>(fn: (tx: PeerBenchmarksTx) => Promise<T>): Promise<T>;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/**
 * The template's QUESTION-kind benchmark rows as a stableKey → value map.
 * Report paths call this ONLY when the flag is on and the alias is
 * render-enabled (flag OFF ⇒ zero benchmark DB reads — S-2).
 */
export async function getQuestionBenchmarks(
  db: PeerBenchmarksReadDb,
  templateId: string,
): Promise<Map<string, number>> {
  const rows = await db.assessmentBenchmark.findMany({
    where: { templateId, metricKind: "QUESTION" },
    select: { id: true, metricKey: true, value: true },
  });
  return new Map(rows.map((r) => [r.metricKey, r.value]));
}

// ─── Reconcile (D14 + co-validate C3) ────────────────────────────────────────

export type PeerBenchmarkValidationCode =
  | "UNKNOWN_KEY"
  | "DUPLICATE_KEY"
  | "VALUE_OUT_OF_BOUNDS"
  | "VALUE_NOT_FINITE"
  | "TOO_MANY_ENTRIES";

/** Typed validation failure — the API route maps this to a 400. */
export class PeerBenchmarkValidationError extends Error {
  readonly code: PeerBenchmarkValidationCode;

  constructor(code: PeerBenchmarkValidationCode, message: string) {
    super(message);
    this.name = "PeerBenchmarkValidationError";
    this.code = code;
  }
}

/** Hard cap on a reconcile submission (LVA has 16 factors; 64 is generous). */
export const MAX_BENCHMARK_ENTRIES = 64;

/** Round to 1 decimal, plain signed rounding (spec: NOT Zod `multipleOf`). */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export interface ReconcileQuestionBenchmarksInput {
  templateId: string;
  /** The FULL desired set — a key absent here means "delete the row". */
  entries: Array<{ stableKey: string; value: number }>;
  /** Keys of the currently-published version's rating questions. */
  validKeys: ReadonlySet<string>;
}

export interface ReconcileQuestionBenchmarksResult {
  /** stableKey → stored value BEFORE the save (the audit delta's left side). */
  before: Record<string, number>;
  /** stableKey → stored value AFTER the save (rounded to 1dp). */
  after: Record<string, number>;
}

function buildDesiredQuestionBenchmarks(
  input: ReconcileQuestionBenchmarksInput,
): Map<string, number> {
  const { entries, validKeys } = input;

  if (entries.length > MAX_BENCHMARK_ENTRIES) {
    throw new PeerBenchmarkValidationError(
      "TOO_MANY_ENTRIES",
      `At most ${MAX_BENCHMARK_ENTRIES} benchmark entries are allowed (got ${entries.length}).`,
    );
  }

  const desired = new Map<string, number>();
  for (const entry of entries) {
    if (!validKeys.has(entry.stableKey)) {
      throw new PeerBenchmarkValidationError(
        "UNKNOWN_KEY",
        `Unknown benchmark key "${entry.stableKey}" — not a rating question of the published version.`,
      );
    }
    if (desired.has(entry.stableKey)) {
      throw new PeerBenchmarkValidationError(
        "DUPLICATE_KEY",
        `Duplicate benchmark key "${entry.stableKey}" in submission.`,
      );
    }
    if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
      throw new PeerBenchmarkValidationError(
        "VALUE_NOT_FINITE",
        `Benchmark value for "${entry.stableKey}" must be a finite number.`,
      );
    }
    if (entry.value < 0 || entry.value > 10) {
      throw new PeerBenchmarkValidationError(
        "VALUE_OUT_OF_BOUNDS",
        `Benchmark value for "${entry.stableKey}" must be between 0 and 10 (got ${entry.value}).`,
      );
    }
    desired.set(entry.stableKey, round1(entry.value));
  }

  return desired;
}

async function reconcileDesiredQuestionBenchmarks(
  tx: PeerBenchmarksTx,
  templateId: string,
  desired: ReadonlyMap<string, number>,
): Promise<ReconcileQuestionBenchmarksResult> {
  const existing = await tx.assessmentBenchmark.findMany({
    where: { templateId, metricKind: "QUESTION" },
    select: { id: true, metricKey: true, value: true },
  });

  const before: Record<string, number> = {};
  for (const row of existing) before[row.metricKey] = row.value;

  // Delete stale and changed rows in one batch. Changed rows are recreated
  // below; unchanged rows remain untouched so their id/timestamps stay honest.
  const replacedIds = existing
    .filter((row) => {
      const desiredValue = desired.get(row.metricKey);
      return desiredValue === undefined || desiredValue !== row.value;
    })
    .map((row) => row.id);
  if (replacedIds.length > 0) {
    await tx.assessmentBenchmark.deleteMany({
      where: { id: { in: replacedIds } },
    });
  }

  // Recreate changed rows and add new rows with one bounded batch write.
  const existingByKey = new Map(existing.map((row) => [row.metricKey, row]));
  const newRows: Array<{
    templateId: string;
    metricKind: "QUESTION";
    metricKey: string;
    value: number;
  }> = [];
  for (const [stableKey, value] of desired) {
    const row = existingByKey.get(stableKey);
    if (!row || row.value !== value) {
      newRows.push({
        templateId,
        metricKind: "QUESTION",
        metricKey: stableKey,
        value,
      });
    }
  }
  if (newRows.length > 0) {
    await tx.assessmentBenchmark.createMany({ data: newRows });
  }

  return { before, after: Object.fromEntries(desired) };
}

/**
 * Full-set reconcile inside a caller-owned transaction. Seed/repair paths use
 * this variant when the benchmark mutation and its audit row must commit or
 * roll back together.
 */
export async function reconcileQuestionBenchmarksInTx(
  tx: PeerBenchmarksTx,
  input: ReconcileQuestionBenchmarksInput,
): Promise<ReconcileQuestionBenchmarksResult> {
  const desired = buildDesiredQuestionBenchmarks(input);
  return reconcileDesiredQuestionBenchmarks(tx, input.templateId, desired);
}

/**
 * Atomic full-set reconcile of a template's QUESTION benchmarks (D8/D14,
 * mechanism per co-validate C3). The DB always mirrors the last-saved form:
 * blank field = key absent = row deleted; stale keys (no longer in the
 * published version) are pruned the same way.
 *
 * Validation (typed `PeerBenchmarkValidationError`, thrown BEFORE the
 * transaction opens): unknown stableKey, duplicate stableKey, non-finite
 * value, value outside [0, 10], more than `MAX_BENCHMARK_ENTRIES` entries.
 * Values are then rounded to 1dp — the rounded value is what gets compared
 * and written.
 *
 * In ONE `db.$transaction`: read existing rows → batch-delete rows missing
 * from the submission or whose rounded value changed → batch-create changed
 * and new rows. Rows with unchanged values are NOT touched (id + timestamps
 * kept, so `updatedAt` provenance stays honest).
 *
 * Returns before/after value maps for the caller's audit delta.
 */
export async function reconcileQuestionBenchmarks(
  db: PeerBenchmarksDb,
  input: ReconcileQuestionBenchmarksInput,
): Promise<ReconcileQuestionBenchmarksResult> {
  // Preserve the API contract that validation fails before a transaction opens.
  const desired = buildDesiredQuestionBenchmarks(input);

  return db.$transaction(async (tx) => {
    return reconcileDesiredQuestionBenchmarks(tx, input.templateId, desired);
  });
}

// ─── S-5 — the pure individual-report peers section ──────────────────────────

/** The S3 section stableKey — the ONLY section peers apply to this wave. */
const S3_SECTION_KEY = "S3_strengths";

export const PEER_COMPARISON_TITLE =
  "Organizational Strengths and Weaknesses — compared to peers";
export const PEER_COMPARISON_INTRO =
  "Your rating per factor next to the peer average (companies that have preceded you in this assessment).";

export interface PeerComparisonItem {
  stableKey: string;
  /** The REPORT factor label (LVA overrides applied). */
  label: string;
  /** The respondent's own rating word (stored 1/2/3). */
  ownRating: "Weak" | "Average" | "Strong";
  /** The own rating on the shared 0–10 axis (clean thirds, Wave L L3). */
  ownValue: 0 | 5 | 10;
  /** The admin-set peer average (0–10, 1dp). */
  peers: number;
  /** Signed deviation `ownValue − peers`, rounded to 1dp. */
  dev: number;
}

export interface PeerComparisonSection {
  sectionKey: "S3_strengths";
  title: string;
  intro: string;
  items: PeerComparisonItem[];
}

export interface BuildPeerComparisonSectionInput {
  /** QMeta-shaped map, insertion order = version question order. */
  questionsByKey: Record<string, unknown> | null | undefined;
  /** The persisted raw answers array of `{ stableKey, value }` rows. */
  rawAnswers: unknown;
  /** stableKey → peer average (from `getQuestionBenchmarks`). */
  benchmarks: Map<string, number>;
  /** Gates the LVA report-label overrides (mirrors listRatingQuestionKeys). */
  templateAlias?: string | null;
}

/**
 * Coerce a stored S3 answer to its {1,2,3} domain value, or null. Live-survey
 * rows store numbers; imported/legacy rows can carry numeric STRINGS — accept
 * both (trimmed, finite), then require the exact 1|2|3 domain (the 0/5/10
 * mapping is only valid over it — same posture as `s3ValuesInDomain`).
 */
function coerceS3Answer(value: unknown): 1 | 2 | 3 | null {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    n = Number(value.trim());
  } else {
    return null;
  }
  return n === 1 || n === 2 || n === 3 ? n : null;
}

const OWN_BY_DOMAIN: Record<1 | 2 | 3, { rating: PeerComparisonItem["ownRating"]; value: 0 | 5 | 10 }> = {
  1: { rating: "Weak", value: 0 },
  2: { rating: "Average", value: 5 },
  3: { rating: "Strong", value: 10 },
};

/**
 * Builds the individual report's "compared to peers" section (S-5). PURE — no
 * DB, no React, no flag reads; the page gates the call (flag + alias) and
 * fetches the benchmark map.
 *
 * Iterates the S3 SLIDER_LIKERT questions in `questionsByKey` insertion order
 * (= version order). A factor becomes an item ONLY when BOTH a benchmark value
 * exists for its key AND the respondent's own answer coerces to the {1,2,3}
 * domain (D8 per-factor omit-empty; out-of-domain imported values are omitted,
 * mirroring the group report's scale-degraded posture). Own rating maps to the
 * shared 0–10 axis: 1→0 Weak, 2→5 Average, 3→10 Strong (Wave L L3 thirds).
 *
 * Zero qualifying items ⇒ `null` — the section is entirely absent and the
 * report stays byte-identical (D4: Esperto-faithful S3 suppression untouched).
 */
export function buildPeerComparisonSection(
  input: BuildPeerComparisonSectionInput,
): PeerComparisonSection | null {
  const { questionsByKey, rawAnswers, benchmarks, templateAlias } = input;

  // stableKey → raw value (defensive: skip malformed rows, last write wins —
  // same guard shape as qualitative-report-model's isRawAnswerRow).
  const answerByKey = new Map<string, unknown>();
  if (Array.isArray(rawAnswers)) {
    for (const row of rawAnswers as unknown[]) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (typeof r.stableKey !== "string" || !("value" in r)) continue;
      answerByKey.set(r.stableKey, r.value);
    }
  }

  const isLva = templateAlias === LVA_TEMPLATE_ALIAS;
  const items: PeerComparisonItem[] = [];

  for (const [stableKey, rawMeta] of Object.entries(questionsByKey ?? {})) {
    if (!rawMeta || typeof rawMeta !== "object") continue;
    const meta = rawMeta as Record<string, unknown>;
    if (meta.type !== "SLIDER_LIKERT") continue;
    if (meta.sectionStableKey !== S3_SECTION_KEY) continue;

    const peers = benchmarks.get(stableKey);
    if (typeof peers !== "number" || !Number.isFinite(peers)) continue;

    const domainValue = coerceS3Answer(answerByKey.get(stableKey));
    if (domainValue === null) continue;

    const own = OWN_BY_DOMAIN[domainValue];
    const surveyLabel =
      typeof meta.label === "string" && meta.label.trim() !== ""
        ? stripLegacyDecimalSuffix(meta.label)
        : stableKey;

    items.push({
      stableKey,
      label: isLva ? lvaReportFactorLabel(stableKey, surveyLabel) : surveyLabel,
      ownRating: own.rating,
      ownValue: own.value,
      peers,
      dev: round1(own.value - peers),
    });
  }

  if (items.length === 0) return null;

  return {
    sectionKey: S3_SECTION_KEY,
    title: PEER_COMPARISON_TITLE,
    intro: PEER_COMPARISON_INTRO,
    items,
  };
}
