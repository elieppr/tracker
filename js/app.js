// App state, connecting to the sheet, and the Overview and Timeline tabs.
// Loaded last: the other scripts only define functions used from here.

let apiUrl = storageGet('tracker_apiUrl');
let secret = storageGet('tracker_secret');
let entries = [];     // { id, date, tracker, category, notes, created, values: [{ field, value, unit }] }
let trackers = [];    // { name, category, fields: [{ name, unit }] }
let categories = [];  // { name, color }
let marks = [];       // stretches of time marked on the timeline: { id, label, start, end, color, lanes, notes }
let editingTracker = null;   // name of the tracker open in the dialog, null when creating
let editingCategory = null;
let renderedValueInputsFor; // undefined until the first render, so it always runs once

const FALLBACK_COLOR = '#9ca3af';
const CATEGORY_PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

document.getElementById('entry-date').value = localDateString(new Date());

// ---- Connection ----

function switchTab(tab, button) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    button.classList.add('active');
    hideTip();
    if (tab === 'insights') renderInsights();
    if (tab === 'timeline') renderTimeline();
}

async function loadData() {
    const data = await api('list');
    if (!Array.isArray(data.categories) || !data.trackers.every(t => Array.isArray(t.fields))) {
        throw new Error('Your Google Sheet is running an older version of the script. Paste in the latest apps-script/Code.gs, then use Deploy → Manage deployments → ✏️ → Version: New version.');
    }
    entries = data.entries;
    trackers = data.trackers;
    categories = data.categories;
    marks = data.marks || [];
    sortEntries();
    renderAll();
}

function showDashboard() {
    document.body.classList.add('connected');
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('dashboard').classList.add('active');
}

function handleSetup(event) {
    event.preventDefault();
    const url = document.getElementById('setup-url').value.trim();
    const password = document.getElementById('setup-secret').value.trim();

    if (!url || !password) {
        showError('Please enter both the Web App URL and password');
        return;
    }

    runAction(submitButton(event), 'Connecting…', async () => {
        apiUrl = url;
        secret = password;
        try {
            await loadData();
        } catch (err) {
            apiUrl = '';
            secret = '';
            throw new Error('Could not connect: ' + err.message);
        }
        storageSet('tracker_apiUrl', apiUrl);
        storageSet('tracker_secret', secret);
        showDashboard();
    });
}

function handleRefresh(button) {
    runAction(button, 'Refreshing…', async () => {
        await loadData();
        showSuccess('✓ Up to date');
    });
}

function clearConnection() {
    storageRemove('tracker_apiUrl');
    storageRemove('tracker_secret');
    apiUrl = '';
    secret = '';
    entries = [];
    trackers = [];
    categories = [];
    marks = [];
    document.body.classList.remove('connected');
    document.getElementById('setup-screen').style.display = 'block';
    document.getElementById('dashboard').classList.remove('active');
}

function logout() {
    if (isDemo) {
        location.search = '';
        return;
    }
    if (confirm('Disconnect from your Google Sheet? Your data stays in the sheet.')) {
        clearConnection();
        document.getElementById('error-container').innerHTML = '';
    }
}

// ---- Rendering ----

function sortEntries() {
    entries.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
}

function renderAll() {
    renderStats();
    renderEntryTrackerOptions();
    renderEntryValueInputs();
    renderTallyPanel();
    renderFeelingsFields();
    renderTimeline();
    renderInsights();
    renderTrackerList();
    renderCategoryList();
}

// Consecutive days with at least one entry, counting back from today (or yesterday,
// so the streak doesn't look broken before you've logged anything today).
function currentStreak() {
    const days = new Set(entries.map(e => e.date));
    let day = localDateString(new Date());
    if (!days.has(day)) day = addDays(day, -1);
    let streak = 0;
    while (days.has(day)) {
        streak++;
        day = addDays(day, -1);
    }
    return streak;
}

