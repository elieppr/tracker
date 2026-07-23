// =============================================================================
// LifeSync Tracker - app.js
// V4: data model unchanged (per-entry flat array). UI adds: theme picker,
// accent picker, Kanban timeline mode (5-lane scroll-snap), behavioral
// correlation grid, symptom co-occurrence chart, insights date-range
// filter, calendar zebra row striping + column rules, reduced timeline
// time gutter (64 -> 40 px).
// Sections:
//   1. Default datasets & state
//   2. Initialization (incl. V2 -> V3 data migration + V3 -> V4 prefs)
//   3. Navigation controller
//   4. Logger engine (channel picker + per-channel forms)
//   5. Continuous calendar engine (sticky month label + zebra + rules)
//   6. Timeline engine (list + kanban modes)
//   7. Day modal engine (per-day entries as slim rows)
//   8. Settings engine (emotions / symptoms / activities)
//   8b. Appearance engine (theme + accent picker, V4)
//   9. Insights engine (trend chart + behavioral correlation + co-occurrence + summary)
// =============================================================================

// --- 1. DEFAULT DATASETS & STATE ---------------------------------------------

const DEFAULT_EMOTIONS = [
    { id: "e_happy",       name: "Happy",     valence: "positive" },
    { id: "e_calm",        name: "Calm",      valence: "positive" },
    { id: "e_motivated",   name: "Motivated", valence: "positive" },
    { id: "e_stressed",    name: "Stressed",  valence: "negative" },
    { id: "e_irritated",   name: "Irritated", valence: "negative" },
    { id: "e_anxious",     name: "Anxious",   valence: "negative" }
];

const DEFAULT_SYMPTOMS = [
    { id: "s_headache",        name: "Headache" },
    { id: "s_fatigue",         name: "Fatigue" },
    { id: "s_blurred_vision",  name: "Blurred Vision" },
    { id: "s_nausea",          name: "Nausea" }
];

const DEFAULT_ACTIVITIES = [
    { id: "a_caffeine",    name: "Caffeine" },
    { id: "a_workout",     name: "Workout" },
    { id: "a_alcohol",     name: "Alcohol" },
    { id: "a_meditation",  name: "Meditation" }
];

// V6: extensible categories beyond the fixed 5 hardcoded channels. Sleep is
// the first shipped example. Each category has a value `type`:
//   - 'scale' : numeric `value` in [scaleMin, scaleMax] (e.g. Energy 1-10, Sleep 0-12)
//   - 'binary' : single tap on/off (e.g. custom behaviors)
//   - 'note'   : freeform text `value`
const DEFAULT_EXTRA_CATEGORIES = [
    { id: "sleep", name: "Sleep", type: "scale", scaleMin: 0, scaleMax: 12, color: "#7C9CB1" }
];

// Sentinel IDs for deleted custom descriptors - preserve historical signal.
const FALLBACK_LABEL = {
    fallback_positive: "Deleted Positive Emotion",
    fallback_negative: "Deleted Negative Emotion",
    fallback_symptom:  "Custom Symptom (Deleted)",
    fallback_activity: "Custom Activity (Deleted)",
    fallback_custom:   "Deleted Custom Category"
};

// Warm Honey/Cream severity palette. These pairs are: tailwind/bg-class for the
// solid-card button (SEVERITY_COLOR) and CSS variable foreground for the
// text-only chips in the timeline + modal (SEVERITY_TEXT_COLOR).
// V4: curated theme + accent catalogues. Order / option flags drive the
// rendering order in Settings. Adding a palette = add a [data-theme] block
// in styles.css + append here.
const THEMES        = ['warm-cream', 'soft-paper', 'dim-warm'];
const ACCENT_NAMES  = ['terracotta', 'sage', 'mocha', 'ink', 'blush'];
const DEFAULT_THEME = 'warm-cream';
const DEFAULT_ACCENT= 'terracotta';

const SEVERITY_COLOR = {
    mild:     "bg-[#F1D88A] text-[#3D3548]",
    moderate: "bg-[#E89C5B] text-white border border-[#B47A3C]",
    severe:   "bg-[#C44033] text-white border border-[#A0332A]"
};
const SEVERITY_TEXT_COLOR = {
    mild:     "text-[#B39052]",
    moderate: "text-[#B47A3C]",
    severe:   "text-[#A0332A]"
};
// Cat-* classes are sourced from styles.css so the tint set stays in one place.
const CAT_CARD_CLASS = {
    energy:   "cat-energy",
    pos:      "cat-pos",
    neg:      "cat-neg",
    mild:     "cat-mild",
    mod:      "cat-mod",
    sev:      "cat-sev",
    activity: "cat-activity",
    note:     "cat-note"
};

// ~95 discrete per-entry records spread across 8 recent days with realistic
// time-of-day distribution: morning wake burst (7-9), midday plateau (12-14),
// evening wind-down (18-21), and a sleep entry near 22-23. Designed to fill
// the Stream grid (lots of dots spread across hours) and give the Insights
// charts (energy trend, weekday avg, etc.) enough signal to look real.
const generateMockData = () => {
    const today = new Date();
    const isoOf = (d, h, m) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const yest   = new Date(today); yest.setDate(today.getDate() - 1);
    const twoAgo = new Date(today); twoAgo.setDate(today.getDate() - 2);
    const wkAgo  = new Date(today); wkAgo.setDate(today.getDate() - 5);
    let idN = 0;
    const id = () => `mock_${idN++}`;

    return [
        // 5 days ago
        { id: id(), date: isoOf(wkAgo, 10, 15), type: 'energy',   value: 6 },
        { id: id(), date: isoOf(wkAgo, 10, 16), type: 'emotion',  value: 'e_calm' },
        { id: id(), date: isoOf(wkAgo, 10, 30), type: 'activity', value: 'a_meditation' },
        { id: id(), date: isoOf(wkAgo, 21, 0),  type: 'note',     value: 'Quiet Saturday.' },
        { id: id(), date: isoOf(wkAgo, 23, 30), type: 'sleep',    value: 7.5 },

        // 2 days ago
        { id: id(), date: isoOf(twoAgo, 22, 0),  type: 'energy',   value: 5 },
        { id: id(), date: isoOf(twoAgo, 22, 5),  type: 'emotion',  value: 'e_calm' },
        { id: id(), date: isoOf(twoAgo, 22, 30), type: 'note',     value: 'Tired but ok.' },

        // Yesterday morning
        { id: id(), date: isoOf(yest,  8, 30), type: 'energy',   value: 3 },
        { id: id(), date: isoOf(yest,  8, 31), type: 'emotion',  value: 'e_anxious' },
        { id: id(), date: isoOf(yest,  8, 32), type: 'emotion',  value: 'e_stressed' },
        { id: id(), date: isoOf(yest,  8, 33), type: 'symptom',  value: 's_headache', severity: 'moderate' },
        { id: id(), date: isoOf(yest,  9, 15), type: 'activity', value: 'a_caffeine' },

        // Yesterday afternoon
        { id: id(), date: isoOf(yest, 13, 0),  type: 'energy',   value: 7 },
        { id: id(), date: isoOf(yest, 13, 1),  type: 'emotion',  value: 'e_happy' },
        { id: id(), date: isoOf(yest, 13, 30), type: 'activity', value: 'a_workout' },

        // Today morning
        { id: id(), date: isoOf(today,  9, 0),  type: 'energy',   value: 8 },
        { id: id(), date: isoOf(today,  9, 5),  type: 'emotion',  value: 'e_motivated' },
        { id: id(), date: isoOf(today,  9, 6),  type: 'emotion',  value: 'e_happy' },
        { id: id(), date: isoOf(today,  9, 30), type: 'activity', value: 'a_caffeine' },
        { id: id(), date: isoOf(today, 10, 30), type: 'activity', value: 'a_workout' },
        { id: id(), date: isoOf(today, 11, 0),  type: 'note',     value: 'Strong morning.' },

        // Today afternoon
        { id: id(), date: isoOf(today, 14, 30), type: 'energy',   value: 4 },
        { id: id(), date: isoOf(today, 14, 31), type: 'emotion',  value: 'e_stressed' },
        { id: id(), date: isoOf(today, 14, 32), type: 'symptom',  value: 's_fatigue', severity: 'severe' },
        { id: id(), date: isoOf(today, 14, 33), type: 'activity', value: 'a_caffeine' },
        { id: id(), date: isoOf(today, 14, 35), type: 'note',     value: 'Post-lunch crash.' },
        // Sleep entries (logged the night before)
        { id: id(), date: isoOf(yest, 22, 30), type: 'sleep', value: 6.5 },
        { id: id(), date: isoOf(twoAgo, 23, 0), type: 'sleep', value: 8 },

        // ---- Additional history (extra days) so Stream + Insights have signal ---
        // Pattern: morning check-in (7-9), midday check-in (12-14),
        // afternoon log (16-17), evening wind-down (19-21), sleep (22-23).
        // Mix of energy/emotion/symptom/activity + sleep each day, slightly
        // variable so Insights weekday aggregates look real.
        ...(() => {
            const extra = [];
            // 3-8 days ago: synthetic entries (deterministic via fixed offset).
            for (let delta = 3; delta <= 8; delta++) {
                const day = new Date(today); day.setDate(today.getDate() - delta);
                const hh = (n) => [Math.floor(n), Math.round((n % 1) * 60)];
                const push = (h, m, type, value, sev) => extra.push({
                    id: id(), date: isoOf(day, h, m), type, value, severity: sev
                });
                // Morning burst - some days a low-energy slump, some days fine.
                const lowMorning = (delta % 2 === 0);
                push(7, 30, 'energy', lowMorning ? 3 : 7);
                push(7, 35, lowMorning ? 'e_anxious' : 'e_motivated');
                if (lowMorning) push(7, 40, 'symptom', 's_headache', 'mild');
                push(8, 15, 'activity', 'a_caffeine');
                // Lunch + midday
                push(12, 30, 'energy',      lowMorning ? 5 : 6);
                push(12, 32, 'emotion',     lowMorning ? 'e_stressed' : 'e_calm');
                push(13, 0,  'activity',   (delta % 3 === 0) ? 'a_workout' : 'a_caffeine');
                // Afternoon tail
                push(16, 45, 'energy', 4 + (delta % 3));
                if (delta % 4 === 0) push(16, 50, 'symptom', 's_fatigue', 'moderate');
                if (delta % 5 === 0) push(17, 10, 'note', 'Long day, refilled water 3x.');
                // Evening
                push(20, 0,  'energy', 5);
                push(20, 5,  'emotion', (delta % 2 === 0) ? 'e_irritated' : 'e_calm');
                push(21, 0,  'activity', (delta % 3 === 1) ? 'a_meditation' : 'a_caffeine');
                // Sleep (logged the night of)
                const [sh, sm] = hh(6 + (delta % 3) + ((delta % 2) * 0.5));
                push(23, 0,  'sleep', sh + sm / 60);
            }
            return extra;
        })()
    ];
};

let state = {
    userSettings: {
        customEmotions:   [],
        customSymptoms:   [],
        customActivities: [],
        preferences:      { theme: DEFAULT_THEME, accent: DEFAULT_ACCENT, insightsRange: 'all' }
    },
    dailyLogs: []
};
let activeCalendarMode = 'month';
let insightsRange      = 'all';   // mirror of state.userSettings.preferences.insightsRange

// --- 2. INITIALIZATION --------------------------------------------------------

window.addEventListener('load', () => {
    resetLogDatePicker();
    const saved = localStorage.getItem('lifesync_data');
    if (saved) {
        try { state = JSON.parse(saved); }
        catch (e) { console.error("Data parse error - resetting state.", e); state = null; }
    }

    // Schema validator.
    if (!state || typeof state !== 'object') state = { userSettings: {}, dailyLogs: [] };
    if (!state.userSettings) state.userSettings = {};
    if (!state.meta) state.meta = {};

    // First-run seeding (idempotent via state.meta.seeded).
    if (!state.meta.seeded) {
        if (!Array.isArray(state.userSettings.customEmotions) || state.userSettings.customEmotions.length === 0)
            state.userSettings.customEmotions = [...DEFAULT_EMOTIONS];
        if (!Array.isArray(state.userSettings.customSymptoms) || state.userSettings.customSymptoms.length === 0)
            state.userSettings.customSymptoms = [...DEFAULT_SYMPTOMS];
        if (!Array.isArray(state.userSettings.customActivities) || state.userSettings.customActivities.length === 0)
            state.userSettings.customActivities = [...DEFAULT_ACTIVITIES];
        if (!Array.isArray(state.dailyLogs) || state.dailyLogs.length === 0)
            state.dailyLogs = generateMockData();
        state.meta.seeded = true;
    }

    // V3 -> V4 preferences migration. Idempotent via meta.migratedToV4.
    if (!state.meta.migratedToV4) {
        if (!state.userSettings.preferences) state.userSettings.preferences = {};
        if (!THEMES.includes(state.userSettings.preferences.theme))        state.userSettings.preferences.theme = DEFAULT_THEME;
        if (!ACCENT_NAMES.includes(state.userSettings.preferences.accent)) state.userSettings.preferences.accent = DEFAULT_ACCENT;
        if (!['7d','30d','90d','all'].includes(state.userSettings.preferences.insightsRange)) state.userSettings.preferences.insightsRange = 'all';
        state.meta.migratedToV4 = true;
    }

    // V6: seed the user's customCategories registry with Sleep on first run.
    if (!Array.isArray(state.userSettings.customCategories)) {
        state.userSettings.customCategories = [...DEFAULT_EXTRA_CATEGORIES];
    }

    // V2 -> V3 migration. V2 entries are aggregated daily cards; we explode
    // each into one entry per channel, preserving date+time stamp.
    if (!state.meta.migratedToV3) {
        const flat = [];
        state.dailyLogs.forEach(log => {
            if (log.type && ['energy','emotion','symptom','activity','note'].includes(log.type)) {
                flat.push(log);
                return;
            }
            const baseDate = log.date;
            if (typeof log.energy === 'number') {
                flat.push({ id: log.id + '_e', date: baseDate, type: 'energy', value: log.energy });
            }
            (log.emotions || []).forEach((eid, i) =>
                flat.push({ id: log.id + '_em' + i, date: baseDate, type: 'emotion', value: eid }));
            (log.symptoms || []).forEach((s, i) =>
                flat.push({ id: log.id + '_sy' + i, date: baseDate, type: 'symptom', value: s.id, severity: s.severity }));
            (log.activities || []).forEach((aid, i) =>
                flat.push({ id: log.id + '_a'  + i, date: baseDate, type: 'activity', value: aid }));
            if (typeof log.notes === 'string' && log.notes.trim()) {
                flat.push({ id: log.id + '_n', date: baseDate, type: 'note', value: log.notes });
            }
        });
        if (flat.length !== state.dailyLogs.length) state.dailyLogs = flat;
        state.meta.migratedToV3 = true;
    }

    insightsRange = state.userSettings.preferences.insightsRange;
    applyTheme(state.userSettings.preferences.theme);
    applyAccent(state.userSettings.preferences.accent);

    saveStateToLocalStorage();
    renderLogger();
    renderSettings();
    bindAppearanceSwatches();
    bindInsightsRangeChips();
});

function resetLogDatePicker() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const el = document.getElementById('log-date');
    if (el) el.value = now.toISOString().slice(0, 16);
}

function saveStateToLocalStorage() {
    localStorage.setItem('lifesync_data', JSON.stringify(state));
}

// --- 3. NAVIGATION CONTROLLER -------------------------------------------------

function switchTab(tabId) {
    ['view-log', 'view-calendar', 'view-insights', 'view-settings']
        .forEach(v => document.getElementById(v).classList.add('hidden'));
    document.getElementById('mode-switcher').classList.add('hidden');

    document.getElementById(`view-${tabId}`).classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('text-[#D89B5C]');
        btn.style.color = '';
    });
    const active = document.getElementById(`btn-${tabId}`);
    active.style.color = '#D89B5C';

    const titles = {
        log: 'Log Your Day',
        calendar: 'History & Timeline',
        insights: 'Your Insights',
        settings: 'Settings'
    };
    document.getElementById('app-title').innerText = titles[tabId];

    // Floating Save pill only lives on the Log tab. Hide it as we navigate away
    // so it doesn't visually overlap the History / Insights / Settings views.
    const saveBar = document.getElementById('log-save-bar');
    if (saveBar) saveBar.classList.toggle('hidden', tabId !== 'log');

    if (tabId === 'calendar') {
        document.getElementById('mode-switcher').classList.remove('hidden');
        refreshCalendarUI();
    } else if (tabId === 'insights') {
        renderInsights();
    }
}

