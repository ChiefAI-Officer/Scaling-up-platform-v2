import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { MemberPortalHeader } from "@/components/members/MemberPortalHeader";
import { isMemberPortalEnabled } from "@/lib/members/flags";
import { resolveMemberIdentity } from "@/lib/members/identity";
import { memberGreeting } from "@/lib/members/greeting";
import { requireMemberSession } from "@/lib/members/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemberHomePage() {
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
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const greeting = memberGreeting({
    firstName: profile.firstName,
    lastName: profile.lastName,
    roleType: primary.roleType,
    hour: new Date().getHours(),
  });

  return (
    <>
      <MemberPortalHeader memberName={fullName} />
      <div className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="text-3xl font-bold">{greeting}</h1>
        <p className="mt-2 text-slate-600">Everything from your assessments, in one place.</p>
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold">Evaluations</h2>
            <p className="mt-2 text-slate-600">The assessments you&apos;ve been invited to complete. Your answers save as you go.</p>
            <Link href="/member/evaluations" className="mt-6 inline-flex rounded-full bg-[#522583] px-5 py-3 font-semibold text-white">Go to evaluations</Link>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold">Reports</h2>
            <p className="mt-2 text-slate-600">The results of the assessments you&apos;ve completed.</p>
            <Link href="/member/reports" className="mt-6 inline-flex rounded-full bg-[#522583] px-5 py-3 font-semibold text-white">Go to reports</Link>
          </section>
        </div>
      </div>
    </>
  );
}