function relativeDay(dateStr) {
    const diff = daysBetween(dateStr, localDateString(new Date()));
    if (diff === 0) return 'today';
    if (diff === 1) return 'yesterday';
    if (diff > 1 && diff < 7) return `${diff} days ago`;
    return parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatValues(values) {
    return values.map(v => formatValue(v.value, v.unit)).join(' · ');
}

function renderStats() {
    const today = localDateString(new Date());
    const weekStart = addDays(today, -6);
    const thisWeek = entries.filter(e => e.date >= weekStart && e.date <= today);
    const todayCount = entries.filter(e => e.date === today).length;
    const streak = currentStreak();

    const hour = new Date().getHours();
    document.getElementById('greeting').textContent = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('hero-summary').textContent = !entries.length
        ? 'Log your first entry to get started.'
        : todayCount
            ? `${plural(todayCount, 'entry', 'entries')} so far today. Keep it going!`
            : streak
                ? `Nothing logged yet today. Log something to keep your ${streak}-day streak.`
                : 'Nothing logged yet today.';

    const tiles = [
        { label: 'Today', value: todayCount, sub: todayCount === 1 ? 'entry' : 'entries', icon: 'sun', tone: 'amber' },
        { label: 'Last 7 days', value: thisWeek.length, sub: thisWeek.length === 1 ? 'entry' : 'entries', icon: 'calendar', tone: 'indigo' },
        { label: 'Streak', value: streak, sub: streak === 1 ? 'day' : 'days', icon: 'flame', tone: 'rose' }
    ];
    document.getElementById('stats-grid').innerHTML = tiles.map(t => `
        <div class="stat-card tone-${t.tone}">
            <span class="stat-icon">${icon(t.icon)}</span>
            <div>
                <div class="stat-label">${t.label}</div>
                <div class="stat-value">${t.value}<span class="stat-sub">${t.sub}</span></div>
            </div>
        </div>
    `).join('');

    const container = document.getElementById('tracker-tiles');
    if (!trackers.length) {
        container.innerHTML = '<div class="empty-state">No trackers yet. Add one in Manage.</div>';
        return;
    }
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    container.innerHTML = trackersByCategory().flatMap(g => g.trackers).map(t => {
        const last = entries.find(e => e.tracker === t.name); // entries are sorted newest first
        const weekCount = thisWeek.filter(e => e.tracker === t.name).length;
        // Mini chart of the last 7 days: the first value's daily total relative to the week's max,
        // or for day trackers, which days an episode covered.
        const daily = t.timing === 'days'
            ? days.map(d => (episodesOf(t.name).some(e => episodeDates(e).includes(d)) ? 1 : 0))
            : days.map(d => entries
                .filter(e => e.tracker === t.name && e.date === d)
                .reduce((sum, e) => sum + (e.values[0] ? e.values[0].value : 0), 0));
        const max = Math.max(...daily);
        const bars = daily.map((v, i) => `<span class="spark-bar${v ? '' : ' empty'}${i === 6 ? ' today' : ''}" style="height: ${v && max ? Math.max(18, (v / max) * 100) : 10}%"></span>`).join('');

        // Tally trackers show today's running total (and a +1 button) instead of the last entry;
        // day trackers show the day of an ongoing episode (with End) or when the next is due (with Start).
        let value = last ? formatValues(last.values) : '—';
        let when = last ? `Last logged ${relativeDay(last.date)}` : 'Not logged yet';
        let plusButton = '';
        let weekLabel = `${weekCount}×`;
        if (t.timing === 'days') {
            const stats = episodeStats(t.name);
            const tileButton = (label, action, title) =>
                `<button type="button" class="tile-plus" title="${title}" onclick="event.stopPropagation(); ${action}">${label}</button>`;
            weekLabel = `${daily.filter(Boolean).length}d`;
            const cycleDayToday = t.cycle ? cycleCalendar(t.name).dayOf(today) : null;
            if (t.cycle && cycleDayToday) {
                // Cycles always have a day: "Cycle day 17", with the period or the next start below.
                value = `Cycle day ${cycleDayToday}`;
                when = stats.ongoing
                    ? `${t.name} day ${episodeLength(stats.ongoing)}`
                    : stats.next
                        ? `Next ${t.name.toLowerCase()} ~${shortDate(stats.next)}`
                        : `${t.name} ended ${relativeDay(episodeLastDay(stats.latest))}`;
                plusButton = stats.ongoing
                    ? tileButton('End', `confirmEndEpisode('${escapeHtml(stats.ongoing.id)}', this)`, 'Ended today')
                    : tileButton('Start', `startEpisode(this.closest('.tracker-tile').dataset.name, this)`, 'Started today');
            } else if (stats.ongoing) {
                value = `Day ${episodeLength(stats.ongoing)}`;
                when = `Since ${shortDate(episodeFirstDay(stats.ongoing))}`;
                plusButton = tileButton('End', `confirmEndEpisode('${escapeHtml(stats.ongoing.id)}', this)`, 'Ended today');
            } else {
                const latestRange = stats.latest
                    ? episodeFirstDay(stats.latest) === episodeLastDay(stats.latest)
                        ? shortDate(episodeFirstDay(stats.latest))
                        : `${shortDate(episodeFirstDay(stats.latest))} – ${shortDate(episodeLastDay(stats.latest))}`
                    : '—';
                value = stats.next ? `Next ~${shortDate(stats.next)}` : latestRange;
                when = stats.latest ? `Last ended ${relativeDay(episodeLastDay(stats.latest))}` : 'Not logged yet';
                plusButton = tileButton('Start', `startEpisode(this.closest('.tracker-tile').dataset.name, this)`, 'Started today');
            }
        }
        if (t.feelings && last) {
            value = last.values
                .filter(v => v.field !== COPING_FIELD)
                .sort((a, b) => b.value - a.value)
                .slice(0, 2)
                .map(v => v.field)
                .join(' · ') || '—';
            when = `Checked in ${relativeDay(last.date)}`;
        }
        if (t.tally) {
            const todayLogs = entries.filter(e => e.tracker === t.name && e.date === today).length;
            value = formatTotals(t, dayTotals(t, today));
            when = todayLogs ? `Today · ${plural(todayLogs, 'log')}` : 'Nothing yet today';
            if (t.fields.length === 1) {
                plusButton = `<button type="button" class="tile-plus" title="Add 1 ${escapeHtml(t.fields[0].unit)}"
                    onclick="event.stopPropagation(); quickTally(1, this, this.closest('.tracker-tile').dataset.name)">+1</button>`;
            }
        }
        return `
            <div class="tracker-tile${t.tally ? ' tally' : ''}" role="button" tabindex="0" style="--cat: ${categoryColor(t.category)}" data-name="${escapeHtml(t.name)}"
                onclick="selectTrackerForEntry(this.dataset.name)"
                onkeydown="if (event.target === this && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectTrackerForEntry(this.dataset.name); }">
                <span class="tile-top">
                    <span class="tile-avatar">${escapeHtml(t.name.trim().charAt(0).toUpperCase())}</span>
                    <span class="tile-name">${escapeHtml(t.name)}</span>
                    <span class="tile-week" title="${t.timing === 'days' ? 'Days in the last 7' : 'Entries in the last 7 days'}">${weekLabel}</span>
                </span>
                <span class="tile-bottom">
                    <span>
                        <span class="tile-value">${escapeHtml(value)}</span>
                        <span class="tile-when">${escapeHtml(when)}</span>
                    </span>
                    <span class="tile-side">
                        ${plusButton}
                        <span class="sparkline" title="Last 7 days">${bars}</span>
                    </span>
                </span>
            </div>
        `;
    }).join('');
}

function selectTrackerForEntry(name) {
    document.getElementById('entry-name').value = name;
    renderEntryValueInputs();
    const firstInput = document.querySelector('#entry-values input');
    document.getElementById('quick-add').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (firstInput) firstInput.focus({ preventScroll: true });
}

function trackersByCategory() {
    const groups = categories.map(c => ({ category: c.name, trackers: trackers.filter(t => t.category === c.name) }));
    const orphans = trackers.filter(t => !categories.some(c => c.name === t.category));
    if (orphans.length) groups.push({ category: 'Other', trackers: orphans });
    return groups.filter(g => g.trackers.length);
}

function renderEntryTrackerOptions() {
    const select = document.getElementById('entry-name');
    const selected = select.value;
    let html = '<option value="">Select a tracker...</option>';
    trackersByCategory().forEach(group => {
        html += `<optgroup label="${escapeHtml(group.category)}">`;
        group.trackers.forEach(t => {
            html += `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`;
        });
        html += '</optgroup>';
    });
    select.innerHTML = html;
    if (trackers.some(t => t.name === selected)) select.value = selected;
}

// One number input per value the selected tracker records. Only re-rendered when
// the tracker (or its fields) change, so typed values survive other updates.
function renderEntryValueInputs() {
    const tracker = trackers.find(t => t.name === document.getElementById('entry-name').value);
    const key = tracker ? JSON.stringify(tracker) : null;
    if (key === renderedValueInputsFor) return;
    renderedValueInputsFor = key;

    const container = document.getElementById('entry-values');
    container.innerHTML = tracker ? tracker.fields.map((f, i) => `
        <div class="form-group">
            <label data-label="${escapeHtml(capitalize(fieldLabel(f) || 'Value'))}">${escapeHtml(capitalize(fieldLabel(f) || 'Value'))}</label>
            <input type="number" step="any" data-field-index="${i}" placeholder="0" oninput="this.dataset.auto = ''">
        </div>
    `).join('') : '';
    tallyMode = 'add';
    feelingSelections = new Map();
    copingRating = null;
    setUpTimingFields(tracker);
    renderTallyPanel();
    renderFeelingsFields();
}

// ---- Feelings check-ins ----

let feelingSelections = new Map(); // feeling -> intensity (1-5)
let copingRating = null;

function scalePicker(value, onPick, label) {
    return [1, 2, 3, 4, 5].map(n => `
        <button type="button" class="scale-btn${value === n ? ' active' : ''}" aria-pressed="${value === n}"
            aria-label="${escapeHtml(label)} ${n} of 5" onclick="${onPick}(${n})">${n}</button>
    `).join('');
}

// Shows the feeling chips (and hides the plain number inputs) for check-in trackers.
function renderFeelingsFields() {
    const tracker = selectedTracker();
    const feelings = Boolean(tracker && tracker.feelings);
    document.getElementById('feelings-fields').hidden = !feelings;
    document.getElementById('entry-values').hidden = feelings;
    if (!feelings) return;

    document.getElementById('feeling-chips').innerHTML = feelingNames(tracker).map(name => `
        <button type="button" class="feeling-chip${isUnpleasant(name) ? ' unpleasant' : ''}${feelingSelections.has(name) ? ' selected' : ''}"
            aria-pressed="${feelingSelections.has(name)}" data-name="${escapeHtml(name)}" onclick="toggleFeeling(this.dataset.name)">${escapeHtml(name)}</button>
    `).join('') + '<button type="button" class="feeling-chip add" onclick="addFeeling()">+ Other</button>';

    document.getElementById('feeling-intensities').innerHTML = [...feelingSelections].map(([name, value]) => `
        <div class="feeling-row">
            <span class="feeling-name${isUnpleasant(name) ? ' unpleasant' : ''}">${escapeHtml(name)}</span>
            <div class="scale-picker small" data-name="${escapeHtml(name)}">
                ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="scale-btn${value === n ? ' active' : ''}" aria-pressed="${value === n}"
                    aria-label="${escapeHtml(name)} intensity ${n} of 5" onclick="setFeelingIntensity(this.parentElement.dataset.name, ${n})">${n}</button>`).join('')}
            </div>
        </div>
    `).join('');
    document.getElementById('coping-group').hidden = !tracker.fields.some(f => f.name === COPING_FIELD);
    document.getElementById('coping-picker').innerHTML = scalePicker(copingRating, 'setCoping', 'Manageable');
}

function toggleFeeling(name) {
    if (feelingSelections.has(name)) feelingSelections.delete(name);
    else feelingSelections.set(name, 3);
    renderFeelingsFields();
}

function setFeelingIntensity(name, value) {
    feelingSelections.set(name, value);
    renderFeelingsFields();
}

function setCoping(value) {
    copingRating = copingRating === value ? null : value;
    renderFeelingsFields();
}

// Adds a feeling to the check-in's list (saved on the tracker) and selects it.
function addFeeling() {
    const tracker = selectedTracker();
    const name = (prompt('Add a feeling to your list:') || '').trim();
    if (!name) return;
    const existing = tracker.fields.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        feelingSelections.set(existing.name, feelingSelections.get(existing.name) || 3);
        renderFeelingsFields();
        return;
    }
    const coping = tracker.fields.filter(f => f.name === COPING_FIELD);
    const fields = tracker.fields.filter(f => f.name !== COPING_FIELD).concat([{ name, unit: '1-5' }], coping);
    runAction(null, '', async () => {
        const saved = await api('saveTracker', { originalName: tracker.name, tracker: { ...tracker, fields } });
        trackers = trackers.map(t => (t.name === tracker.name ? saved : t));
        feelingSelections.set(name, 3);
        renderedValueInputsFor = JSON.stringify(saved); // keep the current selections
        renderAll();
        renderFeelingsFields();
        showSuccess(`✓ Added "${name}" to your feelings`);
    });
}

// ---- Daily tallies ----

let tallyMode = 'add'; // "add" to the day, or "set" the day's total

function selectedTracker() {
    return trackers.find(t => t.name === document.getElementById('entry-name').value);
}

// Per-field totals for one tracker on one day. Single-value trackers count every value, so
// entries logged before a field was renamed still add up.
function dayTotals(tracker, date) {
    const totals = tracker.fields.map(() => 0);
    entries.filter(e => e.tracker === tracker.name && e.date === date).forEach(e => e.values.forEach(v => {
        const i = tracker.fields.length === 1 ? 0 : tracker.fields.findIndex(f => f.name === v.field);
        if (i !== -1) totals[i] += v.value;
    }));
    return totals.map(t => Math.round(t * 1000) / 1000);
}

function formatTotals(tracker, totals) {
    return tracker.fields
        .map((f, i) => (tracker.fields.length > 1 && f.name ? `${f.name} ` : '') + formatValue(totals[i], f.unit))
        .join(' · ');
}

function setTallyMode(mode) {
    tallyMode = mode;
    renderTallyPanel();
}

// For tally trackers: shows the chosen day's running total and quick-add buttons, and
// switches the form between adding to the day and setting its total (which only needs a day).
function renderTallyPanel() {
    const tracker = selectedTracker();
    const tally = Boolean(tracker && tracker.tally);
    const setting = tally && tallyMode === 'set';
    const timing = tracker ? tracker.timing : 'moment';
    const span = timing === 'span';

    document.getElementById('tally-panel').hidden = !tally;
    document.getElementById('moment-fields').hidden = timing === 'days' || (span && !setting);
    document.getElementById('span-fields').hidden = !span || setting;
    document.getElementById('days-fields').hidden = timing !== 'days';
    document.getElementById('entry-time-group').hidden = setting;
    document.getElementById('entry-submit').textContent = setting ? "Set day's total"
        : timing === 'days' ? 'Save'
            : tracker && tracker.feelings ? 'Save check-in' : 'Add entry';
    renderEpisodePanel(tracker);
    document.querySelectorAll('#entry-values label').forEach(label => {
        label.textContent = setting ? `Day's total: ${label.dataset.label}` : label.dataset.label;
    });
    if (!tally) return;

    document.querySelectorAll('.tally-mode .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === tallyMode));
    const today = localDateString(new Date());
    const spanEnd = span && !setting ? computeSpan().end : null;
    const date = spanEnd ? localDateString(spanEnd) : document.getElementById('entry-date').value || today;
    const totals = dayTotals(tracker, date);
    document.getElementById('tally-day-label').textContent = date === today
        ? 'Today so far'
        : `${parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} total`;
    document.getElementById('tally-total').textContent = formatTotals(tracker, totals);
    document.querySelectorAll('#entry-values input').forEach(input => {
        input.placeholder = setting ? String(totals[input.dataset.fieldIndex]) : '0';
    });
    document.getElementById('tally-quick').innerHTML = tracker.fields.length === 1
        ? [1, 2].map(n => `<button type="button" class="btn btn-small btn-secondary" onclick="quickTally(${n}, this)">+${n}</button>`).join('')
        : '';
}

