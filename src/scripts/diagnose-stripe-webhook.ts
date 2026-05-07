/* eslint-disable */
/**
 * Diagnose why Stripe webhooks aren't delivering.
 * Lists webhook endpoints + recent checkout sessions on the account
 * the API key points to.
 */
import Stripe from "stripe";

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY not set");
    process.exit(1);
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 15_000 });

  // 1. Account the API key belongs to
  const account = await stripe.accounts.retrieve();
  console.log("=== ACCOUNT ===");
  console.log(`account.id: ${account.id}`);
  console.log(`account.email: ${account.email ?? "(unset)"}`);
  console.log(`account.charges_enabled: ${account.charges_enabled}`);
  console.log(`livemode (key): ${process.env.STRIPE_SECRET_KEY!.startsWith("sk_live_")}`);

  // 2. All webhook endpoints registered to this account
  console.log("");
  console.log("=== WEBHOOK ENDPOINTS ===");
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  if (endpoints.data.length === 0) {
    console.log("(none)");
  } else {
    for (const ep of endpoints.data) {
      console.log(`- id: ${ep.id}`);
      console.log(`  url: ${ep.url}`);
      console.log(`  status: ${ep.status}`);
      console.log(`  enabled_events: ${ep.enabled_events.join(", ")}`);
      console.log(`  api_version: ${ep.api_version ?? "(default)"}`);
      console.log("");
    }
  }

  // 3. Recent checkout sessions (with attempt count for webhook retries)
  console.log("=== RECENT CHECKOUT SESSIONS (last 5) ===");
  const sessions = await stripe.checkout.sessions.list({ limit: 5 });
  for (const s of sessions.data) {
    console.log(
      `- ${s.id}  status=${s.status}  payment_status=${s.payment_status}  ` +
        `customer_email=${s.customer_email ?? "(unset)"}  ` +
        `created=${new Date(s.created * 1000).toISOString()}`
    );
    if (s.metadata?.registrationId) {
      console.log(`  metadata.registrationId: ${s.metadata.registrationId}`);
    }
  }

  // 4. Recent events on this account (regardless of whether they were delivered)
  console.log("");
  console.log("=== RECENT EVENTS (last 5, any type) ===");
  const events = await stripe.events.list({ limit: 5 });
  for (const e of events.data) {
    console.log(
      `- ${e.id}  type=${e.type}  created=${new Date(e.created * 1000).toISOString()}  ` +
        `livemode=${e.livemode}`
    );
  }
}

main().catch((err) => {
  console.error("Diagnostic failed:", err.message);
  process.exit(1);
});
