// --- 1. DEFAULT DATASETS & STATE ---
const DEFAULT_EMOTIONS = [
    { id: "e_happy", name: "Happy", valence: "positive" },
    { id: "e_calm", name: "Calm", valence: "positive" },
    { id: "e_motivated", name: "Motivated", valence: "positive" },
    { id: "e_stressed", name: "Stressed", valence: "negative" },
    { id: "e_irritated", name: "Irritated", valence: "negative" },
    { id: "e_anxious", name: "Anxious", valence: "negative" }
];

const generateMockData = () => {
    const today = new Date();
    const formatISO = (d, h, m) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const lastWeek = new Date(today); lastWeek.setDate(today.getDate() - 5);

    return [
        { id: "mock_0", date: formatISO(lastWeek, 10, 0), energy: 6, emotions: ["e_calm"] },
        { id: "mock_1", date: formatISO(yesterday, 8, 30), energy: 3, emotions: ["e_anxious", "e_stressed"] },
        { id: "mock_2", date: formatISO(yesterday, 13, 0), energy: 7, emotions: ["e_happy"] },
        { id: "mock_3", date: formatISO(today, 9, 0), energy: 8, emotions: ["e_motivated", "e_happy"] },
        { id: "mock_4", date: formatISO(today, 14, 30), energy: 4, emotions: ["e_stressed"] }
    ];
};

let state = { userSettings: { customEmotions: [] }, dailyLogs: [] };
let activeCalendarMode = 'month'; 

// --- 2. INITIALIZATION ---
window.addEventListener('load', () => {
    resetLogDatePicker();
    const savedData = localStorage.getItem('lifesync_data');
    if (savedData) {
        try { state = JSON.parse(savedData); } catch (e) { console.error("Data parse error", e); }
    }
    
    // Schema Validator
    if (!state || typeof state !== 'object') state = { userSettings: { customEmotions: [] }, dailyLogs: [] };
    if (!state.userSettings) state.userSettings = {};
    if (!state.userSettings.customEmotions || state.userSettings.customEmotions.length === 0) state.userSettings.customEmotions = [...DEFAULT_EMOTIONS];
    if (!state.dailyLogs || state.dailyLogs.length === 0) state.dailyLogs = generateMockData();
    
    saveStateToLocalStorage();
    renderEmotionsInLogger();
    renderEmotionsInSettings();
});

function resetLogDatePicker() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('log-date').value = now.toISOString().slice(0, 16);
}

function saveStateToLocalStorage() { 
    localStorage.setItem('lifesync_data', JSON.stringify(state)); 
}

// --- 3. NAVIGATION CONTROLLER ---
function switchTab(tabId) {
    const views = ['view-log', 'view-calendar', 'view-insights', 'view-settings'];
    views.forEach(v => document.getElementById(v).classList.add('hidden'));
    document.getElementById('mode-switcher').classList.add('hidden');

    document.getElementById(`view-${tabId}`).classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.replace('text-blue-600', 'text-slate-400'));
    document.getElementById(`btn-${tabId}`).classList.replace('text-slate-400', 'text-blue-600');

    const titles = { log: 'Log Your Day', calendar: 'History & Timeline', insights: 'Your Insights', settings: 'Settings' };
    document.getElementById('app-title').innerText = titles[tabId];

    if (tabId === 'calendar') {
        document.getElementById('mode-switcher').classList.remove('hidden');
        refreshCalendarUI();
    }
}

function setCalendarMode(mode) {
    activeCalendarMode = mode;
    document.getElementById('calendar-month-container').classList.add('hidden');
    document.getElementById('calendar-timeline-container').classList.add('hidden');
    
    document.getElementById('btn-mode-month').className = "px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-500";
    document.getElementById('btn-mode-timeline').className = "px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-500";

    if (mode === 'month') {
        document.getElementById('calendar-month-container').classList.remove('hidden');
        document.getElementById('btn-mode-month').className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-white text-slate-800 shadow-sm";
    } else {
        document.getElementById('calendar-timeline-container').classList.remove('hidden');
        document.getElementById('btn-mode-timeline').className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-white text-slate-800 shadow-sm";
    }
    refreshCalendarUI();
}

function refreshCalendarUI() {
    if (activeCalendarMode === 'month') renderAppleStyleCalendar();
    else renderSeamlessTimeline();
}

// --- 4. LOGGING ENGINE ---
function updateEnergyDisplay(val) { 
    document.getElementById('energy-value').innerText = `${val}/10`; 
}

