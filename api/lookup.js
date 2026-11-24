// POST /api/lookup { code, email } — "Find my booking".
// The server only returns the booking when BOTH match, and gives the same
// answer for "wrong code" and "wrong email" so nothing leaks.
import { db } from "../lib/db.js";
import { fail, json, readJson, route, toBooking } from "../lib/http.js";
import { CODE_PATTERN, normalizeCode, normalizeEmail } from "../public/js/utils.js";

const NOT_FOUND = "We couldn't find a booking with that code and email. Please check both and try again.";

export const POST = route(async (request) => {
  const body = await readJson(request);
  const code = normalizeCode(body.code);
  const email = normalizeEmail(body.email);
  if (!CODE_PATTERN.test(code) || !email) return fail(404, "not_found", NOT_FOUND);

  const sql = await db();
  const [row] = await sql`SELECT * FROM bookings WHERE code = ${code} AND email = ${email}`;
  if (!row) return fail(404, "not_found", NOT_FOUND);

  // Staff notes and email delivery details stay internal.
  const { notes, emailError, familyEmailedAt, officeEmailedAt, ...booking } = toBooking(row);
  return json({ booking });
});
