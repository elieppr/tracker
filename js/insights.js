// Insights tab: associations, day-of-week, scatter and trend charts.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let chartTips = [];

// ---- Series: what can be analyzed, and on which days it's actually known ----
//
// A series is one thing measured per day: a tracker's value, a single feeling from a check-in,
// the check-in's coping rating, or whether a day episode (like a period) was going on. Each
// series only has values on the days it was *observed*. Days you didn't log something are left
// out of its analysis instead of being counted as zero, so forgetting to log doesn't read as
// "it didn't happen".
//
//   amount   Things where a missing day means "not logged" (mood, sleep, water). Observed: the
//            days you logged it.
//   event    Things where a missing day means "didn't happen" (headaches, cramps). Observed:
//            days you were clearly logging (two or more different trackers); unlogged = 0.
//   Each tracker's "On days with no entry" setting picks which; "guess" goes by how often
//   it's logged.
//   episode  Day trackers (a period). Observed: those same logging days, plus the episode's
//            days; 1 while it was going on, else 0.
//   feeling  One feeling from a check-in. Observed: check-in days; its intensity, or 0 if not
//            picked that day.
//   coping   A check-in's "how manageable" rating. Observed: check-ins that included it.

let insightEntries = [];

function analysisEntries() {
    return entries.flatMap(e => (isEpisode(e)
        ? episodeDates(e).map(date => ({ ...e, date, values: [{ field: 'Day', unit: '', value: 1 }] }))
        : [e]));
}

// A tracker logged on at least half of your logging days is treated as an everyday amount.
const EVERYDAY_SHARE = 0.5;

function buildSeries(list) {
    const trackersOn = new Map(); // date -> set of trackers logged
    list.forEach(e => {
        if (!trackersOn.has(e.date)) trackersOn.set(e.date, new Set());
        trackersOn.get(e.date).add(e.tracker);
    });
    const loggingDays = [...trackersOn].filter(([, set]) => set.size >= 2).map(([date]) => date);
    const series = [];

    trackers.forEach(t => {
        const own = list.filter(e => e.tracker === t.name);
        const loggedDays = new Set(own.map(e => e.date));

        if (t.timing === 'days') {
            const values = new Map(loggingDays.map(d => [d, 0]));
            loggedDays.forEach(d => values.set(d, 1));
            series.push(makeSeries(t, { name: 'Day', unit: '' }, 'episode', values, `${t.name} (days)`, t.name, true));
            return;
        }

        if (t.feelings) {
            const checkIns = new Set(own.map(e => e.date));
            feelingNames(t).forEach(feeling => {
                const values = new Map([...checkIns].map(d => [d, 0]));
                own.forEach(e => e.values.forEach(v => {
                    if (v.field === feeling) values.set(e.date, Math.max(values.get(e.date), v.value));
                }));
                series.push(makeSeries(t, { name: feeling, unit: '1-5' }, 'feeling', values, `Feeling: ${feeling}`, feeling, true));
            });
            if (t.fields.some(f => f.name === COPING_FIELD)) {
                const sums = new Map();
                own.forEach(e => e.values.forEach(v => {
                    if (v.field !== COPING_FIELD) return;
                    const s = sums.get(e.date) || [];
                    s.push(v.value);
                    sums.set(e.date, s);
                }));
                const values = new Map([...sums].map(([d, vs]) => [d, mean(vs)]));
                series.push(makeSeries(t, { name: COPING_FIELD, unit: '1-5' }, 'coping', values, 'Coping (how manageable)', 'Coping', true));
            }
            return;
        }

        // The tracker's own setting decides; otherwise guess from how often it's logged.
        const everyday = t.missing === 'unknown' ? true
            : t.missing === 'zero' ? false
                : t.tally || (loggingDays.length && [...loggedDays].filter(d => loggingDays.includes(d)).length / loggingDays.length >= EVERYDAY_SHARE);
        t.fields.forEach((f, i) => {
            const daily = new Map();
            own.forEach(e => e.values.forEach(v => {
                if (t.fields.length > 1 && v.field !== f.name) return;
                daily.set(e.date, (daily.get(e.date) || 0) + v.value);
            }));
            let values = daily;
            if (!everyday) {
                values = new Map(loggingDays.map(d => [d, 0]));
                daily.forEach((v, d) => values.set(d, v));
            }
            const label = t.fields.length > 1 ? `${t.name} — ${fieldLabel(f)}` : `${t.name}${f.unit ? ` (${f.unit})` : ''}`;
            // The first value stands for the tracker itself ("Headache"); others are named ("Morning Run Duration").
            series.push(makeSeries(t, f, everyday ? 'amount' : 'event', values, label, i === 0 ? t.name : `${t.name} ${f.name}`, i === 0));
        });
    });
    // Your own marks: every label becomes something to compare ("Exam week" days), counting
    // each day a mark with that label touches.
    [...new Set(marks.map(m => m.label))].forEach(label => {
        const covered = new Set();
        marks.filter(m => m.label === label).forEach(m => {
            let last = m.end.slice(0, 10);
            if (m.end.endsWith('T00:00')) last = addDays(last, -1);
            for (let d = m.start.slice(0, 10); d <= last; d = addDays(d, 1)) covered.add(d);
        });
        const values = new Map(loggingDays.map(d => [d, covered.has(d) ? 1 : 0]));
        const pseudoTracker = { name: label, category: '', fields: [], timing: 'days' };
        const sr = makeSeries(pseudoTracker, { name: '', unit: '' }, 'episode', values, `Marked: ${label}`, label, true);
        sr.key = JSON.stringify(['mark', label]);
        sr.mark = true;
        series.push(sr);
    });
    return series;
}

function makeSeries(tracker, field, kind, values, label, name, primary) {
    return { key: JSON.stringify([tracker.name, field.name, kind]), tracker, field, kind, values, label, name, primary };
}

// Whether the series has an on/off sense (it happened or not) beyond its amount.
function hasPresence(s) {
    return s.kind === 'event' || s.kind === 'feeling' || s.kind === 'episode';
}

// The value to average: for events and feelings, only when it happened (how strong it was).
function amountOn(s, date) {
    if (!s.values.has(date)) return null;
    const v = s.values.get(date);
    if (s.kind === 'episode') return null;
    if (s.kind === 'event' || s.kind === 'feeling') return v > 0 ? v : null;
    return v;
}

let insightSeries = [];

