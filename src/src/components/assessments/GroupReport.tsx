/**
 * Assessment v7.6 Wave F #22 — GroupReport dispatcher + shared chrome (T7).
 *
 * The team-level (group) report siblings of the per-respondent BrandedReport /
 * QualitativeReport. Pure presentational: they consume the frozen
 * `CampaignGroupReport` model (built + authorized upstream by the loader/route)
 * plus a small set of PROVENANCE props (assessment + company display name,
 * generation time, completed/invited counts, version label, CEO name) and
 * render the approved Esperto-style "CEO Full Report" anatomy from the sign-off
 * mockup at repo root (wave-f-group-report-mockup.html):
 *
 *   cover ("Group Report" badge) → "as of" provenance line → per-archetype body
 *   → Wave-E footer.
 *
 * This file owns:
 *   - the PROVENANCE props contract (GroupReportProvenance) the route wires,
 *   - the dispatcher (reportType → QualitativeGroupReport | ScoredGroupReport),
 *   - the shared chrome helpers the two archetype renderers reuse: the branded
 *     cover, the "as of" line, the empty-state panel, the no-CEO degrade note,
 *     and the footer.
 *
 * Brand scope (ADR-0005): the root is wrapped in `.su-public-brand .su-report`,
 * so every group class added to su-report.css is fully scoped — zero global
 * token leak. React auto-escapes all text — respondent answers/labels are never
 * injected as raw HTML.
 */

import type { CampaignGroupReport } from "@/lib/assessments/group-report-model";
import { QualitativeGroupReport } from "@/components/assessments/QualitativeGroupReport";
import { ScoredGroupReport } from "@/components/assessments/ScoredGroupReport";
import { CoachLogo } from "@/components/assessments/CoachLogo";

const LOGO_SRC = "/brand/su-logo-white.svg";

// ── Provenance / display props (wired by the T8 route) ───────────────────────

export interface GroupReportProvenance {
  /** Display name of the assessment (e.g. "Leadership Vision Alignment"). */
  assessmentName: string;
  /** The campaign's company (e.g. "Acme Corp"). */
  companyName: string;
  /** When this report snapshot was generated. */
  generatedAt: Date;
  /** Completed-submission count (the cohort size). */
  completedCount: number;
  /** Invited-participant count (the denominator on the "as of" line). */
  invitedCount: number;
  /** Pinned template version label (e.g. "lva-v2") — shown on the "as of" line. */
  versionLabel?: string | null;
  /** Designated CEO's display name, when one is designated. */
  ceoName?: string | null;
  /**
   * Wave L — the template alias (e.g. "leadership-vision-alignment"). Drives the
   * LVA-only verbatim section intros + the 0–10 scaled-rating legend in the
   * qualitative renderer. Absent/other alias → no LVA-specific display.
   */
  templateAlias?: string | null;
  /**
   * Wave K — the creator coach's logo URL (Coach.profileImage), shown on the
   * group report cover + footer-left. Null/absent → SU-logo-only fallback.
   */
  coachLogoUrl?: string | null;
  /** Wave K — the coach's display name, used as the logo `<img alt>`. */
  coachName?: string | null;
}

export interface GroupReportProps extends GroupReportProvenance {
  report: CampaignGroupReport;
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function formatGroupDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return String(d);
  }
}

function formatGroupDateTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return String(d);
  }
}

/** Format a numeric figure: integers bare, else one-decimal-rounded. */
export function formatGroupNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 10) / 10).toString();
}

/** Whether the cohort contains a designated CEO who submitted (drives G2). */
export function cohortHasCeo(report: CampaignGroupReport): boolean {
  return report.respondents.some((r) => r.isCEO);
}

// ── Shared chrome ────────────────────────────────────────────────────────────

