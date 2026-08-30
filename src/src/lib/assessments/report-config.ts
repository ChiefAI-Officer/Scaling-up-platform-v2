export type ReportType = "scored" | "qualitative";

export interface PublicResultAction {
  label: string;
  href: string;
}

export interface DomainResultsPresentation {
  readonly eyebrow: string;
  readonly title: string;
  readonly showTierMessage: boolean;
}

export interface ReportConfig {
  /** Which renderer drives the per-respondent report. */
  reportType: ReportType;
  /** Whether the scored renderer shows the "All sections" score/average table. */
  showScoreTable: boolean;
  /** Whether the scored renderer lists every answered statement by section. */
  showDetailedBreakdown?: boolean;
  /** Whether the overall block shows total, average, and section-count facts. */
  showOverallMeta?: boolean;
  /**
   * Whether to show the tier band (ADR-0015).
   *
   * Honored by BOTH the GROUP report renderer (Wave J) AND the per-respondent
   * `BrandedReport`. When false, the tier band + tier message are suppressed
   * (the ScaleUp score ring/number and all other sections still render).
   * SU Full has no tier band: Esperto shows none and we can't compute its
   * percentile, so standing is expressed as peer-deviation.
   */
  showTier: boolean;
  /**
   * #81 — whether the scored per-respondent report shows the "Talk to your
   * Scaling Up Certified Coach" CTA (BrandedReport conclusion + the emailed
   * report). Optional; OMITTED means shown (back-compatible). Only
   * five-dysfunctions opts out (`false`). Read as `showCoachCta !== false`.
   */
  showCoachCta?: boolean;
  /**
   * Source-owned next steps for a PUBLIC lead result. These replace the generic
   * Learn More / coach links only when `RespondentReport.publicLeadActions` is
   * true; invited and operator renders retain their existing conclusion.
   */
  publicResultActions?: readonly PublicResultAction[];
  /** Optional template-owned labels and frozen tier-message policy for domain results. */
  readonly domainResults?: DomainResultsPresentation;
}

/** Default = current behaviour (back-compatible): scored report with the table and tier shown, coach CTA shown. */
export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  reportType: "scored",
  showScoreTable: true,
  showTier: true,
};

import { SCALING_UP_QUICK_PUBLIC_CAMPAIGN } from "@/lib/assessments/public-assessment-destinations";

/**
 * Per-template report behaviour, keyed by AssessmentTemplate.alias (stable across versions).
 * See ADR-0010. Report TYPE is a global presentation policy (intentionally retroactive);
 * report CONTENT stays version-pinned. Unknown alias -> DEFAULT.
 */
const REPORT_CONFIG: Readonly<Record<string, ReportConfig>> = {
  RockHabits: { reportType: "scored", showScoreTable: false, showTier: true }, // #24
  "qsp-v1": { reportType: "qualitative", showScoreTable: false, showTier: true }, // #28
  "qsp-v2": { reportType: "qualitative", showScoreTable: false, showTier: true }, // #27
  "leadership-vision-alignment": {
    reportType: "qualitative",
    showScoreTable: false,
    showTier: true,
  }, // #30/#31
  /**
   * SU Full: scored report with the tier band suppressed (ADR-0015) in BOTH the
   * group renderer and the per-respondent BrandedReport — Esperto shows no tier;
   * standing is peer-deviation. The ScaleUp score + score table still render.
   */
  "scaling-up-full": { reportType: "scored", showScoreTable: true, showTier: false },
  "sunhub-quick-quiz": {
    reportType: "scored",
    showScoreTable: false,
    showDetailedBreakdown: false,
    showOverallMeta: false,
    showTier: true,
    publicResultActions: [
      {
        label: "Take the 32-question assessment",
        href: SCALING_UP_QUICK_PUBLIC_CAMPAIGN.href,
      },
      {
        label: "Request a complimentary follow-up",
        href: "https://coaches.scalingup.com/coach-match-after-assessment-form",
      },
      {
        label: "Buy the books",
        href: "https://scalingup.com/book/",
      },
    ],
  },
  /**
   * Five Dysfunctions: scored (DEFAULT presentation) but WITHOUT the
   * "Talk to your Scaling Up Certified Coach" CTA (#81). All other scored
   * behaviour matches the default (table + tier shown).
   */
  "five-dysfunctions": {
    reportType: "scored",
    showScoreTable: true,
    showTier: true,
    showCoachCta: false,
    domainResults: {
      eyebrow: "How you scored, by area",
      title: "The Five Categories",
      showTierMessage: true,
    },
  },
};

/**
 * Wave U (spec 19u D14/U-6) — reserved test-walk namespace. Any alias with
 * the EXACT prefix `walk-qual-` resolves to a qualitative report config so
 * launch walks can exercise the qualitative render path E2E with a THROWAWAY
 * test template (real qualitative aliases are exact-mapped above; walking on
 * them would leak test content into latest-published). Each wave's walk
 * needs a FRESH alias (walk-qual-u, walk-qual-v, …) because soft-deleted
 * walk templates keep their alias claimed. Never use for real templates.
 */
const WALK_QUALITATIVE_PREFIX = "walk-qual-";
const WALK_QUALITATIVE_CONFIG: ReportConfig = {
  reportType: "qualitative",
  showScoreTable: false,
  showTier: false,
};

export function reportConfigFor(alias: string | null | undefined): ReportConfig {
  if (!alias) return DEFAULT_REPORT_CONFIG;
  if (alias.startsWith(WALK_QUALITATIVE_PREFIX)) return WALK_QUALITATIVE_CONFIG;
  return REPORT_CONFIG[alias] ?? DEFAULT_REPORT_CONFIG;
}

/**
 * Identifies a public result whose next-step presentation is owned by its
 * tracked source package. Every report surface uses this same decision so the
 * renderer and its outer style scope cannot disagree.
 */
export function hasSourcePublicResult(
  templateAlias: string | null | undefined,
  publicLeadActions: boolean | undefined,
): boolean {
  const actions = reportConfigFor(templateAlias).publicResultActions;
  return publicLeadActions === true && actions !== undefined && actions.length > 0;
}