function setCalendarMode(mode) {
    activeCalendarMode = mode;
    document.getElementById('calendar-month-container').classList.add('hidden');
    document.getElementById('calendar-timeline-container').classList.add('hidden');
    // Stream mode (V5): uses the timeline container with its own feed structure.
    document.getElementById('btn-mode-month').className    = "flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition text-[#6E5E5E]";
    document.getElementById('btn-mode-timeline').className = "flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition text-[#6E5E5E]";
    document.getElementById('btn-mode-day').className      = "flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition text-[#6E5E5E]";
    document.getElementById('btn-mode-kanban').className   = "flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition text-[#6E5E5E]";
    const btnStream = document.getElementById('btn-mode-stream');
    if (btnStream) btnStream.className = "flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition text-[#6E5E5E]";

    const activeCls = "flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition bg-white text-[#3D3548] shadow-sm";
    if (mode === 'month') {
        document.getElementById('calendar-month-container').classList.remove('hidden');
        document.getElementById('btn-mode-month').className = activeCls;
        renderContinuousCalendar();
    } else if (mode === 'timeline') {
        document.getElementById('calendar-timeline-container').classList.remove('hidden');
        document.getElementById('btn-mode-timeline').className = activeCls;
        renderSeamlessTimeline();
    } else if (mode === 'day') {
        document.getElementById('calendar-timeline-container').classList.remove('hidden');
        document.getElementById('btn-mode-day').className = activeCls;
        renderDayTimeline();
    } else if (mode === 'kanban') {
        document.getElementById('calendar-timeline-container').classList.remove('hidden');
        document.getElementById('btn-mode-kanban').className = activeCls;
        renderKanbanTimeline();
    } else if (mode === 'stream') {
        document.getElementById('calendar-timeline-container').classList.remove('hidden');
        if (btnStream) btnStream.className = activeCls;
        renderStreamTimeline();
    }}

function refreshCalendarUI() {
    if (activeCalendarMode === 'month')           renderContinuousCalendar();
    else if (activeCalendarMode === 'timeline')   renderSeamlessTimeline();
    else if (activeCalendarMode === 'day')        renderDayTimeline();
    else if (activeCalendarMode === 'kanban')     renderKanbanTimeline();
    else if (activeCalendarMode === 'stream')     renderStreamTimeline();
}

// --- 4. LOGGER ENGINE ---------------------------------------------------------

const ENTRY_TYPES   = ['energy', 'emotion', 'symptom', 'activity', 'note', 'sleep'];
const CHANNEL_LABEL = { energy: 'Energy', emotion: 'Emotion', symptom: 'Symptom', activity: 'Activity', note: 'Note', sleep: 'Sleep' };
let currentChannel  = 'energy';

function updateEnergyDisplay(val) {
    document.getElementById('energy-value').innerText = `${val}/10`;
}

function updateSleepDisplay(val) {
    const v = parseFloat(val);
    document.getElementById('sleep-value').innerText = `${Number.isFinite(v) ? v.toFixed(1) : '0.0'}h`;
}

function renderLogger() {
    renderChannelPicker();
    renderEmotionsInLogger();
    renderSymptomsInLogger();
    renderActivitiesInLogger();
}

function renderChannelPicker() {
    const wrap = document.getElementById('channel-picker');
    if (!wrap) return;
    wrap.innerHTML = '';
    getAllCategoryDefs().forEach(def => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.dataset.channel = def.key;
        chip.innerText = def.label;
        chip.className = currentChannel === def.key
            ? "flex-1 py-2.5 rounded-2xl text-xs font-bold transition bg-[#D89B5C] text-white shadow-soft border border-[#B47A3C] active:scale-95"
            : "flex-1 py-2.5 rounded-2xl text-xs font-bold transition bg-white border border-[#ECE3D0] text-[#6E5E5E] active:scale-90";
        chip.onclick = () => { currentChannel = def.key; renderLogger(); };
        wrap.appendChild(chip);
    });
    ensureCustomCategoryPanels();
    document.querySelectorAll('[data-channel-panel]').forEach(p => {
        p.classList.toggle('hidden', p.dataset.channelPanel !== currentChannel);
    });
}

// Inject a panel into view-log for any custom category that doesn't already
// have a built-in panel. The panel id prefix is "panel-<key>".
function ensureCustomCategoryPanels() {
    const view = document.getElementById('view-log');
    if (!view) return;
    getAllCategoryDefs().forEach(def => {
        if (def.builtin) return; // already in index.html
        const panelId = 'panel-' + def.key;
        if (document.getElementById(panelId)) return; // already injected
        view.insertAdjacentHTML('beforeend', buildCustomCategoryPanel(def));
    });
}
function buildCustomCategoryPanel(def) {
    const panelId = 'panel-' + def.key;
    const labelColor = def.color;
    if (def.valueType === 'scale') {
        const min = def.scaleMin || 0;
        const max = def.scaleMax || 10;
        const mid = (min + max) / 2;
        return `
            <div id="${panelId}" data-channel-panel="${def.key}" class="space-y-3 pt-4 border-t border-[#ECE3D0] hidden">
                <div class="flex justify-between items-center">
                    <label class="text-[10px] font-black uppercase tracking-widest text-[#A0876A]">${escapeHtml(def.label)}</label>
                    <span id="${panelId}-value" class="text-xl font-black" style="color:${escapeHtml(labelColor)}">${mid}</span>
                </div>
                <input type="range" id="${panelId}-input" min="${min}" max="${max}" value="${mid}" class="w-full h-2.5 bg-[#ECE3D0] rounded-lg appearance-none cursor-pointer" style="accent-color:${escapeHtml(labelColor)}" oninput="document.getElementById('${panelId}-value').innerText=this.value">
                <div class="flex justify-between text-[10px] font-bold text-[#A0876A] px-1"><span>${min}</span><span>${(min+max)/2}</span><span>${max}</span></div>
            </div>`;
    }
    if (def.valueType === 'binary') {
        return `
            <div id="${panelId}" data-channel-panel="${def.key}" class="space-y-3 pt-4 border-t border-[#ECE3D0] hidden">
                <p class="text-[10px] font-black uppercase tracking-widest text-[#A0876A]">${escapeHtml(def.label)} <span class="text-[#ECE3D0] normal-case font-medium">(tap to toggle, save)</span></p>
                <button id="${panelId}-toggle" data-on="0" class="px-6 py-3 rounded-2xl font-bold text-sm bg-white border-2 border-[#ECE3D0] text-[#6E5E5E]" onclick="
                    const on = this.dataset.on === '1';
                    this.dataset.on = on ? '0' : '1';
                    if (this.dataset.on === '1') { this.style.backgroundColor = '${escapeHtml(def.color)}'; this.style.color = 'white'; this.querySelector('span').innerText = 'ON'; }
                    else { this.style.backgroundColor = 'white'; this.style.color = ''; this.querySelector('span').innerText = 'OFF'; }
                "><span class="font-black">OFF</span></button>
            </div>`;
    }
    if (def.valueType === 'note') {
        return `
            <div id="${panelId}" data-channel-panel="${def.key}" class="space-y-3 pt-4 border-t border-[#ECE3D0] hidden">
                <label class="block text-[10px] font-black uppercase tracking-widest text-[#A0876A]">${escapeHtml(def.label)} <span class="text-[#ECE3D0] normal-case font-medium">(free text)</span></label>
                <textarea id="${panelId}-text" rows="3" placeholder="..." class="w-full bg-white border border-[#ECE3D0] rounded-2xl p-4 text-[#3D3548] font-medium focus:outline-none resize-none placeholder:text-[#A0876A]"></textarea>
            </div>`;
    }
    return '';
}

function renderEmotionsInLogger() {
    const posList = document.getElementById('positive-emotions-list');
    const negList = document.getElementById('negative-emotions-list');
    posList.innerHTML = ''; negList.innerHTML = '';

    state.userSettings.customEmotions.forEach(emo => {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerText = emo.name;
        button.dataset.id = emo.id;
        button.className =
            "px-4 py-2.5 rounded-2xl text-sm font-bold transition duration-100 bg-white border border-[#ECE3D0] text-[#6E5E5E] active:scale-90";
        button.onclick = () => {
            const turningOn = !button.classList.contains('bg-[#7E9A6B]') && !button.classList.contains('bg-[#C44033]');
            button.classList.remove('bg-[#7E9A6B]','border-[#5F7A50]','text-white','shadow-md',
                                    'bg-[#C44033]','border-[#A0332A]','bg-[#F5EFE3]','border-[#ECE3D0]','text-[#6E5E5E]','bg-white');
            if (turningOn) {
                if (emo.valence === 'positive') button.classList.add('bg-[#7E9A6B]','border-[#5F7A50]','text-white','shadow-md');
                else                            button.classList.add('bg-[#C44033]','border-[#A0332A]','text-white','shadow-md');
            } else {
                button.classList.add('bg-white','border-[#ECE3D0]','text-[#6E5E5E]');
            }
        };
        if (emo.valence === 'positive') posList.appendChild(button);
        else                            negList.appendChild(button);
    });
}

function renderSymptomsInLogger() {
    const cont = document.getElementById('symptoms-list');
    cont.innerHTML = '';

    state.userSettings.customSymptoms.forEach(sym => {
        const row = document.createElement('div');
        row.dataset.symptomRow = 'true';
        row.dataset.symptomId = sym.id;
        row.className = "flex justify-between items-center py-2 border-b border-[#ECE3D0] last:border-0";
        row.innerHTML = `
            <span class="font-bold text-[#3D3548] text-sm">${escapeHtml(sym.name)}</span>
            <div class="flex gap-1.5">
                <button data-severity="mild"     class="sev-btn px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#F5EFE3] text-[#A0876A] border border-[#ECE3D0]">Mild</button>
                <button data-severity="moderate" class="sev-btn px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#F5EFE3] text-[#A0876A] border border-[#ECE3D0]">Mod</button>
                <button data-severity="severe"   class="sev-btn px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#F5EFE3] text-[#A0876A] border border-[#ECE3D0]">Sev</button>
            </div>
        `;
        row.querySelectorAll('.sev-btn').forEach(btn => {
            btn.onclick = () => {
                const wasOn = btn.classList.contains('on');
                btn.parentElement.querySelectorAll('.sev-btn').forEach(b => clearSeverityBtn(b));
                if (!wasOn) applySeverityBtn(btn);
            };
        });
        cont.appendChild(row);
    });
}

function applySeverityBtn(btn) {
    const sev = btn.dataset.severity;
    btn.classList.remove('bg-[#F5EFE3]','text-[#A0876A]','border-[#ECE3D0]');
    btn.classList.add('on', SEVERITY_COLOR[sev]);
}

function clearSeverityBtn(btn) {
    btn.classList.remove('on',
        'bg-[#F1D88A]','bg-[#E89C5B]','bg-[#C44033]',
        'text-[#3D3548]','text-white','border-[#B47A3C]','border-[#A0332A]');
    btn.classList.add('bg-[#F5EFE3]','text-[#A0876A]','border-[#ECE3D0]');
}

function renderActivitiesInLogger() {
    const cont = document.getElementById('activities-list');
    cont.innerHTML = '';
    state.userSettings.customActivities.forEach(act => {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerText = act.name;
        button.dataset.id = act.id;
        button.className =
            "px-4 py-2.5 rounded-2xl text-sm font-bold transition duration-100 bg-white border border-[#ECE3D0] text-[#6E5E5E] active:scale-90";
        button.onclick = () => {
            const on = !button.classList.contains('on');
            button.classList.toggle('on');
            button.classList.toggle('bg-[#7C9CB1]',  on);
            button.classList.toggle('border-[#5C7188]', on);
            button.classList.toggle('text-white',  on);
            button.classList.toggle('shadow-md',   on);
            button.classList.toggle('bg-white',    !on);
            button.classList.toggle('border-[#ECE3D0]', !on);
            button.classList.toggle('text-[#6E5E5E]', !on);
        };
        cont.appendChild(button);
    });
}


// Save = one discrete entry per channel. Multi-select channels (emotion /
// activity) expand into multiple parallel entries, all stamped at the same
// date+time. Notes require non-empty text.
function saveCurrentLog() {
    const dateVal = document.getElementById('log-date').value;
    if (!dateVal) return;
    const newEntries = [];
    const push = (extra) => {
        const id = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        newEntries.push(Object.assign({ id, date: dateVal }, extra));
    };

    if (currentChannel === 'energy') {
        const v = parseInt(document.getElementById('log-energy').value, 10);
        if (Number.isFinite(v)) push({ type: 'energy', value: v });
    } else if (currentChannel === 'emotion') {
        document.querySelectorAll(
            '#positive-emotions-list button.bg-\\[\\#7E9A6B\\], #negative-emotions-list button.bg-\\[\\#C44033\\]'
        ).forEach(btn => push({ type: 'emotion', value: btn.dataset.id }));
    } else if (currentChannel === 'symptom') {
        document.querySelectorAll('[data-symptom-row]').forEach(row => {
            const onBtn = row.querySelector('.sev-btn.on');
            if (onBtn) push({ type: 'symptom', value: row.dataset.symptomId, severity: onBtn.dataset.severity });
        });
    } else if (currentChannel === 'activity') {
        document.querySelectorAll('#activities-list button.on').forEach(btn => push({ type: 'activity', value: btn.dataset.id }));
    } else if (currentChannel === 'note') {
        const txt = (document.getElementById('log-notes').value || '').trim();
        if (txt) push({ type: 'note', value: txt });
    } else if (currentChannel === 'sleep') {
        const v = parseFloat(document.getElementById('log-sleep').value);
        if (Number.isFinite(v)) push({ type: 'sleep', value: v });
    } else {
        // Custom-category fallback. Look up the def by channel key and dispatch
        // on its value-type.
        const def = getAllCategoryDefs().find(d => d.key === currentChannel);
        if (def && !def.builtin) {
            const panelId = 'panel-' + def.key;
            if (def.valueType === 'scale') {
                const inp = document.getElementById(panelId + '-input');
                if (inp) {
                    const v = parseFloat(inp.value);
                    if (Number.isFinite(v)) push({ type: def.key, value: v });
                }
            } else if (def.valueType === 'binary') {
                const tog = document.getElementById(panelId + '-toggle');
                if (tog && tog.dataset.on === '1') push({ type: def.key, value: 1 });
            } else if (def.valueType === 'note') {
                const txtEl = document.getElementById(panelId + '-text');
                const txt = (txtEl ? txtEl.value : '').trim();
                if (txt) push({ type: def.key, value: txt });
            }
        }
    }

    if (newEntries.length === 0) return;
    state.dailyLogs.push(...newEntries);
    saveStateToLocalStorage();

    // Reset channel-specific input (preserve date so user can rapid-fire 10am logs).
    if (currentChannel === 'energy') {
        document.getElementById('log-energy').value = 5; updateEnergyDisplay(5);
    } else if (currentChannel === 'note') {
        document.getElementById('log-notes').value = '';
    }
    renderLogger();

    const btn = document.getElementById('log-save-btn');
    const og = btn.innerText;
    btn.innerText = newEntries.length === 1 ? "✓ Saved" : "✓ Saved " + newEntries.length;
    // Warm confirmation: sage positive instead of Apple green.
    btn.style.backgroundColor = '#7E9A6B';
    setTimeout(() => { btn.innerText = og; btn.style.backgroundColor = '#D89B5C'; }, 1500);
}

// --- 5. CONTINUOUS CALENDAR ENGINE -------------------------------------------

// One seamless 7-col grid spanning ~6 months (today-2 to today+3). Day numbers
// flow without per-month section breaks. A single sticky month label updates
// on scroll via IntersectionObserver sentries (placed at the first cell of
// each month).
const CAL_RANGE_BACK_MONTHS  = 2;
const CAL_RANGE_FWD_MONTHS   = 3;
const STICKY_HEADER_OFFSET   = 44;   // approx combined height of weekday header + month label

function renderContinuousCalendar() {
    const container = document.getElementById('apple-calendar-stack');
    container.innerHTML = '';

    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = now.getMonth();
    const todayD = now.getDate();
    const todayKey = `${todayY}-${String(todayM+1).padStart(2,'0')}-${String(todayD).padStart(2,'0')}`;

    // Compute a continuous date range, backfilled to Sunday and forward-filled to Saturday.
    const start = new Date(todayY, todayM - CAL_RANGE_BACK_MONTHS, 1);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(todayY, todayM + CAL_RANGE_FWD_MONTHS + 1, 0); // last day of (today+3) month
    end.setDate(end.getDate() + (6 - end.getDay()));

    const grid = document.createElement('div');
    grid.className = "grid grid-cols-7 gap-x-1 gap-y-3 justify-items-center mt-1 px-1 apple-grid";

    const d = new Date(start);
    let gridIndex = 0;
    while (d <= end) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const dayLogs = state.dailyLogs.filter(l => l.date.startsWith(dateStr));
        const isToday = dateStr === todayKey;

        const cell = buildDayCell(dateStr, dayLogs, isToday);
        cell.dataset.month = d.getMonth();
        cell.dataset.year  = d.getFullYear();
        cell.dataset.day   = d.getDate();
        // V4 grid styling:
        //   - cal-row-stripe: zebra background every other VISIBLE week-row (14 cells)
        //   - cal-col-rule:   subtle right-rule between weekend cells (Sat)
        const weekIndex = Math.floor(gridIndex / 7);
        if (weekIndex % 2 === 1) cell.classList.add('cal-row-stripe');
        if (gridIndex % 7 === 6) cell.classList.add('cal-col-rule');
        grid.appendChild(cell);

        d.setDate(d.getDate() + 1);
        gridIndex++;
    }

    container.appendChild(grid);

    // #apple-calendar-stack is the grid itself; the actual scroll viewport is
    // its parent #calendar-month-container (which owns overflow-y-auto). We
    // send the scroll command there so today lands under the sticky headers
    // on first render.
    const scrollViewport = document.getElementById('calendar-month-container');

    setupMonthSentries(scrollViewport || container);

    setTimeout(() => {
        if (!scrollViewport) return;
        const todayCell = container.querySelector(`[data-day="${todayD}"][data-month="${todayM}"][data-year="${todayY}"]`);
        if (!todayCell) return;
        // Measure offsetTop relative to the scroll viewport's scroll origin.
        const top = todayCell.getBoundingClientRect().top - scrollViewport.getBoundingClientRect().top + scrollViewport.scrollTop;
        scrollViewport.scrollTop = Math.max(0, top - STICKY_HEADER_OFFSET - 16);
    }, 30);
}

