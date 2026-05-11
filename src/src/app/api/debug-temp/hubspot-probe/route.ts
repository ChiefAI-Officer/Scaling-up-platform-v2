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
import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
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

  // Direct unwrapped call to surface raw error shape for diagnosis.
  // Will be deleted once root cause identified.
  let rawErr: Record<string, unknown> | null = null;
  try {
    const client = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });
    await client.crm.contacts.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            { propertyName: "email", operator: FilterOperatorEnum.Eq, value: email },
          ],
        },
      ],
      properties: ["email", "firstname", "lastname", "lifecyclestage", "lastmodifieddate"],
      limit: 1,
    });
  } catch (err: unknown) {
    const e = err as {
      code?: unknown;
      status?: unknown;
      name?: unknown;
      message?: unknown;
      body?: unknown;
    };
    rawErr = {
      typeofErr: typeof err,
      constructorName:
        err && typeof err === "object" ? err.constructor?.name ?? null : null,
      name: e?.name ?? null,
      message: typeof e?.message === "string" ? e.message : null,
      code: e?.code ?? null,
      status: e?.status ?? null,
      bodyType: typeof e?.body,
      bodyPreview:
        typeof e?.body === "string"
          ? e.body.slice(0, 500)
          : JSON.stringify(e?.body ?? null).slice(0, 500),
      keys: err && typeof err === "object" ? Object.keys(err) : [],
    };
  }

  return NextResponse.json({ tokenSet, result, rawErr });
}
