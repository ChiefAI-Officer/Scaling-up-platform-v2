# Stripe Webhook Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Save this plan to:** `docs/superpowers/plans/2026-04-02-stripe-webhook-fix.md` before executing.

**Goal:** Fix Stripe webhook endpoint returning 503 instead of 500 when `STRIPE_WEBHOOK_SECRET` is missing, and add differentiated error responses (503 = misconfigured, 400 = bad signature, 500 = crash) to both Stripe and Typeform webhook routes.

**Architecture:** Add an upfront env guard at the top of each webhook route handler that short-circuits to 503 before entering the try block. Remove the nested inner try/catch in the Stripe route — `constructWebhookEvent` errors are now handled by the outer catch, which distinguishes `StripeSignatureVerificationError` (400) from everything else (500). Same pattern applied inline to Typeform. No new files, no shared error classes.

**Tech Stack:** Next.js App Router route handlers, Stripe Node SDK (`Stripe.errors.StripeSignatureVerificationError`), Jest

---

## File Map

| File | Action |
|------|--------|
| `src/src/app/api/webhooks/stripe/route.ts` | Add env guard; collapse double try/catch into single |
| `src/src/app/api/webhooks/typeform/route.ts` | Add env guard; add console prefix to outer catch |
| `src/src/__tests__/api/stripe-webhook.test.ts` | Add 503 test; fix invalid-signature test to throw correct error type |
| `src/src/__tests__/api/typeform-webhook.test.ts` | Add 503 test |

---

## Task 1: Stripe Webhook — Tests First

**Files:**
- Modify: `src/src/__tests__/api/stripe-webhook.test.ts`

- [ ] **Step 1: Add test for 503 when STRIPE_WEBHOOK_SECRET is missing**

  Open `src/src/__tests__/api/stripe-webhook.test.ts`. Find the `describe("Stripe webhook API", ...)` block. Add these two tests right after the existing `afterEach` block (before the first `it`):

  ```ts
  describe("configuration guard", () => {
    const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

    beforeEach(() => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    });

    afterEach(() => {
      if (originalSecret !== undefined) {
        process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
      } else {
        delete process.env.STRIPE_WEBHOOK_SECRET;
      }
    });

    it("returns 503 when STRIPE_WEBHOOK_SECRET is not set", async () => {
      const response = await POST(
        buildWebhookRequest({ signature: "any-sig", body: "{}" })
      );
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBe("Webhook misconfigured");
    });
  });
  ```

- [ ] **Step 2: Fix the existing invalid-signature test**

  The existing test at line 64 throws a plain `Error`, but after our change the outer catch only returns 400 for `Stripe.errors.StripeSignatureVerificationError`. Update it to match reality:

  Find this block:
  ```ts
  it("returns 400 for invalid webhook signature", async () => {
    (constructWebhookEvent as jest.Mock).mockImplementation(() => {
      throw new Error("invalid signature");
    });
  ```

  Replace the mock implementation with:
  ```ts
  it("returns 400 for invalid webhook signature", async () => {
    (constructWebhookEvent as jest.Mock).mockImplementation(() => {
      const err = new Error("No signatures found matching the expected signature for payload.") as Error & { type: string };
      err.name = "StripeSignatureVerificationError";
      // Stripe SDK attaches a `type` field for instanceof checks
      Object.setPrototypeOf(err, Stripe.errors.StripeSignatureVerificationError.prototype);
      throw err;
    });
  ```

  Also add the Stripe import at the top of the test file if not already present — check line 28. If only `constructWebhookEvent` is imported from `@/services/stripe`, add:
  ```ts
  import Stripe from "stripe";
  ```

- [ ] **Step 3: Run the new tests to confirm they fail**

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  npm test -- --testPathPattern="stripe-webhook" --no-coverage 2>&1 | tail -30
  ```

  Expected: `FAIL` — the 503 test fails (gets 400 or 500), the updated invalid-signature test likely fails too.

---

## Task 2: Stripe Webhook — Implementation

**Files:**
- Modify: `src/src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 4: Replace the route handler with the updated version**

  Replace the entire `export async function POST(request: NextRequest)` function (lines 7–63) with:

  ```ts
  export async function POST(request: NextRequest) {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error(
        "[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not set — add it to your environment variables"
      );
      return NextResponse.json({ error: "Webhook misconfigured" }, { status: 503 });
    }

    try {
      const body = await request.text();
      const signature = request.headers.get("stripe-signature");

      if (!signature) {
        return NextResponse.json(
          { error: "Missing stripe-signature header" },
          { status: 400 }
        );
      }

      const event = constructWebhookEvent(body, signature);

      console.log(`Stripe webhook received: ${event.id} (${event.type})`);

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutComplete(session);
          break;
        }

        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentIntentSucceeded(paymentIntent);
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentFailed(paymentIntent);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
      console.error("[Stripe Webhook] Unexpected error:", error);
      return NextResponse.json(
        { error: "Webhook handler failed" },
        { status: 500 }
      );
    }
  }
  ```

  Everything below the `POST` function (the `syncRegistrationToHubSpot`, `handleCheckoutComplete`, `handlePaymentIntentSucceeded`, `handlePaymentFailed` functions) stays **unchanged**.

