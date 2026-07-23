# LifeSync Tracker — Code Overview (V4)

A walkthrough of what the codebase currently does, file by file and section by section. Reflects the **V4 refactor**: a thin UI/feature layer built on top of **V3** (per-entry data model, channel picker, continuous-flow calendar, warm Honey/Cream palette). V4 introduces theme + accent personalisation, a Kanban timeline mode, two new Insights charts, a date-range filter, and a few targeted visual polish passes.

## What the App Is

**LifeSync Tracker** is a single-page, mobile-first web app (installable as a PWA via `manifest.json`) for logging personal **energy levels**, **emotions**, **symptoms**, **activities**, and **notes** throughout the day. Everything persists to `localStorage`, so it runs fully offline with no backend.

Project files:

| File                    | Purpose                                                                                 |
|-------------------------|-----------------------------------------------------------------------------------------|
| `index.html`            | DOM shell: header, log/save-bar, four views, modal, bottom nav, head preload script     |
| `styles.css`            | Warm palette variables + safe-area utilities + cat-* tints + theme variants + kanban   |
| `app.js`                | All behaviour in 11 numbered sections; ~1576 lines                                       |
| `manifest.json`         | PWA manifest (standalone display, iPhone installable)                                   |
| `serve.sh`              | Tiny local dev-server wrapper (autopicks `python3` / `python` / `npx` / `php`)          |
| `README.md`             | Project overview + Run-locally guide + cache-busting tips                               |
| `project_Description.md`| The PRD (V4) this app is built against                                                  |

Styling is mostly Tailwind CSS loaded from a CDN script tag in `index.html`; `styles.css` provides the small set of CSS variables and utility classes Tailwind doesn't know about (`pt-safe`, `pb-safe`, `cat-*`, `shadow-soft`, `.ios-card`).

---

## `app.js` — The Whole App

`app.js` is structured into eleven numbered sections. Below is what each one currently does.

### 1. Default Datasets & State

- **`DEFAULT_EMOTIONS`** — six starter emotions split by valence (3 positive, 3 negative).
- **`DEFAULT_SYMPTOMS`** — four starter somatic symptom labels.
- **`DEFAULT_ACTIVITIES`** — four starter behaviours (caffeine, workout, alcohol, meditation).
- **`FALLBACK_LABEL`** — human-readable copy for the four sentinel ids (`fallback_positive`, `fallback_negative`, `fallback_symptom`, `fallback_activity`). When a custom descriptor is deleted, every historical reference to it gets rewritten to one of these sentinels so the data still renders meaningfully.
- **`SEVERITY_COLOR` and `SEVERITY_TEXT_COLOR`** — warm palette parallels for the three severity buckets. The `_COLOR` variant is the solid background + foreground of the symptom severity pill in the logger; `SEVERITY_TEXT_COLOR` is the text-only tone used in timeline/modal rows.
- **`CAT_CARD_CLASS`** — maps category names (`energy`, `pos`, `neg`, `mild`, `mod`, `sev`, `activity`, `note`) to the corresponding `cat-*` classes declared in `styles.css`. Pulled out of the renderer so future palette tweaks only touch one map.
- **`generateMockData()`** — returns ~25 per-entry records scattered across ~4 days, so first-launch shows a populated timeline.
- **`state`** — single in-memory object: `{ userSettings, dailyLogs }`. Each `dailyLog` is now a **flat event record** (`{ id, date, type, value, severity? }`), not the V2 aggregated daily card.
- **`activeCalendarMode`** — tracks `'month'` vs `'timeline'` in the History view.

### 2. Initialization (incl. V2 → V3 data migration)

Runs once on `load`. The order is important:

