# LifeSync Tracker - Product Requirements Document (PRD) V6.5

**Version:** 6.5 (Curation + Inline Builder)  
**Target Platform:** iOS Progressive Web App (PWA)  
**Storage Strategy:** Private, Device-Only (Local Storage)  
**Author:** AI Assistant & User Collaborative Design  

---

## 1. Executive Summary & Project Objectives

The LifeSync Tracker is a lightweight, mobile-optimized Progressive Web App (PWA) designed specifically for iPhone. It is a personal logging tool for uncovering physiological and psychological correlation trends between energy, emotional valences, somatic symptoms, behavioral variables, and user-defined categories. **V6.5** preserves the on-device privacy posture of all prior versions (no backend, no analytics, no cloud sync) while introducing three foundational upgrades on top of V6 (Sleep + Custom Categories) and V5 (Stream mode + Insights tabs):

1. **Curated Insights.** The Insights view's three sub-tabs (Trends / Patterns) now ship only cards that earn their keep — discovering patterns the eye can't see in raw rows — and drop redundant charts that overlapped with the Stream / Calendar views.
2. **Inline Category Builder.** The Log tab now exposes a `+ New custom category` pill beneath the channel picker that opens an in-place form (name + 6 color swatches + 3-way type selector with conditional scale min/max + Cancel/Save). Users no longer have to navigate to Settings to extend the schema.
3. **Massive-typography summary headlines.** The bottom-of-Insights summary card was simplified from 4 small stat cards to 2 huge-number headlines (Average Energy, Your Best Day), so the most personal number reads like a wall on first glance.

Everything the user already loved (V3 continuous-flow calendar, V4 Kanban timeline, V4.1 bottom-nav fitting, V5 Stream mode, V6 Sleep) is preserved.

---

## 2. Core Functional Requirements

### 2.1 The Daily Logger → Discrete Event Stream (V3; extended in V6)

The Log view is the primary entry surface and is designed for fast, thumb-friendly input under one hand. Each Save produces **a single logged thing** — the user first picks *what* they are logging, then enters the value in the appropriate panel. The channel set is now extensible:

| Channel     | Scope           | Input Control                                  | Stored As                                              |
|-------------|-----------------|------------------------------------------------|--------------------------------------------------------|
| **Energy**  | Built-in        | Slider, 1–10 (default 5)                       | `{ type:'energy',  value: 7 }`                         |
| **Emotion** | Built-in        | Multi-select pill row (pos/neg)                | `{ type:'emotion', value: 'e_happy' }` (one per tag)   |
| **Symptom** | Built-in        | Per-symptom row + severity (Mild / Mod / Sev)  | `{ type:'symptom', value: 's_headache', severity:'severe' }` |
| **Activity**| Built-in        | Multi-select pill row                          | `{ type:'activity', value: 'a_caffeine' }` (one per tag)|
| **Note**    | Built-in        | Plain-text textarea                            | `{ type:'note', value: '…' }`                          |
| **Sleep**   | Built-in (V6)   | Slider, 0–12 (step 0.5, default 7)             | `{ type:'sleep', value: 7.5 }` (hours)                  |
| **Custom**  | User-defined (V6)| Scale slider / On-Off toggle / Note textarea  | `{ type: '<catId>', value: <appropriate> }`            |

A custom category is created by calling `addCustomCategory(name, color, type, scaleMin?, scaleMax?)`. The V6 lifecycle guarantees every custom category is registered into `ENTRY_TYPES` + `CHANNEL_LABEL` + the Stream filter map, so it becomes loggable from the Log tab, visible in the Stream grid, and color-resolvable everywhere — without bespoke schema wiring for each new channel.

#### 2.1a Channel Picker + Inline Category Builder (V6.5)

Beneath the channel picker (the 6-7 chip row that lets the user pick what to log *now*), a single dashed-bordered `+ New custom category` pill sits. On tap, an inline-builder sheet expands *in place* (no Settings navigation required):

- **Name input** — single text field, max 30 chars, blank/duplicate rejected.
- **6 color swatches** — Terracotta, Sage, Dusty Blue, Mocha, Brick, Deep Amber. One is selected at a time and lifted with a terracotta stroke ring (`.builder-swatch.on`).
- **3-way type segmented control** — Scale / On/Off / Note. Selecting Scale slides down Min + Max numeric inputs; the other two hide the row.
- **Cancel / Save** buttons in a 50/50 split at the bottom. Save is disabled (visual flicker on the name field border) for duplicates.

On Save, the category is registered into `state.userSettings.customCategories`, pushed into `ENTRY_TYPES`, set in `CHANNEL_LABEL`, optionally seeded into `streamFilters`, persisted to `localStorage`, after which:
1. The picker is re-rendered — the new chip appears in the row.
2. `currentChannel` is auto-set to the new category's id.
3. The form closes and the per-channel panel flips to the new category's panel (slider for Scale, On/Off toggle for Binary, textarea for Note).