// For day trackers: whether one is going on now (with buttons to end it), or buttons to
// start one, plus its usual pattern.
function renderEpisodePanel(tracker) {
    const panel = document.getElementById('episode-status');
    if (!tracker || tracker.timing !== 'days') {
        panel.innerHTML = '';
        return;
    }
    const today = localDateString(new Date());
    const ongoing = ongoingEpisode(tracker.name);
    const summary = episodeSummary(tracker.name);
    const name = escapeHtml(tracker.name);
    const cycleDay = tracker.cycle ? cycleCalendar(tracker.name).dayOf(today) : null;
    // Shortcuts to log related trackers (e.g. symptoms in the same category).
    const related = trackers.filter(t => t.category === tracker.category && t.name !== tracker.name && t.timing !== 'days');
    const relatedHtml = related.length ? `
        <div class="episode-related">
            <span>Log ${tracker.cycle ? 'a symptom' : 'something related'}:</span>
            ${related.map(t => `<button type="button" class="chip-btn" style="--cat: ${categoryColor(t.category)}" data-name="${escapeHtml(t.name)}" onclick="selectTrackerForEntry(this.dataset.name)">${escapeHtml(t.name)}</button>`).join('')}
        </div>` : '';
    const cycleHtml = cycleDay ? `<div class="cycle-day-badge">Cycle day ${cycleDay}</div>` : '';
    panel.innerHTML = cycleHtml + (ongoing ? `
        <div class="episode-now">
            <div>
                <div class="tally-label">${tracker.cycle ? name : 'Going on now'}</div>
                <div class="tally-total">${tracker.cycle ? `${name} day` : 'Day'} ${episodeLength(ongoing)}</div>
                <div class="episode-since">since ${escapeHtml(shortDate(episodeFirstDay(ongoing)))}</div>
            </div>
            <div class="episode-actions">
                <button type="button" class="btn btn-small" data-id="${escapeHtml(ongoing.id)}" onclick="endEpisode(this.dataset.id, '${today}', this)">Ended today</button>
                ${episodeFirstDay(ongoing) < today ? `<button type="button" class="btn btn-small btn-secondary" data-id="${escapeHtml(ongoing.id)}" onclick="endEpisode(this.dataset.id, '${addDays(today, -1)}', this)">Ended yesterday</button>` : ''}
            </div>
        </div>
        ${summary ? `<p class="episode-summary">${escapeHtml(summary)}</p>` : ''}
        ${relatedHtml}
        <p class="hint">Or log a different, past ${name} below.</p>
    ` : `
        <div class="episode-now">
            <div>
                <div class="tally-label">${name}</div>
                <div class="episode-idle">${tracker.cycle ? `No ${name.toLowerCase()} right now` : 'Not going on right now'}</div>
            </div>
            <div class="episode-actions">
                <button type="button" class="btn btn-small" data-name="${name}" onclick="startEpisode(this.dataset.name, this)">Started today</button>
            </div>
        </div>
        ${summary ? `<p class="episode-summary">${escapeHtml(summary)}</p>` : ''}
        ${relatedHtml}
    `);
}

