/**
 * Esperto historical import — Phase 2 RESULTS plan builder (PURE — no DB, no React).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §6 (results import)
 * + §7 (crosswalk lock gate); plan 12a step 8, edges 11–16, ADR-0006.
 *
 * `buildResultsImportPlan` turns a parsed Esperto Report export + a LOCKED
 * crosswalk + the target org's resolved roster into a deterministic
 * reconstructed-campaign / skip / block plan. It performs ZERO DB work and
 * touches no React — the route resolves `respondents` upstream, and the COMMIT
 * layer (Slice 7b) does the actual scoring (`scoreSubmission` with
 * `allowMissingRequired:true`), version pinning, and Prisma writes. This file
 * only assembles the answer payload + chain shape so every branch is unit-
 * testable against the sanitized fixtures.
 *
 * REFUSAL / SAFETY contract:
 *   - crosswalk NOT locked (§7)            → whole-plan BLOCK, no campaigns.
 *   - unknown answer key (exhaustiveness)  → whole-plan BLOCK, no campaigns.
 *   - duplicate (campaignid, memberid)     → whole-plan BLOCK, no campaigns.
 *   - duplicate reportid                   → whole-plan BLOCK, no campaigns.
 *   - row memberid not in roster           → SKIP that row (never anonymize).
 *   - row with zero scorable sliders       → SKIP that row (never a neutral
 *                                             submission — it would skew the
 *                                             aggregate; greptile/R2).
 *
 * Answer construction mirrors the live submit route exactly (§6.3): a single
 * `{ stableKey, value }[]` array for every question type — value is a number for
 * SLIDER_LIKERT/NUMBER and a string for TEXT. A slider/number of `0`, `""`,
 * null, or missing is OMITTED (the QSP slider min is 1, so 0 is "unanswered" —
 * never coerce to a real 0); an empty/missing TEXT is omitted.
 */

import type { Crosswalk } from "./crosswalks";
import { validateCrosswalkExhaustive } from "./crosswalks";
import type { EspertoReport, EspertoReportRow } from "./types";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

/** One reconstructed answer — mirrors the live submit route's `{stableKey, value}`. */
export interface ResultsAnswer {
  stableKey: string;
  /** number for SLIDER_LIKERT/NUMBER, string for TEXT, string[] of option keys for MULTI_CHOICE (Wave X D7). */
  value: number | string | string[];
}

/** One reconstructed submission row (one resolved respondent within a campaign). */
export interface ResultsRow {
  /** Resolved roster respondent id (externalId === memberid). */
  respondentId: string;
  /** Esperto memberid — kept so commit can re-resolve identity in-tx. */
  memberid: string;
  /** Esperto row `date` (ISO-8601 w/ offset) → submission `submittedAt`. */
  submittedAt: string;
  answers: ResultsAnswer[];
}

/** One reconstructed Imported campaign (one per distinct Esperto campaignid). */
export interface ResultsCampaign {
  /** Esperto's `campaignid`. */
  espertoCampaignId: string;
  /** Namespaced campaign externalId — `esperto:<campaignid>` (ADR-0006). */
  externalId: string;
  /** Operator-editable default name. */
  name: string;
  /** Earliest row date in the group → campaign `openAt`. */
  openAt: string;
  /** Latest row date in the group → campaign `closeAt`. */
  closeAt: string;
  rows: ResultsRow[];
}

/** A row skipped (not imported) with a machine-readable reason. */
export interface ResultsSkip {
  memberid: string;
  campaignid: string;
  reason: "unresolved-member" | "zero-scorable";
}

/** A blocking error. A non-empty `blocks` array makes the whole plan invalid. */
export interface ResultsBlock {
  reason:
    | "crosswalk-not-locked"
    | "unknown-answer-key"
    | "duplicate-member"
    | "duplicate-reportid"
    | "answer-value-anomaly";
  detail?: string;
}

