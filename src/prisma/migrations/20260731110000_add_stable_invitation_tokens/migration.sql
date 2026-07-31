-- Stable invitation-token history. The legacy token hash becomes a non-secret,
-- deterministic history key so existing invitation links remain valid.

CREATE TYPE "AssessmentInvitationTokenSource" AS ENUM ('LEGACY_CURRENT', 'ORIGINAL', 'REMINDER');

CREATE TYPE "AssessmentInvitationTokenDeliveryState" AS ENUM ('STAGED', 'SENT', 'UNCERTAIN');

CREATE TABLE "assessment_invitation_tokens" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "source" "AssessmentInvitationTokenSource" NOT NULL,
    "deliveryState" "AssessmentInvitationTokenDeliveryState" NOT NULL,
    "deliveryConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_invitation_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_invitation_tokens_invitationId_fkey"
      FOREIGN KEY ("invitationId") REFERENCES "assessment_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "assessment_invitation_tokens_tokenHash_key"
  ON "assessment_invitation_tokens"("tokenHash");

CREATE INDEX "assessment_invitation_tokens_invitationId_idx"
  ON "assessment_invitation_tokens"("invitationId");

INSERT INTO "assessment_invitation_tokens" (
    "id",
    "invitationId",
    "tokenHash",
    "source",
    "deliveryState",
    "deliveryConfirmedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy_' || "id",
    "id",
    "tokenHash",
    'LEGACY_CURRENT'::"AssessmentInvitationTokenSource",
    CASE
      WHEN "status" IN ('SENT', 'VIEWED', 'SUBMITTED')
      THEN 'SENT'::"AssessmentInvitationTokenDeliveryState"
      ELSE 'UNCERTAIN'::"AssessmentInvitationTokenDeliveryState"
    END,
    "sentAt",
    "createdAt",
    COALESCE("sentAt", "createdAt")
FROM "assessment_invitations";
