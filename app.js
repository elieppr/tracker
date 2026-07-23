// =============================================================================
// LifeSync Tracker - app.js
// Sections:
//   1. Default datasets & state
//   2. Initialization
//   3. Navigation controller
//   4. Logger engine (emotions + symptoms + activities + notes)
//   5. Monthly calendar engine (with valence dots + symptom warning)
//   6. Timeline engine
//   7. Day modal engine
//   8. Settings engine (emotions / symptoms / activities)
//   9. Insights engine (Energy-Over-Time SVG chart)
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

// Sentinel IDs used inside dailyLogs when a custom descriptor is later deleted,
// so the historical valence/severity signal is preserved. Render layer shows
// the matching "FALLBACK_LABEL" string so users know it was a deleted item.
const FALLBACK_LABEL = {
    fallback_positive: "Deleted Positive Emotion",
    fallback_negative: "Deleted Negative Emotion",
    fallback_symptom:  "Custom Symptom (Deleted)",
    fallback_activity: "Custom Activity (Deleted)"
};

const SEVERITY_RANK = { mild: 1, moderate: 2, severe: 3 };
const SEVERITY_COLOR = {
    mild:     "bg-yellow-400 text-slate-900",
    moderate: "bg-orange-500 text-white",
    severe:   "bg-rose-600 text-white"
};
const SEVERITY_TEXT_COLOR = {
    mild:     "text-yellow-700",
    moderate: "text-orange-700",
    severe:   "text-rose-700"
};

const generateMockData = () => {
    const today = new Date();
    const formatISO = (d, h, m) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    const wkAgo = new Date(today); wkAgo.setDate(today.getDate() - 5);

    return [
        { id: "mock_0", date: formatISO(wkAgo, 10, 0),  energy: 6, emotions: ["e_calm"],     symptoms: [],                              activities: ["a_meditation"], notes: "Quiet Saturday." },
        { id: "mock_1", date: formatISO(yest,  8, 30),  energy: 3, emotions: ["e_anxious","e_stressed"], symptoms: [{id:"s_headache", severity:"moderate"}], activities: ["a_caffeine"], notes: "Slept poorly." },
        { id: "mock_2", date: formatISO(yest, 13, 0),  energy: 7, emotions: ["e_happy"],    symptoms: [],                              activities: ["a_workout"],    notes: "" },
        { id: "mock_3", date: formatISO(today, 9, 0),   energy: 8, emotions: ["e_motivated","e_happy"], symptoms: [],                      activities: ["a_caffeine","a_workout"], notes: "Strong morning." },
        { id: "mock_4", date: formatISO(today, 14, 30), energy: 4, emotions: ["e_stressed"], symptoms: [{id:"s_fatigue", severity:"severe"}],  activities: ["a_caffeine"], notes: "Post-lunch crash." }
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

    // Schema validator - guarantees the object shape and seeds defaults on first run.
    if (!state || typeof state !== 'object') {
        state = { userSettings: {}, dailyLogs: [] };
    }
    if (!state.userSettings) state.userSettings = {};

    // First-run detection: only seed defaults when state.meta.seeded is unset.
    // After first launch we leave the user's vocab alone - they can intentionally
    // empty any category without the defaults reappearing on the next reload.
    if (!state.meta) state.meta = {};
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

    // Backfill missing fields on logs created before symptoms/activities/notes existed.
    state.dailyLogs.forEach(log => {
        if (!Array.isArray(log.emotions))   log.emotions   = [];
        if (!Array.isArray(log.symptoms))   log.symptoms   = [];
        if (!Array.isArray(log.activities)) log.activities = [];
        if (typeof log.notes !== 'string')  log.notes      = "";
    });

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
        btn.classList.remove('text-blue-600');
        btn.classList.add('text-slate-400');
        btn.style.color = '';
    });
    const active = document.getElementById(`btn-${tabId}`);
    active.classList.remove('text-slate-400');
    active.classList.add('text-blue-600');
    active.style.color = '#007aff';

    const titles = {
        log: 'Log Your Day',
        calendar: 'History & Timeline',
        insights: 'Your Insights',
        settings: 'Settings'
    };
    document.getElementById('app-title').innerText = titles[tabId];

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

    const baseCls = "px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-500";
    document.getElementById('btn-mode-month').className    = baseCls;
    document.getElementById('btn-mode-timeline').className = baseCls;

    const activeCls = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-white text-slate-800 shadow-sm";
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
    if (activeCalendarMode === 'month') renderAppleStyleCalendar();
    else                                renderSeamlessTimeline();
}

