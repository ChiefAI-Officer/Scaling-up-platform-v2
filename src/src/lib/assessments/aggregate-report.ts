/**
 * Assessment Tool v7.6 — getAggregateReport().
 *
 * Spec refs:
 *  - docs/specs/v7.6/05-wireframes-wave5.md — Wireframe 23 deliverable shape.
 *    v1 MVP locked decision 8: per-template + per-version aggregate only,
 *    no time-range / group / per-org slicers. Those are deferred to v1.5.
 *  - docs/specs/v7.6/02-service-layer-rules.md — admin/staff bypass on
 *    CEO_ONLY (operator-mode). Coaches and respondents still respect
 *    aggregationMode; admin sees everything because they're already in
 *    operator-mode.
 *  - docs/specs/v7.6/06-observability.md — emits the
 *    `assessment.aggregate.query.duration_ms` signal (the alert gate at
 *    p95 > 2000ms).
 *
 * Design notes
 * ────────────
 *  - Aggregation runs in-memory in TypeScript: v1 scale is <100 submissions
 *    per template version, well below the threshold where a window function
 *    or materialized view becomes warranted.
 *  - Reads `submission.result` (frozen `ScoreResult`) — NEVER recomputes.
 *    Re-scoring on read would introduce drift if a template version's
 *    scoringConfig were ever mutated (it's immutable today, but the rule
 *    keeps this future-proof).
 *  - Per-section means + tier histogram are computed from the template
 *    version's `sections` JSON and `scoringConfig.tiers` so tiers with
 *    ZERO matched submissions still appear in the histogram (with count 0).
 *  - Submissions-over-time buckets by UTC YYYY-MM-DD. Display-zone
 *    conversion is a UI concern.
 */

import type { ScoreResult } from "./scoring";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export interface AggregateReport {
  templateId: string;
  versionId: string;
  totalSubmissions: number;
  distinctOrgs: number;
  avgCountAchieved: number;
  avgOverallTotal: number;
  avgOverallAverage: number;
  tierHistogram: Array<{ label: string; message: string; count: number }>;
  perSectionMeans: Array<{
    stableKey: string;
    name: string;
    totalPointsAvg: number;
    averagePointsAvg: number;
  }>;
  submissionsOverTime: Array<{ date: string; count: number }>;
}

// ────────────────────────────────────────────────────────────────────────
// Minimal Prisma-shape DB interface (matches the project convention used
// in evaluate-access-change.ts / transfer-ownership.ts).
// ────────────────────────────────────────────────────────────────────────

interface VersionRow {
  id: string;
  sections: unknown;
  scoringConfig: unknown;
}

interface SubmissionRow {
  submittedAt: Date;
  result: unknown;
  campaign: { organizationId: string };
}

export interface AggregateReportDb {
  assessmentTemplateVersion: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; sections: true; scoringConfig: true };
    }) => Promise<VersionRow | null>;
  };
  assessmentSubmission: {
    findMany: (args: {
      where: {
        campaign: { templateId: string; versionId: string };
      };
      select: {
        submittedAt: true;
        result: true;
        campaign: { select: { organizationId: true } };
      };
    }) => Promise<SubmissionRow[]>;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────

interface SectionDef {
  stableKey: string;
  name: string;
  sortOrder: number;
}

interface TierDef {
  label: string;
  message: string;
}

function safeSections(sections: unknown): SectionDef[] {
  if (!Array.isArray(sections)) return [];
  const out: SectionDef[] = [];
  for (const s of sections) {
    if (
      s &&
      typeof s === "object" &&
      typeof (s as { stableKey?: unknown }).stableKey === "string" &&
      typeof (s as { name?: unknown }).name === "string"
    ) {
      const row = s as { stableKey: string; name: string; sortOrder?: unknown };
      out.push({
        stableKey: row.stableKey,
        name: row.name,
        sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
      });
    }
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}

function safeTiers(scoringConfig: unknown): TierDef[] {
  if (!scoringConfig || typeof scoringConfig !== "object") return [];
  const tiers = (scoringConfig as { tiers?: unknown }).tiers;
  if (!Array.isArray(tiers)) return [];
  const out: TierDef[] = [];
  for (const t of tiers) {
    if (
      t &&
      typeof t === "object" &&
      typeof (t as { label?: unknown }).label === "string" &&
      typeof (t as { message?: unknown }).message === "string"
    ) {
      const row = t as { label: string; message: string };
      out.push({ label: row.label, message: row.message });
    }
  }
  return out;
}

function isScoreResult(value: unknown): value is ScoreResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.countAchieved === "number" &&
    typeof v.overallTotal === "number" &&
    typeof v.overallAverage === "number"
  );
}

