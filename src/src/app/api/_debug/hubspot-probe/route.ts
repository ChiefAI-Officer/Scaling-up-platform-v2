/**
 * TEMPORARY DIAGNOSTIC — Wave 7-C HubSpot side card triage.
 *
 * Admin+staff only. Returns the discriminated lookup result + raw error
 * details (status, category, message hint) so we can diagnose why every
 * lookup is returning the error state. To be deleted once the issue is
 * identified.
 *
 * Query: ?email=<coach email>
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { lookupHubSpotContact } from "@/services/hubspot";

export async function GET(request: NextRequest) {
  const actor = await getApiActor();
  if (!actor || !isPrivilegedRole(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing ?email=" }, { status: 400 });
  }
  const tokenSet = Boolean(process.env.HUBSPOT_ACCESS_TOKEN);
  const result = await lookupHubSpotContact(email);
  return NextResponse.json({
    tokenSet,
    result,
  });
}
