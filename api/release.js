// POST /api/release { code } — the family pressed "back" on Stripe's checkout page.
// Closes that checkout so it can't be paid any more, and frees the slot right away
// (instead of waiting 30 minutes for it to expire). Only affects unpaid holds.
import { db } from "../lib/db.js";
import { json, readJson, route } from "../lib/http.js";
import { releaseHold } from "../lib/stripe.js";
import { CODE_PATTERN, normalizeCode } from "../public/js/utils.js";

export const POST = route(async (request) => {
  const code = normalizeCode((await readJson(request)).code);
  if (!CODE_PATTERN.test(code)) return json({ released: false });

  const sql = await db();
  const [row] = await sql`
    SELECT stripe_session_id FROM bookings WHERE code = ${code} AND status = 'pending_payment'`;
  if (!row) return json({ released: false });
  return json({ released: await releaseHold(sql, code, row.stripe_session_id) });
});
