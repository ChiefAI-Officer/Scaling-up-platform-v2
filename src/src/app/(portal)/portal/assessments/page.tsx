/**
 * Assessment v7.6 — Coach assessments landing page.
 * Lists campaigns the coach created. Top-right CTA → wizard.
 * Status filter pills (Task I) are handled in a client child component.
 */

import Link from "next/link";
import { PlusCircle } from "lucide-react";
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
          <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Your admin hasn&apos;t given you access to any published templates yet.
              If you&apos;ve been added to an Access Group with at least one published template,
              click <strong>+ New Campaign</strong> to start.
            </p>
            <a
              href="/portal/assessments/new"
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              + New Campaign
            </a>
          </div>
        ) : (
          <CampaignsListWithFilter campaigns={items} />
        )}
      </FadeUp>
    </div>
  );
}