1. `resetLogDatePicker()` fills the date input with `now` (timezone-correct).
2. Read `localStorage['lifesync_data']` and parse into `state`. If missing/corrupt, fall back to a blank shell.
3. Validate `state.userSettings` + `state.meta` exist.
4. **First-run seeding** (idempotent via `state.meta.seeded`): if the user has zero custom emotions/symptoms/activities, seed them from the `DEFAULT_*` lists; if zero logs, seed from `generateMockData()`. Sets `meta.seeded = true`.
5. **V2 → V3 migration** (idempotent via `state.meta.migratedToV3`): if a `dailyLog` entry uses the V2 shape (i.e. has bundles like `energy`, `emotions[]`, `symptoms[]`, etc., instead of the V3 flat `type`), explode it into one record per channel and replace `state.dailyLogs`. Set `meta.migratedToV3 = true` so subsequent loads are no-ops.
6. Persist with `saveStateToLocalStorage()`.
7. Render logger + settings (`renderLogger()`, `renderSettings()`).

### 3. Navigation Controller

- **`switchTab(tabId)`** — hides all four views, shows the chosen one, recolors the bottom-nav tab, updates the header title, and — if the tab is calendar — un-hides the `mode-switcher` and re-renders the appropriate calendar subview. Each non-log tab also re-renders when first switched to (`renderInsights()` etc.). Save-pill visibility is keyed off the log tab; see 3b.
- **`setCalendarMode(mode)`** — toggles monthly vs. timeline container and recolors the two pill buttons (white pill on cream switcher for active, muted ink for inactive).
- **`refreshCalendarUI()`** — dispatches to either the continuous calendar or the timeline renderer based on `activeCalendarMode`.

#### 3b. Save-bar visibility
The floating Save pill (`#log-save-bar`) sits outside of `<section id="view-log">` so we can absolutely-position it (anchored above the bottom-nav + safe-area inset). It is hidden by default and un-hidden when `switchTab('log')` is called. CSS handles the only positioning concerns.

### 4. Logger Engine — Channel Picker + Per-Channel Forms (V3)

The Log view splits the V2 single-form "fill-everything-and-save" into a channel picker plus five narrow panels. Only the panel matching `currentChannel` is visible.

- `currentChannel` — module-level state, one of `'energy' | 'emotion' | 'symptom' | 'activity' | 'note'`. Defaults to `'energy'`.
- `CHANNEL_LABEL` — maps channel ids to display names.
- **`renderLogger()`** — entry point. Re-paints the channel picker chips and re-renders the per-channel content lists (emotion pills, symptom rows, activity pills).
- **`renderChannelPicker()`** — recreates the five chips. Active chip uses the terracotta accent with `shadow-soft` and a `border-[#B47A3C]` stroke; inactive chips are white pills on a cream background.
- **`renderEmotionsInLogger()`** — two rows (positive / negative) of pill buttons. Click toggles to a sage (`#7E9A6B`) solid for positive, brick-red (`#C44033`) for negative; another click deselects.
- **`renderSymptomsInLogger()`** — one row per symptom with three severity buttons (Mild / Mod / Sev). The currently-selected button gets the matching `SEVERITY_COLOR` solid background; clicking again clears it.
- **`renderActivitiesInLogger()`** — multi-select pills, dusty-blue solid (`#7C9CB1`) on select.
- **`saveCurrentLog()`** — the heart of V3. Reads the *visible panel only* and writes **one discrete entry** to `state.dailyLogs`. For multi-select panels (emotion / activity) it expands into one entry per selected item, all stamped with the same date+time. After save, it briefly flips the Save button to "✓ Saved" with a sage-green background and resets the channel-specific input (energy slider back to 5, notes textarea cleared). The date input is preserved so the user can rapid-fire multiple logs at the same instant.

### 5. Continuous Calendar Engine (V3; refined in V4)

Replaces the V2 stacked-month renderer. One uninterrupted 7-col grid that crosses month boundaries with no section breaks.

* **V4 grid styling** — the `renderContinuousCalendar` function appends `.apple-grid` to the grid div, then for each cell computes two indexing metrics:
  * `weekIndex = Math.floor(gridIndex / 7)` — used to assign `.cal-row-stripe` to every other week-row (zebra striping).
  * `gridIndex % 7` — Saturday cells (column index 6, since grid starts from Sunday) get `.cal-col-rule` for a faint vertical rule.
* Under the dim-warm theme the striping is overridden to a lighter tone so it works on dark backgrounds.

### 6b. Timeline FOV fix (V4 minor)

