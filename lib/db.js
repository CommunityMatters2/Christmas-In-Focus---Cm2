// lib/db.js — connects to the Supabase Postgres database and creates the table
// the first time it's needed (so there's no separate "set up the database" step).
//
// Only ONE table: bookings. The list of slots comes from public/config.js.
// A slot is "taken" when it has a booking that isn't cancelled.
//
// DATABASE_URL = Supabase → Connect → "Transaction pooler" connection string
// (port 6543), which suits Vercel's short-lived serverless functions.
import postgres from "postgres";

let sql = null;
let schemaReady = null;

function getSql() {
  if (!sql) {
    const url = (process.env.DATABASE_URL || "").trim();
    if (!url) {
      throw new Error("DATABASE_URL is not set. Add the Supabase transaction-pooler connection string to your environment variables.");
    }
    // Check the shape ourselves so a bad value never gets printed (with its password) into the logs.
    if (!/^postgres(ql)?:\/\/[^\s]+@[^\s]+$/.test(url)) {
      throw new Error("DATABASE_URL looks wrong. It must start with postgresql:// (copy the full Supabase transaction-pooler URI).");
    }
    sql = postgres(url, {
      ssl: "require",
      prepare: false,   // required by Supabase's transaction pooler
      max: 1,           // one connection per serverless instance
      idle_timeout: 20,
    });
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
                    CONSTRAINT bookings_status_check
                    CHECK (status IN ('pending_payment', 'booked', 'checked_in', 'cancelled')),
      created_at    timestamptz NOT NULL DEFAULT now(),
      checked_in_at timestamptz,
      cancelled_at  timestamptz
    )`;

  // --- Stripe payments (added later; safe to run on an existing table) ---
  // pending_payment = the family is on Stripe's checkout page. The slot is HELD
  // (the unique rules below count it) until they pay or the checkout expires.
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_cents int`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_session_id text`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent text`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at timestamptz`;
  // Tables created before payments only allowed 3 statuses; widen that rule once.
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'bookings_status_check'
          AND pg_get_constraintdef(oid) LIKE '%pending_payment%'
      ) THEN
        ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
        ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
          CHECK (status IN ('pending_payment', 'booked', 'checked_in', 'cancelled'));
      END IF;
    END $$`;
  // These two rules are what make double-booking impossible: the database
  // itself rejects a 2nd active booking for the same slot or the same email.
  // Cancelled bookings don't count, so cancelling frees both.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_per_slot
    ON bookings (slot_id) WHERE status <> 'cancelled'`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_per_email
    ON bookings (email) WHERE status <> 'cancelled'`;

  // IMPORTANT for Supabase: its public "publishable/anon" key can read any table
  // that isn't locked down. Turning on Row Level Security with NO policies (and
  // revoking access) means only this server, using DATABASE_URL, can see bookings.
  await sql`ALTER TABLE bookings ENABLE ROW LEVEL SECURITY`;
  await sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE bookings FROM anon, authenticated;
      END IF;
    END $$`;
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
  const text = `${err.constraint_name ?? ""} ${err.constraint ?? ""} ${err.message ?? ""}`;
  for (const name of ["bookings_one_per_slot", "bookings_one_per_email", "bookings_pkey"]) {
    if (text.includes(name)) return name;
  }
  return "unknown";
}

// Families get 30 minutes on Stripe's checkout page (Stripe's minimum expiry).
// Holds older than this are released, even if Stripe's "expired" webhook never arrives.
// (The extra 5 minutes is a safety margin; Stripe can't take payment after 30.)
export async function releaseStaleHolds(sql) {
  await sql`
    UPDATE bookings SET status = 'cancelled', cancelled_at = now()
    WHERE status = 'pending_payment' AND created_at < now() - interval '35 minutes'`;
}
