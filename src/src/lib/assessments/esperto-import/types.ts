/**
 * Esperto historical import — TypeScript types for the four export shapes.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4 (architecture),
 * §5 (roster field map), §6 (results field map).
 *
 * These are the PURE parse/classify layer's domain types. No DB, no React.
 * They model the on-disk JSON Esperto ("Scaling Up Toolkit") emits, NOT our
 * own `OrgRespondent`/`AssessmentCampaign` rows — the roster/results PLAN layer
 * maps these onto our schema downstream.
 *
 * Tolerance: Esperto may add metadata keys we don't model. Every object schema
 * in parse.ts uses `.passthrough()`, so unknown extra keys survive. These TS
 * types declare the KNOWN fields plus an index signature where the on-disk
 * object carries dynamic keys (the per-respondent answer blocks `raw_*` /
 * `raw.Q*`, which are not a fixed set).
 */

// ────────────────────────────────────────────────────────────────────────
// Discriminator
// ────────────────────────────────────────────────────────────────────────

/** The four export kinds the classifier distinguishes. */
export type EspertoExportKind =
  | "members"
  | "report"
  | "restricted-individual"
  | "restricted-aggregate";

// ────────────────────────────────────────────────────────────────────────
// 1. Members export (roster) — a JSON ARRAY of member rows
// ────────────────────────────────────────────────────────────────────────

/**
 * One row of an Esperto Members export.
 * The whole export is `EspertoMember[]`.
 */
export interface EspertoMember {
  /** Opaque Esperto member token — our cross-phase join key (→ externalId). */
  memberid: string;
  /** Free-text job function ("CEO", "CFO", "Professional Services"). */
  title: string;
  firstname: string;
  middlename: string;
  lastname: string;
  email: string;
  /** Esperto lifecycle ("active", …) — import gate. */
  status: string;
  /** Esperto Level slug ("ceofounderwithteam", "teamleader", …) → roleType. */
  level: string;
  /** Hard-excluded when true. */
  testuser: boolean;
  /** Empty in observed exports; opaque metadata. */
  extra: unknown[];
  /** Esperto may attach extra metadata keys. */
  [key: string]: unknown;
}

/** The Members export is a bare array. */
export type EspertoMembers = EspertoMember[];

// ────────────────────────────────────────────────────────────────────────
// 2. Report export (results, e.g. QSP v2) — `{ personal: [...], summary: [...] }`
// ────────────────────────────────────────────────────────────────────────

/**
 * One respondent row inside a Report export's `personal[]`.
 *
 * The per-question answer blocks `raw_*` and `processed_*` are DYNAMIC (the key
 * set depends on the template's question codes), so they are modelled via the
 * index signature rather than fixed keys. Read them as
 * `Object.entries(row).filter(([k]) => k.startsWith("raw_"))`.
 */
export interface EspertoReportRow {
  /** Opaque per-report token. */
  reportid: string;
  /** Usually null in exports; company/CEO label when present. */
  name: string | null;
  status: string;
  tags: string;
  /** ISO-8601 with offset, e.g. "2026-06-04T15:53:27-04:00" → submittedAt. */
  date: string;
  lastopened: string | null;
  type: string;
  /** Template attribution, e.g. "QuartSessPrepv2" → crosswalk registry key. */
  variant: string;
  language: string;
  testcase: string;
  /** Roster join key (→ OrgRespondent.externalId). */
  memberid: string;
  /** Campaign provenance (→ AssessmentCampaign.externalId, namespaced). */
  campaignid: string;
  groupid: string | null;
  token: string;
  config: { extra: unknown; campaignparams: string } & Record<string, unknown>;
  /** Optional Esperto buyer/seller role marker ("role=buyer") — dropped by us. */
  specialparticipant?: string;
  /** `raw_*` (verbatim answers) + `processed_*` (Esperto-massaged) + extra. */
  [key: string]: unknown;
}

export interface EspertoReport {
  personal: EspertoReportRow[];
  /** Observed empty; group-level summary rows when present. */
  summary: unknown[];
  /** Esperto may attach extra metadata keys. */
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────────────
// 3. Restricted export (SU Full) — individual & aggregate share one shape
// ────────────────────────────────────────────────────────────────────────

/**
 * A restricted "Scaling Up Assessment" export.
 *
 * `mat`, `cid`, `mid` are opaque tokens. The discriminator between the two
 * sub-kinds is the `processed` block:
 *   - INDIVIDUAL: no key starts with "group" (and `mat` is a token).
 *   - AGGREGATE:  ≥1 key starts with "group" (and `mat` is null).
 *
 * `raw` carries per-question Q-codes + demographics; `processed` carries scores
 * (individual) plus, in the aggregate, the lossy `group*` min/avg/max series.
 * Both blocks are DYNAMIC key sets → index-signature records.
 */
export interface EspertoRestricted {
  reportid: string;
  date: string;
  name: string;
  tags: unknown[];
  /** Token in the individual export; NULL in the aggregate export. */
  mat: string | null;
  /** Campaign-ish token. */
  cid: string;
  /** Member token (→ roster join). */
  mid: string;
  /** Per-question raw answers (Q-codes) + demographics. */
  raw: Record<string, unknown>;
  /** Scores; aggregate additionally carries many `group*` keys. */
  processed: Record<string, unknown>;
  /** Esperto may attach extra metadata keys. */
  [key: string]: unknown;
}

/** Type alias — restricted individual & aggregate share the object shape. */
export type EspertoRestrictedIndividual = EspertoRestricted;
export type EspertoRestrictedAggregate = EspertoRestricted;

// ────────────────────────────────────────────────────────────────────────
// Parsed result — discriminated union returned by parseEspertoExport()
// ────────────────────────────────────────────────────────────────────────

export type ParsedExport =
  | { kind: "members"; data: EspertoMembers }
  | { kind: "report"; data: EspertoReport }
  | { kind: "restricted-individual"; data: EspertoRestricted }
  | { kind: "restricted-aggregate"; data: EspertoRestricted };
