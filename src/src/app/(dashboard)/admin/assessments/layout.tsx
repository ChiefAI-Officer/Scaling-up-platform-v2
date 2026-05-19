/**
 * Assessments lane layout (wireframe 24).
 *
 * Renders the assessment-specific sidebar to the left of the page body for
 * every route under /admin/assessments/*. Mirrors the portal sidebar pattern
 * but uses the admin chrome's role gate (ADMIN + STAFF only; COACH bounces
 * to /unauthorized).
 *
 * Note: the coach-lane portal already has its own sidebar (`(portal)/layout.tsx`);
 * this layout is exclusively the admin-side surface.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { AssessmentsSidebar } from "@/components/nav/assessments-sidebar";

export default async function AdminAssessmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (!role || role === "COACH") {
    redirect("/unauthorized");
  }

  return (
    <div className="flex flex-col md:flex-row md:items-stretch md:min-h-[calc(100vh-4rem)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6">
      <AssessmentsSidebar session={session} />
      <div className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </div>
    </div>
  );
}
