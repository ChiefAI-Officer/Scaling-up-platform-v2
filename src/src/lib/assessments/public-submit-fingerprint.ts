import { createHmac } from "node:crypto";
import { normalizeMailbox } from "@/lib/assessments/quick-assessment-lead";

export const PUBLIC_SUBMIT_FINGERPRINT_VERSION = 1;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

/** HMAC of immutable normalized client intent; never persists the credential. */
export function fingerprintPublicSubmit(input: {
  secret: string;
  publicTaker: { firstName: string; lastName: string; email: string };
  answers: Array<{ stableKey: string; value: unknown }>;
  referralCredential: string | null;
}): string {
  const credentialDigest = createHmac("sha256", input.secret)
    .update(input.referralCredential ?? "")
    .digest("hex");
  const intent = {
    taker: {
      firstName: input.publicTaker.firstName.trim().toLowerCase(),
      lastName: input.publicTaker.lastName.trim().toLowerCase(),
      email: normalizeMailbox(input.publicTaker.email),
    },
    answers: [...input.answers]
      .map((answer) => ({
        stableKey: answer.stableKey,
        value: canonicalValue(answer.value),
      }))
      .sort((a, b) => a.stableKey.localeCompare(b.stableKey)),
    credentialDigest,
  };
  return createHmac("sha256", input.secret)
    .update(JSON.stringify(intent))
    .digest("hex");
}
