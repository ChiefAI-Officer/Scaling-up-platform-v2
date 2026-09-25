"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MemberReportListItem } from "@/lib/members/member-reports";
import { legacyMemberReportAccentClasses } from "@/components/members/member-report-accents";

export function MemberReportGrid({ reports }: { reports: MemberReportListItem[] }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? reports.filter((report) => report.reportName.toLowerCase().includes(needle)) : reports;
  }, [query, reports]);

  return (
    <>
      <label className="block max-w-xl">
        <span className="sr-only">Search reports</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search reports"
          className="w-full rounded-lg border border-slate-300 px-4 py-3"
        />
      </label>
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((report) => (
          <article key={`${report.kind}:${report.submissionId}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className={`${legacyMemberReportAccentClasses[report.accent]} min-h-28 p-5 text-xl font-bold text-white`}>
              {report.assessmentName}
            </div>
            <div className="space-y-2 p-5">
              <h2 className="text-lg font-semibold text-slate-900">{report.reportName}</h2>
              {report.kind === "group" ? (
                <p className="text-sm font-semibold text-[#522583]">Group report</p>
              ) : null}
              {report.personName ? <p className="text-sm text-slate-600">For {report.personName}</p> : null}
              {report.companyName ? <p className="text-sm text-slate-600">{report.companyName}</p> : null}
              <p className="text-sm text-slate-500">Completed {report.completedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
              <Link
                className="inline-flex rounded-lg bg-[#522583] px-4 py-2 font-semibold text-white"
                href={report.href}
              >
                View report
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
