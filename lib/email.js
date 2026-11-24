// lib/email.js — sends the two booking emails through Resend (resend.com).
//
//   1. To the FAMILY:  "You're booked!" + details + the $20 Stripe payment link
//                      + a calendar invite (.ics) attached.
//   2. To the OFFICE:  "New booking" + every detail staff need + confirmation
//                      that the payment link went to the family.
//
// Env vars (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY   re_...  (Resend → API Keys)
//   EMAIL_FROM       optional; defaults to  CM2 Christmas in Focus <bookings@communitymatters2.org>
//                    (communitymatters2.org is verified in Resend → Domains, which
//                    is what lets us email any family).
//   OFFICE_EMAIL     optional; defaults to the contact email in public/config.js
//   SITE_URL         optional; e.g. https://christmasinfocuscm2.vercel.app
//
// A failed email never cancels a booking. The result is saved on the booking
// (family_emailed_at / office_emailed_at / email_error) and staff can press
// "Resend emails" on the admin page.
import { EVENT } from "../public/config.js";
import { buildIcs, escapeHtml, formatDate, formatMoney, formatTime, paymentUrl } from "../public/js/utils.js";

const DEFAULT_SENDER = "CM2 Christmas in Focus <bookings@communitymatters2.org>";

export function emailConfigured() {
  return /^re_/.test((process.env.RESEND_API_KEY || "").trim());
}

function sender() {
  return (process.env.EMAIL_FROM || "").trim() || DEFAULT_SENDER;
}

function officeEmail() {
  return (process.env.OFFICE_EMAIL || EVENT.contact.email).trim();
}

export function siteUrl(request) {
  const fromEnv = (process.env.SITE_URL || "").trim();
  return (fromEnv || (request ? new URL(request.url).origin : "")).replace(/\/+$/, "");
}

async function send(message, idempotencyKey) {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!emailConfigured()) throw new Error("RESEND_API_KEY is not set (it should start with re_).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: sender(), ...message }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Resend ${res.status}: ${body.message || body.name || "send failed"}`);
  }
  return res.json();
}

// ---------- the booking as plain values ----------
function view(row, base) {
  const name = row.family_name ? `${row.family_name} family` : row.parent_name;
  return {
    code: row.code,
    name,
    parentName: row.parent_name,
    email: row.email,
    phone: row.phone,
    members: row.members,
    notes: row.notes,
    when: `${formatDate(row.date)} at ${formatTime(row.time)}`,
    shortWhen: `${formatDate(row.date).replace(/, \d{4}$/, "")}, ${formatTime(row.time)}`,
    price: formatMoney(row.amount_cents ?? EVENT.priceCents),
    payUrl: paymentUrl(row.code, row.email),
    confirmUrl: `${base}/confirm.html?code=${encodeURIComponent(row.code)}`,
    lookupUrl: `${base}/lookup.html`,
    adminUrl: `${base}/admin.html`,
    logoUrl: `${base}/assets/logo.png`,
  };
}

// ---------- shared HTML pieces (email-safe: tables + inline styles) ----------
const C = { navy: "#172036", ivory: "#F6EFE2", gold: "#C9A86A", cranberry: "#8E2C3B", evergreen: "#2F5444", card: "#FFFBF4", muted: "#4a5163" };
const e = escapeHtml;

