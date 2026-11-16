# Christmas in Focus — Family Portrait Booking

Mobile-first booking site for **Community Matters 2 Inc. (CM2)**.
Parents scan the flyer QR, pick one window, get a code, and can look it up later.
Staff manage everything from a private admin page.

**Stack:** plain HTML/CSS/JS (no framework, no build step) · Vercel Functions (`api/`) · Neon Postgres (from the Vercel Marketplace) · GitHub.

## How the parts connect

```
Browser (public/*.html + js)  ──fetch──▶  Vercel Functions (api/*.js)  ──SQL──▶  Neon Postgres
         never sees the database            check every input                    one table: bookings
```

```
Christmas in Focus/
├── api/                    Server code. Each file is one URL on your site.
│   ├── slots.js            GET  /api/slots      which windows are free (no personal info)
│   ├── book.js             POST /api/book       create a booking
│   ├── booking.js          GET  /api/booking    confirmation page summary (by code)
│   ├── lookup.js           POST /api/lookup     "Find my booking" (code + email must both match)
│   └── admin.js            GET/POST /api/admin  staff login, list, check in, cancel, notes
├── lib/                    Server helpers (not URLs)
│   ├── db.js               Database connection + creates the table automatically
│   ├── auth.js             Staff password check + signed login cookie
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
├── package.json            Lists the one dependency (Neon driver)
├── vercel.json             Tells Vercel the website lives in /public
└── .env.example            The 3 secret settings the server needs (no real values)
```

### Why double-booking is impossible
There's one `bookings` table, plus two database rules (unique indexes):
- only **one active booking per slot**
- only **one active booking per email**

"Active" means not cancelled. If two parents tap the same slot at the same instant, Postgres accepts the first and rejects the second. The second parent sees "another family just reserved that window". When staff cancel, both the slot and the email become free again automatically.

The list of slots comes from `public/config.js`, so there's nothing to "seed".

---

## Setup (step by step)

You need: a **GitHub** account, a **Vercel** account (sign in with GitHub), and Node.js. You already have Node 22 and the Vercel CLI installed.

### 1. Fill in the event details
Open `public/config.js` and replace every `TODO`: the year, the slot times, session length, location, and phone/email.
(8 times × 3 days = 24 windows. A day can have its own `times` list.)

### 2. Put the code on GitHub
1. On <https://github.com/new>, create an **empty private** repo named `christmas-in-focus`. Don't add a README or .gitignore.
2. In a terminal in this folder:
   ```bash
   git remote add origin https://github.com/YOUR_GITHUB_NAME/christmas-in-focus.git
   git push -u origin main
   ```

### 3. Import the project into Vercel
1. <https://vercel.com/new> → **Import** your `christmas-in-focus` repo.
2. Framework Preset: **Other**. Leave Build Command and Output Directory empty, because `vercel.json` handles it.
3. Click **Deploy**. The site loads, but booking won't work until steps 4–5 are done.

### 4. Add the database (Neon, free tier)
In Vercel, open your project → **Storage** → **Create Database** → **Neon (Serverless Postgres)** → accept → pick a region near you → **Connect** it to this project (all environments).
This adds `DATABASE_URL` to the project automatically. The `bookings` table is created on the first request.

### 5. Add the staff password and secret
Vercel project → **Settings → Environment Variables** → add both for **Production, Preview and Development**:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | The password staff will type. Make it long, e.g. 4 random words. |
| `SESSION_SECRET` | A random string. Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Then **Deployments → ⋯ on the latest → Redeploy** so the new settings take effect.

### 6. Done: it auto-deploys
- Parents: `https://YOUR-PROJECT.vercel.app`
- Staff: `https://YOUR-PROJECT.vercel.app/admin.html`

From now on, every `git push` to `main` redeploys automatically. Pushes to other branches get a separate preview URL.

> To use your own domain (e.g. `book.cm2.org`): Vercel project → Settings → Domains.

### Run it on your own computer (optional)
```bash
vercel link                     # connect this folder to the Vercel project
vercel env pull .env.local      # download DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET
npm install
vercel dev                      # open http://localhost:3000
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

- [ ] **Book a slot** on a phone. You land on "You're booked!" with a `CM2-XXXXXX` code. Back on the home page, the counter has dropped by 1 and that time shows *Taken*.
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