export function GroupReportCover({
  assessmentName,
  companyName,
  generatedAt,
  coachLogoUrl,
  coachName,
}: Pick<
  GroupReportProvenance,
  "assessmentName" | "companyName" | "generatedAt" | "coachLogoUrl" | "coachName"
>) {
  return (
    <section className="su-report-cover" data-testid="group-report-cover">
      <div className="su-stripe-h" />
      <div className="su-report-cover-inner">
        <div className="su-brandbar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="su-logo"
            src={LOGO_SRC}
            alt="Scaling Up"
            width={180}
            height={24}
          />
          {/* Wave K: coach logo (Coach.profileImage); renders nothing when absent. */}
          <CoachLogo url={coachLogoUrl} name={coachName} variant="cover" />
        </div>
        <span className="su-group-kind">Group Report</span>
        <h1 className="su-h1 su-report-title">Your {assessmentName} Report</h1>
        <div className="su-report-cover-meta">
          <div className="su-report-for">
            For {companyName} · Leadership Team
          </div>
          <div className="su-report-sub">{formatGroupDate(generatedAt)}</div>
        </div>
      </div>
    </section>
  );
}

export function GroupReportAsOf({
  generatedAt,
  completedCount,
  invitedCount,
  versionLabel,
  ceoName,
}: Pick<
  GroupReportProvenance,
  "generatedAt" | "completedCount" | "invitedCount" | "versionLabel" | "ceoName"
>) {
  return (
    <div className="su-group-asof" data-testid="group-report-asof">
      <span>
        As of <b>{formatGroupDateTime(generatedAt)}</b>
      </span>
      <span>
        <b>
          {completedCount} of {invitedCount}
        </b>{" "}
        invited completed
      </span>
      {versionLabel ? (
        <span>
          Version <b>{versionLabel}</b>
        </span>
      ) : null}
      {ceoName ? (
        <span>
          CEO: <b>{ceoName}</b>
        </span>
      ) : null}
    </div>
  );
}

/** The G2 graceful-degrade callout shown when no CEO has submitted. */
export function GroupReportNoCeoNote({ ceoName }: { ceoName?: string | null }) {
  return (
    <div className="su-group-note" data-testid="group-report-no-ceo-note">
      <b>CEO — not yet submitted.</b>{" "}
      {ceoName ? (
        <>
          The designated CEO ({ceoName}) has not completed this assessment, so
          the report shows the team aggregate without a CEO column.
        </>
      ) : (
        <>
          No CEO is designated for this campaign. Designate a CEO to see the
          CEO-vs-team alignment view; the report below shows the team aggregate
          in the meantime.
        </>
      )}
    </div>
  );
}

/** The empty panel shown when the cohort has zero completed submissions. */
export function GroupReportEmpty() {
  return (
    <div className="su-group-empty" data-testid="group-report-empty">
      <p className="su-group-empty-title">No completed submissions yet</p>
      <p className="su-group-empty-sub">
        Once team members complete this assessment, their answers will be
        aggregated into this group report.
      </p>
    </div>
  );
}

export function GroupReportFooter({
  generatedAt,
  coachLogoUrl,
  coachName,
}: {
  generatedAt: Date;
  coachLogoUrl?: string | null;
  coachName?: string | null;
}) {
  return (
    <footer className="su-report-footer" data-testid="group-report-footer">
      {/* Wave K: coach logo (left); renders nothing when absent. */}
      <CoachLogo url={coachLogoUrl} name={coachName} variant="footer" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="su-logo"
        src={LOGO_SRC}
        alt="Scaling Up"
        width={120}
        height={22}
      />
      <span className="su-report-submitted-date">
        {formatGroupDate(generatedAt)}
      </span>
      <span className="su-report-confidential">
        Generated by Scaling Up Platform
      </span>
    </footer>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export function GroupReport(props: GroupReportProps) {
  if (props.report.reportType === "qualitative") {
    return <QualitativeGroupReport {...props} />;
  }
  return <ScoredGroupReport {...props} />;
}

export default GroupReport;