// Logs an amount straight away. From the form it goes on the form's day; from an Overview
// card (which passes the tracker's name) it goes on today.
function quickTally(amount, button, name) {
    const tracker = name ? trackers.find(t => t.name === name) : selectedTracker();
    if (!tracker) return;
    const field = tracker.fields[0];
    const today = localDateString(new Date());
    const date = name ? today : document.getElementById('entry-date').value || today;
    logEntry(button, '', {
        date,
        start: date === today ? toLocalDateTime(new Date()) : `${date}T12:00`,
        end: '',
        tracker: tracker.name,
        notes: '',
        values: [{ field: field.name, unit: field.unit, value: amount }]
    }, `✓ ${tracker.name} +${formatValue(amount, field.unit)}`);
}

// ---- Entry times ----

// Moments get a date and time (now); time spans get start/end/duration inputs, prefilled
// from this tracker's usual times.
function setUpTimingFields(tracker) {
    const span = tracker && tracker.timing === 'span';
    document.getElementById('moment-fields').hidden = span;
    document.getElementById('span-fields').hidden = !span;
    if (tracker && tracker.timing === 'days') {
        // A new episode starting today, or a past one if you fill in both days.
        document.getElementById('episode-start').value = localDateString(new Date());
        document.getElementById('episode-end').value = '';
        return;
    }
    if (!span) {
        document.getElementById('entry-time').value = formatTimeInput(roundedNow());
        return;
    }
    const { start, end } = suggestedSpan(tracker);
    document.getElementById('span-end').value = toLocalDateTime(end);
    document.getElementById('span-start').value = toLocalDateTime(start);
    setDurationInputs((end - start) / 60000);
    updateSpanFields();
}

