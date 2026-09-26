// Timeline tab: a scrollable hour-by-hour view with one lane per category, plus the
// day-by-day list view.

const HOUR_MS = 3600000;
const HOUR_WIDTHS = [6, 12, 24, 48, 96];   // px per hour at each zoom level
const MOMENT_MINUTES = 30;                  // how long a moment (no end time) is drawn
const HEADER_HEIGHT = 46;
const ROW_HEIGHT = 30;
const LANE_PADDING = 6;
const MIN_BLOCK_WIDTH = 6;

// Per-viewer preferences, remembered in this browser only.
let timelineView = storageGet('tracker_timelineView') === 'list' ? 'list' : 'hourly';
// Phones start one level further out so most of a day fits on screen.
const isNarrowScreen = window.matchMedia('(max-width: 600px)').matches;
const isTouchScreen = window.matchMedia('(hover: none)').matches;
let zoomLevel = clampZoom(Number(storageGet('tracker_timelineZoom') || (isNarrowScreen ? 1 : 2)));
let hiddenCategories = new Set(readJson(storageGet('tracker_hiddenCategories'), []));

let hourly = null;          // current layout, see buildHourlyLayout
let drawnRange = null;      // [left, right] px of the canvas currently drawn
let scrolledOnce = false;
let dragState = null;

function clampZoom(level) {
    return Number.isInteger(level) ? Math.min(HOUR_WIDTHS.length - 1, Math.max(0, level)) : 2;
}

function readJson(text, fallback) {
    try {
        return text ? JSON.parse(text) : fallback;
    } catch {
        return fallback;
    }
}

function setTimelineView(view) {
    timelineView = view;
    storageSet('tracker_timelineView', view);
    renderTimeline();
}

function renderTimeline() {
    document.querySelectorAll('#timeline .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.view === timelineView));
    document.getElementById('timeline-hourly').hidden = timelineView !== 'hourly';
    document.getElementById('timeline-list').hidden = timelineView !== 'list';
    document.getElementById('timeline-sub').textContent = timelineView === 'hourly'
        ? `Your days hour by hour. ${isTouchScreen ? 'Swipe sideways' : 'Drag or scroll sideways'} to move through time.`
        : "Everything you've logged, newest first.";
    if (timelineView === 'list') {
        renderTimelineFilters();
        renderTimelineList();
    } else {
        renderHourly();
    }
}

// ---- Entry times and colors ----

// Where an entry sits in time. Entries saved before times existed are placed at the time
// they were logged (if logged that day), otherwise at noon.
function entryTimes(e) {
    let start;
    let approximate = false;
    if (e.start) {
        start = parseLocalDateTime(e.start);
    } else {
        approximate = true;
        const created = e.created ? new Date(e.created) : null;
        start = created && !isNaN(created) && localDateString(created) === e.date
            ? created
            : new Date(parseLocalDate(e.date).getTime() + 12 * HOUR_MS);
    }
    const end = e.end ? parseLocalDateTime(e.end) : new Date(start.getTime() + MOMENT_MINUTES * 60000);
    return { start, end, moment: !e.end, approximate };
}

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a, b, amount) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    return '#' + ca.map((c, i) => Math.round(c + (cb[i] - c) * amount).toString(16).padStart(2, '0')).join('');
}

