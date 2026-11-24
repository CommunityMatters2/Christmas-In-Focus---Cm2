// lib/http.js — small helpers every API route uses.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export function fail(status, error, message) {
  return json({ error, message }, status);
}

export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

// Wrap a route so unexpected errors become a clean 500 (details go to Vercel logs).
export function route(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      console.error(err);
      return fail(500, "server", "Something went wrong on our side. Please try again.");
    }
  };
}

// Database row (snake_case) → what the website uses (camelCase).
export function toBooking(row) {
  return {
    code: row.code,
    slotId: row.slot_id,
    date: row.date,
    time: row.time,
    parentName: row.parent_name,
    email: row.email,
    phone: row.phone,
    members: row.members,
    familyName: row.family_name,
    notes: row.notes,
    status: row.status,
    paymentStatus: row.payment_status,
    amountCents: row.amount_cents,
    paidAt: row.paid_at,
    familyEmailedAt: row.family_emailed_at,
    officeEmailedAt: row.office_emailed_at,
    emailError: row.email_error,
    createdAt: row.created_at,
    checkedInAt: row.checked_in_at,
    cancelledAt: row.cancelled_at,
  };
}
