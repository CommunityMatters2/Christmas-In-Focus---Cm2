// utils.js — small helpers shared by the web pages AND the server (api/).
// Anything touching `document` lives inside a function, so it's safe to import on the server.
import { EVENT } from "../config.js";

// ---------- booking codes ----------
// 32 characters: A–Z and 2–9 without the look-alikes 0/O and 1/I.
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_PREFIX = "CM2-";
const CODE_LENGTH = 6; // e.g. CM2-7KQ4XM → ~1 billion possible codes

export function makeBookingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  // 256 is divisible by 32, so `% 32` gives every character an equal chance.
  return CODE_PREFIX + Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join("");
}

// Accepts "cm2-7kq4xm", "7KQ4XM", "CM2 7KQ4XM", etc.
export function normalizeCode(input) {
  let s = String(input || "").toUpperCase().replace(/[\s-]/g, "");
  if (s.length === CODE_LENGTH + 3 && s.startsWith("CM2")) s = s.slice(3);
  return CODE_PREFIX + s;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export const CODE_PATTERN = new RegExp(`^CM2-[${CODE_ALPHABET}]{6}$`);

// ---------- slots ----------
export function slotIdFor(date, time) {
  return `${date}_${time.replace(":", "")}`; // "2026-12-10_1000"
}

// Every slot defined in config.js: [{ id, date, time }]
export function configSlots() {
  return EVENT.days.flatMap((day) =>
    day.times.map((time) => ({ id: slotIdFor(day.date, time), date: day.date, time }))
  );
}

// ---------- formatting ----------
function toLocalDate(dateStr, timeStr = "00:00") {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function formatDate(dateStr) {
  return toLocalDate(dateStr).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

export function formatTime(timeStr) {
  return toLocalDate("2000-01-01", timeStr).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
  });
}

export function dayLabel(dateStr) {
  return EVENT.days.find((d) => d.date === dateStr)?.label ?? dateStr;
}

export const STATUS_LABELS = {
  booked: "Booked",
  checked_in: "Checked-in",
  cancelled: "Cancelled",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ---------- files ----------
export function downloadFile(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Calendar file (.ics). Times are "floating" (local to wherever the phone is),
// which is right for an in-person event.
export function buildIcs(booking) {
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

  const start = toLocalDate(booking.date, booking.time);
  const end = new Date(start.getTime() + EVENT.sessionMinutes * 60000);
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;

  const description = [
    `Booking code: ${booking.code}`,
    `Family members: ${booking.members}`,
    `Please arrive ${EVENT.arriveEarlyMinutes} minutes early in coordinated outfits.`,
    `${EVENT.policy}.`,
    `Questions: ${EVENT.contact.phone} / ${EVENT.contact.email}`,
  ].join("\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CM2//Christmas in Focus//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.code}@cm2-christmas-in-focus`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc("Christmas in Focus – Family Portrait (CM2)")}`,
    `LOCATION:${esc(EVENT.location)}`,
    `DESCRIPTION:${esc(description)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Christmas in Focus portrait session",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
