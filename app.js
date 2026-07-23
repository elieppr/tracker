// =============================================================================
// LifeSync Tracker - app.js
// V3: per-entry data model. Each Save produces ONE record of a single channel
// (energy / emotion / symptom / activity / note). Calendar flows continuously
// with a single sticky month label updated via IntersectionObserver. Timeline
// shows one row per entry with type-specific formatting.
// Sections:
//   1. Default datasets & state
//   2. Initialization (incl. V2 -> V3 data migration)
//   3. Navigation controller
//   4. Logger engine (channel picker + per-channel forms)
//   5. Continuous calendar engine (sticky month label via IntersectionObserver)
//   6. Timeline engine (per-entry rows)
//   7. Day modal engine (per-day entries as slim rows)
//   8. Settings engine (emotions / symptoms / activities)
//   9. Insights engine (Energy-Over-Time SVG chart, type-filtered summary)
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

// Sentinel IDs for deleted custom descriptors - preserve historical signal.
const FALLBACK_LABEL = {
    fallback_positive: "Deleted Positive Emotion",
    fallback_negative: "Deleted Negative Emotion",
    fallback_symptom:  "Custom Symptom (Deleted)",
    fallback_activity: "Custom Activity (Deleted)"
};

// Warm Honey/Cream severity palette. These pairs are: tailwind/bg-class for the
// solid-card button (SEVERITY_COLOR) and CSS variable foreground for the
// text-only chips in the timeline + modal (SEVERITY_TEXT_COLOR).
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

// ~25 discrete per-entry records spread across ~4 recent days.
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
        { id: id(), date: isoOf(today, 14, 35), type: 'note',     value: 'Post-lunch crash.' }
    ];
};

let state = {
    userSettings: {
        customEmotions:   [],
        customSymptoms:   [],
        customActivities: []
    },
    dailyLogs: []
};
let activeCalendarMode = 'month';

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

    saveStateToLocalStorage();
    renderLogger();
    renderSettings();
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

    const baseCls = "px-3 py-1.5 rounded-lg text-xs font-bold transition text-[#6E5E5E]";
    document.getElementById('btn-mode-month').className    = baseCls;
    document.getElementById('btn-mode-timeline').className = baseCls;

    const activeCls = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-white text-[#3D3548] shadow-sm";
    if (mode === 'month') {
        document.getElementById('calendar-month-container').classList.remove('hidden');
        document.getElementById('btn-mode-month').className = activeCls;
    } else {
        document.getElementById('calendar-timeline-container').classList.remove('hidden');
        document.getElementById('btn-mode-timeline').className = activeCls;
    }
    refreshCalendarUI();
}

function refreshCalendarUI() {
    if (activeCalendarMode === 'month') renderContinuousCalendar();
    else                                renderSeamlessTimeline();
}

// --- 4. LOGGER ENGINE ---------------------------------------------------------

const ENTRY_TYPES   = ['energy', 'emotion', 'symptom', 'activity', 'note'];
const CHANNEL_LABEL = { energy: 'Energy', emotion: 'Emotion', symptom: 'Symptom', activity: 'Activity', note: 'Note' };
let currentChannel  = 'energy';

