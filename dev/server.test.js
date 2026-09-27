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
// Water is logged in several sips a day, so compare daily totals.
const waterByDay = new Map();
r.data.entries.filter(e => e.tracker === 'Water Intake').forEach(e => waterByDay.set(e.date, (waterByDay.get(e.date) || 0) + e.values[0].value));
const wH = avg([...waterByDay].filter(([d]) => hDays.has(d)).map(([, v]) => v));
const wO = avg([...waterByDay].filter(([d]) => !hDays.has(d)).map(([, v]) => v));
assert([...waterByDay.keys()].some(d => r.data.entries.filter(e => e.tracker === 'Water Intake' && e.date === d).length > 1), 'sample water logged several times a day');
assert(r.data.trackers.find(t => t.name === 'Water Intake').tally && r.data.trackers.find(t => t.name === 'Coffee').tally, 'water and coffee are tallies');
assert(!r.data.trackers.find(t => t.name === 'Sleep').tally, 'sleep is not a tally');
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

// Tally setting round-trips
r = call('saveTracker', { tracker: { name: 'Steps', category: 'Health', tally: true, fields: [{ name: '', unit: 'steps' }] } });
assert(r.ok && r.data.tally === true, 'tally tracker saved');
assert(call('list').data.trackers.find(t => t.name === 'Steps').tally === true, 'tally read back');
call('saveTracker', { originalName: 'Steps', tracker: { name: 'Steps', category: 'Health', tally: false, fields: [{ name: '', unit: 'steps' }] } });
assert(call('list').data.trackers.find(t => t.name === 'Steps').tally === false, 'tally can be turned off');
assert(call('list').data.trackers.find(t => t.name === 'Water Intake').tally === true, 'default Water Intake is a tally');

// Day episodes (e.g. a period): no values needed, ongoing until ended with updateEntry
r = call('saveTracker', { tracker: { name: 'Cold', category: 'Health', timing: 'days', fields: [] } });
assert(r.ok && r.data.timing === 'days' && r.data.fields.length === 0, 'days tracker saved without values');
assert(call('list').data.trackers.find(t => t.name === 'Cold').fields.length === 0, 'days tracker read back with no values');
assert(!call('saveTracker', { tracker: { name: 'Nothing', category: 'Health', timing: 'moment', fields: [] } }).ok, 'other trackers still need a value');
r = call('addEntry', { entry: { date: '2026-09-20', tracker: 'Cold', start: '2026-09-20T00:00', end: '', values: [] } });
assert(r.ok && r.data.values.length === 0 && r.data.end === '', 'ongoing episode added without values');
const coldId = r.data.id;
let cold = call('list').data.entries.find(e => e.id === coldId);
assert(cold && cold.values.length === 0 && cold.start === '2026-09-20T00:00' && cold.end === '', 'episode read back as ongoing');
r = call('updateEntry', { id: coldId, changes: { end: '2026-09-24T00:00' } });
assert(r.ok && r.data.end === '2026-09-24T00:00', 'episode ended with updateEntry');
assert(call('list').data.entries.find(e => e.id === coldId).end === '2026-09-24T00:00', 'end saved');
assert(!call('updateEntry', { id: coldId, changes: { end: '2026-09-19T00:00' } }).ok, 'end before start rejected');
assert(!call('updateEntry', { id: 'nope', changes: { end: '2026-09-24T00:00' } }).ok, 'unknown entry rejected');
assert(!call('addEntry', { entry: { date: '2026-09-20', tracker: 'Water Intake', values: [] } }).ok, 'moments still need a value');
call('addSampleData');
const sampleList = call('list').data;
assert(sampleList.trackers.find(t => t.name === 'Period').timing === 'days', 'sample Period tracker is a days tracker');
const periodsLogged = sampleList.entries.filter(e => e.tracker === 'Period');
assert(periodsLogged.length >= 3 && periodsLogged.every(e => e.values.length === 0 && e.start.endsWith('T00:00')), `sample periods logged (${periodsLogged.length})`);
assert(sampleList.entries.some(e => e.tracker === 'Vacation'), 'sample vacation episode');
call('removeSampleData');
assert(!call('list').data.trackers.some(t => t.name === 'Period'), 'sample Period tracker removed');

// Cycle setting (only for day trackers)
r = call('saveTracker', { tracker: { name: 'Cycle Test', category: 'Health', timing: 'days', cycle: true, fields: [] } });
assert(r.ok && r.data.cycle === true, 'cycle tracker saved');
assert(call('list').data.trackers.find(t => t.name === 'Cycle Test').cycle === true, 'cycle read back');
r = call('saveTracker', { tracker: { name: 'Not A Cycle', category: 'Health', timing: 'moment', cycle: true, fields: [{ name: '', unit: 'x' }] } });
assert(r.ok && r.data.cycle === false, 'cycle ignored for non-day trackers');
call('addSampleData');
const cycleList = call('list').data;
assert(cycleList.trackers.find(t => t.name === 'Period').cycle === true, 'sample Period is a cycle');
assert(['Cramps', 'Bloating', 'Mood'].every(n => cycleList.entries.some(e => e.tracker === n)), 'sample symptoms logged');
assert(cycleList.categories.some(c => c.name === 'Cycle'), 'sample Cycle category');
call('removeSampleData');