export interface BuildResultsImportPlanInput {
  parsedReport: EspertoReport;
  crosswalk: Crosswalk;
  targetOrgId: string;
  /** The target org's resolved roster (id + externalId). */
  respondents: { id: string; externalId: string | null }[];
}

export interface ResultsImportPlan {
  campaigns: ResultsCampaign[];
  skips: ResultsSkip[];
  blocks: ResultsBlock[];
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

const RAW_PREFIX = "raw_";

/** The `raw_`-stripped answer keys present on a row (e.g. `raw_Q3_1` → `Q3_1`). */
function answerKeysOf(row: EspertoReportRow): string[] {
  return Object.keys(row)
    .filter((k) => k.startsWith(RAW_PREFIX))
    .map((k) => k.slice(RAW_PREFIX.length));
}

/** Read a row's verbatim answer value for an Esperto key (`raw_<key>`). */
function rawValueOf(row: EspertoReportRow, espertoKey: string): unknown {
  return (row as Record<string, unknown>)[RAW_PREFIX + espertoKey];
}

// ────────────────────────────────────────────────────────────────────────
// buildResultsImportPlan
// ────────────────────────────────────────────────────────────────────────

export function buildResultsImportPlan(
  input: BuildResultsImportPlanInput,
): ResultsImportPlan {
  const { parsedReport, crosswalk, respondents } = input;

  const plan: ResultsImportPlan = { campaigns: [], skips: [], blocks: [] };

  // ── 1. Locked gate (§7). Results import is refused until the crosswalk is
  //    locked — emit a single whole-plan block, no campaigns, no skips. ──────
  if (crosswalk.locked !== true) {
    plan.blocks.push({
      reason: "crosswalk-not-locked",
      detail: crosswalk.templateAlias,
    });
    return plan;
  }

  const rows = parsedReport.personal;

  // ── 2. Exhaustiveness (§7). Aggregate every row's `raw_`-stripped answer
  //    keys; any key not in `map` ∪ `droppedKeys` is a hard error. ───────────
  const unknownKeys = new Set<string>();
  for (const row of rows) {
    const { unknownKeys: u } = validateCrosswalkExhaustive(
      crosswalk,
      answerKeysOf(row),
    );
    for (const k of u) unknownKeys.add(k);
  }
  for (const key of unknownKeys) {
    plan.blocks.push({
      reason: "unknown-answer-key",
      detail: key,
    });
  }

  // ── 3. Duplicate detection: (campaignid, memberid) across rows, or a
  //    duplicate reportid → block. ────────────────────────────────────────
  const seenMemberKeys = new Set<string>();
  const seenReportIds = new Set<string>();
  for (const row of rows) {
    const memberKey = `${row.campaignid}\u0000${row.memberid}`;
    if (seenMemberKeys.has(memberKey)) {
      plan.blocks.push({
        reason: "duplicate-member",
        detail: `${row.campaignid}/${row.memberid}`,
      });
    } else {
      seenMemberKeys.add(memberKey);
    }
    if (seenReportIds.has(row.reportid)) {
      plan.blocks.push({
        reason: "duplicate-reportid",
        detail: row.reportid,
      });
    } else {
      seenReportIds.add(row.reportid);
    }
  }

  // A non-empty `blocks` invalidates the whole plan — emit no campaigns/skips.
  if (plan.blocks.length > 0) {
    return plan;
  }

  // ── 4. Roster lookup: externalId → respondent id. ────────────────────────
  const respByExternalId = new Map<string, string>();
  for (const r of respondents) {
    if (r.externalId) respByExternalId.set(r.externalId, r.id);
  }

  // Quick lookup of a mapped key's expected ourType.
  const ourTypeByKey = new Map(crosswalk.map.map((e) => [e.espertoKey, e.ourType]));

  // ── 5. Group rows by campaignid; reconstruct one campaign each. ──────────
  // Preserve first-seen campaignid order for determinism.
  const order: string[] = [];
  const byCampaign = new Map<string, EspertoReportRow[]>();
  for (const row of rows) {
    let bucket = byCampaign.get(row.campaignid);
    if (!bucket) {
      bucket = [];
      byCampaign.set(row.campaignid, bucket);
      order.push(row.campaignid);
    }
    bucket.push(row);
  }

  for (const campaignid of order) {
    const groupRows = byCampaign.get(campaignid)!;

    // openAt/closeAt = MIN/MAX of the group's row dates (ISO-8601 sorts
    // lexicographically for same-offset timestamps; commit normalizes to UTC).
    const dates = groupRows.map((r) => r.date);
    const openAt = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
    const closeAt = dates.reduce((max, d) => (d > max ? d : max), dates[0]);

    const campaign: ResultsCampaign = {
      espertoCampaignId: campaignid,
      externalId: `esperto:${campaignid}`,
      name: `${crosswalk.templateAlias} — imported — ${campaignid}`,
      openAt,
      closeAt,
      rows: [],
    };

    for (const row of groupRows) {
      // 5a. Resolve respondent. None → skip (never anonymize).
      const respondentId = respByExternalId.get(row.memberid);
      if (!respondentId) {
        plan.skips.push({
          memberid: row.memberid,
          campaignid,
          reason: "unresolved-member",
        });
        continue;
      }

      // 5b. Build {stableKey, value} answers, per ourType.
      const answers: ResultsAnswer[] = [];
      let scorable = false;
      for (const entry of crosswalk.map) {
        const ourType = ourTypeByKey.get(entry.espertoKey)!;
        const raw = rawValueOf(row, entry.espertoKey);
        // A legitimately-unanswered key: absent, null, or an empty/whitespace
        // string. These are OMITTED silently (genuinely no answer). Anything
        // ELSE that we can't map to its type is a present-but-unusable value —
        // we BLOCK it (never silently drop a real historical answer; Codex).
        const isBlank =
          raw === null ||
          raw === undefined ||
          (typeof raw === "string" && raw.trim() === "");

        if (ourType === "SLIDER_LIKERT" || ourType === "NUMBER") {
          // Finite number > 0 only. 0 → OMIT (slider min is 1; 0 is Esperto's
          // unanswered sentinel — never coerce it into a real answer).
          if (typeof raw === "number" && Number.isFinite(raw)) {
            if (raw > 0) {
              answers.push({ stableKey: entry.stableKey, value: raw });
              if (ourType === "SLIDER_LIKERT") scorable = true;
            } else if (raw < 0) {
              plan.blocks.push({
                reason: "answer-value-anomaly",
                detail: `${entry.espertoKey} (${entry.stableKey}): negative ${ourType} value ${raw}`,
              });
            }
            // raw === 0 → omit (unanswered).
          } else if (!isBlank) {
            // present but not a number (e.g. an unexpected string) → flag, don't drop.
            plan.blocks.push({
              reason: "answer-value-anomaly",
              detail: `${entry.espertoKey} (${entry.stableKey}): expected a ${ourType} number, got ${typeof raw}`,
            });
          }
        } else if (ourType === "TEXT") {
          if (typeof raw === "string" && raw.trim() !== "") {
            answers.push({ stableKey: entry.stableKey, value: raw });
          } else if (!isBlank) {
            // present but not a string (e.g. a number/object) → flag, don't drop.
            plan.blocks.push({
              reason: "answer-value-anomaly",
              detail: `${entry.espertoKey} (${entry.stableKey}): expected TEXT string, got ${typeof raw}`,
            });
          }
        }
        // MULTI_CHOICE: no QSP key uses it; deferred to a future template's
        // crosswalk (would assemble string[]; out of scope for this slice).
      }

      // 5c. Zero scorable sliders → skip (no neutral submission — it would
      //     skew the aggregate; greptile/R2).
      if (!scorable) {
        plan.skips.push({
          memberid: row.memberid,
          campaignid,
          reason: "zero-scorable",
        });
        continue;
      }

      campaign.rows.push({
        respondentId,
        memberid: row.memberid,
        submittedAt: row.date,
        answers,
      });
    }

    plan.campaigns.push(campaign);
  }

  return plan;
}
