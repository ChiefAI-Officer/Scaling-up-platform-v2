/**
 * Esperto historical import — pure export-kind detector.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4, classify.ts.
 *
 * Detection rules (in order):
 *   - ARRAY whose items have `memberid` + `email` + `level`        → "members"
 *   - OBJECT with `personal` array whose items have
 *       `variant` / `campaignid`                                    → "report"
 *   - OBJECT with `mid` + `raw` + `processed`, and `processed`
 *       has ≥1 key starting with "group"                            → "restricted-aggregate"
 *   - OBJECT with `mid` + `raw` + `processed` (no "group*" key)      → "restricted-individual"
 *   - else throw EspertoParseError("unrecognized export shape")
 *
 * This layer does NO validation beyond what's needed to discriminate — full
 * zod validation against the matched schema is parse.ts's job. It does ZERO
 * DB work and is fully unit-testable against fixtures.
 */

// ────────────────────────────────────────────────────────────────────────
// Typed error (shared with parse.ts — parse.ts re-exports it)
// ────────────────────────────────────────────────────────────────────────

export type EspertoParseReason =
  | "unrecognized export shape"
  | "not an object or array"
  | "members validation failed"
  | "report validation failed"
  | "restricted-individual validation failed"
  | "restricted-aggregate validation failed";

/**
 * Thrown on malformed / unrecognized Esperto export input.
 *
 * Mirrors the assessment service-layer error convention
 * (`(code/reason, details, message?)` + `Object.setPrototypeOf` for
 * cross-compile `instanceof`).
 */
export class EspertoParseError extends Error {
  constructor(
    public readonly reason: EspertoParseReason,
    public readonly details: Record<string, unknown> = {},
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "EspertoParseError";
    Object.setPrototypeOf(this, EspertoParseError.prototype);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Small structural helpers (no zod — just shape probes for discrimination)
// ────────────────────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** True when `obj` has every one of `keys` as an own property. */
function hasAll(obj: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((k) => hasOwn(obj, k));
}

/** True when the `processed` block carries ≥1 key starting with "group". */
function hasGroupKey(processed: Record<string, unknown>): boolean {
  return Object.keys(processed).some((k) => k.startsWith("group"));
}

// ────────────────────────────────────────────────────────────────────────
// classifyEspertoExport
// ────────────────────────────────────────────────────────────────────────

import type { EspertoExportKind } from "./types";

/**
 * Pure detector — returns the export kind, or throws EspertoParseError on an
 * input that matches none of the known shapes.
 */
export function classifyEspertoExport(json: unknown): EspertoExportKind {
  // ── Members: a non-empty array whose items look like member rows ──────
  if (Array.isArray(json)) {
    const first = json[0];
    if (
      json.length > 0 &&
      isPlainObject(first) &&
      hasAll(first, ["memberid", "email", "level"])
    ) {
      return "members";
    }
    throw new EspertoParseError("unrecognized export shape", {
      hint: "array did not look like a members export",
      length: json.length,
    });
  }

  if (!isPlainObject(json)) {
    throw new EspertoParseError("not an object or array", {
      receivedType: json === null ? "null" : typeof json,
    });
  }

  // ── Report: { personal: [...] } whose rows carry variant + campaignid ─
  if (Array.isArray(json.personal)) {
    const first = json.personal[0];
    if (isPlainObject(first) && hasAll(first, ["variant", "campaignid"])) {
      return "report";
    }
    throw new EspertoParseError("unrecognized export shape", {
      hint: "personal[] rows missing variant/campaignid",
    });
  }

  // ── Restricted: mid + raw + processed; group* keys split the sub-kind ──
  if (
    hasAll(json, ["mid", "raw", "processed"]) &&
    isPlainObject(json.processed)
  ) {
    return hasGroupKey(json.processed)
      ? "restricted-aggregate"
      : "restricted-individual";
  }

  throw new EspertoParseError("unrecognized export shape", {
    topLevelKeys: Object.keys(json).slice(0, 20),
  });
}
