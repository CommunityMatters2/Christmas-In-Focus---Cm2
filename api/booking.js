// GET /api/booking?code=CM2-XXXXXX — used by the confirmation page.
// Returns only what the page shows (no email or phone), because anyone who
// has the link can open it.
// If the booking is still waiting for payment, it asks Stripe directly, so the
// family sees "You're booked!" even if Stripe's webhook hasn't arrived yet.
import { db } from "../lib/db.js";
import { fail, json, route } from "../lib/http.js";
import { markPaid, stripe } from "../lib/stripe.js";
import { CODE_PATTERN, normalizeCode } from "../public/js/utils.js";

export const GET = route(async (request) => {
  const code = normalizeCode(new URL(request.url).searchParams.get("code"));
  if (!CODE_PATTERN.test(code)) return fail(404, "not_found", "Booking not found.");

  const sql = await db();
  let [row] = await sql`
    SELECT code, date, time, members, family_name, status, payment_status, amount_cents, stripe_session_id
    FROM bookings WHERE code = ${code}`;
  if (!row) return fail(404, "not_found", "Booking not found.");

  let checkoutUrl = null;
  if (row.status === "pending_payment" && row.stripe_session_id) {
    try {
      const session = await stripe().checkout.sessions.retrieve(row.stripe_session_id);
      if (session.status === "complete") {
        row = (await markPaid(sql, session)) ?? row;
      } else if (session.status === "open") {
        checkoutUrl = session.url; // let them finish paying
      }
    } catch (err) {
      console.error(err); // show the saved status; the webhook will catch up
    }
  }

  return json({
    booking: {
      code: row.code, date: row.date, time: row.time, members: row.members,
      familyName: row.family_name, status: row.status,
      paymentStatus: row.payment_status, amountCents: row.amount_cents,
    },
    checkoutUrl,
  });
});
