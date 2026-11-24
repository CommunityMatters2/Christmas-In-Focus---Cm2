// admin.js — runs admin.html.
// Logs in through /api/admin (the server sets a secure cookie), then loads all
// bookings and refreshes them every 15 seconds. Every button calls the server;
// the server re-checks the login cookie on every request.
//
// Payments: families pay through the Stripe payment link in their email. Staff
// find the payment in Stripe (the booking code is its "client reference ID")
// and press "Mark paid" here.
import { api } from "./api.js";
import { EVENT } from "../config.js";
import {
  STATUS_LABELS, configSlots, dayLabel, downloadFile, escapeHtml, formatDate, formatMoney, formatTime, paymentLabel,
} from "./utils.js";

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 15000;
const allSlots = configSlots();

let bookings = [];
let timer = null;

const active = (b) => b.status !== "cancelled";

// ---------- views ----------
function show(view) {
  for (const id of ["loading-view", "login-view", "dash-view"]) $(id).hidden = id !== view;
}

function flash(text) {
  $("admin-message").textContent = text;
}

// ---------- data ----------
async function loadBookings() {
  try {
    let emailConfigured;
    ({ bookings, emailConfigured } = await api("/api/admin"));
    $("email-warning").textContent = emailConfigured ? "" :
      "Booking emails are OFF: RESEND_API_KEY isn't set in Vercel. Families are booked but get no email. Add the key, then redeploy.";
    show("dash-view");
    $("updated").textContent = `last updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
    render();
    if (!timer) timer = setInterval(() => { if (!document.hidden) loadBookings(); }, REFRESH_MS);
  } catch (err) {
    if (err.status === 401) {
      clearInterval(timer);
      timer = null;
      show("login-view");
    } else {
      show("dash-view");
      flash(`Couldn't load bookings: ${err.message}`);
    }
  }
}

// ---------- login / logout ----------
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";
  $("login-btn").disabled = true;
  try {
    await api("/api/admin", { method: "POST", body: { action: "login", password: $("admin-password").value } });
    $("admin-password").value = "";
    await loadBookings();
  } catch (err) {
    $("login-error").textContent = err.message;
  } finally {
    $("login-btn").disabled = false;
  }
});

$("logout-btn").addEventListener("click", async () => {
  await api("/api/admin", { method: "POST", body: { action: "logout" } }).catch(() => {});
  clearInterval(timer);
  timer = null;
  bookings = [];
  show("login-view");
});

$("refresh-btn").addEventListener("click", loadBookings);

// ---------- render ----------
function render() {
  renderSummary();
  renderTables();
}

function renderSummary() {
  const booked = bookings.filter(active);
  const paid = bookings.filter((b) => b.paymentStatus === "paid");
  const refunds = paid.filter((b) => b.status === "cancelled").length;
  const due = booked.filter((b) => b.paymentStatus !== "paid").length;
  const emailProblems = booked.filter((b) => b.emailError).length;
  const cards = [
    { num: booked.length, label: "Total booked" },
    { num: formatMoney(paid.reduce((sum, b) => sum + (b.amountCents || 0), 0)), label: `Marked paid (${paid.length})` },
    { num: due, label: "Waiting for payment" },
    ...(refunds ? [{ num: refunds, label: "Cancelled but paid: check refunds in Stripe" }] : []),
    ...(emailProblems ? [{ num: emailProblems, label: "Email problems: press Resend" }] : []),
    { num: allSlots.length - booked.length, label: `Slots left (of ${allSlots.length})` },
    ...EVENT.days.map((d) => ({
      num: booked.filter((b) => b.date === d.date).length,
      label: `Booked ${d.label}`,
    })),
  ];
  $("summary").innerHTML = cards.map((c) =>
    `<div class="stat"><span class="num">${c.num}</span><span class="label">${escapeHtml(c.label)}</span></div>`
  ).join("");
}

function matchesSearch(b, q) {
  if (!q) return true;
  return [b.parentName, b.familyName, b.code].some((v) => String(v || "").toLowerCase().includes(q));
}