function renderEmotionsInLogger() {
    const posList = document.getElementById('positive-emotions-list');
    const negList = document.getElementById('negative-emotions-list');
    posList.innerHTML = ''; negList.innerHTML = '';

    state.userSettings.customEmotions.forEach(emo => {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerText = emo.name;
        button.dataset.id = emo.id;
        button.className = "px-4 py-2.5 rounded-2xl text-sm font-bold transition duration-100 bg-slate-50 border border-slate-200 text-slate-600 active:scale-90";
        
        button.onclick = () => {
            button.classList.toggle('bg-slate-50');
            button.classList.toggle('border-slate-200');
            button.classList.toggle('text-slate-600');
            if (emo.valence === 'positive') {
                button.classList.toggle('bg-emerald-500');
                button.classList.toggle('border-emerald-600');
                button.classList.toggle('text-white');
                button.classList.toggle('shadow-md');
            } else {
                button.classList.toggle('bg-rose-500');
                button.classList.toggle('border-rose-600');
                button.classList.toggle('text-white');
                button.classList.toggle('shadow-md');
            }
        };
        if (emo.valence === 'positive') posList.appendChild(button);
        else negList.appendChild(button);
    });
}

function saveCurrentLog() {
    const dateVal = document.getElementById('log-date').value;
    const energyVal = parseInt(document.getElementById('log-energy').value);
    const selectedEmotions = [];
    document.querySelectorAll('#positive-emotions-list button, #negative-emotions-list button').forEach(btn => {
        if (btn.classList.contains('bg-emerald-500') || btn.classList.contains('bg-rose-500')) {
            selectedEmotions.push(btn.dataset.id);
        }
    });

    state.dailyLogs.push({ id: 'log_' + Date.now(), date: dateVal, energy: energyVal, emotions: selectedEmotions });
    saveStateToLocalStorage();
    
    document.getElementById('log-energy').value = 5; updateEnergyDisplay(5);
    resetLogDatePicker(); renderEmotionsInLogger();
    
    const btn = document.querySelector('button[onclick="saveCurrentLog()"]');
    const ogText = btn.innerText;
    btn.innerText = "✓ Saved"; btn.classList.replace('bg-blue-600', 'bg-emerald-500');
    setTimeout(() => { btn.innerText = ogText; btn.classList.replace('bg-emerald-500', 'bg-blue-600'); }, 1500);
}

