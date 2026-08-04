import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "crypto";

const TOKEN_VERSION = "v1";
const TOKEN_LIFETIME_SECONDS = 15 * 60;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const MINIMUM_SECRET_CHARACTERS = 32;
const SECRET_ENV = "ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET";
const CLAIM_KEYS = [
  "actorUserId",
  "expiresAt",
  "intentId",
  "intentVersion",
  "issuedAt",
  "nonce",
  "reviewContextHash",
  "schemaVersion",
] as const;

export type ReviewTokenClaimsV1 = {
  schemaVersion: 1;
  actorUserId: string;
  intentId: string;
  intentVersion: number;
  reviewContextHash: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export type IntentReviewTokenErrorCode =
  | "CONFIGURATION_INVALID"
  | "MALFORMED"
  | "VERSION_UNSUPPORTED"
  | "AUTHENTICATION_FAILED"
  | "SCHEMA_INVALID"
  | "EXPIRED"
  | "ACTOR_MISMATCH"
  | "INTENT_MISMATCH"
  | "VERSION_MISMATCH"
  | "CONTEXT_MISMATCH";

const ERROR_MESSAGES: Record<IntentReviewTokenErrorCode, string> = {
  CONFIGURATION_INVALID: "Review-token configuration is invalid.",
  MALFORMED: "Review token is malformed.",
  VERSION_UNSUPPORTED: "Review-token framing version is unsupported.",
  AUTHENTICATION_FAILED: "Review-token authentication failed.",
  SCHEMA_INVALID: "Review-token claims are invalid.",
  EXPIRED: "Review token has expired.",
  ACTOR_MISMATCH: "Review token is bound to a different actor.",
  INTENT_MISMATCH: "Review token is bound to a different intent.",
  VERSION_MISMATCH: "Review token is bound to a different intent version.",
  CONTEXT_MISMATCH: "Review token is bound to different review facts.",
};

export class IntentReviewTokenError extends Error {
  readonly code: IntentReviewTokenErrorCode;

  constructor(code: IntentReviewTokenErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "IntentReviewTokenError";
    this.code = code;
  }
}

type ReviewTokenOptions = { now?: Date; secret?: string };

function tokenSecret(explicit: string | undefined): string {
  const secret = explicit ?? process.env[SECRET_ENV];
  if (
    typeof secret !== "string" ||
    secret.length < MINIMUM_SECRET_CHARACTERS
  ) {
    throw new IntentReviewTokenError("CONFIGURATION_INVALID");
  }
  return secret;
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function base64urlSegment(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length > 0 && decoded.toString("base64url") === value
    ? decoded
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseClaims(value: unknown): ReviewTokenClaimsV1 {
  if (!isRecord(value)) {
    throw new IntentReviewTokenError("SCHEMA_INVALID");
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== CLAIM_KEYS.length ||
    keys.some((key, index) => key !== CLAIM_KEYS[index])
  ) {
    throw new IntentReviewTokenError("SCHEMA_INVALID");
  }
  if (
    value.schemaVersion !== 1 ||
    typeof value.actorUserId !== "string" ||
    value.actorUserId.length === 0 ||
    typeof value.intentId !== "string" ||
    value.intentId.length === 0 ||
    typeof value.intentVersion !== "number" ||
    !Number.isSafeInteger(value.intentVersion) ||
    value.intentVersion < 0 ||
    typeof value.reviewContextHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.reviewContextHash) ||
    typeof value.issuedAt !== "number" ||
    !Number.isSafeInteger(value.issuedAt) ||
    typeof value.expiresAt !== "number" ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt - value.issuedAt !== TOKEN_LIFETIME_SECONDS ||
    typeof value.nonce !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(value.nonce)
  ) {
    throw new IntentReviewTokenError("SCHEMA_INVALID");
  }
  return value as ReviewTokenClaimsV1;
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function issueIntentReviewToken(
  claims: Omit<
    ReviewTokenClaimsV1,
    "schemaVersion" | "issuedAt" | "expiresAt" | "nonce"
  >,
  options: ReviewTokenOptions = {},
): string {
  const now = options.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1_000);
  if (!Number.isSafeInteger(issuedAt)) {
    throw new IntentReviewTokenError("SCHEMA_INVALID");
  }
  const fullClaims = parseClaims({
    schemaVersion: 1,
    ...claims,
    issuedAt,
    expiresAt: issuedAt + TOKEN_LIFETIME_SECONDS,
    nonce: randomBytes(16).toString("base64url"),
  });
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveKey(tokenSecret(options.secret)),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(fullClaims), "utf8"),
    cipher.final(),
  ]);
  return [
    TOKEN_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function verifyIntentReviewToken(
  token: string,
  expected: {
    actorUserId: string;
    intentId: string;
    intentVersion: number;
    reviewContextHash: string;
  },
  options: ReviewTokenOptions = {},
): ReviewTokenClaimsV1 {
  if (typeof token !== "string") {
    throw new IntentReviewTokenError("MALFORMED");
  }
  const parts = token.split(".");
  if (parts.length !== 4) {
    throw new IntentReviewTokenError("MALFORMED");
  }
  if (parts[0] !== TOKEN_VERSION) {
    throw new IntentReviewTokenError("VERSION_UNSUPPORTED");
  }
  const iv = base64urlSegment(parts[1]);
  const ciphertext = base64urlSegment(parts[2]);
  const authTag = base64urlSegment(parts[3]);
  if (
    iv === null ||
    iv.length !== IV_BYTES ||
    ciphertext === null ||
    authTag === null ||
    authTag.length !== AUTH_TAG_BYTES
  ) {
    throw new IntentReviewTokenError("MALFORMED");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(tokenSecret(options.secret)),
    iv,
  );
  decipher.setAuthTag(authTag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  } catch {
    throw new IntentReviewTokenError("AUTHENTICATION_FAILED");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new IntentReviewTokenError("SCHEMA_INVALID");
  }
  const claims = parseClaims(parsed);

  if (!constantTimeStringEqual(claims.actorUserId, expected.actorUserId)) {
    throw new IntentReviewTokenError("ACTOR_MISMATCH");
  }
  if (!constantTimeStringEqual(claims.intentId, expected.intentId)) {
    throw new IntentReviewTokenError("INTENT_MISMATCH");
  }
  if (claims.intentVersion !== expected.intentVersion) {
    throw new IntentReviewTokenError("VERSION_MISMATCH");
  }
  if (
    !constantTimeStringEqual(
      claims.reviewContextHash,
      expected.reviewContextHash,
    )
  ) {
    throw new IntentReviewTokenError("CONTEXT_MISMATCH");
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1_000);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds >= claims.expiresAt) {
    throw new IntentReviewTokenError("EXPIRED");
  }
  return claims;
}
