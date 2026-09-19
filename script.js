/* ═══════════════════════════════════════════════════════════════════
   Zyro - SMS Bomber Engine & State Controller (Pure Light Theme)
   Deep Checked & Hardened against logic errors and DOM leaks.
   ═══════════════════════════════════════════════════════════════════ */

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.startsWith('192.168.');
const API_BASE_URL = isLocal ? '' : 'https://costum-boomber-api.vercel.app';

// ── Safe LocalStorage Parsing ──
let initialHistory = [];
try {
    const rawHistory = localStorage.getItem('bomber_history');
    if (rawHistory) {
        initialHistory = JSON.parse(rawHistory);
        if (!Array.isArray(initialHistory)) initialHistory = [];
    }
} catch (e) {
    console.warn('Recovered from corrupted localStorage history state.');
    initialHistory = [];
}

// ── State Management ──
const state = {
    isExecuting: false,
    abortController: null,
    history: initialHistory,
};

// ── DOM Elements ──
const els = {
    // Status & System Metrics
    apiStatusPill: document.getElementById('apiStatusPill'),
    apiStatusText: document.getElementById('apiStatusText'),
    valDevices: document.getElementById('valDevices'),
    valDatabases: document.getElementById('valDatabases'),
    valMaxCount: document.getElementById('valMaxCount'),
    valMaxWorkers: document.getElementById('valMaxWorkers'),

    // Form Inputs
    attackForm: document.getElementById('attackForm'),
    countryCode: document.getElementById('countryCode'),
    phoneNumber: document.getElementById('phoneNumber'),
    customMessage: document.getElementById('customMessage'),
    charCounter: document.getElementById('charCounter'),
    clearMsgBtn: document.getElementById('clearMsgBtn'),
    countSlider: document.getElementById('countSlider'),
    countDisplay: document.getElementById('countDisplay'),
    btnLaunch: document.getElementById('btnLaunch'),
    btnAbort: document.getElementById('btnAbort'),
    launchSpinner: document.getElementById('launchSpinner'),
    launchBtnText: document.getElementById('launchBtnText'),

    // Telemetry & Progress
    progressStateTitle: document.getElementById('progressStateTitle'),
    progressPctText: document.getElementById('progressPctText'),
    progressBarFill: document.getElementById('progressBarFill'),
    statSent: document.getElementById('statSent'),
    statFailed: document.getElementById('statFailed'),
    statAttempts: document.getElementById('statAttempts'),
    statTime: document.getElementById('statTime'),
    terminalLog: document.getElementById('terminalLog'),
    btnClearTerminal: document.getElementById('btnClearTerminal'),

    // Payload breakdown
    payloadBreakdown: document.getElementById('payloadBreakdown'),
    bdShotgun: document.getElementById('bdShotgun'),
    bdRetry: document.getElementById('bdRetry'),
    bdDevices: document.getElementById('bdDevices'),
    bdElapsed: document.getElementById('bdElapsed'),
    bdNote: document.getElementById('bdNote'),

    // History Table
    historyTableBody: document.getElementById('historyTableBody'),
    btnExportHistory: document.getElementById('btnExportHistory'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    toastStack: document.getElementById('toastStack')
};

// ── Initialization ──
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    fetchSystemHealth();
    renderHistoryTable();
    syncCountChips(els.countSlider.value); // Initialize slider fill visually

    function scheduleHealthCheck() {
        fetchSystemHealth().finally(() => {
            setTimeout(scheduleHealthCheck, 25000);
        });
    }
    scheduleHealthCheck();
});

// ── Event Listeners Setup ──
function setupEventListeners() {
    // Phone input restriction (ensure numeric only)
    els.countryCode.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
    });

    els.phoneNumber.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12);
    });

    // Custom message character counter and auto-resize
    function autoResizeTextarea() {
        els.customMessage.style.height = 'auto';
        els.customMessage.style.height = els.customMessage.scrollHeight + 'px';
    }

    els.customMessage.addEventListener('input', () => {
        const len = els.customMessage.value.length;
        els.charCounter.textContent = `${len} / 2000`;
        autoResizeTextarea();
    });

    // Quick message chips
    document.querySelectorAll('.msg-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            els.customMessage.value = chip.dataset.msg;
            els.charCounter.textContent = `${chip.dataset.msg.length} / 2000`;
            autoResizeTextarea();
        });
    });

    els.clearMsgBtn.addEventListener('click', () => {
        els.customMessage.value = '';
        els.charCounter.textContent = '0 / 2000';
        autoResizeTextarea();
    });

    // Count Slider & Chips
    els.countSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        els.countDisplay.textContent = val;
        syncCountChips(val);
    });

    document.querySelectorAll('.count-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const val = chip.dataset.val;
            els.countSlider.value = val;
            els.countDisplay.textContent = val;
            syncCountChips(val);
        });
    });

    // Form Submit (Dispatch)
    els.attackForm.addEventListener('submit', handleFormSubmit);

    // Abort Button
    els.btnAbort.addEventListener('click', abortExecution);

    // Clear Terminal Log
    els.btnClearTerminal.addEventListener('click', () => {
        els.terminalLog.innerHTML = '';
        appendLog('Console buffer cleared.', 'info');
    });

    // History Table Actions
    els.btnExportHistory.addEventListener('click', exportHistoryData);
    els.btnClearHistory.addEventListener('click', clearHistoryData);
}

