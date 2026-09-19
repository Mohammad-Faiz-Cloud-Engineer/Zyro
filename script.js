/* ═══════════════════════════════════════════════════════════════════
   Zyro - SMS Bomber Engine & State Controller (Pure Light Theme)
   Deep Checked & Hardened against logic errors and DOM leaks.
   ═══════════════════════════════════════════════════════════════════ */

const HISTORY_KEY = 'bomber_history';
const HISTORY_LIMIT = 50;
const TERMINAL_LINE_LIMIT = 100;
const TOAST_LIMIT = 5;
const HEALTH_INTERVAL_MS = 25000;
const HEALTH_TIMEOUT_MS = 10000;
const DISPATCH_TIMEOUT_MS = 180000;
const MAX_TOAST_MS = 3500;

// Same-origin only. The Vercel gateway sends no Access-Control-Allow-Origin,
// so a browser call to it can never be read. server.js (local / Docker / HF) proxies /api.
const API_BASE_URL = '';

function loadHistory() {
    try {
        const rawHistory = localStorage.getItem(HISTORY_KEY);
        if (!rawHistory) return [];
        const parsed = JSON.parse(rawHistory);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('Recovered from corrupted localStorage history state.');
        return [];
    }
}

function persistHistory() {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
    } catch (e) {
        console.warn('Unable to persist history (storage quota or access denied).');
        showToast('Could not save history to this browser', 'error');
    }
}

// ── State Management ──
const state = {
    isExecuting: false,
    abortController: null,
    healthAbort: null,
    healthTimer: null,
    history: loadHistory(),
    pdfKeyHandler: null,
    lastApiConfig: null,
};

// ── DOM Elements ──
const els = {
    apiStatusPill: document.getElementById('apiStatusPill'),
    apiStatusText: document.getElementById('apiStatusText'),
    valDevices: document.getElementById('valDevices'),
    valDatabases: document.getElementById('valDatabases'),
    valMaxCount: document.getElementById('valMaxCount'),
    valMaxWorkers: document.getElementById('valMaxWorkers'),
    rangeMax: document.getElementById('rangeMax'),
    rangeMid: document.getElementById('rangeMid'),

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

    progressStateTitle: document.getElementById('progressStateTitle'),
    progressPctText: document.getElementById('progressPctText'),
    progressBarFill: document.getElementById('progressBarFill'),
    statSent: document.getElementById('statSent'),
    statFailed: document.getElementById('statFailed'),
    statAttempts: document.getElementById('statAttempts'),
    statTime: document.getElementById('statTime'),
    terminalLog: document.getElementById('terminalLog'),
    btnClearTerminal: document.getElementById('btnClearTerminal'),

    payloadBreakdown: document.getElementById('payloadBreakdown'),
    bdShotgun: document.getElementById('bdShotgun'),
    bdRetry: document.getElementById('bdRetry'),
    bdDevices: document.getElementById('bdDevices'),
    bdElapsed: document.getElementById('bdElapsed'),
    bdNote: document.getElementById('bdNote'),

    historyTableBody: document.getElementById('historyTableBody'),
    exportDropdown: document.getElementById('exportDropdown'),
    btnExportMenu: document.getElementById('btnExportMenu'),
    exportMenu: document.getElementById('exportMenu'),
    btnExportCSV: document.getElementById('btnExportCSV'),
    btnExportPDF: document.getElementById('btnExportPDF'),
    btnExportHistory: document.getElementById('btnExportHistory'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    toastStack: document.getElementById('toastStack')
};

// ── Initialization ──
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    renderHistoryTable();
    syncCountChips(els.countSlider.value);
    scheduleHealthCheck(true);
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        pauseHealthLoop();
        return;
    }
    scheduleHealthCheck(true);
});

window.addEventListener('pageshow', (event) => {
    if (event.persisted) scheduleHealthCheck(true);
});

window.addEventListener('pagehide', () => {
    pauseHealthLoop();
    closePdfPreview();
});

