/**
 * Wave Y — durable import-ACTIVITY signals (panel-only; NOT alerting).
 *
 * Wave V made the COMMIT-path outcome durable (`alert-signals.ts`,
 * `entityType:"assessment_import"`) and the every-10-minute cron alerts on it.
 * Two gaps remained: the PREVIEW path and route-level 4xx REFUSALS persisted
 * nothing — they only reached the HTTP response + a console marker. Wave Y
 * closes both with durable rows for the in-app observability panel.
 *
 * ISOLATION (spec 19y D5, Codex C2): these rows use their OWN entityType
 * `assessment_import_activity` so the Wave V alert cron — whose span query is
 * `where:{ entityType:"assessment_import" }`-scoped — can NEVER select them.
 * "Wave Y cannot affect Wave V alerting" is therefore a query-level fact, not
 * a `parseSignals`-filter accident. This module deliberately does NOT import
 * or modify `alert-signals.ts` (the cron/its writers stay literally untouched).
 *
 * DURABILITY (spec 19y D9, Codex C1): writes are UNCONDITIONAL + fail-soft —
 * NO flag read. `WAVE_V_IMPORT_ALERTING_ENABLED` gates the cron, never data
 * (Wave Q rule: flags gate capability, never persisted data), matching Wave V's
 * own commit-signal writes. The per-instrument import flag's step-1 404 already
 * suppresses any activity row when the import capability itself is off.
 *
 * PII CONTRACT (same as the markers + Wave V rows): rows carry ONLY
 * organizationId, templateAlias, counts, reason/error codes. NEVER raw
 * mid/reportid/cid/email/name.
 */

// ── Row constants ──────────────────────────────────────────────────────────

/** Panel-only signal rows written by the import routes (NOT the alert cron's entityType). */
export const ACTIVITY_ENTITY_TYPE = "assessment_import_activity";
export const PREVIEW_RESULT_ACTION = "preview_result";
export const REFUSED_ACTION = "refused";

/** Sentinel entityId for a pre-validation refusal — we never persist an untrusted requested org id. */
const UNKNOWN_ENTITY_ID = "unknown";

// ── Narrow DB shape (create-only) ────────────────────────────────────────────

export interface ActivitySignalDb {
  auditLog: {
    create: (args: {
      data: {
        entityType: string;
        entityId: string;
        action: string;
        performedBy: string;
        changes: string;
      };
    }) => Promise<unknown>;
  };
}

// ── Writer (self-contained; not the Wave V writer) ───────────────────────────

function serializeFields(fields: Record<string, unknown>): string {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    safe[key] = value;
  }
  return JSON.stringify(safe);
}

async function writeActivitySignal(
  db: ActivitySignalDb,
  action: string,
  entityId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        entityType: ACTIVITY_ENTITY_TYPE,
        entityId,
        action,
        performedBy: "SYSTEM",
        changes: serializeFields(fields),
      },
    });
  } catch {
    // Fail-soft — a signal-write failure must never break the import response.
  }
}

/**
 * Persist a preview-path degradation signal. The caller emits this ONLY when a
 * preview produced at least one block or one skip (spec 19y D3) — a clean
 * preview writes nothing, so authoring iteration never spams rows.
 */
export async function recordPreviewSignal(
  db: ActivitySignalDb,
  fields: {
    organizationId: string;
    templateAlias: string;
    blockReasons: string[];
    skipReasonCounts: Record<string, number>;
    filesInBatch: number;
    respondentsSkipped: number;
  },
): Promise<void> {
  await writeActivitySignal(db, PREVIEW_RESULT_ACTION, fields.organizationId, fields);
}

/**
 * Persist a route-level refusal signal (a pre-commit 4xx gate). `organizationId`
 * is OMITTED for the pre-validation `org-access` refusal (its requested org id is
 * untrusted input, Codex C4) → the row records `entityId:"unknown"`. Post-access
 * refusals pass the validated org id.
 */
export async function recordRefusalSignal(
  db: ActivitySignalDb,
  fields: {
    code: string;
    mode: "preview" | "commit";
    organizationId?: string;
    templateAlias?: string;
  },
): Promise<void> {
  await writeActivitySignal(
    db,
    REFUSED_ACTION,
    fields.organizationId ?? UNKNOWN_ENTITY_ID,
    fields,
  );
}
