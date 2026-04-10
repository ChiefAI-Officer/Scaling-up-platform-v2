import crypto from "crypto";

const DEFAULT_RESET_TTL_SECONDS = 60 * 30; // 30 minutes

interface PasswordResetPayload {
  email: string;
  exp: number;
  fp: string;
  nonce: string;
}

function getResetSecret(): string {
  const secret = process.env.APPROVAL_LINK_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Password reset secret is not configured. Set APPROVAL_LINK_SECRET or NEXTAUTH_SECRET."
    );
  }
  return secret;
}

function passwordFingerprint(passwordHash: string | null | undefined): string {
  if (!passwordHash) {
    return "missing";
  }

  return crypto
    .createHash("sha256")
    .update(passwordHash)
    .digest("hex")
    .slice(0, 24);
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function sign(payloadBase64: string): string {
  return crypto
    .createHmac("sha256", getResetSecret())
    .update(payloadBase64)
    .digest("hex");
}

function secureEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function generatePasswordResetToken(
  email: string,
  passwordHash: string | null | undefined,
  ttlSeconds: number = DEFAULT_RESET_TTL_SECONDS
): string {
  const nonce = crypto.randomBytes(32).toString("hex");
  const payload: PasswordResetPayload = {
    email: email.trim().toLowerCase(),
    exp: Date.now() + ttlSeconds * 1000,
    fp: passwordFingerprint(passwordHash),
    nonce,
  };

  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function verifyPasswordResetToken(
  token: string,
  email: string,
  passwordHash: string | null | undefined
): boolean {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    return false;
  }

  const expectedSignature = sign(payloadBase64);
  if (!secureEqual(signature, expectedSignature)) {
    return false;
  }

  let payload: PasswordResetPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadBase64)) as PasswordResetPayload;
  } catch {
    return false;
  }

  if (payload.email !== email.trim().toLowerCase()) {
    return false;
  }

  if (payload.exp <= Date.now()) {
    return false;
  }

  return payload.fp === passwordFingerprint(passwordHash);
}