function toIsoDate(d: Date): string {
  // YYYY-MM-DD UTC. `Date#toISOString()` returns `YYYY-MM-DDTHH:mm:ss.sssZ`.
  return d.toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────

export async function getAggregateReport(
  db: AggregateReportDb,
  templateId: string,
  versionId: string,
): Promise<AggregateReport> {
  const version = await db.assessmentTemplateVersion.findUnique({
    where: { id: versionId },
    select: { id: true, sections: true, scoringConfig: true },
  });

  const sectionDefs = version ? safeSections(version.sections) : [];
  const tierDefs = version ? safeTiers(version.scoringConfig) : [];

  const rows = await db.assessmentSubmission.findMany({
    where: {
      campaign: { templateId, versionId },
    },
    select: {
      submittedAt: true,
      result: true,
      campaign: { select: { organizationId: true } },
    },
  });

  const totalSubmissions = rows.length;

  // Empty-case shortcut: still emit the tier histogram and per-section
  // skeletons so the UI can render the layout structure with zeros.
  if (totalSubmissions === 0) {
    return {
      templateId,
      versionId,
      totalSubmissions: 0,
      distinctOrgs: 0,
      avgCountAchieved: 0,
      avgOverallTotal: 0,
      avgOverallAverage: 0,
      tierHistogram: tierDefs.map((t) => ({
        label: t.label,
        message: t.message,
        count: 0,
      })),
      perSectionMeans: sectionDefs.map((s) => ({
        stableKey: s.stableKey,
        name: s.name,
        totalPointsAvg: 0,
        averagePointsAvg: 0,
      })),
      submissionsOverTime: [],
    };
  }

  // ─── Aggregation pass ─────────────────────────────────────────────────
  const orgIds = new Set<string>();
  let sumCountAchieved = 0;
  let sumOverallTotal = 0;
  let sumOverallAverage = 0;

  const tierCounts = new Map<string, number>();
  for (const t of tierDefs) tierCounts.set(t.label, 0);

  const sectionAccumulators = new Map<
    string,
    { totalSum: number; avgSum: number; samples: number }
  >();
  for (const s of sectionDefs) {
    sectionAccumulators.set(s.stableKey, {
      totalSum: 0,
      avgSum: 0,
      samples: 0,
    });
  }

  const dateCounts = new Map<string, number>();

  for (const row of rows) {
    orgIds.add(row.campaign.organizationId);

    if (isScoreResult(row.result)) {
      const result = row.result;
      sumCountAchieved += result.countAchieved;
      sumOverallTotal += result.overallTotal;
      sumOverallAverage += result.overallAverage;

      // Tier histogram — match by label.
      const tierLabel = result.tier?.label;
      if (tierLabel && tierCounts.has(tierLabel)) {
        tierCounts.set(tierLabel, (tierCounts.get(tierLabel) ?? 0) + 1);
      }

      // Per-section means — accumulate only submissions that report a value
      // for the section. Sections absent from `result.perSection` (rare —
      // would mean the submission was scored against a different version)
      // are skipped from the average so the divisor stays honest.
      for (const ps of result.perSection ?? []) {
        const acc = sectionAccumulators.get(ps.stableKey);
        if (acc) {
          acc.totalSum += ps.totalPoints;
          acc.avgSum += ps.averagePoints;
          acc.samples += 1;
        }
      }
    }

    const dateKey = toIsoDate(row.submittedAt);
    dateCounts.set(dateKey, (dateCounts.get(dateKey) ?? 0) + 1);
  }

  const tierHistogram = tierDefs.map((t) => ({
    label: t.label,
    message: t.message,
    count: tierCounts.get(t.label) ?? 0,
  }));

  const perSectionMeans = sectionDefs.map((s) => {
    const acc = sectionAccumulators.get(s.stableKey);
    if (!acc || acc.samples === 0) {
      return {
        stableKey: s.stableKey,
        name: s.name,
        totalPointsAvg: 0,
        averagePointsAvg: 0,
      };
    }
    return {
      stableKey: s.stableKey,
      name: s.name,
      totalPointsAvg: acc.totalSum / acc.samples,
      averagePointsAvg: acc.avgSum / acc.samples,
    };
  });

  const submissionsOverTime = Array.from(dateCounts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    templateId,
    versionId,
    totalSubmissions,
    distinctOrgs: orgIds.size,
    avgCountAchieved: sumCountAchieved / totalSubmissions,
    avgOverallTotal: sumOverallTotal / totalSubmissions,
    avgOverallAverage: sumOverallAverage / totalSubmissions,
    tierHistogram,
    perSectionMeans,
    submissionsOverTime,
  };
}