// Feelings check-ins: several feelings (with intensity) in one entry
r = call('saveTracker', { tracker: { name: 'Check-in', category: 'Health', timing: 'moment', feelings: true, fields: [{ name: 'Calm', unit: '1-5' }, { name: 'Anxious', unit: '1-5' }, { name: 'Coping', unit: '1-5' }] } });
assert(r.ok && r.data.feelings === true, 'feelings tracker saved');
assert(call('list').data.trackers.find(t => t.name === 'Check-in').feelings === true, 'feelings read back');
r = call('addEntry', { entry: { date: '2026-09-24', tracker: 'Check-in', start: '2026-09-24T21:00', values: [{ field: 'Anxious', unit: '1-5', value: 4 }, { field: 'Coping', unit: '1-5', value: 2 }] } });
assert(r.ok && r.data.values.length === 2, 'check-in with two values saved');
const checkin = call('list').data.entries.find(e => e.id === r.data.id);
assert(checkin.values.map(v => `${v.field}:${v.value}`).join() === 'Anxious:4,Coping:2', 'check-in read back');
assert(call('saveTracker', { tracker: { name: 'Days Feelings', category: 'Health', timing: 'days', feelings: true, fields: [] } }).data.feelings === false, 'day trackers cannot be check-ins');
call('addSampleData');
const feelList = call('list').data;
assert(feelList.trackers.find(t => t.name === 'Feelings').feelings, 'sample Feelings check-in tracker');
const sampleCheckins = feelList.entries.filter(e => e.tracker === 'Feelings');
assert(sampleCheckins.length > 30 && sampleCheckins.every(e => e.values.length >= 1), `sample check-ins (${sampleCheckins.length})`);
assert(sampleCheckins.some(e => e.values.length >= 3), 'some check-ins have several feelings');
call('removeSampleData');

// What a missing day means
r = call('saveTracker', { tracker: { name: 'Migraine', category: 'Health', missing: 'zero', fields: [{ name: '', unit: '1-10' }] } });
assert(r.ok && r.data.missing === 'zero', 'missing setting saved');
assert(call('list').data.trackers.find(t => t.name === 'Migraine').missing === 'zero', 'missing setting read back');
assert(call('saveTracker', { tracker: { name: 'Bogus', category: 'Health', missing: 'maybe', fields: [{ name: '', unit: 'x' }] } }).data.missing === 'auto', 'unknown missing values fall back to auto');
call('addSampleData');
const missingList = call('list').data.trackers;
assert(missingList.find(t => t.name === 'Mood').missing === 'unknown' && missingList.find(t => t.name === 'Headache').missing === 'zero', 'sample trackers say what a missing day means');
call('removeSampleData');

// Timeline color setting
r = call('saveTracker', { tracker: { name: 'Energy', category: 'Health', colors: 'higher-better', fields: [{ name: '', unit: '1-5' }] } });
assert(r.ok && r.data.colors === 'higher-better', 'colors setting saved');
assert(call('list').data.trackers.find(t => t.name === 'Energy').colors === 'higher-better', 'colors setting read back');
assert(call('saveTracker', { tracker: { name: 'Plain', category: 'Health', colors: 'rainbow', fields: [{ name: '', unit: 'x' }] } }).data.colors === 'amount', 'unknown colors fall back to amount');
call('addSampleData');
assert(call('list').data.trackers.find(t => t.name === 'Mood').colors === 'higher-better', 'sample Mood colored as positive/negative');
call('removeSampleData');

// Marks: user-drawn stretches of time
r = call('saveMark', { mark: { label: 'Exam week', start: '2026-09-20T08:00', end: '2026-09-24T18:00', color: '#f59e0b', lanes: [], notes: 'Finals' } });
assert(r.ok && r.data.id && r.data.label === 'Exam week', 'mark saved');
const markId = r.data.id;
let markList = call('list').data.marks;
assert(markList.some(m => m.id === markId && m.start === '2026-09-20T08:00' && m.end === '2026-09-24T18:00' && m.lanes.length === 0), 'mark read back');
r = call('saveMark', { mark: { id: markId, label: 'Exams', start: '2026-09-20T08:00', end: '2026-09-25T18:00', color: '#8b5cf6', lanes: ['Health'], notes: '' } });
assert(r.ok, 'mark updated');
markList = call('list').data.marks;
assert(markList.find(m => m.id === markId).label === 'Exams' && markList.find(m => m.id === markId).lanes.join() === 'Health', 'mark update read back');
assert(!call('saveMark', { mark: { label: '', start: '2026-09-20T08:00', end: '2026-09-21T08:00' } }).ok, 'mark needs a label');
assert(!call('saveMark', { mark: { label: 'x', start: '2026-09-21T08:00', end: '2026-09-20T08:00' } }).ok, 'mark end before start rejected');
assert(call('deleteMark', { id: markId }).ok && !call('list').data.marks.some(m => m.id === markId), 'mark deleted');
call('addSampleData');
assert(call('list').data.marks.filter(m => m.label === 'Deadline crunch').length === 2, 'sample marks added');
call('removeSampleData');
assert(call('list').data.marks.length === 0, 'sample marks removed');
