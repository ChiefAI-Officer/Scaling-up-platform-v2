/**
 * Assessment v7.6 — Coach assessments landing page (Slice 5 Task 5.3).
 *
 * Lists campaigns the coach created, grouped by company (Organization).
 * Each campaign carries precomputed staged-progress metrics
 * (total / new / invited / started / completed) via computeCampaignStatusMetrics.
 *
 * Top-right CTA → wizard. Status filter pills are handled client-side.
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
import {
  computeCampaignStatusMetrics,
  type CampaignStatusMetricsInput,
} from "@/lib/assessments/campaign-status-metrics";

export default async function CoachAssessmentsPage() {
  const { coach } = await requireCoach();

  // Single round-trip: include participants (for respondentId → invitation join)
  // and invitations (for staged-progress metrics).
  const campaigns = await db.assessmentCampaign.findMany({
    where: { createdByCoachId: coach.id },
    include: {
      organization: { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
      participants: {
        select: { id: true, respondentId: true },
      },
      invitations: {
        select: {
          respondentId: true,
          status: true,
          sentAt: true,
          revokedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const items: CampaignListItem[] = campaigns.map((c) => {
    // Build a lookup from respondentId → invitation row (1-to-1 per campaign)
    const invByRespondentId = new Map(
      c.invitations.map((inv) => [inv.respondentId, inv])
    );

    // Build the metrics input: one row per participant.
    // AssessmentInvitationStatus enum values are a superset of the helper's
    // PENDING | SENT | VIEWED | SUBMITTED — cast is safe because those are
    // the only values the DB can hold for active (non-revoked) invitations.
    const metricsInput: CampaignStatusMetricsInput[] = c.participants.map((p) => {
      const inv = invByRespondentId.get(p.respondentId) ?? null;
      return {
        participantId: p.id,
        invitation: inv
          ? {
              status: inv.status as "PENDING" | "SENT" | "VIEWED" | "SUBMITTED",
              sentAt: inv.sentAt,
              revokedAt: inv.revokedAt,
            }
          : null,
      };
    });

    const metrics = computeCampaignStatusMetrics(metricsInput);

    return {
      id: c.id,
      name: c.name,
      alias: c.alias,
      status: c.status,
      templateName: c.template.name,
      organizationId: c.organization.id,
      organizationName: c.organization.name,
      openAt: c.openAt.toISOString(),
      metrics,
    };
  });

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
            <Link
              href="/portal/assessments/new"
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              + New Campaign
            </Link>
          </div>
        ) : (
          <CampaignsListWithFilter campaigns={items} />
        )}
      </FadeUp>
    </div>
  );
}