// --- 4. LOGGER ENGINE ---------------------------------------------------------

function updateEnergyDisplay(val) {
    document.getElementById('energy-value').innerText = `${val}/10`;
}

// One render function refreshes all four logger sub-sections (emotions,
// symptoms, activities, notes) - keeps the source-of-truth single-pass.
function renderLogger() {
    renderEmotionsInLogger();
    renderSymptomsInLogger();
    renderActivitiesInLogger();
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
            "px-4 py-2.5 rounded-2xl text-sm font-bold transition duration-100 bg-white border border-slate-200 text-slate-600 active:scale-90";
        button.onclick = () => {
            const turningOn = !button.classList.contains('bg-emerald-500') && !button.classList.contains('bg-rose-500');
            button.classList.remove('bg-emerald-500','border-emerald-600','text-white','shadow-md',
                                    'bg-rose-500','border-rose-600','bg-slate-50','border-slate-200','text-slate-600');
            if (turningOn) {
                if (emo.valence === 'positive') {
                    button.classList.add('bg-emerald-500','border-emerald-600','text-white','shadow-md');
                } else {
                    button.classList.add('bg-rose-500','border-rose-600','text-white','shadow-md');
                }
            } else {
                button.classList.add('bg-white','border-slate-200','text-slate-600');
            }
        };
        if (emo.valence === 'positive') posList.appendChild(button);
        else                              negList.appendChild(button);
    });
}

function renderSymptomsInLogger() {
    const cont = document.getElementById('symptoms-list');
    cont.innerHTML = '';

    state.userSettings.customSymptoms.forEach(sym => {
        const row = document.createElement('div');
        row.dataset.symptomRow = 'true';
        row.dataset.symptomId = sym.id;
        row.className = "flex justify-between items-center py-2 border-b border-slate-50 last:border-0";
        row.innerHTML = `
            <span class="font-bold text-slate-700 text-sm">${escapeHtml(sym.name)}</span>
            <div class="flex gap-1.5">
                <button data-severity="mild"     class="sev-btn px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-100">Mild</button>
                <button data-severity="moderate" class="sev-btn px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-100">Mod</button>
                <button data-severity="severe"   class="sev-btn px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-100">Sev</button>
            </div>
        `;
        row.querySelectorAll('.sev-btn').forEach(btn => {
            btn.onclick = () => {
                const wasOn = btn.classList.contains('on');
                // Mutual-exclusive per row: clear all then re-apply if needed.
                btn.parentElement.querySelectorAll('.sev-btn').forEach(b => clearSeverityBtn(b));
                if (!wasOn) applySeverityBtn(btn);
            };
        });
        cont.appendChild(row);
    });
}

function applySeverityBtn(btn) {
    const sev = btn.dataset.severity;
    btn.classList.remove('bg-slate-50','text-slate-400','border-slate-100');
    btn.classList.add('on', SEVERITY_COLOR[sev]);
}

function clearSeverityBtn(btn) {
    btn.classList.remove('on',
        'bg-yellow-400','bg-orange-500','bg-rose-600',
        'text-slate-900','text-white');
    btn.classList.add('bg-slate-50','text-slate-400','border-slate-100');
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
            "px-4 py-2.5 rounded-2xl text-sm font-bold transition duration-100 bg-white border border-slate-200 text-slate-600 active:scale-90";
        button.onclick = () => {
            const on = !button.classList.contains('on');
            button.classList.toggle('on');
            button.classList.toggle('bg-blue-600',  on);
            button.classList.toggle('border-blue-700', on);
            button.classList.toggle('text-white',  on);
            button.classList.toggle('shadow-md',   on);
            button.classList.toggle('bg-white',    !on);
            button.classList.toggle('border-slate-200', !on);
            button.classList.toggle('text-slate-600', !on);
        };
        cont.appendChild(button);
    });
}