- [ ] **Step 5: Run the Stripe webhook tests — all must pass**

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  npm test -- --testPathPattern="stripe-webhook" --no-coverage 2>&1 | tail -20
  ```

  Expected output:
  ```
  PASS src/src/__tests__/api/stripe-webhook.test.ts
    Stripe webhook API
      configuration guard
        ✓ returns 503 when STRIPE_WEBHOOK_SECRET is not set
      ✓ returns 400 when stripe signature header is missing
      ✓ returns 400 for invalid webhook signature
      ✓ processes checkout completion and syncs HubSpot contact
      ✓ ignores duplicate checkout completion events idempotently
      ✓ processes payment_intent.succeeded when registrationId metadata exists
  ```

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  git add src/src/app/api/webhooks/stripe/route.ts src/src/__tests__/api/stripe-webhook.test.ts
  git commit -m "fix: stripe webhook returns 503 when STRIPE_WEBHOOK_SECRET is missing

  - add upfront env guard before try block → 503 Webhook misconfigured
  - collapse double try/catch into single: StripeSignatureVerificationError → 400, crashes → 500
  - update tests: add 503 case, fix invalid-signature mock to use correct error type"
  ```

---

## Task 3: Typeform Webhook — Tests First

**Files:**
- Modify: `src/src/__tests__/api/typeform-webhook.test.ts`

- [ ] **Step 7: Add the 503 test for missing TYPEFORM_WEBHOOK_SECRET**

  The test file uses a `buildRequest({ body, signature })` helper (defined at line 76) and a top-level `describe("Typeform webhook API", ...)` whose `beforeEach` sets `process.env.TYPEFORM_WEBHOOK_SECRET = TEST_SECRET`.

  Add this nested `describe` block **inside** `describe("Typeform webhook API", ...)`, right after the outer `afterEach` block (before the first `it`):

  ```ts
  describe("configuration guard", () => {
    beforeEach(() => {
      // Override the outer beforeEach which sets TYPEFORM_WEBHOOK_SECRET = TEST_SECRET
      delete process.env.TYPEFORM_WEBHOOK_SECRET;
    });

    it("returns 503 when TYPEFORM_WEBHOOK_SECRET is not set", async () => {
      const body = JSON.stringify({ event_id: "x" });
      const response = await POST(
        buildRequest({ body, signature: "sha256=fakesig" })
      );
      expect(response.status).toBe(503);
      const json = await response.json();
      expect(json.error).toBe("Webhook misconfigured");
    });
  });
  ```

  The outer `afterEach` already restores `process.env.TYPEFORM_WEBHOOK_SECRET` to its original value — no extra cleanup needed.

