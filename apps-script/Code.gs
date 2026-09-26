/**
 * Tracker backend: stores entries, trackers and categories in the Google Sheet this script is bound to.
 *
 * Setup:
 *   1. In the Google Sheet: Extensions > Apps Script, paste this file into Code.gs, save.
 *   2. Project Settings (gear icon) > Script Properties > add property SECRET = a password you choose.
 *   3. Deploy > New deployment > type "Web app", Execute as "Me", Who has access "Anyone".
 *   4. Copy the Web app URL (ends in /exec) into the tracker's Connect screen along with the password.
 *
 * After editing this file, use Deploy > Manage deployments > edit > Version "New version"
 * so the same URL picks up the changes.
 *
 * Rows are read and written by header name, so columns can be reordered in the sheet, and
 * columns added in newer versions are appended to existing sheets automatically.
 */

const SHEETS = {
  // One row per recorded value; rows that share an ID belong to the same entry.
  entries: {
    name: 'Entries',
    // Start/End are local times like 2026-09-24T07:30. Date is the day the entry counts toward
    // (for time spans, the day it ends, so a night's sleep belongs to the morning you wake up).
    headers: ['ID', 'Date', 'Tracker', 'Category', 'Field', 'Value', 'Unit', 'Notes', 'Start', 'End', 'Created'],
    textColumns: ['Date', 'Start', 'End'],
  },
  trackers: {
    name: 'Trackers',
    // Timing is "moment" (happens at a point in time) or "span" (has a start and an end).
    headers: ['Name', 'Category', 'Timing', 'Fields', 'Unit'],
  },
  categories: {
    name: 'Categories',
    headers: ['Name', 'Color'],
  },
};

const DEFAULT_CATEGORIES = [
  { name: 'Habit', color: '#8b5cf6' },
  { name: 'Health', color: '#10b981' },
  { name: 'Time', color: '#f59e0b' },
];

const DEFAULT_TRACKERS = [
  { name: 'Morning Run', category: 'Health', timing: 'span', fields: [{ name: 'Distance', unit: 'km' }, { name: 'Duration', unit: 'mins' }] },
  { name: 'Water Intake', category: 'Health', timing: 'moment', fields: [{ name: '', unit: 'glasses' }] },
  { name: 'Meditation', category: 'Habit', timing: 'span', fields: [{ name: '', unit: 'mins' }] },
  { name: 'Reading', category: 'Habit', timing: 'span', fields: [{ name: '', unit: 'mins' }] },
];

const TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const FALLBACK_COLOR = '#9ca3af';

