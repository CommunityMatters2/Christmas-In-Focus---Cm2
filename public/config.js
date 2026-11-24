// =====================================================================
// config.js — the ONE file you edit to change event settings.
// Both the web pages AND the server (api/ folder) import this file, so the
// list of slots here is the single source of truth: add or change a time here,
// push to GitHub, and the site and the server both use the new list.
// Never put secrets in this file. It's public.
// =====================================================================

const YEAR = 2026;

// Start times (24-hour "HH:MM"). Each window is `sessionMinutes` long.
const EVENING = ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30"];           // 5–8 pm
const DAYTIME = ["10:00", "10:30", "11:00", "11:30",                               // 10 am–12 pm
                 "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"];            // 1–4 pm

export const EVENT = {
  org: "Community Matters 2 Inc. (CM2)",
  name: "Christmas in Focus – Holiday Family Portrait Sessions",
  collection: "CM2 Christmas Collection",
  tagline: "Community Through Our Lens",

  days: [
    { date: `${YEAR}-12-10`, label: "Dec 10", times: EVENING },
    { date: `${YEAR}-12-11`, label: "Dec 11", times: EVENING },
    { date: `${YEAR}-12-13`, label: "Dec 13", times: DAYTIME },
  ],

  sessionMinutes: 30,

  // Price per window. Families pay through the Stripe payment link below, which is
  // emailed to them (and shown on their confirmation page) after they book.
  // Staff check payments in Stripe and press "Mark paid" on the admin page.
  priceCents: 2000,                 // $20.00 (must match the Stripe payment link's price)
  currency: "usd",
  paymentLink: "https://book.stripe.com/dRm5kCcEQ8tVbAq3AIdIA0d",

  location: "[LOCATION — e.g. CM2 Community Hall, 123 Main St]", // TODO
  photosPerFamily: 10,
  maxMembers: 7,
  arriveEarlyMinutes: 15,
  policy: "No redos · No makeup sessions",
  packageLabel: "digital photo package",

  // "Good to know" rules. Shown on the home page, the confirmation page, and in
  // the family's email. `icon` is an emoji; `text` is plain text (no HTML).
  // If you change the price, arrive-early time or session length above, update the wording here too.
  policies: [
    { icon: "⏰", title: "Arrive 15 minutes early",
      text: "Bring everyone who will be in the photo. There's no changing area, so come dressed and ready." },
    { icon: "⌛", title: "Late? Your time still ends on schedule",
      text: "Sessions run back-to-back. If you arrive late, you'll only get the time left in your 30-minute window." },
    { icon: "💳", title: "Payment secures your window",
      text: "Your window isn't held until your $20 is paid. Unpaid windows may be given to another family." },
    { icon: "🚫", title: "Non-refundable",
      text: "All payments are final. No redos or makeup sessions." },
  ],

  contact: {
    phone: "[PHONE]", // TODO
    email: "info@communitymatters2.org",
  },
};
