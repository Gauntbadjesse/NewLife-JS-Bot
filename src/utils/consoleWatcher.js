const ConsoleLog = require('../models/ConsoleLog');
const mongoose = require('mongoose');
const { ChannelType, PermissionsBitField } = require('discord.js');

const TARGET_GUILD_ID = process.env.CONSOLE_GUILD_ID || '1453068910524895449';

let discordClient = null;
let pollingHandle = null;
let lastSeen = null;

function formatConsoleMessage(entry) {
    const when = entry.receivedAt ? new Date(entry.receivedAt).toISOString() : new Date().toISOString();
    return `[
${when}] [${entry.server || 'main'}] [${entry.level || 'INFO'}] ${entry.message.length > 1950 ? entry.message.slice(0,1950)+"..." : entry.message}`;
}

async function processEntry(entry) {
    try {
        console.log('[ConsoleWatcher] New console entry:', entry.level, entry.server, entry.message.substring(0,80));

        // Determine target channel: explicit env overrides take precedence
        const explicitChannel = process.env.CONSOLE_CHANNEL_ID;
        let sendChannel = null;

        if (explicitChannel && discordClient) {
            sendChannel = await discordClient.channels.fetch(explicitChannel).catch(()=>null);
        }

        // Otherwise use guild-specific channels created by the watcher
        if (!sendChannel && discordClient && TARGET_GUILD_ID) {
            if ((entry.level||'').toUpperCase() === 'ERROR' && errorsChannelId) {
                sendChannel = await discordClient.channels.fetch(errorsChannelId).catch(()=>null);
            } else if ((entry.level||'').toUpperCase() === 'WARN' && warningsChannelId) {
                sendChannel = await discordClient.channels.fetch(warningsChannelId).catch(()=>null);
            } else if (logsChannelId) {
                sendChannel = await discordClient.channels.fetch(logsChannelId).catch(()=>null);
            }
        }

        if (sendChannel) {
            try {
                const forwardLevels = (process.env.CONSOLE_FORWARD_LEVELS || 'ERROR,WARN').split(',').map(s=>s.trim().toUpperCase());
                if (forwardLevels.includes((entry.level||'').toUpperCase())) {
                    await sendChannel.send({ content: formatConsoleMessage(entry) });
                }
            } catch (e) { console.error('[ConsoleWatcher] Failed to send to channel:', e.message); }
        }
    } catch (e) {
        console.error('[ConsoleWatcher] processEntry error:', e.message);
    }
}

async function ensureGuildChannels(client) {
    try {
        if (!client) return;
        const guild = await client.guilds.fetch(TARGET_GUILD_ID).catch(() => null);
        if (!guild) {
            console.warn('[ConsoleWatcher] Target guild not available:', TARGET_GUILD_ID);
            return;
        }

        // Try to find or create a category
        let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === 'Console Logs');
        if (!category) {
            category = await guild.channels.create({ name: 'Console Logs', type: ChannelType.GuildCategory, permissionOverwrites: [] }).catch(()=>null);
        }

        // Helper to find or create channel
        async function getOrCreate(name, topic) {
            let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
            if (ch) return ch;
            const options = { name, type: ChannelType.GuildText, topic };
            if (category) options.parent = category.id;
            ch = await guild.channels.create(options).catch(err => { console.error('[ConsoleWatcher] failed to create channel', name, err.message); return null; });
            return ch;
        }

        const logsCh = await getOrCreate('console-logs', 'All console output');
        const errorsCh = await getOrCreate('console-errors', 'ERROR level console output');
        const warnsCh = await getOrCreate('console-warnings', 'WARN level console output');

        logsChannelId = logsCh ? logsCh.id : logsChannelId;
        errorsChannelId = errorsCh ? errorsCh.id : errorsChannelId;
        warningsChannelId = warnsCh ? warnsCh.id : warningsChannelId;

        console.log('[ConsoleWatcher] Resolved logging channels in guild', TARGET_GUILD_ID, logsChannelId, errorsChannelId, warningsChannelId);
    } catch (err) {
        console.error('[ConsoleWatcher] ensureGuildChannels error:', err.message);
    }
}

async function startChangeStream() {
    try {
        const changeStream = ConsoleLog.watch([], { fullDocument: 'updateLookup' });

        changeStream.on('change', async (change) => {
            if (change.operationType === 'insert') {
                const doc = change.fullDocument;
                lastSeen = doc.receivedAt || new Date();
                await processEntry(doc);
            }
        });

        changeStream.on('error', (err) => {
            console.error('[ConsoleWatcher] changeStream error:', err.message);
            // fallback to polling
            startPolling();
        });

        console.log('[ConsoleWatcher] Listening to ConsoleLog change stream');
        return true;
    } catch (err) {
        console.warn('[ConsoleWatcher] Change streams not available, falling back to polling:', err.message);
        return false;
    }
}

async function pollOnce() {
    try {
        const q = {};
        if (lastSeen) q.receivedAt = { $gt: lastSeen };
        const docs = await ConsoleLog.find(q).sort({ receivedAt: 1 }).limit(100).lean();
        for (const d of docs) {
            lastSeen = d.receivedAt || lastSeen;
            await processEntry(d);
        }
    } catch (err) {
        console.error('[ConsoleWatcher] pollOnce error:', err.message);
    }
}

function startPolling(intervalSec = 10) {
    if (pollingHandle) clearInterval(pollingHandle);
    // initialize lastSeen to now to avoid flooding
    lastSeen = lastSeen || new Date();
    pollingHandle = setInterval(() => pollOnce().catch(e=>console.error(e)), Math.max(1000, intervalSec*1000));
    console.log('[ConsoleWatcher] Polling console logs every', intervalSec, 'seconds');
}

async function initConsoleWatcher(client) {
    discordClient = client;
    // Ensure logging channels exist in the configured guild (best-effort)
    await ensureGuildChannels(client).catch(()=>{});

    // Try change stream first
    const ok = await startChangeStream();
    if (!ok) {
        // Start polling fallback
        startPolling(parseInt(process.env.CONSOLE_POLL_INTERVAL || '10', 10));
    }
}

module.exports = { initConsoleWatcher };
