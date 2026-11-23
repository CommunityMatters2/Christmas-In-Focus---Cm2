// POST /api/stripe-webhook — Stripe's servers call this when a payment finishes
// or a checkout page expires. Every message is signed by Stripe; we check the
// signature with STRIPE_WEBHOOK_SECRET so nobody can fake a "paid" message.
//
// In Stripe → Developers → Webhooks, point an endpoint at
//   https://YOUR-SITE/api/stripe-webhook
// with these events:
//   checkout.session.completed
//   checkout.session.async_payment_succeeded
//   checkout.session.expired
import { db } from "../lib/db.js";
import { fail, json } from "../lib/http.js";
import { markPaid, stripe } from "../lib/stripe.js";

export async function POST(request) {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set.");
    return fail(500, "server", "Webhook not configured.");
  }

  let event;
  try {
    const body = await request.text(); // must be the raw text for the signature check
    event = await stripe().webhooks.constructEventAsync(body, request.headers.get("stripe-signature"), secret);
  } catch (err) {
    console.error("Stripe webhook signature check failed:", err.message);
    return fail(400, "bad_signature", "Invalid signature.");
  }

  try {
    const session = event.data.object;
    const code = session.client_reference_id || session.metadata?.code;
    const sql = await db();

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await markPaid(sql, session);
    } else if (event.type === "checkout.session.expired" && code) {
      await sql`
        UPDATE bookings SET status = 'cancelled', cancelled_at = now()
        WHERE code = ${code} AND stripe_session_id = ${session.id} AND status = 'pending_payment'`;
    }
    return json({ received: true });
  } catch (err) {
    console.error(err);
    return fail(500, "server", "Webhook handling failed."); // Stripe will retry
  }
}