// ── Event Listeners Setup ──
function setupEventListeners() {
    els.countryCode.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
    });

    els.phoneNumber.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12);
    });

    function autoResizeTextarea() {
        els.customMessage.style.height = 'auto';
        const next = Math.min(els.customMessage.scrollHeight, 250);
        els.customMessage.style.height = next + 'px';
    }

    els.customMessage.addEventListener('input', () => {
        const len = els.customMessage.value.length;
        els.charCounter.textContent = `${len} / 2000`;
        autoResizeTextarea();
    });

    document.querySelectorAll('.msg-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            if (state.isExecuting) return;
            els.customMessage.value = chip.dataset.msg || '';
            els.charCounter.textContent = `${els.customMessage.value.length} / 2000`;
            autoResizeTextarea();
        });
    });

    els.clearMsgBtn.addEventListener('click', () => {
        if (state.isExecuting) return;
        els.customMessage.value = '';
        els.charCounter.textContent = '0 / 2000';
        autoResizeTextarea();
    });

    els.countSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        els.countDisplay.textContent = val;
        syncCountChips(val);
    });

    document.querySelectorAll('.count-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            if (state.isExecuting) return;
            const max = Number(els.countSlider.max) || 1000;
            const min = Number(els.countSlider.min) || 1;
            const val = clamp(Number(chip.dataset.val), min, max);
            els.countSlider.value = String(val);
            els.countDisplay.textContent = String(val);
            syncCountChips(val);
        });
    });

    els.attackForm.addEventListener('submit', handleFormSubmit);
    els.btnAbort.addEventListener('click', abortExecution);

    els.btnClearTerminal.addEventListener('click', () => {
        els.terminalLog.innerHTML = '';
        appendLog('Console buffer cleared.', 'info');
    });

    els.btnExportMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        els.exportMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (els.exportDropdown && !els.exportDropdown.contains(e.target)) {
            els.exportMenu.classList.add('hidden');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            els.exportMenu.classList.add('hidden');
        }
    });

    els.btnExportCSV.addEventListener('click', () => { els.exportMenu.classList.add('hidden'); exportHistoryCSV(); });
    els.btnExportPDF.addEventListener('click', () => { els.exportMenu.classList.add('hidden'); exportHistoryPDF(); });
    els.btnExportHistory.addEventListener('click', () => { els.exportMenu.classList.add('hidden'); exportHistoryData(); });
    els.btnClearHistory.addEventListener('click', clearHistoryData);
}

function clamp(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
}

function syncCountChips(value) {
    const strVal = String(value);
    document.querySelectorAll('.count-chip').forEach(chip => {
        if (chip.dataset.val === strVal) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });

    const min = Number(els.countSlider.min) || 1;
    const max = Number(els.countSlider.max) || 1000;
    const numeric = Number(value);
    const span = Math.max(max - min, 1);
    const pct = ((clamp(numeric, min, max) - min) / span) * 100;
    els.countSlider.style.background = `linear-gradient(to right, var(--primary) ${pct}%, var(--border-color) ${pct}%)`;
}

function applyApiLimits(config) {
    if (arguments.length > 0) {
        state.lastApiConfig = (config && typeof config === 'object') ? config : {};
    }
    if (!state.lastApiConfig) return;

    const maxCount = clamp(state.lastApiConfig.max_count ?? 1000, 1, 100000);
    const maxWorkers = state.lastApiConfig.max_workers ?? 40;

    els.valMaxCount.textContent = String(maxCount);
    els.valMaxWorkers.textContent = String(maxWorkers);

    // Setting input.max below the current value clamps the control in browsers.
    // Do not mutate the form while a request is in flight.
    if (state.isExecuting) return;

    els.countSlider.max = String(maxCount);

    if (els.rangeMax) els.rangeMax.textContent = String(maxCount);
    if (els.rangeMid) els.rangeMid.textContent = String(Math.round(maxCount / 2));

    if (Number(els.countSlider.value) > maxCount) {
        els.countSlider.value = String(maxCount);
        els.countDisplay.textContent = String(maxCount);
    }
    syncCountChips(els.countSlider.value);
}

