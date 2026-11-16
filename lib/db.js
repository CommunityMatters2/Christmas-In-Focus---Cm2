// lib/db.js — connects to the Neon Postgres database and creates the table
// the first time it's needed (so there's no separate "set up the database" step).
//
// Only ONE table: bookings. The list of slots comes from public/config.js.
// A slot is "taken" when it has a booking that isn't cancelled.
import { neon } from "@neondatabase/serverless";

let sql = null;
let schemaReady = null;

function getSql() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set. Connect a Neon database in Vercel, then run `vercel env pull .env.local`.");
    }
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS bookings (
      code          text PRIMARY KEY,
      slot_id       text NOT NULL,
      date          text NOT NULL,
      time          text NOT NULL,
      parent_name   text NOT NULL,
      email         text NOT NULL,
      phone         text NOT NULL,
      members       int  NOT NULL CHECK (members BETWEEN 1 AND 20),
      family_name   text NOT NULL DEFAULT '',
      notes         text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 200),
      status        text NOT NULL DEFAULT 'booked'
                    CHECK (status IN ('booked', 'checked_in', 'cancelled')),
      created_at    timestamptz NOT NULL DEFAULT now(),
      checked_in_at timestamptz,
      cancelled_at  timestamptz
    )`;
  // These two rules are what make double-booking impossible: the database
  // itself rejects a 2nd active booking for the same slot or the same email.
  // Cancelled bookings don't count, so cancelling frees both.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_per_slot
    ON bookings (slot_id) WHERE status <> 'cancelled'`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_per_email
    ON bookings (email) WHERE status <> 'cancelled'`;
}

// Use this in every API route: `const sql = await db();`
export async function db() {
  const s = getSql();
  if (!schemaReady) {
    schemaReady = ensureSchema(s).catch((err) => { schemaReady = null; throw err; });
  }
  await schemaReady;
  return s;
}

// Did this error come from one of our unique rules? Returns its name, or null.
export function uniqueViolation(err) {
  if (err?.code !== "23505") return null;
  const text = `${err.constraint ?? ""} ${err.message ?? ""}`;
  for (const name of ["bookings_one_per_slot", "bookings_one_per_email", "bookings_pkey"]) {
    if (text.includes(name)) return name;
  }
  return "unknown";
}
