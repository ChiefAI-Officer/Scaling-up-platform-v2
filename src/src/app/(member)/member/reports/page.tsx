import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { MemberPortalHeader } from "@/components/members/MemberPortalHeader";
import { MemberReportGrid } from "@/components/members/MemberReportGrid";
import { MemberReportGroups } from "@/components/members/MemberReportGroups";
import {
  isMemberPortalEnabled,
  isMemberReportGroupingEnabled,
} from "@/lib/members/flags";
import { listMemberReports } from "@/lib/members/member-reports";
import { resolveMemberIdentity } from "@/lib/members/identity";
import { requireMemberSession } from "@/lib/members/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemberReportsPage() {
  if (!isMemberPortalEnabled()) notFound();
  const session = await requireMemberSession();
  const identity = await resolveMemberIdentity(
    db as unknown as Parameters<typeof resolveMemberIdentity>[0],
    session.normalizedEmail!,
  );
  const primary = identity.members[0];
  if (!primary) notFound();
  const profile = await db.orgRespondent.findUnique({
    where: { id: primary.respondentId },
    select: { firstName: true, lastName: true },
  });
  if (!profile) notFound();
  const model = await listMemberReports(
    db as unknown as Parameters<typeof listMemberReports>[0],
    session.normalizedEmail!,
  );

  return (
    <>
      <MemberPortalHeader memberName={`${profile.firstName} ${profile.lastName}`.trim()} />
      <div className="mx-auto max-w-6xl px-5 py-12">
        <h1 className="text-3xl font-bold">Your reports</h1>
        <p className="mt-2 mb-6 text-slate-600">An overview of the reports available to you.</p>
        {model.reports.length > 0 ? (
          isMemberReportGroupingEnabled() ? (
            <MemberReportGroups groups={model.groups} />
          ) : (
            <MemberReportGrid reports={model.reports} />
          )
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h2 className="text-2xl font-semibold">No reports yet</h2>
            <p className="mt-2 text-slate-600">When you complete an assessment, your report will appear here.</p>
            {model.hasOpenEvaluations ? <Link href="/member/evaluations" className="mt-4 inline-block font-semibold text-[#522583]">Go to Evaluations</Link> : null}
          </section>
        )}
      </div>
    </>
  );
}