function renderTables() {
  const q = $("search").value.trim().toLowerCase();
  const order = (a, b) => a.time.localeCompare(b.time) || (active(b) - active(a));

  $("day-tables").innerHTML = EVENT.days.map((day) => {
    const rows = bookings.filter((b) => b.date === day.date && matchesSearch(b, q)).sort(order);
    const body = rows.length ? rows.map(rowHtml).join("")
      : `<tr><td colspan="11" class="muted">${q ? "No matches." : "No bookings yet."}</td></tr>`;
    return `
      <section class="day-section" aria-label="${escapeHtml(formatDate(day.date))}">
        <h2>${escapeHtml(formatDate(day.date))}</h2>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th scope="col">Time</th><th scope="col">Family</th><th scope="col">Parent</th>
              <th scope="col">Phone</th><th scope="col">Email</th><th scope="col">Members</th>
              <th scope="col">Code</th><th scope="col">Status</th><th scope="col">Payment</th><th scope="col">Emails</th><th scope="col">Actions</th>
            </tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </section>`;
  }).join("");
}

function rowHtml(b) {
  const code = escapeHtml(b.code);
  const actions = [];
  if (b.status === "booked") actions.push(`<button class="btn small" data-action="checkin" data-code="${code}">Check in</button>`);
  if (b.status !== "cancelled") actions.push(`<button class="btn small danger" data-action="cancel" data-code="${code}">Cancel</button>`);
  actions.push(`<button class="btn small secondary" data-action="notes" data-code="${code}">Edit notes</button>`);

  const isPaid = b.paymentStatus === "paid";
  const payment = `<span class="badge ${isPaid ? "paid" : b.status === "cancelled" ? "" : "due"}">${escapeHtml(paymentLabel(b))}</span>
    ${b.status === "cancelled" && !isPaid ? "" : isPaid
      ? `<br><button class="btn small secondary" data-action="unpaid" data-code="${code}">Undo paid</button>`
      : `<br><button class="btn small" data-action="paid" data-code="${code}">Mark paid</button>`}`;

  const emailState = b.emailError
    ? `<span class="badge warn" title="${escapeHtml(b.emailError)}">⚠ Failed</span><br><small class="muted">${escapeHtml(b.emailError)}</small>`
    : b.familyEmailedAt && b.officeEmailedAt ? `<span class="badge paid">✓ Sent</span>`
    : `<span class="badge due">Not sent</span>`;
  const emails = `${emailState}${b.status === "cancelled" ? ""
    : `<br><button class="btn small secondary" data-action="resend" data-code="${code}">Resend</button>`}`;

  return `
    <tr class="${b.status === "cancelled" ? "is-cancelled" : ""}">
      <td>${escapeHtml(formatTime(b.time))}</td>
      <td>${escapeHtml(b.familyName || "—")}${b.notes ? `<br><small class="muted">Note: ${escapeHtml(b.notes)}</small>` : ""}</td>
      <td>${escapeHtml(b.parentName)}</td>
      <td><a href="tel:${escapeHtml(b.phone)}">${escapeHtml(b.phone)}</a></td>
      <td><a href="mailto:${escapeHtml(b.email)}">${escapeHtml(b.email)}</a></td>
      <td>${Number(b.members)}</td>
      <td><code>${code}</code></td>
      <td class="status-cell"><span class="badge ${escapeHtml(b.status)}">${STATUS_LABELS[b.status] ?? escapeHtml(b.status)}</span></td>
      <td class="status-cell">${payment}</td>
      <td class="status-cell">${emails}</td>
      <td class="actions">${actions.join("")}</td>
    </tr>`;
}

$("search").addEventListener("input", renderTables);