function syncCountChips(value) {
    document.querySelectorAll('.count-chip').forEach(chip => {
        if (chip.dataset.val === String(value)) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });

    // Dynamic slider track fill calculation
    const pct = ((value - 1) / 999) * 100;
    els.countSlider.style.background = `linear-gradient(to right, var(--primary) ${pct}%, var(--border-color) ${pct}%)`;
}

// ── Fetch System Health & Devices ──
async function fetchSystemHealth() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/health`);
        const data = await res.json();

        if (data && data.ok) {
            els.apiStatusPill.className = 'api-status-pill online';
            els.apiStatusText.textContent = 'Operational';

            els.valDevices.textContent = data.cachedDevices ?? '-';
            els.valDatabases.textContent = data.dbs ?? '-';
            els.valMaxCount.textContent = data.config?.max_count ?? 1000;
            els.valMaxWorkers.textContent = data.config?.max_workers ?? 40;
        } else {
            setOfflineStatus();
        }
    } catch (err) {
        setOfflineStatus();
    }
}

function setOfflineStatus() {
    els.apiStatusPill.className = 'api-status-pill offline';
    els.apiStatusText.textContent = 'Server Offline';
}

// ── Dispatch Handler ──
async function handleFormSubmit(e) {
    e.preventDefault();

    if (state.isExecuting) return; // Prevent concurrent executions natively

    // Combine country code and phone number, then strip non-digits for the API
    const rawCountry = els.countryCode.value.trim();
    const rawPhone = els.phoneNumber.value.trim();
    const number = (rawCountry + rawPhone).replace(/\D/g, '');

    // API throws 'msg required' if msg is entirely missing
    const msg = els.customMessage.value.trim() || 'System Payload Dispatch';
    const count = parseInt(els.countSlider.value, 10);

    if (!number || number.length < 10 || number.length > 15) {
        showToast('Combined phone number (country code + number) must be 10-15 digits', 'error');
        els.phoneNumber.focus();
        return;
    }

    // Prepare execution state UI
    setExecutingUI(true);
    resetTelemetry();

    appendLog(`[DISPATCH] Preparing payload for +${number}...`, 'info');
    appendLog(`[CONFIG] Count: ${count} | Msg: "${msg}"`, 'info');

    // Build API Endpoint URL
    const queryParams = new URLSearchParams({
        number: number,
        count: count,
        msg: msg
    });

    const targetUrl = `${API_BASE_URL}/api?${queryParams.toString()}`;

    state.abortController = new AbortController();
    const startTime = Date.now();

    // Timer Interval for Telemetry
    const timerInterval = setInterval(() => {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        els.statTime.textContent = `${elapsedSec}s`;
    }, 100);

    try {
        appendLog(`[HTTP] Initiating connection to gateway...`, 'info');
        updateProgress(20, 'Sending Requests...');

        const response = await fetch(targetUrl, { signal: state.abortController.signal });
        
        let data;
        try {
            data = await response.json();
        } catch (jsonErr) {
            // Hardened against unhandled 502/504 Bad Gateway HTML responses from Vercel
            throw new Error(`Invalid JSON response (HTTP ${response.status})`);
        }

        clearInterval(timerInterval);
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
        els.statTime.textContent = `${totalDuration}s`;

        if (response.ok && data.ok) {
            updateProgress(100, 'Mission Complete');

            const sent = data.sent ?? 0;
            const failed = data.failed ?? 0;
            const attempts = data.attempts ?? 0;

            els.statSent.textContent = sent;
            els.statFailed.textContent = failed;
            els.statAttempts.textContent = attempts;

            appendLog(`[SUCCESS] Payload dispatched! Sent: ${sent}, Failed: ${failed} in ${data.elapsedSec ?? totalDuration}s`, 'success');

            // Render Payload Breakdown
            els.payloadBreakdown.classList.remove('hidden');
            els.bdShotgun.textContent = data.shotgunPerRequest ?? '20';
            els.bdRetry.textContent = data.retryPerRequest ?? '10';
            els.bdDevices.textContent = data.devicesAvailable ?? '-';
            els.bdElapsed.textContent = `${data.elapsedSec ?? totalDuration}s`;

            if (data.note) {
                els.bdNote.textContent = data.note;
                els.bdNote.classList.remove('hidden');
            } else {
                els.bdNote.classList.add('hidden');
            }

            // Save to Session History
            saveSessionHistory({
                timestamp: new Date().toLocaleTimeString('en-US', { hour12: true }),
                target: `+${number}`,
                message: msg || 'Default Payload',
                requested: count,
                sent: sent,
                failed: failed,
                latency: `${data.elapsedSec || totalDuration}s`,
                status: failed === 0 ? 'success' : (sent > 0 ? 'partial' : 'failed')
            });

            showToast(`Successfully processed ${sent} dispatches!`, 'success');

        } else {
            updateProgress(100, 'Failed');
            const errorReason = data.error || data.msg || 'Dispatch error';
            appendLog(`[ERROR] Server responded with error: ${errorReason}`, 'error');
            showToast(`Dispatch failed: ${errorReason}`, 'error');
        }

    } catch (err) {
        clearInterval(timerInterval);
        if (err.name === 'AbortError') {
            updateProgress(0, 'Aborted');
            appendLog(`[WARN] Session aborted by user operator.`, 'warn');
            showToast('Mission aborted', 'info');
        } else {
            updateProgress(0, 'Network Error');
            appendLog(`[CRITICAL] Network Exception: ${err.message}`, 'error');
            showToast(`Connection failed: ${err.message}`, 'error');
        }
    } finally {
        setExecutingUI(false);
    }
}

// ── Execution UI Toggle ──
function setExecutingUI(isExecuting) {
    state.isExecuting = isExecuting;
    if (isExecuting) {
        els.btnLaunch.disabled = true;
        els.launchSpinner.classList.remove('hidden');
        els.launchBtnText.textContent = 'Processing Payload...';
        els.btnAbort.classList.remove('hidden');
    } else {
        els.btnLaunch.disabled = false;
        els.launchSpinner.classList.add('hidden');
        els.launchBtnText.textContent = 'Dispatch Payload';
        els.btnAbort.classList.add('hidden');
    }
}

function abortExecution() {
    if (state.abortController) {
        state.abortController.abort();
    }
}

function resetTelemetry() {
    els.progressStateTitle.textContent = 'Initializing...';
    els.progressPctText.textContent = '0%';
    els.progressBarFill.style.width = '0%';
    els.statSent.textContent = '0';
    els.statFailed.textContent = '0';
    els.statAttempts.textContent = '0';
    els.statTime.textContent = '0.0s';
    els.payloadBreakdown.classList.add('hidden');
}

function updateProgress(percent, statusText) {
    els.progressPctText.textContent = `${percent}%`;
    els.progressBarFill.style.width = `${percent}%`;
    if (statusText) els.progressStateTitle.textContent = statusText;
}

// ── Log Stream ──
function appendLog(message, type = 'info') {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;

    const time = new Date().toLocaleTimeString('en-US', { hour12: true });
    line.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg">${escapeHtml(message)}</span>`;

    els.terminalLog.appendChild(line);
    
    // Memory leak prevention: Cap terminal lines at 100 max, keep index 0 (the init msg)
    while (els.terminalLog.children.length > 100) {
        if (els.terminalLog.children.length > 1) {
            els.terminalLog.removeChild(els.terminalLog.children[1]);
        } else {
            break;
        }
    }

    els.terminalLog.scrollTop = els.terminalLog.scrollHeight;
}

