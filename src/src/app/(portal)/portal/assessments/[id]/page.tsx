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
  canViewGroupReport,
} from "@/lib/assessments/access-control";
import {
  asCampaignDetailDb,
  getCampaignOverview,
  getCampaignRespondents,
} from "@/lib/assessments/campaign-detail";
import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import { waveDCustomHtmlEmailEnabled } from "@/lib/assessments/wave-d-feature-flags";
import {
  isGroupReportEnabled,
  isGroupReportAlias,
} from "@/lib/assessments/wave-f-flags";

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

  // Wave F #22 (T10) — gate the campaign-level "View group report" entry
  // point. The group report is a bulk-PII surface (claudex R3-M2), so the
  // entry point is shown ONLY when: the campaign is INVITED, the report is
  // enabled for this actor+campaign (flag/canary), AND the actor passes the
  // strict group-report currency check. Computed SERVER-side; the client
  // receives ONLY the boolean (never recomputes auth). The campaign metadata
  // needed for the flag (accessMode + ownership pointers) is loaded directly
  // since the overview loader does not carry them.
  const campaignForFlag = await db.assessmentCampaign.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      accessMode: true,
      createdByCoachId: true,
      organizationId: true,
      template: { select: { alias: true } },
      // Wave J (J-3): the SU-Full-scoped publish guard reads publishedAt so the
      // entry-point link is gated lock-step with the loader (never show a link
      // that would land on the loader's `notApplicable(unpublished)` panel).
      version: { select: { publishedAt: true } },
    },
  });
  const canShowGroupReport =
    campaignForFlag !== null &&
    campaignForFlag.accessMode === "INVITED" &&
    // Allowlisted surface — LVA (Jeff 2026-06-18) + SU-Full (Wave J J-3).
    isGroupReportAlias(campaignForFlag.template?.alias) &&
    // SU-Full-SCOPED publish guard, lock-step with the loader (R3-H1). A DRAFT
    // SU-Full version hides the link; LVA is NEVER gated on publishedAt.
    (campaignForFlag.template?.alias !== "scaling-up-full" ||
      campaignForFlag.version?.publishedAt != null) &&
    isGroupReportEnabled(actor, campaignForFlag) &&
    (await canViewGroupReport(asAccessDb(db), actor, id));

  return (
    <CampaignDetail
      initialOverview={overview}
      initialRespondents={respondents}
      customHtmlEmailEnabled={waveDCustomHtmlEmailEnabled()}
      canViewGroupReport={canShowGroupReport}
      groupReportHref={`/assessments/${id}/report`}
    />
  );
}
