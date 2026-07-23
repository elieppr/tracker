# LifeSync Tracker — Code Overview

A walkthrough of what the codebase currently does, file by file and section by section.

## What the App Is

**LifeSync Tracker** is a single-page, mobile-first web app (installable as a PWA via `manifest.json`) for logging daily **energy levels** and **emotions**. It persists everything to `localStorage`, so it works fully offline with no backend.

The project consists of five files in the project root:

| File          | Purpose                                                                 |
|---------------|-------------------------------------------------------------------------|
| `index.html`  | Markup for the four views (Log / Calendar / Insights / Settings), nav, modal, and styling script tags |
| `styles.css`  | Tiny CSS: hides scrollbars, prevents iOS tap highlight, sets Apple-font fallback |
| `app.js`      | All behavior: state, rendering, navigation, logging, calendar, modal, settings |
| `manifest.json` | PWA manifest (standalone display, iPhone installable)                |
| `README.md`   | Placeholder (just contains `# tracker`)                                 |

Styling is mostly delivered through **Tailwind CSS**, loaded from a `<script>` CDN tag in `index.html`. The four views themselves are static sections in the DOM; the JS engine swaps which one is visible.

---

## `app.js` — The Entire App

`app.js` is a single ~440-line script split into eight numbered sections. Below is what each one does.

### 1. Default Datasets & State

- **`DEFAULT_EMOTIONS`** — A hard-coded list of six starter emotions, each with `id`, `name`, and a `valence` of `"positive"` or `"negative"`. Three of each.
- **`generateMockData()`** — Builds five sample logs scattered across the last week and today, so the calendar is never empty on first launch.
- **`state`** — A single in-memory object:
  ```js
  state = {
    userSettings: { customEmotions: [] },
    dailyLogs: []                  // each log: { id, date (ISO-ish), energy (1–10), emotions: [id…] }
  }
  ```
- **`activeCalendarMode`** — Tracks whether the History tab is in `'month'` or `'timeline'` mode.

### 2. Initialization (`window 'load'`)

Runs once on page load and:

1. Pre-fills the "Date & Time" picker in the Log view with the current local time (`resetLogDatePicker`).
2. Reads `localStorage['lifesync_data']` and parses it into `state`.
3. Runs a small **schema validator** that guarantees `state.userSettings.customEmotions` and `state.dailyLogs` exist; if either is empty, it seeds them with the defaults / mock data.
4. Persists the normalized state back to `localStorage` (so a corrupt or missing payload always heals itself).
5. Renders the emotion lists into both the Log and Settings views via `renderEmotionsInLogger()` / `renderEmotionsInSettings()`.

Helpers in this section:
- `resetLogDatePicker()` — sets the `<input type="datetime-local">` value to "now", timezone-correct.
- `saveStateToLocalStorage()` — `JSON.stringify(state)` → `localStorage`.

### 3. Navigation Controller

A lightweight tab router between the four sections identified by id:

```
'view-log' | 'view-calendar' | 'view-insights' | 'view-settings'
```

- **`switchTab(tabId)`** hides every view, shows the chosen one, recolors the bottom-nav icon, updates the header title, and — only for the Calendar tab — unhides the **mode switcher** (Month / Timeline) and re-renders the calendar.
- **`setCalendarMode(mode)`** toggles `#calendar-month-container` vs `#calendar-timeline-container` and re-styles the two pill buttons to show which is active.
- **`refreshCalendarUI()`** dispatches to either the month renderer or the timeline renderer based on `activeCalendarMode`.

### 4. Logging Engine

This is the data-entry view. It exposes three controls that the user can change before tapping **Save Entry**:

- **Date/time** — `<input type="datetime-local" id="log-date">`. Default = current moment.
- **Energy** — `<input type="range" id="log-energy" min=1 max=10 value=5>`. The numeric label is updated live by `updateEnergyDisplay(val)` (e.g. "7/10").
- **Emotions** — Two pill button rows, one per valence, populated dynamically from `state.userSettings.customEmotions`.

Behavior:
- `renderEmotionsInLogger()` rebuilds the two button rows every time the underlying list changes (initial load, plus any add/delete from Settings).
- Each button toggles its own visual state on click — green (`bg-emerald-500`) for positive, rose (`bg-rose-500`) for negative — using class-list swaps.
- **`saveCurrentLog()`**:
  1. Reads date / energy / selected emotion IDs (a button is "selected" if it has the green or rose class).
  2. Pushes a new entry shaped `{ id: 'log_' + Date.now(), date, energy, emotions }` onto `state.dailyLogs`.
  3. `saveStateToLocalStorage()`.
  4. Resets the slider (5), resets the date picker to "now", re-renders the emotion buttons so the toggled colors clear.
  5. Briefly flips the Save button to "✓ Saved" (green) for 1.5s for visual confirmation.

### 5. Monthly Calendar Engine

`renderAppleStyleCalendar()` produces an "Apple-style" stacked-month calendar in `#apple-calendar-stack`:

- Renders **five consecutive months**: three months ago, two months ago, last month, this month, next month (`offset` from -3 to +1).
- Each month is a `<div>` containing a sticky title (`Month Year`) and a 7-column grid that respects the leading empty cells for the first day of the month.
- After rendering, the scrolling container is scrolled to roughly the middle so the user lands near the current month (`container.scrollTop = container.scrollHeight / 2`, in a `setTimeout` because the height must settle first).

The per-day styling encodes two pieces of information:

1. **Average energy** — Color of the circle (no fill / blue-100 / blue-200 / blue-400 / blue-600, based on `avgEnergy <= 3, 6, 8, >8`).
2. **Emotion valence** — A `ring` (border-ring) on the day circle:
   - Green ring if any positive emotion is present.
   - Rose ring if any negative emotion is present.
   - Amber ring if **both** are present (mixed day).