// ── Audit History Management ──
function saveSessionHistory(item) {
    state.history.unshift(item);
    if (state.history.length > 50) state.history.pop();
    localStorage.setItem('bomber_history', JSON.stringify(state.history));
    renderHistoryTable();
}

function renderHistoryTable() {
    if (!state.history || state.history.length === 0) {
        els.historyTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">No previous dispatch missions recorded in this session.</td>
            </tr>`;
        return;
    }

    els.historyTableBody.innerHTML = state.history.map((row, idx) => `
        <tr>
            <td data-label="#" style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--text-dim);">${state.history.length - idx}</td>
            <td data-label="Timestamp" style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(String(row.timestamp))}</td>
            <td data-label="Target" style="font-family: 'JetBrains Mono', monospace; font-weight: 600;">${escapeHtml(String(row.target))}</td>
            <td data-label="Message" title="${escapeHtml(row.message || '')}">${escapeHtml((row.message || '').length > 22 ? (row.message || '').substring(0, 22) + '...' : (row.message || ''))}</td>
            <td data-label="Requested" style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(String(row.requested))}</td>
            <td data-label="Sent" style="font-family: 'JetBrains Mono', monospace;" class="text-success">${escapeHtml(String(row.sent))}</td>
            <td data-label="Failed" style="font-family: 'JetBrains Mono', monospace;" class="text-danger">${escapeHtml(String(row.failed))}</td>
            <td data-label="Latency" style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(String(row.latency))}</td>
            <td data-label="Status"><span class="badge-status ${escapeHtml(String(row.status))}">${escapeHtml(String(row.status))}</span></td>
        </tr>
    `).join('');
}

// ── Utility ──
function exportHistoryData() {
    if (state.history.length === 0) {
        showToast('No history available to export', 'info');
        return;
    }
    
    // Safer and much more robust than Data URI concatenation
    const jsonStr = JSON.stringify(state.history, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', url);
    dlAnchor.setAttribute('download', `bomber_history_${Date.now()}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    
    URL.revokeObjectURL(url); // Free up memory
    showToast('Exported audit history JSON', 'success');
}

function clearHistoryData() {
    state.history = [];
    localStorage.removeItem('bomber_history');
    renderHistoryTable();
    showToast('Audit history cleared', 'info');
}

// ── Notification Toast ──
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    els.toastStack.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.2s ease';
        setTimeout(() => toast.remove(), 200);
    }, 3500);
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