function saveCurrentLog() {
    const dateVal  = document.getElementById('log-date').value;
    const energyVal = parseInt(document.getElementById('log-energy').value, 10);

    const selectedEmotions = [];
    document.querySelectorAll('#positive-emotions-list button, #negative-emotions-list button').forEach(btn => {
        if (btn.classList.contains('bg-emerald-500') || btn.classList.contains('bg-rose-500')) {
            selectedEmotions.push(btn.dataset.id);
        }
    });

    const symptoms = [];
    document.querySelectorAll('[data-symptom-row]').forEach(row => {
        const onBtn = row.querySelector('.sev-btn.on');
        if (onBtn) symptoms.push({ id: row.dataset.symptomId, severity: onBtn.dataset.severity });
    });

    const activities = [];
    document.querySelectorAll('#activities-list button.on').forEach(btn => {
        activities.push(btn.dataset.id);
    });

    const notes = document.getElementById('log-notes').value.trim();

    state.dailyLogs.push({
        id: 'log_' + Date.now(),
        date: dateVal,
        energy: energyVal,
        emotions: selectedEmotions,
        symptoms,
        activities,
        notes
    });
    saveStateToLocalStorage();

    // Reset form back to defaults.
    document.getElementById('log-energy').value = 5; updateEnergyDisplay(5);
    resetLogDatePicker();
    document.getElementById('log-notes').value = '';
    renderLogger();

    const btn = document.getElementById('log-save-btn');
    const og = btn.innerText;
    btn.innerText = "✓ Saved";
    btn.style.backgroundColor = '#34c759';
    setTimeout(() => { btn.innerText = og; btn.style.backgroundColor = '#007aff'; }, 1500);
}

// --- 5. MONTHLY CALENDAR ENGINE ----------------------------------------------

function renderAppleStyleCalendar() {
    const container = document.getElementById('apple-calendar-stack');
    container.innerHTML = '';

    const today = new Date();
    for (let offset = -3; offset <= 1; offset++) {
        const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
        const monthDiv = document.createElement('div');
        monthDiv.className = "pb-10 pt-2";

        const title = document.createElement('h2');
        title.className = "sticky top-[36px] bg-white/95 backdrop-blur-sm z-10 text-xl font-black text-slate-900 py-3";
        title.innerText = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthDiv.appendChild(title);

        const grid = document.createElement('div');
        grid.className = "grid grid-cols-7 gap-y-4 gap-x-1 justify-items-center mt-4";

        const firstDayIndex = date.getDay();
        const totalDays = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

        for (let i = 0; i < firstDayIndex; i++) {
            const empty = document.createElement('div');
            empty.className = "w-12 h-12";
            grid.appendChild(empty);
        }

        for (let day = 1; day <= totalDays; day++) {
            const dateString =
                `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayLogs = state.dailyLogs.filter(log => log.date.startsWith(dateString));
            const isToday = dateString ===
                `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

            const wrap = document.createElement('div');
            wrap.className = "relative w-12 h-12";

            const circle = document.createElement('div');
            circle.className = "w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer active:scale-90 transition-transform";

            if (dayLogs.length > 0) {
                const avgEnergy = dayLogs.reduce((acc, curr) => acc + curr.energy, 0) / dayLogs.length;
                if (avgEnergy <= 3)       circle.className += " bg-blue-100 text-blue-900";
                else if (avgEnergy <= 6)  circle.className += " bg-blue-200 text-blue-900";
                else if (avgEnergy <= 8)  circle.className += " bg-blue-500 text-white shadow-md";
                else                      circle.className += " bg-blue-700 text-white shadow-md";

                // Valence + symptom summary → drives the dots/warning indicator.
                const summary = summarizeDay(dayLogs);
                if (summary.hasWarn) {
                    const warn = document.createElement('div');
                    warn.className = "absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-black shadow-sm z-20 border border-white";
                    warn.innerText = "!";
                    wrap.appendChild(warn);
                }
                if (summary.hasPos || summary.hasNeg) {
                    const dots = document.createElement('div');
                    dots.className = "absolute -bottom-0.5 right-0 flex gap-0.5 z-20";
                    if (summary.hasPos) dots.appendChild(makeDot('bg-emerald-500'));
                    if (summary.hasNeg) dots.appendChild(makeDot('bg-rose-500'));
                    wrap.appendChild(dots);
                }
            } else {
                circle.className += " bg-transparent text-slate-700";
                if (isToday) circle.className += " text-blue-600 font-black";
            }

            circle.innerHTML = `<span>${day}</span>`;
            circle.onclick = () => openDayModal(dateString, dayLogs);
            wrap.appendChild(circle);
            grid.appendChild(wrap);
        }
        monthDiv.appendChild(grid);
        container.appendChild(monthDiv);
    }

    setTimeout(() => { container.scrollTop = container.scrollHeight / 2; }, 50);
}

