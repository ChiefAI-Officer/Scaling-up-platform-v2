/**
 * Assessment v7.6 — Wave N — getRespondentLongitudinal()
 *
 * Per-respondent longitudinal comparison: tracks ONE person's results across
 * the campaigns they completed for the SAME scored assessment (Q1 vs Q2,
 * Year-1 vs Year-2). The single-person counterpart to the cohort trend
 * (`getLongitudinalTrend` in trends.ts), which aggregates a whole org.
 *
 * Spec refs:
 *  - docs/specs/v7.6/18n-wave-n-respondent-longitudinal-design.md (§3 matching,
 *    §4 loader, §7 security + the §10.5 grill-me hardening section).
 *  - docs/specs/v7.6/18mn-wave-mn-implementation-plan.md items 10–12, 15.
 *  - docs/adr/0016 — scored-only + same-version deltas.
 *
 * Hardening points implemented (plan §11/§12 + grill-me GM-1/GM-6):
 *  - R2-High-2  Dual authz: canAccessOrganization AND canAccessTemplate.
 *  - R2-High-1  Entry-respondent org-bind: load the path OrgRespondent by
 *               {id, organizationId, deletedAt:null}; mismatch ⇒ forbidden.
 *  - R2-Med-6 / GM-6  Match by normalizedEmail-within-org (live same-org rows
 *               only); fall back to the single respondentId when no email.
 *  - R1-High-3  One point per campaign: collapse multiple matched submissions
 *               in a single campaign to the latest by the tie-break order +
 *               flag degraded — never two points for one campaign.
 *  - R2-Med-2   Deterministic order: submittedAt asc, campaign.openAt asc,
 *               campaignId asc, submissionId asc. Drives delta + collapse.
 *  - R3-Med-3   Capacity bounds: cap matched rows / submissions / columns
 *               (default last 12 campaigns); set `bounded` when truncated.
 *  - ADR-0016   Reads frozen ScoreResult only — never re-scores; degrades on
 *               a malformed result. Deltas only vs the previous SAME-versionId
 *               submission; cross-version ⇒ deltaComparable:false, no number.
 *  - R1-Med-6   No raw emails in the returned data — only audit-safe counts.
 *
 * Design notes
 * ────────────
 *  - DB shape narrowed to the delegates this module reads (mirrors trends.ts +
 *    respondent-report.ts) so tests stub cleanly.
 *  - Reads `submission.result` (frozen ScoreResult) — NEVER recomputes.
 *  - The version-partition here is a NEW helper that PRESERVES all versions —
 *    it deliberately does NOT reuse the trends.ts partition (which hard-EXCLUDES
 *    non-latest versions). See `partitionPointsByVersion` below.
 */

import type { ApiActor } from "@/lib/auth/access-control";
import {
  canAccessOrganization,
  canAccessTemplate,
  asAccessDb,
} from "@/lib/assessments/access-control";
import { reportConfigFor } from "@/lib/assessments/report-config";
import type { ScoreResult } from "@/lib/assessments/scoring";

// ────────────────────────────────────────────────────────────────────────
// Capacity bounds (R3-Med-3). The email-union can fan out on a large or
// duplicated org, so every collection is bounded. Columns default to the most
// recent N campaigns; matched rows / submissions are hard caps that prevent an
// unbounded scan of frozen result JSON.
// ────────────────────────────────────────────────────────────────────────

export const DEFAULT_MAX_COLUMNS = 12;
export const MAX_MATCHED_RESPONDENTS = 50;
export const MAX_SUBMISSIONS = 200;

// ────────────────────────────────────────────────────────────────────────
// Public output types
// ────────────────────────────────────────────────────────────────────────

export interface RespondentLongitudinalRow {
  /** Section stableKey (perSection) or domain key (perDomain, SU-Full). */
  stableKey: string;
  /** Human-readable section / domain label. */
  name: string;
  /** The frozen averagePoints for this row in this submission. */
  value: number;
  /**
   * ▲/▼ delta vs the previous SAME-versionId submission's value for this row.
   * Present (a number, possibly 0) ONLY when `deltaComparable` is true.
   */
  delta?: number;
  /**
   * True when a previous same-versionId submission exists for this point AND
   * this row had a comparable value there. When false the row shows its value
   * with NO delta (cross-version "different version" badge in the UI).
   */
  deltaComparable: boolean;
}

export interface RespondentLongitudinalOverall {
  average: number;
  scaleUpScore?: number;
  tier?: string;
  /** ▲/▼ overall delta vs the previous same-versionId submission. */
  delta?: number;
  deltaComparable: boolean;
}