// Repeats the last span's usual times: today's if it's already over (e.g. last night's sleep),
// start-until-now if it's in progress (e.g. work so far), otherwise yesterday's.
// Without a previous span, the last hour.
function suggestedSpan(tracker) {
    const now = roundedNow();
    const last = entries.find(e => e.tracker === tracker.name && e.start && e.end);
    if (!last) return { start: new Date(now - HOUR_MS), end: now };

    const minutes = (parseLocalDateTime(last.end) - parseLocalDateTime(last.start)) / 60000;
    const end = parseLocalDateTime(`${localDateString(now)}T${last.end.split('T')[1]}`);
    const start = new Date(end - minutes * 60000);
    if (end <= now) return { start, end };
    if (start < now) return { start, end: now };
    return { start: new Date(start - 24 * HOUR_MS), end: new Date(end - 24 * HOUR_MS) };
}

function formatTimeInput(d) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function setDurationInputs(minutes) {
    document.getElementById('span-hours').value = Math.floor(minutes / 60);
    document.getElementById('span-minutes').value = Math.round(minutes % 60);
}

function updateSpanFields() {
    const mode = document.getElementById('span-mode').value;
    document.getElementById('span-start-group').hidden = mode === 'end-duration';
    document.getElementById('span-end-group').hidden = mode === 'start-duration';
    document.getElementById('span-duration-group').hidden = mode === 'start-end';
    updateSpanSummary();
}

