"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type {
  MemberReportGroup,
} from "@/lib/members/member-reports";
import { groupedMemberReportAccentClasses } from "@/components/members/member-report-accents";

function regionId(campaignId: string): string {
  return `member-report-campaign-${campaignId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function formattedDate(date: Date): string {
  return date.toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function MemberReportGroups({ groups }: { groups: MemberReportGroup[] }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groups.length === 1 ? [groups[0].campaignId] : []),
  );
  const needle = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!needle) return groups;
    return groups.flatMap((group) => {
      const groupMatches = [group.campaignName, group.assessmentName].some(
        (value) => value.toLowerCase().includes(needle),
      );
      const reports = groupMatches
        ? group.reports
        : group.reports.filter((report) =>
            report.personName?.toLowerCase().includes(needle),
          );
      return reports.length > 0 ? [{ ...group, reports }] : [];
    });
  }, [groups, needle]);
  const visibleReportCount = visibleGroups.reduce(
    (total, group) => total + group.reports.length,
    0,
  );

  return (
    <>
      <label className="block max-w-xl">
        <span className="sr-only">Search reports</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search reports"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#522583]"
        />
      </label>
      <p className="mt-4 text-sm text-slate-600 sm:text-base" aria-live="polite">
        {visibleReportCount} {visibleReportCount === 1 ? "report" : "reports"} in{" "}
        {visibleGroups.length} {visibleGroups.length === 1 ? "campaign" : "campaigns"}
      </p>
      <div className="mt-6 space-y-4">
        {visibleGroups.map((group) => {
          const isExpanded = needle.length > 0 || expanded.has(group.campaignId);
          const contentId = regionId(group.campaignId);
          const hasGroupReport = group.reports.some(
            (report) => report.kind === "group",
          );
          return (
            <section
              key={group.campaignId}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={contentId}
                onClick={() => {
                  if (needle) return;
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(group.campaignId)) next.delete(group.campaignId);
                    else next.add(group.campaignId);
                    return next;
                  });
                }}
                className="flex min-h-11 w-full items-start gap-3 px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#522583] focus-visible:ring-inset sm:items-center sm:gap-4 sm:px-5"
              >
                <ChevronRight
                  aria-hidden="true"
                  className={`mt-1 size-5 shrink-0 text-slate-600 transition-transform sm:mt-0 ${isExpanded ? "rotate-90" : ""}`}
                />
                <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
                  <span
                    className={`${groupedMemberReportAccentClasses[group.accent]} inline-block max-w-full truncate rounded-full px-3 py-1 text-sm font-semibold text-white sm:max-w-52 sm:shrink-0`}
                  >
                    {group.assessmentName}
                  </span>
                  <span className="mt-2 block min-w-0 flex-1 sm:mt-0">
                    <span className="block text-base font-semibold text-slate-950 sm:truncate sm:text-lg">
                      {group.campaignName}
                    </span>
                    <span className="block text-sm text-slate-600">
                      {group.reports.length}{" "}
                      {group.reports.length === 1 ? "report" : "reports"}
                      {hasGroupReport ? " · includes group report" : ""}
                    </span>
                    {group.companyName ? (
                      <span className="block text-sm text-slate-500">
                        {group.companyName}
                      </span>
                    ) : null}
                    <span className="block text-sm text-slate-500 sm:hidden">
                      {formattedDate(group.completedAt)}
                    </span>
                  </span>
                </span>
                <span className="hidden shrink-0 text-sm text-slate-500 sm:block sm:text-base">
                  {formattedDate(group.completedAt)}
                </span>
              </button>

              {isExpanded ? (
                <div id={contentId} className="border-t border-slate-200">
                  {group.reports.map((report) => (
                    <div
                      key={`${report.kind}:${report.submissionId}`}
                      className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-4 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p
                          className={`font-medium ${report.kind === "group" ? "text-[#522583]" : "text-slate-900"}`}
                        >
                          {report.kind === "group"
                            ? "Group report"
                            : report.personName ?? "Your report"}
                        </p>
                        {report.kind === "group" ? (
                          <p className="text-sm text-slate-600">
                            Everyone who completed this campaign
                          </p>
                        ) : null}
                        <p className="text-sm text-slate-500 sm:hidden">
                          {formattedDate(report.completedAt)}
                        </p>
                      </div>
                      <p className="hidden shrink-0 text-sm text-slate-500 sm:block">
                        {formattedDate(report.completedAt)}
                      </p>
                      <Link
                        className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-[#522583] px-3 py-2 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#522583] focus-visible:ring-offset-2 sm:px-4"
                        href={report.href}
                      >
                        View report
                      </Link>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
