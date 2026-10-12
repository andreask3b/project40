# Project 40 — Public homepage

**Product:** Project 40 — Look fit AND be fit.  
**Surface:** Public pitch site (Version B, light editorial). Soft CTA. No Stripe.  
**Homepage framing:** Concept A (countdown-forward) — pick a peak / goal date, reverse-plan seasons (FALL regain · WINTER build · SPRING lean · SUMMER peak).

## What’s here

- `index.html` — production homepage (Concept A goal-date countdown)
- `week/index.html` — shareable generic weekly plan (`/week`) — friend-facing example week, not live logs
- `styles.css` — Version B light editorial + Concept A countdown/timeline classes
- `vercel.json` — `cleanUrls` so `/week` resolves cleanly
- `Project40-Free-Teaser.pdf.b64` — free teaser (base64); client JS rebuilds the PDF download
- `/waitlist` — email-only signup. `POST /api/waitlist` appends `{ email, at }` to a private Vercel Blob list (`project40-waitlist`). The response never includes stored emails.
- Homepage soft CTAs link to `/waitlist`. No Stripe. No outbound email.

## Goal date (EXAMPLE only)

- Public EXAMPLE peak date shown: **15.06.2028** (clearly labeled EXAMPLE)
- Countdown days are illustrative for that fictional horizon — **not** a fixed product end
- Users choose their own peak date; seasons reverse-plan from that date
- Do **not** use personal DOB / birthday (e.g. 26.03.2029) as the product end date

## Rules

- EXAMPLE / demo numbers only — not personal training data
- No deep-links to the private `roadto40` app or personal dashboards
- Soft CTA: free PDF + waitlist; paid pack later (€49–79 band is EXAMPLE)
- `/week` is a generic weekly plan for sharing — no live loads, BW/BF, Strava, or private dashboard links
- Brand = **Project 40** only (no multi-brand)

## Deploy

Static HTML plus `api/waitlist.js`. Deploy root to Vercel (framework: none). **Must be public** — leave Vercel Authentication / SSO off on project `project40`.

`BLOB_READ_WRITE_TOKEN` is a server-side env var on Vercel project `project40` (team `andreask3bs-projects`), created with the private Blob store `project40-waitlist`. Do not commit it. To check or remove one address without printing the list:

```bash
BLOB_READ_WRITE_TOKEN=… node scripts/waitlist-admin.mjs person@example.com check
BLOB_READ_WRITE_TOKEN=… node scripts/waitlist-admin.mjs person@example.com remove
```

## License

All rights reserved · Andreas Keber