function buildDayCell(dateStr, dayLogs, isToday) {
    const cell = document.createElement('div');
    cell.className = "relative w-12 h-14 flex flex-col items-center cursor-pointer active:scale-90 transition-transform";
    cell.onclick = () => openDayModal(dateStr, dayLogs);

    const num = document.createElement('span');
    if (isToday) {
        // Today circle uses the warm accent (terracotta) instead of Apple red so
        // it harmonises with the cream bg and doesn't evoke an "alert" reading.
        num.className = "mt-1 w-7 h-7 rounded-full flex items-center justify-center text-[15px] font-semibold text-white shadow-soft";
        num.style.backgroundColor = "#D89B5C";
    } else {
        num.className = "mt-2 text-[15px] font-medium text-[#3D3548]";
    }
    num.innerText = parseInt(dateStr.split('-')[2], 10);
    cell.appendChild(num);

    if (dayLogs.length > 0) {
        // Energy bar (avg of energy entries today, if any).
        const energyEntries = dayLogs.filter(l => l.type === 'energy');
        if (energyEntries.length > 0) {
            const avg = energyEntries.reduce((a, e) => a + e.value, 0) / energyEntries.length;
            const bar = document.createElement('div');
            bar.className = `absolute bottom-1.5 w-6 h-[3px] rounded-full ${energyBarClass(avg)}`;
            cell.appendChild(bar);
        }

        // Emotion dots (max 2: green for any positive, red for any negative).
        const hasPos = dayLogs.some(l => l.type === 'emotion' && classifyEmotion(l.value).valence === 'positive');
        const hasNeg = dayLogs.some(l => l.type === 'emotion' && classifyEmotion(l.value).valence === 'negative');
        if (hasPos || hasNeg) {
            const dots = document.createElement('div');
            dots.className = "absolute top-0 left-0.5 flex gap-0.5";
            if (hasPos) dots.appendChild(makeDot('bg-emerald-500'));
            if (hasNeg) dots.appendChild(makeDot('bg-rose-500'));
            cell.appendChild(dots);
        }

        // Symptom warning pip if any moderate/severe symptom that day.
        const hasWarn = dayLogs.some(l => l.type === 'symptom' && (l.severity === 'moderate' || l.severity === 'severe'));
        if (hasWarn) {
            const warn = document.createElement('div');
            warn.className = "absolute top-0 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-sm";
            warn.style.backgroundColor = "#C44033";
            warn.innerText = "!";
            cell.appendChild(warn);
        }
    }
    return cell;
}

function energyBarClass(avg) {
    // Warm peach -> terracotta -> brick-red gradient. The peak (10) reads as a
    // celebration, NOT as an error, because the page is cream not white.
    if (avg <= 3) return "bg-[#F8D6A8]";
    if (avg <= 6) return "bg-[#F4A261]";
    if (avg <= 9) return "bg-[#E76F51]";
    return "bg-[#C44033]";   // peak (10/10)
}

function makeDot(cls) {
    const d = document.createElement('div');
    d.className = `w-1.5 h-1.5 rounded-full shadow-sm border border-white ${cls}`;
    return d;
}

// Place sentries at the first cell of each month. When a sentry crosses the
// bottom edge of the sticky headers, IntersectionObserver fires and we update
// the sticky month label. Avoids scroll-handler jank from offsetTop churn.
// `container` may be either the calendar grid itself or its scroll viewport;
// we read sentries out of the grid and let the observer default to the
// closest scroller (which is #calendar-month-container).
function setupMonthSentries(container) {
    const label = document.getElementById('current-month-label');
    if (!label) return;
    // Use the month that contains today's anchor so the label starts accurate.
    const now = new Date();
    label.innerText = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    let lastM = -1, lastY = -1;
    const sentries = [];
    container.querySelectorAll('[data-month]').forEach(cell => {
        const m = parseInt(cell.dataset.month, 10);
        const y = parseInt(cell.dataset.year, 10);
        if (m !== lastM || y !== lastY) {
            sentries.push(cell);
            lastM = m; lastY = y;
        }
    });

    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
        (entries) => {
            // Among intersecting sentries pick the bottommost (latest month in view).
            const hits = entries.filter(e => e.isIntersecting);
            if (hits.length === 0) return;
            const t = hits[hits.length - 1].target;
            const m = parseInt(t.dataset.month, 10);
            const y = parseInt(t.dataset.year, 10);
            label.innerText = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        },
        // Top: pulled down past the sticky weekday header; bottom: pull up 85% so
        // only the top strip of the scroll viewport is considered.
        { rootMargin: '-44px 0px -85% 0px', threshold: 0 }
    );
    sentries.forEach(s => observer.observe(s));
}

// --- 6. TIMELINE ENGINE -------------------------------------------------------

// Continuous-vertical-thread timeline. Each entry is a slim row tied to the
// thread at its actual timestamp. Sticky date pills interrupt the thread
// visually but don't break the layout. The card backgrounds are heavily
// tinted by category so vertical "ribbons" of colour make diff types easy
// to scan at a glance.
function renderSeamlessTimeline() {
    const feed = document.getElementById('continuous-timeline-feed');
    feed.innerHTML = '';
    feed.className = "relative pt-2 pb-32";

    const sortedLogs = [...state.dailyLogs].sort((a, b) => b.date.localeCompare(a.date));
    if (sortedLogs.length === 0) {
        feed.innerHTML += '<p class="text-center text-[#A0876A] text-sm mt-10">No entries logged yet.</p>';
        return;
    }

    // Geometry constants for the row grid below (V4: TIME_GUTTER 64 -> 40 px
    // so each card gets more horizontal space; THREAD_X recomputed accordingly).
    const TIME_GUTTER = 40;
    const NODE_COL    = 24;
    const THREAD_X    = TIME_GUTTER + NODE_COL / 2;   // 52

    const thread = document.createElement('div');
    thread.className = "absolute top-3 bottom-0 w-[2px] bg-[var(--ls-bg-deep)] z-0";
    thread.style.left = `${THREAD_X}px`;
    feed.appendChild(thread);

    let lastDate = "";

    sortedLogs.forEach((log) => {
        const dateOnly = log.date.split('T')[0];
        const logDateObj = new Date(log.date);
        const timeStr = logDateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
        const isFirstOfDay = dateOnly !== lastDate;
        lastDate = dateOnly;

        if (isFirstOfDay) {
            const dayLogs = sortedLogs.filter(l => l.date.startsWith(dateOnly));
            const pill = document.createElement('div');
            pill.className = "sticky top-0 z-20 bg-[#FAF6EE]/85 backdrop-blur-md py-2.5 my-2 flex items-baseline gap-3 border-b border-[#ECE3D0]/60";
            pill.innerHTML = `
                <span class="w-14 text-right text-[10px] font-black uppercase tracking-widest text-[#A0876A]">${logDateObj.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span class="w-6"></span>
                <span class="text-[15px] font-black text-[#3D3548] tracking-tight">${logDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span class="ml-auto text-[11px] font-bold text-[#A0876A]">${dayLogs.length}</span>
            `;
            feed.appendChild(pill);
        }

        // Bumped row gap (pt-4 pb-3) gives each category its own visual breathing
        // room so the eye reads each card as a discrete slab rather than a
        // continuous stream of uniform boxes.
        const entry = document.createElement('div');
        entry.className = `grid grid-cols-[${TIME_GUTTER}px_${NODE_COL}px_1fr] gap-x-2 pt-4 pb-3 cursor-pointer active:scale-[0.99] transition-transform items-start`;
        entry.onclick = () => openDayModal(dateOnly, [log]);

        // Time gutter.
        const tm = timeStr.replace(' ', '');
        const mm = tm.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
        const timeLabel = document.createElement('div');
        timeLabel.className = "col-start-1 pt-4 text-right pr-1 text-[11px] font-bold text-[#6E5E5E] z-10 relative";
        if (mm) timeLabel.innerHTML = `${mm[1]}<span class="text-[#A0876A] font-normal">${mm[3]}</span>`;
        else    timeLabel.innerText = tm;
        entry.appendChild(timeLabel);

        // Node centred on the thread via mx-auto.
        const node = document.createElement('div');
        node.className = "col-start-2 w-4 h-4 mt-4 mx-auto rounded-full border-[3px] border-[#FAF6EE] shadow-sm z-10 shrink-0";
        node.style.backgroundColor = entryNodeColor(log);
        entry.appendChild(node);

        // Content. renderEntryInline returns a category-tinted card body.
        const card = document.createElement('div');
        card.className = "col-start-3 pt-1";
        card.innerHTML = renderEntryInline(log);
        entry.appendChild(card);

        feed.appendChild(entry);
    });
}

function entryNodeColor(log) {
    // Warm-category dots. Each hue corresponds to one of the cat-* card tints.
    switch (log.type) {
        case 'energy':   return energyNodeColor(log.value);
        case 'emotion':  {
            const c = classifyEmotion(log.value);
            return c.valence === 'negative' ? '#C44033' : '#7E9A6B';
        }
        case 'symptom':  return log.severity === 'severe'   ? '#A0332A'
                                  : log.severity === 'moderate' ? '#E89C5B'
                                  : '#E9C46A';
        case 'activity': return '#7C9CB1';
        case 'note':     return '#A0876A';
        case 'sleep':    return '#7C9CB1';
    }
    // Custom categories: resolve color from registry.
    const custom = getCustomCategoryByKey(log.type);
    return custom ? custom.color : '#A0876A';
}

// Compact, type-specific row content for both timeline and modal. Each card
// background uses the cat-* classes from styles.css so the user sees vertical
// "ribbons" of category colour in the timeline + clear per-entry tints in the
// modal.
function renderEntryInline(log) {
    const base = "rounded-xl border px-3 py-2.5";
    switch (log.type) {
        case 'energy':
            return `<div class="${base} ${CAT_CARD_CLASS.energy}">
                <span class="text-[15px] font-black" style="color:#B47A3C">Energy ${log.value}/10</span>
            </div>`;
        case 'emotion': {
            const c = classifyEmotion(log.value);
            const tint = c.valence === 'positive' ? CAT_CARD_CLASS.pos : CAT_CARD_CLASS.neg;
            return `<div class="${base} ${tint}">
                <span class="text-[14px] font-bold text-[#3D3548]">${escapeHtml(c.label)}</span>
            </div>`;
        }
        case 'symptom': {
            const c = classifySymptom(log.value);
            const tint = CAT_CARD_CLASS[log.severity];
            const tone = SEVERITY_TEXT_COLOR[log.severity] || 'text-[#3D3548]';
            return `<div class="${base} ${tint}">
                <span class="text-[14px] font-bold ${tone}">${escapeHtml(c.label)} &middot; ${log.severity}</span>
            </div>`;
        }
        case 'activity': {
            const c = classifyActivity(log.value);
            return `<div class="${base} ${CAT_CARD_CLASS.activity}">
                <span class="text-[14px] font-bold text-[#3D5470]">${escapeHtml(c.label)}</span>
            </div>`;
        }
        case 'note':
            return `<div class="${base} ${CAT_CARD_CLASS.note}">
                <span class="text-[14px] italic text-[#3D3548] leading-snug">${escapeHtml(log.value)}</span>
            </div>`;
        case 'sleep':
            return `<div class="${base} cat-sleep">
                <span class="text-[15px] font-black" style="color:#3D5470">Sleep ${log.value}h</span>
            </div>`;
    }
    // Custom-category fallback rendering. Use the registered color.
    const custom = getCustomCategoryByKey(log.type);
    if (custom) {
        const tint = `background-color: color-mix(in srgb, ${custom.color} 18%, white); border-color: color-mix(in srgb, ${custom.color} 30%, white);`;
        if (custom.type === 'scale') {
            return `<div class="${base} cat-custom" style="${tint}"><span class="text-[15px] font-black" style="color:${custom.color}">${escapeHtml(custom.name)} ${log.value}</span></div>`;
        }
        if (custom.type === 'binary') {
            return `<div class="${base} cat-custom" style="${tint}"><span class="text-[14px] font-bold" style="color:${custom.color}">${escapeHtml(custom.name)}</span></div>`;
        }
        return `<div class="${base} cat-custom" style="${tint}"><span class="text-[14px] italic text-[#3D3548] leading-snug">${escapeHtml(String(log.value))}</span></div>`;
    }
    // The custom category was deleted. Preserve historical signal with the labelled sentinel
    // card so the user can still tell what category was used at the time of logging.
    return `<div class="${base} cat-custom-deleted">
        <span class="text-[14px] font-bold text-[#A0876A]">${escapeHtml(FALLBACK_LABEL.fallback_custom)} · <span class="text-[#A0876A]/70">${escapeHtml(String(log.value))}</span></span>
    </div>`;
}

// Time-of-day band — drives a subtle gradient on each .stream-row via CSS so
// the timeline visually evokes daylight. Used in renderStreamTimeline.
function todBand(h) {
    if (h >= 5  && h < 8)  return 'tod-dawn';       // warm peach
    if (h >= 8  && h < 12) return 'tod-morning';    // gold cream
    if (h >= 12 && h < 17) return 'tod-afternoon';  // neutral cream
    if (h >= 17 && h < 21) return 'tod-dusk';       // amber wash
    return 'tod-night';                             // deep navy-warm
}

function energyNodeColor(energy) {
    // Peach -> terracotta -> brick-red. Peak (10/10) stays warm.
    if (energy <= 3) return "#F8D6A8"; // peach, low
    if (energy <= 6) return "#F4A261"; // warm amber
    if (energy <= 9) return "#D89B5C"; // accent terracotta
    return "#C44033";                  // peak (10/10) - warm brick red
}

// --- 9. INSIGHTS ENGINE -------------------------------------------------------

// --- 7. DAY MODAL ENGINE ------------------------------------------------------

function openDayModal(dateString, logs) {
    const modal  = document.getElementById('day-modal');
    const sheet  = document.getElementById('day-modal-sheet');
    const title  = document.getElementById('modal-date-title');
    const cont   = document.getElementById('modal-content-area');

    const [y, m, d] = dateString.split('-');
    const dateObj = new Date(y, parseInt(m) - 1, d);
    title.innerText = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    cont.innerHTML = '';

    if (logs.length === 0) {
        cont.innerHTML = `
            <div class="text-center py-10 space-y-4">
                <p class="text-[#A0876A] font-medium">Nothing logged this day.</p>
                <button onclick="shortcutRetroactiveLog('${dateString}')" class="text-white font-bold py-3 px-8 rounded-2xl transition shadow-soft border border-[#B47A3C]" style="background-color:#D89B5C">
                    Add Entry
                </button>
            </div>
        `;
    } else {
        const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
        sorted.forEach((log) => {
            const row = document.createElement('div');
            row.className = "flex items-center gap-3 py-1";

            // Time on the left.
            const timePart = log.date.split('T')[1];
            let [hh, mm] = timePart.split(':'); hh = parseInt(hh);
            const formattedTime = `${hh % 12 || 12}:${mm} ${hh >= 12 ? 'PM' : 'AM'}`;
            const time = document.createElement('div');
            time.className = "w-16 text-right text-[11px] font-bold text-slate-500 pt-1 shrink-0";
            time.innerText = formattedTime;
            row.appendChild(time);

            // Coloured dot.
            const dot = document.createElement('div');
            dot.className = "w-3 h-3 rounded-full shrink-0 border-2 border-white shadow-sm mt-1";
            dot.style.backgroundColor = entryNodeColor(log);
            row.appendChild(dot);

            // Main content row.
            const inner = document.createElement('div');
            inner.className = "flex-1 min-w-0";
            inner.innerHTML = renderEntryInline(log);
            row.appendChild(inner);

            // Delete button (warm destructive). Only shown on the modal -- in
            // the timeline entries are opened via the modal anyway, so we keep
            // this destructive action scoped to a deliberate user gesture.
            const del = document.createElement('button');
            del.className = "text-[#C44033] active:scale-90 text-[10px] font-black uppercase tracking-widest bg-[#F8E6E3] px-2 py-1 rounded-full shrink-0 mt-1 border border-[#E9C8C4]";
            del.innerText = "Del";
            del.onclick = (e) => { e.stopPropagation(); deleteLog(log.id, dateString); };
            row.appendChild(del);

            cont.appendChild(row);
        });
    }

    modal.classList.remove('hidden');
    setTimeout(() => { sheet.classList.remove('translate-y-full'); }, 10);
}