function makeDot(colorClass) {
    const dot = document.createElement('div');
    dot.className = `w-1.5 h-1.5 rounded-full shadow-sm border border-white ${colorClass}`;
    return dot;
}

function summarizeDay(dayLogs) {
    let hasPos = false, hasNeg = false, hasWarn = false;
    dayLogs.forEach(log => {
        (log.emotions || []).forEach(eid => {
            const cls = classifyEmotion(eid);
            if (cls.valence === 'positive') hasPos = true;
            if (cls.valence === 'negative') hasNeg = true;
        });
        (log.symptoms || []).forEach(s => {
            if (s.severity === 'moderate' || s.severity === 'severe') hasWarn = true;
        });
    });
    return { hasPos, hasNeg, hasWarn };
}

// --- 6. TIMELINE ENGINE -------------------------------------------------------

function renderSeamlessTimeline() {
    const feed = document.getElementById('continuous-timeline-feed');
    feed.innerHTML = '';

    const sortedLogs = [...state.dailyLogs].sort((a, b) => b.date.localeCompare(a.date));
    if (sortedLogs.length === 0) {
        feed.innerHTML = `<p class="text-center text-slate-400 text-sm mt-10">No entries logged yet.</p>`;
        return;
    }

    let lastRenderedDateString = "";

    sortedLogs.forEach((log) => {
        const logDateObj = new Date(log.date);
        const dateOnly = log.date.split('T')[0];
        const timeString = logDateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

        if (dateOnly !== lastRenderedDateString) {
            const dateBadge = document.createElement('div');
            dateBadge.className = "flex items-center gap-4 relative z-10 mt-6 mb-2 -ml-2";
            const displayDate = logDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            dateBadge.innerHTML = `
                <div class="w-2.5 h-2.5 rounded-full bg-slate-300 border-2 border-white ml-[3.5px]"></div>
                <span class="text-xs font-black uppercase tracking-wider text-slate-400">${displayDate}</span>
            `;
            feed.appendChild(dateBadge);
            lastRenderedDateString = dateOnly;
        }

        const summary = summarizeDay([log]);

        let colorStyle = "bg-blue-500 text-white border-white"; // default - energy only
        if ((log.emotions||[]).length > 0 || (log.symptoms||[]).length > 0) {
            if (summary.hasPos && summary.hasNeg)  colorStyle = "bg-amber-400 text-slate-900 border-white";
            else if (summary.hasPos)               colorStyle = "bg-emerald-500 text-white border-emerald-100";
            else if (summary.hasNeg)               colorStyle = "bg-rose-500 text-white border-rose-100";
            else if (summary.hasWarn)              colorStyle = "bg-rose-600 text-white border-rose-100";
        }

        const logNode = document.createElement('div');
        logNode.className = "flex items-start gap-5 relative z-10 group active:scale-[0.98] transition-transform cursor-pointer";
        logNode.onclick = () => openDayModal(dateOnly, [log]);

        const nodeCircle = document.createElement('div');
        nodeCircle.className = `w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-sm border-[4px] text-[10px] font-black tracking-tighter ${colorStyle} mt-1`;
        nodeCircle.innerHTML = `<span>${timeString.replace(' ', '')}</span>`;

        const contentBox = document.createElement('div');
        contentBox.className = "flex-grow pt-2 pb-6 border-b border-slate-100/50 group-last:border-0";

        const emotionsRow = (log.emotions || []).map(id => {
            const c = classifyEmotion(id);
            return pillHtml(c.label, c.color, c.deleted);
        }).join(' ');

        const symptomsRow = (log.symptoms || []).map(s => {
            const c = classifySymptom(s.id);
            const sevTone = SEVERITY_TEXT_COLOR[s.severity] || 'text-slate-500';
            return `<span class="${sevTone} bg-slate-50 text-xs px-2.5 py-1 rounded-full font-bold border border-slate-100">
                ${escapeHtml(c.label)} · ${s.severity}
            </span>`;
        }).join(' ');

        const activitiesRow = (log.activities || []).map(id => {
            const c = classifyActivity(id);
            return pillHtml(c.label, 'blue', c.deleted);
        }).join(' ');

        const notesBlock = log.notes
            ? `<p class="text-sm text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100 whitespace-pre-wrap">${escapeHtml(log.notes)}</p>`
            : '';

        contentBox.innerHTML = `
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <span class="text-sm font-black text-blue-600">Energy ${log.energy}/10</span>
                    ${summary.hasWarn ? '<span class="text-[10px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">⚠ Symptom</span>' : ''}
                </div>
                <div class="flex flex-wrap gap-1.5">${emotionsRow || '<span class="text-xs font-semibold text-slate-400 italic">No emotions</span>'}</div>
                ${symptomsRow ? `<div class="flex flex-wrap gap-1.5">${symptomsRow}</div>` : ''}
                ${activitiesRow ? `<div class="flex flex-wrap gap-1.5">${activitiesRow}</div>` : ''}
                ${notesBlock}
            </div>
        `;

        logNode.appendChild(nodeCircle);
        logNode.appendChild(contentBox);
        feed.appendChild(logNode);
    });
}

