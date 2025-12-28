const fetch = globalThis.fetch || require('node-fetch');

const DEFAULT_URLS = (process.env.MONITOR_BASE_URLS || 'http://127.0.0.1:' + (process.env.API_PORT || 25577) + ',https://dashboard.newlifesmp.com:' + (process.env.API_PORT || 25577)).split(',');

const ENDPOINTS = [
    '/health',
    '/player/online',
    '/whitelist',
    '/whitelist/pending',
    '/console/recent'
];

function nowISO() { return new Date().toISOString(); }

function safeFetch(url, opts = {}) {
    return fetch(url, { method: 'GET', timeout: 5000, ...opts })
        .then(res => ({ ok: res.ok, status: res.status, json: () => res.json().catch(() => null) }))
        .catch(err => ({ ok: false, error: err.message }));
}

async function checkBaseUrl(baseUrl) {
    const results = {};
    for (const ep of ENDPOINTS) {
        const url = baseUrl.replace(/\/$/, '') + ep;
        try {
            const r = await safeFetch(url);
            if (r.ok) {
                const body = await r.json();
                results[ep] = { ok: true, status: r.status, body };
            } else {
                results[ep] = { ok: false, status: r.status || 0, error: r.error || 'non-200' };
            }
        } catch (e) {
            results[ep] = { ok: false, error: e.message };
        }
    }
    return results;
}

function findRecentConsole(logs, minutes = 5) {
    if (!Array.isArray(logs)) return false;
    const cutoff = Date.now() - minutes * 60 * 1000;
    for (const l of logs) {
        const ts = new Date(l.receivedAt || l.minecraftTimestamp || l.timestamp || null).getTime();
        if (!isNaN(ts) && ts >= cutoff) return true;
    }
    return false;
}

function formatStatus(baseUrl, results) {
    let ok = true;
    const parts = [];
    for (const [ep, r] of Object.entries(results)) {
        if (r.ok) parts.push(`${ep}:OK`);
        else { parts.push(`${ep}:ERR`); ok = false; }
    }
    return { baseUrl, ok, summary: parts.join(',') };
}

async function runChecks(client) {
    const urls = DEFAULT_URLS;
    for (const baseUrl of urls) {
        const res = await checkBaseUrl(baseUrl);
        const status = formatStatus(baseUrl, res);
        console.log(`[PluginMonitor ${nowISO()}] ${status.baseUrl} => ${status.summary}`);

        // If console/recent exists, check for recent entries
        const consoleRes = res['/console/recent'];
        let recentFound = false;
        if (consoleRes && consoleRes.ok && consoleRes.body && consoleRes.body.logs) {
            recentFound = findRecentConsole(consoleRes.body.logs, 10);
        }

        if (!recentFound) {
            const msg = `PluginMonitor: No recent console logs from ${baseUrl} (last 10m)`;
            console.warn(msg);
            const channelId = process.env.CONSOLE_CHANNEL_ID || process.env.COMMAND_LOG_CHANNEL_ID;
            if (client && channelId) {
                try { client.channels.fetch(channelId).then(ch => ch && ch.send({ content: msg }).catch(()=>{})).catch(()=>{}); } catch(e){}
            }
        }
    }
}

let intervalHandle = null;

function startMonitor(client, intervalSec = 30) {
    if (intervalHandle) clearInterval(intervalHandle);
    // Run immediately
    runChecks(client).catch(err => console.error('[PluginMonitor] initial run failed', err.message));
    intervalHandle = setInterval(() => {
        runChecks(client).catch(err => console.error('[PluginMonitor] run failed', err.message));
    }, Math.max(5000, intervalSec * 1000));
}

module.exports = { startMonitor };
