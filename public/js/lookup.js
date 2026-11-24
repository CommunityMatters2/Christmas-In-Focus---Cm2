// lookup.js — runs lookup.html.
// Sends code + email to /api/lookup. The SERVER checks both match, so the
// page never receives another family's details.
import { api } from "./api.js";
import { EVENT } from "../config.js";
import {
  STATUS_LABELS, escapeHtml, filled, footerHtml, formatDate, formatTime, paymentLabel, paymentUrl,
} from "./utils.js";

const $ = (id) => document.getElementById(id);

$("footer").innerHTML = footerHtml();

$("lookup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("lookup-error").textContent = "";
  $("lookup-result").hidden = true;
  $("lookup-btn").disabled = true;

  try {
    const { booking: b } = await api("/api/lookup", {
      method: "POST",
      body: { code: $("code").value, email: $("email").value },
    });
    $("lookup-result").innerHTML = `
      <h2>${escapeHtml(b.familyName || b.parentName)}</h2>
      <dl class="details">
        <dt>Code</dt><dd>${escapeHtml(b.code)}</dd>
        <dt>Status</dt><dd><span class="badge ${escapeHtml(b.status)}">${STATUS_LABELS[b.status] ?? escapeHtml(b.status)}</span></dd>
        <dt>Date</dt><dd>${escapeHtml(formatDate(b.date))}</dd>
        <dt>Time</dt><dd>${escapeHtml(formatTime(b.time))}</dd>
        ${filled(EVENT.location) ? `<dt>Location</dt><dd>${escapeHtml(EVENT.location)}</dd>` : ""}
        <dt>Members</dt><dd>${Number(b.members)}</dd>
        <dt>Payment</dt><dd>${escapeHtml(paymentLabel(b))}</dd>
        <dt>Parent</dt><dd>${escapeHtml(b.parentName)}</dd>
        <dt>Phone</dt><dd>${escapeHtml(b.phone)}</dd>
      </dl>
      ${b.status === "cancelled" ? "" : `
      <div class="btn-row">
        ${b.paymentStatus === "paid" ? "" : `<a class="btn cta" href="${escapeHtml(paymentUrl(b.code, b.email))}" target="_blank" rel="noopener">Pay now →</a>`}
        <a class="btn secondary" href="confirm.html?code=${encodeURIComponent(b.code)}">Open confirmation &amp; calendar</a>
      </div>`}`;
    $("lookup-result").hidden = false;
  } catch (err) {
    $("lookup-error").textContent = err.message;
  } finally {
    $("lookup-btn").disabled = false;
  }
});
