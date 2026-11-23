# Christmas in Focus — Family Portrait Booking

Mobile-first booking site for **Community Matters 2 Inc. (CM2)**.
Parents scan the flyer QR, pick one window, get a code, and can look it up later.
Staff manage everything from a private admin page.

**Stack:** plain HTML/CSS/JS (no framework, no build step) · Vercel Functions (`api/`) · Supabase Postgres · Stripe Checkout · GitHub.

## How the parts connect

```
Browser (public/*.html + js)  ──fetch──▶  Vercel Functions (api/*.js)  ──SQL──▶  Supabase Postgres
         never sees the database            check every input                    one table: bookings
```

```
Christmas in Focus/
├── api/                    Server code. Each file is one URL on your site.
│   ├── slots.js            GET  /api/slots      which windows are free (no personal info)
│   ├── book.js             POST /api/book       hold the slot + start Stripe payment
│   ├── release.js          POST /api/release    free the hold if they leave Stripe without paying
│   ├── stripe-webhook.js   POST /api/stripe-webhook  Stripe tells us "paid" / "expired"
│   ├── booking.js          GET  /api/booking    confirmation page summary (by code)
│   ├── lookup.js           POST /api/lookup     "Find my booking" (code + email must both match)
│   └── admin.js            GET/POST /api/admin  staff login, list, check in, cancel, notes
├── lib/                    Server helpers (not URLs)
│   ├── db.js               Database connection + creates & locks the table automatically
│   ├── auth.js             Staff password check + signed login cookie
│   ├── stripe.js           Create checkout, record payment, release unpaid holds
│   └── http.js             JSON responses, error handling
├── public/                 Everything the browser downloads
│   ├── config.js           ★ The ONE file you edit: dates, times, location, contact
│   ├── index.html          Booking page          → js/booking.js
│   ├── confirm.html        "You're booked!"      → js/confirm.js
│   ├── lookup.html         Find my booking       → js/lookup.js
│   ├── admin.html          Staff dashboard       → js/admin.js
│   ├── css/styles.css      All styling (flyer colours, fonts, print layout)
│   ├── assets/logo.png
│   └── js/api.js, utils.js Shared helpers (utils.js is used by the server too)
├── package.json            Lists the one dependency (postgres driver)
├── vercel.json             Tells Vercel the website lives in /public
├── .env                    YOUR real secrets — git-ignored, never pushed
└── .env.example            The settings the server needs (no real values)
```

### Why double-booking is impossible
There's one `bookings` table, plus two database rules (unique indexes):
- only **one active booking per slot**
- only **one active booking per email**

"Active" means not cancelled. If two parents tap the same slot at the same instant, Postgres accepts the first and rejects the second. The second parent sees "another family just reserved that window". When staff cancel, both the slot and the email become free again automatically.

The list of slots comes from `public/config.js`, so there's nothing to "seed".

### How payment works ($20 per window, Stripe Checkout)
1. The family picks a time and fills in the form → **Continue to payment**.
2. The server saves the booking as **Awaiting payment**. This *holds* the slot, so nobody else can take it while they pay.
3. They pay on **Stripe's own page**. Card details never touch our site.
4. Stripe sends them back to `confirm.html`, which checks with Stripe and shows **You're booked!**. Separately, Stripe's webhook tells the server. Either one is enough.
5. If they press back on Stripe, the hold is released right away. If they just close the tab, the checkout expires after **30 minutes** and the slot opens again.

The price lives in `public/config.js` (`priceCents`). The server charges what's in that file, never what the browser sends.
Cancelling in the admin page **does not refund**. Refund in Stripe → Payments → search the booking code → **Refund**. The admin page flags *Paid · refund?* on cancelled paid bookings.

### Why the Supabase publishable key can't see bookings
Supabase lets anyone holding the project's public "publishable/anon" key read tables that aren't locked down. On first run, `lib/db.js` turns on **Row Level Security** for `bookings` with **no policies**, and revokes access from the `anon` and `authenticated` roles. Only our server, connecting with `DATABASE_URL`, can read or write it. In Supabase → Table Editor, `bookings` should show **RLS enabled**.

---

## Setup (step by step)

You need: a **GitHub** account, a **Vercel** account (sign in with GitHub), and Node.js. You already have Node 22 and the Vercel CLI installed.

### 1. Fill in the event details
Open `public/config.js` and replace every `TODO`: the year, the slot times, session length, location, and phone/email.
(Each day has its own `times` list. Currently 6 + 6 + 10 = 22 half-hour windows.)

### 2. Get the Supabase connection string
1. Open your project at <https://supabase.com/dashboard> → click **Connect** (top bar).
2. Choose **Transaction pooler** (port **6543**) and copy the URI.
3. Replace `[YOUR-PASSWORD]` with your database password. If you've forgotten it: Project Settings → Database → **Reset database password**.
4. Paste it after `DATABASE_URL=` in `.env`.

`.env` already has a generated `ADMIN_PASSWORD` and `SESSION_SECRET`. `.env` is git-ignored, so **it is never pushed to GitHub**.

