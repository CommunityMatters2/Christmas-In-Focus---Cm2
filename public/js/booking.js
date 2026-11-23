// booking.js — runs index.html.
// 1. Asks the server which slots are free (/api/slots), refreshing every
//    10 seconds and whenever the phone comes back to the tab.
// 2. On submit, sends the form to /api/book. The server/database decides who
//    gets the slot, so even two taps at the same instant can't double-book.
// 3. The server answers with a Stripe Checkout link; we send the family there to pay.
//    If they press "back" on Stripe, they return here with ?cancelled=CODE and we
//    release the held slot straight away.
import { api } from "./api.js";
import { EVENT } from "../config.js";
import { configSlots, escapeHtml, formatDate, formatMoney, formatTime } from "./utils.js";

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 10000;
const PRICE = formatMoney(EVENT.priceCents);
const SUBMIT_TEXT = `Continue to payment (${PRICE})`;

const allSlots = configSlots();
let available = {};              // slotId -> true/false
let activeDay = EVENT.days[0].date;
let selectedId = null;
let submitting = false;
let loaded = false;

// ---------- static text from config ----------
function renderStatic() {
  const dates = EVENT.days.map((d) => d.label).join(" · ");
  $("info-strip").innerHTML = `
    <li><strong>${escapeHtml(dates)}</strong></li>
    <li>${PRICE} per ${EVENT.sessionMinutes}-minute session</li>
    <li>${EVENT.photosPerFamily} digital photos per family</li>
    <li>Up to ${EVENT.maxMembers} family members</li>
    <li>${escapeHtml(EVENT.policy)}</li>`;
  $("slots-total").textContent = allSlots.length;
  $("submit-btn").textContent = SUBMIT_TEXT;

  const members = $("members");
  for (let n = 1; n <= EVENT.maxMembers; n++) members.add(new Option(String(n), String(n)));

  $("footer").innerHTML = `
    <p>${escapeHtml(EVENT.org)} · ${escapeHtml(EVENT.location)}</p>
    <p>Questions? ${escapeHtml(EVENT.contact.phone)} · <a href="mailto:${escapeHtml(EVENT.contact.email)}">${escapeHtml(EVENT.contact.email)}</a></p>`;
}

// ---------- availability ----------
const isOpen = (id) => available[id] === true;

function renderCounter() {
  $("slots-left").textContent = loaded ? allSlots.filter((s) => isOpen(s.id)).length : "–";
}

function renderTabs() {
  $("day-tabs").innerHTML = EVENT.days.map((day) => {
    const left = allSlots.filter((s) => s.date === day.date && isOpen(s.id)).length;
    return `<button type="button" class="day-tab" data-day="${day.date}" aria-pressed="${day.date === activeDay}">
      ${escapeHtml(day.label)}<small>${loaded ? `${left} left` : "&nbsp;"}</small>
    </button>`;
  }).join("");
}

function renderGrid() {
  if (!loaded) return;
  $("slot-grid").innerHTML = allSlots.filter((s) => s.date === activeDay).map((s) => {
    const label = formatTime(s.time);
    if (!isOpen(s.id)) {
      return `<button type="button" class="slot" disabled aria-label="${label}, taken">
        ${label}<span class="tag">Taken</span></button>`;
    }
    return `<button type="button" class="slot" data-slot="${s.id}" aria-pressed="${s.id === selectedId}">
      ${label}<span class="tag">Open</span></button>`;
  }).join("");
}

function renderAll() {
  renderCounter();
  renderTabs();
  renderGrid();
}

async function refreshSlots() {
  try {
    const { slots } = await api("/api/slots");
    available = Object.fromEntries(slots.map((s) => [s.id, s.available]));
    loaded = true;
    if (selectedId && !isOpen(selectedId) && !submitting) {
      selectedId = null;
      showSlotLost();
    }
    renderAll();
  } catch (err) {
    console.error(err);
    if (!loaded) $("slot-grid").innerHTML = `<p class="muted">We couldn't load the times. Please refresh the page.</p>`;
  }
}

setInterval(() => { if (!document.hidden) refreshSlots(); }, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshSlots(); });

// ---------- picking ----------
function updateSummary() {
  const s = allSlots.find((x) => x.id === selectedId);
  $("selected-summary").innerHTML = s
    ? `Your window: <strong>${escapeHtml(formatDate(s.date))} at ${escapeHtml(formatTime(s.time))}</strong> · ${PRICE}`
    : `Please choose a time above.`;
  $("submit-btn").disabled = !s;
}

function showSlotLost(message) {
  $("slot-message").textContent = message || "So sorry — another family just reserved that window. Please pick another time.";
  updateSummary();
  $("pick-heading").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("day-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-day]");
  if (!btn) return;
  activeDay = btn.dataset.day;
  renderTabs();
  renderGrid();
});

$("slot-grid").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-slot]");
  if (!btn) return;
  selectedId = btn.dataset.slot;
  $("slot-message").textContent = "";
  $("form-error").textContent = "";
  renderGrid();
  updateSummary();
  $("form-section").hidden = false;
  $("form-section").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("notes").addEventListener("input", (e) => {
  $("notes-left").textContent = 200 - e.target.value.length;
});

// ---------- booking ----------
$("booking-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!selectedId) return updateSummary();

  $("form-error").textContent = "";
  $("submit-btn").disabled = true;
  $("submit-btn").textContent = "Opening secure payment…";
  submitting = true;

  try {
    const { checkoutUrl } = await api("/api/book", {
      method: "POST",
      body: {
        slotId: selectedId,
        parentName: form.parentName.value,
        email: form.email.value,
        phone: form.phone.value,
        members: Number(form.members.value),
        familyName: form.familyName.value,
        notes: form.notes.value,
        policy: form.policy.checked,
      },
    });
    location.href = checkoutUrl; // Stripe's checkout page
  } catch (err) {
    submitting = false;
    $("submit-btn").textContent = SUBMIT_TEXT;

    if (err.kind === "taken") {
      available[selectedId] = false;
      selectedId = null;
      renderAll();
      showSlotLost(err.message);
      refreshSlots();
    } else if (err.kind === "duplicate") {
      $("form-error").innerHTML = `${escapeHtml(err.message)} <a href="lookup.html">Find your booking</a>.`;
      $("submit-btn").disabled = false;
    } else {
      $("form-error").textContent = err.message;
      $("submit-btn").disabled = false;
    }
  }
});

// Back from Stripe without paying → free the held slot now.
async function handleCancelledCheckout() {
  const code = new URLSearchParams(location.search).get("cancelled");
  if (!code) return;
  history.replaceState(null, "", location.pathname);
  try {
    await api("/api/release", { method: "POST", body: { code } });
  } catch (err) {
    console.error(err);
  }
  $("slot-message").textContent = "Payment wasn't completed, so nothing was charged and your window wasn't booked. You can choose a time and try again.";
}

renderStatic();
renderTabs();
updateSummary();
handleCancelledCheckout().finally(refreshSlots);
