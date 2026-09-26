const fs = require('fs'); const vm = require('vm');
require('./gas-mock.js');
vm.runInThisContext(fs.readFileSync(require('path').join(__dirname, '../apps-script/Code.gs'), 'utf8') + '\nglobalThis.doPost = doPost;');
const call = (action, extra = {}) => __call({ secret: DEMO_SECRET, action, ...extra });
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// Old-format sheets, as created by the previous version.
const ss = SpreadsheetApp.getActiveSpreadsheet();
const E = ss.insertSheet('Entries'); E.textCols.add(2);
E.appendRow(['ID','Date','Tracker','Category','Value','Unit','Notes','Created']);
E.appendRow(['old1','2026-09-20','Reading','Habit',30,'mins','','2026-09-20T10:00:00Z']);
const T = ss.insertSheet('Trackers');
T.appendRow(['Name','Unit','Category']); T.appendRow(['Reading','mins','Habit']); T.appendRow(['Headache','severity','Health']);

assert(__call({ secret: 'bad', action: 'list' }).error === 'Wrong password', 'wrong password rejected');
let r = call('list');
assert(r.ok, 'list ok ' + (r.error || ''));
assert(r.data.trackers.length === 2 && r.data.trackers[0].fields[0].unit === 'mins', 'old trackers read with unit as field');
assert(r.data.entries[0].values[0].value === 30 && r.data.entries[0].values[0].field === '', 'old entry read');
assert(r.data.categories.map(c => c.name).join() === 'Habit,Health,Time', 'categories seeded');
assert(__sheets.Entries.data[0].includes('Field') && __sheets.Trackers.data[0].includes('Fields'), 'new columns appended');

r = call('saveTracker', { tracker: { name: 'Run', category: 'Health', fields: [{ name: 'Distance', unit: 'km' }, { name: 'Duration', unit: 'mins' }] } });
assert(r.ok, 'create multi-field tracker ' + (r.error || ''));
assert(!call('saveTracker', { tracker: { name: 'run', category: 'Health', fields: [{ name: '', unit: 'x' }] } }).ok, 'duplicate name rejected');
assert(!call('saveTracker', { tracker: { name: 'X', category: 'Health', fields: [{ name: '', unit: 'a' }, { name: 'B', unit: 'b' }] } }).ok, 'unnamed field in multi rejected');

r = call('addEntry', { entry: { date: '2026-09-22', tracker: 'Run', notes: 'nice', values: [{ field: 'Distance', unit: 'km', value: 5 }, { field: 'Duration', unit: 'mins', value: 30 }] } });
assert(r.ok && r.data.values.length === 2 && r.data.category === 'Health', 'multi-value entry added');
const runId = r.data.id;
r = call('list');
const run = r.data.entries.find(e => e.id === runId);
assert(run && run.values.length === 2 && run.date === '2026-09-22', 'multi-value entry grouped on read, date intact');

// Rename + recategorize cascades to entries
r = call('saveTracker', { originalName: 'Run', tracker: { name: 'Morning Run', category: 'Habit', fields: [{ name: 'Distance', unit: 'km' }, { name: 'Duration', unit: 'mins' }] } });
assert(r.ok, 'rename tracker');
r = call('list');
assert(r.data.entries.find(e => e.id === runId).tracker === 'Morning Run' && r.data.entries.find(e => e.id === runId).category === 'Habit', 'rename cascaded to entries');

// Categories
assert(call('saveCategory', { category: { name: 'Work', color: '#123456' } }).ok, 'add category');
assert(call('saveCategory', { originalName: 'Habit', category: { name: 'Habits', color: '#8b5cf6' } }).ok, 'rename category');
r = call('list');
assert(r.data.trackers.find(t => t.name === 'Reading').category === 'Habits' && r.data.entries.every(e => e.category !== 'Habit'), 'category rename cascaded');
assert(!call('deleteCategory', { name: 'Habits' }).ok, 'delete in-use category blocked');
assert(call('deleteCategory', { name: 'Work' }).ok, 'delete unused category');

// Delete entry removes all its rows
assert(call('deleteEntry', { id: runId }).ok, 'delete entry');
r = call('list');
assert(!r.data.entries.some(e => e.id === runId) && __sheets.Entries.data.filter(row => row[0] === runId).length === 0, 'all rows of entry removed');
assert(call('deleteTracker', { name: 'Headache' }).ok && call('list').data.trackers.length === 2, 'delete tracker');

// Fresh spreadsheet
for (const k of Object.keys(__sheets)) delete __sheets[k];
r = call('list');
assert(r.ok && r.data.trackers.length === 4 && r.data.trackers[0].fields.length === 2, 'fresh sheet seeded with defaults');
r = call('addEntry', { entry: { date: '2026-09-23', tracker: 'Water Intake', values: [{ field: '', unit: 'glasses', value: 6 }] } });
assert(r.ok && call('list').data.entries[0].date === '2026-09-23', 'fresh sheet entry date stays text');