function readableTextOn(hex) {
    const [r, g, b] = hexToRgb(hex).map(c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1c1c1a' : '#ffffff';
}

// Each tracker gets its own shade of its category's color: lighter and darker steps in turn.
function trackerColors() {
    const byCategory = new Map();
    const add = (name, category) => {
        if (!byCategory.has(category)) byCategory.set(category, []);
        const names = byCategory.get(category);
        if (!names.includes(name)) names.push(name);
    };
    trackers.forEach(t => add(t.name, t.category));
    entries.forEach(e => add(e.tracker, e.category));

    const steps = [0, 0.4, -0.3, 0.62, -0.5, 0.78, -0.65];
    const colors = new Map();
    byCategory.forEach((names, category) => names.forEach((name, i) => {
        const base = categoryColor(category);
        const step = steps[i % steps.length];
        const fill = step >= 0 ? mixHex(base, '#ffffff', step) : mixHex(base, '#000000', -step);
        colors.set(name, { fill, text: readableTextOn(fill) });
    }));
    return colors;
}

// ---- Hourly view: layout ----

function laneNames() {
    const names = categories.map(c => c.name);
    entries.forEach(e => {
        if (e.category && !names.includes(e.category)) names.push(e.category);
    });
    return names;
}

// Positions every entry once per data/filter change: lanes are categories, and entries that
// overlap in time within a lane go on separate rows.
function buildHourlyLayout(viewWidth) {
    const hourWidth = HOUR_WIDTHS[zoomLevel];
    const visibleLanes = laneNames().filter(n => !hiddenCategories.has(n));
    const items = entries
        .filter(e => visibleLanes.includes(e.category))
        .map(e => ({ entry: e, ...entryTimes(e) }))
        .sort((a, b) => a.start - b.start);

    const now = new Date();
    const firstDay = parseLocalDate(localDateString(items.length ? new Date(Math.min(items[0].start, now - 6 * 24 * HOUR_MS)) : new Date(now - 6 * 24 * HOUR_MS)));
    // Leave room after now (or the latest entry) so "now" can sit well inside the view.
    const futureHours = Math.max(24, (viewWidth / hourWidth) * 0.5);
    const latest = Math.max(now.getTime() + futureHours * HOUR_MS, ...items.map(i => i.end.getTime()));
    const lastDay = parseLocalDate(addDays(localDateString(new Date(latest)), 1));
    const origin = firstDay.getTime();
    const hours = (lastDay.getTime() - origin) / HOUR_MS;

    let y = HEADER_HEIGHT;
    const lanes = visibleLanes.map(name => {
        const rowEnds = [];
        items.filter(i => i.entry.category === name).forEach(item => {
            let row = rowEnds.findIndex(end => end <= item.start.getTime());
            if (row === -1) {
                row = rowEnds.length;
                rowEnds.push(0);
            }
            rowEnds[row] = item.end.getTime();
            item.row = row;
        });
        const rows = Math.max(1, rowEnds.length);
        const lane = { name, color: categoryColor(name), y, height: rows * ROW_HEIGHT + LANE_PADDING * 2 };
        y += lane.height;
        return lane;
    });
    const laneByName = new Map(lanes.map(l => [l.name, l]));
    items.forEach(item => { item.lane = laneByName.get(item.entry.category); });

    return {
        hourWidth,
        origin,
        width: hours * hourWidth,
        height: y,
        lanes,
        items,
        colors: trackerColors(),
        x: t => ((t instanceof Date ? t.getTime() : t) - origin) / HOUR_MS * hourWidth,
        timeAt: px => origin + (px / hourWidth) * HOUR_MS
    };
}

function renderHourly() {
    const tab = document.getElementById('timeline');
    if (!tab.classList.contains('active') || timelineView !== 'hourly') return;

    const scroller = document.getElementById('hourly-scroller');
    // Keep the same moment in the middle of the screen across re-layouts and zoom changes.
    const centerTime = hourly && scrolledOnce ? hourly.timeAt(scroller.scrollLeft + scroller.clientWidth / 2) : null;

    renderCategoryChips();
    hourly = buildHourlyLayout(scroller.clientWidth || 800);
    renderHourlyLegend();

    const canvas = document.getElementById('hourly-canvas');
    canvas.style.width = hourly.width + 'px';
    canvas.style.height = hourly.height + 'px';
    canvas.style.setProperty('--hour-width', hourly.hourWidth + 'px');
    canvas.classList.toggle('zoomed-out', hourly.hourWidth < 12);

    document.getElementById('hourly-labels').innerHTML = `<div class="lane-label-head" style="height: ${HEADER_HEIGHT}px"></div>` +
        hourly.lanes.map(l => `
            <div class="lane-label" style="height: ${l.height}px; --cat: ${l.color}">
                <span class="swatch" style="background: ${l.color}"></span>
                <span>${escapeHtml(l.name)}</span>
            </div>
        `).join('');

    document.getElementById('hourly-empty').hidden = hourly.items.length > 0;
    document.getElementById('hourly-zoom-out').disabled = zoomLevel === 0;
    document.getElementById('hourly-zoom-in').disabled = zoomLevel === HOUR_WIDTHS.length - 1;

    drawnRange = null;
    if (centerTime !== null) {
        scroller.scrollLeft = hourly.x(centerTime) - scroller.clientWidth / 2;
    } else {
        scroller.scrollLeft = hourly.x(Date.now()) - scroller.clientWidth * 0.7;
        scrolledOnce = true;
    }
    drawHourly(true);
}

// ---- Hourly view: drawing ----

function dayHeaderLabel(day) {
    const today = localDateString(new Date());
    const dateStr = localDateString(day);
    const text = day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (dateStr === today) return `Today · ${text}`;
    if (dateStr === addDays(today, -1)) return `Yesterday · ${text}`;
    return text;
}

function hourLabelStep(hourWidth) {
    if (hourWidth >= 40) return 1;
    if (hourWidth >= 20) return 3;
    if (hourWidth >= 10) return 6;
    return 12;
}

// Only the part of the canvas near the screen is drawn, and redrawn as you scroll, so
// months of history stay fast.
function drawHourly(force) {
    if (!hourly) return;
    const scroller = document.getElementById('hourly-scroller');
    const view = scroller.clientWidth || 800;
    const left = scroller.scrollLeft;
    if (!force && drawnRange && left - view / 2 >= drawnRange[0] && left + view * 1.5 <= drawnRange[1]) return;

    const x0 = Math.max(0, left - view);
    const x1 = Math.min(hourly.width, left + view * 2);
    drawnRange = [x0, x1];
    const t0 = hourly.timeAt(x0);
    const t1 = hourly.timeAt(x1);
    const { x, hourWidth } = hourly;

    const parts = [];

    // Lane tints across the drawn range.
    hourly.lanes.forEach(l => {
        parts.push(`<div class="lane-bg" style="left: ${x0}px; width: ${x1 - x0}px; top: ${l.y}px; height: ${l.height}px; --cat: ${l.color}"></div>`);
    });

    // Days: weekend shading, midnight lines, day labels that stick to the left edge, hour labels.
    const step = hourLabelStep(hourWidth);
    for (let day = parseLocalDate(localDateString(new Date(t0))); day.getTime() < t1; day = parseLocalDate(addDays(localDateString(day), 1))) {
        const dx = x(day);
        const next = parseLocalDate(addDays(localDateString(day), 1));
        const dayWidth = x(next) - dx;
        const weekend = day.getDay() === 0 || day.getDay() === 6;
        parts.push(`
            <div class="tl-day${weekend ? ' weekend' : ''}" style="left: ${dx}px; width: ${dayWidth}px">
                <span class="tl-day-label">${dayHeaderLabel(day)}</span>
            </div>
        `);
        for (let h = step; h < 24; h += step) {
            const hx = x(day.getTime() + h * HOUR_MS);
            const label = new Date(day.getTime() + h * HOUR_MS).toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', '').toLowerCase();
            parts.push(`<span class="tl-hour-label" style="left: ${hx}px">${label}</span>`);
        }
    }

    // Entries.
    hourly.items.forEach((item, index) => {
        if (item.end.getTime() < t0 || item.start.getTime() > t1) return;
        const e = item.entry;
        const color = hourly.colors.get(e.tracker) || { fill: FALLBACK_COLOR, text: '#ffffff' };
        const bx = x(item.start);
        const width = Math.max(MIN_BLOCK_WIDTH, x(item.end) - bx - 2);
        const top = item.lane.y + LANE_PADDING + item.row * ROW_HEIGHT;
        const valueText = formatValues(e.values);
        // The label sticks to the left edge of the view, so long spans that started off-screen
        // stay readable.
        const label = width > 46
            ? `<span class="blk-label"><span class="blk-name">${escapeHtml(e.tracker)}</span>${width > 110 ? `<span class="blk-value">${escapeHtml(valueText)}</span>` : ''}</span>`
            : '';
        parts.push(`
            <button type="button" class="tl-block${item.moment ? ' moment' : ''}${item.approximate ? ' approximate' : ''}"
                style="left: ${bx}px; top: ${top}px; width: ${width}px; height: ${ROW_HEIGHT - 4}px; background: ${color.fill}; color: ${color.text}"
                data-item="${index}" aria-label="${escapeHtml(`${e.tracker}, ${valueText}`)}">${label}</button>
        `);
    });

    // Now line.
    const nowX = x(Date.now());
    if (nowX >= x0 && nowX <= x1) {
        parts.push(`<div class="tl-now" style="left: ${nowX}px; height: ${hourly.height - 30}px"><span>now</span></div>`);
    }

    document.getElementById('hourly-canvas').innerHTML = parts.join('');
}

function renderCategoryChips() {
    document.getElementById('hourly-chips').innerHTML = laneNames().map(name => {
        const on = !hiddenCategories.has(name);
        return `
            <button type="button" class="cat-chip${on ? ' on' : ''}" style="--cat: ${categoryColor(name)}"
                data-name="${escapeHtml(name)}" aria-pressed="${on}" onclick="toggleTimelineCategory(this.dataset.name)">
                <span class="cat-chip-dot"></span>${escapeHtml(name)}
            </button>
        `;
    }).join('');
}

function renderHourlyLegend() {
    const groups = hourly.lanes.map(lane => {
        const names = [...new Set([
            ...trackers.filter(t => t.category === lane.name).map(t => t.name),
            ...entries.filter(e => e.category === lane.name).map(e => e.tracker)
        ])];
        if (!names.length) return '';
        return `<div class="legend-group">${names.map(n => {
            const color = hourly.colors.get(n);
            return `<span class="legend-key"><span class="key-swatch" style="background: ${color ? color.fill : FALLBACK_COLOR}"></span>${escapeHtml(n)}</span>`;
        }).join('')}</div>`;
    });
    document.getElementById('hourly-legend').innerHTML = groups.join('');
}

function toggleTimelineCategory(name) {
    if (hiddenCategories.has(name)) hiddenCategories.delete(name);
    else hiddenCategories.add(name);
    storageSet('tracker_hiddenCategories', JSON.stringify([...hiddenCategories]));
    renderHourly();
}

function zoomTimeline(delta) {
    const level = clampZoom(zoomLevel + delta);
    if (level === zoomLevel) return;
    zoomLevel = level;
    storageSet('tracker_timelineZoom', String(zoomLevel));
    renderHourly();
}

function shiftTimeline(days) {
    const scroller = document.getElementById('hourly-scroller');
    scroller.scrollBy({ left: days * 24 * HOUR_WIDTHS[zoomLevel], behavior: 'smooth' });
}

function scrollTimelineToNow() {
    const scroller = document.getElementById('hourly-scroller');
    scroller.scrollTo({ left: hourly.x(Date.now()) - scroller.clientWidth * 0.7, behavior: 'smooth' });
}

// ---- Hourly view: hover, click and drag ----

function entryTip(item) {
    const e = item.entry;
    const color = hourly.colors.get(e.tracker);
    const when = e.start
        ? formatEntryTime(e)
        : `${formatTime(item.start)} (time not recorded)`;
    return {
        title: `${e.tracker} · ${e.category}`,
        rows: [
            { color: color ? color.fill : FALLBACK_COLOR, value: when, label: '' },
            ...e.values.map(v => ({ value: formatValue(v.value, v.unit), label: v.field })),
            ...(e.notes ? [{ value: '', label: e.notes }] : [])
        ]
    };
}

function openEntryDialog(item) {
    const e = item.entry;
    const color = hourly.colors.get(e.tracker);
    const day = parseLocalDate(e.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('entry-dialog-body').innerHTML = `
        <div class="entry-detail-head">
            <span class="entry-detail-swatch" style="background: ${color ? color.fill : FALLBACK_COLOR}"></span>
            <h2>${escapeHtml(e.tracker)}</h2>
            ${categoryBadge(e.category)}
        </div>
        <p class="entry-detail-when">${escapeHtml(day)}${e.start ? ` · ${escapeHtml(formatEntryTime(e))}` : ' · time not recorded'}</p>
        <div class="tl-values">${e.values.map(v => `
            <span class="value-chip">${v.field ? `<span class="value-label">${escapeHtml(v.field)}</span> ` : ''}${escapeHtml(formatValue(v.value, v.unit))}</span>
        `).join('')}</div>
        ${e.notes ? `<p class="tl-notes">${escapeHtml(e.notes)}</p>` : ''}
    `;
    const dialog = document.getElementById('entry-dialog');
    dialog.querySelector('.dialog-message').innerHTML = '';
    document.getElementById('entry-dialog-delete').onclick = event =>
        deleteEntry(e.id, event.currentTarget, 'Deleting…', () => closeDialog('entry-dialog'));
    dialog.showModal();
}

(function setUpHourlyInteractions() {
    const scroller = document.getElementById('hourly-scroller');
    const canvas = document.getElementById('hourly-canvas');
    const itemFor = target => {
        const el = target.closest('[data-item]');
        return el && hourly ? hourly.items[el.dataset.item] : null;
    };

    scroller.addEventListener('scroll', () => requestAnimationFrame(() => drawHourly(false)), { passive: true });

    canvas.addEventListener('pointermove', event => {
        if (dragState && dragState.moved) return;
        const item = itemFor(event.target);
        if (item) showTipAt(entryTip(item), event.clientX, event.clientY);
        else hideTip();
    });
    canvas.addEventListener('pointerleave', hideTip);
    canvas.addEventListener('focusin', event => {
        const item = itemFor(event.target);
        if (!item) return;
        const rect = event.target.getBoundingClientRect();
        showTipAt(entryTip(item), rect.left, rect.bottom);
    });
    canvas.addEventListener('focusout', hideTip);
    canvas.addEventListener('click', event => {
        if (dragState && dragState.moved) return; // the click ended a drag
        const item = itemFor(event.target);
        if (item) {
            hideTip();
            openEntryDialog(item);
        }
    });

    // Drag with the mouse to move through time (touch and trackpads scroll natively).
    scroller.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        dragState = { x: event.clientX, left: scroller.scrollLeft, moved: false };
    });
    window.addEventListener('pointermove', event => {
        if (!dragState) return;
        const dx = event.clientX - dragState.x;
        if (Math.abs(dx) > 4) {
            dragState.moved = true;
            scroller.classList.add('dragging');
            hideTip();
        }
        if (dragState.moved) scroller.scrollLeft = dragState.left - dx;
    });
    window.addEventListener('pointerup', () => {
        if (!dragState) return;
        scroller.classList.remove('dragging');
        // Let the click handler see that this was a drag, then reset.
        setTimeout(() => { dragState = null; }, 0);
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => drawHourly(true), 150);
    });
})();

