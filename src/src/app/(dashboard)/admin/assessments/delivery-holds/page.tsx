export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { AssessmentEmailDeliveryHolds } from "@/components/admin/AssessmentEmailDeliveryHolds";
import { authOptions } from "@/lib/auth/auth";

export default async function AdminAssessmentEmailDeliveryHoldsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN" && role !== "STAFF") {
    redirect("/unauthorized");
  }

  return <AssessmentEmailDeliveryHolds />;
}
