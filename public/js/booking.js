// booking.js — runs index.html.
// 1. Asks the server which slots are free (/api/slots), refreshing every
//    10 seconds and whenever the phone comes back to the tab.
// 2. On submit, sends the form to /api/book. The server/database decides who
//    gets the slot, so even two taps at the same instant can't double-book.
// 3. The server emails the family (confirmation + $20 payment link) and the
//    office, then we show the "You're booked!" page.
import { api } from "./api.js";
import { EVENT } from "../config.js";
import { sparkle } from "./festive.js";
import { configSlots, escapeHtml, footerHtml, formatDate, formatMoney, formatTime, policiesHtml } from "./utils.js";

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 10000;
const PRICE = formatMoney(EVENT.priceCents);
const SUBMIT_HTML = "Reserve my window";

const allSlots = configSlots();
let available = {};              // slotId -> true/false
let activeDay = EVENT.days[0].date;
let selectedId = null;
let submitting = false;
let loaded = false;

// ---------- static text from config ----------
function renderStatic() {
  const dates = EVENT.days.map((d) => d.label).join(" · ");
  const items = [
    `<strong>${escapeHtml(dates)}</strong>`,
    `<strong>${PRICE}</strong> ${escapeHtml(EVENT.packageLabel)} · ${EVENT.sessionMinutes}-minute session`,
    `${EVENT.photosPerFamily} digital photos per family`,
    `Up to ${EVENT.maxMembers} family members`,
  ];
  $("info-strip").innerHTML = items.map((html, i) => `<li style="--i:${i}">${html}</li>`).join("");
  $("policies").innerHTML = policiesHtml();
  $("slots-total").textContent = allSlots.length;
  $("pay-note").textContent =
    `After you book, we'll email your confirmation and a secure ${PRICE} Stripe payment link. ` +
    `Your window is secured once payment is received.`;

  const members = $("members");
  for (let n = 1; n <= EVENT.maxMembers; n++) members.add(new Option(String(n), String(n)));

  $("footer").innerHTML = footerHtml({ withOrg: true });
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

// `animate` makes the times cascade in (first load and when switching days only,
// not on the quiet 10-second refresh).
let staggerTimer = null;
function renderGrid(animate = false) {
  if (!loaded) return;
  const grid = $("slot-grid");
  grid.innerHTML = allSlots.filter((s) => s.date === activeDay).map((s, i) => {
    const label = formatTime(s.time);
    if (!isOpen(s.id)) {
      return `<button type="button" class="slot" style="--i:${i}" disabled aria-label="${label}, taken">
        ${label}<span class="tag">Taken</span></button>`;
    }
    const chosen = s.id === selectedId;
    return `<button type="button" class="slot" style="--i:${i}" data-slot="${s.id}" aria-pressed="${chosen}">
      ${label}<span class="tag">${chosen ? "Selected" : "Open"}</span></button>`;
  }).join("");

  clearTimeout(staggerTimer);
  grid.classList.toggle("stagger", animate);
  if (animate) staggerTimer = setTimeout(() => grid.classList.remove("stagger"), 1200);
}

function renderAll(animate = false) {
  renderCounter();
  renderTabs();
  renderGrid(animate);
}

let firstLoad = true;
async function refreshSlots() {
  try {
    const { slots } = await api("/api/slots");
    available = Object.fromEntries(slots.map((s) => [s.id, s.available]));
    loaded = true;
    if (selectedId && !isOpen(selectedId) && !submitting) {
      selectedId = null;
      showSlotLost();
    }
    renderAll(firstLoad);
    firstLoad = false;
  } catch (err) {
    console.error(err);
    if (!loaded) $("slot-grid").innerHTML = `<p class="muted">We couldn't load the times. Please refresh the page.</p>`;
  }
}

setInterval(() => { if (!document.hidden && !submitting) refreshSlots(); }, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden && !submitting) refreshSlots(); });

// ---------- picking ----------
function updateSummary() {
  const s = allSlots.find((x) => x.id === selectedId);
  $("selected-summary").innerHTML = s
    ? `Your window: <strong>${escapeHtml(formatDate(s.date))} at ${escapeHtml(formatTime(s.time))}</strong> · ${PRICE}`
    : `Please choose a time above.`;
  $("submit-btn").disabled = !s || submitting;
}

function showSlotLost(message) {
  $("slot-message").textContent = message || "So sorry — another family just reserved that window. Please pick another time.";
  updateSummary();
  $("pick-heading").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("day-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-day]");
  if (!btn || btn.dataset.day === activeDay) return;
  activeDay = btn.dataset.day;
  renderTabs();
  renderGrid(true);
});

$("slot-grid").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-slot]");
  if (!btn) return;
  sparkle(btn);
  const first = $("form-section").hidden;
  selectedId = btn.dataset.slot;
  $("slot-message").textContent = "";
  $("form-error").textContent = "";
  renderGrid();
  updateSummary();
  $("form-section").hidden = false;
  // Let the sparkle play for a moment before scrolling down to the form.
  setTimeout(() => $("form-section").scrollIntoView({ behavior: "smooth", block: "start" }), first ? 350 : 150);
});

$("notes").addEventListener("input", (e) => {
  $("notes-left").textContent = 200 - e.target.value.length;
});

// ---------- booking ----------
$("booking-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!selectedId || submitting) return updateSummary();

  $("form-error").textContent = "";
  submitting = true;
  $("submit-btn").disabled = true;
  $("submit-btn").innerHTML = `<span class="spin" aria-hidden="true">❄</span> Reserving your window…`;

  try {
    const { code } = await api("/api/book", {
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
    location.href = `confirm.html?code=${encodeURIComponent(code)}&new=1`;
  } catch (err) {
    submitting = false;
    $("submit-btn").innerHTML = SUBMIT_HTML;

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

renderStatic();
renderTabs();
updateSummary();
refreshSlots();
