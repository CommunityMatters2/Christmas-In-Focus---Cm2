// confirm.js — runs confirm.html?code=CM2-XXXXXX.
// Fetches the booking summary from /api/booking (no email/phone is returned).
// Straight after booking (?new=1) it plays a celebration and tells the family
// their confirmation + payment link have been emailed.
import { api } from "./api.js";
import { EVENT } from "../config.js";
import { celebrate } from "./festive.js";
import {
  STATUS_LABELS, buildIcs, downloadFile, escapeHtml, filled, footerHtml, formatDate, formatMoney,
  formatTime, paymentUrl, policiesHtml,
} from "./utils.js";

const result = document.getElementById("result");
const params = new URLSearchParams(location.search);
document.getElementById("footer").innerHTML = footerHtml();

function showNotFound() {
  result.innerHTML = `
    <h2>We couldn't find that booking</h2>
    <p>Please check the link, or use <a href="lookup.html">Find my booking</a> with your code and email.</p>`;
}

function paymentBox(b) {
  const amount = escapeHtml(formatMoney(b.amountCents ?? EVENT.priceCents));
  if (b.paymentStatus === "paid") {
    return `<div class="pay-box paid"><h3>✓ Payment received</h3><p style="margin:0">Thank you! ${amount} paid.</p></div>`;
  }
  return `
    <div class="pay-box">
      <h3>Please complete your ${amount} payment</h3>
      <p><strong>Your window isn't secured until you pay.</strong> Unpaid windows may be given to another family.</p>
      <p>Pay securely through Stripe. Payment is non-refundable. Our office will confirm your payment by email or phone.</p>
      <a class="btn cta block" href="${escapeHtml(paymentUrl(b.code))}" target="_blank" rel="noopener">Pay ${amount} now →</a>
    </div>`;
}

async function load() {
  const code = params.get("code");
  if (!code) return showNotFound();

  let b;
  try {
    ({ booking: b } = await api(`/api/booking?code=${encodeURIComponent(code)}`));
  } catch (err) {
    console.error(err);
    return showNotFound();
  }
  const cancelled = b.status === "cancelled";
  const justBooked = params.get("new") === "1" && !cancelled;

  const emailNote = b.emailed
    ? `<p class="email-note"><span aria-hidden="true">✉️</span><span>We've emailed your confirmation and payment link. Can't find it? Check your spam or promotions folder.</span></p>`
    : `<p class="email-note"><span aria-hidden="true">✉️</span><span>Please save this page. Our office will also send you the payment link.</span></p>`;

  result.innerHTML = `
    ${cancelled ? "" : `<span class="celebrate-icon" aria-hidden="true">🎄</span>`}
    <h2 class="center">${cancelled ? "This booking was cancelled" : "You're booked!"}</h2>
    ${cancelled ? `<p class="message error">This window has been released. Questions? Contact us below.</p>` : ""}
    <p class="center muted">Your booking code</p>
    <p class="booking-code">${escapeHtml(b.code)}</p>
    <dl class="details">
      <dt>Date</dt><dd>${escapeHtml(formatDate(b.date))}</dd>
      <dt>Time</dt><dd>${escapeHtml(formatTime(b.time))} (${EVENT.sessionMinutes} min)</dd>
      ${filled(EVENT.location) ? `<dt>Location</dt><dd>${escapeHtml(EVENT.location)}</dd>` : ""}
      ${b.familyName ? `<dt>Family</dt><dd>${escapeHtml(b.familyName)}</dd>` : ""}
      <dt>Members</dt><dd>${Number(b.members)}</dd>
      <dt>Status</dt><dd><span class="badge ${escapeHtml(b.status)}">${STATUS_LABELS[b.status] ?? escapeHtml(b.status)}</span></dd>
    </dl>
    ${cancelled ? "" : `
    ${paymentBox(b)}
    ${justBooked ? emailNote : ""}
    <div class="btn-row no-print">
      <button type="button" class="btn" id="ics-btn">Add to calendar</button>
      <button type="button" class="btn secondary" id="save-btn">Save / screenshot this page</button>
    </div>
    <p class="muted no-print" style="font-size:.9rem">Tip: "Save" opens your print screen, where you can choose “Save as PDF”. A screenshot works too.</p>
    <h3>Before you come</h3>
    <ul class="policies">${policiesHtml()}</ul>
    <p class="muted" style="font-size:.95rem">Wear coordinated outfits. ${EVENT.photosPerFamily} digital photos per family, up to ${EVENT.maxMembers} people.</p>`}`;

  document.getElementById("ics-btn")?.addEventListener("click", () => {
    downloadFile(`christmas-in-focus-${b.code}.ics`, buildIcs(b), "text/calendar;charset=utf-8");
  });
  document.getElementById("save-btn")?.addEventListener("click", () => window.print());

  if (justBooked) {
    celebrate();
    // Don't replay the celebration if they refresh or come back later.
    params.delete("new");
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }
}

load();
