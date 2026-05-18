/**
 * Assessment v7.6 — Coach assessments landing page.
 * Lists campaigns the coach created. Top-right CTA → wizard.
 * Status filter pills (Task I) are handled in a client child component.
 */

import Link from "next/link";
import { ClipboardList, PlusCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { FadeUp } from "@/components/ui/animated";
import {
  CampaignsListWithFilter,
  type CampaignListItem,
} from "@/components/assessments/CampaignsListWithFilter";

export default async function CoachAssessmentsPage() {
  const { coach } = await requireCoach();

  const campaigns = await db.assessmentCampaign.findMany({
    where: { createdByCoachId: coach.id },
    include: {
      organization: { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const items: CampaignListItem[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    alias: c.alias,
    status: c.status,
    templateName: c.template.name,
    organizationName: c.organization.name,
    openAt: c.openAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Assessments</h1>
            <p className="text-muted-foreground">
              Run Rockefeller-style assessments for your organizations.
            </p>
          </div>
          <Link
            href="/portal/assessments/new"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <PlusCircle className="w-5 h-5" /> New Campaign
          </Link>
        </div>
      </FadeUp>

      <FadeUp delay={0.1}>
        {items.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No campaigns yet
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Click <span className="font-medium">+ New Campaign</span> to get
              started. You can pick a template, an organization, and the
              people who should participate.
            </p>
            <Link
              href="/portal/assessments/new"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
            >
              <PlusCircle className="w-5 h-5" /> New Campaign
            </Link>
          </div>
        ) : (
          <CampaignsListWithFilter campaigns={items} />
        )}
      </FadeUp>
    </div>
  );
}
