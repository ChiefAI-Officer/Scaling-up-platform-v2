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
import { CopyUrlButton } from "@/components/ui/copy-url-button";
import {
  CampaignsListWithFilter,
  type CampaignListItem,
} from "@/components/assessments/CampaignsListWithFilter";
import { toCampaignListItems } from "@/lib/assessments/campaign-list-items";
import { resolvePublicLeadsState } from "@/lib/assessments/public-leads-state";

const APP_URL =
  process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";

/**
 * Spec 16 §4 — resolve the active PUBLIC campaign of the `scaling-up-quick`
 * template so the coach can copy a per-coach attributed share link
 * (`${APP_URL}/quiz/<alias>?coach=<coachEmail>`). Returns the campaign alias,
 * or null when no active PUBLIC quick-assessment campaign exists yet.
 */
async function resolvePublicQuickAlias(): Promise<string | null> {
  const campaign = await db.assessmentCampaign.findFirst({
    where: {
      // SEC-M6: never surface a soft-deleted campaign as the share target.
      deletedAt: null,
      accessMode: "PUBLIC",
      status: "ACTIVE",
      template: { alias: "scaling-up-quick" },
    },
    select: { alias: true },
    orderBy: { createdAt: "desc" },
  });
  return campaign?.alias ?? null;
}

export default async function CoachAssessmentsPage() {
  const { coach } = await requireCoach();
  const publicLeadsState = resolvePublicLeadsState(process.env, {
    coachId: coach.id,
  });

  // §4 — per-coach attributed share link for the public Quick Assessment.
  const publicQuickAlias = await resolvePublicQuickAlias();
  const referralKey = publicLeadsState.presentationEnabled
    ? await db.coachReferralKey.findFirst({
        where: { coachId: coach.id, revokedAt: null },
        select: { key: true },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const coachLink = publicQuickAlias
    ? publicLeadsState.presentationEnabled
      ? referralKey
        ? `${APP_URL}/quiz/${publicQuickAlias}?ref=${encodeURIComponent(referralKey.key)}`
        : null
      : coach.email
        ? `${APP_URL}/quiz/${publicQuickAlias}?coach=${encodeURIComponent(coach.email)}`
        : null
    : null;
  const publicLeadCount = publicLeadsState.presentationEnabled
    ? await db.assessmentSubmission.count({
        where: {
          referringCoachId: coach.id,
          publicLeadDeletedAt: null,
          respondentId: null,
        },
      })
    : 0;

  // Single round-trip: include participants (for respondentId → invitation join)
  // and invitations (for staged-progress metrics).
  const campaigns = await db.assessmentCampaign.findMany({
    // SEC-M6: soft-deleted campaigns are hidden from the coach's list.
    where: { createdByCoachId: coach.id, deletedAt: null },
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

  // Wave Z (Z-2) — shared mapper (identical to the admin oversight page).
  const items: CampaignListItem[] = toCampaignListItems(campaigns);

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

      {(coachLink || publicLeadsState.presentationEnabled) && (
        <FadeUp delay={0.05}>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">
                  Your Quick Assessment link
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Share this link to attribute new Quick Assessment leads to you.
                  Takers see their results on screen and by email; you receive the
                  {publicLeadsState.presentationEnabled
                    ? " contact notification."
                    : " full report."}
                </p>
                {coachLink ? (
                  <code
                    className="mt-2 block truncate text-xs text-muted-foreground"
                    data-testid="coach-quick-link"
                    title={coachLink}
                  >
                    {coachLink}
                  </code>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Your share link is being prepared.
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2 pt-1">
                {publicLeadsState.presentationEnabled && (
                  <Link
                    href="/portal/assessments/public-leads"
                    className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                  >
                    View Public leads ({publicLeadCount})
                  </Link>
                )}
                {coachLink && <CopyUrlButton url={coachLink} />}
              </div>
            </div>
          </div>
        </FadeUp>
      )}

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
