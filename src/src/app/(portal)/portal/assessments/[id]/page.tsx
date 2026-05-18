/**
 * Assessment v7.6 — Coach campaign detail page (Task F).
 *
 * Server component. Resolves auth, gates access via canManageCampaign,
 * fetches the initial overview + respondents via the service helpers,
 * then hands off to the client component. Wave 1 placeholder removed.
 */

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { normalizeRole } from "@/lib/auth/access-control";
import type { ApiActor } from "@/lib/auth/access-control";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import {
  asCampaignDetailDb,
  getCampaignOverview,
  getCampaignRespondents,
} from "@/lib/assessments/campaign-detail";
import { CampaignDetail } from "@/components/assessments/CampaignDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { coach, session } = await requireCoach();
  const { id } = await params;

  const actor: ApiActor = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: normalizeRole(session.user.role ?? "COACH"),
    coachId: coach.id,
  };

  const allowed = await canManageCampaign(
    asAccessDb(db),
    actor,
    id,
    "read"
  );
  if (!allowed) {
    redirect("/portal/assessments");
  }

  const detailDb = asCampaignDetailDb(db);
  const [overview, respondents] = await Promise.all([
    getCampaignOverview(detailDb, id),
    getCampaignRespondents(detailDb, id),
  ]);

  return (
    <CampaignDetail
      initialOverview={overview}
      initialRespondents={respondents}
    />
  );
}