export interface RespondentLongitudinalPoint {
  campaignId: string;
  /** campaign.name when present, else a synthesized label (never an email). */
  campaignLabel: string;
  submittedAt: Date;
  versionId: string;
  versionNumber: number;
  overall: RespondentLongitudinalOverall;
  rows: RespondentLongitudinalRow[];
  /** True when this submission's frozen result was malformed (rows skipped). */
  degraded?: boolean;
}

export interface RespondentLongitudinalBounded {
  /** Number of columns actually rendered after truncation. */
  shown: number;
  /** Number of columns that existed before truncation. */
  total: number;
}

export interface RespondentLongitudinal {
  respondent: {
    id: string;
    name: string;
    jobTitle?: string;
  };
  companyName: string;
  assessment: {
    templateId: string;
    alias: string;
    name: string;
  };
  /** Audit-safe count of OrgRespondent rows unioned by email. NO emails. */
  matchedRespondentCount: number;
  /** Audit-safe count of submissions plotted (post-collapse, post-bound). */
  submissionCount: number;
  /** Chronological points, one per campaign, in the deterministic order. */
  points: RespondentLongitudinalPoint[];
  /**
   * Number of points that have a same-versionId chronological predecessor —
   * i.e. points whose overall delta is comparable. Drives the "need ≥2 to
   * compare" UI: comparableCount === 0 ⇒ render but show the compare note.
   */
  comparableCount: number;
  /** Set when the column / submission set was truncated by the bounds. */
  bounded?: RespondentLongitudinalBounded;
  /** True when the plotted points span more than one versionId. */
  hasMultipleVersions: boolean;
}

export type RespondentLongitudinalOutcome =
  | { kind: "forbidden" }
  | { kind: "notApplicable"; reason: "qualitative-template" }
  | { kind: "empty" }
  | { kind: "ok"; data: RespondentLongitudinal };

// ────────────────────────────────────────────────────────────────────────
// Narrow Prisma-shape DB interface — accepts the real Prisma client AND a
// transaction client. Only the delegates this module reads are listed; tests
// stub against this interface, never the full Prisma type. The access-control
// predicates take their own narrow DB (AccessControlDb) bridged via asAccessDb.
// ────────────────────────────────────────────────────────────────────────

export interface OrgRespondentRow {
  id: string;
  organizationId: string;
  normalizedEmail: string | null;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  deletedAt: Date | null;
}

export interface LongitudinalTemplateRow {
  id: string;
  name: string;
  alias: string;
}

export interface LongitudinalSubmissionRow {
  id: string;
  campaignId: string;
  respondentId: string | null;
  submittedAt: Date;
  result: unknown;
  campaign: {
    id: string;
    name: string | null;
    openAt: Date;
    versionId: string;
    deletedAt: Date | null;
    organization: { name: string } | null;
    version: { versionNumber: number } | null;
  };
}

export interface RespondentLongitudinalDb {
  orgRespondent: {
    findFirst: (args: {
      where: {
        id: string;
        organizationId: string;
        deletedAt?: Date | null;
      };
    }) => Promise<OrgRespondentRow | null>;
    findMany: (args: {
      where: {
        organizationId: string;
        normalizedEmail?: string;
        deletedAt?: Date | null;
      };
      take?: number;
    }) => Promise<OrgRespondentRow[]>;
  };
  assessmentTemplate: {
    findUnique: (args: {
      where: { id: string };
      select?: Record<string, unknown>;
    }) => Promise<LongitudinalTemplateRow | null>;
  };
  assessmentSubmission: {
    findMany: (args: {
      where: {
        respondentId: { in: string[] };
        submittedAt: { not: null };
        campaign: {
          templateId: string;
          deletedAt: Date | null;
        };
      };
      include?: Record<string, unknown>;
      take?: number;
    }) => Promise<LongitudinalSubmissionRow[]>;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * Frozen-result guard. A valid ScoreResult carries the perSection array (and
 * the overallAverage number). perDomain is optional (SU-Full only).
 */
function isScoreResult(value: unknown): value is ScoreResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.perSection) && typeof v.overallAverage === "number";
}

/**
 * Deterministic order (R2-Med-2): submittedAt asc, campaign.openAt asc,
 * campaignId asc, submissionId asc. Esperto backfills + duplicate rows can
 * share a submittedAt, so the tie-break is total. The SAME comparator drives
 * delta computation, the one-point-per-campaign collapse, and the final
 * column order.
 */
