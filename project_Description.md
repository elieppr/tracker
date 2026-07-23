# LifeSync Tracker - Product Requirements Document (PRD) V3

**Version:** 3.0 (Data Model + Visual System Refactor)  
**Target Platform:** iOS Progressive Web App (PWA)  
**Storage Strategy:** Private, Device-Only (Local Storage)  
**Author:** AI Assistant & User Collaborative Design  

---

## 1. Executive Summary & Project Objectives

The LifeSync Tracker is a lightweight, mobile-optimized Progressive Web App (PWA) designed specifically for iPhone. It is a personal logging tool for uncovering physiological and psychological correlation trends between energy, emotional valences, somatic symptoms, and behavioral variables. **V3** preserves the on-device privacy posture of V2 (no backend, no analytics, no cloud sync) while refactoring two foundational layers of the product:

1. The **data model** is now a flat stream of discrete, time-stamped *events* (one entry per Save) rather than the V2 *daily summary card* (one entry per Save bundling every channel).
2. The **visual system** has been rebuilt around a warm, mobile-first design language that is friendlier, easier to scan, and explicitly designed for thumb-sized touch targets.

Everything else the user already loves (customizable vocabulary, day-detail modal, retroactive logging, energy-over-time chart) is preserved.

---

## 2. Core Functional Requirements

### 2.1 The Daily Logger → Discrete Event Stream (Revised in V3)

The Log view is the primary entry surface and is designed for fast, thumb-friendly input under one hand.

#### A. Date & Time Selection
* **Default State:** Pre-filled with the current system date and time.
* **Manual Adjustment:** A native iOS-style calendar picker to allow retroactive logging for skipped days, fully integrated with the Calendar view.

#### B. Channel Picker (New UI in V3)
Each Save produces **a single logged thing**. The user first picks *what* they are logging, then enters the value in the appropriate panel. Five channels:

| Channel     | Input Control                     | Stored As                            |
|-------------|-----------------------------------|--------------------------------------|
| **Energy**  | Slider, 1–10 (default 5)          | `{ type:'energy',  value: 7 }`       |
| **Emotion** | Multi-select pill row (pos/neg)   | `{ type:'emotion', value: 'e_happy' }` (one entry per selected tag) |
| **Symptom** | Per-symptom row + severity (Mild / Mod / Sev) | `{ type:'symptom', value: 's_headache', severity:'severe' }` |
| **Activity**| Multi-select pill row             | `{ type:'activity', value: 'a_caffeine' }` (one entry per selected tag) |
| **Note**    | Plain-text textarea               | `{ type:'note', value: '…' }`        |

A multi-select Save (e.g. select Happy + Motivated) generates **two parallel entries** stamped with the same date+time. This preserves the V2 semantics of "I felt several things at once" while keeping each downstream record a single atomic event.

#### C. Sticky Save Pill (New in V3)
The **Save Entry** button is no longer inline at the bottom of the form. It is rendered as a **floating pill** anchored to `bottom = nav + 8px + safe-area-inset-bottom`. It is always visible regardless of form length, so the user never has to scroll to confirm a Save.

#### D. Custom Descriptor Customization & Category Management
Carried forward from V2 with no behavioural change. Users can add text labels and assign valence (Positive / Negative) for emotions, and define custom symptom or activity names. Deletion preserves historical signal via fallback sentinel ids (`fallback_positive`, `fallback_negative`, `fallback_symptom`, `fallback_activity`).

### 2.2 Continuous-Flow Calendar View (Revised in V3)

To replace the V2 "stack of five separate month blocks" with something the eye can actually scan continuously, V3 ships a **single seamless 7-col grid** that crosses month boundaries without section breaks.