function closeDayModal() {
    const sheet = document.getElementById('day-modal-sheet');
    sheet.classList.add('translate-y-full');
    setTimeout(() => { document.getElementById('day-modal').classList.add('hidden'); }, 300);
}

function deleteLog(logId, dateString) {
    if (!confirm("Delete this log?")) return;
    state.dailyLogs = state.dailyLogs.filter(log => log.id !== logId);
    saveStateToLocalStorage();
    refreshCalendarUI();
    const remaining = state.dailyLogs.filter(l => l.date.startsWith(dateString));
    if (remaining.length === 0) closeDayModal();
    else                          openDayModal(dateString, remaining);
}

function shortcutRetroactiveLog(dateString) {
    closeDayModal();
    document.getElementById('log-date').value = `${dateString}T12:00`;
    switchTab('log');
}

// --- 8. SETTINGS ENGINE -------------------------------------------------------

function renderSettings() {
    renderEmotionsInSettings();
    renderSymptomsInSettings();
    renderActivitiesInSettings();
    renderCustomCategories();
}

function renderEmotionsInSettings() {
    const settingsList = document.getElementById('settings-emotions-list');
    settingsList.innerHTML = '';
    state.userSettings.customEmotions.forEach(emo => {
        const row = document.createElement('div');
        row.className = "flex justify-between items-center py-4";
        const labelColor = emo.valence === 'positive' ? 'text-[#5F7A50] bg-[#ECF2E3]' : 'text-[#A0332A] bg-[#F8E6E3]';
        row.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold text-[#3D3548] text-lg">${escapeHtml(emo.name)}</span>
                <span class="text-[10px] ${labelColor} uppercase font-black px-2.5 py-1 rounded-full tracking-widest">${emo.valence}</span>
            </div>
            <button onclick="deleteEmotion('${emo.id}')" class="text-[#A0332A] hover:text-[#C44033] text-xs font-black uppercase tracking-widest bg-[#F8E6E3] px-3 py-1 rounded-full border border-[#E9C8C4]">Del</button>
        `;
        settingsList.appendChild(row);
    });
}

function renderSymptomsInSettings() {
    const settingsList = document.getElementById('settings-symptoms-list');
    settingsList.innerHTML = '';
    state.userSettings.customSymptoms.forEach(sym => {
        const row = document.createElement('div');
        row.className = "flex justify-between items-center py-4";
        row.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold text-[#3D3548] text-lg">${escapeHtml(sym.name)}</span>
                <span class="text-[10px] text-[#B47A3C] bg-[#FAF1D9] uppercase font-black px-2.5 py-1 rounded-full tracking-widest border border-[#ECD9A0]">symptom</span>
            </div>
            <button onclick="deleteSymptom('${sym.id}')" class="text-[#A0332A] hover:text-[#C44033] text-xs font-black uppercase tracking-widest bg-[#F8E6E3] px-3 py-1 rounded-full border border-[#E9C8C4]">Del</button>
        `;
        settingsList.appendChild(row);
    });
}

function renderActivitiesInSettings() {
    const settingsList = document.getElementById('settings-activities-list');
    settingsList.innerHTML = '';
    state.userSettings.customActivities.forEach(act => {
        const row = document.createElement('div');
        row.className = "flex justify-between items-center py-4";
        row.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold text-[#3D3548] text-lg">${escapeHtml(act.name)}</span>
                <span class="text-[10px] text-[#3D5470] bg-[#E9EEF6] uppercase font-black px-2.5 py-1 rounded-full tracking-widest border border-[#C3CCDE]">behavior</span>
            </div>
            <button onclick="deleteActivity('${act.id}')" class="text-[#A0332A] hover:text-[#C44033] text-xs font-black uppercase tracking-widest bg-[#F8E6E3] px-3 py-1 rounded-full border border-[#E9C8C4]">Del</button>
        `;
        settingsList.appendChild(row);
    });
}

function addNewEmotion() {
    const name = document.getElementById('new-emotion-name').value.trim();
    if (!name) return;
    state.userSettings.customEmotions.push({
        id: 'custom_' + Date.now(),
        name,
        valence: document.getElementById('new-emotion-valence').value
    });
    saveStateToLocalStorage();
    document.getElementById('new-emotion-name').value = '';
    renderLogger();
    renderSettings();
}

function addNewSymptom() {
    const name = document.getElementById('new-symptom-name').value.trim();
    if (!name) return;
    state.userSettings.customSymptoms.push({ id: 'custom_' + Date.now(), name });
    saveStateToLocalStorage();
    document.getElementById('new-symptom-name').value = '';
    renderLogger();
    renderSettings();
}

function addNewActivity() {
    const name = document.getElementById('new-activity-name').value.trim();
    if (!name) return;
    state.userSettings.customActivities.push({ id: 'custom_' + Date.now(), name });
    saveStateToLocalStorage();
    document.getElementById('new-activity-name').value = '';
    renderLogger();
    renderSettings();
}

// --- 8b. CUSTOM CATEGORY BUILDER (V6) ---------------------------------------
// Users define their own categories with name + color + value-type. Stored in
// state.userSettings.customCategories. Currently rendered in the Settings list
// for create/delete; future passes can wire them into the channel picker and
// Stream grid via STREAM_COLS extension.
function ensureCustomCategories() {
    if (!Array.isArray(state.userSettings.customCategories)) {
        state.userSettings.customCategories = [...DEFAULT_EXTRA_CATEGORIES];
    }
}
function addCustomCategory() {
    ensureCustomCategories();
    const nameEl = document.getElementById('new-category-name');
    const colorEl = document.getElementById('new-category-color');
    const typeEl  = document.getElementById('new-category-type');
    const name = nameEl ? nameEl.value.trim() : '';
    const color = colorEl ? colorEl.value : '#D89B5C';
    const type  = typeEl  ? typeEl.value      : 'binary';
    if (!name) return;
    const cat = { id: 'cu_' + Date.now(), name, color, type, valueType: type };
    if (type === 'scale') {
        cat.scaleMin = parseFloat(document.getElementById('new-category-min')?.value || 0);
        cat.scaleMax = parseFloat(document.getElementById('new-category-max')?.value || 10);
    }
    state.userSettings.customCategories.push(cat);
    // Register the new channel with the live ENTRY_TYPES + CHANNEL_LABEL registries so
    // (a) the Log-view channel picker chip appears, and (b) entry color/Node lookups work.
    if (!ENTRY_TYPES.includes(cat.id)) {
        ENTRY_TYPES.push(cat.id);
        CHANNEL_LABEL[cat.id] = cat.name;
    }
    if (!state.userSettings.preferences.streamFilters) state.userSettings.preferences.streamFilters = {};
    if (state.userSettings.preferences.streamFilters[cat.id] === undefined) {
        state.userSettings.preferences.streamFilters[cat.id] = true;
    }
    saveStateToLocalStorage();
    if (nameEl) nameEl.value = '';
    renderSettings();
    renderLogger();
    refreshCalendarUI();
}function deleteCustomCategory(id) {
    if (!confirm('Delete this custom category? Categories added by you can be removed without affecting existing logs (they will display "Deleted Custom Category").')) return;
    state.userSettings.customCategories = state.userSettings.customCategories.filter(c => c.id !== id);
    // De-register from the live channel registries so the Log-view chip + Stream filter + insight lookups don't reference a deleted category.
    const idx = ENTRY_TYPES.indexOf(id);
    if (idx !== -1) ENTRY_TYPES.splice(idx, 1);
    delete CHANNEL_LABEL[id];
    if (state.userSettings.preferences.streamFilters) {
        delete state.userSettings.preferences.streamFilters[id];
    }
    saveStateToLocalStorage();
    renderSettings();
    renderLogger();
    refreshCalendarUI();
}
function renderCustomCategories() {
    ensureCustomCategories();
    const list = document.getElementById('custom-categories-list');
    if (!list) return;
    list.innerHTML = '';
    state.userSettings.customCategories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center py-3';
        row.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="w-3.5 h-3.5 rounded-full border border-[#ECE3D0]" style="background:${escapeHtml(cat.color)}"></span>
                <span class="font-bold text-[#3D3548] text-base">${escapeHtml(cat.name)}</span>
                <span class="text-[10px] text-[#A0876A] uppercase font-black px-2 py-1 rounded-full tracking-widest bg-[#F5EFE3]">${escapeHtml(cat.type)}</span>
            </div>
            <button onclick="deleteCustomCategory('${cat.id}')" class="text-[#A0332A] hover:text-[#C44033] text-xs font-black uppercase tracking-widest bg-[#F8E6E3] px-3 py-1 rounded-full border border-[#E9C8C4]">Del</button>
        `;
        list.appendChild(row);
    });
}

// Unified channel definition (built-in presets + user-created custom).
// Drives: Log channel picker, Stream filter chips, generic entry rendering.
function getAllCategoryDefs() {
    ensureCustomCategories();
    const builtins = [
        { key: 'energy',   label: 'Energy',   color: '#D89B5C', valueType: 'scale',     scaleMin: 1, scaleMax: 10, builtin: true },
        { key: 'emotion',  label: 'Emotion',  color: '#7E9A6B', valueType: 'valence',   builtin: true },
        { key: 'symptom',  label: 'Symptom',  color: '#E89C5B', valueType: 'severity',  builtin: true },
        { key: 'activity', label: 'Activity', color: '#7C9CB1', valueType: 'binary',    builtin: true },
        { key: 'note',     label: 'Note',     color: '#A0876A', valueType: 'note',      builtin: true },
        { key: 'sleep',    label: 'Sleep',    color: '#7C9CB1', valueType: 'scale',     scaleMin: 0, scaleMax: 12, builtin: true }
    ];
    const customs = state.userSettings.customCategories.map(c => ({
        key: c.id,
        label: c.name,
        color: c.color,
        valueType: c.type,
        scaleMin: c.scaleMin,
        scaleMax: c.scaleMax,
        builtin: false
    }));
    return builtins.concat(customs);
}
function getCustomCategoryByKey(key) {
    ensureCustomCategories();
    return state.userSettings.customCategories.find(c => c.id === key);
}

function deleteEmotion(emotionId) {
    if (!confirm("Delete this emotion? Historical logs using this tag will display 'Deleted Positive/Negative Emotion'.")) return;
    const target = state.userSettings.customEmotions.find(e => e.id === emotionId);
    const fallback = target.valence === 'positive' ? 'fallback_positive' : 'fallback_negative';
    state.dailyLogs.forEach(log => {
        if (log.type === 'emotion' && log.value === emotionId) log.value = fallback;
    });
    state.userSettings.customEmotions = state.userSettings.customEmotions.filter(e => e.id !== emotionId);
    saveStateToLocalStorage();
    renderLogger();
    renderSettings();
}

function deleteSymptom(symptomId) {
    if (!confirm("Delete this symptom? Historical logs using this tag will display 'Custom Symptom (Deleted)'.")) return;
    state.dailyLogs.forEach(log => {
        if (log.type === 'symptom' && log.value === symptomId) log.value = 'fallback_symptom';
    });
    state.userSettings.customSymptoms = state.userSettings.customSymptoms.filter(s => s.id !== symptomId);
    saveStateToLocalStorage();
    renderLogger();
    renderSettings();
}

function deleteActivity(activityId) {
    if (!confirm("Delete this activity? Historical logs using this tag will display 'Custom Activity (Deleted)'.")) return;
    state.dailyLogs.forEach(log => {
        if (log.type === 'activity' && log.value === activityId) log.value = 'fallback_activity';
    });
    state.userSettings.customActivities = state.userSettings.customActivities.filter(a => a.id !== activityId);
    saveStateToLocalStorage();
    renderLogger();
    renderSettings();
}

function resetAllData() {
    if (!confirm("Reset all data? This deletes every log and your custom emotion/symptom/activity list, and reseeds defaults and demo logs.")) return;
    localStorage.removeItem('lifesync_data');
    state = {
        userSettings: {
            customEmotions:   [...DEFAULT_EMOTIONS],
            customSymptoms:   [...DEFAULT_SYMPTOMS],
            customActivities: [...DEFAULT_ACTIVITIES]
        },
        dailyLogs: generateMockData()
    };
    state.meta = { seeded: true, migratedToV3: true };
    saveStateToLocalStorage();
    renderLogger();
    renderSettings();
    refreshCalendarUI();
}

// --- 9. INSIGHTS ENGINE -------------------------------------------------------

function renderInsights() {
    updateRangeChipsUI();
    if (!state.userSettings.preferences.insightsTab) state.userSettings.preferences.insightsTab = 'trends';
    const tab = state.userSettings.preferences.insightsTab;
    // V5: clear the chart container ONCE so toggling a range chip or tab
    // doesn't stack duplicates. Each chart appends its own.
    const charts = document.getElementById('insights-charts');
    if (charts) charts.innerHTML = '';
    charts.insertAdjacentHTML('beforeend', `
        <div class="insights-tabs">
            <button onclick="setInsightsTab('trends')"   class="insights-tab-btn ${tab === 'trends'   ? 'on' : ''}">Trends</button>
            <button onclick="setInsightsTab('patterns')" class="insights-tab-btn ${tab === 'patterns' ? 'on' : ''}">Patterns</button>
            <button onclick="setInsightsTab('calendar')" class="insights-tab-btn ${tab === 'calendar' ? 'on' : ''}">Calendar</button>
        </div>
    `);
    const renderers = INSIGHTS_TAB_RENDERERS[tab] || [];
    renderers.forEach(name => {
        try { window[name](); } catch (e) { console.error(name, e); }
    });
    // renderInsightSummary lives outside #insights-charts and always renders
    // (it's the always-on summary footer).
    renderInsightSummaryV2();
}

// DEPRECATED V6.5 — removed from INSIGHTS_TAB_RENDERERS (curation: line-of-dots overlapped with Stream dots).
function renderEnergyTrendChart() {
    const charts = document.getElementById('insights-charts');
    if (!charts) return;

    const energyEntries = applyDateRangeFilter(state.dailyLogs).filter(l => l.type === 'energy');
    if (energyEntries.length === 0) {
        charts.insertAdjacentHTML('beforeend', `
            <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
                <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-2">Energy Over Time</p>
                <p class="text-[var(--ls-ink-soft)] text-center py-6 text-sm">Log an energy entry to see your trend.</p>
            </div>
        `);
        return;
    }

    // Group energy entries by day, average.
    const dayMap = new Map();
    energyEntries.forEach(l => {
        const day = l.date.split('T')[0];
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day).push(l);
    });
    const points = Array.from(dayMap, ([day, logs]) => ({
        day,
        ts: new Date(day + 'T12:00').getTime(),
        energy: logs.reduce((s, l) => s + l.value, 0) / logs.length
    })).sort((a, b) => a.ts - b.ts);

    const W = 600, H = 240, padL = 32, padR = 16, padT = 12, padB = 32;
    const tsMin = points[0].ts;
    const tsMax = points[points.length - 1].ts;
    const span  = Math.max(tsMax - tsMin, 24 * 60 * 60 * 1000);
    const singlePoint = points.length === 1;

    const xFor = ts => singlePoint
        ? padL + (W - padL - padR) / 2
        : padL + ((ts - tsMin) / span) * (W - padL - padR);
    const yFor = e => padT + ((10 - e) / 9) * (H - padT - padB);
    const pathD = points.map((p, i) =>
        `${i === 0 ? 'M' : 'L'}${xFor(p.ts).toFixed(1)},${yFor(p.energy).toFixed(1)}`
    ).join(' ');
    const fillD = `${pathD} L${xFor(tsMax).toFixed(1)},${yFor(1).toFixed(1)} L${xFor(tsMin).toFixed(1)},${yFor(1).toFixed(1)} Z`;
    const axisLabels = singlePoint
        ? ''
        : `<text x="${padL}" y="${H - 8}" font-size="10" fill="#A0876A" font-weight="700">${new Date(tsMin).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>
           <text x="${W - padR}" y="${H - 8}" text-anchor="end" font-size="10" fill="#A0876A" font-weight="700">${new Date(tsMax).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>`;

    // Warm terracotta line + peach fill. Stroke uses --ls-accent-deep so it
    // reads cleanly against the cream card.
    charts.insertAdjacentHTML('beforeend', `
        <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
            <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-2">Energy Over Time</p>
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="w-full h-auto">
                <defs>
                    <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stop-color="#D89B5C" stop-opacity="0.35"/>
                        <stop offset="100%" stop-color="#D89B5C" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                ${[1, 5, 10].map(energy => {
                    const y = yFor(energy);
                    return `
                        <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#ECE3D0" stroke-width="1"/>
                        <text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#A0876A" font-weight="700">${energy}</text>
                    `;
                }).join('')}
                <path d="${fillD}" fill="url(#energyFill)"/>
                <path d="${pathD}" fill="none" stroke="#B47A3C" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/>
                ${points.map(p => `<circle cx="${xFor(p.ts).toFixed(1)}" cy="${yFor(p.energy).toFixed(1)}" r="4" fill="#D89B5C" stroke="#FAF6EE" stroke-width="2.5"/>`).join('')}
                ${axisLabels}
            </svg>
        </div>
    `);
}

// --- 9b. TOP 3 INFLUENCERS (V4.1) --------------------------------------------
// For each custom tag (activities + emotions), compute the mean of each daily
// target metric (avg energy, worst symptom severity, mood polarity) on days
// WITH the tag vs WITHOUT, then rank by absolute delta (forgiving small day
// counts so we surface even sparse patterns, while still requiring min 3 days
// on each side).
function severityScore(sev) {
    return sev === 'severe' ? 3 : sev === 'moderate' ? 2 : sev === 'mild' ? 1 : 0;
}
function dayTargetAvg(rec, targetKey) {
    if (targetKey === 'energy') {
        if (!rec.energy.length) return null;
        return rec.energy.reduce((s, v) => s + v, 0) / rec.energy.length;
    }
    if (targetKey === 'syms') {
        if (!rec.syms.length) return null;
        return rec.syms.reduce((s, v) => Math.max(s, v), 0);
    }
    if (targetKey === 'emos') {
        if (!rec.emos.length) return null;
        const polarity = rec.emos.map(e => classifyEmotion(e).valence === 'positive' ? 1 : -1);
        return polarity.reduce((s, v) => s + v, 0) / polarity.length;
    }
    return null;
}
function computeTagDelta(daysArr, channelKey, tagId, targetKey) {
    let withSum = 0, withN = 0, withoutSum = 0, withoutN = 0;
    daysArr.forEach(([day, rec]) => {
        const v = dayTargetAvg(rec, targetKey);
        if (v === null) return;
        const hasTag = channelKey === 'acts'  ? rec.acts.includes(tagId)
                     : channelKey === 'emos' ? rec.emos.includes(tagId)
                     : false;
        if (hasTag) { withSum += v; withN++; } else { withoutSum += v; withoutN++; }
    });
    const withAvg    = withN    > 0 ? withSum    / withN    : null;
    const withoutAvg = withoutN > 0 ? withoutSum / withoutN : null;
    const delta      = (withAvg !== null && withoutAvg !== null) ? withAvg - withoutAvg : 0;
    return { delta, nWith: withN, nWithout: withoutN };
}
function renderTopInfluencers() {
    const charts = document.getElementById('insights-charts');
    if (!charts) return;
    const scoped = applyDateRangeFilter(state.dailyLogs);
    // Build per-day aggregates.
    const dayMap = new Map();
    scoped.forEach(l => {
        const d = l.date.split('T')[0];
        if (!dayMap.has(d)) dayMap.set(d, { energy: [], syms: [], acts: [], emos: [] });
        const r = dayMap.get(d);
        if (l.type === 'energy')   r.energy.push(l.value);
        if (l.type === 'symptom')  r.syms.push(severityScore(l.severity));
        if (l.type === 'activity') r.acts.push(l.value);
        if (l.type === 'emotion')  r.emos.push(l.value);
    });
    const daysArr = [...dayMap.entries()];
    if (daysArr.length < 3) {
        charts.insertAdjacentHTML('beforeend', `
            <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
                <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-2">Top 3 Influencers</p>
                <p class="text-[var(--ls-ink-soft)] text-center py-6 text-sm">Need at least 3 days of data to spot patterns. Keep going!</p>
            </div>`);
        return;
    }
    const tagChannels = [
        { type: 'activities', key: 'acts',  list: state.userSettings.customActivities, label: 'Activity' },
        { type: 'emotions',   key: 'emos',  list: state.userSettings.customEmotions,   label: 'Emotion'  }
    ];
    const targets = [
        { key: 'energy', label: 'Energy',     fmt: v => v.toFixed(1) + ' pts',  goodPolarity: 'up' },
        { key: 'syms',   label: 'Symptoms',   fmt: v => v.toFixed(2),           goodPolarity: 'down' },
        { key: 'emos',   label: 'Positivity', fmt: v => (v * 100).toFixed(0) + '%', goodPolarity: 'up' }
    ];
    const influences = [];
    tagChannels.forEach(ch => {
        ch.list.forEach(tag => {
            targets.forEach(t => {
                const { delta, nWith, nWithout } = computeTagDelta(daysArr, ch.key, tag.id, t.key);
                if (nWith >= 3 && nWithout >= 3 && Number.isFinite(delta)) {
                    influences.push({ tag: tag.name, target: t.label, delta, fmt: t.fmt(delta), polarity: t.goodPolarity, n: nWith, total: daysArr.length });
                }
            });
        });
    });
    influences.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const top3 = influences.slice(0, 3);
    if (top3.length === 0) {
        charts.insertAdjacentHTML('beforeend', `
            <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
                <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-2">Top 3 Influencers</p>
                <p class="text-[var(--ls-ink-soft)] text-center py-6 text-sm">No clear pattern found yet — try logging more energy/mood alongside your tags.</p>
            </div>`);
        return;
    }
    const cards = top3.map(inf => {
        const dir = inf.polarity === 'up'
            ? (inf.delta >  0.1 ? 'up'   : inf.delta < -0.1 ? 'down' : 'flat')
            : (inf.delta < -0.1 ? 'up'   : inf.delta >  0.1 ? 'down' : 'flat');
        const sign = inf.delta > 0 ? '+' : '';
        return `
            <div class="influencer-card">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="influencer-tag">${escapeHtml(inf.tag)}</span>
                    <span class="influencer-arrow">→</span>
                    <span class="influencer-target">${escapeHtml(inf.target)}</span>
                </div>
                <div class="flex items-baseline">
                    <span class="influencer-delta ${dir}">${sign}${escapeHtml(inf.fmt)}</span>
                    <span class="influencer-unit">vs days without</span>
                </div>
                <div class="influencer-n">Found on ${inf.n} of ${inf.total} days</div>
            </div>`;
    }).join('');
    charts.insertAdjacentHTML('beforeend', `
        <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
            <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-3">Top 3 Influencers</p>
            <div class="influencer-rail">${cards}</div>
        </div>`);
}

// --- 9c. CALENDAR SEVERITY MAP (V4.1) ---------------------------------------
// 6-week grid. Each day is colored by the WORST symptom severity logged that
// day; non-symptom days are cream; days with no data are transparent.
// DEPRECATED V6.5 — removed from INSIGHTS_TAB_RENDERERS (curation: the Month calendar view IS the calendar insight).
function renderCalendarSeverityMap() {
    const charts = document.getElementById('insights-charts');
    if (!charts) return;
    const scoped = applyDateRangeFilter(state.dailyLogs);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 41; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
    }
    const buckets = new Map();
    scoped.forEach(l => {
        const day = l.date.split('T')[0];
        if (!buckets.has(day)) buckets.set(day, { worst: 0, anyData: false });
        const b = buckets.get(day);
        if (l.type === 'symptom') {
            const s = severityScore(l.severity);
            if (s > b.worst) b.worst = s;
            b.anyData = true;
        } else if (l.type !== 'note') {
            b.anyData = true;
        }
    });
    const cells = days.map(d => {
        const b = buckets.get(d);
        const num = parseInt(d.split('-')[2], 10);
        let cls = 'empty';
        if (b && b.anyData) {
            cls = b.worst === 3 ? 'severe' : b.worst === 2 ? 'moderate' : b.worst === 1 ? 'mild' : 'clear';
        }
        return `<div class="heatmap-cell ${cls}" onclick="openDayModal('${d}', state.dailyLogs.filter(l => l.date.startsWith('${d}')))"><span class="day-num">${num}</span></div>`;
    }).join('');
    charts.insertAdjacentHTML('beforeend', `
        <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
            <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-3">Symptom Severity — Last 6 Weeks</p>
            <div class="heatmap-grid">${cells}</div>
            <div class="heatmap-legend">
                <span><span class="swatch" style="background:#F1D88A"></span>Mild</span>
                <span><span class="swatch" style="background:#E89C5B"></span>Mod</span>
                <span><span class="swatch" style="background:#C44033"></span>Severe</span>
                <span><span class="swatch" style="background:transparent;border:1px solid var(--ls-bg-deep)"></span>None</span>
            </div>
        </div>`);
}

