/**
 * Assessment v7.6 — GET /api/assessment-campaigns/[id]/respondents (Task F).
 *
 * Returns the campaign overview (stats + header info) AND the full
 * respondent table in a single round-trip so the page renders without
 * a waterfall.
 *
 * Auth:
 *   - 401 if not authenticated.
 *   - 404 if canManageCampaign(actor, id, "read") === false.
 *     (We return 404 — not 403 — so a coach probing other coaches'
 *     campaign IDs can't distinguish "not yours" from "doesn't exist".)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import {
  asCampaignDetailDb,
  getCampaignOverview,
  getCampaignRespondents,
} from "@/lib/assessments/campaign-detail";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      id,
      "read"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const detailDb = asCampaignDetailDb(db);
    const [overview, respondents] = await Promise.all([
      getCampaignOverview(detailDb, id),
      getCampaignRespondents(detailDb, id),
    ]);

    return NextResponse.json({
      success: true,
      data: { overview, respondents },
    });
  } catch (error) {
    console.error("Error fetching campaign respondents:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch campaign respondents" },
      { status: 500 }
    );
  }
}