- [ ] **Step 8: Run the new Typeform test to confirm it fails**

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  npm test -- --testPathPattern="typeform-webhook" --no-coverage 2>&1 | tail -20
  ```

  Expected: `FAIL` — the 503 test fails (currently returns 500 due to the throw inside `verifySignature`).

---

## Task 4: Typeform Webhook — Implementation

**Files:**
- Modify: `src/src/app/api/webhooks/typeform/route.ts`

- [ ] **Step 9: Add env guard and console prefix to the POST handler**

  Make two targeted edits to the `export async function POST(request: NextRequest)` function:

  **Edit 1** — Add env guard as the very first line of the function body (before `try`):

  ```ts
  export async function POST(request: NextRequest) {
    if (!process.env.TYPEFORM_WEBHOOK_SECRET) {
      console.error(
        "[Typeform Webhook] TYPEFORM_WEBHOOK_SECRET is not set — add it to your environment variables"
      );
      return NextResponse.json({ error: "Webhook misconfigured" }, { status: 503 });
    }

    try {
  ```

  **Edit 2** — Update the outer catch block (currently at lines 179–185) to add a log prefix:

  ```ts
  } catch (error) {
    console.error("[Typeform Webhook] Unexpected error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
  ```

  Everything inside the `try` block stays **unchanged**.

- [ ] **Step 10: Run all Typeform webhook tests — all must pass**

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  npm test -- --testPathPattern="typeform-webhook" --no-coverage 2>&1 | tail -20
  ```

  Expected: `PASS` with all existing tests still green plus the new 503 test.

- [ ] **Step 11: Run the full test suite**

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  npm test -- --no-coverage 2>&1 | tail -10
  ```

  Expected: All suites pass. No regressions.

- [ ] **Step 12: Commit**

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  git add src/src/app/api/webhooks/typeform/route.ts src/src/__tests__/api/typeform-webhook.test.ts
  git commit -m "fix: typeform webhook returns 503 when TYPEFORM_WEBHOOK_SECRET is missing

  - add upfront env guard before try block → 503 Webhook misconfigured
  - add [Typeform Webhook] prefix to error log for easier log filtering"
  ```

---

## Task 5: Build Verification

- [ ] **Step 13: Run full local build**

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  CI=true npm run build 2>&1 | tail -20
  ```

  Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 14: Commit and push**

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  git push origin main
  ```

---

## Task 6: Configuration (Manual Steps After Deploy)

These steps are done by the developer after the code is deployed on Vercel.

- [ ] **Step 15: Get the signing secret from Stripe Dashboard**

  1. Go to Stripe Dashboard → Developers → Webhooks
  2. Click on the endpoint: `https://scaling-up-platform-v2.vercel.app/api/webhooks/stripe`
  3. Under **Signing secret**, click **Reveal** → copy the value (starts with `whsec_`)

- [ ] **Step 16: Add to local .env**

  Open `src/.env` and set:
  ```
  STRIPE_WEBHOOK_SECRET=whsec_<your-value-here>
  ```

- [ ] **Step 17: Review the push-env script before running**

  `src/scripts/push-env-to-vercel.mjs` has an unstaged modification (visible in `git status`). Before running it, check what changed:

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  git diff scripts/push-env-to-vercel.mjs
  ```

  Confirm `STRIPE_WEBHOOK_SECRET` is NOT in the SKIP list. If the modification looks unrelated, proceed.

- [ ] **Step 18: Push env vars to Vercel**

  ```bash
  cd /Users/diushianstand/Scaling-up-platform-v2/src
  node scripts/push-env-to-vercel.mjs
  ```

- [ ] **Step 19: Confirm the var is set in Vercel**

  ```bash
  npx vercel env ls 2>&1 | grep STRIPE_WEBHOOK
  ```

  Expected: `STRIPE_WEBHOOK_SECRET` appears under Production.

- [ ] **Step 20: Trigger redeploy if needed**

  Vercel auto-redeploys on env var changes. If no auto-deploy triggers within 2 minutes, go to Vercel Dashboard → the project → Deployments → click **Redeploy** on the latest.

---

## Task 7: End-to-End Verification

- [ ] **Step 21: Make a fresh test payment**

  1. Create and approve a new test workshop in the app
  2. Go to the public landing page → Register → complete payment with Stripe test card `4242 4242 4242 4242` (any future expiry, any CVC)

- [ ] **Step 22: Confirm webhook delivery in Stripe Dashboard**

  Stripe Dashboard → Developers → Webhooks → the endpoint → **Recent deliveries**

  Expected: the latest `checkout.session.completed` event shows **200 OK**.

- [ ] **Step 23: Confirm registration is COMPLETED**

  In the admin dashboard → the test workshop → Registrations. The attendee should show `paymentStatus: COMPLETED` (not PENDING).

- [ ] **Step 24: Confirm Financials shows the amount**

  Admin → Financials. The test payment amount should appear in the revenue total.

---

## Context

**Why this fix:** `STRIPE_WEBHOOK_SECRET` is not set in Vercel's production environment. The webhook handler throws when the secret is absent, returning an error response on every Stripe delivery attempt (18 failures since March 30). Stripe will disable the endpoint by April 8, 2026 if not fixed.

**Why no event replay:** All 18 failed events were test payments for workshops that have been deleted. Replaying would hit missing registrations and be silently skipped.

**Idempotency is already handled:** `handleCheckoutComplete` checks `paymentStatus === "COMPLETED"` before updating and returns early on duplicates. No risk of double-processing if Stripe retries.

**Stripe retries on all non-2xx:** The 503/400/500 distinction exists purely for developer log readability — `[Stripe Webhook] Misconfigured` vs `Invalid signature` vs `Unexpected error` — not to control Stripe retry behavior.