// --- 9d. MULTI-AXIS PARALLEL CHART (V4.1) ------------------------------------
// Four normalized channels (energy 1-10, mood -1..+1, symptom 0..3, activity
// count 0..maxN) plotted on the same time axis. Each line uses min-max scaling
// so disparate scales share the visual canvas. Tap a point to "scrub" the
// legend pill at the top to that day's raw values.
// DEPRECATED V6.5 — removed from INSIGHTS_TAB_RENDERERS (curation: stacked axes over-engineered for the use case).
function renderMultiAxisChart() {
    const charts = document.getElementById('insights-charts');
    if (!charts) return;
    const scoped = applyDateRangeFilter(state.dailyLogs);
    if (scoped.length === 0) {
        charts.insertAdjacentHTML('beforeend', `
            <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
                <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-2">Parallel Channels</p>
                <p class="text-[var(--ls-ink-soft)] text-center py-6 text-sm">Log energy, mood, symptoms, and activities to compare them on one timeline.</p>
            </div>`);
        return;
    }
    const dayMap = new Map();
    scoped.forEach(l => {
        const day = l.date.split('T')[0];
        if (!dayMap.has(day)) dayMap.set(day, { ts: new Date(day + 'T12:00').getTime(), energy: null, sym: 0, mood: null, acts: 0 });
        const r = dayMap.get(day);
        if (l.type === 'energy')   r.energy = (r.energy == null) ? l.value : (r.energy + l.value) / 2;
        if (l.type === 'symptom')  r.sym = Math.max(r.sym, severityScore(l.severity));
        if (l.type === 'emotion')  {
            const v = classifyEmotion(l.value).valence === 'positive' ? 1 : -1;
            r.mood = (r.mood == null) ? v : (r.mood + v) / 2;
        }
        if (l.type === 'activity') r.acts += 1;
    });
    const days = Array.from(dayMap.values()).sort((a, b) => a.ts - b.ts);
    const n = days.length;
    const W = 350, H = 160, padL = 14, padR = 14, padT = 8, padB = 20;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const xFor = i => n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
    const yFor = v => padT + (1 - v) * plotH;
    function normalize(arr, lo, hi) {
        if (hi === lo) return arr.map(v => v === null ? null : 0.5);
        return arr.map(v => v === null ? null : (v - lo) / (hi - lo));
    }
    const eRaw = days.map(d => d.energy);
    const mRaw = days.map(d => d.mood == null ? null : d.mood + 1); // -1..+1 -> 0..2
    const sRaw = days.map(d => d.sym);
    const aRaw = days.map(d => d.acts);
    const aMax = Math.max(3, ...aRaw);
    const eN = normalize(eRaw, 1, 10);
    const mN = normalize(mRaw, 0, 2);
    const sN = normalize(sRaw, 0, 3);
    const aN = normalize(aRaw, 0, aMax);
    function pathD(arr) {
        const parts = [];
        let pen = true;
        arr.forEach((v, i) => {
            if (v === null) { pen = true; return; }
            parts.push(`${pen ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`);
            pen = false;
        });
        return parts.join(' ') || 'M0,0';
    }
    const lastIdx = n - 1;
    const ld = days[lastIdx];
    function fmtMood(m) { return m == null ? '–' : (m > 0 ? '+' : '') + m.toFixed(2); }
    charts.insertAdjacentHTML('beforeend', `
        <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
            <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-3">Parallel Channels — Across Time</p>
            <div class="parallel-card" style="border:none;padding:0;">
                <div class="parallel-legend">
                    <div class="pl-i"><span class="pl-label">Energy</span><span class="pl-val" style="color:#D89B5C">${ld.energy == null ? '–' : ld.energy.toFixed(0) + '/10'}</span></div>
                    <div class="pl-i"><span class="pl-label">Mood</span><span class="pl-val" style="color:#7E9A6B">${fmtMood(ld.mood)}</span></div>
                    <div class="pl-i"><span class="pl-label">Symptom</span><span class="pl-val" style="color:#C44033">${ld.sym > 0 ? ld.sym : '–'}</span></div>
                    <div class="pl-i"><span class="pl-label">Activity</span><span class="pl-val" style="color:#A0876A">${ld.acts}</span></div>
                </div>
                <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="parallel-chart-svg">
                    <line x1="${padL}" y1="${padT + plotH / 2}" x2="${W - padR}" y2="${padT + plotH / 2}" stroke="#ECE3D0" stroke-width="1" stroke-dasharray="3 3"/>
                    <path class="parallel-line" stroke="#D89B5C" d="${pathD(eN)}"/>
                    <path class="parallel-line" stroke="#7E9A6B" d="${pathD(mN)}"/>
                    <path class="parallel-line" stroke="#C44033" d="${pathD(sN)}"/>
                    <path class="parallel-line" stroke="#A0876A" d="${pathD(aN)}"/>
                </svg>
            </div>
        </div>`);
}