### 2b. Connect Stripe
**Test first (sandbox):**
1. Stripe Dashboard → turn on **Test mode** / open your **Sandbox**. Then **Developers → API keys** → copy the **Secret key** (`sk_test_…`).
2. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-PROJECT.vercel.app/api/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`
   - Copy its **Signing secret** (`whsec_…`).
3. In Vercel → Settings → Environment Variables, add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then **Redeploy**.
4. Book a slot and pay with the test card **4242 4242 4242 4242**, any future date, any CVC and ZIP. It shows up in Stripe → Payments (test) and as *Paid $20.00* in the admin page.

**Go live (real money):** the Stripe account must be **activated** (business and bank details filled in). Then repeat steps 1–3 with **Test mode off**: the live secret key `sk_live_…`, a **new live webhook endpoint** with the same URL and events, and its own live `whsec_…`. Replace both values in Vercel, redeploy, and do one real $20 booking and refund it.

> Safer option: instead of the full secret key, the account owner can create a **restricted key** (Developers → API keys → Create restricted key) with only **Checkout Sessions: Write**. It starts with `rk_live_…` and goes in `STRIPE_SECRET_KEY`. It can't touch anything else in the account.

### 3. Code on GitHub
The code lives at <https://github.com/CommunityMatters2/Christmas-In-Focus---Cm2>. To publish changes:
```bash
git add -A
git commit -m "Describe the change"
git push
```

### 4. Import the project into Vercel
1. <https://vercel.com/new> → **Import** the `Christmas-In-Focus---Cm2` repo.
2. Framework Preset: **Other**. Leave Build Command and Output Directory empty, because `vercel.json` handles it.
3. Open **Environment Variables** on that same screen. Open your `.env`, copy the whole thing, and paste it into the first "Key" box. Vercel splits it into separate variables. You need at least `DATABASE_URL`, `ADMIN_PASSWORD` and `SESSION_SECRET`.
4. Click **Deploy**. The `bookings` table is created in Supabase on the first visit.

> Added or changed a variable later? Vercel → Settings → Environment Variables, then **Deployments → ⋯ → Redeploy**.

### 5. Done: it auto-deploys
- Parents: `https://YOUR-PROJECT.vercel.app`
- Staff: `https://YOUR-PROJECT.vercel.app/admin.html`

From now on, every `git push` to `main` redeploys automatically. Pushes to other branches get a separate preview URL.

> To use your own domain (e.g. `book.cm2.org`): Vercel project → Settings → Domains.

### Run it on your own computer (optional)
```bash
npm install
vercel link                     # connect this folder to the Vercel project (once)
vercel dev                      # reads .env, open http://localhost:3000
```
Note: local testing uses the **same database** as the live site unless you set up a separate one. Cancel any test bookings afterwards, or test before you share the link.

---

## QR code for the flyer
1. Deploy first, then open the live URL on your phone to confirm it works. If you're adding a custom domain, set it up **before** making the QR.
2. Make the QR with a free generator, e.g. <https://www.qr-code-generator.com> or <https://qr.io>. Choose a **static** QR, which never expires and doesn't redirect through a third party. In Chrome you can also open the live page and use **⋮ → Cast, save and share → Create QR code**.
3. Download it as **SVG or PNG at 1000px+**. Use navy `#172036` on white or ivory, keep a clear margin around it, and print it at least **2.5 cm / 1 inch** wide.
4. Test the printed proof with an iPhone and an Android camera before the full print run.
5. Print the short URL under the QR for anyone who can't scan.

---

## Test checklist
Run these on the live site before printing flyers:

- [ ] **Book and pay** on a phone (test card `4242 4242 4242 4242`). You land on "You're booked!" with a `CM2-XXXXXX` code and *Paid $20.00*. Back on the home page, the counter has dropped by 1 and that time shows *Taken*.
- [ ] **Back out of payment:** pick a time, continue to Stripe, press the back arrow on Stripe's page. You see "Payment wasn't completed" and the time is *Open* again.
- [ ] **Webhook:** Stripe → Developers → Webhooks → your endpoint shows recent deliveries with **200** responses.
- [ ] **Add to calendar** downloads an `.ics` file with the right date, time and location.
- [ ] **Double-booking:** open the home page in two browsers (e.g. Chrome and a private window). Select the *same* time in both and use *different* emails. Submit one, then the other. The second shows "another family just reserved that window", and the time turns *Taken*.
- [ ] **One per email:** book a different time with the first email. You see "This email already has a booking".
- [ ] **Look up:** `lookup.html` with the code and email shows the details. The right code with the wrong email shows "couldn't find".
- [ ] **Admin login:** a wrong password is refused, and the right one shows the dashboard.
- [ ] **Check in / Edit notes:** the status changes to Checked-in, and the note appears under the family name.
- [ ] **Cancel as admin:** the time is open again on the home page within ~10 seconds, and lookup shows *Cancelled*.
- [ ] **Export CSV** downloads all bookings and opens in Excel or Google Sheets.
- [ ] **Print day sheet:** pick a day → Print. The preview shows only the clean table.
- [ ] **Signed out:** open `/api/admin` in a private window. You get `{"error":"unauthorized"...}`, not data.
- [ ] Afterwards, **cancel all test bookings** in the admin page.

## Good to know
- **Availability refreshes every 10 seconds** (and whenever the parent returns to the tab). Even if a screen is a few seconds old, the database still blocks double-booking.
- **Staff share one password.** To lock everyone out, change `ADMIN_PASSWORD` in Vercel and redeploy. Logins last 12 hours.
- Anyone with a booking code can open its confirmation page. That page shows the date, time, family name and member count, but never the email or phone. Codes come from about 1 billion combinations, so they can't realistically be guessed.
- "One booking per email" stops accidental repeats, but not someone using a second email address.
- Families can't cancel or reschedule themselves. They contact staff, who cancel from the admin page.
- If you change `maxMembers` in `config.js`, the server follows it automatically.
