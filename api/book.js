// POST /api/book — create one booking.
// The server re-checks every field (never trust the browser), then inserts.
// If the slot or email is already used, the database's unique rules reject
// the insert. That's how two parents can never get the same slot.
import { db, uniqueViolation } from "../lib/db.js";
import { fail, json, readJson, route } from "../lib/http.js";
import { EVENT } from "../public/config.js";
import { configSlots, makeBookingCode, normalizeEmail } from "../public/js/utils.js";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const text = (v) => (typeof v === "string" ? v.trim() : "");

function validate(body) {
  const slot = configSlots().find((s) => s.id === body.slotId);
  const b = {
    parentName: text(body.parentName),
    email: normalizeEmail(body.email),
    phone: text(body.phone),
    members: Number(body.members),
    familyName: text(body.familyName),
    notes: text(body.notes),
  };
  if (!slot) return { error: "Please choose a time." };
  if (b.parentName.length < 2 || b.parentName.length > 100) return { error: "Please enter the parent/guardian's full name." };
  if (!EMAIL.test(b.email) || b.email.length > 254) return { error: "Please enter a valid email." };
  if (b.phone.replace(/\D/g, "").length < 7 || b.phone.length > 30) return { error: "Please enter a valid phone number." };
  if (!Number.isInteger(b.members) || b.members < 1 || b.members > EVENT.maxMembers) return { error: `Family members must be 1–${EVENT.maxMembers}.` };
  if (b.familyName.length > 60) return { error: "Family name is too long (60 characters max)." };
  if (b.notes.length > 200) return { error: "Notes can be at most 200 characters." };
  if (body.policy !== true) return { error: "Please confirm you understand there are no redos or makeup sessions." };
  return { slot, b };
}

export const POST = route(async (request) => {
  const { slot, b, error } = validate(await readJson(request));
  if (error) return fail(400, "invalid", error);

  const sql = await db();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeBookingCode();
    try {
      await sql`
        INSERT INTO bookings (code, slot_id, date, time, parent_name, email, phone, members, family_name, notes)
        VALUES (${code}, ${slot.id}, ${slot.date}, ${slot.time}, ${b.parentName}, ${b.email},
                ${b.phone}, ${b.members}, ${b.familyName}, ${b.notes})`;
      return json({ code }, 201);
    } catch (err) {
      const rule = uniqueViolation(err);
      if (rule === "bookings_one_per_slot") {
        return fail(409, "taken", "So sorry — another family just reserved that window. Please pick another time.");
      }
      if (rule === "bookings_one_per_email") {
        return fail(409, "duplicate", "This email already has a booking — each family may book one window.");
      }
      if (rule === "bookings_pkey") continue; // random code collided; try a new one
      throw err;
    }
  }
  throw new Error("Could not generate a unique booking code");
});