function updateEnergyDisplay(val) {
    document.getElementById('energy-value').innerText = `${val}/10`;
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
    ENTRY_TYPES.forEach(type => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.dataset.channel = type;
        chip.innerText = CHANNEL_LABEL[type];
        chip.className = currentChannel === type
            ? "flex-1 py-2.5 rounded-2xl text-xs font-bold transition bg-[#D89B5C] text-white shadow-soft border border-[#B47A3C] active:scale-95"
            : "flex-1 py-2.5 rounded-2xl text-xs font-bold transition bg-white border border-[#ECE3D0] text-[#6E5E5E] active:scale-90";
        chip.onclick = () => { currentChannel = type; renderLogger(); };
        wrap.appendChild(chip);
    });
    document.querySelectorAll('[data-channel-panel]').forEach(p => {
        p.classList.toggle('hidden', p.dataset.channelPanel !== currentChannel);
    });
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
    if (state.userSettings.customActivities.length === 0) {
        cont.innerHTML = '<p class="text-xs text-slate-400 italic">Add an activity in Settings.</p>';
        return;
    }
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
    grid.className = "grid grid-cols-7 gap-x-1 gap-y-3 justify-items-center mt-1 px-1";

    const d = new Date(start);
    while (d <= end) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const dayLogs = state.dailyLogs.filter(l => l.date.startsWith(dateStr));
        const isToday = dateStr === todayKey;

        const cell = buildDayCell(dateStr, dayLogs, isToday);
        cell.dataset.month = d.getMonth();
        cell.dataset.year  = d.getFullYear();
        cell.dataset.day   = d.getDate();
        grid.appendChild(cell);

        d.setDate(d.getDate() + 1);
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

    // Geometry constants for the row grid below. Each row uses
    // grid-cols-[TIME_GUTTER_px, NODE_COL_px, 1fr]. The thread is drawn at
    // THREAD_X = TIME_GUTTER + NODE_COL/2 so it lines up with each node's centre.
    const TIME_GUTTER = 64;
    const NODE_COL    = 24;
    const THREAD_X    = TIME_GUTTER + NODE_COL / 2;   // 76

    const thread = document.createElement('div');
    thread.className = "absolute top-3 bottom-0 w-[2px] bg-[#ECE3D0] z-0";
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
        entry.className = "grid grid-cols-[64px_24px_1fr] gap-x-2 pt-4 pb-3 cursor-pointer active:scale-[0.99] transition-transform items-start";
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
    }
    return '#A0876A';
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
    }
    return '';
}

function energyNodeColor(energy) {
    // Peach -> terracotta -> brick-red. Peak (10/10) stays warm.
    if (energy <= 3) return "#F8D6A8"; // peach, low
    if (energy <= 6) return "#F4A261"; // warm amber
    if (energy <= 9) return "#D89B5C"; // accent terracotta
    return "#C44033";                  // peak (10/10) - warm brick red
}

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
    renderEnergyTrendChart();
    renderInsightSummary();
}

function renderEnergyTrendChart() {
    const container = document.getElementById('insights-chart-container');
    container.innerHTML = '';

    const energyEntries = state.dailyLogs.filter(l => l.type === 'energy');
    if (energyEntries.length === 0) {
        container.innerHTML = '<p class="text-center text-[#A0876A] py-8 text-sm">Log an energy entry to see your trend.</p>';
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
    container.innerHTML = `
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
    `;
}

function renderInsightSummary() {
    const box = document.getElementById('insights-summary');
    if (state.dailyLogs.length === 0) { box.innerHTML = ''; return; }

    const energyEnts = state.dailyLogs.filter(l => l.type === 'energy');
    const emotionEnts = state.dailyLogs.filter(l => l.type === 'emotion');

    const energyDayMap = new Map();
    energyEnts.forEach(l => {
        const day = l.date.split('T')[0];
        if (!energyDayMap.has(day)) energyDayMap.set(day, []);
        energyDayMap.get(day).push(l);
    });

    const dayAvgs = Array.from(energyDayMap.values()).map(group =>
        group.reduce((s, l) => s + l.value, 0) / group.length);
    const avg = dayAvgs.length > 0 ? dayAvgs.reduce((s, e) => s + e, 0) / dayAvgs.length : 0;

    const daysWithData = new Set(state.dailyLogs.map(l => l.date.split('T')[0])).size;
    const posCount = emotionEnts.filter(l => classifyEmotion(l.value).valence === 'positive').length;
    const negCount = emotionEnts.filter(l => classifyEmotion(l.value).valence === 'negative').length;

    box.innerHTML = `
        ${statCard('Avg Energy',    avg.toFixed(1), '/10', 'accent')}
        ${statCard('Positive tags', posCount,        '',   'pos')}
        ${statCard('Negative tags', negCount,        '',   'neg')}
        ${statCard('Days logged',   daysWithData,    '',   'ink')}
    `;
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
