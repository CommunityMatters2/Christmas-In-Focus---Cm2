// GET /api/slots — public availability. No personal info, only which slots are taken.
import { db } from "../lib/db.js";
import { json, route } from "../lib/http.js";
import { configSlots } from "../public/js/utils.js";

export const GET = route(async () => {
  const sql = await db();
  const rows = await sql`SELECT slot_id FROM bookings WHERE status <> 'cancelled'`;
  const taken = new Set(rows.map((r) => r.slot_id));
  return json({
    slots: configSlots().map((s) => ({ ...s, available: !taken.has(s.id) })),
  });
});
