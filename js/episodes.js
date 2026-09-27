// Day episodes: trackers with timing "days", for things that last whole days (a period, a
// cold, a trip). An episode's start is its first day at 00:00; its end is the midnight after
// its last day, or blank while it's still going.

function isEpisodeTracker(name) {
    const tracker = trackers.find(t => t.name === name);
    return Boolean(tracker && tracker.timing === 'days');
}

function isEpisode(e) {
    return Boolean(e.start) && isEpisodeTracker(e.tracker);
}

function episodeFirstDay(e) {
    return e.start.slice(0, 10);
}

// The last day it covered, or null while ongoing.
function episodeLastDay(e) {
    return e.end ? addDays(e.end.slice(0, 10), -1) : null;
}

// Every date the episode covers, up to today for ongoing ones.
function episodeDates(e) {
    const today = localDateString(new Date());
    const last = episodeLastDay(e) || today;
    const dates = [];
    for (let d = episodeFirstDay(e); d <= last && d <= today; d = addDays(d, 1)) dates.push(d);
    return dates;
}

function episodesOf(name) {
    return entries
        .filter(e => e.tracker === name && e.start)
        .sort((a, b) => a.start.localeCompare(b.start));
}

function ongoingEpisode(name) {
    return episodesOf(name).reverse().find(e => !e.end) || null;
}

function episodeLength(e) {
    return episodeDates(e).length;
}

function shortDate(dateStr) {
    return parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "Since Sep 24 · day 3", or "Sep 2 – Sep 6 (5 days)".
function formatEpisodeRange(e) {
    const first = episodeFirstDay(e);
    const last = episodeLastDay(e);
    if (!last) return `Since ${shortDate(first)} · day ${episodeLength(e)}`;
    if (last === first) return `${shortDate(first)} (1 day)`;
    return `${shortDate(first)} – ${shortDate(last)} (${plural(daysBetween(first, last) + 1, 'day')})`;
}

function median(nums) {
    if (!nums.length) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Typical length and gap between starts, and when the next one is likely (once there are
// at least two episodes to measure a gap from). Uses the median of the last six, so one
// unusual (or unlogged) month doesn't throw the estimate off.
function episodeStats(name) {
    const eps = episodesOf(name);
    const lengths = eps.filter(e => e.end).map(episodeLength).slice(-6);
    const starts = eps.map(episodeFirstDay);
    const gaps = starts.slice(1).map((s, i) => daysBetween(starts[i], s)).slice(-6);
    const avgLength = lengths.length ? Math.round(median(lengths)) : null;
    const avgGap = gaps.length ? Math.round(median(gaps)) : null;
    const ongoing = eps.find(e => !e.end) || null;
    const latest = eps[eps.length - 1] || null;
    return {
        count: eps.length,
        avgLength,
        avgGap,
        ongoing,
        latest,
        next: avgGap && latest && !ongoing ? addDays(episodeFirstDay(latest), avgGap) : null
    };
}

function episodeSummary(name) {
    const stats = episodeStats(name);
    const parts = [];
    if (stats.avgLength) parts.push(`usually ${plural(stats.avgLength, 'day')}`);
    if (stats.avgGap) parts.push(`starts every ~${stats.avgGap} days`);
    if (stats.next) {
        const inDays = daysBetween(localDateString(new Date()), stats.next);
        parts.push(inDays >= 0
            ? `next expected around ${shortDate(stats.next)}${inDays <= 30 ? ` (in ${plural(inDays, 'day')})` : ''}`
            : `was expected around ${shortDate(stats.next)}`);
    }
    return parts.length ? capitalize(parts.join(' · ')) : '';
}

// ---- Cycles ----

// Day trackers set to repeat as a cycle (like a period): every day belongs to a cycle, counted
// from each start (day 1) until the next one.
function cycleTrackers() {
    return trackers.filter(t => t.timing === 'days' && t.cycle);
}

function mainCycleTracker() {
    return cycleTrackers()[0] || null;
}

// Precomputed lookups for one cycle tracker. dayOf(date) is the cycle day, or null before the
// first logged start, or when it's been far longer than usual (a start probably wasn't logged).
function cycleCalendar(name) {
    const eps = episodesOf(name);
    const starts = eps.map(episodeFirstDay);
    const periodDates = new Set(eps.flatMap(episodeDates));
    const stats = episodeStats(name);
    const typical = stats.avgGap || 28;
    const limit = Math.max(45, Math.round(typical * 1.6));
    return {
        name,
        typical,
        periodLength: stats.avgLength || 5,
        dayOf(date) {
            let start = null;
            for (const s of starts) {
                if (s <= date) start = s;
                else break;
            }
            if (!start) return null;
            const day = daysBetween(start, date) + 1;
            return day > limit ? null : day;
        },
        inPeriod: date => periodDates.has(date)
    };
}

// ---- Actions ----

function startEpisode(name, button, date = localDateString(new Date())) {
    const ongoing = ongoingEpisode(name);
    if (ongoing) {
        showError(`${name} is already going (since ${shortDate(episodeFirstDay(ongoing))})`);
        return;
    }
    logEntry(button, '', { date, start: `${date}T00:00`, end: '', tracker: name, notes: '', values: [] }, `✓ ${name} started`);
}

// Ends an episode with `lastDay` as its final day.
function endEpisode(id, lastDay, button, onDone) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    if (lastDay < episodeFirstDay(e)) {
        showError(`It started on ${shortDate(episodeFirstDay(e))}, so it can't end before that`);
        return;
    }
    runAction(button, '', async () => {
        const updated = await api('updateEntry', { id, changes: { end: `${addDays(lastDay, 1)}T00:00` } });
        entries = entries.map(x => (x.id === id ? updated : x));
        if (onDone) onDone();
        renderAll();
        showSuccess(`✓ ${e.tracker} ended after ${plural(episodeLength(updated), 'day')}`);
    });
}

// From an Overview card, where Start turns into End in the same spot, so a double tap
// can't end an episode by accident.
function confirmEndEpisode(id, button) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    const today = localDateString(new Date());
    if (confirm(`End ${e.tracker} today (day ${episodeLength(e)})?`)) endEpisode(id, today, button);
}
