// lib/stripe.js — everything that talks to Stripe.
//
// How a paid booking works:
//   1. /api/book saves the booking as `pending_payment` (this HOLDS the slot),
//      creates a Stripe Checkout page for $20, and sends the family there.
//   2. The family pays on Stripe's own page (card details never touch our site).
//   3. Stripe tells us it's paid in two ways, and either one is enough:
//        • the webhook (/api/stripe-webhook), sent by Stripe's servers, and
//        • the confirmation page, which asks /api/booking, which checks with Stripe.
//      Either way, markPaid() turns the booking into `booked`.
//   4. If they don't pay within 30 minutes, the checkout expires and the slot is freed.
//
// Env vars (Vercel → Settings → Environment Variables):
//   STRIPE_SECRET_KEY      sk_test_... (sandbox) or sk_live_... (real money)
//   STRIPE_WEBHOOK_SECRET  whsec_...  from the webhook endpoint you create in Stripe
import Stripe from "stripe";
import { EVENT } from "../public/config.js";
import { formatDate, formatTime } from "../public/js/utils.js";
import { uniqueViolation } from "./db.js";

let client = null;

export function stripe() {
  if (!client) {
    const key = (process.env.STRIPE_SECRET_KEY || "").trim();
    if (!/^(sk|rk)_(test|live)_/.test(key)) {
      throw new Error("STRIPE_SECRET_KEY is missing or wrong. It must start with sk_test_ or sk_live_.");
    }
    client = new Stripe(key);
  }
  return client;
}

// The site's address, e.g. https://book.cm2.org. SITE_URL wins if set;
// otherwise use the address the request came in on.
function siteUrl(request) {
  return (process.env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, "");
}

// Hosted Stripe Checkout page for one booking. Returns the Stripe session.
export async function createCheckout(request, { code, slot, email, parentName, members }) {
  const base = siteUrl(request);
  const when = `${formatDate(slot.date)} at ${formatTime(slot.time)}`;
  return stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    client_reference_id: code,
    metadata: { code, slot_id: slot.id },
    payment_intent_data: {
      description: `Christmas in Focus ${code} — ${when}`,
      metadata: { code, slot_id: slot.id, parent_name: parentName },
    },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: EVENT.currency,
        unit_amount: EVENT.priceCents,
        product_data: {
          name: "Christmas in Focus – Family Portrait Session",
          description: `${when} · ${EVENT.sessionMinutes} min · up to ${members} family member${members === 1 ? "" : "s"} · booking ${code}`,
        },
      },
    }],
    // Stripe requires at least 30 minutes; 31 leaves room for clock/network delay.
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    success_url: `${base}/confirm.html?code=${encodeURIComponent(code)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/index.html?cancelled=${encodeURIComponent(code)}`,
  });
}

// Record a completed payment. Safe to call more than once for the same session.
export async function markPaid(sql, session) {
  if (session.payment_status !== "paid") return null;
  const code = session.client_reference_id || session.metadata?.code;
  if (!code) return null;
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  // Already recorded (Stripe retries webhooks, and the confirmation page checks too).
  // Returning early also means a booking staff cancelled later is never revived.
  const [existing] = await sql`
    SELECT * FROM bookings WHERE code = ${code} AND stripe_session_id = ${session.id}`;
  if (!existing || existing.payment_status === "paid") return existing ?? null;

  const [row] = await sql`
    UPDATE bookings SET
      payment_status = 'paid',
      paid_at = now(),
      amount_cents = ${session.amount_total},
      stripe_payment_intent = ${intent},
      status = CASE WHEN status = 'pending_payment' THEN 'booked' ELSE status END
    WHERE code = ${code} AND stripe_session_id = ${session.id}
    RETURNING *`;
  if (!row || row.status !== "cancelled") return row ?? null;

  // Rare: the hold had already been released (e.g. the payment landed in the last
  // seconds). Give the family their slot back if nobody else has taken it.
  try {
    const [revived] = await sql`
      UPDATE bookings SET status = 'booked', cancelled_at = NULL
      WHERE code = ${code} AND status = 'cancelled' RETURNING *`;
    return revived ?? row;
  } catch (err) {
    if (!uniqueViolation(err)) throw err;
    // Slot or email is taken by someone else now. It stays "Cancelled · Paid";
    // the admin page flags it so staff can refund it in Stripe.
    console.error(`Booking ${code} was paid after its hold was released. Refund needed.`);
    return row;
  }
}

// Close an unpaid checkout page so it can't be paid any more, then release the hold.
// Returns true if the hold was released, false if it was already paid.
export async function releaseHold(sql, code, sessionId) {
  if (sessionId) {
    try {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      if (session.status === "complete") {
        await markPaid(sql, session);
        return false;
      }
      if (session.status === "open") await stripe().checkout.sessions.expire(sessionId);
    } catch (err) {
      // If Stripe can't be reached we must NOT release: the family might be paying.
      console.error(err);
      return false;
    }
  }
  await sql`
    UPDATE bookings SET status = 'cancelled', cancelled_at = now()
    WHERE code = ${code} AND status = 'pending_payment'`;
  return true;
}
