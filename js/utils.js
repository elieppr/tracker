// Shared helpers: dates, formatting, storage, and small UI utilities.

// localStorage can be unavailable (private windows, some embedded viewers), so the
// connection is just not remembered there instead of breaking the page.
function storageGet(key) {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
}

function storageRemove(key) {
    try { localStorage.removeItem(key); } catch {}
}

// YYYY-MM-DD in the local time zone (toISOString would use UTC and can be off by a day).
function localDateString(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

function parseLocalDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function addDays(dateStr, n) {
    const d = parseLocalDate(dateStr);
    d.setDate(d.getDate() + n);
    return localDateString(d);
}

function daysBetween(a, b) {
    return Math.round((parseLocalDate(b) - parseLocalDate(a)) / 86400000);
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

// Local date-times as "YYYY-MM-DDTHH:MM", the format of <input type="datetime-local"> and of
// entry start/end times.
function toLocalDateTime(d) {
    return `${localDateString(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseLocalDateTime(s) {
    const [date, time = '00:00'] = s.split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    return new Date(y, m - 1, d, h, min);
}

// Now, rounded down to 5 minutes, as a sensible default for time inputs.
function roundedNow() {
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
    return d;
}

function formatTime(d) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
}

// "7:00 AM", or "11:30 PM – 7:00 AM (7h 30m)" for time spans.
function formatEntryTime(entry) {
    if (!entry.start) return '';
    const start = parseLocalDateTime(entry.start);
    if (!entry.end) return formatTime(start);
    const end = parseLocalDateTime(entry.end);
    return `${formatTime(start)} – ${formatTime(end)} (${formatDuration((end - start) / 60000)})`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatNumber(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// "5 km", or "5 / 10" for scale units like "1-10".
function formatValue(value, unit) {
    const scale = /^\s*[01]\s*[-–]\s*(\d+)\s*$/.exec(unit || '');
    if (scale) return `${formatNumber(value)} / ${scale[1]}`;
    return `${formatNumber(value)} ${unit || ''}`.trim();
}

function plural(n, word, pluralWord = word + 's') {
    return `${n} ${n === 1 ? word : pluralWord}`;
}

function categoryColor(name) {
    const category = categories.find(c => c.name === name);
    return category ? category.color : FALLBACK_COLOR;
}

function categoryBadge(name) {
    const color = categoryColor(name);
    return `<span class="badge" style="background: ${color}1f; color: color-mix(in srgb, ${color} 70%, var(--badge-mix));">${escapeHtml(name || 'Uncategorized')}</span>`;
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function fieldLabel(field) {
    if (field.name && field.unit) return `${field.name} (${field.unit})`;
    return field.name || field.unit;
}

function closeDialog(id) {
    document.getElementById(id).close();
}

// Small line icons (24×24, drawn with currentColor), used inline in the UI.
const ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    up: '<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    down: '<path d="M22 17l-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    sparkles: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.6Z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};

function icon(name, className = 'icon') {
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}