This brings the discoverability problem (V6's Settings-only builder hidden behind a tab nobody visits while logging) directly into the active logging flow.

### 2.2 Continuous-Flow Calendar View (V3)

Unchanged from V3: a single seamless 7-col grid that crosses month boundaries. Today = terracotta circle (was Apple red). Tap any cell to inspect via the day-modal.

### 2.3 History / Timeline (Unchanged V3–V4.5; new V5 + V6.4 polish)

Four modes selectable via a pill switcher in the History view's header:

| Mode         | Renderer                  | Replaces                                  |
|--------------|---------------------------|--------------------------------------------|
| **Month**    | `renderContinuousCalendar` | V2 stacked-month grid                     |
| **List**     | `renderSeamlessTimeline`   | V2 linear timeline with per-day sections    |
| **Day**      | `renderDayTimeline`       | (V5) A horizontal day-by-day swimlane      |
| **Kanban**   | `renderKanbanTimeline`    | (V4) 5-lane column swimlanes                |
| **Stream**   | `renderStreamTimeline`    | (V5) Time-rows × Category-columns grid     |

**Stream mode (V5) visual story:** the timeline is time-rooted, not activity-rooted. 24 hour-rows stack vertically (top→bottom 00:00 → 23:59); 5+ category columns (Energy / Emotion / Symptom / Activity / Sleep + each user's custom category) sit side-by-side horizontally. Each (time-row, category-column) cell contains a stack of small dots whose `opacity` encodes severity/value, so a glance down the Sleep column tells you when you typically sleep. Filter chips at the top let the user hide columns. A sticky day-stepper lets the user traverse days without scrolling into the grid.

**V6.4 polish on Stream:** each row receives a subtle linear-gradient background tied to its hour-of-day (dawn 5–7 peach, morning 8–11 gold cream, afternoon 12–16 neutral cream, dusk 17–20 amber wash, night deep navy-warm). The timeline now *visually breathes time* without screaming for attention.

**V6.4 polish on Log:** all `#channel-picker` chips lift 1px with a soft shadow on hover (Apple-HIG 44 px touch targets preserved).

### 2.4 Insights & Trend Graphics (V5 + V6.5 curation)

**3 sub-tabs:** Trends, Patterns (Calendar sub-tab was retired in V6.5 because it overlapped with the Month calendar view; `renderCalendarSeverityMap` dropped from the registry).

#### 2.4a Insights Summary Card (V6.5 simplification)

Replaced the V4 four-card grid (Avg Energy / Positive tags / Negative tags / Days logged) with **two huge 44 px-black headlines**:
- **Average Energy** — colour-coded (deep amber ≥7, terracotta 4–6, brick <4). Reads instantly on first glance.
- **Your Best Day** — auto-detects the day-of-week with the highest average energy, requires >=7 days of energy entries to surface a name.

#### 2.4b Trends tab (V6.5 curation)

| Card | Verdict (V6.5) | Why |
|------|----------------|-----|
| ~~`renderEnergyTrendChart`~~ | **DROPPED** | A line of dots over time just shows time passing; the same dots already appear in the Stream grid. |
| ~~`renderMultiAxisChart`~~    | **DROPPED** | Stacked axes force the user to do the analytical heavy-lifting; over-engineered. |
| `renderDayOfWeekChart`        | **KEPT + ENHANCED** | Compresses time; one glance shows your weekly pattern + auto-highlights best/worst day. |
| `renderRoutineImpact` (NEW)   | **NEW**           | For every activity: average energy + positive-emotion ratio on days WITH vs days WITHOUT. Surfaces the headline insight *"You feel +1.8 energy on days you log Workout"*. |

#### 2.4c Patterns tab (V6.5 curation)

| Card | Verdict (V6.5) | Why |
|------|----------------|-----|
| `renderTopInfluencers`        | **KEPT + ENHANCED** | Actionable discovery vehicle; cards state the delta in plain language. |
| `renderBehavioralCorrelationGrid` | **KEPT + ENHANCED** | Stronger heat-map gradient; pops high-impact cells instantly. |
| `renderTimeToEffect` (NEW)    | **NEW**           | For every (activity, symptom) pair: count how often the symptom occurs within 120 min after the activity. Surfaces the temporal headline *"70% of your severe headaches fall within 2 hours of Caffeine"*. |
| `renderSymptomCooccurrenceChart` | **KEPT**       | Useful for users tracking health cascades; smaller footprint, lower visual weight. |

#### 2.4d [Retired sub-tab] Calendar

`renderCalendarSeverityMap` was identical information to what the Month calendar already shows. Dropped entirely; the Month view IS the calendar insight.

### 2.5 Day-Detail Modal & Timeline (V3 + V4 polish — unchanged from V6)

Unchanged: bottom-sheet modal with per-entry rows (time + colored dot + tinted card + Del button), staggered date pills in the vertical Timeline feed with backdrop-blur cream over a thread.

### 2.6 Settings Engine (V6 extension)

Carried forward from V3/V4 with no behavioural change:
- Custom Emotions list (multi-row + add form + valence pill).
- Custom Symptoms list (multi-row + add form).
- Custom Activities list (multi-row + add form).
- **NEW (V6): Custom Categories list** — full CRUD for the extensible category registry used by both the Inline Builder in Log and the Settings panel itself. Deletion preserves historical signal via the `fallback_custom: 'Deleted Custom Category'` sentinel.
- Theme picker + Accent picker (V4).

---

## 3. Technical Specifications & Design System

### 3.1 Visual System — Warm Honey/Cream Palette (V3; refined V6.4/V6.5)

Unchanged V3 palette + V4 cat-* classes + V6 `cat-sleep` (dusty blue tint `#D7E4EF`) + V6.4 tod-* row gradients + V6.5 builder-swatch ring + V6.5 stat-headline 44 px-black.

### 3.2 Phone-First Layout Rules (V3; refined V4.1)

1. **Safe-area insets** via `pt-safe` / `pb-safe` utilities.
2. **Touch targets ≥44 pt**: channel chips, severity buttons, builder swatches (36 px circle), builder segmented buttons all clear the bar.
3. **One primary action per view**, but now with discoverable secondaries (the `+ New custom category` pill sits beneath the channel picker without stealing focus from the channel itself).

### 3.3 Local Storage Schema & Migration (V3 → V6.5)

```json
{
  "userSettings": {
    "customEmotions":   [{ "id": "e_happy", "name": "Happy", "valence": "positive" }, …],
    "customSymptoms":   [{ "id": "s_headache", "name": "Headache" }, …],
    "customActivities": [{ "id": "a_caffeine", "name": "Caffeine" }, …],
    "customCategories": [{ "id": "sleep",     "name": "Sleep", "type": "scale", "scaleMin": 0, "scaleMax": 12, "color": "#7C9CB1" }, …],
    "preferences": {
      "theme":         "warm-cream",
      "accent":        "terracotta",
      "insightsRange": "all",
      "insightsTab":   "trends",
      "streamDate":    "<today's YYYY-MM-DD>",
      "streamFilters": { "energy": true, "emotion": true, "symptom": true, "activity": true, "note": true, "sleep": true, "<customId>": true }
    }
  },
  "dailyLogs": [
    { "id": "log_…", "date": "2026-07-22T08:30", "type": "energy",   "value": 7 },
    { "id": "log_…", "date": "2026-07-22T22:30", "type": "sleep",    "value": 7.5 },
    { "id": "log_…", "date": "2026-07-22T13:30", "type": "a_workout_or_userCu_xxx", "value": "a_workout" },
    …
  ],
  "meta": { "seeded": true, "migratedToV3": true, "migratedToV4": true }
}
```

#### V2 → V3 + V4 migrations carry forward as before. V6.5 is additive (no schema break).

### 3.4 Offline PWA Engine

Unchanged: `manifest.json` standalone, all rendering + chart math local, no network calls.

---

## 4. Touchpoints That Changed in Each Release (Quick Reference)

| Area                       | V3                                 | V4                                 | V5                                  | V6                                  | V6.5                                                              |
|----------------------------|------------------------------------|------------------------------------|-------------------------------------|-------------------------------------|-------------------------------------------------------------------|
| Log form                   | Channel picker + 5 panels          | (unchanged)                        | (unchanged)                         | + Sleep as 6th channel              | + inline `+ New custom category` builder                            |
| Channel picker hover        | (none)                            | (none)                              | (none)                              | (none)                              | 1 px lift + soft shadow on inactive chips                          |
| History modes              | 2 (Month, List)                    | 4 (Month, List, Day*, Kanban*)     | 5 (+ Stream)                        | (unchanged)                         | tod-* AM/PM whisper gradient on Stream rows                       |
| Save button                | Inline? Floating pill              | Floating pill (V4.1 nav-fitting)   | (unchanged)                         | (unchanged)                         | (unchanged)                                                       |
| Insights cards             | Energy trend + summary             | + 3 new charts                     | 3-tab restructure (V5)             | (unchanged)                         | **Curation**: drop redundant + add 2 new cards; massive-typography summary |
| Settings — Custom Categories | (none)                          | (none)                              | (none)                              | Add via bottom-of-Settings form      | Same form also surfaced inline in Log view                          |
| Bottom nav / Header        | Cream + terracotta                 | (unchanged)                        | (unchanged)                         | (unchanged)                         | (unchanged)                                                       |
| Overall mood               | Warm morning kitchen               | Warm morning kitchen              | Warm morning kitchen + time-aware    | + extensible                         | + discoverable + curated                                           |

---

## 5. Design Intuition Notes (for the curious)

A few rules of thumb the assistant held to while designing V6.5. These are not in the code per se but shape decisions across rounds:

- **Cards earn their keep** by showing patterns the user couldn't see by reading rows. Generic aggregations are noise near the Timeline view.
- **Discoverability** is more important than organization. A feature that *exists* but is *hidden* does not exist to the user mid-task.
- **Massive typography first, fine print second**. Phone screens reward one wall-of-a-number headlines over grids of small stats.
- **Time-rooted, not activity-rooted**. The Stream view's "time is the spine, activities hang off it" framing is the canvas for everything time-driven in this app.

---

*End of V6.5 PRD.*
