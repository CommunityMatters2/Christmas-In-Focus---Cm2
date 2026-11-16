// confirm.js — runs confirm.html?code=CM2-XXXXXX.
// Fetches the booking summary from /api/booking (no email/phone is returned).
import { api } from "./api.js";
import { EVENT } from "../config.js";
import {
  STATUS_LABELS, buildIcs, downloadFile, escapeHtml, formatDate, formatTime,
} from "./utils.js";

const result = document.getElementById("result");

document.getElementById("footer").innerHTML = `
  <p>Questions? ${escapeHtml(EVENT.contact.phone)} ·
  <a href="mailto:${escapeHtml(EVENT.contact.email)}">${escapeHtml(EVENT.contact.email)}</a></p>`;

function showNotFound() {
  result.innerHTML = `
    <h2>We couldn't find that booking</h2>
    <p>Please check the link, or use <a href="lookup.html">Find my booking</a> with your code and email.</p>`;
}

async function load() {
  const code = new URLSearchParams(location.search).get("code");
  if (!code) return showNotFound();

  let b;
  try {
    ({ booking: b } = await api(`/api/booking?code=${encodeURIComponent(code)}`));
  } catch (err) {
    console.error(err);
    return showNotFound();
  }
  const cancelled = b.status === "cancelled";

  result.innerHTML = `
    <h2 class="center">${cancelled ? "This booking was cancelled" : "You're booked!"}</h2>
    ${cancelled ? `<p class="message error">This window has been released. Questions? Contact us below.</p>` : ""}
    <p class="center muted">Your booking code</p>
    <p class="booking-code">${escapeHtml(b.code)}</p>
    <dl class="details">
      <dt>Date</dt><dd>${escapeHtml(formatDate(b.date))}</dd>
      <dt>Time</dt><dd>${escapeHtml(formatTime(b.time))} (${EVENT.sessionMinutes} min)</dd>
      <dt>Location</dt><dd>${escapeHtml(EVENT.location)}</dd>
      ${b.familyName ? `<dt>Family</dt><dd>${escapeHtml(b.familyName)}</dd>` : ""}
      <dt>Members</dt><dd>${Number(b.members)}</dd>
      <dt>Status</dt><dd><span class="badge ${escapeHtml(b.status)}">${STATUS_LABELS[b.status] ?? escapeHtml(b.status)}</span></dd>
    </dl>
    ${cancelled ? "" : `
    <div class="btn-row no-print">
      <button type="button" class="btn" id="ics-btn">Add to calendar</button>
      <button type="button" class="btn secondary" id="save-btn">Save / screenshot this page</button>
    </div>
    <p class="muted no-print" style="font-size:.9rem">Tip: "Save" opens your print screen, where you can choose “Save as PDF”. A screenshot works too.</p>
    <h3>Before you come</h3>
    <ul class="reminders">
      <li>Arrive <strong>${EVENT.arriveEarlyMinutes} minutes early</strong>.</li>
      <li>Wear <strong>coordinated outfits</strong>.</li>
      <li>${EVENT.photosPerFamily} digital photos per family, up to ${EVENT.maxMembers} people.</li>
      <li><strong>${escapeHtml(EVENT.policy)}</strong>.</li>
    </ul>`}`;

  document.getElementById("ics-btn")?.addEventListener("click", () => {
    downloadFile(`christmas-in-focus-${b.code}.ics`, buildIcs(b), "text/calendar;charset=utf-8");
  });
  document.getElementById("save-btn")?.addEventListener("click", () => window.print());
}

load();