async function fetchWithTimeout(url, options = {}, timeoutMs) {
    const controller = new AbortController();
    const parent = options.signal;
    const onParentAbort = () => controller.abort();
    if (parent) {
        if (parent.aborted) controller.abort();
        else parent.addEventListener('abort', onParentAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
        if (parent) parent.removeEventListener('abort', onParentAbort);
    }
}

let healthLoopId = 0;
let healthGeneration = 0;

function pauseHealthLoop() {
    healthLoopId += 1;
    if (state.healthTimer) {
        clearTimeout(state.healthTimer);
        state.healthTimer = null;
    }
    if (state.healthAbort) state.healthAbort.abort();
}

function scheduleHealthCheck(immediate) {
    pauseHealthLoop();
    const myId = healthLoopId;

    const run = () => {
        if (myId !== healthLoopId) return;
        fetchSystemHealth().finally(() => {
            if (myId !== healthLoopId) return;
            state.healthTimer = setTimeout(run, HEALTH_INTERVAL_MS);
        });
    };

    if (immediate) run();
    else state.healthTimer = setTimeout(run, HEALTH_INTERVAL_MS);
}

async function fetchSystemHealth() {
    if (document.hidden || state.isExecuting) return;

    const generation = ++healthGeneration;
    if (state.healthAbort) state.healthAbort.abort();
    state.healthAbort = new AbortController();

    try {
        const res = await fetchWithTimeout(
            `${API_BASE_URL}/api/health`,
            { signal: state.healthAbort.signal, cache: 'no-store' },
            HEALTH_TIMEOUT_MS
        );

        if (generation !== healthGeneration) return;

        let data;
        try {
            data = await res.json();
        } catch (jsonErr) {
            if (generation !== healthGeneration) return;
            if (jsonErr && jsonErr.name === 'AbortError') return;
            setOfflineStatus();
            return;
        }

        if (generation !== healthGeneration) return;

        if (res.ok && data && data.ok) {
            els.apiStatusPill.className = 'api-status-pill online';
            els.apiStatusText.textContent = 'Operational';
            els.valDevices.textContent = data.cachedDevices ?? '-';
            els.valDatabases.textContent = data.dbs ?? '-';
            applyApiLimits(data.config);
        } else {
            setOfflineStatus();
        }
    } catch (err) {
        if (generation !== healthGeneration) return;
        // pauseHealthLoop() / a newer poll aborts the parent signal. Timeouts abort
        // only the child controller — those should still surface as offline.
        if (err && err.name === 'AbortError' && state.healthAbort && state.healthAbort.signal.aborted) {
            return;
        }
        setOfflineStatus();
    }
}

function setOfflineStatus() {
    els.apiStatusPill.className = 'api-status-pill offline';
    els.apiStatusText.textContent = 'Server Offline';
    els.valDevices.textContent = '-';
    els.valDatabases.textContent = '-';
}

function currentTimestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: true });
}

function buildTargetLabel(rawCountry, rawPhone) {
    const cc = String(rawCountry || '').replace(/\D/g, '');
    const pn = String(rawPhone || '').replace(/\D/g, '');
    return `+${cc} ${pn}`.trim();
}