* **Continuous day-number grid:** the calendar renders one uninterrupted grid spanning `today − 2 months` → `today + 3 months`. Leading empty days are back-filled to Sunday so the first row of every partial month is padded, then the next month begins on the same row at the appropriate weekday column.
* **Single sticky month label:** rather than a sticky month title per section, the entire view carries *one* small sticky label whose text is updated via an `IntersectionObserver` whenever the user scrolls a month's first cell into the visible strip. Avoids scroll-handler jank from `offsetTop` reads.
* **Visual indicators on each day cell:** bold day number, today = solid terracotta circle (was Apple red — recoloured under warm palette), small peach→terracotta energy bar at the bottom, accumulator valence dots (max 2: sage for any positive, dusty-rose for any negative), and a single warm brick-red `!` pip in the top-right if any moderate/severe symptom was logged that day.
* **Tap to inspect:** opens the day-detail modal (see 2.4).
* **Scrolling keeps you oriented:** the calendar scrolls vertically a few months in either direction; the sticky weekday header + month label sit over the grid at `top: 0` / `top: 44px` respectively, both `backdrop-blur-md` against the cream background.

### 2.3 Insights & Trend Graphics

Carried forward from V2 with a palette refresh:

* **Energy Over Time** — pure SVG, no dependencies. The trend line and points use the warm accent (`--ls-accent-deep`) over a peach gradient fill. Gridlines shift from `#e5e7eb` (cool slate) to `#ECE3D0` (cream-deep).
* **Stat cards** at the bottom — Average Energy, Positive tag count, Negative tag count, Days with data. Tones are now accent terracotta / sage / dusty-rose / ink-warm.

### 2.4 Day-Detail Modal & Timeline

Two views share the underlying per-entry stream:

* **Day modal** — bottom-sheet expanding from the bottom of the viewport. Each entry is its own row: time on the left, color-coded category dot in the center, type-tinted card on the right, **Del** button on the far right.
* **History / Timeline** — a chronological feed of every entry ever logged. One row per entry. The card background is **heavily tinted by category** so the user sees vertical "ribbons" of colour while scrolling: energy blocks (peach), emotion-pos blocks (sage), emotion-neg blocks (dusty rose), symptom blocks (yellow / amber / brick based on severity), activity blocks (dusty blue), note blocks (mocha cream).
* **Sticky date pills** anchored at `top: 0` interrupt the connecting thread visually via `backdrop-blur-md` but don't break the layout. Each pill carries the weekday + month-day and an entry count for that day.

---

## 3. Technical Specifications & Design System

### 3.1 Visual System — Warm Honey/Cream Palette (New in V3)

The V2 palette (pure white / Apple-blue / Apple-red / Apple-green) was clean but read as "clinical". V3 swaps it for **"morning sun on a kitchen table"**: warm cream backgrounds, terracotta accents, sage for positive emotion, dusty-rose for negative, dusty-blue for activity, mocha for note. Peak energy still goes warm brick-red so it reads as "you're on fire 🥵", not as an error.

| Token                  | Hex       | Used For                                          |
|------------------------|-----------|---------------------------------------------------|
| `--ls-bg`              | `#FAF6EE` | Page background (body)                            |
| `--ls-cream-soft`      | `#F5EFE3` | Section backgrounds, sticky pill backgrounds     |
| `--ls-cream-deep`      | `#ECE3D0` | Rules, dividers, weekday header, sticky borders   |
| `--ls-ink`             | `#3D3548` | Primary text (warm plum, not stark black)         |
| `--ls-ink-soft`        | `#6E5E5E` | Secondary text                                    |
| `--ls-ink-mute`        | `#A0876A` | Tertiary text (mocha)                             |
| `--ls-accent`          | `#D89B5C` | Tertiary brand accent — Today circle, primary CTA |
| `--ls-accent-deep`     | `#B47A3C` | CTA stroke, text on cream-tinted backgrounds      |

Category tints are declared once in `styles.css` (`.cat-energy`, `.cat-pos`, `.cat-neg`, `.cat-mild`, `.cat-mod`, `.cat-sev`, `.cat-activity`, `.cat-note`) so a future palette tweak only edits one place. JS references them by name from a `CAT_CARD_CLASS` map.

