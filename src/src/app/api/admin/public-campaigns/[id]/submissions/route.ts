/**
 * Admin Public Campaigns — Submissions (#83).
 *
 * GET /api/admin/public-campaigns/[id]/submissions
 *   Lists the self-enrolled submissions for a PUBLIC campaign so admins can see
 *   WHO completed it and via WHICH coach. Public-quiz submissions persist a
 *   `publicTaker` JSON blob ({firstName,lastName,email}) + `referringCoachEmail`
 *   (indexed) — this route is the read surface for that data.
 *
 *   Admin/STAFF-only. Coaches are forbidden (they use their own campaign views).
 *
 * Error codes:
 *   401 — unauthenticated
 *   403 — not admin/STAFF
 *   404 — campaign not found (live-only)
 *   400 NOT_PUBLIC — campaign is not a PUBLIC campaign
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { summarizePublicResult } from "@/lib/assessments/public-referrals";
import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";

/** Shape of the persisted publicTaker JSON (subset we render). */
interface PublicTaker {
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface AdminSubmissionRow {
  id: string;
  submittedAt: Date;
  publicTaker: unknown;
  referringCoachEmail: string | null;
  result?: unknown;
  campaign?: {
    template: { id: string; name: string; alias: string };
  };
  referringCoach?: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: admin or staff required" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Live-only load; a soft-deleted campaign must not be readable.
    const campaign = await db.assessmentCampaign.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, accessMode: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }
    if (campaign.accessMode !== "PUBLIC") {
      return NextResponse.json(
        { success: false, error: "NOT_PUBLIC" },
        { status: 400 }
      );
    }

    const referredResultsEnabled = isReferredResultsEnabled();
    const submissions = (await db.assessmentSubmission.findMany({
      where: { campaignId: id },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        submittedAt: true,
        publicTaker: true,
        referringCoachEmail: true,
        ...(referredResultsEnabled
          ? {
              result: true,
              campaign: {
                select: {
                  template: {
                    select: { id: true, name: true, alias: true },
                  },
                },
              },
              referringCoach: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            }
          : {}),
      },
    })) as unknown as AdminSubmissionRow[];

    const data = submissions.map((s) => {
      const t = (s.publicTaker ?? {}) as unknown as PublicTaker;
      const name = `${(t.firstName ?? "").trim()} ${(t.lastName ?? "").trim()}`.trim();
      const email = (t.email ?? "").trim();
      const legacyRow = {
        id: s.id,
        // Coach-facing surfaces show the email when the name is blank (Wave P
        // policy); "Anonymous" only when the taker gave neither.
        takerName: name || email || "Anonymous",
        takerEmail: email || null,
        referringCoachEmail: s.referringCoachEmail ?? null,
        submittedAt: s.submittedAt,
      };

      if (
        !referredResultsEnabled ||
        s.result === undefined ||
        !s.campaign
      ) {
        return legacyRow;
      }

      const coach = s.referringCoach
        ? {
            name:
              `${s.referringCoach.firstName.trim()} ${s.referringCoach.lastName.trim()}`.trim() ||
              s.referringCoach.email,
            email: s.referringCoach.email,
          }
        : null;

      return {
        ...legacyRow,
        referringCoach: coach,
        template: s.campaign.template,
        summary: summarizePublicResult(s.campaign.template.alias, s.result),
        reportHref: `/assessments/public-submissions/${encodeURIComponent(s.id)}/report`,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error loading public-campaign submissions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load submissions" },
      { status: 500 }
    );
  }
}
