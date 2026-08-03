import { z } from "zod";
import {
  operatorErrorResponse,
  privateJson,
  requirePrivilegedActor,
} from "@/app/api/admin/assessment-email-delivery-intents/route-support";
import {
  loadHeldIntentDetail,
  productionAssessmentEmailIntentOperatorDeps,
} from "@/lib/assessments/assessment-email-intent-operator";

const paramsSchema = z.object({ id: z.string().min(1) }).strict();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const auth = await requirePrivilegedActor(request);
    if ("response" in auth) return auth.response;
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return privateJson({ error: "INVALID_REQUEST" }, 400);
    }

    const detail = await loadHeldIntentDetail(
      productionAssessmentEmailIntentOperatorDeps({
        reviewTokenSecret:
          process.env.ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET,
      }),
      {
        intentId: parsedParams.data.id,
        actor: { userId: auth.actor.userId },
      },
    );
    return privateJson({
      data: {
        id: detail.id,
        submissionId: detail.submissionId,
        campaignId: detail.campaignId,
        invitationId: detail.invitationId,
        respondentId: detail.respondentId,
        recipientRole: detail.recipientRole,
        emailType: detail.emailType,
        recipientEmail: detail.recipientEmail,
        subject: detail.subject,
        previewDocument: detail.previewDocument,
        payloadHash: detail.payloadHash,
        snapshotSchemaVersion: detail.snapshotSchemaVersion,
        rendererContractVersion: detail.rendererContractVersion,
        authorizationSnapshot: detail.authorizationSnapshot,
        contentProvenance: detail.contentProvenance,
        status: detail.status,
        version: detail.version,
        holdReason: detail.holdReason,
        holdReasons: detail.holdReasons,
        heldAt: detail.heldAt,
        expiresAt: detail.expiresAt,
        current: detail.current,
        drift: detail.drift,
        reviewContextHash: detail.reviewContextHash,
        reviewToken: detail.reviewToken,
      },
    });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