// --- 5. MONTHLY CALENDAR ENGINE ---
function renderAppleStyleCalendar() {
    const container = document.getElementById('apple-calendar-stack');
    container.innerHTML = '';
    
    const today = new Date();
    for (let offset = -3; offset <= 1; offset++) {
        const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
        const monthDiv = document.createElement('div');
        monthDiv.className = "pb-10 pt-2";
        
        const title = document.createElement('h2');
        title.className = "sticky top-[36px] bg-white/95 backdrop-blur-sm z-10 text-xl font-black text-slate-900 py-3 shadow-[0_10px_10px_-10px_rgba(0,0,0,0.05)]";
        title.innerText = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthDiv.appendChild(title);

        const grid = document.createElement('div');
        grid.className = "grid grid-cols-7 gap-y-4 gap-x-1 justify-items-center mt-4";
        
        const firstDayIndex = date.getDay();
        const totalDays = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

        for (let i = 0; i < firstDayIndex; i++) {
            const empty = document.createElement('div');
            empty.className = "w-12 h-12";
            grid.appendChild(empty);
        }

        for (let day = 1; day <= totalDays; day++) {
            const circle = document.createElement('div');
            circle.className = "w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer active:scale-90 transition-transform relative z-0";
            
            const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayLogs = state.dailyLogs.filter(log => log.date.startsWith(dateString));
            const isToday = dateString === `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

            if (dayLogs.length > 0) {
                const avgEnergy = dayLogs.reduce((acc, curr) => acc + curr.energy, 0) / dayLogs.length;
                if (avgEnergy <= 3) circle.className += " bg-blue-100 text-blue-900";
                else if (avgEnergy <= 6) circle.className += " bg-blue-200 text-blue-900";
                else if (avgEnergy <= 8) circle.className += " bg-blue-400 text-white shadow-md";
                else circle.className += " bg-blue-600 text-white shadow-md";

                let hasPos = false, hasNeg = false;
                dayLogs.forEach(log => {
                    log.emotions.forEach(emoId => {
                        if (emoId === 'fallback_positive') hasPos = true;
                        else if (emoId === 'fallback_negative') hasNeg = true;
                        else {
                            const emo = state.userSettings.customEmotions.find(e => e.id === emoId);
                            if (emo) {
                                if (emo.valence === 'positive') hasPos = true;
                                if (emo.valence === 'negative') hasNeg = true;
                            }
                        }
                    });
                });
                
                if (hasPos && hasNeg) circle.className += " ring-[3px] ring-amber-400 ring-offset-2";
                else if (hasPos) circle.className += " ring-[3px] ring-emerald-400 ring-offset-2";
                else if (hasNeg) circle.className += " ring-[3px] ring-rose-400 ring-offset-2";
            } else {
                circle.className += " bg-transparent text-slate-700";
                if (isToday) circle.className += " text-blue-600 font-black";
            }

            circle.innerHTML = `<span>${day}</span>`;
            circle.onclick = () => openDayModal(dateString, dayLogs);
            grid.appendChild(circle);
        }
        monthDiv.appendChild(grid);
        container.appendChild(monthDiv);
    }
    
    setTimeout(() => { container.scrollTop = container.scrollHeight / 2; }, 50);
}

// --- 6. TIMELINE ENGINE ---
function renderSeamlessTimeline() {
    const feed = document.getElementById('continuous-timeline-feed');
    feed.innerHTML = '';
    
    const sortedLogs = [...state.dailyLogs].sort((a, b) => b.date.localeCompare(a.date));
    if (sortedLogs.length === 0) {
        feed.innerHTML = `<p class="text-center text-slate-400 text-sm mt-10">No entries logged yet.</p>`;
        return;
    }

    let lastRenderedDateString = "";

    sortedLogs.forEach((log) => {
        const logDateObj = new Date(log.date);
        const dateOnly = log.date.split('T')[0];
        const timeString = logDateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

        if (dateOnly !== lastRenderedDateString) {
            const dateBadge = document.createElement('div');
            dateBadge.className = "flex items-center gap-4 relative z-10 mt-6 mb-2 -ml-2";
            const displayDate = logDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            dateBadge.innerHTML = `
                <div class="w-2.5 h-2.5 rounded-full bg-slate-300 border-2 border-white ml-[3.5px]"></div>
                <span class="text-xs font-black uppercase tracking-wider text-slate-400">${displayDate}</span>
            `;
            feed.appendChild(dateBadge);
            lastRenderedDateString = dateOnly;
        }

        const logNode = document.createElement('div');
        logNode.className = "flex items-start gap-5 relative z-10 group active:scale-[0.98] transition-transform cursor-pointer";
        logNode.onclick = () => openDayModal(dateOnly, [log]);

        let posCount = 0, negCount = 0, hasEmotions = false;
        log.emotions.forEach(emoId => {
            hasEmotions = true;
            if (emoId === 'fallback_positive') posCount++;
            else if (emoId === 'fallback_negative') negCount++;
            else {
                const emo = state.userSettings.customEmotions.find(e => e.id === emoId);
                if (emo) {
                    if (emo.valence === 'positive') posCount++;
                    if (emo.valence === 'negative') negCount++;
                }
            }
        });

        let colorStyle = "bg-blue-500 text-white border-white"; 
        if (hasEmotions) {
            if (posCount > 0 && negCount > 0) colorStyle = "bg-amber-400 text-slate-900 border-white";
            else if (posCount > 0) colorStyle = "bg-emerald-500 text-white border-emerald-100";
            else if (negCount > 0) colorStyle = "bg-rose-500 text-white border-rose-100";
        }

        const nodeCircle = document.createElement('div');
        nodeCircle.className = `w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-sm border-[4px] text-[10px] font-black tracking-tighter ${colorStyle} mt-1`;
        nodeCircle.innerHTML = `<span>${timeString.replace(' ', '')}</span>`;

        const contentBox = document.createElement('div');
        contentBox.className = "flex-grow pt-2 pb-6 border-b border-slate-100/50 group-last:border-0";
        
        const emotionsRow = log.emotions.map(id => {
            const emo = state.userSettings.customEmotions.find(e => e.id === id);
            if (emo) {
                const cl = emo.valence === 'positive' ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
                return `<span class="${cl} text-xs px-2.5 py-1 rounded-full font-bold">${emo.name}</span>`;
            }
            return '';
        }).join(' ');

        contentBox.innerHTML = `
            <div class="flex flex-col gap-2">
                <span class="text-sm font-black text-blue-600">Energy Level: ${log.energy}/10</span>
                <div class="flex flex-wrap gap-1.5">${emotionsRow || '<span class="text-xs font-semibold text-slate-400 italic">No emotions recorded</span>'}</div>
            </div>
        `;

        logNode.appendChild(nodeCircle);
        logNode.appendChild(contentBox);
        feed.appendChild(logNode);
    });
}

// --- 7. MODAL ENGINE ---
function openDayModal(dateString, logs) {
    const modal = document.getElementById('day-modal');
    const sheet = document.getElementById('day-modal-sheet');
    const title = document.getElementById('modal-date-title');
    const content = document.getElementById('modal-content-area');

    const [y, m, d] = dateString.split('-');
    const dateObj = new Date(y, parseInt(m) - 1, d);
    title.innerText = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    content.innerHTML = '';

    if (logs.length === 0) {
        content.innerHTML = `
            <div class="text-center py-10 space-y-4">
                <p class="text-slate-400 font-medium">Nothing logged this day.</p>
                <button onclick="shortcutRetroactiveLog('${dateString}')" class="bg-blue-600 active:bg-blue-700 text-white font-bold py-3 px-8 rounded-2xl transition shadow-md">
                    Add Entry
                </button>
            </div>
        `;
    } else {
        logs.forEach((log) => {
            const logCard = document.createElement('div');
            logCard.className = "bg-slate-50 border border-slate-100 rounded-3xl p-5 space-y-4 shadow-sm";
            
            const timePart = log.date.split('T')[1];
            let [hours, minutes] = timePart.split(':'); hours = parseInt(hours);
            const formattedTime = `${hours%12||12}:${minutes} ${hours>=12?'PM':'AM'}`;

            const emotionNames = log.emotions.map(id => {
                const found = state.userSettings.customEmotions.find(e => e.id === id);
                if (found) {
                    const bc = found.valence === 'positive' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';
                    return `<span class="${bc} text-xs px-3 py-1.5 rounded-full font-bold">${found.name}</span>`;
                }
                return '';
            }).join(' ');

            logCard.innerHTML = `
                <div class="flex justify-between items-center border-b border-slate-200/60 pb-3">
                    <span class="text-xs font-black text-slate-400 uppercase tracking-widest">${formattedTime}</span>
                    <button onclick="deleteLog('${log.id}', '${dateString}')" class="text-rose-500 active:scale-90 text-[10px] font-black uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-full">Delete</button>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-sm font-bold text-slate-500">Energy Score</span>
                    <span class="text-2xl font-black text-blue-600">${log.energy}</span>
                </div>
                <div class="space-y-2 pt-1">
                    <div class="flex flex-wrap gap-1.5">${emotionNames || '<span class="text-slate-400 text-xs font-semibold">None</span>'}</div>
                </div>
            `;
            content.appendChild(logCard);
        });
    }

    modal.classList.remove('hidden');
    setTimeout(() => { sheet.classList.remove('translate-y-full'); }, 10);
}

function closeDayModal() {
    const sheet = document.getElementById('day-modal-sheet');
    sheet.classList.add('translate-y-full');
    setTimeout(() => { document.getElementById('day-modal').classList.add('hidden'); }, 300);
}

function deleteLog(logId, dateString) {
    if (!confirm("Delete this log?")) return;
    state.dailyLogs = state.dailyLogs.filter(log => log.id !== logId);
    saveStateToLocalStorage();
    refreshCalendarUI();
    const updatedLogs = state.dailyLogs.filter(log => log.date.startsWith(dateString));
    if (updatedLogs.length === 0) closeDayModal();
    else openDayModal(dateString, updatedLogs);
}

function shortcutRetroactiveLog(dateString) {
    closeDayModal();
    document.getElementById('log-date').value = `${dateString}T12:00`;
    switchTab('log');
}

// --- 8. SETTINGS ENGINE ---
function renderEmotionsInSettings() {
    const settingsList = document.getElementById('settings-emotions-list');
    settingsList.innerHTML = '';
    state.userSettings.customEmotions.forEach(emo => {
        const row = document.createElement('div');
        row.className = "flex justify-between items-center py-4";
        const labelColor = emo.valence === 'positive' ? 'text-emerald-500 bg-emerald-50' : 'text-rose-500 bg-rose-50';
        row.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold text-slate-800 text-lg">${emo.name}</span>
                <span class="text-[10px] ${labelColor} uppercase font-black px-2.5 py-1 rounded-full tracking-widest">${emo.valence}</span>
            </div>
            <button onclick="deleteEmotion('${emo.id}')" class="text-rose-400 hover:text-rose-600 text-xs font-black uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full">Del</button>
        `;
        settingsList.appendChild(row);
    });
}

function addNewEmotion() {
    const nameInput = document.getElementById('new-emotion-name');
    const name = nameInput.value.trim();
    if (!name) return;
    state.userSettings.customEmotions.push({ id: 'custom_' + Date.now(), name: name, valence: document.getElementById('new-emotion-valence').value });
    saveStateToLocalStorage();
    nameInput.value = '';
    renderEmotionsInLogger(); renderEmotionsInSettings();
}

function deleteEmotion(emotionId) {
    if (!confirm("Delete this emotion?")) return;
    const targetEmo = state.userSettings.customEmotions.find(e => e.id === emotionId);
    const fallbackValue = targetEmo.valence === 'positive' ? 'fallback_positive' : 'fallback_negative';
    state.dailyLogs.forEach(log => { log.emotions = log.emotions.map(id => id === emotionId ? fallbackValue : id); });
    state.userSettings.customEmotions = state.userSettings.customEmotions.filter(e => e.id !== emotionId);
    saveStateToLocalStorage();
    renderEmotionsInLogger(); renderEmotionsInSettings();
}