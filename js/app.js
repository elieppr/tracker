// App state, connecting to the sheet, and the Overview and Timeline tabs.
// Loaded last: the other scripts only define functions used from here.

let apiUrl = storageGet('tracker_apiUrl');
let secret = storageGet('tracker_secret');
let entries = [];     // { id, date, tracker, category, notes, created, values: [{ field, value, unit }] }
let trackers = [];    // { name, category, fields: [{ name, unit }] }
let categories = [];  // { name, color }
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
        // Mini chart of the last 7 days: the first value's daily total, relative to the week's max.
        const daily = days.map(d => entries
            .filter(e => e.tracker === t.name && e.date === d)
            .reduce((sum, e) => sum + (e.values[0] ? e.values[0].value : 0), 0));
        const max = Math.max(...daily);
        const bars = daily.map((v, i) => `<span class="spark-bar${v ? '' : ' empty'}${i === 6 ? ' today' : ''}" style="height: ${v && max ? Math.max(18, (v / max) * 100) : 10}%"></span>`).join('');
        return `
            <button type="button" class="tracker-tile" style="--cat: ${categoryColor(t.category)}" data-name="${escapeHtml(t.name)}" onclick="selectTrackerForEntry(this.dataset.name)">
                <span class="tile-top">
                    <span class="tile-avatar">${escapeHtml(t.name.trim().charAt(0).toUpperCase())}</span>
                    <span class="tile-name">${escapeHtml(t.name)}</span>
                    <span class="tile-week" title="Entries in the last 7 days">${weekCount}×</span>
                </span>
                <span class="tile-bottom">
                    <span>
                        <span class="tile-value">${last ? escapeHtml(formatValues(last.values)) : '—'}</span>
                        <span class="tile-when">${last ? `Last logged ${relativeDay(last.date)}` : 'Not logged yet'}</span>
                    </span>
                    <span class="sparkline" title="Last 7 days">${bars}</span>
                </span>
            </button>
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
            <label>${escapeHtml(capitalize(fieldLabel(f) || 'Value'))}</label>
            <input type="number" step="any" data-field-index="${i}" placeholder="0" oninput="this.dataset.auto = ''">
        </div>
    `).join('') : '';
    setUpTimingFields(tracker);
}

// ---- Entry times ----

// Moments get a date and time (now); time spans get start/end/duration inputs, prefilled
// from this tracker's usual times.
function setUpTimingFields(tracker) {
    const span = tracker && tracker.timing === 'span';
    document.getElementById('moment-fields').hidden = span;
    document.getElementById('span-fields').hidden = !span;
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
                    <span>${t.fields.map(f => escapeHtml(fieldLabel(f))).join(' · ')}</span>
                    ${t.timing === 'span' ? '<span class="timing-tag">Time span</span>' : ''}
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

    const values = [...document.querySelectorAll('#entry-values input')]
        .filter(input => input.value.trim() !== '')
        .map(input => {
            const field = tracker.fields[input.dataset.fieldIndex];
            return { field: field.name, unit: field.unit, value: Number(input.value) };
        });
    if (!values.length) {
        showError('Please enter a value');
        return;
    }

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

    runAction(submitButton(event), 'Adding…', async () => {
        const entry = await api('addEntry', {
            entry: {
                date,
                start,
                end,
                tracker: tracker.name,
                notes: document.getElementById('entry-notes').value.trim(),
                values
            }
        });
        entries.push(entry);
        sortEntries();

        document.getElementById('entry-notes').value = '';
        document.getElementById('entry-name').value = '';
        renderAll();
        showSuccess(`✓ Added ${tracker.name} entry`);
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