// Sample data: fresh sheet with one user entry, then add and remove samples
for (const k of Object.keys(__sheets)) delete __sheets[k];
call('list');
call('addEntry', { entry: { date: '2026-09-01', tracker: 'Reading', values: [{ field: '', unit: 'mins', value: 20 }] } });
r = call('addSampleData');
assert(r.ok && r.data.rows > 400, 'sample data added (' + (r.data && r.data.rows) + ' rows)');
assert(!call('addSampleData').ok, 'sample data cannot be added twice');
r = call('list');
const names = r.data.trackers.map(t => t.name);
assert(['Sleep', 'Headache', 'Alcohol', 'Screen Time', 'Work Done'].every(n => names.includes(n)), 'sample trackers created');
assert(r.data.categories.some(c => c.name === 'Work'), 'sample category created');
const headaches = r.data.entries.filter(e => e.tracker === 'Headache');
assert(headaches.length >= 10 && headaches.every(e => e.values.length === 2), `headache entries with severity + duration (${headaches.length})`);
const runs = r.data.entries.filter(e => e.tracker === 'Morning Run');
assert(runs.length > 10 && runs.every(e => e.values.map(v => v.field).join() === 'Distance,Duration'), 'run entries fit existing tracker fields');
// Pattern check: less water on headache days
const waterOn = d => (r.data.entries.find(e => e.date === d && e.tracker === 'Water Intake') || {}).values;
const hDays = new Set(headaches.map(e => e.date));
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const wH = avg(r.data.entries.filter(e => e.tracker === 'Water Intake' && hDays.has(e.date)).map(e => e.values[0].value));
const wO = avg(r.data.entries.filter(e => e.tracker === 'Water Intake' && !hDays.has(e.date)).map(e => e.values[0].value));
assert(wH < wO - 0.4, `less water on headache days (${wH.toFixed(1)} vs ${wO.toFixed(1)})`);
r = call('removeSampleData');
assert(r.ok, 'remove sample data');
r = call('list');
assert(r.data.entries.length === 1 && r.data.entries[0].tracker === 'Reading', 'only the user entry remains');
assert(!r.data.trackers.some(t => t.name === 'Headache') && r.data.trackers.some(t => t.name === 'Reading'), 'sample-only trackers removed, existing kept');
assert(!r.data.categories.some(c => c.name === 'Work'), 'sample-only category removed');

// Times: tracker timing and entry start/end
r = call('saveTracker', { tracker: { name: 'Nap', category: 'Health', timing: 'span', fields: [{ name: '', unit: 'mins' }] } });
assert(r.ok && r.data.timing === 'span', 'tracker timing saved');
assert(call('list').data.trackers.find(t => t.name === 'Nap').timing === 'span', 'tracker timing read back');
assert(call('list').data.trackers.find(t => t.name === 'Reading').timing === 'span', 'default Reading tracker is a span');
r = call('addEntry', { entry: { date: '2026-09-24', tracker: 'Nap', start: '2026-09-24T13:00', end: '2026-09-24T13:40', values: [{ field: '', unit: 'mins', value: 40 }] } });
assert(r.ok && r.data.start === '2026-09-24T13:00' && r.data.end === '2026-09-24T13:40', 'span entry saved');
const nap = call('list').data.entries.find(e => e.tracker === 'Nap');
assert(nap.start === '2026-09-24T13:00' && nap.end === '2026-09-24T13:40', 'span entry read back as text');
assert(!call('addEntry', { entry: { date: '2026-09-24', tracker: 'Nap', start: '2026-09-24T14:00', end: '2026-09-24T13:00', values: [{ field: '', unit: 'mins', value: 1 }] } }).ok, 'end before start rejected');
assert(!call('addEntry', { entry: { date: '2026-09-24', tracker: 'Nap', start: '1pm', values: [{ field: '', unit: 'mins', value: 1 }] } }).ok, 'bad time rejected');
r = call('addEntry', { entry: { date: '2026-09-24', tracker: 'Water Intake', start: '2026-09-24T09:15', values: [{ field: '', unit: 'glasses', value: 2 }] } });
assert(r.ok && r.data.start === '2026-09-24T09:15' && r.data.end === '', 'moment entry has start only');
call('addSampleData');
const sample = call('list').data.entries.filter(e => e.id.startsWith('sample-'));
assert(sample.every(e => e.start), 'every sample entry has a time');
const sleeps = sample.filter(e => e.tracker === 'Sleep');
assert(sleeps.every(e => e.end && e.end.slice(0, 10) === e.date && e.start < e.end), 'sample sleep ends on its entry date');
assert(sleeps.every(e => Math.abs((new Date(e.end) - new Date(e.start)) / 3600000 - e.values[0].value) < 0.01), 'sample sleep span matches its hours');
call('removeSampleData');
call('addSampleData');
assert(call('list').data.entries.every(e => !e.id.startsWith('sample-') || new Date(e.end || e.start) <= new Date()), 'no sample entries in the future');
call('removeSampleData');