3. **Today** — If no logs exist for "today", it just gets bold blue text on the number.

Clicking any day invokes `openDayModal(dateString, dayLogs)`.

### 6. Timeline Engine

`renderSeamlessTimeline()` is an alternative history view rendered into `#continuous-timeline-feed`. It is a vertical timeline of every individual log, sorted newest-first (`b.date.localeCompare(a.date)`).

For each unique date in the sorted feed, a small dot + weekday/date badge is inserted as a divider (`lastRenderedDateString` tracks the previous date to avoid duplicates). Each log node has:

- A circular stamp on the left (`<div class="w-14 h-14">`) whose color reflects emotion valence:
  - Green if positive only, rose if negative only, amber if mixed, blue if no emotion data — and it displays the log's local time (`logDateObj.toLocaleTimeString('en-US', …)`).
- A content box on the right with the energy score (`Energy Level: 7/10`) and a row of emotion chips (each looked up by id from `state.userSettings.customEmotions`, falling back if missing).
- A pastel grey line connecting the circles (drawn in HTML using a positioned pseudo-rail element in `#calendar-timeline-container`).

Clicking any individual entry also opens the same day-detail modal as the calendar view.

### 7. Modal Engine

A bottom-sheet style modal used to inspect day details and modify data without leaving the History view.

- **`openDayModal(dateString, logs)`**:
  - Shows `#day-modal`, slides the `#day-modal-sheet` up (by removing `translate-y-full`).
  - Sets `#modal-date-title` to "Month Day" via `toLocaleDateString`.
  - If there are no logs for that date, it shows a friendly empty state with an **Add Entry** button that calls `shortcutRetroactiveLog(dateString)` — that flips back to the Log tab with the date picker pre-loaded.
  - Otherwise, it lists one card per log with the localized time, the energy score, emotion chips, and a **Delete** button per log.
- **`closeDayModal()`** — Animates the sheet back down (`translate-y-full`), then hides the overlay after 300 ms to match the CSS transition.
- **`deleteLog(logId, dateString)`** — Confirms with the user, removes the log, persists, refreshes the calendar, and either closes the modal (last log on that day) or re-opens it with the remaining logs.

### 8. Settings Engine

This view lets the user manage their personal emotion vocabulary.

- **`renderEmotionsInSettings()`** — Lists each emotion with its valence tag and a `Del` button.
- **`addNewEmotion()`** — Reads the new emotion name + valence (positive/negative) from the form, generates an id (`'custom_' + Date.now()`), appends it to `state.userSettings.customEmotions`, persists, and re-renders both the logger and the settings list.
- **`deleteEmotion(emotionId)`** — Confirms, removes the emotion from the vocabulary, and **rewrites** every existing log: any reference to that emotion id is replaced with a `fallback_positive` or `fallback_negative` placeholder. This preserves the valence coloring in past data even though the named emotion no longer exists. It then persists and re-renders.

The fallback sentinel ids (`fallback_positive`, `fallback_negative`) are recognized by the calendar/timeline renderers, so days logged with a now-deleted emotion still appear with the correct valence ring/tint.

---

## `index.html` — The Skeleton

The DOM is composed of:

1. **`<header>`** — A frosted backdrop-blur bar containing the dynamic title (`#app-title`) and the hidden Calendar mode switcher (`Month` / `Timeline`).
2. **`<main id="main-content">`** — Holds the four stacked `<section>` views (only one is visible at a time):
   - `#view-log` — date-time input, energy slider, two emotion button lists, Save button.
   - `#view-calendar` — `#calendar-month-container` (sticky weekday header + `#apple-calendar-stack`) and `#calendar-timeline-container` (rail + `#continuous-timeline-feed`).
   - `#view-insights` — Currently a placeholder: *"Analytics and graphs are coming in Step 3!"*
   - `#view-settings` — Form to add new emotions + a list of existing ones.
3. **`#day-modal`** — A fixed, bottom-aligned sheet. Hidden by default; JS adds `.translate-y-full` then removes it to animate up.
4. **`<nav>`** — Bottom tab bar with four SVG-icon buttons (`#btn-log`, `#btn-calendar`, `#btn-insights`, `#btn-settings`) that call `switchTab(...)`.

The `app.js` script is loaded with `defer` so the DOM is fully parsed before it runs.

## `styles.css`

Three small additions on top of Tailwind:
- Disables `-webkit-tap-highlight-color` (removes blue flash on iOS tap).
- Uses `-apple-system, BlinkMacSystemFont` etc. so the UI adopts the iOS-native font stack automatically.
- Respects `env(safe-area-inset-bottom)` and `env(safe-area-inset-top)` for iPhone notch/home-bar clearance.
- Hides scrollbars via `.no-scrollbar` (used by the calendar and timeline scroll regions for an "app-like" feel).

## `manifest.json`

Minimal PWA manifest. `name: "My Free iPhone App"`, `short_name: "FreeApp"`, `display: "standalone"`, `start_url: "index.html"`, with a blue theme color (`#007aff`) and a light background. This is what makes the page installable to an iPhone home screen.

---

## Data Flow at a Glance

```
User toggles emotion & taps Save
        │
   saveCurrentLog()
        │
        ▼
state.dailyLogs.push(newLog) ──► saveStateToLocalStorage()
        │
        ▼ (next visit to History tab)
   switchTab('calendar')
        │
        ▼
   renderAppleStyleCalendar()  ◄── reads state.dailyLogs
   or renderSeamlessTimeline()
```

Adding/editing an emotion from Settings re-flows into both the Log view and the History view automatically because the render functions key off `state.userSettings.customEmotions` and are re-run after each mutation.
