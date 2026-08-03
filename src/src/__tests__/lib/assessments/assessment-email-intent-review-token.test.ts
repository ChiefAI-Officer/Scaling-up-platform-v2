import { createCipheriv, createHash, randomBytes } from "crypto";
import {
  IntentReviewTokenError,
  issueIntentReviewToken,
  verifyIntentReviewToken,
} from "@/lib/assessments/assessment-email-intent-review-token";

const secret = "task-8-review-token-secret-at-least-32-characters";
const otherSecret = "task-8-different-token-secret-at-least-32-characters";
const issuedAt = new Date("2026-08-03T05:00:00.000Z");
const expected = {
  actorUserId: "user_operator_1",
  intentId: "intent_1",
  intentVersion: 7,
  reviewContextHash:
    "b69e4ba8c59e72ef93a1d6ee58cb78d721cac0df7d4622a0ef718129d4f94c2e",
};

function issue(): string {
  return issueIntentReviewToken(expected, { now: issuedAt, secret });
}

function encryptFixture(claims: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret, "utf8").digest(),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(claims), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

function expectTokenError(
  work: () => unknown,
  code:
    | "CONFIGURATION_INVALID"
    | "MALFORMED"
    | "VERSION_UNSUPPORTED"
    | "AUTHENTICATION_FAILED"
    | "SCHEMA_INVALID"
    | "EXPIRED"
    | "ACTOR_MISMATCH"
    | "INTENT_MISMATCH"
    | "VERSION_MISMATCH"
    | "CONTEXT_MISMATCH",
): void {
  try {
    work();
    throw new Error("Expected review-token verification to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(IntentReviewTokenError);
    expect((error as IntentReviewTokenError).code).toBe(code);
    expect((error as Error).message).not.toContain(secret);
    expect((error as Error).message).not.toContain(otherSecret);
  }
}

describe("assessment email intent review tokens", () => {
  it("issues an opaque actor-, intent-, version-, and context-bound token valid for 15 minutes", () => {
    const token = issue();
    const claims = verifyIntentReviewToken(token, expected, {
      now: new Date("2026-08-03T05:14:59.000Z"),
      secret,
    });

    expect(token).toMatch(
      /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(claims).toEqual({
      schemaVersion: 1,
      ...expected,
      issuedAt: 1785733200,
      expiresAt: 1785734100,
      nonce: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
    });
  });

  it("keeps frozen payload fields out of the token text", () => {
    const token = issue();

    expect(token).not.toContain("reviewer@example.com");
    expect(token).not.toContain("Your assessment result");
    expect(token).not.toContain("<html><body>frozen result</body></html>");
    expect(Buffer.from(token).toString("utf8")).not.toContain("recipientEmail");
    expect(Buffer.from(token).toString("utf8")).not.toContain("bodyHtml");
  });

  it("rejects an expired token at the absolute 15-minute boundary", () => {
    expectTokenError(
      () =>
        verifyIntentReviewToken(issue(), expected, {
          now: new Date("2026-08-03T05:15:00.000Z"),
          secret,
        }),
      "EXPIRED",
    );
  });

  it.each([
    ["empty", ""],
    ["missing segments", "v1.only-two"],
    ["too many segments", "v1.a.b.c.d"],
    ["invalid base64url", "v1.***.cipher.tag"],
    ["wrong IV length", "v1.YQ.YQ.YQ"],
  ])("rejects malformed framing: %s", (_case, token) => {
    expectTokenError(
      () => verifyIntentReviewToken(token, expected, { now: issuedAt, secret }),
      "MALFORMED",
    );
  });

  it("rejects an unsupported framing version", () => {
    expectTokenError(
      () =>
        verifyIntentReviewToken(issue().replace(/^v1\./, "v2."), expected, {
          now: issuedAt,
          secret,
        }),
      "VERSION_UNSUPPORTED",
    );
  });

  it("rejects a token for a different actor", () => {
    expectTokenError(
      () =>
        verifyIntentReviewToken(
          issue(),
          { ...expected, actorUserId: "user_operator_2" },
          { now: issuedAt, secret },
        ),
      "ACTOR_MISMATCH",
    );
  });

  it("rejects a token for a different intent", () => {
    expectTokenError(
      () =>
        verifyIntentReviewToken(
          issue(),
          { ...expected, intentId: "intent_2" },
          { now: issuedAt, secret },
        ),
      "INTENT_MISMATCH",
    );
  });

  it("rejects a stale intent version", () => {
    expectTokenError(
      () =>
        verifyIntentReviewToken(
          issue(),
          { ...expected, intentVersion: 8 },
          { now: issuedAt, secret },
        ),
      "VERSION_MISMATCH",
    );
  });

  it("rejects changed reviewed current facts through the context hash", () => {
    expectTokenError(
      () =>
        verifyIntentReviewToken(
          issue(),
          {
            ...expected,
            reviewContextHash:
              "4431d3abfbdce69b5bc2bbd158c730e6b40844fa950ba11688a8d97c3cbb7584",
          },
          { now: issuedAt, secret },
        ),
      "CONTEXT_MISMATCH",
    );
  });

  it("rejects a token authenticated with a different secret", () => {
    expectTokenError(
      () =>
        verifyIntentReviewToken(issue(), expected, {
          now: issuedAt,
          secret: otherSecret,
        }),
      "AUTHENTICATION_FAILED",
    );
  });

  it("rejects a corrupted authenticated frame", () => {
    const parts = issue().split(".");
    const tag = Buffer.from(parts[3], "base64url");
    tag[0] ^= 1;
    parts[3] = tag.toString("base64url");

    expectTokenError(
      () =>
        verifyIntentReviewToken(parts.join("."), expected, {
          now: issuedAt,
          secret,
        }),
      "AUTHENTICATION_FAILED",
    );
  });

  it.each([
    [
      "unsupported encrypted claim version",
      { schemaVersion: 2, ...expected, issuedAt: 1, expiresAt: 2, nonce: "n" },
    ],
    [
      "payload-bearing extra claim",
      {
        schemaVersion: 1,
        ...expected,
        issuedAt: 1785733200,
        expiresAt: 1785734100,
        nonce: "nonce",
        recipientEmail: "reviewer@example.com",
      },
    ],
  ])("rejects an invalid encrypted claim schema: %s", (_case, claims) => {
    expectTokenError(
      () =>
        verifyIntentReviewToken(encryptFixture(claims), expected, {
          now: issuedAt,
          secret,
        }),
      "SCHEMA_INVALID",
    );
  });

  it.each([undefined, "short-secret"])(
    "fails closed when the configured secret is absent or too short",
    (configuredSecret) => {
      const previous = process.env.ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET;
      delete process.env.ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET;
      try {
        expectTokenError(
          () =>
            issueIntentReviewToken(expected, {
              now: issuedAt,
              ...(configuredSecret === undefined
                ? {}
                : { secret: configuredSecret }),
            }),
          "CONFIGURATION_INVALID",
        );
      } finally {
        if (previous === undefined) {
          delete process.env.ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET;
        } else {
          process.env.ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET = previous;
        }
      }
    },
  );
});