### 3.2 Phone-First Layout Rules (New in V3)

The V3 layout follows three rules borrowed from the Apple "Compact, Clear, Accessible" HIG:

1. **Safe-area insets are mandatory.** The header uses `padding-top: max(env(safe-area-inset-top), 12px)` (via the `pt-safe` utility), and the bottom-nav uses `padding-bottom: env(safe-area-inset-bottom)` (via `pb-safe`). The Save pill sits at `bottom: env(safe-area-inset-bottom) + 64px` so it floats above the nav + home indicator.
2. **Touch targets ≥ 44pt where state-bearing.** Channel chips, emotion pills, activity pills, and severity buttons all use `py-2.5` (10px) plus a `rounded-2xl` shape; combined with the cream-tinted padding they comfortably hit ≥44pt even at small iPhone widths.
3. **One primary action visible per view.** Log shows the Save pill floating above the form. History shows the open-modal trigger (tap a day). Insights shows the chart. Settings shows the "+" buttons next to the relevant input.

### 3.3 Local Storage Schema & Migration (Updated for V3)

The persisted payload is one JSON blob under the `lifesync_data` key:

```json
{
  "userSettings": {
    "customEmotions":   [{ "id": "e_happy", "name": "Happy", "valence": "positive" }, …],
    "customSymptoms":   [{ "id": "s_headache", "name": "Headache" }, …],
    "customActivities": [{ "id": "a_caffeine", "name": "Caffeine" }, …]
  },
  "dailyLogs": [
    { "id": "log_…", "date": "2026-07-22T08:30", "type": "energy",   "value": 7 },
    { "id": "log_…", "date": "2026-07-22T08:31", "type": "emotion",  "value": "e_happy" },
    { "id": "log_…", "date": "2026-07-22T08:32", "type": "symptom",  "value": "s_headache", "severity": "moderate" },
    { "id": "log_…", "date": "2026-07-22T08:33", "type": "activity", "value": "a_caffeine" },
    { "id": "log_…", "date": "2026-07-22T11:00", "type": "note",     "value": "Strong morning." }
  ],
  "meta": { "seeded": true, "migratedToV3": true }
}
```

#### V2 → V3 Migration (one-time, idempotent)
On load, if `meta.migratedToV3` is not set, every V2 *daily card* is exploded into one entry per channel:
- `log.energy` (number) → `{ type:'energy', value }`
- `log.emotions[]` → `{ type:'emotion', value }` per id
- `log.symptoms[]` → `{ type:'symptom', value, severity }` per id
- `log.activities[]` → `{ type:'activity', value }` per id
- `log.notes` (non-empty string) → `{ type:'note', value }`

After the explode, `meta.migratedToV3 = true` is persisted so subsequent loads are no-ops.

### 3.4 Offline PWA Engine

Unchanged from V2 — `manifest.json` declares `standalone` display and is sufficient for "Add to Home Screen" on iOS. All rendering and chart math is local; no network calls.

---

## 4. Touchpoints That Changed in V3 (Quick Reference)

| Area                       | V2                                         | V3                                                                  |
|----------------------------|--------------------------------------------|---------------------------------------------------------------------|
| Log form                   | One form, one Save, bundle it all          | Channel picker + 5 panels, one channel, one (or N) entries per Save |
| Save button                | Inline at bottom of form                   | Floating pill anchored above bottom nav                             |
| Calendar month headings    | One sticky title per stacked month         | One sticky title for the entire view, updates on scroll             |
| Calendar today circle      | Apple red `#ff3b30`                        | Warm terracotta accent `#D89B5C`                                    |
| Energy color ramp          | Apple-blue monochrome                      | Peach → terracotta → brick red                                      |
| Timeline cards             | Uniform white background                   | Category-tinted backgrounds form visual ribbons                     |
| Bottom nav / Header        | Apple blue + white                         | Cream + warm ink + terracotta accent                                |
| Overall mood               | Clinical/Apple                             | Warm/morning-kitchen                                                |