`renderSeamlessTimeline` reduced `TIME_GUTTER` from 64 px to **40 px** so each entry card gets ~24 px more horizontal space. `THREAD_X` is recomputed as `TIME_GUTTER + NODE_COL/2 = 52` so the thread still lines up with each node's centre. The thread body was also widened (var(--ls-bg-deep) token, theme-aware).

Constants pulled out of the loop:
- `CAL_RANGE_BACK_MONTHS = 2`, `CAL_RANGE_FWD_MONTHS = 3` — total span.
- `STICKY_HEADER_OFFSET = 44` — combined height of weekday header + month label, used when scrolling today into view.

**`renderContinuousCalendar()`**
1. Computes the start = first day of `today − 2 months`, back-filled to Sunday. End = last day of `today + 3 months`, forward-filled to Saturday.
2. Iterates day-by-day, calling `buildDayCell(dateStr, dayLogs, isToday)` for each.
3. Appends the entire `<div class="grid grid-cols-7 …">` into `#apple-calendar-stack`.
4. Calls `setupMonthSentries()` so the sticky month label gets updated as the user scrolls.
5. `setTimeout` scrolls the container so today's cell sits just under both sticky headers.

**`buildDayCell(dateStr, dayLogs, isToday)`**
- Creates a 48×56px cell.
- Today gets a solid 28px **terracotta circle** (the new accent — was Apple red in V2) with white number.
- Other days get a bold warm-plum number.
- If day has logs:
  - **Energy bar** at the bottom — averaged energy gets one of four peach→brick-red tones via `energyBarClass()`.
  - **Valence dots** upper-left — sage if any positive emotion, dusty-rose if any negative (max 2 dots).
  - **Warning pip** upper-right — a single `!` on a warm brick-red circle if any moderate/severe symptom exists.
- Click invokes `openDayModal(dateStr, dayLogs)`.

**`setupMonthSentries(container)`**
- Reads `state.meta` and pre-fills the month label with *today's* month.
- Walks the grid cells and records the indices of the first cell of each new month (`dataset.month`/`dataset.year` change).
- Hands that array to a single `IntersectionObserver` whose `rootMargin` is `-44px 0px -85% 0px` — a horizontal strip immediately below the sticky headers. When a sentry crosses into that strip, the observer fires and updates the sticky label.

This avoids using a `scroll` handler + `offsetTop` reads, which would force synchronous layout on every scroll frame.

### 6. Continuous Timeline Engine (V3 — Category Ribbons; refined in V4)

The History view offers **two timeline modes** selected via the mode-switcher. `renderSeamlessTimeline` is the existing vertical-feed renderer (V3). `renderKanbanTimeline` is the V4 5-lane column renderer.

**`renderSeamlessTimeline()`** — feed container setup:

- Sorts all entries newest-first.
- Geometry constants on top: `TIME_GUTTER=64`, `NODE_COL=24`, `THREAD_X=76`. The thread line is drawn *once* as an absolutely-positioned `<div>` at `left: 76px` (`z-0`).
- For each entry:
  - If the date is new (compared to `lastDate`), emit a sticky **date pill** with weekday + month-day + entry count. Pill background is `bg-[#FAF6EE]/85 backdrop-blur-md` so it *visually* interrupts the thread (the cream blur takes the thread out from behind it) without breaking the layout flexbox.
  - Emit a row: `grid-cols-[64px_24px_1fr]` = time | node | content.
    - **Time gutter** — fixed-width column with a small AM/PM split (`9` then `am`).
    - **Node** — 16px circle in the category hue (`entryNodeColor(log)`), white border, mx-auto so it lands centred on the thread.
    - **Card** — `renderEntryInline(log)` returns the category-tinted card body (see below).
- Each row uses `pt-4 pb-3` (~12px gap above + 12px below) so categories read as discrete slabs when several of the same category stack together.

**`entryNodeColor(log)`** — returns one hex per category:
- `energy` → call `energyNodeColor(value)` for the peach→brick ramp.
- `emotion` → sage (`#7E9A6B`) for positive / brick (`#C44033`) for negative.
- `symptom` → yellow (`#E9C46A`) / amber (`#E89C5B`) / brick (`#A0332A`) by severity.
- `activity` → dusty blue (`#7C9CB1`).
- `note` → mocha (`#A0876A`).

