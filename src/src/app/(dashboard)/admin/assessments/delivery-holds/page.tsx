export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { AssessmentEmailDeliveryHolds } from "@/components/admin/AssessmentEmailDeliveryHolds";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";

export default async function AdminAssessmentEmailDeliveryHoldsPage() {
  const actor = await getApiActor();
  if (!actor) {
    redirect("/login");
  }
  if (!isPrivilegedRole(actor.role)) {
    redirect("/unauthorized");
  }

  return <AssessmentEmailDeliveryHolds />;
}
