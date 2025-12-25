/**
 * Console Routes
 * Handles console log data from Minecraft
 */

const express = require('express');
const router = express.Router();
const ConsoleLog = require('../../models/ConsoleLog');

/**
 * POST /console
 * Receive console log entry from Minecraft
 */
router.post('/', async (req, res) => {
    try {
        const { level, message, source, server, timestamp } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const logEntry = await ConsoleLog.create({
            level: level || 'INFO',
            message,
            source: source || 'Server',
            server: server || 'main',
            minecraftTimestamp: timestamp ? new Date(timestamp) : null
        });

        // Forward important logs to Discord if configured
        const client = req.discordClient;
        const consoleChannelId = process.env.CONSOLE_CHANNEL_ID;

        if (client && consoleChannelId && ['ERROR', 'WARN'].includes(level)) {
            try {
                const channel = await client.channels.fetch(consoleChannelId);
                if (channel) {
                    const color = level === 'ERROR' ? 0xE74C3C : 0xFFA500;
                    await channel.send({
                        embeds: [{
                            color,
                            title: `Console ${level}`,
                            description: `\`\`\`${message.substring(0, 4000)}\`\`\``,
                            fields: [
                                { name: 'Source', value: source || 'Server', inline: true },
                                { name: 'Server', value: server || 'main', inline: true }
                            ],
                            timestamp: new Date().toISOString()
                        }]
                    });
                }
            } catch (err) {
                console.error('[Console] Failed to forward to Discord:', err.message);
            }
        }

        res.json({ success: true, id: logEntry._id });
    } catch (error) {
        console.error('[Console] Error:', error.message);
        res.status(500).json({ error: 'Failed to save console log' });
    }
});

/**
 * POST /console/batch
 * Receive multiple console log entries at once
 */
router.post('/batch', async (req, res) => {
    try {
        const { logs, server } = req.body;

        if (!Array.isArray(logs)) {
            return res.status(400).json({ error: 'Logs must be an array' });
        }

        const entries = logs.map(log => ({
            level: log.level || 'INFO',
            message: log.message,
            source: log.source || 'Server',
            server: server || log.server || 'main',
            minecraftTimestamp: log.timestamp ? new Date(log.timestamp) : null
        }));

        await ConsoleLog.insertMany(entries);

        res.json({ success: true, count: entries.length });
    } catch (error) {
        console.error('[Console] Batch error:', error.message);
        res.status(500).json({ error: 'Failed to save console logs' });
    }
});

/**
 * GET /console/recent
 * Get recent console logs
 */
router.get('/recent', async (req, res) => {
    try {
        const { server, level, limit = 100 } = req.query;
        
        const query = {};
        if (server) query.server = server;
        if (level) query.level = level;

        const logs = await ConsoleLog.find(query)
            .sort({ receivedAt: -1 })
            .limit(Math.min(parseInt(limit), 500))
            .lean();

        res.json({ logs });
    } catch (error) {
        console.error('[Console] Error fetching logs:', error.message);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

module.exports = router;