function mean(nums) {
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

// How far apart two groups are relative to their day-to-day noise (Welch's t statistic).
// Around 2 or more means the difference is unlikely to be chance.
const CLEAR_PATTERN = 2;

function variance(xs) {
    const m = mean(xs);
    return xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
}

// Degrees of freedom for Welch's t (Welch-Satterthwaite).
function welchDf(a, b) {
    const x = variance(a) / a.length;
    const y = variance(b) / b.length;
    const df = (x + y) ** 2 / ((x * x) / (a.length - 1) + (y * y) / (b.length - 1));
    return Number.isFinite(df) ? df : Math.min(a.length, b.length) - 1;
}

// p-value for the difference between two groups of values.
function valuesP(a, b) {
    return normalP(tToZ(welchT(a, b), welchDf(a, b)));
}

// Findings come in two tiers: "clear" ones survive the correction for comparing many things
// at once; "possible" ones are individually unlikely to be chance (p < 0.05) but could still
// be a fluke, so they're shown as leads to watch.
const POSSIBLE_P = 0.05;

function welchT(a, b) {
    if (a.length < 3 || b.length < 3) return 0;
    const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
    return se > 0 ? (mean(a) - mean(b)) / se : 0;
}

// Same idea for "how often": compares two proportions (x1 of n1 vs x2 of n2).
function proportionZ(x1, n1, x2, n2) {
    if (n1 < 3 || n2 < 3) return 0;
    const p = (x1 + x2) / (n1 + n2);
    const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
    return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
}

// Two-sided p-value for a z score (normal approximation).
function normalP(z) {
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    return t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
}

// Converts a t score with `df` degrees of freedom to an equivalent z, so small groups aren't
// treated as more certain than they are.
function tToZ(t, df) {
    return df > 0 ? (t * (1 - 1 / (4 * df))) / Math.sqrt(1 + (t * t) / (2 * df)) : 0;
}

// When many things are compared at once, a few will look unusual by chance. The
// Benjamini-Hochberg method picks which p-values to report so that, on average, no more than
// `q` of the reported findings are flukes. Returns a test for "is this p-value a finding?".
function discoveries(pValues, q = 0.1) {
    const sorted = pValues.filter(p => p !== null).sort((a, b) => a - b);
    let cutoff = -1;
    sorted.forEach((p, i) => {
        if (p <= ((i + 1) / sorted.length) * q) cutoff = p;
    });
    return p => p !== null && p <= cutoff;
}

function pct(p) {
    return Math.round(p * 100) + '%';
}

function insightRange() {
    const today = localDateString(new Date());
    const value = document.getElementById('insight-range').value;
    if (value === 'all') {
        const earliest = insightEntries.reduce((min, e) => (e.date < min ? e.date : min), today);
        return { start: earliest, end: today };
    }
    return { start: addDays(today, -(Number(value) - 1)), end: today };
}

// Rounds an axis range out to clean values and returns evenly spaced ticks.
function niceScale(max, count = 4, min = 0) {
    if (!(max > min)) max = min + 1;
    const raw = (max - min) / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const start = Math.floor(min / step + 1e-9) * step;
    const top = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = start; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
    return { min: start, max: top, ticks };
}

function tipAttrs(tip) {
    chartTips.push(tip);
    return `data-tip="${chartTips.length - 1}" tabindex="0"`;
}

function tableView(headers, rows) {
    if (!rows.length) return '';
    return `
        <details class="table-view">
            <summary>Show as table</summary>
            <div class="table-scroll">
                <table>
                    <thead><tr>${headers.map(h => `<th class="${h.num ? 'num' : ''}">${escapeHtml(h.label)}</th>`).join('')}</tr></thead>
                    <tbody>${rows.map(r => `<tr>${r.map((cell, i) => `<td class="${headers[i].num ? 'num' : ''}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>
            </div>
        </details>
    `;
}

function fillSelect(select, options, preferred) {
    const current = select.value;
    select.innerHTML = options.map(o => `<option value="${escapeHtml(o.key)}">${escapeHtml(o.label)}</option>`).join('');
    if (options.some(o => o.key === current)) select.value = current;
    else if (preferred) select.value = preferred.key;
}

function renderInsights() {
    const tab = document.getElementById('insights');
    if (!tab.classList.contains('active')) return;
    hideTip();
    chartTips = [];

    insightEntries = analysisEntries();
    const range = insightRange();
    const list = insightEntries.filter(e => e.date >= range.start && e.date <= range.end);
    insightSeries = buildSeries(list);
    const metrics = insightSeries.filter(m => m.kind !== 'episode');
    const byName = pattern => metrics.find(m => pattern.test(m.tracker.name));

    // Things that happen or not (headaches, feelings, a period) can be the focus.
    const targetOptions = insightSeries.filter(sr => sr.primary && hasPresence(sr))
        .map(sr => ({ key: sr.key, label: sr.kind === 'feeling' ? `Feeling: ${sr.name}` : sr.mark ? `Marked: ${sr.name}` : sr.name }));
    fillSelect(document.getElementById('assoc-target'), targetOptions,
        targetOptions.find(o => /headache/i.test(o.label)) || targetOptions.find(o => o.label.startsWith('Feeling')) || targetOptions[0]);
    fillSelect(document.getElementById('dow-metric'), metrics, byName(/water/i));
    fillSelect(document.getElementById('scatter-x'), metrics, byName(/water/i) || metrics[0]);
    fillSelect(document.getElementById('scatter-y'), metrics, byName(/work/i) || metrics[1]);
    fillSelect(document.getElementById('trend-metric'), metrics, byName(/water/i));

    const metricFor = id => metrics.find(m => m.key === document.getElementById(id).value);

    renderAssociations();
    renderFeelings(list);
    renderCycle(list, metrics);
    renderDayOfWeek(list, range, metricFor('dow-metric'));
    renderScatter(list, metricFor('scatter-x'), metricFor('scatter-y'));
    renderTrend(list, range, metricFor('trend-metric'));
}

// Compares everything else on days the focus happened vs days it didn't, using only days where
// both are known.
function renderAssociations() {
    const container = document.getElementById('assoc-chart');
    const target = insightSeries.find(sr => sr.key === document.getElementById('assoc-target').value);
    const [minLag, maxLag] = document.getElementById('assoc-window').value.split(',').map(Number);
    const windowText = { '0,0': 'on', '1,1': 'the day before', '0,1': 'on or the day before' }[`${minLag},${maxLag}`];

    if (!target) {
        container.innerHTML = '<div class="empty-state">Log something that happens on some days (like a headache or a feelings check-in) to see what goes with it.</div>';
        return;
    }
    const targetName = target.kind === 'feeling' ? target.name : target.name;
    const targetDays = [...target.values].filter(([, v]) => v > 0).map(([d]) => d);
    const otherDays = [...target.values].filter(([, v]) => v === 0).map(([d]) => d);
    const dayWord = target.kind === 'feeling' ? 'check-in' : 'day';
    if (!targetDays.length || !otherDays.length) {
        container.innerHTML = `<div class="empty-state">${target.kind === 'feeling'
            ? `Do a few more check-ins, some with ${escapeHtml(targetName)} and some without, to see what goes with it.`
            : `Log ${escapeHtml(targetName)} on a few days (and other trackers on days without it) to see what goes with it.`}</div>`;
        return;
    }

    const windowDays = day => {
        const days = [];
        for (let lag = minLag; lag <= maxLag; lag++) days.push(addDays(day, -lag));
        return days;
    };
    // Around one focus day: did X happen, and how much, over the window days where X is known.
    const around = (sr, day) => {
        const known = windowDays(day).filter(d => sr.values.has(d));
        if (!known.length) return null;
        const amounts = known.map(d => amountOn(sr, d)).filter(v => v !== null);
        return { present: known.some(d => sr.values.get(d) > 0), amount: amounts.length ? mean(amounts) : null };
    };

    const rows = insightSeries
        .filter(sr => sr.primary && sr.key !== target.key)
        .map(sr => {
            const aT = targetDays.map(d => around(sr, d)).filter(Boolean);
            const aO = otherDays.map(d => around(sr, d)).filter(Boolean);
            if (aT.length < 2 || aO.length < 2) return null;
            const presence = hasPresence(sr);
            const t = aT.filter(a => a.present).length;
            const o = aO.filter(a => a.present).length;
            const valuesT = aT.map(a => a.amount).filter(v => v !== null);
            const valuesO = aO.map(a => a.amount).filter(v => v !== null);
            const avg = valuesT.length >= 2 && valuesO.length >= 2
                ? { t: mean(valuesT), o: mean(valuesO), unit: sr.field.unit, score: welchT(valuesT, valuesO) }
                : null;
            // p-values, only when there are enough days for the comparison to mean anything.
            const presenceP = presence && aT.length >= 4 && aO.length >= 4 && t + o >= 3
                ? normalP(proportionZ(t, aT.length, o, aO.length))
                : null;
            const valueP = avg && valuesT.length >= 3 && valuesO.length >= 3 ? valuesP(valuesT, valuesO) : null;
            return {
                presenceP,
                valueP,
                sr,
                nT: aT.length,
                nO: aO.length,
                t,
                o,
                pT: t / aT.length,
                pO: o / aO.length,
                presence: presence ? t / aT.length - o / aO.length : 0,
                presenceScore: presence ? proportionZ(t, aT.length, o, aO.length) : 0,
                avg,
                valueScore: avg ? avg.score : 0
            };
        })
        .filter(Boolean);

    if (!rows.length) {
        container.innerHTML = '<div class="empty-state">Log some other trackers too, on days with and without it, so there is something to compare.</div>';
        return;
    }

    // Most convincing pattern first, whichever direction. Only comparisons that survive the
    // correction for comparing many things at once are reported as findings.
    const isClear = discoveries(rows.flatMap(r => [r.presenceP, r.valueP]));
    const tier = p => (isClear(p) ? 2 : p !== null && p < POSSIBLE_P ? 1 : 0);
    rows.forEach(r => {
        r.presenceTier = tier(r.presenceP);
        r.valueTier = tier(r.valueP);
        r.presenceFound = r.presenceTier === 2;
        r.valueFound = r.valueTier === 2;
        // Which comparison to report for this row: the higher tier, then the smaller p.
        r.byPresence = r.presenceTier > r.valueTier || (r.presenceTier === r.valueTier && (r.presenceP ?? 1) <= (r.valueP ?? 1));
        r.tier = Math.max(r.presenceTier, r.valueTier);
        r.bestP = Math.min(r.presenceP ?? 1, r.valueP ?? 1);
    });
    rows.sort((a, b) => b.tier - a.tier || a.bestP - b.bestP);

    const fmt = (v, unit) => escapeHtml(formatValue(v, unit));
    const avgText = r => (r.avg ? `avg ${formatNumber(r.avg.t)} vs ${formatNumber(r.avg.o)} ${r.avg.unit}` : '');
    const targetHtml = escapeHtml(targetName);
    const focusDays = target.kind === 'feeling' ? `check-ins with ${targetHtml}` : `${targetHtml} days`;
    const otherLabel = target.kind === 'feeling' ? 'other check-ins' : 'other days';
    const findings = rows.filter(r => r.tier > 0).slice(0, 4).map(r => {
        const name = `<strong>${escapeHtml(r.sr.name)}</strong>`;
        const byPresence = r.byPresence;
        const up = byPresence ? r.presence > 0 : r.valueScore > 0;
        let text;
        if (byPresence) {
            const when = windowText === 'on' ? 'on' : windowText;
            text = r.sr.mark
                ? `${pct(r.pT)} of ${focusDays} ${windowText === 'on' ? 'fell during' : `came ${windowText.replace('the day before', 'the day after')}`} your ${name} marks, vs ${pct(r.pO)} of ${otherLabel}.`
                : r.sr.kind === 'episode'
                ? `${name} was going on ${windowText === 'on' ? 'during' : windowText} ${pct(r.pT)} of ${focusDays}, vs ${pct(r.pO)} of ${otherLabel}.`
                : r.sr.kind === 'feeling'
                    ? `You felt ${name} ${when} ${pct(r.pT)} of ${focusDays}, vs ${pct(r.pO)} of ${otherLabel}.`
                    : `${name} happened ${when} ${pct(r.pT)} of ${focusDays}, vs ${pct(r.pO)} of ${otherLabel}.`;
        } else {
            const numbers = `${fmt(r.avg.t, r.avg.unit)} vs ${fmt(r.avg.o, r.avg.unit)} on average`;
            text = r.sr.kind === 'feeling'
                ? `When you felt ${name} ${windowText} ${focusDays}, it was ${up ? 'more' : 'less'} intense: ${numbers}.`
                : r.sr.kind === 'event'
                    ? `When ${name} happened ${windowText} ${focusDays}, it was ${up ? 'higher' : 'lower'}: ${numbers}.`
                    : `${name} was ${up ? 'higher' : 'lower'} ${windowText} ${focusDays}: ${numbers}.`;
        }
        return findingItem(up ? 'up' : 'down', text, r.tier === 1);
    });
    const anyPossible = rows.some(r => r.tier === 1) && findings.length;
    const summary = findings.length
        ? `<ul class="insight-findings">${findings.join('')}</ul>`
        : `<p class="insight-summary">${icon('info')} Nothing stands out yet. Nothing looks very different ${windowText} ${focusDays}.</p>`;
    const fewDays = targetDays.length < 5 ? ` With only ${plural(targetDays.length, dayWord)} so far, treat these as early hints.` : '';

    container.innerHTML = `
        ${summary}
        <p class="insight-note">Patterns, not proof of cause. Based on ${plural(targetDays.length, target.kind === 'feeling' ? `check-in with ${targetName}` : `${targetName} day`, target.kind === 'feeling' ? `check-ins with ${targetName}` : `${targetName} days`)} and ${plural(otherDays.length, dayWord)} without.
            Each comparison only uses days where that thing was logged, so days you forgot don't count as zero.${fewDays}
            ${anyPossible ? ' "Possible" ones could still be chance: see whether they hold up as you log more.' : ''}</p>
        <div class="legend">
            <span class="legend-key"><span class="key-dot" style="background: var(--viz-primary)"></span>${target.kind === 'feeling' ? `With ${targetHtml}` : `${targetHtml} days`}</span>
            <span class="legend-key"><span class="key-dot" style="background: var(--viz-muted)"></span>${target.kind === 'feeling' ? 'Without' : 'Other days'}</span>
            <span class="legend-note">Dots: how often each happened. Amount: change in its average.</span>
        </div>
        <div class="db-axis">
            <span></span>
            <div class="db-ticks">${[0, 25, 50, 75, 100].map(v => `<span style="left: ${v}%">${v}%</span>`).join('')}</div>
            <span class="db-diff">Often</span>
            <span class="db-diff">Amount</span>
        </div>
        ${rows.map(r => {
            const presence = hasPresence(r.sr);
            const diff = Math.round((r.pT - r.pO) * 100);
            const amount = r.avg && r.avg.o ? Math.round(((r.avg.t - r.avg.o) / Math.abs(r.avg.o)) * 100) : null;
            const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
            const tip = tipAttrs({
                title: `${r.sr.name} ${windowText}…`,
                rows: [
                    ...(presence ? [
                        { color: 'var(--viz-primary)', value: pct(r.pT), label: `of ${targetName} ${dayWord}s (${r.t} of ${r.nT})` },
                        { color: 'var(--viz-muted)', value: pct(r.pO), label: `of ${otherLabel} (${r.o} of ${r.nO})` }
                    ] : []),
                    ...(r.avg ? [{ value: avgText(r), label: presence ? 'when it happened' : `${targetName} vs other` }] : [])
                ]
            });
            return `
                <div class="db-row" ${tip}>
                    <div class="db-label">${escapeHtml(r.sr.name)}${r.sr.kind === 'feeling' ? ' <span class="db-kind">feeling</span>' : r.sr.mark ? ' <span class="db-kind">your mark</span>' : ''}${r.avg ? `<span class="db-avg">${escapeHtml(avgText(r))}</span>` : ''}</div>
                    <div class="db-track${presence ? '' : ' empty'}">
                        ${presence ? `
                            <span class="db-bar" style="left: ${Math.min(r.pT, r.pO) * 100}%; width: ${Math.abs(r.pT - r.pO) * 100}%"></span>
                            <span class="db-dot" style="left: ${r.pO * 100}%; background: var(--viz-muted)"></span>
                            <span class="db-dot" style="left: ${r.pT * 100}%; background: var(--viz-primary)"></span>` : ''}
                    </div>
                    <div class="db-diff${r.presenceFound ? ' strong' : ''}" title="Difference in how often it happened, in percentage points">${presence ? `${signed(diff)} pts` : '—'}</div>
                    <div class="db-diff${r.valueFound ? ' strong' : ''}" title="Change in its average">${amount === null ? '—' : signed(amount) + '%'}</div>
                </div>
            `;
        }).join('')}
        ${tableView(
            [{ label: 'Tracker' }, { label: `With ${targetName}`, num: true }, { label: 'Without', num: true }, { label: 'Average', num: true }],
            rows.map(r => [r.sr.name, hasPresence(r.sr) ? `${pct(r.pT)} (${r.t}/${r.nT})` : '—', hasPresence(r.sr) ? `${pct(r.pO)} (${r.o}/${r.nO})` : '—', avgText(r)])
        )}
    `;
}

function findingItem(tone, text, possible) {
    const iconName = tone === 'up' || tone === 'up-good' ? 'up' : tone === 'down' ? 'down' : 'sparkles';
    return `<li class="finding ${tone}${possible ? ' possible' : ''}"><span class="finding-icon">${icon(iconName)}</span>
        <span>${possible ? '<span class="possible-tag">Possible</span> ' : ''}${text}</span></li>`;
}

// ---- Feelings ----

// Per feeling: how often it comes up in check-ins, how strong it usually is, and how
// manageable things felt when it was there. Counts are per check-in, so days without a
// check-in simply don't count.
function renderFeelings(list) {
    const checkInTrackers = trackers.filter(t => t.feelings);
    document.getElementById('feelings-card').hidden = !checkInTrackers.length;
    if (!checkInTrackers.length) return;

    const select = document.getElementById('feelings-tracker');
    fillSelect(select, checkInTrackers.map(t => ({ key: t.name, label: t.name })), { key: checkInTrackers[0].name });
    select.hidden = checkInTrackers.length < 2;
    const tracker = checkInTrackers.find(t => t.name === select.value) || checkInTrackers[0];
    const container = document.getElementById('feelings-chart');
    const checkIns = list.filter(e => e.tracker === tracker.name);
    if (checkIns.length < 3) {
        container.innerHTML = '<div class="empty-state">Do a few check-ins to see your feelings here.</div>';
        return;
    }

    const copingOf = e => {
        const v = e.values.find(x => x.field === COPING_FIELD);
        return v ? v.value : null;
    };
    const withCoping = checkIns.filter(e => copingOf(e) !== null);
    const rows = feelingNames(tracker).map(name => {
        const having = checkIns.filter(e => e.values.some(v => v.field === name));
        const intensity = mean(having.map(e => e.values.find(v => v.field === name).value));
        const copingWith = having.map(copingOf).filter(v => v !== null);
        const copingWithout = withCoping.filter(e => !having.includes(e)).map(copingOf);
        return {
            name,
            unpleasant: isUnpleasant(name),
            count: having.length,
            share: having.length / checkIns.length,
            intensity,
            coping: copingWith.length ? mean(copingWith) : null,
            copingOthers: copingWithout.length ? mean(copingWithout) : null,
            copingScore: welchT(copingWith, copingWithout)
        };
    }).filter(r => r.count).sort((a, b) => b.share - a.share);

    // Findings: the most common feelings, the feeling that goes with the lowest coping, and
    // whether coping has changed lately.
    const findings = [];
    const top = rows.slice(0, 2);
    if (top.length) {
        findings.push({
            tone: 'neutral',
            text: `You felt <strong>${escapeHtml(top[0].name)}</strong> most often (${pct(top[0].share)} of check-ins)${top[1] ? `, then <strong>${escapeHtml(top[1].name)}</strong> (${pct(top[1].share)})` : ''}.`
        });
    }
    // Many feelings are compared at once, so a feeling needs a few check-ins and has to survive
    // the correction for multiple comparisons before it's called out.
    rows.forEach(r => {
        const withIt = checkIns.filter(e => e.values.some(v => v.field === r.name)).map(copingOf).filter(v => v !== null);
        const without = withCoping.filter(e => !e.values.some(v => v.field === r.name)).map(copingOf);
        r.copingP = r.count >= 5 && withIt.length >= 3 && without.length >= 3 ? valuesP(withIt, without) : null;
    });
    const copingClear = discoveries(rows.map(r => r.copingP));
    rows.forEach(r => { r.copingTier = copingClear(r.copingP) ? 2 : r.copingP !== null && r.copingP < POSSIBLE_P ? 1 : 0; });
    const clearCoping = r => r.copingTier === 2;
    const byTier = (a, b) => b.copingTier - a.copingTier || a.copingP - b.copingP;
    const hardest = rows.filter(r => r.copingTier && r.copingScore < 0).sort(byTier)[0];
    if (hardest) {
        findings.push({ tone: 'down', possible: hardest.copingTier === 1, text: `Things felt least manageable with <strong>${escapeHtml(hardest.name)}</strong>: coping ${formatNumber(hardest.coping)} vs ${formatNumber(hardest.copingOthers)} / 5 otherwise.` });
    }
    const helps = rows.filter(r => r.copingTier && r.copingScore > 0).sort(byTier)[0];
    if (helps) {
        findings.push({ tone: 'up-good', possible: helps.copingTier === 1, text: `Coping was highest with <strong>${escapeHtml(helps.name)}</strong>: ${formatNumber(helps.coping)} vs ${formatNumber(helps.copingOthers)} / 5 otherwise.` });
    }
    const today = localDateString(new Date());
    const recent = withCoping.filter(e => e.date > addDays(today, -28)).map(copingOf);
    const before = withCoping.filter(e => e.date <= addDays(today, -28) && e.date > addDays(today, -56)).map(copingOf);
    const trendScore = welchT(recent, before);
    if (recent.length >= 5 && before.length >= 5 && normalP(tToZ(trendScore, Math.min(recent.length, before.length) - 1)) < 0.05) {
        const better = trendScore > 0;
        findings.push({
            tone: better ? 'up-good' : 'down',
            text: `Coping has been ${better ? 'better' : 'harder'} in the last 4 weeks: ${formatNumber(mean(recent))} vs ${formatNumber(mean(before))} / 5 the 4 weeks before.`
        });
    }

    const copingAvg = withCoping.length ? mean(withCoping.map(copingOf)) : null;
    const note = `${plural(checkIns.length, 'check-in')} in this time range${copingAvg !== null ? `, coping averaged ${formatNumber(copingAvg)} / 5` : ''}. Days without a check-in are left out. Patterns, not proof of cause.`;
    container.innerHTML = `
        <ul class="insight-findings">${findings.map(f => findingItem(f.tone, f.text, f.possible)).join('')}</ul>
        <p class="insight-note">${note}</p>
        <div class="legend">
            <span class="legend-key"><span class="key-swatch" style="background: var(--feel-pleasant)"></span>Pleasant</span>
            <span class="legend-key"><span class="key-swatch" style="background: var(--feel-unpleasant)"></span>Unpleasant</span>
            <span class="legend-note">Bars: share of check-ins. Strength and coping: averages when felt (out of 5).</span>
        </div>
        <div class="fe-row fe-head"><span></span><span></span><span>Strength</span><span>Coping</span></div>
        ${rows.map(r => {
            const tip = tipAttrs({
                title: r.name,
                rows: [
                    { color: r.unpleasant ? 'var(--feel-unpleasant)' : 'var(--feel-pleasant)', value: pct(r.share), label: `of check-ins (${r.count} of ${checkIns.length})` },
                    { value: `${formatNumber(r.intensity)} / 5`, label: 'average strength' },
                    ...(r.coping !== null ? [{ value: `${formatNumber(r.coping)} / 5`, label: `coping (vs ${r.copingOthers !== null ? formatNumber(r.copingOthers) : '—'} otherwise)` }] : [])
                ]
            });
            return `
                <div class="fe-row" ${tip}>
                    <span class="fe-name">${escapeHtml(r.name)}</span>
                    <span class="fe-track"><span class="fe-bar${r.unpleasant ? ' unpleasant' : ''}" style="width: ${Math.max(2, r.share * 100)}%"></span><span class="fe-pct">${pct(r.share)}</span></span>
                    <span class="fe-num">${formatNumber(r.intensity)}</span>
                    <span class="fe-num${clearCoping(r) ? ' strong' : ''}">${r.coping !== null ? formatNumber(r.coping) : '—'}</span>
                </div>
            `;
        }).join('')}
        ${tableView(
            [{ label: 'Feeling' }, { label: 'Check-ins', num: true }, { label: 'Strength', num: true }, { label: 'Coping when felt', num: true }],
            rows.map(r => [r.name, `${pct(r.share)} (${r.count})`, formatNumber(r.intensity), r.coping !== null ? formatNumber(r.coping) : '—'])
        )}
    `;
}

// ---- Through your cycle ----

// Finds the stretch of the cycle (3, 5 or 7 days) that stands out most, and checks it isn't chance.
//  - Weekly routines: a ~28-day cycle is about four weeks, so each cycle day tends to land on the
//    same weekday. Each day is therefore measured against the usual level for its weekday first,
//    so weekly patterns (like work) can't pose as cycle patterns.
//  - Chance: with ~90 stretches to choose from, one will look unusual by luck. So the scan is
//    repeated with each cycle's days shifted by a random amount, and the stretch only counts if it
//    beats 95% of those shuffles.
// For "how often" only peaks count; for averages, highs or lows.
const STRETCH_WIDTHS = [3, 5, 7]; // days

// `points` are the days with a value: { date, day (of the cycle), v }.
function findCycleStretch(points, mode, length, cycleName) {
    const starts = episodesOf(cycleName).map(episodeFirstDay);
    const raw = points
        .filter(o => o.day <= length)
        .map(o => ({ ...o, cycle: addDays(o.date, -(o.day - 1)) }));
    if (raw.length < 12) return null;

    const byWeekday = new Map();
    raw.forEach(o => {
        const w = parseLocalDate(o.date).getDay();
        if (!byWeekday.has(w)) byWeekday.set(w, []);
        byWeekday.get(w).push(o.v);
    });
    const obs = raw.map(o => ({ ...o, r: o.v - mean(byWeekday.get(parseLocalDate(o.date).getDay())) }));

    // Each cycle's length: until the next start, or as far as it's been observed.
    const cycleLength = new Map();
    obs.forEach(o => {
        const next = starts.find(s => s > o.cycle);
        cycleLength.set(o.cycle, Math.max(cycleLength.get(o.cycle) || 0, next ? daysBetween(o.cycle, next) : 0, o.day));
    });
    const cycles = [...cycleLength.keys()];

    // Best stretch (by a t-like score on the weekday-adjusted values) for one assignment of
    // cycle days to observations.
    const scan = dayOf => {
        const sum = new Array(length + 2).fill(0);
        const sumSq = new Array(length + 2).fill(0);
        const count = new Array(length + 2).fill(0);
        obs.forEach(o => {
            const d = dayOf(o);
            if (d > length) return;
            sum[d] += o.r;
            sumSq[d] += o.r * o.r;
            count[d] += 1;
        });
        const S = sum.reduce((a, b) => a + b, 0);
        const Q = sumSq.reduce((a, b) => a + b, 0);
        const N = count.reduce((a, b) => a + b, 0);
        let best = null;
        for (const width of STRETCH_WIDTHS) for (let start = 1; start + width - 1 <= length; start++) {
            let s1 = 0;
            let q1 = 0;
            let n1 = 0;
            for (let d = start; d < start + width; d++) {
                s1 += sum[d];
                q1 += sumSq[d];
                n1 += count[d];
            }
            const n2 = N - n1;
            if (n1 < 4 || n2 < 4) continue;
            const m1 = s1 / n1;
            const m2 = (S - s1) / n2;
            // Pooled variance, so a stretch where every value happens to match can't inflate
            // the score by looking perfectly consistent.
            const pooled = Math.max(0, (q1 - n1 * m1 * m1) + (Q - q1 - n2 * m2 * m2)) / (n1 + n2 - 2);
            const t = (m1 - m2) / Math.sqrt(pooled * (1 / n1 + 1 / n2) + 1e-6);
            const score = mode === 'freq' ? t : Math.abs(t);
            if (!best || score > best.score) best = { start, end: start + width - 1, score };
        }
        return best;
    };

    const observed = scan(o => o.day);
    if (!observed || observed.score <= 0) return null;

    // Seeded, so the answer doesn't flicker between renders.
    let seed = 20260926;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    const SHUFFLES = 200;
    let asExtreme = 0;
    for (let k = 0; k < SHUFFLES; k++) {
        const shift = new Map(cycles.map(c => [c, Math.floor(rand() * cycleLength.get(c))]));
        const shuffled = scan(o => ((o.day - 1 + shift.get(o.cycle)) % cycleLength.get(o.cycle)) + 1);
        if (shuffled && shuffled.score >= observed.score) asExtreme++;
    }
    const p = (asExtreme + 1) / (SHUFFLES + 1);
    if (p > 0.05) return null;

    // Report the plain (unadjusted) numbers for the stretch.
    const inside = raw.filter(o => o.day >= observed.start && o.day <= observed.end).map(o => o.v);
    const outside = raw.filter(o => o.day < observed.start || o.day > observed.end).map(o => o.v);
    return { start: observed.start, end: observed.end, score: observed.score, p, a: mean(inside), b: mean(outside) };
}

// How often something happens (or its average) on each day of the cycle, and the stretch
// that stands out most from the rest of the cycle, if it's clear enough to call out.
function renderCycle(list, metrics) {
    const cycles = cycleTrackers();
    document.getElementById('cycle-card').hidden = !cycles.length;
    if (!cycles.length) return;

    const cycleSelect = document.getElementById('cycle-tracker');
    fillSelect(cycleSelect, cycles.map(t => ({ key: t.name, label: `${t.name} cycle` })), { key: cycles[0].name });
    cycleSelect.hidden = cycles.length < 2;
    const cycleTracker = cycles.find(t => t.name === cycleSelect.value) || cycles[0];
    const cal = cycleCalendar(cycleTracker.name);

    const options = metrics.filter(m => m.tracker.name !== cal.name);
    const metricSelect = document.getElementById('cycle-metric');
    fillSelect(metricSelect, options, options.find(m => /headache|cramp/i.test(m.tracker.name)) || options[0]);
    const metric = options.find(m => m.key === metricSelect.value);
    // "How often" only makes sense for things that happen on some days, not everyday amounts.
    const modeSelect = document.getElementById('cycle-mode');
    const canCount = metric && hasPresence(metric);
    modeSelect.querySelector('option[value="freq"]').disabled = !canCount;
    if (!canCount) modeSelect.value = 'avg';
    const mode = modeSelect.value;
    const container = document.getElementById('cycle-chart');
    if (!metric) {
        container.innerHTML = '<div class="empty-state">Add another tracker to see how it changes through your cycle.</div>';
        return;
    }

    // Days where this is known and the cycle day is known. How often: did it happen (1/0).
    // Average: its amount (for events and feelings, only when it happened).
    const points = [...metric.values.keys()]
        .map(date => ({ date, day: cal.dayOf(date) }))
        .filter(d => d.day)
        .map(d => ({ ...d, v: mode === 'freq' ? (metric.values.get(d.date) > 0 ? 1 : 0) : amountOn(metric, d.date) }))
        .filter(d => d.v !== null);
    const cycleCount = new Set(points.map(d => addDays(d.date, -(d.day - 1)))).size;
    if (points.length < 10) {
        container.innerHTML = `<div class="empty-state">Log when your ${escapeHtml(cal.name.toLowerCase())} starts, plus a few weeks of ${escapeHtml(metric.name)}, to see patterns through your cycle.</div>`;
        return;
    }

    const length = Math.min(40, Math.max(...points.map(d => d.day)));
    const perDay = Array.from({ length }, (_, i) => {
        const matching = points.filter(d => d.day === i + 1);
        return { day: i + 1, n: matching.length, hits: matching.filter(d => d.v > 0).length, values: matching.map(d => d.v) };
    });
    const found = findCycleStretch(points, mode, length, cal.name);
    const barValue = p => (mode === 'freq' ? (p.n ? p.hits / p.n : 0) : p.values.length ? mean(p.values) : 0);
    const name = escapeHtml(metric.name);
    const unit = metric.field.unit;
    const range = found ? `cycle days ${found.start}–${found.end}` : '';
    let summary;
    if (!found) {
        summary = `<p class="insight-summary">${icon('info')} No clear pattern through the cycle yet for ${name}.</p>`;
    } else {
        const up = found.a > found.b;
        const text = mode === 'freq'
            ? `<strong>${name}</strong> is ${up ? 'most' : 'least'} common around ${range}: ${pct(found.a)} of those days vs ${pct(found.b)} of other days.`
            : `<strong>${escapeHtml(metric.label)}</strong> is ${up ? 'highest' : 'lowest'} around ${range}: ${escapeHtml(formatValue(found.a, unit))} vs ${escapeHtml(formatValue(found.b, unit))} on average.`;
        summary = `<ul class="insight-findings"><li class="finding ${up ? 'up' : 'down'}"><span class="finding-icon">${icon(up ? 'up' : 'down')}</span><span>${text}</span></li></ul>`;
    }
    const note = `Based on ${plural(cycleCount, 'cycle')} and ${plural(points.length, 'day')} where ${metric.name} was logged.` +
        `${cycleCount < 3 ? ' A few more cycles will make this more reliable.' : ''} Patterns, not proof of cause.`;

    // Chart: one column per cycle day, typical period days shaded behind.
    const width = container.clientWidth || 600;
    const height = 230;
    const m = { top: 22, right: 8, bottom: 30, left: 44 };
    const plotW = width - m.left - m.right;
    const plotH = height - m.top - m.bottom;
    const values = perDay.map(barValue);
    const scale = niceScale(Math.max(...values), 4);
    const y = v => m.top + plotH - (v / scale.max) * plotH;
    const band = plotW / length;
    const barW = Math.max(3, Math.min(16, band * 0.7));
    const periodDays = Math.min(length, cal.periodLength);
    const periodColor = categoryColor(cycleTracker.category);

    const grid = scale.ticks.map(t => `
        <line x1="${m.left}" x2="${width - m.right}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'}" />
        <text x="${m.left - 8}" y="${y(t) + 4}" text-anchor="end">${mode === 'freq' ? pct(t) : formatNumber(t)}</text>
    `).join('');
    const periodBand = `
        <rect x="${m.left}" y="${m.top}" width="${band * periodDays}" height="${plotH}" fill="${periodColor}" fill-opacity="0.1" />
        <text class="axis-title" x="${m.left + 4}" y="${m.top - 8}">${escapeHtml(cal.name)}</text>
    `;
    const columns = perDay.map((p, i) => {
        const value = values[i];
        const cx = m.left + band * i + band / 2;
        const h = Math.max(0, y(0) - y(value));
        const r = Math.min(3, h / 2, barW / 2);
        const x0 = cx - barW / 2;
        const x1 = cx + barW / 2;
        const top = y(0) - h;
        const path = h > 0
            ? `M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${y(0)} Z`
            : '';
        const highlighted = !found || (p.day >= found.start && p.day <= found.end);
        const tip = tipAttrs({
            title: `Cycle day ${p.day}${p.day <= periodDays ? ` (usually ${cal.name.toLowerCase()})` : ''}`,
            rows: [mode === 'freq'
                ? { color: 'var(--viz-primary)', value: pct(value), label: `of days (${p.hits} of ${p.n})` }
                : { color: 'var(--viz-primary)', value: p.values.length ? formatValue(value, unit) : '—', label: `average over ${plural(p.values.length, 'day')}` }]
        });
        const label = [1, 7, 14, 21, 28, 35].includes(p.day)
            ? `<text x="${cx}" y="${height - 10}" text-anchor="middle">${p.day}</text>`
            : '';
        return `
            <g class="bar" ${tip}>
                <rect x="${m.left + band * i}" y="${m.top}" width="${band}" height="${plotH}" fill="transparent" />
                ${path ? `<path d="${path}" fill="${highlighted ? 'var(--viz-primary)' : 'var(--viz-muted)'}" />` : ''}
                ${label}
            </g>
        `;
    }).join('');

    container.innerHTML = `
        ${summary}
        <p class="insight-note">${note}</p>
        <svg class="chart-svg" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(metric.label)} by cycle day">
            ${periodBand}${grid}${columns}
            <text class="axis-title" x="${width - m.right}" y="${m.top - 8}" text-anchor="end">by cycle day →</text>
        </svg>
        ${tableView(
            [{ label: 'Cycle day' }, { label: mode === 'freq' ? 'How often' : 'Average', num: true }, { label: 'Based on', num: true }],
            perDay.map((p, i) => [String(p.day), mode === 'freq' ? pct(values[i]) : p.values.length ? formatValue(values[i], unit) : '—', plural(p.n, 'day')])
        )}
    `;
}

function renderDayOfWeek(list, range, metric) {
    const container = document.getElementById('dow-chart');
    if (!metric) {
        container.innerHTML = '<div class="empty-state">Add a tracker to see weekly patterns.</div>';
        return;
    }
    // "How often" only makes sense for things that happen on some days, not everyday amounts.
    const modeSelect = document.getElementById('dow-mode');
    modeSelect.querySelector('option[value="freq"]').disabled = !hasPresence(metric);
    if (!hasPresence(metric) && modeSelect.value === 'freq') modeSelect.value = 'avg';
    const mode = modeSelect.value;
    const weekdayOf = date => (parseLocalDate(date).getDay() + 6) % 7; // Monday = 0

    // Only days where this is known count, so forgotten days don't drag the numbers down.
    const known = WEEKDAYS.map(() => []);
    metric.values.forEach((value, date) => known[weekdayOf(date)].push(date));

    const unit = metric.field.unit;
    const bars = WEEKDAYS.map((day, i) => {
        const dates = known[i];
        if (mode === 'freq') {
            const hits = dates.filter(d => metric.values.get(d) > 0).length;
            const value = dates.length ? hits / dates.length : 0;
            return { day, value, text: pct(value), detail: `${hits} of ${dates.length} ${day}s logged` };
        }
        const amounts = dates.map(d => (mode === 'total' ? metric.values.get(d) : amountOn(metric, d))).filter(v => v !== null);
        const value = mode === 'total' ? amounts.reduce((a, b) => a + b, 0) : (mean(amounts) || 0);
        return { day, value, text: formatValue(value, unit), detail: plural(amounts.length, 'day') };
    });

    if (!metric.values.size) {
        container.innerHTML = `<div class="empty-state">No ${escapeHtml(metric.label)} entries in this time range.</div>`;
        return;
    }

    const width = container.clientWidth || 600;
    const height = 220;
    const m = { top: 16, right: 8, bottom: 28, left: 44 };
    const plotW = width - m.left - m.right;
    const plotH = height - m.top - m.bottom;
    const scale = mode === 'freq' ? { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] } : niceScale(Math.max(...bars.map(b => b.value)));
    const y = v => m.top + plotH - (v / scale.max) * plotH;
    const band = plotW / 7;
    const barW = Math.min(24, band * 0.6);
    const maxIndex = bars.reduce((best, b, i) => (b.value > bars[best].value ? i : best), 0);

    const grid = scale.ticks.map(t => `
        <line x1="${m.left}" x2="${width - m.right}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'}" stroke-width="1" />
        <text x="${m.left - 8}" y="${y(t) + 4}" text-anchor="end">${mode === 'freq' ? pct(t) : formatNumber(t)}</text>
    `).join('');

    const columns = bars.map((b, i) => {
        const cx = m.left + band * i + band / 2;
        const h = Math.max(0, y(0) - y(b.value));
        const r = Math.min(4, h / 2, barW / 2);
        const x0 = cx - barW / 2;
        const x1 = cx + barW / 2;
        const top = y(0) - h;
        // Rounded data-end, square at the baseline.
        const path = h > 0
            ? `M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${y(0)} Z`
            : '';
        const tip = tipAttrs({ title: b.day, rows: [{ color: 'var(--viz-primary)', value: b.text, label: b.detail }] });
        return `
            <g class="bar" ${tip}>
                <rect x="${m.left + band * i}" y="${m.top}" width="${band}" height="${plotH}" fill="transparent" />
                ${path ? `<path d="${path}" fill="var(--viz-primary)" />` : ''}
                ${i === maxIndex && b.value > 0 ? `<text x="${cx}" y="${top - 6}" text-anchor="middle" class="value-label-text">${escapeHtml(b.text)}</text>` : ''}
                <text x="${cx}" y="${height - 8}" text-anchor="middle">${b.day}</text>
            </g>
        `;
    }).join('');

    container.innerHTML = `
        <svg class="chart-svg" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(metric.label)} by day of week">${grid}${columns}</svg>
        ${tableView([{ label: 'Day' }, { label: 'Value', num: true }, { label: 'Based on', num: true }], bars.map(b => [b.day, b.text, b.detail]))}
    `;
}

function correlation(points) {
    const n = points.length;
    const mx = mean(points.map(p => p.x));
    const my = mean(points.map(p => p.y));
    let sxy = 0, sxx = 0, syy = 0;
    points.forEach(p => {
        sxy += (p.x - mx) * (p.y - my);
        sxx += (p.x - mx) ** 2;
        syy += (p.y - my) ** 2;
    });
    return n > 2 && sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

function describeCorrelation(r, xLabel, yLabel) {
    const strength = Math.abs(r);
    if (strength < 0.1) return `No clear link between ${xLabel} and ${yLabel} so far.`;
    const word = strength < 0.3 ? 'weak' : strength < 0.5 ? 'moderate' : 'strong';
    return `A ${word} ${r > 0 ? 'positive' : 'negative'} link: on days with more ${xLabel}, ${yLabel} tends to be ${r > 0 ? 'higher' : 'lower'}.`;
}

function renderScatter(list, xMetric, yMetric) {
    const container = document.getElementById('scatter-chart');
    if (!xMetric || !yMetric || xMetric.key === yMetric.key) {
        container.innerHTML = `<div class="empty-state">${insightSeries.length < 2 ? 'You need at least two trackers to compare.' : 'Pick two different trackers to compare.'}</div>`;
        return;
    }

    const xs = xMetric.values;
    const ys = yMetric.values;
    const points = [...xs.keys()].filter(d => ys.has(d)).sort().map(date => ({ date, x: xs.get(date), y: ys.get(date) }));
    if (points.length < 3) {
        container.innerHTML = `<div class="empty-state">Log both on at least 3 days to compare them (${plural(points.length, 'day')} so far).</div>`;
        return;
    }

    const r = correlation(points);
    const width = container.clientWidth || 600;
    const height = 300;
    const m = { top: 24, right: 16, bottom: 44, left: 48 };
    const plotW = width - m.left - m.right;
    const plotH = height - m.top - m.bottom;
    // Axes start near the data rather than at zero, so the pattern fills the chart.
    const sx = niceScale(Math.max(...points.map(p => p.x)), 5, Math.min(...points.map(p => p.x)));
    const sy = niceScale(Math.max(...points.map(p => p.y)), 4, Math.min(...points.map(p => p.y)));
    const inset = 12; // keeps dots on the edge values from sitting on the axes
    const x = v => m.left + inset + ((v - sx.min) / (sx.max - sx.min)) * (plotW - inset * 2);
    const y = v => m.top + plotH - inset - ((v - sy.min) / (sy.max - sy.min)) * (plotH - inset * 2);

    // Days with identical values share one dot, sized by how many days it stands for.
    const groups = new Map();
    points.forEach(p => {
        const key = `${p.x}|${p.y}`;
        if (!groups.has(key)) groups.set(key, { x: p.x, y: p.y, dates: [] });
        groups.get(key).dates.push(p.date);
    });
    const merged = [...groups.values()];
    const anyMerged = merged.some(g => g.dates.length > 1);

    const grid = sy.ticks.map((t, i) => `
        <line x1="${m.left}" x2="${width - m.right}" y1="${y(t)}" y2="${y(t)}" stroke="${i === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'}" />
        <text x="${m.left - 8}" y="${y(t) + 4}" text-anchor="end">${formatNumber(t)}</text>
    `).join('') + sx.ticks.map(t => `
        <text x="${x(t)}" y="${m.top + plotH + 16}" text-anchor="middle">${formatNumber(t)}</text>
    `).join('');

    const shortDate = d => parseLocalDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dots = merged.map(g => {
        const n = g.dates.length;
        const radius = 5 + 2.5 * Math.sqrt(n - 1);
        const tip = tipAttrs({
            title: n === 1 ? shortDate(g.dates[0]) : `${n} days (${g.dates.slice(-3).map(shortDate).join(', ')}${n > 3 ? '…' : ''})`,
            rows: [
                { value: formatValue(g.x, xMetric.field.unit), label: xMetric.name },
                { value: formatValue(g.y, yMetric.field.unit), label: yMetric.name }
            ]
        });
        return `
            <g class="dot" ${tip}>
                <circle cx="${x(g.x)}" cy="${y(g.y)}" r="${Math.max(12, radius + 4)}" fill="transparent" />
                <circle cx="${x(g.x)}" cy="${y(g.y)}" r="${radius}" fill="var(--viz-primary)" fill-opacity="0.85" stroke="var(--surface)" stroke-width="2" />
            </g>
        `;
    }).join('');

    container.innerHTML = `
        <p class="insight-summary">${r === null ? 'Not enough variation to measure a link yet.' : escapeHtml(describeCorrelation(r, xMetric.label, yMetric.label))}</p>
        <p class="insight-note">${r === null ? '' : `Correlation r = ${r.toFixed(2)} (−1 to 1). `}Based on ${plural(points.length, 'day')} where both were logged.${anyMerged ? ' Bigger dots stand for several days with the same values.' : ''} Patterns, not proof of cause.</p>
        <svg class="chart-svg" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(xMetric.label)} versus ${escapeHtml(yMetric.label)}">
            <text class="axis-title" x="${m.left}" y="${m.top - 10}">${escapeHtml(yMetric.label)} ↑</text>
            <text class="axis-title" x="${width - m.right}" y="${height - 6}" text-anchor="end">${escapeHtml(xMetric.label)} →</text>
            ${grid}${dots}
        </svg>
        ${tableView(
            [{ label: 'Date' }, { label: xMetric.label, num: true }, { label: yMetric.label, num: true }],
            points.map(p => [p.date, formatNumber(p.x), formatNumber(p.y)])
        )}
    `;
}

function renderTrend(list, range, metric) {
    const container = document.getElementById('trend-chart');
    if (!metric) {
        container.innerHTML = '<div class="empty-state">Add a tracker to see trends.</div>';
        return;
    }
    const points = [...metric.values.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
    if (!points.length) {
        container.innerHTML = `<div class="empty-state">No ${escapeHtml(metric.label)} entries in this time range.</div>`;
        return;
    }

    const unit = metric.field.unit;
    const values = points.map(p => p.value);
    // Average of the logged days in the 7 days ending on each point.
    points.forEach(p => {
        const from = addDays(p.date, -6);
        p.avg = mean(points.filter(q => q.date >= from && q.date <= p.date).map(q => q.value));
    });
    const stats = [
        { label: 'Average per day', value: formatValue(mean(values), unit) },
        { label: 'Days with data', value: String(points.length) },
        { label: 'Total', value: `${formatNumber(values.reduce((a, b) => a + b, 0))} ${unit}` }
    ];

    const width = container.clientWidth || 600;
    const height = 240;
    const m = { top: 16, right: 16, bottom: 28, left: 48 };
    const plotW = width - m.left - m.right;
    const plotH = height - m.top - m.bottom;
    const totalDays = Math.max(1, daysBetween(range.start, range.end));
    const sy = niceScale(Math.max(...values));
    const x = date => m.left + (daysBetween(range.start, date) / totalDays) * plotW;
    const y = v => m.top + plotH - (Math.max(0, v) / sy.max) * plotH;

    const grid = sy.ticks.map(t => `
        <line x1="${m.left}" x2="${width - m.right}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'}" />
        <text x="${m.left - 8}" y="${y(t) + 4}" text-anchor="end">${formatNumber(t)}</text>
    `).join('');
    const tickCount = Math.max(2, Math.min(6, Math.floor(plotW / 90)));
    const xTicks = Array.from({ length: tickCount }, (_, i) => addDays(range.start, Math.round((totalDays * i) / (tickCount - 1))));
    const xLabels = xTicks.map((d, i) => `
        <text x="${x(d)}" y="${height - 8}" text-anchor="${i === 0 ? 'start' : i === tickCount - 1 ? 'end' : 'middle'}">${parseLocalDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>
    `).join('');
    const linePath = key => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p[key])}`).join(' ');
    const last = points[points.length - 1];

    container.innerHTML = `
        <div class="mini-stats">${stats.map(s => `<div><div class="mini-stat-label">${s.label}</div><div class="mini-stat-value">${escapeHtml(s.value)}</div></div>`).join('')}</div>
        <div class="legend">
            <span class="legend-key"><span class="key-line" style="background: var(--viz-primary)"></span>7-day average</span>
            <span class="legend-key"><span class="key-line" style="background: var(--viz-muted)"></span>Daily</span>
        </div>
        <svg class="chart-svg" id="trend-svg" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(metric.label)} over time">
            ${grid}${xLabels}
            <path d="${linePath('value')}" fill="none" stroke="var(--viz-muted)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.7" />
            <path d="${linePath('avg')}" fill="none" stroke="var(--viz-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            <circle cx="${x(last.date)}" cy="${y(last.avg)}" r="4" fill="var(--viz-primary)" stroke="var(--surface)" stroke-width="2" />
            <line id="trend-crosshair" y1="${m.top}" y2="${m.top + plotH}" stroke="var(--viz-axis)" visibility="hidden" />
            <circle id="trend-hover-dot" r="5" fill="var(--viz-primary)" stroke="var(--surface)" stroke-width="2" visibility="hidden" />
            <rect id="trend-overlay" x="${m.left}" y="${m.top}" width="${plotW}" height="${plotH}" fill="transparent" />
        </svg>
        ${tableView([{ label: 'Date' }, { label: metric.label, num: true }, { label: '7-day average', num: true }], [...points].reverse().map(p => [p.date, formatNumber(p.value), formatNumber(p.avg)]))}
    `;

    // Crosshair snaps to the nearest logged day so you don't have to land on the line.
    const svg = document.getElementById('trend-svg');
    const overlay = document.getElementById('trend-overlay');
    const crosshair = document.getElementById('trend-crosshair');
    const hoverDot = document.getElementById('trend-hover-dot');
    // On touch screens, dragging a finger across the chart scrubs through the days.
    overlay.style.touchAction = 'pan-y';
    const scrub = event => {
        const px = event.clientX - svg.getBoundingClientRect().left;
        const nearest = points.reduce((best, p) => (Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px) ? p : best));
        crosshair.setAttribute('x1', x(nearest.date));
        crosshair.setAttribute('x2', x(nearest.date));
        crosshair.setAttribute('visibility', 'visible');
        hoverDot.setAttribute('cx', x(nearest.date));
        hoverDot.setAttribute('cy', y(nearest.avg));
        hoverDot.setAttribute('visibility', 'visible');
        showTipAt({
            title: parseLocalDate(nearest.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
            rows: [
                { color: 'var(--viz-primary)', value: `${formatNumber(nearest.avg)} ${unit}`.trim(), label: '7-day average' },
                { color: 'var(--viz-muted)', value: `${formatNumber(nearest.value)} ${unit}`.trim(), label: 'that day' }
            ]
        }, event.clientX, event.clientY);
    };
    overlay.addEventListener('pointermove', scrub);
    overlay.addEventListener('pointerdown', scrub);
    overlay.addEventListener('pointerleave', event => {
        if (event.pointerType !== 'mouse') return; // keep the readout after lifting a finger
        crosshair.setAttribute('visibility', 'hidden');
        hoverDot.setAttribute('visibility', 'hidden');
        hideTip();
    });
}

// Tooltip content is built with textContent, since tracker names come from the sheet.
function showTipAt(tip, clientX, clientY) {
    const box = document.getElementById('chart-tooltip');
    box.replaceChildren();
    const title = document.createElement('div');
    title.className = 'tip-title';
    title.textContent = tip.title;
    box.append(title);
    tip.rows.forEach(r => {
        const row = document.createElement('div');
        row.className = 'tip-row';
        if (r.color) {
            const key = document.createElement('span');
            key.className = 'tip-key';
            key.style.background = r.color;
            row.append(key);
        }
        const value = document.createElement('strong');
        value.textContent = r.value;
        const label = document.createElement('span');
        label.textContent = r.label;
        row.append(value, label);
        box.append(row);
    });
    box.hidden = false;
    const left = Math.min(clientX + 14, window.innerWidth - box.offsetWidth - 8);
    const top = clientY + 14 + box.offsetHeight > window.innerHeight ? clientY - box.offsetHeight - 10 : clientY + 14;
    box.style.left = Math.max(8, left) + 'px';
    box.style.top = Math.max(8, top) + 'px';
}

function hideTip() {
    document.getElementById('chart-tooltip').hidden = true;
}

(function setUpChartTooltips() {
    const insights = document.getElementById('insights');
    insights.addEventListener('pointermove', event => {
        const el = event.target.closest('[data-tip]');
        if (el) showTipAt(chartTips[el.dataset.tip], event.clientX, event.clientY);
        else if (event.target.id !== 'trend-overlay') hideTip();
    });
    insights.addEventListener('pointerleave', hideTip);
    insights.addEventListener('focusin', event => {
        const el = event.target.closest('[data-tip]');
        if (!el) return;
        const rect = el.getBoundingClientRect();
        showTipAt(chartTips[el.dataset.tip], rect.left + rect.width / 2, rect.bottom);
    });
    insights.addEventListener('focusout', hideTip);
    // Phones have no hover: tapping a bar, dot or row shows its details instead.
    insights.addEventListener('click', event => {
        const el = event.target.closest('[data-tip]');
        if (!el) return;
        const rect = el.getBoundingClientRect();
        showTipAt(chartTips[el.dataset.tip], event.clientX || rect.left + rect.width / 2, event.clientY || rect.bottom);
    });
    window.addEventListener('scroll', hideTip, { passive: true });
    document.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse' && !event.target.closest('[data-tip], #trend-overlay')) hideTip();
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderInsights, 150);
    });
})();
