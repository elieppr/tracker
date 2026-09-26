// Insights tab: associations, day-of-week, scatter and trend charts.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let chartTips = [];

// Every numeric value a tracker records, e.g. "Morning Run — Distance (km)".
function metricOptions() {
    return trackers.flatMap(t => t.fields.map((f, i) => ({
        key: JSON.stringify([t.name, i]),
        tracker: t,
        field: f,
        label: t.fields.length > 1 ? `${t.name} — ${fieldLabel(f)}` : `${t.name}${f.unit ? ` (${f.unit})` : ''}`
    })));
}

// date -> summed value for one metric. Single-value trackers match every value, so
// entries logged before a field was renamed still count.
function dailyValues(metric, list) {
    const map = new Map();
    list.forEach(e => {
        if (e.tracker !== metric.tracker.name) return;
        e.values.forEach(v => {
            if (metric.tracker.fields.length > 1 && v.field !== metric.field.name) return;
            map.set(e.date, (map.get(e.date) || 0) + v.value);
        });
    });
    return map;
}

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

function pct(p) {
    return Math.round(p * 100) + '%';
}

function insightRange() {
    const today = localDateString(new Date());
    const value = document.getElementById('insight-range').value;
    if (value === 'all') {
        return { start: entries.length ? entries[entries.length - 1].date : today, end: today };
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

    const range = insightRange();
    const list = entries.filter(e => e.date >= range.start && e.date <= range.end);
    const metrics = metricOptions();
    const byName = pattern => metrics.find(m => pattern.test(m.tracker.name));

    const targetOptions = trackers.map(t => ({ key: t.name, label: t.name }));
    fillSelect(document.getElementById('assoc-target'), targetOptions, targetOptions.find(o => /headache/i.test(o.key)));
    fillSelect(document.getElementById('dow-metric'), metrics, byName(/water/i));
    fillSelect(document.getElementById('scatter-x'), metrics, byName(/water/i) || metrics[0]);
    fillSelect(document.getElementById('scatter-y'), metrics, byName(/work/i) || metrics[1]);
    fillSelect(document.getElementById('trend-metric'), metrics, byName(/water/i));

    const metricFor = id => metrics.find(m => m.key === document.getElementById(id).value);

    renderAssociations(list);
    renderDayOfWeek(list, range, metricFor('dow-metric'));
    renderScatter(list, metricFor('scatter-x'), metricFor('scatter-y'));
    renderTrend(list, range, metricFor('trend-metric'));
}

function renderAssociations(list) {
    const container = document.getElementById('assoc-chart');
    const target = document.getElementById('assoc-target').value;
    const [minLag, maxLag] = document.getElementById('assoc-window').value.split(',').map(Number);
    const windowText = { '0,0': 'on', '1,1': 'the day before', '0,1': 'on or the day before' }[`${minLag},${maxLag}`];

    // Only days you logged something count, so untracked days don't skew "other days".
    const activeDays = [...new Set(list.map(e => e.date))];
    const targetDays = activeDays.filter(d => list.some(e => e.date === d && e.tracker === target));
    const otherDays = activeDays.filter(d => !targetDays.includes(d));

    if (!target || !targetDays.length || !otherDays.length) {
        container.innerHTML = `<div class="empty-state">${target
            ? `Log ${escapeHtml(target)} on a few days (and other trackers on days without it) to see what goes with it.`
            : 'Add a tracker to get started.'}</div>`;
        return;
    }

    // Look back across all entries so a "day before" window can reach past the range start.
    const loggedOn = new Map();
    entries.forEach(e => {
        if (!loggedOn.has(e.tracker)) loggedOn.set(e.tracker, new Set());
        loggedOn.get(e.tracker).add(e.date);
    });
    const windowDays = day => {
        const days = [];
        for (let lag = minLag; lag <= maxLag; lag++) days.push(addDays(day, -lag));
        return days;
    };

    const rows = [...loggedOn.keys()].filter(name => name !== target && list.some(e => e.tracker === name)).map(name => {
        const dates = loggedOn.get(name);
        const exposed = day => windowDays(day).some(d => dates.has(d));
        const t = targetDays.filter(exposed).length;
        const o = otherDays.filter(exposed).length;

        // Average of the tracker's first value around each kind of day, when it was logged.
        const tracker = trackers.find(x => x.name === name);
        let avg = null;
        if (tracker) {
            const daily = dailyValues({ tracker, field: tracker.fields[0] }, entries);
            const around = days => days
                .map(day => mean(windowDays(day).filter(d => daily.has(d)).map(d => daily.get(d))))
                .filter(v => v !== null);
            const valuesT = around(targetDays);
            const valuesO = around(otherDays);
            if (valuesT.length && valuesO.length) {
                avg = { t: mean(valuesT), o: mean(valuesO), unit: tracker.fields[0].unit, score: welchT(valuesT, valuesO) };
            }
        }
        const presence = t / targetDays.length - o / otherDays.length;
        const presenceScore = proportionZ(t, targetDays.length, o, otherDays.length);
        return { name, t, o, pT: t / targetDays.length, pO: o / otherDays.length, avg, presence, presenceScore, valueScore: avg ? avg.score : 0 };
    });

    if (!rows.length) {
        container.innerHTML = '<div class="empty-state">Log some other trackers too, so there is something to compare.</div>';
        return;
    }

    // Most convincing pattern first, whichever direction: showing up more/less often, or higher/lower
    // amounts. Scores are test statistics, so a big difference from only a few days counts for less.
    const strength = r => Math.max(Math.abs(r.presenceScore), Math.abs(r.valueScore));
    rows.sort((a, b) => strength(b) - strength(a));

    const avgText = r => r.avg ? `avg ${formatNumber(r.avg.t)} vs ${formatNumber(r.avg.o)} ${r.avg.unit}` : '';
    const targetHtml = escapeHtml(target);
    const findings = rows.filter(r => strength(r) >= CLEAR_PATTERN).slice(0, 3).map(r => {
        const name = `<strong>${escapeHtml(r.name)}</strong>`;
        const byPresence = Math.abs(r.presenceScore) >= Math.abs(r.valueScore);
        const up = byPresence ? r.presence > 0 : r.valueScore > 0;
        const text = byPresence
            ? `${name} was logged ${up ? 'more' : 'less'} often ${windowText} ${targetHtml} days: ${pct(r.pT)} vs ${pct(r.pO)} of other days.`
            : `${name} was ${up ? 'higher' : 'lower'} ${windowText} ${targetHtml} days: ${formatNumber(r.avg.t)} vs ${formatNumber(r.avg.o)} ${escapeHtml(r.avg.unit)} on average.`;
        return `<li class="finding ${up ? 'up' : 'down'}"><span class="finding-icon">${icon(up ? 'up' : 'down')}</span><span>${text}</span></li>`;
    });
    const summary = findings.length
        ? `<ul class="insight-findings">${findings.join('')}</ul>`
        : `<p class="insight-summary">${icon('info')} Nothing stands out yet. No tracker looks very different ${windowText} ${targetHtml} days.</p>`;
    const fewDays = targetDays.length < 5 ? ` With only ${plural(targetDays.length, 'day')} of ${targetHtml} so far, treat these as early hints.` : '';

    container.innerHTML = `
        ${summary}
        <p class="insight-note">Patterns, not proof of cause. Based on ${plural(targetDays.length, `${target} day`)} and ${plural(otherDays.length, 'other day')} with entries.${fewDays}</p>
        <div class="legend">
            <span class="legend-key"><span class="key-dot" style="background: var(--viz-primary)"></span>${escapeHtml(target)} days</span>
            <span class="legend-key"><span class="key-dot" style="background: var(--viz-muted)"></span>Other days</span>
            <span class="legend-note">Dots: how often each was logged. Amount: change in its average value.</span>
        </div>
        <div class="db-axis">
            <span></span>
            <div class="db-ticks">${[0, 25, 50, 75, 100].map(v => `<span style="left: ${v}%">${v}%</span>`).join('')}</div>
            <span class="db-diff">Often</span>
            <span class="db-diff">Amount</span>
        </div>
        ${rows.map(r => {
            const diff = Math.round((r.pT - r.pO) * 100);
            const amount = r.avg && r.avg.o ? Math.round(((r.avg.t - r.avg.o) / Math.abs(r.avg.o)) * 100) : null;
            const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
            const tip = tipAttrs({
                title: `${r.name}, logged ${windowText}…`,
                rows: [
                    { color: 'var(--viz-primary)', value: pct(r.pT), label: `of ${target} days (${r.t} of ${targetDays.length})` },
                    { color: 'var(--viz-muted)', value: pct(r.pO), label: `of other days (${r.o} of ${otherDays.length})` },
                    ...(r.avg ? [{ value: avgText(r), label: `${target} days vs other days` }] : [])
                ]
            });
            return `
                <div class="db-row" ${tip}>
                    <div class="db-label">${escapeHtml(r.name)}${r.avg ? `<span class="db-avg">${escapeHtml(avgText(r))}</span>` : ''}</div>
                    <div class="db-track">
                        <span class="db-bar" style="left: ${Math.min(r.pT, r.pO) * 100}%; width: ${Math.abs(r.pT - r.pO) * 100}%"></span>
                        <span class="db-dot" style="left: ${r.pO * 100}%; background: var(--viz-muted)"></span>
                        <span class="db-dot" style="left: ${r.pT * 100}%; background: var(--viz-primary)"></span>
                    </div>
                    <div class="db-diff${Math.abs(r.presenceScore) >= CLEAR_PATTERN ? ' strong' : ''}" title="Difference in how often it was logged, in percentage points">${signed(diff)} pts</div>
                    <div class="db-diff${Math.abs(r.valueScore) >= CLEAR_PATTERN ? ' strong' : ''}" title="Change in average value on ${escapeHtml(target)} days">${amount === null ? '—' : signed(amount) + '%'}</div>
                </div>
            `;
        }).join('')}
        ${tableView(
            [{ label: 'Tracker' }, { label: `${target} days`, num: true }, { label: 'Other days', num: true }, { label: 'Average value', num: true }],
            rows.map(r => [r.name, `${pct(r.pT)} (${r.t})`, `${pct(r.pO)} (${r.o})`, avgText(r)])
        )}
    `;
}

function renderDayOfWeek(list, range, metric) {
    const container = document.getElementById('dow-chart');
    if (!metric) {
        container.innerHTML = '<div class="empty-state">Add a tracker to see weekly patterns.</div>';
        return;
    }
    const mode = document.getElementById('dow-mode').value;
    const daily = dailyValues(metric, list);
    const weekdayOf = date => (parseLocalDate(date).getDay() + 6) % 7; // Monday = 0

    const buckets = WEEKDAYS.map(() => []);
    daily.forEach((value, date) => buckets[weekdayOf(date)].push(value));
    const calendarDays = WEEKDAYS.map(() => 0);
    for (let d = range.start; d <= range.end; d = addDays(d, 1)) calendarDays[weekdayOf(d)]++;

    const unit = metric.field.unit;
    const bars = WEEKDAYS.map((day, i) => {
        const values = buckets[i];
        if (mode === 'freq') {
            const value = calendarDays[i] ? values.length / calendarDays[i] : 0;
            return { day, value, text: pct(value), detail: `${values.length} of ${calendarDays[i]} ${day}s` };
        }
        const value = mode === 'total' ? values.reduce((a, b) => a + b, 0) : (mean(values) || 0);
        return { day, value, text: `${formatNumber(value)} ${unit}`.trim(), detail: plural(values.length, 'day') + ' logged' };
    });

    if (!daily.size) {
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
        container.innerHTML = `<div class="empty-state">${metricOptions().length < 2 ? 'You need at least two trackers to compare.' : 'Pick two different trackers to compare.'}</div>`;
        return;
    }

    const xs = dailyValues(xMetric, list);
    const ys = dailyValues(yMetric, list);
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
                { value: `${formatNumber(g.x)} ${xMetric.field.unit}`.trim(), label: xMetric.tracker.name + (xMetric.field.name ? ` ${xMetric.field.name}` : '') },
                { value: `${formatNumber(g.y)} ${yMetric.field.unit}`.trim(), label: yMetric.tracker.name + (yMetric.field.name ? ` ${yMetric.field.name}` : '') }
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
        <p class="insight-note">${r === null ? '' : `Correlation r = ${r.toFixed(2)} (−1 to 1). `}Based on ${plural(points.length, 'day')} where you logged both.${anyMerged ? ' Bigger dots stand for several days with the same values.' : ''} Patterns, not proof of cause.</p>
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
    const daily = dailyValues(metric, list);
    const points = [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
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
        { label: 'Average per logged day', value: `${formatNumber(mean(values))} ${unit}` },
        { label: 'Days logged', value: String(points.length) },
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