// Works out start and end from whichever two inputs the chosen mode uses.
function computeSpan() {
    const mode = document.getElementById('span-mode').value;
    const startValue = document.getElementById('span-start').value;
    const endValue = document.getElementById('span-end').value;
    const minutes = (Number(document.getElementById('span-hours').value) || 0) * 60 +
        (Number(document.getElementById('span-minutes').value) || 0);

    let start, end;
    if (mode === 'start-end') {
        if (!startValue || !endValue) return { error: 'Enter a start and an end time' };
        start = parseLocalDateTime(startValue);
        end = parseLocalDateTime(endValue);
    } else if (mode === 'start-duration') {
        if (!startValue || !minutes) return { error: 'Enter a start time and a duration' };
        start = parseLocalDateTime(startValue);
        end = new Date(start.getTime() + minutes * 60000);
    } else {
        if (!endValue || !minutes) return { error: 'Enter an end time and a duration' };
        end = parseLocalDateTime(endValue);
        start = new Date(end.getTime() - minutes * 60000);
    }
    if (end <= start) return { error: 'The end has to be after the start' };
    return { start, end, minutes: (end - start) / 60000 };
}

// Keeps the hidden inputs in sync (so switching modes keeps the same span), shows a summary,
// and fills in a duration value such as "Sleep (hours)" if you haven't typed one.
function updateSpanSummary() {
    const summary = document.getElementById('span-summary');
    const span = computeSpan();
    if (span.error) {
        summary.textContent = span.error;
        summary.classList.add('invalid');
        return;
    }
    summary.classList.remove('invalid');
    const mode = document.getElementById('span-mode').value;
    if (mode === 'start-end') setDurationInputs(span.minutes);
    if (mode === 'start-duration') document.getElementById('span-end').value = toLocalDateTime(span.end);
    if (mode === 'end-duration') document.getElementById('span-start').value = toLocalDateTime(span.start);

    // Name the day unless it's today, e.g. "8h: Wed 10:35 PM → Thu 6:35 AM".
    const today = localDateString(new Date());
    const startDay = localDateString(span.start);
    const endDay = localDateString(span.end);
    const day = d => d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ';
    const showDays = startDay !== today || endDay !== today;
    summary.textContent = `${formatDuration(span.minutes)}: ${showDays ? day(span.start) : ''}${formatTime(span.start)} → ` +
        `${showDays && endDay !== startDay ? day(span.end) : ''}${formatTime(span.end)}`;
    autoFillDuration(span.minutes);
    if (!document.getElementById('tally-panel').hidden) renderTallyPanel();
}

function autoFillDuration(minutes) {
    const tracker = trackers.find(t => t.name === document.getElementById('entry-name').value);
    if (!tracker) return;
    document.querySelectorAll('#entry-values input').forEach(input => {
        const field = tracker.fields[input.dataset.fieldIndex];
        const isHours = /^(h|hr|hrs|hour|hours)$/i.test(field.unit);
        const isMinutes = /^(m|min|mins|minute|minutes)$/i.test(field.unit);
        const isDuration = tracker.fields.length === 1 || /dur|time|length|sleep/i.test(field.name);
        if (!(isHours || isMinutes) || !isDuration) return;
        if (input.value !== '' && !input.dataset.auto) return; // typed by hand
        input.value = isHours ? Math.round((minutes / 60) * 100) / 100 : Math.round(minutes);
        input.dataset.auto = '1';
    });
}