const ACTIONS = {
  list() {
    return {
      entries: groupEntries(getTable('entries').rows),
      trackers: getTable('trackers').rows.filter(r => String(r.Name).trim()).map(rowToTracker),
      categories: getTable('categories').rows.filter(r => String(r.Name).trim()).map(rowToCategory),
    };
  },

  addEntry({ entry }) {
    if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new Error('Invalid date');
    const tracker = getTable('trackers').rows.find(r => String(r.Name) === entry.tracker);
    if (!tracker) throw new Error(`Tracker "${entry.tracker}" not found`);

    const values = (entry.values || [])
      .filter(v => v && v.value !== '' && v.value != null)
      .map(v => ({ field: String(v.field || ''), value: Number(v.value), unit: String(v.unit || '') }));
    if (!values.length) throw new Error('Enter at least one value');
    if (values.some(v => !isFinite(v.value))) throw new Error('Values must be numbers');

    const start = entry.start ? String(entry.start) : '';
    const end = entry.end ? String(entry.end) : '';
    if ((start && !TIME_PATTERN.test(start)) || (end && !TIME_PATTERN.test(end))) throw new Error('Invalid time');
    if (start && end && end <= start) throw new Error('The end time must be after the start time');

    const saved = {
      id: Utilities.getUuid(),
      date: entry.date,
      tracker: String(tracker.Name),
      category: String(tracker.Category),
      notes: String(entry.notes || '').trim(),
      start,
      end,
      created: new Date().toISOString(),
      values,
    };
    appendRecords('entries', values.map(v => ({
      ID: saved.id,
      Date: saved.date,
      Tracker: saved.tracker,
      Category: saved.category,
      Field: v.field,
      Value: v.value,
      Unit: v.unit,
      Notes: saved.notes,
      Start: saved.start,
      End: saved.end,
      Created: saved.created,
    })));
    return saved;
  },

  deleteEntry({ id }) {
    const rowMatch = /^row-(\d+)$/.exec(id); // entries typed into the sheet without an ID
    const deleted = deleteWhere('entries', r => rowMatch ? r._row === Number(rowMatch[1]) : String(r.ID) === id);
    if (!deleted) throw new Error('Entry not found');
    return { id };
  },

  // Creates a tracker, or updates the one named originalName. Renaming or recategorizing
  // a tracker updates its past entries too.
  saveTracker({ originalName, tracker }) {
    const t = cleanTracker(tracker);
    const categoryNames = getTable('categories').rows.map(r => String(r.Name));
    if (!categoryNames.includes(t.category)) throw new Error(`Category "${t.category}" not found`);

    const { rows } = getTable('trackers');
    if (rows.some(r => sameName(r.Name, t.name) && String(r.Name) !== originalName)) {
      throw new Error(`A tracker named "${t.name}" already exists`);
    }

    const record = trackerToRecord(t);
    if (originalName) {
      if (!updateWhere('trackers', r => String(r.Name) === originalName, record)) {
        throw new Error(`Tracker "${originalName}" not found`);
      }
      updateWhere('entries', r => String(r.Tracker) === originalName, { Tracker: t.name, Category: t.category });
    } else {
      appendRecords('trackers', [record]);
    }
    return t;
  },

  // Removes the tracker from the list only; its past entries stay in the Entries sheet.
  deleteTracker({ name }) {
    if (!deleteWhere('trackers', r => String(r.Name) === name)) throw new Error(`Tracker "${name}" not found`);
    return { name };
  },

  saveCategory({ originalName, category }) {
    const name = String((category && category.name) || '').trim();
    if (!name) throw new Error('Category name is required');
    const color = validColor(category.color) ? category.color : FALLBACK_COLOR;

    const { rows } = getTable('categories');
    if (rows.some(r => sameName(r.Name, name) && String(r.Name) !== originalName)) {
      throw new Error(`A category named "${name}" already exists`);
    }

    if (originalName) {
      if (!updateWhere('categories', r => String(r.Name) === originalName, { Name: name, Color: color })) {
        throw new Error(`Category "${originalName}" not found`);
      }
      if (name !== originalName) {
        updateWhere('trackers', r => String(r.Category) === originalName, { Category: name });
        updateWhere('entries', r => String(r.Category) === originalName, { Category: name });
      }
    } else {
      appendRecords('categories', [{ Name: name, Color: color }]);
    }
    return { name, color };
  },

  deleteCategory({ name }) {
    const inUse = getTable('trackers').rows.filter(r => String(r.Category) === name).length;
    if (inUse) throw new Error(`Move or delete the ${inUse} tracker(s) in "${name}" first`);
    if (getTable('categories').rows.length <= 1) throw new Error('You need at least one category');
    if (!deleteWhere('categories', r => String(r.Name) === name)) throw new Error(`Category "${name}" not found`);
    return { name };
  },

  // Fills the sheet with ~4 months of realistic entries for testing. Sample entries have IDs
  // starting with "sample-" so removeSampleData can take them out again.
  addSampleData() {
    const existing = getTable('entries').rows;
    if (existing.some(r => String(r.ID).startsWith(SAMPLE_PREFIX))) {
      throw new Error('Sample data is already in the sheet. Remove it first.');
    }

    const props = PropertiesService.getScriptProperties();
    const created = JSON.parse(props.getProperty('SAMPLE_CREATED') || '{"trackers":[],"categories":[]}');

    const categoryNames = getTable('categories').rows.map(r => String(r.Name));
    const newCategories = SAMPLE_CATEGORIES.filter(c => !categoryNames.some(n => sameName(n, c.name)));
    appendRecords('categories', newCategories.map(c => ({ Name: c.name, Color: c.color })));
    created.categories.push(...newCategories.map(c => c.name));

    const trackerRows = getTable('trackers').rows;
    const newTrackers = SAMPLE_TRACKERS.filter(t => !trackerRows.some(r => sameName(r.Name, t.name)));
    appendRecords('trackers', newTrackers.map(trackerToRecord));
    created.trackers.push(...newTrackers.map(t => t.name));
    props.setProperty('SAMPLE_CREATED', JSON.stringify(created));

    // Fit sample values to the fields of trackers that already existed.
    const trackers = getTable('trackers').rows.map(rowToTracker);
    const records = [];
    buildSampleEntries(new Date()).forEach(entry => {
      const tracker = trackers.find(t => sameName(t.name, entry.tracker));
      if (!tracker) return;
      const values = fitSampleValues(tracker.fields, entry.values);
      if (!values.length) return;
      const id = SAMPLE_PREFIX + Utilities.getUuid();
      values.forEach(v => records.push({
        ID: id,
        Date: entry.date,
        Tracker: tracker.name,
        Category: tracker.category,
        Field: v.field,
        Value: v.value,
        Unit: v.unit,
        Notes: entry.notes || '',
        Start: entry.start,
        End: entry.end,
        Created: entry.created,
      }));
    });
    appendRecords('entries', records);
    return { rows: records.length };
  },

  // Removes sample entries, plus any sample trackers/categories that nothing else uses.
  removeSampleData() {
    const removed = deleteWhere('entries', r => String(r.ID).startsWith(SAMPLE_PREFIX));
    const props = PropertiesService.getScriptProperties();
    const created = JSON.parse(props.getProperty('SAMPLE_CREATED') || '{"trackers":[],"categories":[]}');

    const entryRows = getTable('entries').rows;
    created.trackers.forEach(name => {
      if (!entryRows.some(r => String(r.Tracker) === name)) deleteWhere('trackers', r => String(r.Name) === name);
    });
    const trackerRows = getTable('trackers').rows;
    created.categories.forEach(name => {
      if (!trackerRows.some(r => String(r.Category) === name)) deleteWhere('categories', r => String(r.Name) === name);
    });
    props.deleteProperty('SAMPLE_CREATED');
    return { rows: removed };
  },
};

