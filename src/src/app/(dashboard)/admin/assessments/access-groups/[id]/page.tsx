/**
 * Admin AccessGroup detail page (Wave 5 wireframe 22).
 *
 * Spec refs:
 *  - docs/wireframes-phase2/wave5/22-admin-access-group-detail.md
 *  - docs/specs/v7.6/02-service-layer-rules.md — evaluateAccessChange
 *
 * Server component shell; client component handles state + mutations.
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import Link from "next/link";
import { AccessGroupDetail } from "@/components/admin/AccessGroupDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminAccessGroupDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  const { id } = await params;

  return (
    <div className="space-y-6">
      <nav className="wf-breadcrumb" aria-label="Breadcrumb">
        <Link href="/admin/assessments">Assessments</Link>
        <span className="wf-breadcrumb-sep">›</span>
        <Link href="/admin/assessments/access-groups">Access Groups</Link>
        <span className="wf-breadcrumb-sep">›</span>
        <span>Detail</span>
      </nav>

      <AccessGroupDetail accessGroupId={id} />
    </div>
  );
}