// --- 9e. DAY-OF-WEEK PATTERN (V4.1) ------------------------------------------
// 7 vertical bars (Sun..Sat), each = avg energy on that weekday. Peak bar gets
// the accent color; bars below a dashed baseline (grand avg) are dimmed.
function renderDayOfWeekChart() {
    const charts = document.getElementById('insights-charts');
    if (!charts) return;
    const scoped = applyDateRangeFilter(state.dailyLogs);
    if (scoped.length === 0) {
        charts.insertAdjacentHTML('beforeend', `
            <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
                <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-2">Day-of-Week Pattern</p>
                <p class="text-[var(--ls-ink-soft)] text-center py-6 text-sm">Log entries on different weekdays to spot patterns.</p>
            </div>`);
        return;
    }
    const energyByDow = [[], [], [], [], [], [], []]; // 0=Sun..6=Sat
    scoped.forEach(l => {
        if (l.type !== 'energy') return;
        energyByDow[new Date(l.date).getDay()].push(l.value);
    });
    const avgs = energyByDow.map(arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
    const peakIdx = avgs.indexOf(Math.max(...avgs));
    const grandAvg = avgs.reduce((s, v) => s + v, 0) / 7;
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const bars = avgs.map((avg, i) => {
        const heightPct = avg > 0 ? (avg / 10) * 100 : 4;
        const cls = i === peakIdx && avg > 0 ? 'peak'
                  : avg < grandAvg - 0.5 ? 'low'
                  : 'flat';
        const val = avg > 0 ? avg.toFixed(1) : '–';
        return `
            <div class="dow-col">
                <span class="dow-val">${val}</span>
                <div class="dow-bar ${cls}" style="height:${heightPct.toFixed(0)}%"></div>
                <span class="dow-label">${labels[i]}</span>
            </div>`;
    }).join('');
    // Drop the old absolute-positioned baseline line — it was misaligned
    // because each bar sits below a `.dow-val` text label whose height ate
    // column space. Use a clear "Avg" pill below the chart instead (no
    // positioning math, easier to scan).
    charts.insertAdjacentHTML('beforeend', `
        <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
            <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-3">Day-of-Week Pattern — Avg Energy</p>
            <div class="dow-chart">${bars}</div>
            <p class="text-center text-[12px] font-bold text-[var(--ls-ink-mute)] mt-2">
                All-weekday average: <span style="color:var(--ls-accent)">${grandAvg.toFixed(1)}/10</span>
            </p>
        </div>`);
}function renderInsightSummary() {
        // Deprecated in V6.5 — replaced by renderInsightSummaryV2 (two 44px-headline
        // cards: Average Energy + Your Best Day). The dispatcher in renderInsights()
        // now calls V2 instead. Kept as an explicit no-op stub so anyone grepping for
        // the old symbol still finds this comment explaining the migration.
        return;
    }

// --- 9c. BEHAVIORAL CORRELATION GRID (V4) -------------------------------------
// For each activity tag, compute the average energy on days WHERE the activity
// was logged vs. days WHERE it was NOT. Render as a row with two thin bars
// (with-tag | without-tag) and a small delta badge.
function renderBehavioralCorrelationGrid() {
    const charts = document.getElementById('insights-charts');
    if (!charts) return;

    const scoped = applyDateRangeFilter(state.dailyLogs);
    const activities = state.userSettings.customActivities;
    if (activities.length === 0 || scoped.length === 0) {
        charts.insertAdjacentHTML('beforeend', `
            <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
                <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)]">Behavioral Correlation</p>
                <p class="text-[var(--ls-ink-soft)] text-sm mt-2">Add an activity in Settings to see how your habits correlate with energy.</p>
            </div>
        `);
        return;
    }

    // Group entries by day.
    const dayMap = new Map();
    scoped.forEach(l => {
        const day = l.date.split('T')[0];
        if (!dayMap.has(day)) dayMap.set(day, { energy: [], activities: [] });
        const bucket = dayMap.get(day);
        if (l.type === 'energy') bucket.energy.push(l.value);
        if (l.type === 'activity') bucket.activities.push(l.value);
    });

    const rows = activities.map(act => {
        let withSum = 0, withN = 0, withoutSum = 0, withoutN = 0;
        dayMap.forEach(b => {
            const dayAvg = b.energy.length ? b.energy.reduce((s, v) => s + v, 0) / b.energy.length : null;
            if (dayAvg === null) return;
            if (b.activities.includes(act.id)) { withSum += dayAvg; withN++; }
            else                              { withoutSum += dayAvg; withoutN++; }
        });
        const withAvg    = withN    ? withSum    / withN    : null;
        const withoutAvg = withoutN ? withoutSum / withoutN : null;
        const delta = (withAvg !== null && withoutAvg !== null) ? (withAvg - withoutAvg) : null;
        return { act, withAvg, withoutAvg, delta, withN, withoutN };
    });

    charts.insertAdjacentHTML('beforeend', `
        <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
            <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-1">Behavioral Correlation</p>
            <p class="text-[12px] text-[var(--ls-ink-soft)] mb-3">Avg energy on days you DID vs. DIDN'T log each activity</p>
            <div class="space-y-2.5" id="behavioral-rows"></div>
        </div>
    `);
    const rowsHost = document.getElementById('behavioral-rows');
    rows.forEach(r => {
        const widthFor = v => v ? Math.max(4, Math.min(100, (v / 10) * 100)) : 0;
        const deltaSign = r.delta === null ? '–' : (r.delta >= 0 ? `+${r.delta.toFixed(1)}` : r.delta.toFixed(1));
        const deltaColor = r.delta === null ? 'text-[var(--ls-ink-mute)]'
                         : r.delta >= 0 ? 'text-[#5F7A50]'
                         : 'text-[#A0332A]';
        rowsHost.insertAdjacentHTML('beforeend', `
            <div class="text-[12px]">
                <div class="flex items-center justify-between mb-1">
                    <span class="font-bold text-[var(--ls-ink)]">${escapeHtml(r.act.name)}</span>
                    <span class="${deltaColor} font-black">${deltaSign}</span>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex-1 bg-[var(--ls-bg-soft)] rounded-full h-2.5 overflow-hidden"><div class="h-full bg-[var(--ls-accent)]" style="width:${widthFor(r.withAvg)}%"></div></div>
                    <span class="w-12 text-right font-bold text-[var(--ls-accent-deep)]">${r.withAvg !== null ? r.withAvg.toFixed(1) : '–'}</span>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex-1 bg-[var(--ls-bg-soft)] rounded-full h-2.5 overflow-hidden"><div class="h-full bg-[var(--ls-ink-mute)]" style="width:${widthFor(r.withoutAvg)}%"></div></div>
                    <span class="w-12 text-right font-bold text-[var(--ls-ink-mute)]">${r.withoutAvg !== null ? r.withoutAvg.toFixed(1) : '–'}</span>
                </div>
                <div class="text-[10px] text-[var(--ls-ink-mute)] mt-1">${r.withN}d logged · ${r.withoutN}d not</div>
            </div>
        `);
    });
}

// --- 9d. SYMPTOM CO-OCCURRENCE CHART (V4) -------------------------------------
// For each symptom, compute the % of days the symptom was logged that ALSO had
// activity / emotion tags. Render as a horizontal bar list.
function renderSymptomCooccurrenceChart() {
    const charts = document.getElementById('insights-charts');
    if (!charts) return;

    const scoped = applyDateRangeFilter(state.dailyLogs);
    const symptoms = state.userSettings.customSymptoms;
    if (symptoms.length === 0 || scoped.length === 0) {
        charts.insertAdjacentHTML('beforeend', `
            <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
                <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)]">Symptom Co-occurrence</p>
                <p class="text-[var(--ls-ink-soft)] text-sm mt-2">Add a symptom in Settings to see what tends to co-occur with it.</p>
            </div>
        `);
        return;
    }

    const dayMap = new Map();
    scoped.forEach(l => {
        const day = l.date.split('T')[0];
        if (!dayMap.has(day)) dayMap.set(day, { symptoms: [], activities: [], emotions: [] });
        const b = dayMap.get(day);
        if (l.type === 'symptom')  b.symptoms.push(l.value);
        if (l.type === 'activity') b.activities.push(l.value);
        if (l.type === 'emotion')  b.emotions.push(l.value);
    });

    charts.insertAdjacentHTML('beforeend', `
        <div class="ios-card bg-white border border-[var(--ls-bg-deep)] p-5">
            <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mb-1">Symptom Co-occurrence</p>
            <p class="text-[12px] text-[var(--ls-ink-soft)] mb-3">Most common tags on days a symptom was logged</p>
            <div class="space-y-2.5" id="cooccur-rows"></div>
        </div>
    `);
    const host = document.getElementById('cooccur-rows');

    symptoms.forEach(sym => {
        let symptomDays = 0;
        const tagHits = new Map();
        dayMap.forEach(b => {
            if (!b.symptoms.includes(sym.id)) return;
            symptomDays++;
            b.activities.forEach(a => tagHits.set('a:' + a, (tagHits.get('a:' + a) || 0) + 1));
            b.emotions.forEach(e => tagHits.set('e:' + e, (tagHits.get('e:' + e) || 0) + 1));
        });

        if (symptomDays === 0) {
            host.insertAdjacentHTML('beforeend', `
                <div class="text-[12px] text-[var(--ls-ink-mute)] italic">${escapeHtml(sym.name)} — no occurrences in range</div>
            `);
            return;
        }
        const top = Array.from(tagHits, ([key, n]) => ({ key, n, pct: Math.round((n / symptomDays) * 100) }))
                         .sort((a, b) => b.n - a.n).slice(0, 4);
        const labelFor = k => k.startsWith('a:') ? classifyActivity(k.slice(2)).label
                            : k.startsWith('e:') ? classifyEmotion(k.slice(2)).label
                            : k;
        host.insertAdjacentHTML('beforeend', `
            <div class="text-[12px] pt-2 border-t border-[var(--ls-bg-deep)] first:pt-0 first:border-0">
                <div class="font-bold text-[var(--ls-ink)] mb-1">${escapeHtml(sym.name)} <span class="text-[10px] text-[var(--ls-ink-mute)] font-normal">(${symptomDays}d)</span></div>
                ${top.map(t => `
                    <div class="flex items-center gap-2 mb-1">
                        <span class="w-4 text-[10px] text-[var(--ls-ink-mute)] uppercase">${t.key.startsWith('a:') ? 'act' : 'emo'}</span>
                        <div class="flex-1 bg-[var(--ls-bg-soft)] rounded-full h-2 overflow-hidden"><div class="h-full bg-[var(--ls-accent)]" style="width:${Math.max(4, t.pct)}%"></div></div>
                        <span class="w-24 truncate text-[var(--ls-ink)] font-bold">${escapeHtml(labelFor(t.key))}</span>
                        <span class="w-10 text-right font-black text-[var(--ls-accent-deep)]">${t.pct}%</span>
                    </div>
                `).join('')}
            </div>
        `);
    });
}

function statCard(label, value, suffix, tone) {
    // Warm tones: accent terracotta, sage positive, dusty-rose negative, ink for neutral.
    const tones = {
        accent: "text-[#B47A3C]",
        pos:    "text-[#5F7A50]",
        neg:    "text-[#A0332A]",
        ink:    "text-[#3D3548]"
    };
    return `
        <div class="bg-white ios-card border border-[#ECE3D0] shadow-sm p-4">
            <div class="text-[10px] font-black uppercase tracking-widest text-[#A0876A]">${label}</div>
            <div class="mt-1 text-2xl font-black ${tones[tone] || 'text-[#3D3548]'}">${value}${suffix ? `<span class="text-sm font-bold text-[#A0876A] ml-1">${suffix}</span>` : ''}</div>
        </div>
    `;
}

// --- HELPERS ------------------------------------------------------------------

function classifyEmotion(id) {
    if (id === 'fallback_positive') return { deleted: true, valence: 'positive', label: FALLBACK_LABEL.fallback_positive, color: 'emerald' };
    if (id === 'fallback_negative') return { deleted: true, valence: 'negative', label: FALLBACK_LABEL.fallback_negative, color: 'rose' };
    const emo = state.userSettings.customEmotions.find(e => e.id === id);
    if (emo)                      return { deleted: false, valence: emo.valence, label: emo.name, color: emo.valence === 'positive' ? 'emerald' : 'rose' };
    return                              { deleted: false, valence: null,        label: 'Unknown',       color: 'slate' };
}

function classifySymptom(id) {
    if (id === 'fallback_symptom') return { deleted: true,  label: FALLBACK_LABEL.fallback_symptom };
    const s = state.userSettings.customSymptoms.find(x => x.id === id);
    if (s)                          return { deleted: false, label: s.name };
    return                                { deleted: false, label: 'Unknown symptom' };
}

function classifyActivity(id) {
    if (id === 'fallback_activity') return { deleted: true,  label: FALLBACK_LABEL.fallback_activity };
    const a = state.userSettings.customActivities.find(x => x.id === id);
    if (a)                          return { deleted: false, label: a.name };
    return                                { deleted: false, label: 'Unknown activity' };
}



// Minimal HTML escape to keep user-typed names safe when rendered into innerHTML.
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// --- 6c. DAY TIMELINE (V4.1) ---------------------------------------------------
// Time-rooted comparison view: a 24-row × 5-column grid where the VERTICAL
// axis is the wall-clock (00:00 at top of day, 23:00 near bottom) and the
// HORIZONTAL axis is one column per category. Each entry is plotted as a
// colour-coded dot in its (hour, category) cell so the user can compare
// across categories AT THE SAME INSTANT. Lane backgrounds carry subtle
// per-category tints so the heat of the day's events reads visually even
// without inspecting every dot.
function renderDayTimeline() {
    const feed = document.getElementById('continuous-timeline-feed');
    feed.innerHTML = '';
    feed.className = 'relative pt-1 pb-32 overflow-y-auto no-scrollbar';

    if (state.dailyLogs.length === 0) {
        feed.innerHTML += '<p class="text-center text-[var(--ls-ink-mute)] text-sm mt-10">No entries logged yet.</p>';
        return;
    }

    // YYYY-MM-DD for "today" using local-date arithmetic (timezone-safe).
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    let displayIso = todayIso;
    let displayLogs = state.dailyLogs.filter(l => l.date.startsWith(todayIso));
    // If there's nothing today yet, fall back to the most recent day that
    // has at least one entry — never a blank page.
    if (displayLogs.length === 0) {
        const sorted = [...state.dailyLogs].sort((a, b) => b.date.localeCompare(a.date));
        for (const log of sorted) {
            const d = log.date.split('T')[0];
            if (d !== todayIso) { displayIso = d; break; }
        }
        displayLogs = state.dailyLogs.filter(l => l.date.startsWith(displayIso));
    }
    const isToday = displayIso === todayIso;

    // Summary chip row above the grid.
    const [yy, mm, dd] = displayIso.split('-');
    const dateObj = new Date(parseInt(yy), parseInt(mm) - 1, parseInt(dd));
    const counts = {
        energy:   displayLogs.filter(l => l.type === 'energy').length,
        emotion:  displayLogs.filter(l => l.type === 'emotion').length,
        symptom:  displayLogs.filter(l => l.type === 'symptom').length,
        activity: displayLogs.filter(l => l.type === 'activity').length,
        note:     displayLogs.filter(l => l.type === 'note').length
    };
    feed.insertAdjacentHTML('beforeend', `
        <div class="day-summary">
            <p class="text-[15px] font-black text-[var(--ls-ink)] tracking-tight">${isToday ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'long' })}</p>
            <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mt-0.5">${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            <div class="flex gap-1.5 mt-3 flex-wrap">
                <span class="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style="background:#FBEFD9;color:#B47A3C;border:1px solid #E0A967">Energy ${counts.energy}</span>
                <span class="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style="background:#ECF2E3;color:#5F7A50;border:1px solid #CBD9B5">Emotion ${counts.emotion}</span>
                <span class="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style="background:#F8E2CB;color:#B47A3C;border:1px solid #E7B985">Symptom ${counts.symptom}</span>
                <span class="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style="background:#E9EEF6;color:#3D5470;border:1px solid #C3CCDE">Activity ${counts.activity}</span>
                <span class="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style="background:#F0E7D9;color:#6E5E5E;border:1px solid #DCC9AC">Note ${counts.note}</span>
            </div>
        </div>
    `);

    // Sticky header row.
    feed.insertAdjacentHTML('beforeend', `
        <div class="day-header-row">
            <div class="day-time-head">Time</div>
            <div class="day-col-head">Energy</div>
            <div class="day-col-head">Emotion</div>
            <div class="day-col-head">Symptom</div>
            <div class="day-col-head">Activity</div>
            <div class="day-col-head">Note</div>
        </div>
    `);

    // 24 rows × (1 time + 5 category cells) = 144 grid items. Each row is
    // 30 px tall; day-axis label only renders on majors (every 3 hours).
    const currentHour = today.getHours();
    let grid = '<div class="day-grid">';
    for (let h = 0; h < 24; h++) {
        const hourLabel = String(h).padStart(2, '0');
        const isMajor = (h % 3 === 0);
        const isNow   = isToday && h === currentHour;
        const rowClass = `day-hour ${isMajor ? 'major' : ''}${isNow ? ' day-now-row' : ''}`;
        grid += `<div class="${rowClass}"><div class="day-h-axis">${isMajor ? hourLabel : ''}</div></div>`;          // 1: time gutter
        grid += `<div class="${rowClass} day-row-bg-energy"></div>`;                                                // 2: energy
        grid += `<div class="${rowClass} day-row-bg-emotion"></div>`;                                                // 3: emotion (gradient handled in CSS)
        grid += `<div class="${rowClass} day-row-bg-symptom"></div>`;                                                // 4: symptom
        grid += `<div class="${rowClass} day-row-bg-activity"></div>`;                                               // 5: activity
        grid += `<div class="${rowClass} day-row-bg-note"></div>`;                                                   // 6: note
    }
    grid += '</div>';
    feed.insertAdjacentHTML('beforeend', grid);

    // Place dots. The grid is FLAT (children of .day-grid), so cell index =
    //   baseTime + 1 (time gutter) + categoryIndex  for hour `h`:
    //     base      = 6*h
    //     time cell = 6*h + 0  (axis gutter)
    //     cat cell  = 6*h + 1 + idx   where idx = 0..4 for [energy,emotion,symptom,activity,note]
    const CATEGORIES = ['energy', 'emotion', 'symptom', 'activity', 'note'];
    const cellsByHourCat = {}; // track count per (hour,category) to stagger dots.
    displayLogs.forEach(log => {
        const d = new Date(log.date);
        const hour = d.getHours();
        const idx = CATEGORIES.indexOf(log.type);
        if (idx === -1) return;
        const cellIndex = 6 * hour + 1 + idx;
        const cell = feed.querySelector('.day-grid').children[cellIndex];
        if (!cell) return;
        const key = `${hour}-${log.type}`;
        cellsByHourCat[key] = (cellsByHourCat[key] || 0) + 1;
        const nth = cellsByHourCat[key] - 1;
        const dot = document.createElement('div');
        dot.className = 'day-dot';
        dot.style.backgroundColor = entryNodeColor(log);
        dot.style.left = `${6 + nth * 12}px`;
        // Friendlier tooltip with the actual entry text.
        let labelTxt = '';
        if (log.type === 'energy')                 labelTxt = `Energy ${log.value}/10`;
        else if (log.type === 'emotion')           labelTxt = classifyEmotion(log.value)?.label || '?';
        else if (log.type === 'symptom')           labelTxt = (classifySymptom(log.value)?.label || '?') + (log.severity ? ' (' + log.severity + ')' : '');
        else if (log.type === 'activity')          labelTxt = classifyActivity(log.value)?.label || '?';
        else if (log.type === 'note')              labelTxt = (log.value || '').slice(0, 60);
        dot.title = `${String(hour).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}  •  ${labelTxt}`;
        dot.onclick = (e) => { e.stopPropagation(); openDayModal(displayIso, [log]); };
        cell.appendChild(dot);
    });

    // "Now" indicator: a thin 1.5px accent line + tiny clock label spanning
    // the row of the current hour (only when viewing today). Helps locate
    // the live hour at a glance.
    if (isToday) {
        const minutesIntoHour = today.getMinutes();
        const cellIndex = 6 * currentHour + 0;  // 1st cell of current hour row = time gutter
        const cell = feed.querySelector('.day-grid').children[cellIndex];
        if (cell) {
            const nowline = document.createElement('div');
            nowline.className = 'absolute left-0 right-0 h-[1.5px] bg-[var(--ls-accent)] pointer-events-none';
            // Map minutes 0..59 onto the cell's 30px height.
            nowline.style.top = `${Math.round((minutesIntoHour / 60) * 28) + 1}px`;
            nowline.style.zIndex = '1';
            cell.appendChild(nowline);
        }
    }
}

// --- 6b. KANBAN TIMELINE (V4) ---------------------------------------------------
// Five vertical swimlanes laid out side-by-side with horizontal scroll-snap.
// Each lane shows all entries of one category, newest first at the top, grouped
// under inline date headers ("Today", "Yesterday", "Mar 14"). User swipes
// left/right to navigate categories; scroll inside a lane to see history.
// Inline 14-day mini-line for a Lane header. Y-axis differs per channel:
// energy 1-10, symptom severity 0-3, emotion polarity (positive ~top), and
// activity/note counts (clamped at 3/day).
function buildLaneSparkline(laneType) {
    const days = 14, W = 80, H = 24, stepX = W / (days - 1);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dayMap = new Map();
    state.dailyLogs.forEach(l => {
        if (l.type !== laneType) return;
        const day = l.date.split('T')[0];
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day).push(l.value);
    });
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const vals = dayMap.get(d.toISOString().split('T')[0]) || [];
        series.push(vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null);
    }
    const yFor = (v) => {
        if (v == null) return null;
        if (laneType === 'energy') return H - ((v - 1) / 9) * H;
        if (laneType === 'symptom') {
            const s = v === 'severe' ? 3 : v === 'moderate' ? 2 : v === 'mild' ? 1 : 0;
            return H - (s / 3) * H;
        }
        if (laneType === 'emotion') return H - (classifyEmotion(v).valence === 'positive' ? 0.85 : 0.15) * H;
        return H - Math.min(1, v / 3) * H; // activity / note: count, clamped at 3
    };
    const parts = [];
    let pen = true;
    series.forEach((v, i) => {
        const y = yFor(v);
        if (y === null) { pen = true; return; }
        parts.push(`${pen ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y.toFixed(1)}`);
        pen = false;
    });
    return parts.join(' ') || 'M0,12';
}

