export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth, isPrivilegedRole } from "@/lib/auth/authorization";
import { CoachProfileForm } from "@/components/coach/coach-profile-form";
import { FadeUp } from "@/components/ui/animated";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCoachPage({ params }: Props) {
  const { id } = await params;
  const session = await requireAuth();
  if (!isPrivilegedRole(session.user.role)) redirect("/unauthorized");

  const coach = await db.coach.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });
  if (!coach) notFound();

  return (
    <FadeUp>
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit Coach</h1>
          <p className="text-muted-foreground text-sm">{coach.firstName} {coach.lastName}</p>
        </div>
        <Link
          href={`/coaches/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Coach
        </Link>
      </div>
      <CoachProfileForm
        coachId={coach.id}
        initialData={{
          firstName: coach.firstName,
          lastName: coach.lastName,
          email: coach.user?.email ?? "",
          bio: coach.bio ?? "",
          title: coach.title,
          titleCredentials: coach.company,
          profileImage: coach.profileImage,
          linkedinUrl: coach.linkedinUrl,
          showBookCallCta: coach.showBookCallCta,
          bookCallUrl: coach.bookCallUrl,
        }}
      />
    </div>
    </FadeUp>
  );
}
