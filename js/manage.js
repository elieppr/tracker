// Manage tab: creating, editing and deleting trackers and categories.

// ---- Trackers ----

function openTrackerDialog(name) {
    if (!categories.length) {
        showError('Add a category first');
        return;
    }
    const tracker = trackers.find(t => t.name === name);
    editingTracker = tracker ? tracker.name : null;

    document.getElementById('tracker-dialog-title').textContent = tracker ? `Edit ${tracker.name}` : 'New Tracker';
    document.getElementById('tracker-name').value = tracker ? tracker.name : '';

    const select = document.getElementById('tracker-category');
    select.innerHTML = categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    if (tracker && categories.some(c => c.name === tracker.category)) select.value = tracker.category;
    document.getElementById('tracker-timing').value = tracker && tracker.timing === 'span' ? 'span' : 'moment';

    document.getElementById('tracker-fields').innerHTML = '';
    (tracker ? tracker.fields : [{ name: '', unit: '' }]).forEach(f => addFieldRow(f));

    const dialog = document.getElementById('tracker-dialog');
    dialog.querySelector('.dialog-message').innerHTML = '';
    dialog.showModal();
}

function addFieldRow(field = { name: '', unit: '' }) {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `
        <input class="field-name" type="text" placeholder="Name (e.g. Distance)">
        <input class="field-unit" type="text" placeholder="Unit (e.g. km)">
        <button type="button" class="icon-btn" title="Remove">×</button>
    `;
    row.querySelector('.field-name').value = field.name;
    row.querySelector('.field-unit').value = field.unit;
    row.querySelector('button').onclick = () => {
        row.remove();
        if (!document.querySelector('#tracker-fields .field-row')) addFieldRow();
    };
    document.getElementById('tracker-fields').appendChild(row);
}

function handleSaveTracker(event) {
    event.preventDefault();
    const name = document.getElementById('tracker-name').value.trim();
    const category = document.getElementById('tracker-category').value;
    const timing = document.getElementById('tracker-timing').value;
    const fields = [...document.querySelectorAll('#tracker-fields .field-row')]
        .map(row => ({
            name: row.querySelector('.field-name').value.trim(),
            unit: row.querySelector('.field-unit').value.trim()
        }))
        .filter(f => f.name || f.unit);

    if (!name) return showError('Please enter a tracker name');
    if (!fields.length) return showError('Add at least one value to record');
    if (fields.length > 1 && fields.some(f => !f.name)) {
        return showError('Give each value a name when a tracker records more than one');
    }

    const originalName = editingTracker;
    runAction(submitButton(event), 'Saving…', async () => {
        const saved = await api('saveTracker', { originalName, tracker: { name, category, timing, fields } });
        if (originalName) {
            trackers = trackers.map(t => t.name === originalName ? saved : t);
            entries.forEach(e => {
                if (e.tracker === originalName) {
                    e.tracker = saved.name;
                    e.category = saved.category;
                }
            });
        } else {
            trackers.push(saved);
        }
        closeDialog('tracker-dialog');
        renderAll();
        showSuccess(originalName ? `✓ Updated ${saved.name}` : `✓ Added ${saved.name}`);
    });
}

function deleteTracker(name, button) {
    if (!confirm(`Delete the "${name}" tracker? Its past entries will be kept.`)) return;

    runAction(button, 'Deleting…', async () => {
        await api('deleteTracker', { name });
        trackers = trackers.filter(t => t.name !== name);
        renderAll();
        showSuccess(`✓ Deleted ${name}`);
    });
}

// ---- Categories ----

function openCategoryDialog(name) {
    const category = categories.find(c => c.name === name);
    editingCategory = category ? category.name : null;

    document.getElementById('category-dialog-title').textContent = category ? `Edit ${category.name}` : 'New Category';
    document.getElementById('category-name').value = category ? category.name : '';
    document.getElementById('category-color').value = category
        ? category.color
        : CATEGORY_PALETTE.find(c => !categories.some(x => x.color === c)) || CATEGORY_PALETTE[0];

    const dialog = document.getElementById('category-dialog');
    dialog.querySelector('.dialog-message').innerHTML = '';
    dialog.showModal();
}

function handleSaveCategory(event) {
    event.preventDefault();
    const name = document.getElementById('category-name').value.trim();
    const color = document.getElementById('category-color').value;
    if (!name) return showError('Please enter a category name');

    const originalName = editingCategory;
    runAction(submitButton(event), 'Saving…', async () => {
        const saved = await api('saveCategory', { originalName, category: { name, color } });
        if (originalName) {
            categories = categories.map(c => c.name === originalName ? saved : c);
            trackers.forEach(t => { if (t.category === originalName) t.category = saved.name; });
            entries.forEach(e => { if (e.category === originalName) e.category = saved.name; });
        } else {
            categories.push(saved);
        }
        closeDialog('category-dialog');
        renderAll();
        showSuccess(originalName ? `✓ Updated ${saved.name}` : `✓ Added ${saved.name}`);
    });
}

function deleteCategory(name, button) {
    const count = trackers.filter(t => t.category === name).length;
    if (count) {
        showError(`Move or delete the ${plural(count, 'tracker')} in "${name}" first`);
        return;
    }
    if (!confirm(`Delete the "${name}" category?`)) return;

    runAction(button, 'Deleting…', async () => {
        await api('deleteCategory', { name });
        categories = categories.filter(c => c.name !== name);
        renderAll();
        showSuccess(`✓ Deleted ${name}`);
    });
}

// ---- Sample data ----

function handleAddSampleData(button) {
    if (!confirm('Add about 4 months of made-up entries to your sheet? You can remove them later with "Remove sample data".')) return;
    runAction(button, 'Adding…', async () => {
        const result = await api('addSampleData');
        await loadData();
        showSuccess(`✓ Added ${result.rows} sample rows`);
    });
}

function handleRemoveSampleData(button) {
    if (!confirm('Remove all sample entries? Your own entries are not affected.')) return;
    runAction(button, 'Removing…', async () => {
        const result = await api('removeSampleData');
        await loadData();
        showSuccess(result.rows ? `✓ Removed ${result.rows} sample rows` : 'There was no sample data to remove');
    });
}
