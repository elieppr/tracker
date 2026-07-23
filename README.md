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

The whole app is static HTML/CSS/JS with no build step, so any HTTP server works. A tiny `serve.sh` wrapper is included for convenience.

```bash
chmod +x serve.sh          # only needed once after a fresh git clone
./serve.sh                 # port 8000, opens browser automatically
./serve.sh 8080            # custom port
./serve.sh --no-open       # skip browser launch
./serve.sh --help          # full docs
```

If `chmod +x` isn't an option (e.g. on a read-only filesystem), the script works just as well via `bash serve.sh`.

`serve.sh` tries `python3`, then `python`, then `npx http-server`, then `php -S` — whichever you have installed. If none of those work, just `python3 -m http.server` from the project root works the same way.

While iterating:

- Hard-refresh after edits: **Cmd+Shift+R** (mac) / **Ctrl+F5** (windows) so the browser doesn't stash an old `app.js`.
- Open DevTools → Network → **Disable cache** while DevTools is open for fully automatic reloads.
- Reset the demo data: DevTools → Application → Local Storage → delete the `lifesync_data` key, then reload.

To install as a real iPhone app, host it over HTTPS (e.g. via GitHub Pages) and add to the Home Screen from Safari.

## Files

- `index.html` — DOM shell (views, nav, modal).
- `app.js` — state, rendering, navigation, logging, calendar, timeline, modal, settings, and Insights chart.
- `styles.css` — iOS font stack, safe-area insets, scrollbar hiding.
- `manifest.json` — PWA install metadata.
- `project_Description.md` — the PRD this app is built against.

All tracking data is stored under the single `lifesync_data` key in `localStorage`. Clear it from Safari Settings → Advanced → Website Data to reset.