function doPost(e) {
  let result;
  try {
    const req = JSON.parse(e.postData.contents);
    checkSecret(req.secret);
    const handler = ACTIONS[req.action];
    if (!handler) throw new Error('Unknown action: ' + req.action);
    result = { ok: true, data: withLock(() => handler(req)) };
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkSecret(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!expected) throw new Error('SECRET is not set in the script\'s Script Properties');
  if (secret !== expected) throw new Error('Wrong password');
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---- Sheet access ----

function getSheet(key) {
  const spec = SHEETS[key];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(spec.name);
  if (!sheet) {
    sheet = ss.insertSheet(spec.name);
    sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Keep dates as plain text so Sheets doesn't convert them and shift time zones.
    (spec.textColumns || []).forEach(h => {
      sheet.getRange(1, spec.headers.indexOf(h) + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    });
    if (key === 'trackers') writeRecords(sheet, DEFAULT_TRACKERS.map(trackerToRecord));
    if (key === 'categories') writeRecords(sheet, DEFAULT_CATEGORIES.map(c => ({ Name: c.name, Color: c.color })));
    return sheet;
  }

  // Add any columns introduced since this sheet was created.
  const existing = readHeaders(sheet);
  const missing = spec.headers.filter(h => !existing.includes(h));
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    missing.forEach((h, i) => {
      if ((spec.textColumns || []).includes(h)) {
        sheet.getRange(1, existing.length + 1 + i, sheet.getMaxRows(), 1).setNumberFormat('@');
      }
    });
  }
  return sheet;
}

function readHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

// Returns rows as objects keyed by header, each with its 1-based sheet row in _row.
function getTable(key) {
  const sheet = getSheet(key);
  const headers = readHeaders(sheet);
  const lastRow = sheet.getLastRow();
  const values = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const rows = values.map((r, i) => {
    const row = { _row: i + 2 };
    headers.forEach((h, j) => { row[h] = r[j]; });
    return row;
  });
  return { sheet, headers, rows };
}

function writeRecords(sheet, records) {
  if (!records.length) return;
  const headers = readHeaders(sheet);
  const values = records.map(rec => headers.map(h => (h in rec ? rec[h] : '')));
  const start = sheet.getLastRow() + 1;
  const needed = start + values.length - 1 - sheet.getMaxRows();
  if (needed > 0) sheet.insertRowsAfter(sheet.getMaxRows(), needed);
  sheet.getRange(start, 1, values.length, headers.length).setValues(values);
}

function appendRecords(key, records) {
  writeRecords(getSheet(key), records);
}

// Sets the given columns on every matching row. Returns the number of rows matched.
function updateWhere(key, match, changes) {
  const { sheet, headers, rows } = getTable(key);
  const hits = new Set(rows.filter(match));
  if (!hits.size) return 0;
  Object.keys(changes).forEach(h => {
    const col = headers.indexOf(h);
    if (col === -1) return;
    const column = rows.map(r => [hits.has(r) ? changes[h] : r[h]]);
    sheet.getRange(2, col + 1, rows.length, 1).setValues(column);
  });
  return hits.size;
}

// Deletes every matching row. Returns the number of rows deleted.
function deleteWhere(key, match) {
  const { sheet, headers, rows } = getTable(key);
  const hits = new Set(rows.filter(match));
  if (hits.size > 20) {
    // Deleting rows one by one is slow in Sheets, so rewrite the remaining rows in one go.
    const keep = rows.filter(r => !hits.has(r)).map(r => headers.map(h => r[h]));
    sheet.getRange(2, 1, rows.length, headers.length).clearContent();
    if (keep.length) sheet.getRange(2, 1, keep.length, headers.length).setValues(keep);
  } else {
    [...hits].map(r => r._row).sort((a, b) => b - a).forEach(row => sheet.deleteRow(row));
  }
  return hits.size;
}

// ---- Conversions ----

function groupEntries(rows) {
  const byId = new Map();
  rows.forEach(r => {
    if (!String(r.Tracker).trim()) return;
    const id = String(r.ID || '').trim() || 'row-' + r._row;
    let entry = byId.get(id);
    if (!entry) {
      entry = {
        id,
        date: formatDate(r.Date),
        tracker: String(r.Tracker),
        category: String(r.Category),
        notes: String(r.Notes ?? ''),
        start: formatDateTime(r.Start),
        end: formatDateTime(r.End),
        created: r.Created instanceof Date ? r.Created.toISOString() : String(r.Created ?? ''),
        values: [],
      };
      byId.set(id, entry);
    }
    entry.values.push({ field: String(r.Field ?? ''), value: Number(r.Value) || 0, unit: String(r.Unit ?? '') });
  });
  return Array.from(byId.values());
}

function rowToTracker(r) {
  let fields = [];
  try {
    fields = JSON.parse(r.Fields || '[]');
  } catch (err) {
    fields = [];
  }
  // Trackers from before multi-value support only have a Unit column.
  if (!Array.isArray(fields) || !fields.length) fields = [{ name: '', unit: String(r.Unit ?? '') }];
  return {
    name: String(r.Name),
    category: String(r.Category),
    timing: r.Timing === 'span' ? 'span' : 'moment',
    fields: fields.map(f => ({ name: String(f.name || ''), unit: String(f.unit || '') })),
  };
}

function trackerToRecord(t) {
  return {
    Name: t.name,
    Category: t.category,
    Timing: t.timing === 'span' ? 'span' : 'moment',
    Fields: JSON.stringify(t.fields),
    Unit: t.fields.map(f => f.unit).filter(Boolean).join(', '), // readable summary for the sheet
  };
}

function cleanTracker(tracker) {
  const name = String((tracker && tracker.name) || '').trim();
  if (!name) throw new Error('Tracker name is required');
  const fields = ((tracker && tracker.fields) || [])
    .map(f => ({ name: String(f.name || '').trim(), unit: String(f.unit || '').trim() }))
    .filter(f => f.name || f.unit);
  if (!fields.length) throw new Error('Add at least one value to record');
  if (fields.length > 1 && fields.some(f => !f.name)) {
    throw new Error('Give each value a name when a tracker records more than one');
  }
  const names = fields.map(f => f.name.toLowerCase()).filter(Boolean);
  if (new Set(names).size !== names.length) throw new Error('Value names must be different');
  return { name, category: String(tracker.category || ''), timing: tracker.timing === 'span' ? 'span' : 'moment', fields };
}

function rowToCategory(r) {
  return { name: String(r.Name), color: validColor(r.Color) ? r.Color : FALLBACK_COLOR };
}

function validColor(c) {
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
}

function sameName(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// Start/End times, which Sheets may have turned into Date objects if typed in by hand.
function formatDateTime(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyy-MM-dd'T'HH:mm");
  }
  return v == null ? '' : String(v);
}

// Handles dates typed directly into the sheet, which Sheets stores as Date objects.
function formatDate(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return String(v);
}

// ---- Sample data ----

const SAMPLE_PREFIX = 'sample-';

const SAMPLE_CATEGORIES = [
  { name: 'Health', color: '#10b981' },
  { name: 'Habit', color: '#8b5cf6' },
  { name: 'Time', color: '#f59e0b' },
  { name: 'Work', color: '#06b6d4' },
];

const SAMPLE_TRACKERS = [
  { name: 'Sleep', category: 'Health', timing: 'span', fields: [{ name: '', unit: 'hours' }] },
  { name: 'Water Intake', category: 'Health', timing: 'moment', fields: [{ name: '', unit: 'glasses' }] },
  { name: 'Headache', category: 'Health', timing: 'span', fields: [{ name: 'Severity', unit: '1-10' }, { name: 'Duration', unit: 'hours' }] },
  { name: 'Morning Run', category: 'Health', timing: 'span', fields: [{ name: 'Distance', unit: 'km' }, { name: 'Duration', unit: 'mins' }] },
  { name: 'Coffee', category: 'Habit', timing: 'moment', fields: [{ name: '', unit: 'cups' }] },
  { name: 'Alcohol', category: 'Habit', timing: 'moment', fields: [{ name: '', unit: 'drinks' }] },
  { name: 'Meditation', category: 'Habit', timing: 'span', fields: [{ name: '', unit: 'mins' }] },
  { name: 'Reading', category: 'Habit', timing: 'span', fields: [{ name: '', unit: 'mins' }] },
  { name: 'Screen Time', category: 'Time', timing: 'moment', fields: [{ name: '', unit: 'hours' }] },
  { name: 'Work Done', category: 'Work', timing: 'span', fields: [{ name: '', unit: 'hours' }] },
];

// Matches generated values to a tracker's own fields: by position for single-value
// trackers, otherwise by field name. Values with no matching field are dropped.
function fitSampleValues(fields, values) {
  if (fields.length === 1 && values.length === 1) {
    return [{ field: fields[0].name, unit: fields[0].unit || values[0].unit, value: values[0].value }];
  }
  return values
    .map(v => ({ v, f: fields.find(f => sameName(f.name, v.field)) }))
    .filter(x => x.f)
    .map(x => ({ field: x.f.name, unit: x.f.unit, value: x.v.value }));
}

// ~4 months of entries up to now (`today` is the current time), with patterns worth finding: headaches follow low
// water, short sleep, drinking the night before and long screen days; weekends differ
// from weekdays; coffee rises after short nights; water intake improves over time;
// plus a vacation week and a few forgotten days. Seeded, so it's the same every run.
function buildSampleEntries(today) {
  const makeRandom = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rand = makeRandom(20260924);
  // Headaches and times of day use their own streams so tuning them doesn't reshuffle everything else.
  const headacheRand = makeRandom(4242);
  const timeRand = makeRandom(777);
  const noise = sd => (rand() + rand() + rand() + rand() - 2) * sd * 1.73;
  const pick = list => list[Math.floor(rand() * list.length)];
  const roundTo = (v, step) => Math.round(v / step) * step;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pad = n => String(n).padStart(2, '0');

  const DAYS = 120;
  const headacheNotes = ['Behind the eyes', 'Took ibuprofen', 'Woke up with it', 'Tension, neck and shoulders', 'Light sensitive'];
  const entries = [];
  let prevAlcohol = 0;

  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dow = d.getDay(); // 0 = Sunday
    const weekend = dow === 0 || dow === 6;
    const vacation = i >= 58 && i <= 64;
    const progress = (DAYS - 1 - i) / (DAYS - 1); // 0 at the start, 1 today
    // A time on this day, give or take up to `jitter` minutes, rounded to 5 minutes.
    const at = (hour, minute, jitter = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour,
      minute + roundTo((timeRand() - 0.5) * 2 * jitter, 5));
    const stamp = t => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
    // Moments have just a start; pass `minutes` for time spans.
    const add = (tracker, values, time, notes, minutes) => {
      const end = minutes ? new Date(time.getTime() + minutes * 60000) : null;
      if ((end || time) > today) return; // nothing later than right now
      entries.push({
        date,
        tracker,
        values,
        notes: notes || '',
        start: stamp(time),
        end: end ? stamp(end) : '',
        created: (end || time).toISOString(),
      });
    };
    const one = (unit, value) => [{ field: '', unit, value }];

    // The day's underlying values, generated even when not logged so patterns stay consistent.
    const sleep = clamp(roundTo((weekend || vacation ? 7.9 : 6.9) - (prevAlcohol >= 3 ? 0.8 : 0) + noise(0.8), 0.25), 4.5, 9.5);
    const water = clamp(Math.round(4.8 + 2.5 * progress - (weekend ? 1 : 0) - (vacation ? 1 : 0) + noise(1.3)), 1, 12);
    const coffee = clamp(Math.round(1.4 + (7 - sleep) * 0.9 - (weekend ? 0.5 : 0) + noise(0.6)), 0, 5);
    const drinkChance = vacation ? 0.7 : dow === 5 || dow === 6 ? 0.6 : 0.1;
    const alcohol = rand() < drinkChance ? clamp(Math.round((dow === 5 || dow === 6 || vacation ? 2.3 : 1.2) + noise(0.9)), 1, 5) : 0;
    const working = !weekend && !vacation;
    const work = working ? clamp(roundTo(5.5 + rand() * 3.5 + (coffee >= 2 ? 0.5 : 0), 0.5), 2, 11) : 0;
    const screen = clamp(roundTo(working ? work + 1.5 + rand() * 3 : vacation ? 1 + rand() * 2 : 3 + rand() * 3, 0.5), 0.5, 14);

    const triggers = Math.min(4, (water <= 5 ? 1 : 0) + (sleep < 6.5 ? 1 : 0) + (prevAlcohol >= 2 ? 2 : 0) + (screen >= 10 ? 1 : 0));
    const headacheRisk = [0.02, 0.1, 0.6, 0.8, 0.9][triggers]; // triggers add up
    const headache = headacheRand() < headacheRisk;

    prevAlcohol = alcohol;

    // Forgotten days: nothing logged. On vacation, only sleep and sometimes water.
    if (i > 0 && rand() < 0.05) continue;

    // Sleep ends on this morning and started the evening before.
    const wake = weekend || vacation ? at(8, 45, 45) : at(7, 0, 25);
    const bedtime = new Date(wake.getTime() - sleep * 3600000);
    add('Sleep', one('hours', sleep), bedtime, sleep < 6 && rand() < 0.4 ? pick(['Woke up at 3am', 'Restless night', 'Late night']) : '', sleep * 60);
    if (vacation) {
      if (rand() < 0.5) add('Water Intake', one('glasses', water), at(21, 0, 30));
      if (alcohol) add('Alcohol', one('drinks', alcohol), at(20, 0, 60), rand() < 0.3 ? 'Vacation dinner' : '');
      if (rand() < 0.5) {
        const mins = 30 + Math.round(rand() * 60);
        add('Reading', one('mins', mins), at(15, 0, 60), rand() < 0.2 ? 'Beach read' : '', mins);
      }
      continue;
    }

    if (rand() < 0.9) add('Water Intake', one('glasses', water), at(21, 0, 30));
    if (coffee) add('Coffee', one('cups', coffee), new Date(wake.getTime() + (30 + roundTo(timeRand() * 30, 5)) * 60000));

    const runChance = (dow === 6 ? 0.6 : dow === 0 ? 0.4 : 0.3) * (sleep < 6.25 ? 0.4 : 1);
    if (rand() < runChance) {
      const km = Math.round((weekend ? 5.5 + rand() * 4 : 3.5 + rand() * 3) * 10) / 10;
      const pace = 5.4 + rand();
      const mins = Math.round(km * pace);
      add('Morning Run', [
        { field: 'Distance', unit: 'km', value: km },
        { field: 'Duration', unit: 'mins', value: mins },
      ], weekend ? at(9, 30, 40) : new Date(wake.getTime() - 60 * 60000 + roundTo(timeRand() * 20, 5) * 60000),
      rand() < 0.2 ? pick(['Easy pace', 'Hill route', 'Felt great', 'Tired legs']) : '', mins);
    }

    const meditateChance = 0.65 - 0.3 * Math.sin(Math.PI * progress); // dips mid-period, then recovers
    if (rand() < meditateChance) {
      const mins = pick([5, 10, 10, 15, 20]);
      add('Meditation', one('mins', mins), new Date(wake.getTime() + 15 * 60000), '', mins);
    }

    if (working && rand() < 0.9) {
      const hours = headache ? Math.max(2, work - 1.5) : work;
      add('Work Done', one('hours', hours), at(9, 0, 40), rand() < 0.1 ? pick(['Deadline day', 'Lots of meetings', 'Deep work']) : '', hours * 60);
    }
    if (rand() < 0.75) add('Screen Time', one('hours', screen), at(22, 30, 20));
    if (alcohol) add('Alcohol', one('drinks', alcohol), at(19, 30, 60), rand() < 0.25 ? pick(['Dinner with friends', 'Birthday party', 'Wine with dinner']) : '');
    if (rand() < (weekend ? 0.6 : 0.35)) {
      const mins = 10 + Math.round(rand() * 50);
      add('Reading', one('mins', mins), weekend && timeRand() < 0.4 ? at(15, 0, 90) : at(22, 0, 30), rand() < 0.08 ? 'Finished a book' : '', mins);
    }

    if (headache) {
      const severity = clamp(Math.round(3 + triggers * 1.3 + (headacheRand() - 0.5) * 3), 1, 10);
      const hours = clamp(roundTo(1 + severity * 0.4 + (headacheRand() - 0.5) * 2, 0.5), 0.5, 10);
      add('Headache', [
        { field: 'Severity', unit: '1-10', value: severity },
        { field: 'Duration', unit: 'hours', value: hours },
      ], at(13, 0, 150), headacheRand() < 0.4 ? headacheNotes[Math.floor(headacheRand() * headacheNotes.length)] : '', hours * 60);
    }
  }
  return entries;
}
