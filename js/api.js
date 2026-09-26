// Talking to the Apps Script backend, plus the loading/message feedback around it.

// Messages go inside an open dialog, since modal dialogs cover everything else on the page.
function showMessage(msg, type) {
    const dialog = document.querySelector('dialog[open]');
    const container = dialog ? dialog.querySelector('.dialog-message') : document.getElementById('error-container');
    container.innerHTML = `<div class="${type}">${escapeHtml(msg)}</div>`;
    clearTimeout(container._timer);
    container._timer = setTimeout(() => { container.innerHTML = ''; }, 5000);
}

function showError(msg) {
    showMessage(msg, 'error');
}

function showSuccess(msg) {
    showMessage(msg, 'success');
}

// All requests are POSTs with a text/plain body, which Apps Script accepts
// without a CORS preflight and keeps the password out of the URL.
async function api(action, payload = {}) {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, secret, ...payload })
    });
    if (!response.ok) throw new Error('Request failed (' + response.status + ')');
    const result = await response.json();
    if (!result.ok) throw new Error(result.error);
    return result.data;
}

// Shows a spinner on the button and disables it until fn finishes, so a slow
// save can't be submitted twice. Errors from fn are shown as messages.
async function runAction(button, busyText, fn) {
    if (button && button.disabled) return;
    const original = button ? button.innerHTML : '';
    if (button) {
        button.disabled = true;
        button.innerHTML = `<span class="spinner"></span>${escapeHtml(busyText)}`;
    }
    try {
        await fn();
    } catch (err) {
        showError(err.message);
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = original;
        }
    }
}

function submitButton(event) {
    return event.submitter || event.target.querySelector('button[type="submit"]');
}