// ---- List view ----

function renderTimelineFilters() {
    const catSelect = document.getElementById('filter-category');
    const trkSelect = document.getElementById('filter-tracker');
    const selectedCat = catSelect.value;
    const selectedTrk = trkSelect.value;

    // Include names only found on old entries (e.g. deleted trackers) so they stay filterable.
    const catNames = [...new Set([...categories.map(c => c.name), ...entries.map(e => e.category)])].filter(Boolean);
    const trkNames = [...new Set([...trackers.map(t => t.name), ...entries.map(e => e.tracker)])].filter(Boolean);

    catSelect.innerHTML = '<option value="">All categories</option>' +
        catNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    trkSelect.innerHTML = '<option value="">All trackers</option>' +
        trkNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

    if (catNames.includes(selectedCat)) catSelect.value = selectedCat;
    if (trkNames.includes(selectedTrk)) trkSelect.value = selectedTrk;
}

function dayLabel(dateStr) {
    const date = parseLocalDate(dateStr);
    const today = new Date();
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    if (date.getFullYear() !== today.getFullYear()) options.year = 'numeric';
    const full = date.toLocaleDateString('en-US', options);

    const todayStr = localDateString(today);
    if (dateStr === todayStr) return { title: 'Today', sub: full };
    if (dateStr === addDays(todayStr, -1)) return { title: 'Yesterday', sub: full };
    return { title: full, sub: '' };
}