function renderTrackerList() {
    const container = document.getElementById('tracker-list');
    if (!trackers.length) {
        container.innerHTML = '<div class="empty-state">No trackers yet.</div>';
        return;
    }
    container.innerHTML = trackersByCategory().flatMap(g => g.trackers).map(t => `
        <div class="list-item" style="--cat: ${categoryColor(t.category)}">
            <span class="tile-avatar">${escapeHtml(t.name.trim().charAt(0).toUpperCase())}</span>
            <div class="item-info">
                <div class="item-name">${escapeHtml(t.name)}</div>
                <div class="item-meta">
                    ${categoryBadge(t.category)}
                    <span>${t.feelings ? plural(feelingNames(t).length, 'feeling') : t.fields.map(f => escapeHtml(fieldLabel(f))).join(' · ')}</span>
                    ${t.timing === 'span' ? '<span class="timing-tag">Time span</span>' : ''}
                    ${t.tally ? '<span class="timing-tag">Daily total</span>' : ''}
                    ${t.feelings ? '<span class="timing-tag">Check-in</span>' : ''}
                    ${t.timing === 'days' ? `<span class="timing-tag">${t.cycle ? 'Cycle' : 'Days'}</span>` : ''}
                </div>
            </div>
            <div class="item-actions">
                <button type="button" class="btn btn-small btn-secondary" data-name="${escapeHtml(t.name)}" onclick="openTrackerDialog(this.dataset.name)">Edit</button>
                <button type="button" class="btn btn-small btn-danger-outline" data-name="${escapeHtml(t.name)}" onclick="deleteTracker(this.dataset.name, this)">Delete</button>
            </div>
        </div>
    `).join('');
}

function renderCategoryList() {
    document.getElementById('category-list').innerHTML = categories.map(c => {
        const count = trackers.filter(t => t.category === c.name).length;
        return `
            <div class="list-item">
                <div class="item-info">
                    <div class="item-name" style="display: flex; align-items: center; gap: 8px;">
                        <span class="swatch" style="background: ${c.color}"></span>${escapeHtml(c.name)}
                    </div>
                    <div class="item-meta">${plural(count, 'tracker')}</div>
                </div>
                <div class="item-actions">
                    <button type="button" class="btn btn-small btn-secondary" data-name="${escapeHtml(c.name)}" onclick="openCategoryDialog(this.dataset.name)">Edit</button>
                    <button type="button" class="btn btn-small btn-danger-outline" data-name="${escapeHtml(c.name)}" onclick="deleteCategory(this.dataset.name, this)">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// ---- Entries ----

function handleAddEntry(event) {
    event.preventDefault();

    const tracker = trackers.find(t => t.name === document.getElementById('entry-name').value);
    if (!tracker) {
        showError('Please select a tracker');
        return;
    }

    const values = tracker.feelings ? feelingValues(tracker) : [...document.querySelectorAll('#entry-values input')]
        .filter(input => input.value.trim() !== '')
        .map(input => {
            const index = Number(input.dataset.fieldIndex);
            const field = tracker.fields[index];
            return { index, field: field.name, unit: field.unit, value: Number(input.value) };
        });
    if (tracker.feelings && !values.some(v => v.field !== COPING_FIELD)) {
        showError('Pick at least one feeling');
        return;
    }
    if (!values.length && tracker.timing !== 'days') {
        showError('Please enter a value');
        return;
    }
    const notes = document.getElementById('entry-notes').value.trim();

    if (tracker.timing === 'days') return saveEpisode(event, tracker, values, notes);

    if (tracker.tally && tallyMode === 'set') return setDayTotal(event, tracker, values, notes);

    // Time spans count toward the day they end, so a night's sleep belongs to the morning.
    let date = document.getElementById('entry-date').value;
    let start = '';
    let end = '';
    if (tracker.timing === 'span') {
        const span = computeSpan();
        if (span.error) return showError(span.error);
        start = toLocalDateTime(span.start);
        end = toLocalDateTime(span.end);
        date = localDateString(span.end);
    } else {
        if (!date) return showError('Please pick a date');
        const time = document.getElementById('entry-time').value;
        if (time) start = `${date}T${time}`;
    }

    logEntry(submitButton(event), 'Adding…', { date, start, end, tracker: tracker.name, notes, values: values.map(stripIndex) },
        `✓ Added ${tracker.name} entry`, true);
}

// A day episode from the form: first day, and last day unless it's still going.
function saveEpisode(event, tracker, values, notes) {
    const first = document.getElementById('episode-start').value;
    const last = document.getElementById('episode-end').value;
    if (!first) return showError('Please pick the first day');
    if (last && last < first) return showError("The last day can't be before the first");
    if (first > localDateString(new Date())) return showError("The first day can't be in the future");
    const ongoing = ongoingEpisode(tracker.name);
    if (!last && ongoing) {
        return showError(`${tracker.name} is already going (since ${shortDate(episodeFirstDay(ongoing))}). End it first, or enter a last day.`);
    }
    logEntry(submitButton(event), 'Saving…', {
        date: first,
        start: `${first}T00:00`,
        end: last ? `${addDays(last, 1)}T00:00` : '',
        tracker: tracker.name,
        notes,
        values: values.map(stripIndex)
    }, last ? `✓ Logged ${tracker.name}, ${plural(daysBetween(first, last) + 1, 'day')}` : `✓ ${tracker.name} started`, true);
}

// A check-in's values: each selected feeling with its intensity, plus the coping rating.
function feelingValues(tracker) {
    const values = [...feelingSelections].map(([name, value]) => ({ index: -1, field: name, unit: '1-5', value }));
    if (copingRating) values.push({ index: -1, field: COPING_FIELD, unit: '1-5', value: copingRating });
    return values;
}

function stripIndex({ index, ...value }) {
    return value;
}

// "Set day's total": logs the difference between the total you enter and what's already
// logged that day, so earlier entries (and their times) are kept.
function setDayTotal(event, tracker, values, notes) {
    const date = document.getElementById('entry-date').value;
    if (!date) return showError('Please pick a date');
    const totals = dayTotals(tracker, date);
    const target = tracker.fields.map((f, i) => {
        const v = values.find(x => x.index === i);
        return v ? v.value : totals[i];
    });
    const changes = values
        .map(v => ({ ...v, value: Math.round((v.value - totals[v.index]) * 1000) / 1000 }))
        .filter(v => v.value !== 0);
    if (!changes.length) {
        showSuccess(`${tracker.name} is already at ${formatTotals(tracker, target)}`);
        return;
    }
    if (changes.some(v => v.value < 0) && !confirm(
        `That's less than what's already logged (${formatTotals(tracker, totals)}). Log a correction to bring the day's total down to ${formatTotals(tracker, target)}?`
    )) return;

    const today = localDateString(new Date());
    logEntry(submitButton(event), 'Saving…', {
        date,
        start: date === today ? toLocalDateTime(new Date()) : `${date}T21:00`,
        end: '',
        tracker: tracker.name,
        notes: `Set day's total to ${formatTotals(tracker, target)}${notes ? `. ${notes}` : ''}`,
        values: changes.map(stripIndex)
    }, `✓ ${tracker.name} set to ${formatTotals(tracker, target)}`, true);
}

