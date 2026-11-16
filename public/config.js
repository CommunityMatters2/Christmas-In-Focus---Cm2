// =====================================================================
// config.js — the ONE file you edit to change event settings.
// Both the web pages AND the server (api/ folder) import this file, so the
// list of slots here is the single source of truth: add or change a time here,
// push to GitHub, and the site and the server both use the new list.
// Never put secrets in this file. It's public.
// =====================================================================

const YEAR = 2026; // TODO: confirm the year

// Default start times used for every day (24-hour "HH:MM").
// TODO: replace with your real times. 8 times × 3 days = 24 windows.
const DEFAULT_TIMES = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30"];

export const EVENT = {
  org: "Community Matters 2 Inc. (CM2)",
  name: "Christmas in Focus – Holiday Family Portrait Sessions",
  collection: "CM2 Christmas Collection",
  tagline: "Community Through Our Lens",

  // Each day can override its times with its own `times: [...]` list.
  days: [
    { date: `${YEAR}-12-10`, label: "Dec 10", times: DEFAULT_TIMES },
    { date: `${YEAR}-12-11`, label: "Dec 11", times: DEFAULT_TIMES },
    { date: `${YEAR}-12-13`, label: "Dec 13", times: DEFAULT_TIMES },
  ],

  sessionMinutes: 20,               // TODO: confirm session length
  location: "[LOCATION — e.g. CM2 Community Hall, 123 Main St]", // TODO
  photosPerFamily: 10,
  maxMembers: 7,
  arriveEarlyMinutes: 10,
  policy: "No redos · No makeup sessions",

  contact: {
    phone: "[PHONE]", // TODO
    email: "[EMAIL]", // TODO
  },
};
