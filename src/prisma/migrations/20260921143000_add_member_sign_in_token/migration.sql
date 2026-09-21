CREATE TABLE "member_sign_in_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "issuedVia" TEXT NOT NULL,
    "issuedByUserId" TEXT,
    "campaignId" TEXT,

    CONSTRAINT "member_sign_in_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_sign_in_tokens_tokenHash_key"
ON "member_sign_in_tokens"("tokenHash");

CREATE INDEX "member_sign_in_tokens_normalizedEmail_issuedAt_idx"
ON "member_sign_in_tokens"("normalizedEmail", "issuedAt");

CREATE INDEX "member_sign_in_tokens_expiresAt_idx"
ON "member_sign_in_tokens"("expiresAt");