function renderKanbanTimeline() {
    const feed = document.getElementById('continuous-timeline-feed');
    feed.innerHTML = '';
    feed.className = 'pt-3 pb-32';

    if (state.dailyLogs.length === 0) {
        feed.innerHTML = '<p class="text-center text-[var(--ls-ink-mute)] text-sm mt-10">No entries logged yet.</p>';
        return;
    }

    const rail = document.createElement('div');
    rail.className = 'kanban-rail';

    const sorted = [...state.dailyLogs].sort((a, b) => b.date.localeCompare(a.date));
    // V4: date comparison uses local date components. UTC-derived .toISOString()
    // would produce dateOnly values that are off-by-one near midnight for anyone
    // west of UTC, then "Today" / "Yesterday" labels would mis-attribute.
    const today = new Date();
    const yest  = new Date(); yest.setDate(yest.getDate() - 1);
    const fmtLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const todayIso = fmtLocal(today);
    const yestIso  = fmtLocal(yest);

    [{ id: 'energy',   label: 'Energy',     color: '#D89B5C', dotColor: 'var(--ls-accent)' },
     { id: 'emotion',  label: 'Emotion',    color: '#7E9A6B', dotColor: '#7E9A6B' },
     { id: 'symptom',  label: 'Symptoms',   color: '#E89C5B', dotColor: '#E89C5B' },
     { id: 'activity', label: 'Activity',   color: '#7C9CB1', dotColor: '#7C9CB1' },
     { id: 'note',     label: 'Notes',      color: '#A0876A', dotColor: '#A0876A' }
    ].forEach(laneDef => {
        const laneLogs = sorted.filter(l => l.type === laneDef.id);
        const lane = document.createElement('div');
        lane.className = 'kanban-lane';

        // Lane header.
        const header = document.createElement('div');
        header.className = 'kanban-lane-header';
        const sparkPath = buildLaneSparkline(laneDef.key);
        header.innerHTML = `
            <span class="dot" style="background:${laneDef.color}"></span>
            <span class="lane-title">${laneDef.label}</span>
            <svg class="sparkline-svg" width="80" height="24" viewBox="0 0 80 24" preserveAspectRatio="none" aria-hidden="true">
                <path d="${sparkPath}" stroke="${laneDef.color}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="count">${laneLogs.length}</span>
        `;
        lane.appendChild(header);

        if (laneLogs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'text-[12px] text-[var(--ls-ink-mute)] text-center py-6 italic';
            empty.innerText = `No ${laneDef.label.toLowerCase()} entries yet.`;
            lane.appendChild(empty);
            rail.appendChild(lane);
            return;
        }

        // Group by date with a small inline-day-header between groups.
        let lastDate = '';
        laneLogs.forEach(log => {
            const dateOnly = log.date.split('T')[0];
            if (dateOnly !== lastDate) {
                const dh = document.createElement('div');
                const humanLabel = dateOnly === todayIso ? 'Today'
                                 : dateOnly === yestIso  ? 'Yesterday'
                                 : new Date(dateOnly + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                dh.className = 'text-[10px] font-black uppercase tracking-widest text-[var(--ls-ink-mute)] mt-2 mb-1';
                dh.innerText = humanLabel;
                lane.appendChild(dh);
                lastDate = dateOnly;
            }

            const card = document.createElement('div');
            card.className = 'kanban-entry';
            card.onclick = () => openDayModal(dateOnly, [log]);
            const time = new Date(log.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

            let label = '';
            switch (log.type) {
                case 'energy':   label = `Energy ${log.value}/10`; break;
                case 'emotion':  label = escapeHtml(classifyEmotion(log.value).label); break;
                case 'symptom':  label = `${escapeHtml(classifySymptom(log.value).label)} · ${log.severity}`; break;
                case 'activity': label = escapeHtml(classifyActivity(log.value).label); break;
                case 'note':     label = ''; break;
            }
            const truncated = label.length > 80 ? label.slice(0, 77) + '…' : label;
            card.innerHTML = `<div class="k-time">${time}</div><div class="k-label">${truncated || log.value.slice(0, 80) || ''}</div>`;
            lane.appendChild(card);
        });

        rail.appendChild(lane);
    });

    feed.appendChild(rail);
}

// --- 8b. APPEARANCE SETTINGS (V4) ---------------------------------------------
function applyTheme(themeName) {
    if (!THEMES.includes(themeName)) themeName = DEFAULT_THEME;
    // V4: target <html> (documentElement) instead of <body>. This lets a tiny
    // <script> in <head> pre-load the user's saved theme BEFORE the body
    // paints, eliminating the warm-cream flash on page reload when the saved
    // theme is soft-paper or dim-warm.
    document.documentElement.dataset.theme = themeName;
    updateSwatchSelected('[data-theme].swatch', 'theme', themeName);
}
function applyAccent(accentName) {
    if (!ACCENT_NAMES.includes(accentName)) accentName = DEFAULT_ACCENT;
    document.documentElement.dataset.accent = accentName;
    updateSwatchSelected('[data-accent].swatch', 'accent', accentName);
    // Mark the custom-hex input as the active swatch when accent === 'custom',
    // so the visible "selected" indicator isn't lost on a custom pick.
    const customInput = document.getElementById('custom-accent-input');
    if (customInput) customInput.dataset.selected = (accentName === 'custom') ? 'true' : 'false';
}
function updateSwatchSelected(selector, attr, currentValue) {
    document.querySelectorAll(selector).forEach(el => {
        el.dataset.selected = (el.dataset[attr] === currentValue) ? 'true' : 'false';
    });
}
function bindAppearanceSwatches() {
    document.querySelectorAll('[data-theme].swatch').forEach(btn => {
        btn.onclick = () => {
            const theme = btn.dataset.theme;
            state.userSettings.preferences.theme = theme;
            applyTheme(theme);
            saveStateToLocalStorage();
        };
    });
    document.querySelectorAll('[data-accent].swatch').forEach(btn => {
        btn.onclick = () => {
            const accent = btn.dataset.accent;
            state.userSettings.preferences.accent = accent;
            applyAccent(accent);
            saveStateToLocalStorage();
        };
    });
    const customInput = document.getElementById('custom-accent-input');
    if (customInput) {
        customInput.oninput = () => {
            // Live preview. CSS custom properties cascade, so setting them on
            // <html> (documentElement) keeps us consistent with applyAccent
            // and with the head-level preload script's storage path.
            const c = customInput.value;
            document.documentElement.style.setProperty('--ls-accent', c);
            document.documentElement.style.setProperty('--ls-accent-deep', c);
        };
        customInput.onchange = () => {
            // Persist: store hex under a 'custom' accent tag.
            const c = customInput.value;
            if (!ACCENT_NAMES.includes('custom')) ACCENT_NAMES.push('custom');
            state.userSettings.preferences.accent = 'custom';
            state.userSettings.preferences.customAccent = c;
            applyAccent('custom');
            saveStateToLocalStorage();
        };
    }
    // Restore a stored custom-hex accent after page load. Targets html to
    // keep consistent with applyAccent() and the head-level preload script.
    if (state.userSettings.preferences.accent === 'custom' && state.userSettings.preferences.customAccent) {
        document.documentElement.style.setProperty('--ls-accent', state.userSettings.preferences.customAccent);
        document.documentElement.style.setProperty('--ls-accent-deep', state.userSettings.preferences.customAccent);
    }
}

// --- 9b. INSIGHTS DATE-RANGE FILTER (V4) --------------------------------------
function bindInsightsRangeChips() {
    document.querySelectorAll('.range-chip').forEach(chip => {
        chip.onclick = () => setInsightsRange(chip.dataset.range);
    });
}
function setInsightsRange(range) {
    if (!['7d','30d','90d','all'].includes(range)) range = 'all';
    insightsRange = range;
    state.userSettings.preferences.insightsRange = range;
    saveStateToLocalStorage();
    updateRangeChipsUI();
    if (document.getElementById('view-insights') && !document.getElementById('view-insights').classList.contains('hidden')) {
        renderInsights();
    }
}
function updateRangeChipsUI() {
    document.querySelectorAll('.range-chip').forEach(chip => {
        const selected = chip.dataset.range === insightsRange;
        chip.className = selected
            ? 'range-chip flex-1 py-2 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider bg-[var(--ls-accent)] text-white border border-[var(--ls-accent-deep)] shadow-soft'
            : 'range-chip flex-1 py-2 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider bg-white border border-[var(--ls-bg-deep)] text-[var(--ls-ink-soft)]';
    });
}
// --- STREAM VIEW (V5) -------------------------------------------------------
// Time runs top → bottom (24h scrollable). 5 channel columns (Energy /
// Emotion / Symptom / Activity / Note) sit side-by-side horizontally. Events
// are rendered as dots at (hour, column) with opacity encoding value/severity.
// Toggling a chip in the sticky filter row hides/shows that channel column.
const STREAM_COLS = [
    { key: 'energy',   label: 'Energy',   color: '#D89B5C' },
    { key: 'emotion',  label: 'Emotion',  color: '#7E9A6B' },
    { key: 'symptom',  label: 'Symptom',  color: '#E89C5B' },
    { key: 'activity', label: 'Activity', color: '#7C9CB1' },
    { key: 'note',     label: 'Note',     color: '#A0876A' },
    { key: 'sleep',    label: 'Sleep',    color: '#7C9CB1' }
];
function streamOpacity(log) {
    if (log.type === 'energy') return 0.2 + ((log.value - 1) / 9) * 0.8;
    if (log.type === 'symptom') return log.severity === 'severe' ? 1.0 : log.severity === 'moderate' ? 0.7 : 0.4;
    // Emotion: positive reads as the prominent dot (good day), negative is muted.
    if (log.type === 'emotion') return classifyEmotion(log.value).valence === 'positive' ? 1.0 : 0.55;
    if (log.type === 'sleep') return 0.2 + (log.value / 12) * 0.8;
    // Custom categories: scale uses its min/max mapping, binary full opacity.
    const custom = getCustomCategoryByKey(log.type);
    if (custom) {
        if (custom.type === 'scale') {
            const min = custom.scaleMin || 0;
            const max = custom.scaleMax || 10;
            return 0.2 + ((log.value - min) / (max - min || 1)) * 0.8;
        }
        if (custom.type === 'binary') return 1.0;
    }
    return 0.5; // activity / note / note-type custom baseline
}

// Combined stream columns: built-in STREAM_COLS + user-created custom categories.
function getStreamChannels() {
    ensureCustomCategories();
    const customs = state.userSettings.customCategories.filter(c => !STREAM_COLS.some(s => s.key === c.id)).map(c => ({
        key: c.id, label: c.name, color: c.color
    }));
    return STREAM_COLS.concat(customs);
}
function ensureStreamState() {
    const p = state.userSettings.preferences = state.userSettings.preferences || {};
    if (!p.streamFilters) p.streamFilters = {};
    // Seed filters for each known channel (built-in presets + custom cats)
    // so newly-added custom categories appear in the Stream chips by default.
    getStreamChannels().forEach(c => {
        if (!(c.key in p.streamFilters)) p.streamFilters[c.key] = true;
    });
    if (!p.streamDate) {
        const t = new Date();
        p.streamDate = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    }
}
function stepStreamDate(delta) {
    ensureStreamState();
    const [y, m, d] = state.userSettings.preferences.streamDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + (delta || 0));
    if (delta === 0) { // jump to today
        const t = new Date();
        state.userSettings.preferences.streamDate = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    } else {
        state.userSettings.preferences.streamDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    }
    saveStateToLocalStorage();
    renderStreamTimeline();
}
function jumpToTodayStream() { stepStreamDate(0); }
function toggleStreamFilter(key) {
    ensureStreamState();
    state.userSettings.preferences.streamFilters[key] = !state.userSettings.preferences.streamFilters[key];
    saveStateToLocalStorage();
    renderStreamTimeline();
}
function todayKeyLocal() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
}
function renderStreamTimeline() {
    ensureStreamState();
    const feed = document.getElementById('continuous-timeline-feed');
    if (!feed) return;
    feed.innerHTML = '';
    feed.className = "relative z-10 stream-host";
    const dateKey = state.userSettings.preferences.streamDate;
    const dayLogs = state.dailyLogs.filter(l => l.date.startsWith(dateKey));
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const today = todayKeyLocal();
    const isToday = dateKey === today;
    const daysDiff = Math.round((new Date(today + 'T12:00') - new Date(dateKey + 'T12:00')) / 86400000);
    const sub = isToday ? 'TODAY' : daysDiff === 1 ? 'YESTERDAY' : daysDiff > 1 ? daysDiff + ' DAYS AGO' : daysDiff === -1 ? 'TOMORROW' : Math.abs(daysDiff) + 'D FUTURE';
    const dateLabel = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const visibleCols = getStreamChannels().filter(c => state.userSettings.preferences.streamFilters[c.key]);
    // Pre-group dayLogs by (type|hour) so the inner per-cell render is O(1)
    // lookup rather than O(N) filter. Keeps 1000+ entry datasets snappy.
    const cellMap = new Map();
    dayLogs.forEach(l => {
        const t = l.date.split('T')[1];
        if (!t) return;
        const hour = parseInt(t.split(':')[0], 10);
        const key = l.type + '|' + hour;
        if (!cellMap.has(key)) cellMap.set(key, []);
        cellMap.get(key).push(l);
    });
    feed.innerHTML = `
        <div class="stream-stepper">
            <button onclick="stepStreamDate(-1)" aria-label="Previous day" class="stream-arrow">‹</button>
            <div class="flex flex-col items-center min-w-0 px-2">
                <span class="stream-date-label">${dateLabel}</span>
                <span class="stream-date-sub">${sub}</span>
            </div>
            <div class="flex items-center gap-2">
                ${isToday ? '<span class="text-[11px] font-black text-[#A0876A] uppercase tracking-widest">TODAY</span>' : '<button onclick="jumpToTodayStream()" class="stream-today-btn">Today</button>'}
                <button onclick="stepStreamDate(1)" aria-label="Next day" class="stream-arrow">›</button>
            </div>
        </div>
        ${visibleCols.length === 0
            ? '<div class="stream-all-off">Tap a chip above to show entries</div>'
            : `<div class="stream-chips">
                ${getStreamChannels().map(c => {
                    const on = state.userSettings.preferences.streamFilters[c.key];
                    return `<button onclick="toggleStreamFilter('${c.key}')" class="stream-chip ${on ? 'on' : 'off'}" style="${on ? `--chip-color:${c.color};` : ''}"><span class="chip-dot" style="background:${c.color}"></span>${c.label}</button>`;
                }).join('')}
              </div>
              <div class="stream-col-header">
                  <div class="stream-time-head">Time</div>
                  ${visibleCols.map(c => `<div class="stream-col-head-cell" style="--chip-color:${c.color};"><span class="chip-dot" style="background:${c.color}"></span>${c.label}</div>`).join('')}
              </div>
              <div class="stream-grid" style="--col-count:${visibleCols.length}">
                  ${Array.from({ length: 24 }, (_, h) => {
                      const hourLabel = h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : (h - 12) + ' PM';
                      const isMajor = h % 3 === 0;
                      const cells = visibleCols.map(c => {
                          const cellLogs = cellMap.get(c.key + '|' + h) || [];
                          const dots = cellLogs.slice(0, 5).map((log, idx) => {
                              const o = streamOpacity(log);
                              const dx = idx * 4, dy = idx * 3;
                              return `<span class="stream-dot" style="left:calc(50% + ${dx}px);top:calc(50% + ${dy}px);background:${c.color};opacity:${o};"></span>`;
                          }).join('');
                          const more = cellLogs.length > 5 ? `<span class="stream-more">+${cellLogs.length - 5}</span>` : '';
                          const hasAny = cellLogs.length > 0;
                          return `<div class="stream-cell ${hasAny ? 'has-data' : ''}" data-cell="${c.key}-${h}" onclick="${hasAny ? `openDayModal('${dateKey}', state.dailyLogs.filter(l => l.date.startsWith('${dateKey}')))` : ''}">${dots}${more}</div>`;
                      }).join('');                       return `<div class="stream-row ${isMajor ? 'major' : ''} ${todBand(h)}">
                          <div class="stream-time">${hourLabel}</div>
                          ${cells}
                      </div>`;
                  }).join('')}
              </div>
              <div class="stream-summary">
                  ${getStreamChannels().map(c => {
                      const n = dayLogs.filter(l => l.type === c.key).length;
                      const on = state.userSettings.preferences.streamFilters[c.key];
                      return `<span class="stream-summary-cell ${on ? '' : 'off'}" style="--chip-color:${c.color};${on ? '' : 'opacity:0.35;'}"><span class="chip-dot" style="background:${c.color}"></span><strong>${n}</strong> ${c.label}</span>`;
                  }).join('')}
              </div>`}
    `;
}

