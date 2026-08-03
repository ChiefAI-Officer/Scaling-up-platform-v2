import { z } from "zod";
import {
  operatorErrorResponse,
  privateJson,
  requirePrivilegedActor,
} from "@/app/api/admin/assessment-email-delivery-intents/route-support";
import {
  cancelHeldIntent,
  productionAssessmentEmailIntentOperatorDeps,
} from "@/lib/assessments/assessment-email-intent-operator";

const paramsSchema = z.object({ id: z.string().min(1) }).strict();
const cancelSchema = z
  .object({
    expectedVersion: z.number().int(),
    reasonCode: z.enum([
      "DELIVERY_NO_LONGER_AUTHORIZED",
      "RECIPIENT_SUPERSEDED",
      "CAMPAIGN_RETIRED",
      "DUPLICATE_CONFIRMED",
      "POLICY_DECISION",
    ]),
  })
  .strict();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const auth = await requirePrivilegedActor(request);
    if ("response" in auth) return auth.response;

    const parsedParams = paramsSchema.safeParse(await context.params);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return privateJson({ error: "INVALID_REQUEST" }, 400);
    }
    const parsedBody = cancelSchema.safeParse(body);
    if (!parsedParams.success || !parsedBody.success) {
      return privateJson({ error: "INVALID_REQUEST" }, 400);
    }

    const resolution = await cancelHeldIntent(
      productionAssessmentEmailIntentOperatorDeps({
        reviewTokenSecret:
          process.env.ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET,
      }),
      {
        intentId: parsedParams.data.id,
        actor: { userId: auth.actor.userId },
        expectedVersion: parsedBody.data.expectedVersion,
        reasonCode: parsedBody.data.reasonCode,
      },
    );
    return privateJson({
      data: {
        intentId: resolution.intentId,
        status: resolution.status,
        version: resolution.version,
        outboxId: resolution.outboxId,
        existingOutboxWon: resolution.existingOutboxWon,
      },
    });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
