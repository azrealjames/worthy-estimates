# Worthy Estimates

A mobile-first, offline-ready PWA for writing work estimates and invoices on your phone or tablet.

**Live app: https://www.worthyestimates.com/**

## Features

- **Custom business header** — name, tagline/license #, phone, email, address, and a printed footer note. Change it any time in Settings; it appears on every estimate.
- **Customer header** — name, phone, email, and job address per estimate.
- **Line items with notes** — each work item has a description, a free-form notes field (materials, prep, specifics), quantity, and rate.
- **City-based tax** — add each city you work in with its sales tax rate in Settings, then pick the city on the estimate. You get a subtotal, the city's tax line, and a grand total.
- **Print / Save PDF** — a clean, paper-style estimate document with signature lines, ready to print or share as a PDF from your phone's share sheet.
- **Convert to invoice** — one tap turns an accepted estimate into an invoice (INV-#### number, due date, reference back to the original estimate number).
- **Get paid** — set your PayPal.Me, Venmo, and Zelle details once in Settings; every unpaid invoice shows a "How to pay" box with tappable PayPal/Venmo links (PayPal pre-fills the amount) and your Zelle info. The share message includes the payment links too. Mark invoices paid to get a PAID watermark and stamp.
- **Autosave + offline** — everything is saved to the device automatically (localStorage). The service worker caches the app so it works with no signal.

## Tech

Plain HTML/CSS/JS — no build step, no dependencies. Files:

- `index.html` — app shell (list, editor, settings, print preview)
- `styles.css` — mobile-first styling + print stylesheet
- `app.js` — state, autosave, tax math, document renderer
- `sw.js` — service worker (cache-first app shell + font caching)
- `manifest.webmanifest` + `icons/` — installability

## Run locally

Any static server works:

```
npx http-server . -p 4173 -c-1
```

Then open http://localhost:4173.

## Install on your phone

Open **https://www.worthyestimates.com/** on your phone, then:

- **Android / Chrome:** menu → **Add to Home screen** → Install
- **iPhone / Safari:** Share → **Add to Home Screen**

It launches full-screen like a native app and works offline after the first visit.

## Deploying updates

The app is served by Vercel.com from the `main` branch. Pushing to `main`
redeploys it within a minute or so:

```
git add -A && git commit -m "your message" && git push
```

Bump the `CACHE` version string in `sw.js` whenever you change `app.js`,
`styles.css`, or `index.html` — otherwise the old service worker keeps serving
the cached copies and phones won't see the update.

## Notes

- All data stays on the device. Clearing browser site data erases estimates, so print/PDF anything you need to keep.
- Estimate numbers auto-increment (EST-0001, EST-0002, …).