function pillHtml(label, colorName, deleted) {
    const base = {
        emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
        rose:    "text-rose-700 bg-rose-50 border-rose-100",
        blue:    "text-blue-700 bg-blue-50 border-blue-100",
        slate:   "text-slate-500 bg-slate-50 border-slate-100"
    }[colorName] || "text-slate-500 bg-slate-50 border-slate-100";

    // Note: the FALLBACK_LABEL strings already say "Deleted …" / "(Deleted)", so no extra suffix
    // is added here - keeps the timeline pill from reading "Deleted X Emotion ·deleted".
    return `<span class="${base} text-xs px-2.5 py-1 rounded-full font-bold border">${escapeHtml(label)}</span>`;
}

// --- 7. DAY MODAL ENGINE ------------------------------------------------------

function openDayModal(dateString, logs) {
    const modal = document.getElementById('day-modal');
    const sheet = document.getElementById('day-modal-sheet');
    const title = document.getElementById('modal-date-title');
    const content = document.getElementById('modal-content-area');

    const [y, m, d] = dateString.split('-');
    const dateObj = new Date(y, parseInt(m) - 1, d);
    title.innerText = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    content.innerHTML = '';

    if (logs.length === 0) {
        content.innerHTML = `
            <div class="text-center py-10 space-y-4">
                <p class="text-slate-400 font-medium">Nothing logged this day.</p>
                <button onclick="shortcutRetroactiveLog('${dateString}')" class="bg-blue-600 active:bg-blue-700 text-white font-bold py-3 px-8 rounded-2xl transition shadow-md" style="background-color:#007aff">
                    Add Entry
                </button>
            </div>
        `;
    } else {
        logs.forEach((log) => {
            const logCard = document.createElement('div');
            logCard.className = "bg-slate-50 border border-slate-100 rounded-3xl p-5 space-y-4 shadow-sm";

            const timePart = log.date.split('T')[1];
            let [hours, minutes] = timePart.split(':'); hours = parseInt(hours);
            const formattedTime = `${hours%12||12}:${minutes} ${hours>=12?'PM':'AM'}`;

            const sumLog = summarizeDay([log]);

            const emotionChips = (log.emotions || []).map(id => {
                const c = classifyEmotion(id);
                const tone = c.valence === 'positive' ? 'bg-emerald-100 text-emerald-800' :
                             c.valence === 'negative' ? 'bg-rose-100 text-rose-800' :
                             'bg-slate-100 text-slate-700';
                return `<span class="${tone} text-xs px-3 py-1.5 rounded-full font-bold">${escapeHtml(c.label)}</span>`;
            }).join(' ');

            const symptomChips = (log.symptoms || []).map(s => {
                const c = classifySymptom(s.id);
                const tone = SEVERITY_TEXT_COLOR[s.severity] || 'text-slate-500';
                return `<span class="${tone} bg-white text-xs px-3 py-1.5 rounded-full font-bold border border-slate-200">${escapeHtml(c.label)} · ${s.severity}</span>`;
            }).join(' ');

            const activityChips = (log.activities || []).map(id => {
                const c = classifyActivity(id);
                return `<span class="bg-blue-100 text-blue-800 text-xs px-3 py-1.5 rounded-full font-bold">${escapeHtml(c.label)}</span>`;
            }).join(' ');

            const notesBlock = log.notes
                ? `<p class="text-sm text-slate-700 bg-white p-3 rounded-2xl border border-slate-200 whitespace-pre-wrap">${escapeHtml(log.notes)}</p>`
                : '';

            logCard.innerHTML = `
                <div class="flex justify-between items-center border-b border-slate-200/60 pb-3">
                    <span class="text-xs font-black text-slate-400 uppercase tracking-widest">${formattedTime}</span>
                    <button onclick="deleteLog('${log.id}', '${dateString}')" class="text-rose-500 active:scale-90 text-[10px] font-black uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-full">Delete</button>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-sm font-bold text-slate-500">Energy Score</span>
                    <span class="text-2xl font-black text-blue-600">${log.energy}</span>
                </div>
                ${emotionChips  ? `<div class="flex flex-wrap gap-1.5">${emotionChips}</div>` : ''}
                ${symptomChips  ? `<div class="flex flex-wrap gap-1.5">${symptomChips}</div>` : ''}
                ${activityChips ? `<div class="flex flex-wrap gap-1.5">${activityChips}</div>` : ''}
                ${notesBlock}
                ${sumLog.hasWarn ? `<div class="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-2 rounded-2xl border border-rose-100">⚠ Moderate/Severe symptom reported</div>` : ''}
            `;
            content.appendChild(logCard);
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
    const remaining = state.dailyLogs.filter(log => log.date.startsWith(dateString));
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
        const labelColor = emo.valence === 'positive' ? 'text-emerald-500 bg-emerald-50' : 'text-rose-500 bg-rose-50';
        row.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold text-slate-800 text-lg">${escapeHtml(emo.name)}</span>
                <span class="text-[10px] ${labelColor} uppercase font-black px-2.5 py-1 rounded-full tracking-widest">${emo.valence}</span>
            </div>
            <button onclick="deleteEmotion('${emo.id}')" class="text-rose-400 hover:text-rose-600 text-xs font-black uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full">Del</button>
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
                <span class="font-bold text-slate-800 text-lg">${escapeHtml(sym.name)}</span>
                <span class="text-[10px] text-amber-600 bg-amber-50 uppercase font-black px-2.5 py-1 rounded-full tracking-widest">symptom</span>
            </div>
            <button onclick="deleteSymptom('${sym.id}')" class="text-rose-400 hover:text-rose-600 text-xs font-black uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full">Del</button>
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
                <span class="font-bold text-slate-800 text-lg">${escapeHtml(act.name)}</span>
                <span class="text-[10px] text-blue-500 bg-blue-50 uppercase font-black px-2.5 py-1 rounded-full tracking-widest">behavior</span>
            </div>
            <button onclick="deleteActivity('${act.id}')" class="text-rose-400 hover:text-rose-600 text-xs font-black uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full">Del</button>
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
    if (!confirm("Delete this emotion? Historical logs using this tag will display a generic 'Deleted' placeholder.")) return;
    const target = state.userSettings.customEmotions.find(e => e.id === emotionId);
    const fallback = target.valence === 'positive' ? 'fallback_positive' : 'fallback_negative';
    state.dailyLogs.forEach(log => {
        log.emotions = log.emotions.map(eid => eid === emotionId ? fallback : eid);
    });
    state.userSettings.customEmotions = state.userSettings.customEmotions.filter(e => e.id !== emotionId);
    saveStateToLocalStorage();
    renderLogger();
    renderSettings();
}

function deleteSymptom(symptomId) {
    if (!confirm("Delete this symptom? Historical logs using this tag will display 'Custom Symptom (Deleted)'.")) return;
    state.dailyLogs.forEach(log => {
        log.symptoms = log.symptoms.map(s => s.id === symptomId ? { id: 'fallback_symptom', severity: s.severity } : s);
    });
    state.userSettings.customSymptoms = state.userSettings.customSymptoms.filter(s => s.id !== symptomId);
    saveStateToLocalStorage();
    renderLogger();
    renderSettings();
}

function deleteActivity(activityId) {
    if (!confirm("Delete this activity? Historical logs using this tag will display 'Custom Activity (Deleted)'.")) return;
    state.dailyLogs.forEach(log => {
        log.activities = log.activities.map(aid => aid === activityId ? 'fallback_activity' : aid);
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
    saveStateToLocalStorage();
    renderLogger();
    renderSettings();
}

// --- 9. INSIGHTS ENGINE -------------------------------------------------------

function renderInsights() {
    renderEnergyTrendChart();
    renderInsightSummary();
}

function renderEnergyTrendChart() {
    const container = document.getElementById('insights-chart-container');
    container.innerHTML = '';

    if (state.dailyLogs.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm">Log entries to see your energy trend.</p>';
        return;
    }

    // Group multiple entries per day into one average point.
    const dayMap = new Map();
    state.dailyLogs.forEach(log => {
        const day = log.date.split('T')[0];
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day).push(log);
    });
    const points = Array.from(dayMap, ([day, logs]) => ({
        day,
        ts: new Date(day + 'T12:00').getTime(),
        energy: logs.reduce((s, l) => s + l.energy, 0) / logs.length
    })).sort((a, b) => a.ts - b.ts);

    const W = 600, H = 240, padL = 32, padR = 16, padT = 12, padB = 32;
    const tsMin = points[0].ts;
    const tsMax = points[points.length - 1].ts;
    const span  = Math.max(tsMax - tsMin, 24 * 60 * 60 * 1000); // min 1 day span

    const singlePoint = points.length === 1;
    const xFor = ts => singlePoint
        ? padL + (W - padL - padR) / 2
        : padL + ((ts - tsMin) / span) * (W - padL - padR);
    const yFor = energy => padT + ((10 - energy) / 9) * (H - padT - padB);
    const pathD = points.map((p, i) =>
        `${i === 0 ? 'M' : 'L'}${xFor(p.ts).toFixed(1)},${yFor(p.energy).toFixed(1)}`
    ).join(' ');
    const fillD = `${pathD} L${xFor(tsMax).toFixed(1)},${yFor(1).toFixed(1)} L${xFor(tsMin).toFixed(1)},${yFor(1).toFixed(1)} Z`;
    // Suppress the from/to date labels when only one day has data; the same date would otherwise
    // print twice, stacked at each axis edge.
    const axisLabels = singlePoint
        ? ''
        : `<text x="${padL}" y="${H - 8}" font-size="10" fill="#94a3b8" font-weight="700">${xFmt(tsMin)}</text>
           <text x="${W - padR}" y="${H - 8}" text-anchor="end" font-size="10" fill="#94a3b8" font-weight="700">${xFmt(tsMax)}</text>`;

    const xFmt = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    container.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="w-full h-auto">
            <defs>
                <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stop-color="#007aff" stop-opacity="0.30"/>
                    <stop offset="100%" stop-color="#007aff" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${[1, 5, 10].map(energy => {
                const y = yFor(energy);
                return `
                    <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>
                    <text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#94a3b8" font-weight="700">${energy}</text>
                `;
            }).join('')}
            <path d="${fillD}" fill="url(#energyFill)"/>
            <path d="${pathD}" fill="none" stroke="#007aff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            ${points.map(p => `<circle cx="${xFor(p.ts).toFixed(1)}" cy="${yFor(p.energy).toFixed(1)}" r="3.5" fill="#007aff" stroke="#fff" stroke-width="2"/>`).join('')}
            ${axisLabels}
        </svg>
    `;
}

function renderInsightSummary() {
    const box = document.getElementById('insights-summary');
    if (state.dailyLogs.length === 0) { box.innerHTML = ''; return; }

    // Group logs per day so metrics aren't skewed by multi-entry days.
    const dayMap = new Map();
    state.dailyLogs.forEach(log => {
        const day = log.date.split('T')[0];
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day).push(log);
    });
    const dayAvgs = Array.from(dayMap.values()).map(logs =>
        logs.reduce((s, l) => s + l.energy, 0) / logs.length);
    const avg = dayAvgs.reduce((s, e) => s + e, 0) / dayAvgs.length;
    const daysWithData = dayMap.size;
    const posCount = distinctValenceTagCount(dayMap, 'positive');
    const negCount = distinctValenceTagCount(dayMap, 'negative');

    box.innerHTML = `
        ${statCard('Avg Energy', avg.toFixed(1), '/10', 'blue')}
        ${statCard('Positive tags', posCount, '', 'emerald')}
        ${statCard('Negative tags', negCount, '', 'rose')}
        ${statCard('Days logged', daysWithData, '', 'slate')}
    `;
}

// Count distinct (day, emotion-id) pairs matching a given valence so multi-entry
// days don't inflate positive/negative tag totals in the Insights summary.
function distinctValenceTagCount(dayMap, valence) {
    let total = 0;
    dayMap.forEach(logs => {
        const seen = new Set();
        logs.forEach(log => {
            (log.emotions || []).forEach(eid => {
                if (seen.has(eid)) return;
                seen.add(eid);
                if (classifyEmotion(eid).valence === valence) total++;
            });
        });
    });
    return total;
}

function statCard(label, value, suffix, tone) {
    const tones = {
        blue:    "text-blue-600",
        emerald: "text-emerald-600",
        rose:    "text-rose-600",
        slate:   "text-slate-700"
    };
    return `
        <div class="bg-white ios-card border border-slate-100 shadow-sm p-4">
            <div class="text-[10px] font-black uppercase tracking-widest text-slate-400">${label}</div>
            <div class="mt-1 text-2xl font-black ${tones[tone] || 'text-slate-700'}">${value}${suffix ? `<span class="text-sm font-bold text-slate-400 ml-1">${suffix}</span>` : ''}</div>
        </div>
    `;
}

// --- HELPERS ------------------------------------------------------------------

// Single-source-of-truth lookups; respond with display metadata for the renderer.
function classifyEmotion(id) {
    if (id === 'fallback_positive') return { deleted: true, valence: 'positive', label: FALLBACK_LABEL.fallback_positive, color: 'emerald' };
    if (id === 'fallback_negative') return { deleted: true, valence: 'negative', label: FALLBACK_LABEL.fallback_negative, color: 'rose' };
    const emo = state.userSettings.customEmotions.find(e => e.id === id);
    if (emo)                      return { deleted: false, valence: emo.valence, label: emo.name, color: emo.valence === 'positive' ? 'emerald' : 'rose' };
    return                              { deleted: false, valence: null,        label: 'Unknown',  color: 'slate' };
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