**`renderEntryInline(log)`** — single source of truth for the card body shared between the timeline and the day modal. Returns a category-tinted card div:
- `cat-energy` (peach)
- `cat-pos` (sage) / `cat-neg` (dusty rose)
- `cat-mild` / `cat-mod` / `cat-sev` (yellow / amber / brick pastel)
- `cat-activity` (dusty blue)
- `cat-note` (mocha cream)

Because every card is tinted, scanning the timeline reveals the *shape* of a day: if the user logged two symptoms, two activities, and a note, the eye sees them as three coloured "ribbons" with a clear visual gap between each.

**`energyNodeColor(value)`** — peach `#F8D6A8` for ≤3, warm amber `#F4A261` for ≤6, accent terracotta `#D89B5C` for ≤9, warm brick `#C44033` for peak.

### 7. Day Modal Engine

A bottom-sheet that opens on calendar cell tap or timeline entry tap. Each entry in the day is a row:
- Time on the left.
- Colored category dot (same `entryNodeColor`) in the centre.
- Tinted card body in the middle-right.
- `Del` button (warm destructive — dusty rose on cream-pink) on the far right.

If the day has no entries, the modal shows a friendly empty state with an **Add Entry** button (`shortcutRetroactiveLog(dateString)`) that closes the modal, switches to the Log tab, and pre-fills the date picker with the day clicked.

`closeDayModal()` adds `translate-y-full` back to the sheet, then after 300 ms hides the overlay (matching the CSS transition).

### 8. Settings Engine