function compareSubmissions(
  a: LongitudinalSubmissionRow,
  b: LongitudinalSubmissionRow,
): number {
  const at = a.submittedAt.getTime();
  const bt = b.submittedAt.getTime();
  if (at !== bt) return at - bt;

  const ao = a.campaign.openAt.getTime();
  const bo = b.campaign.openAt.getTime();
  if (ao !== bo) return ao - bo;

  if (a.campaignId !== b.campaignId) {
    return a.campaignId < b.campaignId ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}

/**
 * One-point-per-campaign collapse (R1-High-3). The DB unique is per
 * (campaignId, respondentId), NOT per email-person — so an email-union across
 * two OrgRespondent rows that were both invited to the SAME campaign yields >1
 * matched submission for that campaign. We keep the LATEST per the deterministic
 * tie-break (i.e. the last element after sorting) and flag the surviving point
 * `degraded` so the UI can surface the ambiguity. Never plot two same-campaign
 * points.
 *
 * Returns the collapsed, sorted submission list plus the set of campaignIds
 * that had a collapse.
 */
function collapseOnePointPerCampaign(rows: LongitudinalSubmissionRow[]): {
  collapsed: LongitudinalSubmissionRow[];
  ambiguousCampaignIds: Set<string>;
} {
  const sorted = [...rows].sort(compareSubmissions);
  // Last-write-wins per campaign under the total order ⇒ the latest survives.
  const winnerByCampaign = new Map<string, LongitudinalSubmissionRow>();
  const countByCampaign = new Map<string, number>();
  for (const row of sorted) {
    countByCampaign.set(
      row.campaignId,
      (countByCampaign.get(row.campaignId) ?? 0) + 1,
    );
    winnerByCampaign.set(row.campaignId, row);
  }
  const ambiguousCampaignIds = new Set<string>();
  for (const [campaignId, count] of countByCampaign) {
    if (count > 1) ambiguousCampaignIds.add(campaignId);
  }
  const collapsed = [...winnerByCampaign.values()].sort(compareSubmissions);
  return { collapsed, ambiguousCampaignIds };
}

/**
 * Build the per-submission row list from a frozen ScoreResult. SU-Full uses
 * perDomain (label keyed by `key`/`label`); every other scored template uses
 * perSection. `deltaComparable`/`delta` are filled later by the version
 * partition — here they default to false/absent.
 */
interface RawRow {
  stableKey: string;
  name: string;
  value: number;
}

function projectRows(result: ScoreResult): RawRow[] {
  if (Array.isArray(result.perDomain) && result.perDomain.length > 0) {
    const out: RawRow[] = [];
    for (const d of result.perDomain) {
      // perDomain.averagePoints is null when no section in the domain has data
      // (Codex "no data" vs "scored 0"). Skip null rows — there is no value to
      // plot or delta.
      if (d.averagePoints === null || typeof d.averagePoints !== "number") {
        continue;
      }
      out.push({ stableKey: d.key, name: d.label, value: d.averagePoints });
    }
    return out;
  }
  return (result.perSection ?? []).map((s) => ({
    stableKey: s.stableKey,
    name: s.name,
    value: s.averagePoints,
  }));
}

/**
 * NEW version helper (R1-Med-3) — PRESERVES all versions.
 *
 * Contract (deliberately the OPPOSITE of trends.ts, which hard-EXCLUDES
 * non-latest versions): given the collapsed, chronologically-ordered points,
 * fill in `delta`/`deltaComparable` for the overall metric AND each row, where
 * the predecessor is the PREVIOUS submission SHARING THE SAME versionId in the
 * chronological order (NOT merely the immediately-previous chronological one).
 * A point with no same-versionId predecessor (the first of its version, or a
 * one-off version) is left non-comparable: value shown, no delta.
 *
 * Mutates the passed points in place and returns the count of points that
 * gained a comparable overall delta (drives `comparableCount`).
 */
export function partitionPointsByVersion(
  points: RespondentLongitudinalPoint[],
): number {
  // Track, per versionId, the previous point's overall average + per-row value
  // map so each new point compares against its own version lineage.
  const prevByVersion = new Map<
    string,
    { overallAverage: number; rowValues: Map<string, number> }
  >();

  let comparableCount = 0;

  for (const point of points) {
    // A degraded (malformed-result) point has no trustworthy values — exclude it
    // from delta computation AND from seeding the version baseline (ADR-0016:
    // "skip the bad column"). Otherwise it would fabricate its own delta against
    // the prior good point AND poison prevByVersion (seeding 0), corrupting the
    // NEXT same-version point's delta. It stays in the list (rendered + flagged)
    // but never participates in comparison.
    if (point.degraded) {
      point.overall.deltaComparable = false;
      for (const row of point.rows) {
        row.deltaComparable = false;
      }
      continue;
    }

    const prev = prevByVersion.get(point.versionId);

    // Build this point's row-value lookup for the NEXT same-version point.
    const rowValues = new Map<string, number>();
    for (const row of point.rows) {
      rowValues.set(row.stableKey, row.value);
    }

    if (prev) {
      // Overall delta vs the previous same-version point.
      point.overall.delta = round2(point.overall.average - prev.overallAverage);
      point.overall.deltaComparable = true;
      comparableCount += 1;

      // Per-row deltas, only where the previous version had this row.
      for (const row of point.rows) {
        const prevValue = prev.rowValues.get(row.stableKey);
        if (typeof prevValue === "number") {
          row.delta = round2(row.value - prevValue);
          row.deltaComparable = true;
        } else {
          row.deltaComparable = false;
        }
      }
    } else {
      // First submission on this version — value shown, no delta.
      point.overall.deltaComparable = false;
      for (const row of point.rows) {
        row.deltaComparable = false;
      }
    }

    prevByVersion.set(point.versionId, {
      overallAverage: point.overall.average,
      rowValues,
    });
  }

  return comparableCount;
}

/** Round to 2 dp to avoid float dust in deltas (values themselves are frozen). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fullName(first: string, last: string): string {
  return `${first ?? ""} ${last ?? ""}`.trim();
}

// ────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────

export async function getRespondentLongitudinal(
  db: RespondentLongitudinalDb,
  actor: ApiActor,
  organizationId: string,
  respondentId: string,
  templateId: string,
): Promise<RespondentLongitudinalOutcome> {
  // 1. Dual authz (R2-High-2) — org access AND template access. Either fail
  //    ⇒ forbidden (the route renders 404, anti-probing).
  const accessDb = asAccessDb(db);
  const [orgOk, templateOk] = await Promise.all([
    canAccessOrganization(accessDb, actor, organizationId),
    canAccessTemplate(accessDb, actor, templateId),
  ]);
  if (!orgOk || !templateOk) {
    return { kind: "forbidden" };
  }

  // 2. Entry-respondent org-bind (R2-High-1) — the path respondentId MUST be a
  //    live OrgRespondent in the authorized org. A stale / cross-org /
  //    soft-deleted id must never seed the identity union.
  const entry = await db.orgRespondent.findFirst({
    where: { id: respondentId, organizationId, deletedAt: null },
  });
  if (!entry) {
    return { kind: "forbidden" };
  }

  // 3. Scope gate (R1/ADR-0016) — scored templates only. Load the template;
  //    qualitative ⇒ notApplicable with NO further load (no audit-body leak).
  const template = await db.assessmentTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, name: true, alias: true },
  });
  if (!template) {
    // No such template under the authorized scope — treat as forbidden (the
    // route 404s) rather than throwing; this also covers a deleted template.
    return { kind: "forbidden" };
  }
  if (reportConfigFor(template.alias).reportType !== "scored") {
    return { kind: "notApplicable", reason: "qualitative-template" };
  }

  // 4. Match by normalizedEmail-within-org (R2-Med-6 / GM-6). Union all LIVE
  //    same-org OrgRespondent rows sharing the entry respondent's
  //    normalizedEmail. Fall back to just the entry id when there is no email.
  //    STRICTLY org-scoped + non-deleted (defense-in-depth filter on the rows).
  let matchedIds: string[];
  if (entry.normalizedEmail && entry.normalizedEmail.trim() !== "") {
    const sameEmailRows = await db.orgRespondent.findMany({
      where: {
        organizationId,
        normalizedEmail: entry.normalizedEmail,
        deletedAt: null,
      },
      take: MAX_MATCHED_RESPONDENTS,
    });
    const idSet = new Set<string>();
    // Always include the entry id even if the findMany stub omitted it.
    idSet.add(entry.id);
    for (const r of sameEmailRows) {
      // Defense-in-depth: re-assert org + live even if a stub didn't filter.
      if (r.organizationId === organizationId && r.deletedAt === null) {
        idSet.add(r.id);
      }
    }
    matchedIds = [...idSet];
  } else {
    matchedIds = [entry.id];
  }
  // Cap matched rows (R3-Med-3) deterministically.
  matchedIds.sort();
  const matchedRespondentCount = matchedIds.length;
  const cappedMatchedIds = matchedIds.slice(0, MAX_MATCHED_RESPONDENTS);

  // 5. Load submissions for the matched ids on THIS template, submitted, with a
  //    live campaign. Includes Esperto-imported (CLOSED, back-dated) rows —
  //    no status filter beyond the campaign live-guard (GM-1).
  const rawSubmissions = await db.assessmentSubmission.findMany({
    where: {
      respondentId: { in: cappedMatchedIds },
      submittedAt: { not: null },
      campaign: { templateId, deletedAt: null },
    },
    include: {
      campaign: {
        select: {
          id: true,
          name: true,
          openAt: true,
          versionId: true,
          deletedAt: true,
          organization: { select: { name: true } },
          version: { select: { versionNumber: true } },
        },
      },
    },
    take: MAX_SUBMISSIONS,
  });

  // Defense-in-depth: drop any public (null respondent) or non-live-campaign
  // rows a loose stub might return; drop submittedAt-null too.
  const liveSubmissions = rawSubmissions.filter(
    (s) =>
      s.respondentId !== null &&
      s.submittedAt !== null &&
      s.campaign &&
      s.campaign.deletedAt === null,
  );

  // 6/7. One-point-per-campaign collapse (R1-High-3) under the deterministic
  //      order (R2-Med-2). The latest per campaign survives; collapsed
  //      campaigns are flagged degraded below.
  const { collapsed, ambiguousCampaignIds } =
    collapseOnePointPerCampaign(liveSubmissions);

  if (collapsed.length === 0) {
    return { kind: "empty" };
  }

  // 6 (cont). Capacity bound on COLUMNS (R3-Med-3): default to the most recent
  //           N campaigns. `collapsed` is ascending; keep the LAST N, preserve
  //           ascending order.
  const totalColumns = collapsed.length;
  let bounded: RespondentLongitudinalBounded | undefined;
  let windowed = collapsed;
  if (totalColumns > DEFAULT_MAX_COLUMNS) {
    windowed = collapsed.slice(totalColumns - DEFAULT_MAX_COLUMNS);
    bounded = { shown: windowed.length, total: totalColumns };
  }

  // 8/9. Project each submission's frozen result (NEVER re-score). Malformed
  //      result ⇒ mark that point degraded + skip its rows, but keep the point.
  const points: RespondentLongitudinalPoint[] = windowed.map((s) => {
    const malformed = !isScoreResult(s.result);
    const collapseDegraded = ambiguousCampaignIds.has(s.campaignId);

    let rows: RawRow[] = [];
    const overall: RespondentLongitudinalOverall = {
      average: 0,
      deltaComparable: false,
    };

    if (!malformed) {
      const result = s.result as ScoreResult;
      rows = projectRows(result);
      overall.average = result.overallAverage;
      if (typeof result.scaleUpScore === "number") {
        overall.scaleUpScore = result.scaleUpScore;
      }
      if (result.tier && typeof result.tier.label === "string") {
        overall.tier = result.tier.label;
      }
    }

    const campaignLabel =
      s.campaign.name && s.campaign.name.trim() !== ""
        ? s.campaign.name
        : `Assessment ${s.campaign.openAt.toISOString().slice(0, 10)}`;

    return {
      campaignId: s.campaignId,
      campaignLabel,
      submittedAt: s.submittedAt,
      versionId: s.campaign.versionId,
      versionNumber: s.campaign.version?.versionNumber ?? 0,
      overall,
      rows: rows.map((r) => ({
        stableKey: r.stableKey,
        name: r.name,
        value: r.value,
        deltaComparable: false,
      })),
      ...(malformed || collapseDegraded ? { degraded: true } : {}),
    };
  });

  // 9 (cont). Preserve-all-versions partition: same-versionId deltas only.
  //           comparableCount = # points with a same-version predecessor.
  const comparableCount = partitionPointsByVersion(points);

  const versionIds = new Set(points.map((p) => p.versionId));

  const data: RespondentLongitudinal = {
    respondent: {
      id: entry.id,
      name: fullName(entry.firstName, entry.lastName),
      ...(entry.jobTitle ? { jobTitle: entry.jobTitle } : {}),
    },
    companyName:
      windowed.find((s) => s.campaign.organization?.name)?.campaign.organization
        ?.name ?? "",
    assessment: {
      templateId: template.id,
      alias: template.alias,
      name: template.name,
    },
    matchedRespondentCount,
    submissionCount: points.length,
    points,
    comparableCount,
    ...(bounded ? { bounded } : {}),
    hasMultipleVersions: versionIds.size > 1,
  };

  return { kind: "ok", data };
}

// ────────────────────────────────────────────────────────────────────────
// asRespondentLongitudinalDb — bridge the real Prisma client to the narrow
// type (the narrow interface is for test stubbing; app code passes a superset).
// ────────────────────────────────────────────────────────────────────────

export function asRespondentLongitudinalDb(
  prisma: unknown,
): RespondentLongitudinalDb {
  return prisma as RespondentLongitudinalDb;
}
