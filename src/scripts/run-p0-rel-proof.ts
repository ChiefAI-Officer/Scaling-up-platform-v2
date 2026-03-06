/**
 * P0-REL-01 Real-record integration proof runner
 *
 * Validates real-record flows for:
 * - Circle coach sync mapping
 * - HubSpot registration sync
 * - Stripe paid registration + webhook-driven state update
 * - Inngest workflow execution
 *
 * Usage:
 *   npx tsx scripts/run-p0-rel-proof.ts
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

type ProofStatus = "PASS" | "FAIL" | "SKIPPED";

interface ProofResult {
  integration: "Circle" | "HubSpot" | "Stripe" | "Inngest";
  status: ProofStatus;
  summary: string;
  evidence: Record<string, unknown>;
  actions?: string[];
}

const db = new PrismaClient();

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function getExport<T>(mod: unknown, key: string): T {
  const record = asRecord(mod);
  const direct = record?.[key];
  if (direct) {
    return direct as T;
  }

  const defaultRecord = asRecord(record?.default);
  const fallback = defaultRecord?.[key];
  if (fallback) {
    return fallback as T;
  }

  throw new Error(`Missing export '${key}'`);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function checkCircleAuth(
  apiKey: string
): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> | null }> {
  const response = await fetch("https://app.circle.so/api/v1/me", {
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  const unauthorizedPayload =
    payload?.status === "unauthorized" ||
    payload?.message === "Your account could not be authenticated.";

  return {
    ok: response.ok && !unauthorizedPayload,
    status: response.status,
    payload,
  };
}

async function runCircleProof(): Promise<ProofResult> {
  const apiKey = getEnv("CIRCLE_API_KEY");
  if (!apiKey) {
    return {
      integration: "Circle",
      status: "SKIPPED",
      summary: "CIRCLE_API_KEY is not configured.",
      evidence: {},
    };
  }

  try {
    const authCheck = await checkCircleAuth(apiKey);
    if (!authCheck.ok) {
      return {
        integration: "Circle",
        status: "FAIL",
        summary: "Circle API authentication failed; cannot run coach sync proof.",
        evidence: {
          status: authCheck.status,
          payload: authCheck.payload,
        },
        actions: [
          "Replace CIRCLE_API_KEY with a valid server-side token from Circle admin settings.",
          "Re-run `npm run validate:apis` and `npm run validate:p0-rel-proof` after rotating the key.",
        ],
      };
    }

    const circleModule = await import("../src/services/circle");
    const syncModule = await import("../src/services/circle-sync");
    const getCircleProfileByEmail = getExport<
      (email: string, options?: { allowFallback?: boolean }) => Promise<Record<string, unknown> | null>
    >(circleModule, "getCircleProfileByEmail");
    const syncCoachFromCircle = getExport<
      (coachId: string, options?: { forceOverwrite?: boolean }) => Promise<{
        success: boolean;
        updated: boolean;
        fieldsUpdated: string[];
        error?: string;
      }>
    >(syncModule, "syncCoachFromCircle");

    const coaches = await db.coach.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    let bestCandidate:
      | {
          coachId: string;
          email: string;
          profile: Record<string, unknown>;
          score: number;
        }
      | undefined;
    let unauthorizedDetected = false;
    const candidateSnapshots: Array<Record<string, unknown>> = [];

    for (const coach of coaches) {
      try {
        const profile = await getCircleProfileByEmail(coach.email);
        if (!profile) {
          continue;
        }

        const profileRecord = profile as Record<string, unknown>;
        const score =
          (profileRecord.memberId ? 1 : 0) +
          (profileRecord.bio ? 1 : 0) +
          (profileRecord.avatarUrl ? 1 : 0);

        candidateSnapshots.push({
          coachEmail: coach.email,
          memberId: profileRecord.memberId ?? null,
          hasBio: Boolean(profileRecord.bio),
          hasAvatar: Boolean(profileRecord.avatarUrl),
          score,
        });

        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = {
            coachId: coach.id,
            email: coach.email,
            profile: profileRecord,
            score,
          };
        }

        if (score >= 3) {
          break;
        }
      } catch (error) {
        const message = formatError(error).toLowerCase();
        if (message.includes("unauthorized") || message.includes("could not be authenticated")) {
          unauthorizedDetected = true;
        }
      }
    }

    if (!bestCandidate) {
      return {
        integration: "Circle",
        status: "FAIL",
        summary: unauthorizedDetected
          ? "Circle API returned unauthorized responses; no coach profile could be matched."
          : "No matching Circle member was found for existing coach emails.",
        evidence: {
          scannedCoachCount: coaches.length,
          candidateSnapshots,
        },
        actions: [
          "Refresh CIRCLE_API_KEY with a valid server-side key from Circle admin.",
          "Confirm at least one Coach.email in the app exists in Circle community.",
        ],
      };
    }

    const syncResult = await syncCoachFromCircle(bestCandidate.coachId, {
      forceOverwrite: true,
    });

    const updatedCoach = await db.coach.findUnique({
      where: { id: bestCandidate.coachId },
      select: {
        id: true,
        email: true,
        circleId: true,
        bio: true,
        profileImage: true,
        syncedAt: true,
      },
    });

    const hasCircleId = Boolean(updatedCoach?.circleId);
    const hasBio = Boolean(updatedCoach?.bio && updatedCoach.bio.trim().length > 0);
    const hasProfileImage = Boolean(
      updatedCoach?.profileImage && updatedCoach.profileImage.trim().length > 0
    );

    const pass = syncResult.success && hasCircleId && hasBio && hasProfileImage;

    return {
      integration: "Circle",
      status: pass ? "PASS" : "FAIL",
      summary: pass
        ? "Real coach profile synced from Circle with circleId + bio + profileImage."
        : "Circle sync ran but required mapped fields are incomplete.",
      evidence: {
        coachEmail: bestCandidate.email,
        syncResult,
        updatedCoach,
      },
      actions: pass
        ? undefined
        : [
            "Ensure selected Circle member has both biography and avatar populated.",
            "Run sync again after Circle profile data is complete.",
          ],
    };
  } catch (error) {
    return {
      integration: "Circle",
      status: "FAIL",
      summary: "Circle proof execution failed.",
      evidence: { error: formatError(error) },
    };
  }
}

async function hubspotSearchByEmail(
  token: string,
  email: string
): Promise<{ id: string; properties?: Record<string, unknown> } | null> {
  const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: "EQ",
              value: email,
            },
          ],
        },
      ],
      properties: ["email", "firstname", "lastname", "company", "jobtitle"],
      limit: 1,
    }),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`HubSpot search failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  const results = payload.results as Array<Record<string, unknown>> | undefined;
  if (!results || results.length === 0) {
    return null;
  }

  return {
    id: String(results[0].id),
    properties: (results[0].properties as Record<string, unknown> | undefined) ?? {},
  };
}

async function hubspotUpsertContact(token: string, properties: Record<string, string>): Promise<string> {
  const existing = await hubspotSearchByEmail(token, properties.email);
  if (existing) {
    const updateResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${existing.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
      }
    );
    const updatePayload = (await updateResponse.json()) as Record<string, unknown>;
    if (!updateResponse.ok) {
      throw new Error(
        `HubSpot update failed (${updateResponse.status}): ${JSON.stringify(updatePayload)}`
      );
    }
    return existing.id;
  }

  const createResponse = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
  });
  const createPayload = (await createResponse.json()) as Record<string, unknown>;
  if (!createResponse.ok) {
    throw new Error(`HubSpot create failed (${createResponse.status}): ${JSON.stringify(createPayload)}`);
  }
  return String(createPayload.id);
}

async function runHubSpotProof(): Promise<ProofResult> {
  const token = getEnv("HUBSPOT_ACCESS_TOKEN");
  if (!token) {
    return {
      integration: "HubSpot",
      status: "SKIPPED",
      summary: "HUBSPOT_ACCESS_TOKEN is not configured.",
      evidence: {},
    };
  }

  try {
    const workshop = await db.workshop.findFirst({
      where: { status: "PRE_EVENT", isFree: true },
      include: {
        coach: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!workshop) {
      return {
        integration: "HubSpot",
        status: "FAIL",
        summary: "No PRE_EVENT free workshop available for registration proof.",
        evidence: {},
        actions: ["Move at least one workshop to PRE_EVENT status and retry proof run."],
      };
    }

    const activeRegistrations = await db.registration.count({
      where: {
        workshopId: workshop.id,
        status: { not: "CANCELLED" },
      },
    });

    if (activeRegistrations >= workshop.maxAttendees) {
      return {
        integration: "HubSpot",
        status: "FAIL",
        summary: "Selected workshop is already full.",
        evidence: {
          workshopId: workshop.id,
          workshopCode: workshop.workshopCode,
          maxAttendees: workshop.maxAttendees,
          activeRegistrations,
        },
      };
    }

    const email = `p0-rel-hubspot-${Date.now()}@example.com`;
    const registration = await db.registration.create({
      data: {
        workshopId: workshop.id,
        email,
        firstName: "P0",
        lastName: "HubSpot Proof",
        company: "Scaling Up QA",
        jobTitle: "Integration Test",
        paymentStatus: workshop.isFree ? "FREE" : "PENDING",
        status: "REGISTERED",
      },
      select: {
        id: true,
        email: true,
        workshopId: true,
        status: true,
        paymentStatus: true,
      },
    });

    const hubspotContactId = await hubspotUpsertContact(token, {
      email,
      firstname: "P0",
      lastname: "HubSpot Proof",
      company: "Scaling Up QA",
      jobtitle: "Integration Test",
    });

    await db.registration.update({
      where: { id: registration.id },
      data: { hubspotContactId },
    });

    const contact = await hubspotSearchByEmail(token, email);
    const pass = Boolean(contact?.id && contact.id === hubspotContactId);

    return {
      integration: "HubSpot",
      status: pass ? "PASS" : "FAIL",
      summary: pass
        ? "Real registration synced to HubSpot and linked back to app registration."
        : "HubSpot contact could not be verified after upsert.",
      evidence: {
        workshopId: workshop.id,
        workshopCode: workshop.workshopCode,
        workshopTitle: workshop.title,
        eventDateIso: workshop.eventDate.toISOString(),
        coachName: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
        registrationId: registration.id,
        email,
        hubspotContactId,
        verifiedContactId: contact?.id ?? null,
      },
    };
  } catch (error) {
    return {
      integration: "HubSpot",
      status: "FAIL",
      summary: "HubSpot proof execution failed.",
      evidence: { error: formatError(error) },
    };
  }
}

async function pollRegistrationCompletion(
  registrationId: string,
  stripePaymentId: string,
  timeoutMs = 60_000
): Promise<{
  completed: boolean;
  registration: Record<string, unknown> | null;
}> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const registration = await db.registration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        stripePaymentId: true,
        amountPaidCents: true,
        updatedAt: true,
      },
    });

    if (
      registration &&
      registration.paymentStatus === "COMPLETED" &&
      registration.status === "CONFIRMED" &&
      registration.stripePaymentId === stripePaymentId
    ) {
      return { completed: true, registration };
    }

    await sleep(2_500);
  }

  const latest = await db.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      stripePaymentId: true,
      amountPaidCents: true,
      updatedAt: true,
    },
  });
  return { completed: false, registration: latest as Record<string, unknown> | null };
}

async function runStripeProof(): Promise<ProofResult> {
  const stripeSecret = getEnv("STRIPE_SECRET_KEY");
  const webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");
  if (!stripeSecret) {
    return {
      integration: "Stripe",
      status: "SKIPPED",
      summary: "STRIPE_SECRET_KEY is not configured.",
      evidence: {},
    };
  }

  const allowLiveStripeProof = getEnv("P0_REL_ALLOW_LIVE_STRIPE") === "true";
  if (stripeSecret.startsWith("sk_live_") && !allowLiveStripeProof) {
    return {
      integration: "Stripe",
      status: "SKIPPED",
      summary:
        "STRIPE_SECRET_KEY is live mode. Stripe proof is skipped for safety unless P0_REL_ALLOW_LIVE_STRIPE=true.",
      evidence: {
        keyMode: "live",
      },
      actions: [
        "Run proof with Stripe test keys, or explicitly set P0_REL_ALLOW_LIVE_STRIPE=true for controlled live validation.",
      ],
    };
  }

  try {
    const workshop = await db.workshop.findFirst({
      where: {
        status: "PRE_EVENT",
        isFree: false,
        priceCents: { gt: 0 },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        workshopCode: true,
        priceCents: true,
        maxAttendees: true,
      },
    });

    if (!workshop) {
      return {
        integration: "Stripe",
        status: "FAIL",
        summary: "No paid PRE_EVENT workshop available for Stripe proof.",
        evidence: {},
      };
    }

    const activeRegistrations = await db.registration.count({
      where: {
        workshopId: workshop.id,
        status: { not: "CANCELLED" },
      },
    });
    if (activeRegistrations >= workshop.maxAttendees) {
      return {
        integration: "Stripe",
        status: "FAIL",
        summary: "Selected paid workshop is full.",
        evidence: {
          workshopId: workshop.id,
          workshopCode: workshop.workshopCode,
          maxAttendees: workshop.maxAttendees,
          activeRegistrations,
        },
      };
    }

    const email = `p0-rel-stripe-${Date.now()}@example.com`;
    const registration = await db.registration.create({
      data: {
        workshopId: workshop.id,
        email,
        firstName: "P0",
        lastName: "Stripe Proof",
        company: "Scaling Up QA",
        jobTitle: "Integration Test",
        paymentStatus: "PENDING",
        status: "REGISTERED",
      },
      select: {
        id: true,
        workshopId: true,
        email: true,
      },
    });

    const stripe = new Stripe(stripeSecret);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: workshop.priceCents || 100,
      currency: "usd",
      payment_method: "pm_card_visa",
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      metadata: {
        registrationId: registration.id,
        workshopId: workshop.id,
        source: "P0-REL-01",
      },
      description: `P0-REL-01 proof for ${workshop.workshopCode}`,
      receipt_email: registration.email,
    });

    // Attempt native webhook delivery first (from Stripe's own event pipeline).
    let pollResult = await pollRegistrationCompletion(registration.id, paymentIntent.id, 25_000);
    let webhookInvocationMode = "stripe-native";
    let webhookResponseSnapshot: Record<string, unknown> | null = null;

    if (!pollResult.completed && webhookSecret) {
      // Fallback: signed webhook invocation against live endpoint to prove webhook handler state transitions.
      const appUrl = getEnv("APP_URL") || "https://scaling-up-platform-v2.vercel.app";
      const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/stripe`;
      const syntheticEvent = {
        id: `evt_p0_rel_${Date.now()}`,
        object: "event",
        type: "checkout.session.completed",
        data: {
          object: {
            id: `cs_p0_rel_${Date.now()}`,
            amount_total: paymentIntent.amount_received || paymentIntent.amount,
            payment_intent: paymentIntent.id,
            metadata: {
              registrationId: registration.id,
            },
          },
        },
      };
      const payload = JSON.stringify(syntheticEvent);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": signature,
        },
        body: payload,
      });

      const bodyText = await webhookResponse.text();
      webhookResponseSnapshot = {
        url: webhookUrl,
        status: webhookResponse.status,
        body: bodyText.slice(0, 500),
      };
      webhookInvocationMode = "signed-webhook-fallback";

      pollResult = await pollRegistrationCompletion(registration.id, paymentIntent.id, 25_000);
    }

    const pass = pollResult.completed;
    const actions: string[] = [];
    if (!pass) {
      actions.push(
        "Verify Stripe webhook endpoint is active and subscribed to checkout.session.completed / payment_intent.succeeded."
      );
      if (!webhookSecret) {
        actions.push(
          "Set STRIPE_WEBHOOK_SECRET to allow signed fallback webhook replay in proof runs."
        );
      } else {
        actions.push("Confirm STRIPE_WEBHOOK_SECRET in app matches Stripe endpoint secret.");
      }
    }

    return {
      integration: "Stripe",
      status: pass ? "PASS" : "FAIL",
      summary: pass
        ? "Paid test registration reached COMPLETED via webhook-driven update."
        : "Paid registration was created and charged, but webhook status update was not observed in app.",
      evidence: {
        workshopId: workshop.id,
        workshopCode: workshop.workshopCode,
        registrationId: registration.id,
        email,
        paymentIntentId: paymentIntent.id,
        paymentIntentStatus: paymentIntent.status,
        hasWebhookSecret: Boolean(webhookSecret),
        webhookInvocationMode,
        webhookResponseSnapshot,
        registrationState: pollResult.registration,
      },
      actions: pass ? undefined : actions,
    };
  } catch (error) {
    return {
      integration: "Stripe",
      status: "FAIL",
      summary: "Stripe proof execution failed.",
      evidence: { error: formatError(error) },
    };
  }
}

async function runInngestProof(): Promise<ProofResult> {
  const eventKey = getEnv("INNGEST_EVENT_KEY");
  if (!eventKey) {
    return {
      integration: "Inngest",
      status: "SKIPPED",
      summary: "INNGEST_EVENT_KEY is not configured.",
      evidence: {},
    };
  }

  try {
    const workshop = await db.workshop.findFirst({
      where: { status: "PRE_EVENT" },
      select: { id: true, workshopCode: true, title: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!workshop) {
      return {
        integration: "Inngest",
        status: "FAIL",
        summary: "No PRE_EVENT workshop available for workflow execution proof.",
        evidence: {},
      };
    }

    const actor = await db.user.findFirst({
      where: { role: { in: ["ADMIN", "STAFF"] } },
      select: { id: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    if (!actor) {
      return {
        integration: "Inngest",
        status: "FAIL",
        summary: "No ADMIN/STAFF user found to assign workflow proof record.",
        evidence: {},
      };
    }

    const workflow = await db.workflow.create({
      data: {
        name: `P0-REL-01 Proof ${new Date().toISOString()}`,
        description: "Integration proof workflow (auto-generated)",
        createdBy: actor.id,
        isTemplate: false,
      },
      select: { id: true, name: true },
    });

    const workflowStep = await db.workflowStep.create({
      data: {
        workflowId: workflow.id,
        sortOrder: 0,
        stepType: "NOTIFICATION",
        triggerType: "ON_APPROVAL",
        subject: "P0-REL-01 proof notification",
        body: "Inngest workflow proof run.",
      },
      select: { id: true },
    });

    const assignment = await db.workflowAssignment.create({
      data: {
        workflowId: workflow.id,
        workshopId: workshop.id,
        workshopCode: workshop.workshopCode,
        assignedBy: actor.id,
      },
      select: { id: true },
    });

    // Capture timestamp before sending event to avoid missing fast executions.
    const executionWindowStart = new Date(Date.now() - 10_000);

    const eventPayload = {
      name: "workflow/schedule",
      data: {
        workshopId: workshop.id,
        workflowAssignmentId: assignment.id,
        source: "P0-REL-01",
      },
    };

    const eventResponse = await fetch(`https://inn.gs/e/${eventKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventPayload),
    });

    const eventResponseBody = await eventResponse.text();
    if (!eventResponse.ok) {
      return {
        integration: "Inngest",
        status: "FAIL",
        summary: "Failed to send workflow/schedule event to Inngest.",
        evidence: {
          status: eventResponse.status,
          body: eventResponseBody,
          workflowId: workflow.id,
          assignmentId: assignment.id,
        },
      };
    }

    let execution = await db.workflowStepExecution.findFirst({
      where: {
        stepId: workflowStep.id,
        workshopId: workshop.id,
        createdAt: { gte: executionWindowStart },
      },
      orderBy: { createdAt: "desc" },
    });

    const timeoutAt = Date.now() + 120_000;
    while (!execution && Date.now() < timeoutAt) {
      await sleep(3_000);
      execution = await db.workflowStepExecution.findFirst({
        where: {
          stepId: workflowStep.id,
          workshopId: workshop.id,
          createdAt: { gte: executionWindowStart },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    const pass = Boolean(execution);
    return {
      integration: "Inngest",
      status: pass ? "PASS" : "FAIL",
      summary: pass
        ? "Workflow event executed and recorded in workflow_step_executions."
        : "Inngest event accepted but no workflow execution record was observed in time window.",
      evidence: {
        workshopId: workshop.id,
        workshopCode: workshop.workshopCode,
        workflowId: workflow.id,
        workflowStepId: workflowStep.id,
        workflowAssignmentId: assignment.id,
        eventResponseStatus: eventResponse.status,
        eventResponseBody: eventResponseBody.slice(0, 500),
        executionRecord: execution
          ? {
              id: execution.id,
              status: execution.status,
              createdAt: execution.createdAt.toISOString(),
              executedAt: execution.executedAt?.toISOString() ?? null,
              errorMessage: execution.errorMessage,
            }
          : null,
      },
      actions: pass
        ? undefined
        : [
            "Confirm Inngest app endpoint points to /api/inngest on active deployment.",
            "Confirm execute-workflow function is registered and healthy in Inngest dashboard.",
          ],
    };
  } catch (error) {
    return {
      integration: "Inngest",
      status: "FAIL",
      summary: "Inngest proof execution failed.",
      evidence: { error: formatError(error) },
    };
  }
}

function renderMarkdownReport(
  startedAtIso: string,
  results: ProofResult[],
  jsonPath: string
): string {
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const skippedCount = results.filter((r) => r.status === "SKIPPED").length;

  const lines: string[] = [];
  lines.push("# P0-REL-01 Real-record Integration Proof Report");
  lines.push(`**Run timestamp:** ${startedAtIso}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- PASS: ${passCount}`);
  lines.push(`- FAIL: ${failCount}`);
  lines.push(`- SKIPPED: ${skippedCount}`);
  lines.push("");
  lines.push("| Integration | Status | Summary |");
  lines.push("|---|---|---|");
  for (const result of results) {
    lines.push(`| ${result.integration} | ${result.status} | ${result.summary} |`);
  }
  lines.push("");
  lines.push("## Details");
  for (const result of results) {
    lines.push(`### ${result.integration} — ${result.status}`);
    lines.push(result.summary);
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(result.evidence, null, 2));
    lines.push("```");
    if (result.actions && result.actions.length > 0) {
      lines.push("Recommended actions:");
      for (const action of result.actions) {
        lines.push(`- ${action}`);
      }
      lines.push("");
    }
  }
  lines.push("## Artifacts");
  lines.push(`- JSON artifact: \`${jsonPath}\``);

  return lines.join("\n");
}

async function main() {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();

  const results: ProofResult[] = [];
  results.push(await runCircleProof());
  results.push(await runHubSpotProof());
  results.push(await runStripeProof());
  results.push(await runInngestProof());

  const artifactDir = path.join(process.cwd(), "artifacts", "p0-rel-01");
  fs.mkdirSync(artifactDir, { recursive: true });
  const timestamp = startedAtIso.replace(/[:.]/g, "-");
  const jsonPath = path.join(artifactDir, `p0-rel-01-proof-${timestamp}.json`);
  const mdPath = path.join(artifactDir, `p0-rel-01-proof-${timestamp}.md`);

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        runTimestamp: startedAtIso,
        results,
      },
      null,
      2
    )
  );
  fs.writeFileSync(mdPath, renderMarkdownReport(startedAtIso, results, jsonPath));

  console.log("\n========================================");
  console.log("  P0-REL-01 Real-record Proof Results");
  console.log("========================================\n");
  for (const result of results) {
    const icon = result.status === "PASS" ? "✅" : result.status === "FAIL" ? "❌" : "⏭️";
    console.log(`${icon} ${result.integration}: ${result.status}`);
    console.log(`   ${result.summary}`);
  }
  console.log(`\nJSON artifact: ${jsonPath}`);
  console.log(`Markdown artifact: ${mdPath}\n`);

  const hasFailure = results.some((r) => r.status === "FAIL");
  process.exit(hasFailure ? 1 : 0);
}

main()
  .catch((error) => {
    console.error("P0-REL-01 proof run failed unexpectedly:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
