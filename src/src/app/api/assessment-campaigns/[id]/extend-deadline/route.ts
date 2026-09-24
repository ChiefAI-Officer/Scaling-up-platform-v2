import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { asAccessDb, canManageCampaign } from "@/lib/assessments/access-control";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { timezonePickerEnabled } from "@/lib/time/wave-timezone-flags";
import {
  DeadlineExtensionError,
  extendCampaignDeadline,
  prepareCampaignDeadlineNotificationRetry,
  previewCampaignDeadlineExtension,
} from "@/lib/assessments/extend-campaign-deadline";
import { inngest } from "@/inngest/client";
import { ASSESSMENT_DEADLINE_EXTENDED_EVENT } from "@/inngest/functions/assessment-deadline-extended-notifications";

const ExtendSchema = z.object({
  closeAt: z.string().datetime({ offset: true }),
  notifyAffected: z.boolean().optional().default(false),
});

function errorResponse(error: unknown) {
  if (!(error instanceof DeadlineExtensionError)) return null;
  const messages = {
    CAMPAIGN_NOT_FOUND: "Campaign not found",
    CAMPAIGN_CLOSED: "Closed campaigns cannot be reopened from this control",
    NO_CURRENT_DEADLINE: "Open-ended campaigns do not have a deadline to extend",
    MUST_EXTEND: "The new close date must be later than the current close date",
    MUST_BE_FUTURE: "The new close date must be in the future",
  } as const;
  const status = error.code === "CAMPAIGN_NOT_FOUND" ? 404 : 409;
  return NextResponse.json({ success: false, error: messages[error.code] }, { status });
}

async function authorize(id: string, mode: "read" | "write") {
  const actor = await getApiActor();
  if (!actor) return { response: NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 }) };
  const allowed = await canManageCampaign(asAccessDb(db), actor, id, mode);
  if (!allowed) return { response: NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 }) };
  return { actor };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!timezonePickerEnabled()) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const { id } = await params;
  const auth = await authorize(id, "read");
  if ("response" in auth) return auth.response;
  try {
    const preview = await previewCampaignDeadlineExtension(db, id);
    return NextResponse.json({ success: true, data: preview });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!timezonePickerEnabled()) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const rateLimit = await withRateLimit(request, RateLimits.standard);
  if (!rateLimit.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429, headers: rateLimit.headers });
  }
  const { id } = await params;
  const auth = await authorize(id, "write");
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = ExtendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues }, { status: 400 });
  }

  try {
    const requestedCloseAt = new Date(parsed.data.closeAt);
    let result;
    try {
      result = await extendCampaignDeadline(db, {
        campaignId: id,
        newCloseAt: requestedCloseAt,
        performedBy: auth.actor.email,
      });
    } catch (extensionError) {
      if (
        parsed.data.notifyAffected &&
        extensionError instanceof DeadlineExtensionError &&
        extensionError.code === "MUST_EXTEND"
      ) {
        result = await prepareCampaignDeadlineNotificationRetry(db, {
          campaignId: id,
          closeAt: requestedCloseAt,
        });
      } else {
        throw extensionError;
      }
    }
    let notificationQueued = 0;
    let notificationFailures = 0;
    if (parsed.data.notifyAffected && result.notificationRecipients.length > 0) {
      try {
        await inngest.send({
          id: `deadline-extension-${result.campaignId}-${result.closeAt.getTime()}`,
          name: ASSESSMENT_DEADLINE_EXTENDED_EVENT,
          data: {
            campaignId: result.campaignId,
            closeAt: result.closeAt.toISOString(),
            invitationIds: result.notificationRecipients.map(({ id }) => id),
          },
        });
        notificationQueued = result.notificationRecipients.length;
      } catch (dispatchError) {
        console.error("Failed to queue deadline-extension notifications:", dispatchError);
        notificationFailures = result.notificationRecipients.length;
        return NextResponse.json({
          success: false,
          error: "The deadline was saved, but notices could not be queued. Click Extend deadline again to retry safely.",
          data: {
            closeAt: result.closeAt,
            timezone: result.timezone,
            affectedCount: result.affected.length,
            notified: 0,
            notificationQueued: 0,
            notificationFailures,
          },
        }, { status: 503 });
      }
    }
    return NextResponse.json({
      success: true,
      data: {
        closeAt: result.closeAt,
        timezone: result.timezone,
        affectedCount: result.affected.length,
        notified: 0,
        notificationQueued,
        notificationFailures,
      },
    });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    console.error("Error extending campaign deadline:", error);
    return NextResponse.json({ success: false, error: "Failed to extend campaign deadline" }, { status: 500 });
  }
}