Three list renderers (`renderEmotionsInSettings`, `renderSymptomsInSettings`, `renderActivitiesInSettings`) plus three add helpers and three delete helpers. Each delete helper does the V2-style "rewrite historical refs to the fallback sentinel" dance so old logs never break. `deleteActivity`/`deleteSymptom`/`deleteEmotion` are kept as separate functions (rather than DRY'd up) because each one has a slightly different fallback id and a different confirm-prompt copy.

`resetAllData()` — destructive. Confirms, clears `localStorage`, rebuilds state from defaults + mock data, persists, and re-renders.

### 9. Insights Engine

- **`renderEnergyTrendChart()`** — filters `state.dailyLogs` for `type === 'energy'`, groups by `date.split('T')[0]`, averages per day, plots with pure SVG (no library). Trend line is the warm accent-deep (`#B47A3C`) over a terracotta gradient fill. Data circles are terracotta with cream halo. Gridlines are cream-deep.
- **`renderInsightSummary()`** — pushes four stat cards (`statCard(...)`) — Avg Energy, Positive count, Negative count, Days with data. Each uses a warm tone (`accent` / `pos` / `neg` / `ink`).

`statCard` is the only place stat tones are defined; if a future refactor adds more, edit this one function.

---

## Helpers (the trailing block in `app.js`)

- `classifyEmotion(id)` / `classifySymptom(id)` / `classifyActivity(id)` — resolve an id back to `{ id, name, valence? }` (or to its fallback label). The fallbacks have their own `deleted: true` flag in case a renderer ever needs to visualize them differently.
- `escapeHtml(str)` — minimum-viable HTML escape for user-supplied names before they land in `innerHTML`.

---

## `index.html` — The Skeleton

The DOM in turn:

1. **`<body>`** — flex column, full viewport height, warm cream background (`bg-[#FAF6EE]`).
2. **`<header>`** — frosted blur bar with `pt-safe` so iPhone notch + Dynamic Island are honoured. Contains the dynamic title (`#app-title`) and the hidden Calendar mode-switcher (Month / Timeline).
3. **`<main id="main-content">`** — scroll region; holds the four stacked `<section>` views:
   - `#view-log` — date input, channel picker host (`#channel-picker`), five `<div data-channel-panel="…">` blocks (only `energy` starts visible — toggled via the `hidden` class), plus the body padding to make room for the floating Save pill below.
   - `#view-calendar` — `#calendar-month-container` (sticky weekday row + sticky month label + day grid) and `#calendar-timeline-container` (sticky date pills + node thread + per-entry rows).
   - `#view-insights` — Energy-over-time chart card + four stat cards.
   - `#view-settings` — three sub-sections (Emotions / Symptoms / Activities) for adding custom descriptors, plus a destructive reset button.
4. **`#log-save-bar`** — fixed-position floating pill, anchored at `bottom: env(safe-area-inset-bottom) + 64px`. Lives outside `#view-log` so it can be `position: fixed`; visibility toggled from `switchTab`.
5. **`#day-modal`** — fixed, bottom-aligned sheet. Hidden by default; JS adds `translate-y-full` then removes it to animate up.
6. **`<nav>`** — bottom tab bar with four SVG-icon buttons (`#btn-log`, `#btn-calendar`, `#btn-insights`, `#btn-settings`) that call `switchTab(...)`. Active tab = terracotta accent (`#D89B5C`). `pb-safe` honours the home-indicator.

The `app.js` script is loaded with `defer` so the DOM is fully parsed before it runs.

---

## `styles.css` — The Few Things Tailwind Can't Do

- **CSS variables** for the warm palette (`--ls-bg`, `--ls-cream-soft`, `--ls-cream-deep`, `--ls-ink`, `--ls-ink-soft`, `--ls-ink-mute`, `--ls-accent`, `--ls-accent-deep`) — edit once, every Tailwind class that maps to a `bg-[#…]` literal will still reference the literal but the ones in `styles.css` itself stay in sync.
- **`.pt-safe` / `.pb-safe` / `.mb-safe`** — `padding-top: max(env(safe-area-inset-top), 12px)` etc. The `max(…)` fallback keeps `pt-safe` working on browsers that don't ship safe-area-inset support (e.g. desktop Safari).
- **`.no-scrollbar`** — hides scrollbars while remaining scrollable. Used by all the scroll regions (`#main-content`, `#calendar-month-container`, `#calendar-timeline-container`).
- **`.ios-card`** — single source of truth for the card surface (white, cream border, soft shadow).
- **`.shadow-soft`** — softer drop for floating pills / cards.
- **`.cat-energy`, `.cat-pos`, `.cat-neg`, `.cat-mild`, `.cat-mod`, `.cat-sev`, `.cat-activity`, `.cat-note`** — the category-tinted card surfaces used by `renderEntryInline`. New categories get one new class + one entry in `CAT_CARD_CLASS`.

A few small `input/textarea/select` defaults are also inlined here so the date picker etc. feel native on iOS.

---

## `manifest.json` — PWA Hookup

Minimal standalone PWA manifest: `name: "LifeSync Tracker"`, `short_name: "LifeSync"`, `display: "standalone"`, `start_url: "index.html"`, cream background (`#f0f2f5` — note: this is older than the `--ls-bg`; sync if you rebrand), warm theme (`#007aff` — also legacy; the actual UI accent is now `#D89B5C`).

---

## `serve.sh` — Local Dev Server

Tiny `bash` wrapper that auto-detects `python3` → `python` → `npx http-server` → `php -S`, binds the project root on a port (default 8000), polls the port until it accepts connections, and auto-opens the browser with `open` (macOS), `xdg-open` (Linux), or `wslview` (WSL). Flags:

- `--no-open` — don't open the browser.
- `--port=` or just a positional number — custom port.
- `--help` — print the docblock header and exit.

No new runtime dependencies added.

---

## Data Flow at a Glance

```
User picks channel, picks value, taps Save
        │
   saveCurrentLog()
        │
        ▼
state.dailyLogs.push(newEntries) ──► saveStateToLocalStorage()
        │
        ▼ (next visit to History tab)
   switchTab('calendar')
        │
        ▼
   renderContinuousCalendar()    ◄── reads state.dailyLogs (filtered by date)
   or renderSeamlessTimeline()   ◄── reads state.dailyLogs (filtered by entry type)

   (Insights tab)
   renderInsights()
        │
        ▼
   renderEnergyTrendChart()      ◄── filters to type === 'energy'
   renderInsightSummary()        ◄── counts emotions, days, avg energy
```

Any mutation of `state.dailyLogs` is followed by a re-render via `refreshCalendarUI()` / `renderInsights()` (depending on the current view), so the UI is always consistent with what's in storage.