function renderTimelineList() {
    const container = document.getElementById('timeline-container');
    const cat = document.getElementById('filter-category').value;
    const trk = document.getElementById('filter-tracker').value;
    const visible = entries
        .filter(e => (!cat || e.category === cat) && (!trk || e.tracker === trk))
        .map(e => ({ e, t: entryTimes(e).start.getTime() }))
        .sort((a, b) => b.e.date.localeCompare(a.e.date) || b.t - a.t)
        .map(x => x.e);

    if (visible.length === 0) {
        container.innerHTML = `<div class="empty-state">${entries.length ? 'No entries match these filters.' : 'No entries yet. Add one in the Overview tab!'}</div>`;
        return;
    }

    const days = [];
    visible.forEach(e => {
        const last = days[days.length - 1];
        if (last && last.date === e.date) last.entries.push(e);
        else days.push({ date: e.date, entries: [e] });
    });

    container.innerHTML = days.map(day => {
        const label = dayLabel(day.date);
        return `
            <section class="day">
                <div class="day-header">
                    <span class="day-title">${label.title}</span>
                    <span class="day-date">${label.sub}</span>
                    <span class="day-count">${plural(day.entries.length, 'entry', 'entries')}</span>
                </div>
                <div class="day-entries">
                    ${day.entries.map(renderTimelineEntry).join('')}
                </div>
            </section>
        `;
    }).join('');
}

function renderTimelineEntry(e) {
    const chips = e.values.map(v => `
        <span class="value-chip">${v.field ? `<span class="value-label">${escapeHtml(v.field)}</span> ` : ''}${escapeHtml(formatValue(v.value, v.unit))}</span>
    `).join('');

    return `
        <div class="tl-entry">
            <span class="tl-dot" style="background: ${categoryColor(e.category)}"></span>
            <div class="tl-body">
                <div class="tl-top">
                    ${e.start ? `<span class="tl-time">${escapeHtml(formatEntryTime(e))}</span>` : ''}
                    <span class="tl-name">${escapeHtml(e.tracker)}</span>
                    ${categoryBadge(e.category)}
                </div>
                <div class="tl-values">${chips}</div>
                ${e.notes ? `<div class="tl-notes">${escapeHtml(e.notes)}</div>` : ''}
            </div>
            <button type="button" class="icon-btn" title="Delete entry" data-id="${escapeHtml(e.id)}" onclick="deleteEntry(this.dataset.id, this)">×</button>
        </div>
    `;
}
