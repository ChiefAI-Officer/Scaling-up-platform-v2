/**
 * Esperto historical import — zod schemas + parseEspertoExport().
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4, parse.ts;
 * §5/§6 field maps.
 *
 * `parseEspertoExport(json)` classifies the input (via classify.ts) then
 * validates it against the matching zod schema, returning a discriminated
 * `ParsedExport` ({ kind, data }). On malformed / unrecognized input it throws
 * a typed `EspertoParseError` carrying a machine-readable `reason` plus the
 * underlying zod issues in `details`.
 *
 * Tolerance contract (spec §4): object schemas use `.passthrough()` so UNKNOWN
 * extra keys (Esperto metadata) survive rather than being rejected — but the
 * KNOWN discriminating fields are required. The per-respondent answer keys
 * (`raw_*` / `raw.Q*`) are dynamic, so they are modelled as records, not fixed
 * keys, validated only for value SHAPE (number | string | null), never for an
 * exact key set.
 *
 * PURE: no DB, no React. Fully unit-testable against sanitized fixtures.
 */

import { z } from "zod";
import { classifyEspertoExport, EspertoParseError } from "./classify";
import type {
  EspertoMembers,
  EspertoReport,
  EspertoRestricted,
  ParsedExport,
} from "./types";

// Re-export so callers can `import { EspertoParseError } from "./parse"`.
export { EspertoParseError } from "./classify";
export type { EspertoParseReason } from "./classify";

// ────────────────────────────────────────────────────────────────────────
// Shared primitives
// ────────────────────────────────────────────────────────────────────────

/**
 * A single answer / score value as Esperto emits it: a number (int or float,
 * both arrive as JS `number`), a string (free-text answers, "real" score
 * strings), or null. The answer blocks are records of these.
 */
const EspertoValue = z.union([z.number(), z.string(), z.null()]);

/** A dynamic-key block of answer/score values (e.g. `raw`, `processed`). */
const ValueRecord = z.record(z.string(), EspertoValue);

// ────────────────────────────────────────────────────────────────────────
// 1. Members
// ────────────────────────────────────────────────────────────────────────

export const EspertoMemberSchema = z
  .object({
    memberid: z.string(),
    title: z.string(),
    firstname: z.string(),
    middlename: z.string(),
    lastname: z.string(),
    email: z.string(),
    status: z.string(),
    level: z.string(),
    testuser: z.boolean(),
    extra: z.array(z.unknown()),
  })
  .passthrough();

export const EspertoMembersSchema = z.array(EspertoMemberSchema).min(1);

// ────────────────────────────────────────────────────────────────────────
// 2. Report (e.g. QSP v2)
// ────────────────────────────────────────────────────────────────────────

export const EspertoReportRowSchema = z
  .object({
    reportid: z.string(),
    name: z.string().nullable(),
    status: z.string(),
    tags: z.string(),
    date: z.string(),
    lastopened: z.string().nullable(),
    type: z.string(),
    variant: z.string(),
    language: z.string(),
    testcase: z.string(),
    memberid: z.string(),
    campaignid: z.string(),
    groupid: z.string().nullable(),
    token: z.string(),
    config: z
      .object({
        extra: z.unknown(),
        campaignparams: z.string(),
      })
      .passthrough(),
    // Optional Esperto buyer/seller marker — present on only some rows.
    specialparticipant: z.string().optional(),
    // `raw_*` / `processed_*` answer blocks are dynamic → covered by passthrough.
    // We don't enforce their key set here; the crosswalk's exhaustiveness guard
    // (a later step) checks per-answer keys against the locked map.
  })
  .passthrough();

export const EspertoReportSchema = z
  .object({
    personal: z.array(EspertoReportRowSchema),
    summary: z.array(z.unknown()),
  })
  .passthrough();

// ────────────────────────────────────────────────────────────────────────
// 3. Restricted (individual + aggregate share the object shape)
// ────────────────────────────────────────────────────────────────────────

const EspertoRestrictedBaseSchema = z
  .object({
    reportid: z.string(),
    date: z.string(),
    name: z.string(),
    tags: z.array(z.unknown()),
    // `mat` is a token in the individual export, NULL in the aggregate.
    mat: z.string().nullable(),
    cid: z.string(),
    mid: z.string(),
    raw: ValueRecord,
    processed: ValueRecord,
  })
  .passthrough();

/** Individual: `processed` must NOT contain any `group*` key. */
export const EspertoRestrictedIndividualSchema =
  EspertoRestrictedBaseSchema.refine(
    (v) => !Object.keys(v.processed).some((k) => k.startsWith("group")),
    { message: "restricted-individual must not contain group* keys" },
  );

/** Aggregate: `processed` must contain ≥1 `group*` key. */
export const EspertoRestrictedAggregateSchema =
  EspertoRestrictedBaseSchema.refine(
    (v) => Object.keys(v.processed).some((k) => k.startsWith("group")),
    { message: "restricted-aggregate must contain ≥1 group* key" },
  );

// ────────────────────────────────────────────────────────────────────────
// parseEspertoExport
// ────────────────────────────────────────────────────────────────────────

/**
 * Classify + validate an unknown Esperto export JSON value into a typed,
 * discriminated `ParsedExport`. Throws `EspertoParseError` (with a typed
 * `reason` + zod `details`) on malformed or unrecognized input.
 */
export function parseEspertoExport(json: unknown): ParsedExport {
  // classify() throws EspertoParseError on an unrecognized/none-of-the-above
  // shape — let that propagate unchanged.
  const kind = classifyEspertoExport(json);

  switch (kind) {
    case "members": {
      const r = EspertoMembersSchema.safeParse(json);
      if (!r.success) {
        throw new EspertoParseError("members validation failed", {
          issues: r.error.issues,
        });
      }
      return { kind, data: r.data as unknown as EspertoMembers };
    }
    case "report": {
      const r = EspertoReportSchema.safeParse(json);
      if (!r.success) {
        throw new EspertoParseError("report validation failed", {
          issues: r.error.issues,
        });
      }
      return { kind, data: r.data as unknown as EspertoReport };
    }
    case "restricted-individual": {
      const r = EspertoRestrictedIndividualSchema.safeParse(json);
      if (!r.success) {
        throw new EspertoParseError("restricted-individual validation failed", {
          issues: r.error.issues,
        });
      }
      return { kind, data: r.data as unknown as EspertoRestricted };
    }
    case "restricted-aggregate": {
      const r = EspertoRestrictedAggregateSchema.safeParse(json);
      if (!r.success) {
        throw new EspertoParseError("restricted-aggregate validation failed", {
          issues: r.error.issues,
        });
      }
      return { kind, data: r.data as unknown as EspertoRestricted };
    }
  }
}
