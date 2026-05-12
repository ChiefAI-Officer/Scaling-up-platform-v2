/**
 * TEMPORARY DIAGNOSTIC — Wave 8-A HubSpot Proxy fix verification.
 *
 * Hardened per Codex round-2/round-3:
 * - ADMIN-only (no STAFF)
 * - Lookup by `?coachId=<cuid>` so real emails never appear in URL access logs
 * - Short-lived `?ack=wave8a` guard — refuse without it
 * - Optional `?isolation=1` compares the shared Proxy path against a fresh
 *   `new Client({ accessToken, httpAgent })` to isolate Proxy vs httpAgent
 *   as the failure variable
 * - Response is sanitized: no body, no message, no email
 * - Includes `deployedCommit` so verify steps can pin a specific Vercel build
 *
 * Lifetime: deleted in Wave 8-B once live verification passes.
 */

import https from "https";
import { NextRequest, NextResponse } from "next/server";
import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import { z } from "zod";
import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { lookupHubSpotContact } from "@/services/hubspot";

const querySchema = z.object({
  coachId: z.string().cuid(),
  ack: z.literal("wave8a"),
  isolation: z.enum(["0", "1"]).optional(),
});

type IsolationOutcome =
  | { kind: "skipped" }
  | { kind: "success"; httpAgentPresent: boolean }
  | { kind: "error"; status: number; category?: string };

export async function GET(request: NextRequest) {
  const actor = await getApiActor();
  if (!actor || actor.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { coachId, isolation } = parsed.data;

  const coach = await db.coach.findUnique({
    where: { id: coachId },
    select: { email: true },
  });
  if (!coach?.email) {
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });
  }

  const deployedCommit =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

  const shared = await lookupHubSpotContact(coach.email);
  const sharedSanitized =
    shared.kind === "error"
      ? { kind: shared.kind, status: shared.status, category: shared.category }
      : shared.kind === "found"
        ? { kind: shared.kind, id: shared.contact.id }
        : { kind: shared.kind };

  let isolationOutcome: IsolationOutcome = { kind: "skipped" };
  if (isolation === "1") {
    isolationOutcome = await runIsolationProbe(coach.email);
  }

  return NextResponse.json({
    deployedCommit,
    tokenSet: Boolean(process.env.HUBSPOT_ACCESS_TOKEN),
    shared: sharedSanitized,
    isolation: isolationOutcome,
  });
}

async function runIsolationProbe(email: string): Promise<IsolationOutcome> {
  const httpAgent = new https.Agent({ timeout: 15_000 });
  const client = new Client({
    accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
    httpAgent,
  });
  try {
    await client.crm.contacts.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            { propertyName: "email", operator: FilterOperatorEnum.Eq, value: email },
          ],
        },
      ],
      properties: ["email", "lifecyclestage", "lastmodifieddate"],
      limit: 1,
    });
    return { kind: "success", httpAgentPresent: true };
  } catch (error: unknown) {
    const e = error as {
      code?: number | string;
      status?: number;
      body?: { category?: string };
    };
    const status =
      typeof e?.code === "number"
        ? e.code
        : typeof e?.status === "number"
          ? e.status
          : 0;
    return { kind: "error", status, category: e?.body?.category };
  }
}
