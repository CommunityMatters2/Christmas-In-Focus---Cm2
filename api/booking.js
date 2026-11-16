// GET /api/booking?code=CM2-XXXXXX — used by the confirmation page.
// Returns only what the page shows (no email or phone), because anyone who
// has the link can open it.
import { db } from "../lib/db.js";
import { fail, json, route } from "../lib/http.js";
import { CODE_PATTERN, normalizeCode } from "../public/js/utils.js";

export const GET = route(async (request) => {
  const code = normalizeCode(new URL(request.url).searchParams.get("code"));
  if (!CODE_PATTERN.test(code)) return fail(404, "not_found", "Booking not found.");

  const sql = await db();
  const [row] = await sql`
    SELECT code, date, time, members, family_name, status FROM bookings WHERE code = ${code}`;
  if (!row) return fail(404, "not_found", "Booking not found.");

  return json({
    booking: {
      code: row.code, date: row.date, time: row.time, members: row.members,
      familyName: row.family_name, status: row.status,
    },
  });
});
