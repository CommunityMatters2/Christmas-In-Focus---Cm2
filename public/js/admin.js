// admin.js — runs admin.html.
// Logs in through /api/admin (the server sets a secure cookie), then loads all
// bookings and refreshes them every 15 seconds. Every button calls the server;
// the server re-checks the login cookie on every request.
import { api } from "./api.js";
import { EVENT } from "../config.js";
import {
  STATUS_LABELS, configSlots, dayLabel, downloadFile, escapeHtml, formatDate, formatTime,
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
    ({ bookings } = await api("/api/admin"));
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
  const cards = [
    { num: booked.length, label: "Total booked" },
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
      : `<tr><td colspan="9" class="muted">${q ? "No matches." : "No bookings yet."}</td></tr>`;
    return `
      <section class="day-section" aria-label="${escapeHtml(formatDate(day.date))}">
        <h2>${escapeHtml(formatDate(day.date))}</h2>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th scope="col">Time</th><th scope="col">Family</th><th scope="col">Parent</th>
              <th scope="col">Phone</th><th scope="col">Email</th><th scope="col">Members</th>
              <th scope="col">Code</th><th scope="col">Status</th><th scope="col">Actions</th>
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
    const ok = confirm(`Cancel ${b.code} (${b.parentName}, ${dayLabel(b.date)} ${formatTime(b.time)})?\nThis frees the slot for another family.`);
    if (!ok) return;
  }
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
    }[action]);
  } catch (err) {
    flash(`That didn't save: ${err.message}`);
    if (err.status === 401) show("login-view");
  }
  await loadBookings();
});

// ---------- CSV export ----------
$("export-btn").addEventListener("click", () => {
  const cols = ["code", "status", "date", "time", "familyName", "parentName", "phone", "email", "members", "notes", "createdAt"];
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheets running formulas
    return `"${s.replace(/"/g, '""')}"`;
  };
  const value = (b, c) => {
    if (c === "status") return STATUS_LABELS[b.status] ?? b.status;
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
