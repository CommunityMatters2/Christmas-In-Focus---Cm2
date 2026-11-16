// /api/admin — everything staff do.
//   GET                                   → all bookings (must be logged in)
//   POST { action: "login", password }    → sets the login cookie
//   POST { action: "logout" }             → clears it
//   POST { action: "checkin", code }
//   POST { action: "cancel",  code }      → frees the slot + email automatically
//   POST { action: "notes",   code, notes }
import { db } from "../lib/db.js";
import { checkPassword, isAdmin, loginCookie, logoutCookie } from "../lib/auth.js";
import { fail, json, readJson, route, toBooking } from "../lib/http.js";
import { CODE_PATTERN, normalizeCode } from "../public/js/utils.js";

const notLoggedIn = () => fail(401, "unauthorized", "Please sign in.");

export const GET = route(async (request) => {
  if (!isAdmin(request)) return notLoggedIn();
  const sql = await db();
  const rows = await sql`SELECT * FROM bookings ORDER BY date, time, created_at`;
  return json({ bookings: rows.map(toBooking) });
});

export const POST = route(async (request) => {
  const body = await readJson(request);

  if (body.action === "login") {
    if (!checkPassword(body.password)) {
      await new Promise((r) => setTimeout(r, 800)); // slow down password guessing
      return fail(401, "bad_password", "That password isn't right.");
    }
    return json({ ok: true }, 200, { "set-cookie": loginCookie() });
  }

  if (body.action === "logout") {
    return json({ ok: true }, 200, { "set-cookie": logoutCookie() });
  }

  if (!isAdmin(request)) return notLoggedIn();

  const code = normalizeCode(body.code);
  if (!CODE_PATTERN.test(code)) return fail(400, "invalid", "Missing booking code.");
  const sql = await db();
  let rows;

  if (body.action === "checkin") {
    rows = await sql`
      UPDATE bookings SET status = 'checked_in', checked_in_at = now()
      WHERE code = ${code} AND status = 'booked' RETURNING *`;
  } else if (body.action === "cancel") {
    rows = await sql`
      UPDATE bookings SET status = 'cancelled', cancelled_at = now()
      WHERE code = ${code} AND status <> 'cancelled' RETURNING *`;
  } else if (body.action === "notes") {
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 200) : "";
    rows = await sql`UPDATE bookings SET notes = ${notes} WHERE code = ${code} RETURNING *`;
  } else {
    return fail(400, "invalid", "Unknown action.");
  }

  if (!rows.length) return fail(409, "no_change", "That booking couldn't be updated. It may have changed already. Refresh and try again.");
  return json({ booking: toBooking(rows[0]) });
});