// --- INSIGHTS TABS (V5) ------------------------------------------------------
// Three lenses: Trends (line + parallel + day-of-week) /
// Patterns (top influencers + correlation + coocc) / Calendar (heatmap + summary).
// V6.5 curation: drop the energy-trend line + multi-axis (overlap with Stream dots),
// drop Calendar-tab heat-map (overlap with the Month calendar view), elevate Day-of-Week
// + a new Routine-Impact card. Patterns tab gains a Time-to-Effect card.
// insightSummary still lives outside #insights-charts so it stays visible across all tabs.
const INSIGHTS_TAB_RENDERERS = {
    trends:    ['renderDayOfWeekChart', 'renderRoutineImpact'],
    patterns:  ['renderTopInfluencers', 'renderBehavioralCorrelationGrid', 'renderTimeToEffect', 'renderSymptomCooccurrenceChart']
};
function setInsightsTab(tab) {
    if (!INSIGHTS_TAB_RENDERERS[tab]) return;
    if (!state.userSettings.preferences) state.userSettings.preferences = {};
    state.userSettings.preferences.insightsTab = tab;
    saveStateToLocalStorage();
    renderInsights();
}

function applyDateRangeFilter(entries) {
    if (insightsRange === 'all') return entries;
    const days = parseInt(insightsRange, 10);
    if (!Number.isFinite(days)) return entries;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    return entries.filter(l => new Date(l.date) >= cutoff);
}

// =============================================================================
// V6.5 — INSIGHT CARDS (CURATION) + INLINE CATEGORY BUILDER
// Tail-end of file so we don't disturb earlier numbered sections. All new
// exports are referenced from the curation map (INSIGHTS_TAB_RENDERERS) and the
// inline-builder sheet markup in index.html.
// =============================================================================

// Big-number summary card. Replaces the prior 4-card grid with TWO huge
// headlines for instant readability at phone scale. Auto-detects the best
// day-of-week from energy logs (requires >=7 days of data to surface a name).
function renderInsightSummaryV2() {
    const box = document.getElementById('insights-summary');
    if (!box) return;
    const entries = applyDateRangeFilter(state.dailyLogs);
    if (entries.length === 0) {
        box.innerHTML = '<p class="col-span-2 text-center text-[#A0876A] py-6 text-sm font-medium">No entries in this range yet.</p>';
        return;
    }
    const energyEnts = entries.filter(l => l.type === 'energy');
    let avgEnergy = null;
    if (energyEnts.length > 0) {
        const perDay = {};
        energyEnts.forEach(l => { const d = l.date.split('T')[0]; perDay[d] = perDay[d] || []; perDay[d].push(l.value); });
        const dailyAvgs = Object.values(perDay).map(arr => arr.reduce((a, b) => a + b, 0) / arr.length);
        avgEnergy = dailyAvgs.reduce((a, b) => a + b, 0) / dailyAvgs.length;
    }
    let bestDay = null;
    const energyDaySet = new Set(energyEnts.map(l => l.date.split('T')[0]));
    if (energyDaySet.size >= 7) {
        const perDow = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };
        energyEnts.forEach(l => { perDow[new Date(l.date).getDay()].push(l.value); });
        let bestVal = -1, bestIdx = -1;
        Object.entries(perDow).forEach(([k, arr]) => {
            if (arr.length === 0) return;
            const m = arr.reduce((a, b) => a + b, 0) / arr.length;
            if (m > bestVal) { bestVal = m; bestIdx = parseInt(k, 10); }
        });
        if (bestIdx !== -1) bestDay = { name: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][bestIdx], val: bestVal };
    }
    const energyColor = avgEnergy === null ? '#A0876A' :
        avgEnergy >= 7 ? '#B47A3C' : avgEnergy >= 4 ? '#D89B5C' : '#A0332A';
    box.innerHTML = `
        <div class="ios-card p-5 flex flex-col gap-1">
            <span class="text-[10px] font-black uppercase tracking-widest text-[#A0876A]">Average Energy</span>
            <span class="stat-headline" style="color:${energyColor}">${avgEnergy === null ? '—' : avgEnergy.toFixed(1)}</span>
            <span class="text-[11px] font-bold text-[#A0876A]">on a 1-10 scale</span>
        </div>
        <div class="ios-card p-5 flex flex-col gap-1">
            <span class="text-[10px] font-black uppercase tracking-widest text-[#A0876A]">Your Best Day</span>
            <span class="stat-headline" style="color:#7E9A6B">${bestDay ? bestDay.name : '—'}</span>
            <span class="text-[11px] font-bold text-[#A0876A]">${bestDay ? 'avg ' + bestDay.val.toFixed(1) + '/10 energy' : 'need 7+ days of energy entries'}</span>
        </div>`;
}

// Routine Impact — for each activity, average energy + positive-emotion ratio
// on days WITH vs WITHOUT. EARN ITS KEEP: surfaces hidden behavioral patterns
// the user can't see by reading rows ("You feel +1.8 energy on days you log Workout").
function renderRoutineImpact() {
    const cont = document.getElementById('insights-charts');
    if (!cont) return;
    const entries = applyDateRangeFilter(state.dailyLogs);
    if (entries.length === 0) return;
    const activities = state.userSettings.customActivities || [];
    if (activities.length === 0) return;

    const perDay = {};
    entries.forEach(l => {
        const d = l.date.split('T')[0];
        perDay[d] = perDay[d] || { energy: [], pos: 0, neg: 0, acts: new Set() };
        if (l.type === 'energy') perDay[d].energy.push(l.value);
        if (l.type === 'emotion') {
            const v = classifyEmotion(l.value).valence;
            if (v === 'positive') perDay[d].pos++;
            if (v === 'negative') perDay[d].neg++;
        }
        if (l.type === 'activity') perDay[d].acts.add(l.value);
    });
    const dayArr = Object.values(perDay);

    const rows = activities.map(a => {
        const withDays = dayArr.filter(d => d.acts.has(a.id));
        const withoutDays = dayArr.filter(d => !d.acts.has(a.id));
        if (withDays.length < 2 || withoutDays.length < 2) return null;
        const avg = (days) => {
            const e = days.map(d => d.energy.length ? d.energy.reduce((x, y) => x + y, 0) / d.energy.length : 0).filter(v => v > 0);
            return e.length ? e.reduce((x, y) => x + y, 0) / e.length : null;
        };
        const avgEwith = avg(withDays);
        const avgEwithout = avg(withoutDays);
        const posRatioWith = withDays.reduce((s, d) => s + d.pos, 0) / withDays.length;
        const posRatioWithout = withoutDays.reduce((s, d) => s + d.pos, 0) / withoutDays.length;
        const eDelta = (avgEwith !== null && avgEwithout !== null) ? avgEwith - avgEwithout : null;
        const pDelta = posRatioWith - posRatioWithout;
        return { a, withDays: withDays.length, withoutDays: withoutDays.length, eDelta, pDelta };
    }).filter(r => r !== null && (r.eDelta !== null || Math.abs(r.pDelta) > 0.05));

    if (rows.length === 0) return;
    rows.sort((x, y) => (Math.abs(y.eDelta || 0) + Math.abs(y.pDelta)) - (Math.abs(x.eDelta || 0) + Math.abs(x.pDelta)));

    const html = rows.map(r => {
        const eColor = r.eDelta === null ? '#A0876A' : r.eDelta > 0.15 ? '#7E9A6B' : r.eDelta < -0.15 ? '#C44033' : '#A0876A';
        const eSign = r.eDelta === null ? '—' : (r.eDelta > 0 ? '+' : '') + r.eDelta.toFixed(1);
        const pColor = r.pDelta > 0.05 ? '#7E9A6B' : r.pDelta < -0.05 ? '#C44033' : '#A0876A';
        const pSign = (r.pDelta > 0 ? '+' : '') + r.pDelta.toFixed(1);
        return `<div class="ios-card p-4">
            <div class="flex justify-between items-baseline mb-2">
                <span class="text-[15px] font-black text-[#3D3548]">${escapeHtml(r.a.name)}</span>
                <span class="text-[10px] font-bold text-[#A0876A]">${r.withDays}d&nbsp;with&nbsp;•&nbsp;${r.withoutDays}d&nbsp;without</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <div class="text-[10px] uppercase tracking-widest text-[#A0876A] font-black">Energy</div>
                    <div class="text-[22px] font-black leading-none mt-1" style="color:${eColor}">${eSign}<span class="text-[10px] text-[#A0876A] font-bold">&nbsp;/10</span></div>
                </div>                        <div>
                    <div class="text-[10px] uppercase tracking-widest text-[#A0876A] font-black">Positivity</div>
                    <div class="text-[22px] font-black leading-none mt-1" style="color:${pColor}">${pSign}<span class="text-[10px] text-[#A0876A] font-bold">&nbsp;/day</span></div>
                </div>
            </div>
        </div>`;
    }).join('');

    const wrap = document.createElement('div');
    wrap.className = 'ios-card p-5';
    wrap.innerHTML = `<h3 class="text-[16px] font-black text-[#3D3548] mb-1">Routine Impact</h3>
        <p class="text-[11px] text-[#A0876A] font-medium mb-3">Days WITH this behavior vs days WITHOUT — a hidden pattern buried in your entries.</p>
        <div class="space-y-3">${html}</div>`;
    cont.appendChild(wrap);
}

// Time-to-Effect — for each (activity, symptom) pair: count how often the
// symptom occurs within 120 minutes of the activity. EARN ITS KEEP: temporal
// causal signal the user couldn't see by reading 30 rows ("70% of your severe
// headaches fell within 2 hours of Caffeine").
function renderTimeToEffect() {
    const cont = document.getElementById('insights-charts');
    if (!cont) return;
    const entries = applyDateRangeFilter(state.dailyLogs);
    if (entries.length === 0) return;
    const activities = state.userSettings.customActivities || [];
    const symptoms = state.userSettings.customSymptoms || [];
    if (activities.length === 0 || symptoms.length === 0) return;

    const WINDOW_MIN = 120;
    const rows = [];
    for (const act of activities) {
        const actLogs = entries.filter(l => l.type === 'activity' && l.value === act.id);            if (actLogs.length < 1) continue;
        for (const sym of symptoms) {
            const symLogs = entries.filter(l => l.type === 'symptom' && l.value === sym.id);
            if (symLogs.length === 0) continue;
            let clustered = 0;
            actLogs.forEach(a => {
                const aTs = new Date(a.date).getTime();
                symLogs.forEach(s => {
                    const diff = (new Date(s.date).getTime() - aTs) / 60000;
                    if (diff > 0 && diff <= WINDOW_MIN) clustered++;
                });
            });
            const ratio = clustered / Math.max(1, actLogs.length);
            if (clustered >= 2 && ratio >= 0.20) rows.push({ act, sym, clustered, total: actLogs.length, ratio });
        }
    }
    if (rows.length === 0) return;
    rows.sort((a, b) => b.ratio - a.ratio);

    const html = rows.slice(0, 5).map(r => {
        const pct = Math.round(r.ratio * 100);
        return `<div class="ios-card p-4">
            <span class="text-[10px] uppercase tracking-widest text-[#A0876A] font-black">${pct}% of the time</span>
            <div class="text-[15px] font-black text-[#3D3548] mt-1">${escapeHtml(r.act.name)}</div>
            <div class="text-[13px] text-[#6E5E5E] mt-1">leads to ${escapeHtml(r.sym.name)} within ${WINDOW_MIN} min</div>
            <div class="text-[11px] text-[#A0876A] mt-1 font-medium">${r.clustered} of ${r.total} ${escapeHtml(r.act.name)} sessions were followed by ${escapeHtml(r.sym.name)}.</div>
        </div>`;
    }).join('');

    const wrap = document.createElement('div');
    wrap.className = 'ios-card p-5';
    wrap.innerHTML = `<h3 class="text-[16px] font-black text-[#3D3548] mb-1">Time-to-Effect</h3>
        <p class="text-[11px] text-[#A0876A] font-medium mb-3">Symptoms that cluster in the ${WINDOW_MIN} minutes after an activity — a temporal correlation.</p>
        <div class="space-y-3">${html}</div>`;
    cont.appendChild(wrap);
}

// ===== Inline category builder (Log tab) ======
// A "+ New" sub-pill beneath #channel-picker expands an inline form so users
// can create a custom category without navigating to Settings.
const BUILDER_SWATCHES = [
    { hex: '#D89B5C', name: 'Terracotta' },
    { hex: '#7E9A6B', name: 'Sage' },
    { hex: '#7C9CB1', name: 'Dusty Blue' },
    { hex: '#A0876A', name: 'Mocha' },
    { hex: '#C44033', name: 'Brick' },
    { hex: '#B47A3C', name: 'Deep Amber' }
];
let currentBuilderColor = BUILDER_SWATCHES[0].hex;
function openInlineCategoryBuilder() {
    const sheet = document.getElementById('inline-builder');
    if (!sheet) return;
    sheet.classList.remove('hidden');
    renderBuilderSwatches();
    pickBuilderType(document.getElementById('inline-builder-type').value || 'scale');
    document.getElementById('inline-builder-name').focus();
    updateBuilderTypeFields();
}
function closeInlineCategoryBuilder() {
    const sheet = document.getElementById('inline-builder');
    if (!sheet) return;
    sheet.classList.add('hidden');
    document.getElementById('inline-builder-name').value = '';
    document.getElementById('inline-builder-min').value = '0';
    document.getElementById('inline-builder-max').value = '10';
    document.getElementById('inline-builder-type').value = 'binary';
    currentBuilderColor = BUILDER_SWATCHES[0].hex;
}
function renderBuilderSwatches() {
    const wrap = document.getElementById('inline-builder-swatches');
    if (!wrap) return;
    wrap.innerHTML = BUILDER_SWATCHES.map(s =>
        `<button type="button" data-color="${s.hex}" onclick="pickBuilderColor('${s.hex}')"
            class="builder-swatch ${s.hex === currentBuilderColor ? 'on' : ''}"
            style="background:${s.hex}" aria-label="${s.name}"></button>`
    ).join('');
}
function pickBuilderColor(hex) {
    currentBuilderColor = hex;
    renderBuilderSwatches();
}
function updateBuilderTypeFields() {
    const t = document.getElementById('inline-builder-type');
    const scaleRow = document.getElementById('inline-builder-scale');
    if (!t || !scaleRow) return;
    scaleRow.classList.toggle('hidden', t.value !== 'scale');
}
function pickBuilderType(type) {
    const inp = document.getElementById('inline-builder-type');
    if (inp) inp.value = type;
    document.querySelectorAll('.builder-type-btn').forEach(b => {
        b.classList.toggle('on', b.id === 'builder-type-' + type);
    });
    updateBuilderTypeFields();
}
function saveInlineCategory() {
    const nameEl = document.getElementById('inline-builder-name');
    const typeEl = document.getElementById('inline-builder-type');
    const name = (nameEl.value || '').trim();
    if (!name) { nameEl.focus(); return; }
    const allCustom = [
        ...(state.userSettings.customEmotions   || []),
        ...(state.userSettings.customSymptoms   || []),
        ...(state.userSettings.customActivities || []),
        ...(state.userSettings.customCategories || [])
    ];
    if (allCustom.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        nameEl.style.borderColor = '#C44033';
        setTimeout(() => { nameEl.style.borderColor = '#ECE3D0'; }, 1200);
        return;
    }
    const cat = { id: 'cu_' + Date.now(), name, color: currentBuilderColor, type: typeEl.value, valueType: typeEl.value };
    if (typeEl.value === 'scale') {
        cat.scaleMin = parseFloat(document.getElementById('inline-builder-min').value || 0);
        cat.scaleMax = parseFloat(document.getElementById('inline-builder-max').value || 10);
        if (!(cat.scaleMax > cat.scaleMin)) return;
    }
    state.userSettings.customCategories.push(cat);
    if (!ENTRY_TYPES.includes(cat.id)) {
        ENTRY_TYPES.push(cat.id);
        CHANNEL_LABEL[cat.id] = cat.name;
    }
    if (!state.userSettings.preferences.streamFilters) state.userSettings.preferences.streamFilters = {};
    if (state.userSettings.preferences.streamFilters[cat.id] === undefined) state.userSettings.preferences.streamFilters[cat.id] = true;
    saveStateToLocalStorage();
    closeInlineCategoryBuilder();
    currentChannel = cat.id;
    renderLogger();
    renderSettings();
    refreshCalendarUI();
}