// ---------- actions ----------
$("day-tables").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const b = bookings.find((x) => x.code === btn.dataset.code);
  if (!b) return;
  const action = btn.dataset.action;
  const body = { action, code: b.code };

  if (action === "cancel") {
    const refund = b.paymentStatus === "paid"
      ? `\n\nThis does NOT refund the ${formatMoney(b.amountCents)}. To refund: Stripe → Payments → search ${b.code} → Refund.`
      : "";
    const ok = confirm(`Cancel ${b.code} (${b.parentName}, ${dayLabel(b.date)} ${formatTime(b.time)})?\nThis frees the slot for another family.${refund}`);
    if (!ok) return;
  }
  if (action === "unpaid" && !confirm(`Mark ${b.code} as NOT paid?`)) return;
  if (action === "resend" && !confirm(`Send the confirmation + payment link to ${b.email} again, and copy the office?`)) return;
  if (action === "notes") {
    const next = prompt(`Notes for ${b.code} (max 200 characters):`, b.notes || "");
    if (next === null) return;
    body.notes = next;
  }

  btn.disabled = true;
  try {
    await api("/api/admin", { method: "POST", body });
    flash({
      checkin: `${b.familyName || b.parentName} checked in.`,
      cancel: `${b.code} cancelled. The ${formatTime(b.time)} slot on ${dayLabel(b.date)} is open again.`,
      notes: `Notes updated for ${b.code}.`,
      paid: `${b.code} marked as paid.`,
      unpaid: `${b.code} marked as not paid.`,
      resend: `Emails sent again to ${b.email} and the office.`,
    }[action]);
  } catch (err) {
    flash(`That didn't save: ${err.message}`);
    if (err.status === 401) show("login-view");
  }
  await loadBookings();
});

// ---------- test email ----------
$("test-email-btn").addEventListener("click", async () => {
  const btn = $("test-email-btn");
  btn.disabled = true;
  try {
    const { to } = await api("/api/admin", { method: "POST", body: { action: "testemail" } });
    flash(`Test email sent to ${to}. Check that inbox (and spam).`);
  } catch (err) {
    flash(err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- CSV export ----------
$("export-btn").addEventListener("click", () => {
  const cols = ["code", "status", "payment", "amount", "date", "time", "familyName", "parentName", "phone", "email", "members", "notes", "emails", "createdAt"];
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheets running formulas
    return `"${s.replace(/"/g, '""')}"`;
  };
  const value = (b, c) => {
    if (c === "status") return STATUS_LABELS[b.status] ?? b.status;
    if (c === "payment") return paymentLabel(b);
    if (c === "amount") return b.paymentStatus === "paid" ? (b.amountCents / 100).toFixed(2) : "";
    if (c === "emails") return b.emailError ? `Failed: ${b.emailError}` : b.familyEmailedAt ? "Sent" : "Not sent";
    if (c === "createdAt") return b.createdAt ? new Date(b.createdAt).toLocaleString() : "";
    return b[c];
  };
  const sorted = [...bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const lines = [cols.join(",")].concat(sorted.map((b) => cols.map((c) => cell(value(b, c))).join(",")));
  const today = new Date().toISOString().slice(0, 10);
  downloadFile(`christmas-in-focus-bookings-${today}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
});

// ---------- print day sheet ----------
$("print-day").innerHTML = EVENT.days.map((d) =>
  `<option value="${d.date}">${escapeHtml(d.label)}</option>`).join("");

$("print-btn").addEventListener("click", () => {
  const date = $("print-day").value;
  const day = EVENT.days.find((d) => d.date === date);
  const rows = day.times.map((time) => {
    const b = bookings.find((x) => x.date === date && x.time === time && active(x));
    return `<tr>
      <td>${escapeHtml(formatTime(time))}</td>
      <td>${b ? escapeHtml(b.familyName || b.parentName) : "<em>open</em>"}</td>
      <td>${b ? escapeHtml(b.parentName) : ""}</td>
      <td>${b ? Number(b.members) : ""}</td>
      <td>${b ? escapeHtml(b.phone) : ""}</td>
      <td>${b ? escapeHtml(b.code) : ""}</td>
      <td>${b ? escapeHtml(b.notes || "") : ""}</td>
      <td>${b?.status === "checked_in" ? "✓" : "☐"}</td>
    </tr>`;
  }).join("");

  $("print-sheet").innerHTML = `
    <h2>Christmas in Focus — ${escapeHtml(formatDate(date))}</h2>
    <p>${escapeHtml(EVENT.location)} · ${EVENT.sessionMinutes}-min sessions · ${EVENT.photosPerFamily} photos per family</p>
    <table>
      <thead><tr><th>Time</th><th>Family</th><th>Parent</th><th>#</th><th>Phone</th><th>Code</th><th>Notes</th><th>In</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  document.body.classList.add("printing-sheet");
  window.print();
});
window.addEventListener("afterprint", () => document.body.classList.remove("printing-sheet"));

loadBookings();