function shell({ preheader, eyebrow, title, body, logoUrl }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${e(title)}</title></head>
<body style="margin:0;padding:0;background:${C.ivory};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ivory};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.gold};border-radius:14px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;color:${C.navy};">
    <tr><td align="center" style="background:${C.navy};padding:28px 20px 22px;">
      <img src="${e(logoUrl)}" width="64" height="64" alt="CM2" style="display:block;border-radius:50%;background:${C.ivory};">
      <p style="margin:14px 0 4px;font:600 11px/1.4 Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:${C.gold};">${e(eyebrow)}</p>
      <h1 style="margin:0;font:600 28px/1.2 Georgia,serif;color:${C.ivory};">Christmas <em style="color:${C.gold};font-weight:400;">in Focus</em></h1>
      <p style="margin:10px 0 0;font:16px/1 Arial,sans-serif;letter-spacing:6px;color:${C.gold};">&#10052; &#10022; &#10052;</p>
    </td></tr>
    <tr><td style="height:6px;background:${C.cranberry};border-top:2px solid ${C.gold};"></td></tr>
    <tr><td style="padding:28px 26px 8px;font:16px/1.55 Arial,Helvetica,sans-serif;color:${C.navy};">
      <h2 style="margin:0 0 14px;font:600 22px/1.3 Georgia,serif;color:${C.navy};">${e(title)}</h2>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 26px 26px;font:13px/1.5 Arial,sans-serif;color:${C.muted};border-top:1px solid #eadfca;" align="center">
      ${e(EVENT.org)}${EVENT.contact.phone && !EVENT.contact.phone.startsWith("[") ? ` · ${e(EVENT.contact.phone)}` : ""}<br>
      <a href="mailto:${e(EVENT.contact.email)}" style="color:${C.cranberry};">${e(EVENT.contact.email)}</a>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function detailsTable(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border:1px solid ${C.gold};border-radius:10px;background:#fff;">
  ${rows.filter(Boolean).map(([k, v], i) => `<tr>
    <td style="padding:10px 14px;font:14px Arial,sans-serif;color:${C.muted};white-space:nowrap;vertical-align:top;${i ? "border-top:1px solid #f0e8d8;" : ""}">${e(k)}</td>
    <td style="padding:10px 14px;font:600 15px Arial,sans-serif;color:${C.navy};${i ? "border-top:1px solid #f0e8d8;" : ""}">${v}</td>
  </tr>`).join("")}
</table>`;
}

function button(href, label, color = C.cranberry) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 18px;"><tr>
  <td align="center" bgcolor="${color}" style="border-radius:999px;">
    <a href="${e(href)}" style="display:inline-block;padding:14px 30px;font:600 17px Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:999px;">${label}</a>
  </td></tr></table>`;
}

const venue = () => (EVENT.location && !EVENT.location.startsWith("[") ? EVENT.location : "");

// ---------- email 1: the family ----------
function familyEmail(v) {
  const body = `
    <p style="margin:0 0 14px;">Hi ${e(v.parentName)},</p>
    <p style="margin:0 0 18px;">Your holiday family portrait window is reserved. We can't wait to see you! &#127876;</p>
    <p style="margin:0 0 6px;text-align:center;font:12px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${C.muted};">Your booking code</p>
    <p style="margin:0 0 18px;text-align:center;font:600 28px/1.2 Georgia,serif;letter-spacing:3px;color:${C.navy};background:${C.ivory};border:1px dashed ${C.gold};border-radius:10px;padding:12px;">${e(v.code)}</p>
    ${detailsTable([
      ["Date & time", e(v.when)],
      ["Session", `${EVENT.sessionMinutes} minutes`],
      venue() && ["Location", e(venue())],
      ["Family members", String(Number(v.members))],
      ["Amount due", e(v.price)],
    ])}
    <div style="background:#fbf1dc;border:1px solid ${C.gold};border-radius:10px;padding:16px 16px 4px;margin:0 0 18px;">
      <p style="margin:0 0 6px;font-weight:700;color:${C.navy};">Please complete your ${e(v.price)} payment</p>
      <p style="margin:0 0 4px;font-size:14px;color:${C.muted};">Pay securely through Stripe. Our office will confirm your payment.</p>
      ${button(v.payUrl, `Pay ${e(v.price)} now &rarr;`)}
    </div>
    <h3 style="margin:0 0 8px;font:600 17px Georgia,serif;color:${C.navy};">Before you come</h3>
    <ul style="margin:0 0 18px;padding-left:20px;">
      <li style="margin-bottom:6px;">Arrive <strong>${EVENT.arriveEarlyMinutes} minutes early</strong>.</li>
      <li style="margin-bottom:6px;">Wear <strong>coordinated outfits</strong>.</li>
      <li style="margin-bottom:6px;">${EVENT.photosPerFamily} digital photos per family, up to ${EVENT.maxMembers} people.</li>
      <li style="margin-bottom:6px;"><strong>${e(EVENT.policy)}</strong>.</li>
    </ul>
    <p style="margin:0 0 8px;font-size:14px;color:${C.muted};">A calendar invite is attached. You can view your booking any time at
      <a href="${e(v.confirmUrl)}" style="color:${C.cranberry};">your confirmation page</a>.</p>
    <p style="margin:0 0 4px;font-size:14px;color:${C.muted};">Need to change something? Just reply to this email.</p>
    <p style="margin:18px 0 0;">Warm wishes,<br><strong>The CM2 team</strong></p>`;

  const text = [
    `Hi ${v.parentName},`, "",
    "Your Christmas in Focus family portrait window is reserved.", "",
    `Booking code: ${v.code}`,
    `Date & time: ${v.when}`,
    `Session: ${EVENT.sessionMinutes} minutes`,
    venue() ? `Location: ${venue()}` : null,
    `Family members: ${v.members}`,
    `Amount due: ${v.price}`, "",
    `Please complete your payment here: ${v.payUrl}`, "",
    `Arrive ${EVENT.arriveEarlyMinutes} minutes early in coordinated outfits. ${EVENT.policy}.`,
    `Your booking: ${v.confirmUrl}`, "",
    "Need to change something? Just reply to this email.",
    "— The CM2 team",
  ].filter((l) => l !== null).join("\n");

  return {
    subject: `You're booked! Christmas in Focus · ${v.shortWhen} (${v.code})`,
    html: shell({ preheader: `${v.when} · code ${v.code} · ${v.price} payment link inside`, eyebrow: "Booking confirmed", title: "You're booked!", body, logoUrl: v.logoUrl }),
    text,
  };
}

// ---------- email 2: the office ----------
function officeEmailContent(v, familySent) {
  const sentLine = familySent
    ? `<p style="margin:0 0 18px;padding:12px 14px;background:#e4ede8;border:1px solid #a9c2b5;border-radius:10px;color:#1f3a2e;">&#10003; Confirmation and <strong>${e(v.price)} payment link</strong> sent to ${e(v.email)}.</p>`
    : `<p style="margin:0 0 18px;padding:12px 14px;background:#f6e3e6;border:1px solid #d9a5ae;border-radius:10px;color:#6d1e2b;">&#9888; The confirmation email to the family <strong>could not be sent</strong>. Please send them the payment link: <a href="${e(v.payUrl)}" style="color:#6d1e2b;">${e(v.payUrl)}</a></p>`;
  const body = `
    <p style="margin:0 0 16px;">A new family has booked a portrait window.</p>
    ${sentLine}
    ${detailsTable([
      ["Code", `<span style="font-family:Georgia,serif;letter-spacing:1px;">${e(v.code)}</span>`],
      ["Date & time", e(v.when)],
      ["Family", e(v.name)],
      ["Parent / guardian", e(v.parentName)],
      ["Email", `<a href="mailto:${e(v.email)}" style="color:${C.cranberry};">${e(v.email)}</a>`],
      ["Phone", `<a href="tel:${e(v.phone)}" style="color:${C.cranberry};">${e(v.phone)}</a>`],
      ["Members", String(Number(v.members))],
      v.notes && ["Notes", e(v.notes)],
      ["Payment", `${e(v.price)} due (via Stripe link)`],
    ])}
    <p style="margin:0 0 8px;font-size:14px;color:${C.muted};"><strong>To confirm payment:</strong> in Stripe → Payments, look for a ${e(v.price)} payment from ${e(v.email)}
      (the booking code <strong>${e(v.code)}</strong> is saved as its client reference ID). Then press <strong>Mark paid</strong> on the staff dashboard.</p>
    ${button(v.adminUrl, "Open staff dashboard", C.navy)}
    <p style="margin:0;font-size:13px;color:${C.muted};">Replying to this email replies to the family.</p>`;

  return {
    subject: `New booking: ${v.name} · ${v.shortWhen} · ${v.code}`,
    html: shell({ preheader: `${v.parentName} · ${v.when} · ${v.members} people`, eyebrow: "Staff notification", title: "New booking", body, logoUrl: v.logoUrl }),
    text: [
      "New Christmas in Focus booking", "",
      `Code: ${v.code}`, `Date & time: ${v.when}`, `Family: ${v.name}`, `Parent: ${v.parentName}`,
      `Email: ${v.email}`, `Phone: ${v.phone}`, `Members: ${v.members}`, ...(v.notes ? [`Notes: ${v.notes}`] : []),
      `Payment: ${v.price} due. Payment link ${familySent ? "sent to the family" : "NOT sent (family email failed)"}: ${v.payUrl}`, "",
      `Staff dashboard: ${v.adminUrl}`,
    ].join("\n"),
  };
}

// Calendar booking shape expected by buildIcs (camelCase).
const icsFor = (row) => buildIcs({ code: row.code, date: row.date, time: row.time, members: row.members });

// Send both emails for one booking and record the outcome on the row.
// `firstSend` adds idempotency keys so a retried request can't send duplicates.
export async function sendBookingEmails(sql, row, request, { firstSend = false } = {}) {
  const v = view(row, siteUrl(request));
  const errors = [];

  let familySent = false;
  try {
    const m = familyEmail(v);
    await send({
      to: [row.email],
      reply_to: officeEmail(),
      subject: m.subject, html: m.html, text: m.text,
      attachments: [{ filename: `christmas-in-focus-${row.code}.ics`, content: Buffer.from(icsFor(row)).toString("base64") }],
    }, firstSend ? `booking-${row.code}-family` : undefined);
    familySent = true;
  } catch (err) {
    console.error(`Family email for ${row.code} failed:`, err.message);
    errors.push(`Family: ${err.message}`);
  }

  let officeSent = false;
  try {
    const m = officeEmailContent(v, familySent);
    await send({ to: [officeEmail()], reply_to: row.email, subject: m.subject, html: m.html, text: m.text },
      firstSend ? `booking-${row.code}-office` : undefined);
    officeSent = true;
  } catch (err) {
    console.error(`Office email for ${row.code} failed:`, err.message);
    errors.push(`Office: ${err.message}`);
  }

  const [updated] = await sql`
    UPDATE bookings SET
      family_emailed_at = CASE WHEN ${familySent} THEN now() ELSE family_emailed_at END,
      office_emailed_at = CASE WHEN ${officeSent} THEN now() ELSE office_emailed_at END,
      email_error = ${errors.length ? errors.join(" | ").slice(0, 500) : null}
    WHERE code = ${row.code} RETURNING *`;
  return { familySent, officeSent, row: updated ?? row };
}

// Staff "Send test email" button: proves Resend + the sender address work.
export async function sendTestEmail(request) {
  const base = siteUrl(request);
  const body = `<p style="margin:0 0 14px;">This is a test from the Christmas in Focus booking site. If you can read this, booking emails to the office are working. &#127873;</p>
    <p style="margin:0 0 14px;font-size:14px;color:${C.muted};">Sent from: ${e(sender())}</p>`;
  await send({
    to: [officeEmail()],
    subject: "Test: Christmas in Focus booking emails",
    html: shell({ preheader: "Booking emails are working", eyebrow: "Test email", title: "It works!", body, logoUrl: `${base}/assets/logo.png` }),
    text: "This is a test from the Christmas in Focus booking site. Booking emails to the office are working.",
  });
  return officeEmail();
}