// Saves an entry and updates everything. With resetForm, clears the form afterwards; tally
// trackers stay selected so you can keep adding to them.
function logEntry(button, busyText, entry, message, resetForm) {
    return runAction(button, busyText, async () => {
        const saved = await api('addEntry', { entry });
        entries.push(saved);
        sortEntries();
        if (resetForm) {
            document.getElementById('entry-notes').value = '';
            const tracker = trackers.find(t => t.name === entry.tracker);
            feelingSelections = new Map();
            copingRating = null;
            if (tracker && tracker.tally) {
                document.querySelectorAll('#entry-values input').forEach(input => {
                    input.value = '';
                    input.dataset.auto = '';
                });
            } else {
                document.getElementById('entry-name').value = '';
            }
        }
        renderAll();
        showSuccess(message);
    });
}

function deleteEntry(id, button, busyText = '', onDeleted) {
    const entry = entries.find(e => e.id === id);
    if (!entry || !confirm(`Delete this ${entry.tracker} entry?`)) return;

    runAction(button, busyText, async () => {
        await api('deleteEntry', { id });
        entries = entries.filter(e => e.id !== id);
        if (onDeleted) onDeleted();
        renderAll();
        showSuccess('✓ Entry deleted');
    });
}

// ---- Startup ----

const isDemo = new URLSearchParams(location.search).has('demo');

// Loads the demo backend (the real Code.gs on a fake sheet) in a hidden iframe so its globals
// don't clash with the app's, then routes the app's requests to it.
function startDemo() {
    return new Promise((resolve, reject) => {
        const frame = document.createElement('iframe');
        frame.hidden = true;
        frame.srcdoc = ['dev/gas-mock.js', 'apps-script/Code.gs', 'dev/demo.js']
            .map(src => `<script src="${src}"><\/script>`).join('');
        frame.onload = () => {
            const backend = frame.contentWindow;
            if (!backend.demoFetch) return reject(new Error('The demo failed to load'));
            window.fetch = backend.demoFetch;
            apiUrl = 'demo';
            secret = backend.DEMO_SECRET;
            resolve();
        };
        document.body.appendChild(frame);
    });
}

// Shows the loading screen while connecting with saved (or demo) details.
function startWith(connect) {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('loading-screen').hidden = false;
    connect()
        .then(showDashboard)
        .catch(err => {
            showError('Could not connect: ' + err.message);
            clearConnection();
        })
        .finally(() => { document.getElementById('loading-screen').hidden = true; });
}

if (isDemo) {
    document.getElementById('demo-banner').hidden = false;
    startWith(async () => {
        await startDemo();
        await loadData();
    });
} else if (apiUrl && secret) {
    startWith(loadData);
}
