# LifeSync Tracker

A private, on-device-only iOS Progressive Web App for uncovering personal trends between your daily energy, mood, symptoms, and behavioral habits.

Everything lives in `localStorage` — there is no backend, no analytics, no cloud sync. Install it to your iPhone Home Screen from Safari (Share → Add to Home Screen) and it runs full-screen, offline.

## Features

- **Daily Logger** — energy level (1–10), positive/negative emotions, custom symptoms with severity (mild / moderate / severe), custom behaviors/activities, free-form notes.
- **Calendar** — Apple-style stacked month grid with energy shading, valence dots, and a ⚠ badge for days that had moderate/severe symptom reports. Tap any day to inspect, edit, or delete its entries.
- **Timeline** — chronological feed of every log, grouped by day, color-coded by valence, with full notes and tag chips.
- **Insights** — local Energy-Over-Time trend chart (pure SVG, no dependencies) so you can eyeball cyclical dips and recoveries.
- **Settings** — manage your personal vocabulary for emotions, symptoms, and activities. Deleting one **does not break** historical logs — they get a clearly-marked "Deleted ..." fallback tag so your analytics stay numerically valid.

## Run locally

Open `index.html` in any modern browser. To get the full "installed app" feel on iPhone, host it over HTTPS (e.g. via GitHub Pages) and add it to the Home Screen.

## Files

- `index.html` — DOM shell (views, nav, modal).
- `app.js` — state, rendering, navigation, logging, calendar, timeline, modal, settings, and Insights chart.
- `styles.css` — iOS font stack, safe-area insets, scrollbar hiding.
- `manifest.json` — PWA install metadata.
- `project_Description.md` — the PRD this app is built against.

All tracking data is stored under the single `lifesync_data` key in `localStorage`. Clear it from Safari Settings → Advanced → Website Data to reset.