async function handleFormSubmit(e) {
    e.preventDefault();
    if (state.isExecuting) return;

    const rawCountry = els.countryCode.value.trim();
    const rawPhone = els.phoneNumber.value.trim();
    const number = (rawCountry + rawPhone).replace(/\D/g, '');
    const msg = els.customMessage.value.trim() || 'System Payload Dispatch';
    const min = Number(els.countSlider.min) || 1;
    const max = Number(els.countSlider.max) || 1000;
    const count = clamp(parseInt(els.countSlider.value, 10), min, max);

    if (!rawCountry) {
        showToast('Country code is required', 'error');
        els.countryCode.focus();
        return;
    }

    if (!number || number.length < 10 || number.length > 15) {
        showToast('Combined phone number (country code + number) must be 10-15 digits', 'error');
        els.phoneNumber.focus();
        return;
    }

    setExecutingUI(true);
    resetTelemetry();

    appendLog(`[DISPATCH] Preparing payload for +${number}...`, 'info');
    appendLog(`[CONFIG] Count: ${count} | Msg: "${msg}"`, 'info');

    const queryParams = new URLSearchParams({
        number: number,
        count: String(count),
        msg: msg
    });

    const targetUrl = `${API_BASE_URL}/api?${queryParams.toString()}`;
    const sessionMeta = {
        target: buildTargetLabel(rawCountry, rawPhone),
        message: msg,
        requested: count,
    };

    state.abortController = new AbortController();
    const startTime = Date.now();
    let finishedTimeWritten = false;

    const timerInterval = setInterval(() => {
        if (finishedTimeWritten) return;
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        els.statTime.textContent = `${elapsedSec}s`;
    }, 100);

    const stampElapsed = () => {
        clearInterval(timerInterval);
        if (finishedTimeWritten) return ((Date.now() - startTime) / 1000).toFixed(2);
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
        els.statTime.textContent = `${totalDuration}s`;
        finishedTimeWritten = true;
        return totalDuration;
    };

    try {
        appendLog(`[HTTP] Initiating connection to gateway...`, 'info');
        updateProgress(20, 'Sending Requests...');

        const response = await fetchWithTimeout(targetUrl, {
            signal: state.abortController.signal,
            cache: 'no-store',
        }, DISPATCH_TIMEOUT_MS);

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(`Invalid JSON response (HTTP ${response.status})`);
        }

        const totalDuration = stampElapsed();

        if (response.ok && data.ok) {
            updateProgress(100, 'Mission Complete');

            const sent = data.sent ?? 0;
            const failed = data.failed ?? 0;
            const attempts = data.attempts ?? 0;

            els.statSent.textContent = sent;
            els.statFailed.textContent = failed;
            els.statAttempts.textContent = attempts;

            appendLog(`[SUCCESS] Payload dispatched! Sent: ${sent}, Failed: ${failed} in ${data.elapsedSec ?? totalDuration}s`, 'success');

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

            saveSessionHistory({
                timestamp: currentTimestamp(),
                target: sessionMeta.target,
                message: sessionMeta.message,
                requested: sessionMeta.requested,
                sent: sent,
                failed: failed,
                latency: `${data.elapsedSec || totalDuration}s`,
                status: failed === 0 ? 'success' : (sent > 0 ? 'partial' : 'failed')
            });

            showToast(`Successfully processed ${sent} dispatches!`, 'success');
        } else {
            updateProgress(100, 'Failed');
            const errorReason = data.error || data.msg || `Dispatch error (HTTP ${response.status})`;
            appendLog(`[ERROR] Server responded with error: ${errorReason}`, 'error');
            showToast(`Dispatch failed: ${errorReason}`, 'error');
            saveSessionHistory({
                timestamp: currentTimestamp(),
                target: sessionMeta.target,
                message: sessionMeta.message,
                requested: sessionMeta.requested,
                sent: data.sent ?? 0,
                failed: data.failed ?? sessionMeta.requested,
                latency: `${data.elapsedSec || totalDuration}s`,
                status: 'failed'
            });
        }
    } catch (err) {
        const totalDuration = stampElapsed();
        if (err.name === 'AbortError') {
            const userAbort = Boolean(state.abortController && state.abortController.signal.aborted);
            if (userAbort) {
                updateProgress(0, 'Aborted');
                appendLog(`[WARN] Session aborted by user operator.`, 'warn');
                showToast('Mission aborted', 'info');
                saveSessionHistory({
                    timestamp: currentTimestamp(),
                    target: sessionMeta.target,
                    message: sessionMeta.message,
                    requested: sessionMeta.requested,
                    sent: 0,
                    failed: 0,
                    latency: `${totalDuration}s`,
                    status: 'aborted'
                });
            } else {
                updateProgress(0, 'Timed Out');
                appendLog(`[ERROR] Gateway timed out after ${DISPATCH_TIMEOUT_MS / 1000}s.`, 'error');
                showToast('Dispatch timed out', 'error');
                saveSessionHistory({
                    timestamp: currentTimestamp(),
                    target: sessionMeta.target,
                    message: sessionMeta.message,
                    requested: sessionMeta.requested,
                    sent: 0,
                    failed: sessionMeta.requested,
                    latency: `${totalDuration}s`,
                    status: 'failed'
                });
            }
        } else {
            updateProgress(0, 'Network Error');
            appendLog(`[CRITICAL] Network Exception: ${err.message}`, 'error');
            showToast(`Connection failed: ${err.message}`, 'error');
            saveSessionHistory({
                timestamp: currentTimestamp(),
                target: sessionMeta.target,
                message: sessionMeta.message,
                requested: sessionMeta.requested,
                sent: 0,
                failed: sessionMeta.requested,
                latency: `${totalDuration}s`,
                status: 'failed'
            });
        }
    } finally {
        clearInterval(timerInterval);
        state.abortController = null;
        setExecutingUI(false);
    }
}

