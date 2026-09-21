import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { MemberPortalHeader } from "@/components/members/MemberPortalHeader";
import { isMemberPortalEnabled } from "@/lib/members/flags";
import { resolveMemberIdentity } from "@/lib/members/identity";
import { listMemberEvaluations } from "@/lib/members/member-evaluations";
import { requireMemberSession } from "@/lib/members/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemberEvaluationsPage() {
  if (!isMemberPortalEnabled()) notFound();
  const session = await requireMemberSession();
  const normalizedEmail = session.normalizedEmail!;
  const identity = await resolveMemberIdentity(
    db as unknown as Parameters<typeof resolveMemberIdentity>[0],
    normalizedEmail,
  );
  const primary = identity.members[0];
  if (!primary) notFound();
  const profile = await db.orgRespondent.findUnique({
    where: { id: primary.respondentId },
    select: { firstName: true, lastName: true },
  });
  if (!profile) notFound();

  const evaluations = await listMemberEvaluations(
    db as unknown as Parameters<typeof listMemberEvaluations>[0],
    normalizedEmail,
    new Date(),
  );

  return (
    <>
      <MemberPortalHeader memberName={`${profile.firstName} ${profile.lastName}`.trim()} />
      <main className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="text-3xl font-bold">Your evaluations</h1>
        <p className="mt-2 text-slate-600">Assessments you&apos;ve been invited to complete.</p>

        {evaluations.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h2 className="text-2xl font-semibold">Nothing to complete right now</h2>
            <p className="mt-2 text-slate-600">
              When your coach invites you to an assessment, it&apos;ll appear here.
            </p>
          </section>
        ) : (
          <div className="mt-8 space-y-4">
            {evaluations.map((evaluation) => (
              <article
                key={evaluation.invitationId}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h2 className="text-xl font-semibold">{evaluation.assessmentName}</h2>
                  {evaluation.closeAt ? (
                    <p className="mt-1 text-sm text-slate-500">
                      Closes{" "}
                      <time dateTime={evaluation.closeAt.toISOString()}>
                        {evaluation.closeAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
                      </time>
                    </p>
                  ) : null}
                </div>
                <a
                  href={evaluation.href}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground"
                >
                  Continue
                </a>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