function setExecutingUI(isExecuting) {
    state.isExecuting = isExecuting;
    document.querySelectorAll('.chip-btn').forEach((btn) => {
        btn.disabled = isExecuting;
    });
    if (isExecuting) {
        // Do not let a health probe share the proxy/upstream with a 180s dispatch.
        if (state.healthAbort) state.healthAbort.abort();
        els.btnLaunch.disabled = true;
        els.launchSpinner.classList.remove('hidden');
        els.launchBtnText.textContent = 'Processing Payload...';
        els.btnAbort.classList.remove('hidden');
        els.countryCode.disabled = true;
        els.phoneNumber.disabled = true;
        els.customMessage.disabled = true;
        els.countSlider.disabled = true;
    } else {
        els.btnLaunch.disabled = false;
        els.launchSpinner.classList.add('hidden');
        els.launchBtnText.textContent = 'Dispatch Payload';
        els.btnAbort.classList.add('hidden');
        els.countryCode.disabled = false;
        els.phoneNumber.disabled = false;
        els.customMessage.disabled = false;
        els.countSlider.disabled = false;
        applyApiLimits();
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
    els.progressBarFill.classList.remove('is-failed');
    els.statSent.textContent = '0';
    els.statFailed.textContent = '0';
    els.statAttempts.textContent = '0';
    els.statTime.textContent = '0.0s';
    els.payloadBreakdown.classList.add('hidden');
}

function updateProgress(percent, statusText) {
    const pct = clamp(percent, 0, 100);
    els.progressPctText.textContent = `${pct}%`;
    els.progressBarFill.style.width = `${pct}%`;
    if (statusText) els.progressStateTitle.textContent = statusText;
    const failed = /fail|error|abort/i.test(statusText || '');
    els.progressBarFill.classList.toggle('is-failed', failed);
}

function appendLog(message, type = 'info') {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;

    const time = currentTimestamp();
    const timeEl = document.createElement('span');
    timeEl.className = 'log-time';
    timeEl.textContent = `[${time}]`;
    const msgEl = document.createElement('span');
    msgEl.className = 'log-msg';
    msgEl.textContent = String(message);

    line.appendChild(timeEl);
    line.appendChild(msgEl);
    els.terminalLog.appendChild(line);

    while (els.terminalLog.children.length > TERMINAL_LINE_LIMIT) {
        els.terminalLog.removeChild(els.terminalLog.firstChild);
    }

    els.terminalLog.scrollTop = els.terminalLog.scrollHeight;
}

function saveSessionHistory(item) {
    state.history.unshift(item);
    if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
    persistHistory();
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

    const chronHistory = [...state.history].reverse();
    els.historyTableBody.replaceChildren();

    chronHistory.forEach((row, idx) => {
        const tr = document.createElement('tr');
        const cells = [
            ['#', String(idx + 1), 'mono dim'],
            ['Timestamp', String(row.timestamp ?? ''), 'mono'],
            ['Target', formatTarget(row.target), 'mono strong'],
            ['Message', truncate(String(row.message ?? ''), 22), ''],
            ['Requested', String(row.requested ?? ''), 'mono'],
            ['Sent', String(row.sent ?? ''), 'mono text-success'],
            ['Failed', String(row.failed ?? ''), 'mono text-danger'],
            ['Latency', String(row.latency ?? ''), 'mono'],
        ];

        cells.forEach(([label, text, extra]) => {
            const td = document.createElement('td');
            td.setAttribute('data-label', label);
            if (extra.includes('mono')) td.classList.add('td-mono');
            if (extra.includes('dim')) td.classList.add('td-dim');
            if (extra.includes('strong')) td.classList.add('td-strong');
            if (extra.includes('text-success')) td.classList.add('text-success');
            if (extra.includes('text-danger')) td.classList.add('text-danger');
            td.textContent = text;
            if (label === 'Message') td.title = String(row.message ?? '');
            tr.appendChild(td);
        });

        const statusTd = document.createElement('td');
        statusTd.setAttribute('data-label', 'Status');
        const badge = document.createElement('span');
        const status = String(row.status || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'unknown';
        badge.className = `badge-status ${status}`;
        badge.textContent = status;
        statusTd.appendChild(badge);
        tr.appendChild(statusTd);

        els.historyTableBody.appendChild(tr);
    });
}

function truncate(str, max) {
    if (str.length <= max) return str;
    return str.substring(0, max) + '...';
}

function csvCell(value) {
    let s = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
}

function exportHistoryCSV() {
    if (!state.history.length) {
        showToast('No history to export', 'error');
        return;
    }
    const headers = ['#', 'Timestamp', 'Target', 'Message', 'Requested', 'Sent', 'Failed', 'Latency', 'Status'];
    const rows = [...state.history].reverse().map((row, idx) => [
        csvCell(idx + 1),
        csvCell(row.timestamp),
        csvCell(formatTarget(row.target)),
        csvCell(row.message),
        csvCell(row.requested),
        csvCell(row.sent),
        csvCell(row.failed),
        csvCell(row.latency),
        csvCell(row.status)
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `zyro_mission_audit_${Date.now()}.csv`);
    showToast('Exported CSV successfully', 'success');
}

function closePdfPreview() {
    const overlay = document.getElementById('pdfPreviewOverlay');
    if (overlay) {
        if (overlay.dataset.blobUrl) {
            URL.revokeObjectURL(overlay.dataset.blobUrl);
        }
        overlay.remove();
    }
    if (state.pdfKeyHandler) {
        document.removeEventListener('keydown', state.pdfKeyHandler);
        state.pdfKeyHandler = null;
    }
}

function exportHistoryPDF() {
    if (!state.history.length) {
        showToast('No history to export', 'error');
        return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('PDF library is loading, please try again in a moment...', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
        showToast('PDF table plugin is not available', 'error');
        return;
    }

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;

    const ink      = [15, 23, 42];
    const muted    = [71, 85, 105];
    const dim      = [100, 116, 139];
    const primary  = [79, 70, 229];
    const border   = [226, 232, 240];
    const stripeBg = [248, 250, 252];

    doc.setFillColor(...primary);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('ZYRO', margin, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Mission Audit History', margin + 24, 12);
    doc.setFontSize(8);
    doc.text(`Generated ${new Date().toLocaleString()}`, pageW - margin, 12, { align: 'right' });

    doc.setDrawColor(...border);
    doc.setLineWidth(0.3);
    doc.line(margin, 22, pageW - margin, 22);

    const totalMissions = state.history.length;
    const totalSent = state.history.reduce((s, r) => s + (Number(r.sent) || 0), 0);
    const totalFailed = state.history.reduce((s, r) => s + (Number(r.failed) || 0), 0);
    const totalRequested = state.history.reduce((s, r) => s + (Number(r.requested) || 0), 0);

    doc.setFontSize(8);
    doc.setTextColor(...dim);
    doc.setFont('helvetica', 'normal');
    const statsY = 27;
    doc.text(`Total Missions: ${totalMissions}`, margin, statsY);
    doc.text(`Requested: ${totalRequested}`, margin + 50, statsY);
    doc.text(`Sent: ${totalSent}`, margin + 90, statsY);
    doc.text(`Failed: ${totalFailed}`, margin + 120, statsY);

    const tableColumn = ['#', 'Timestamp', 'Target', 'Message', 'Requested', 'Sent', 'Failed', 'Latency', 'Status'];
    const tableRows = [...state.history].reverse().map((row, idx) => [
        idx + 1,
        row.timestamp ?? '',
        formatTarget(row.target),
        row.message || '',
        row.requested ?? '',
        row.sent ?? '',
        row.failed ?? '',
        row.latency ?? '',
        row.status ?? ''
    ]);

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 32,
        margin: { left: margin, right: margin },
        theme: 'plain',
        styles: {
            fontSize: 7.5,
            cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
            textColor: ink,
            lineColor: border,
            lineWidth: 0.2,
            font: 'helvetica',
            overflow: 'linebreak'
        },
        headStyles: {
            fillColor: [241, 245, 249],
            textColor: muted,
            fontStyle: 'bold',
            fontSize: 7,
            halign: 'left'
        },
        bodyStyles: {
            halign: 'left'
        },
        alternateRowStyles: {
            fillColor: stripeBg
        },
        columnStyles: {
            0: { halign: 'center' },
            2: { fontStyle: 'bold' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center' },
            7: { halign: 'center' },
            8: { halign: 'center' }
        },
        didParseCell: function(data) {
            if (data.column.index === 8 && data.section === 'body') {
                const val = (data.cell.raw || '').toString().toLowerCase();
                if (val === 'completed' || val === 'success') {
                    data.cell.styles.textColor = [5, 150, 105];
                } else if (val === 'failed' || val === 'error') {
                    data.cell.styles.textColor = [220, 38, 38];
                } else if (val === 'partial') {
                    data.cell.styles.textColor = [217, 119, 6];
                } else if (val === 'aborted') {
                    data.cell.styles.textColor = [100, 116, 139];
                }
            }
        },
        didDrawPage: function(data) {
            doc.setFontSize(7);
            doc.setTextColor(...dim);
            doc.text(`Page ${data.pageNumber} of {totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
            doc.setDrawColor(...border);
            doc.setLineWidth(0.2);
            doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
            doc.text('Zyro Dispatch System', margin, pageH - 8);
        }
    });
    if (typeof doc.putTotalPages === 'function') {
        doc.putTotalPages('{totalPages}');
    }

    closePdfPreview();
    const blobUrl = doc.output('bloburl');

    const overlay = document.createElement('div');
    overlay.id = 'pdfPreviewOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'PDF preview');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;animation:fadeIn 0.2s ease;';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:10px;margin-bottom:12px;';

    const btnDownload = document.createElement('button');
    btnDownload.type = 'button';
    btnDownload.textContent = '\u2B07 Download PDF';
    btnDownload.style.cssText = 'padding:10px 20px;border:none;border-radius:8px;background:#4f46e5;color:#fff;font-weight:600;font-size:0.95rem;cursor:pointer;';
    btnDownload.addEventListener('click', () => {
        doc.save(`zyro_mission_audit_${Date.now()}.pdf`);
        showToast('PDF downloaded successfully', 'success');
    });

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.textContent = '\u2715 Close';
    btnClose.style.cssText = 'padding:10px 20px;border:1px solid rgba(255,255,255,0.3);border-radius:8px;background:transparent;color:#fff;font-weight:600;font-size:0.95rem;cursor:pointer;';
    btnClose.addEventListener('click', () => {
        closePdfPreview();
    });

    toolbar.appendChild(btnDownload);
    toolbar.appendChild(btnClose);

    const iframe = document.createElement('iframe');
    iframe.src = blobUrl;
    iframe.title = 'PDF preview';
    iframe.style.cssText = 'width:100%;max-width:1100px;height:82vh;border:none;border-radius:12px;background:#fff;';

    overlay.appendChild(toolbar);
    overlay.appendChild(iframe);
    overlay.dataset.blobUrl = blobUrl;
    document.body.appendChild(overlay);

    state.pdfKeyHandler = (e) => {
        if (e.key === 'Escape') {
            closePdfPreview();
        }
    };
    document.addEventListener('keydown', state.pdfKeyHandler);
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportHistoryData() {
    if (state.history.length === 0) {
        showToast('No history available to export', 'info');
        return;
    }

    const jsonStr = JSON.stringify(state.history, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    triggerDownload(blob, `bomber_history_${Date.now()}.json`);
    showToast('Exported audit history JSON', 'success');
}

function clearHistoryData() {
    if (!state.history.length) {
        showToast('No history to clear', 'info');
        return;
    }
    const confirmed = window.confirm('Clear all mission audit history from this browser?');
    if (!confirmed) return;
    state.history = [];
    try {
        localStorage.removeItem(HISTORY_KEY);
    } catch (e) {
        console.warn('Unable to remove history from localStorage.');
    }
    renderHistoryTable();
    showToast('Audit history cleared', 'info');
}

function showToast(message, type = 'info') {
    if (!els.toastStack) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = String(message);
    els.toastStack.appendChild(toast);

    while (els.toastStack.children.length > TOAST_LIMIT) {
        els.toastStack.removeChild(els.toastStack.firstChild);
    }

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.2s ease';
        setTimeout(() => toast.remove(), 200);
    }, MAX_TOAST_MS);
}

function formatTarget(targetStr) {
    if (!targetStr) return '';
    targetStr = String(targetStr);
    if (targetStr.includes(' ')) return targetStr;
    if (targetStr.startsWith('+91')) return targetStr.replace(/^(\+91)(\d+)/, '$1 $2');
    if (targetStr.startsWith('+1')) return targetStr.replace(/^(\+1)(\d+)/, '$1 $2');
    const intl = targetStr.match(/^(\+\d{1,3})(\d+)$/);
    if (intl) return `${intl[1]} ${intl[2]}`;
    return targetStr;
}
