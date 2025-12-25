/**
 * Player Routes
 * Handles player join/leave events and playtime tracking
 */

const express = require('express');
const router = express.Router();
const PlayerSession = require('../../models/PlayerSession');
const Whitelist = require('../../models/Whitelist');
const { EmbedBuilder } = require('discord.js');

/**
 * POST /player/join
 * Handle player join event
 */
router.post('/join', async (req, res) => {
    try {
        const { username, uuid, ip, server } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        // Find linked Discord ID from whitelist
        const whitelistEntry = await Whitelist.findOne({ 
            minecraftUsername: username.toLowerCase(),
            active: true
        });

        // Create session
        const session = await PlayerSession.create({
            minecraftUsername: username.toLowerCase(),
            minecraftUuid: uuid || null,
            discordId: whitelistEntry?.discordId || null,
            joinTime: new Date(),
            isOnline: true,
            ipHash: ip ? require('crypto').createHash('sha256').update(ip).digest('hex').substring(0, 16) : null,
            server: server || 'main'
        });

        // Notify Discord if configured
        const client = req.discordClient;
        const joinLeaveChannelId = process.env.JOIN_LEAVE_CHANNEL_ID;

        if (client && joinLeaveChannelId) {
            try {
                const channel = await client.channels.fetch(joinLeaveChannelId);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle('Player Joined')
                        .addFields(
                            { name: 'Username', value: username, inline: true },
                            { name: 'Server', value: server || 'main', inline: true }
                        )
                        .setTimestamp();

                    if (whitelistEntry?.discordId) {
                        embed.addFields({ name: 'Discord', value: `<@${whitelistEntry.discordId}>`, inline: true });
                    }

                    await channel.send({ embeds: [embed] });
                }
            } catch (err) {
                console.error('[Player] Failed to notify Discord:', err.message);
            }
        }

        res.json({ success: true, sessionId: session._id });
    } catch (error) {
        console.error('[Player] Join error:', error.message);
        res.status(500).json({ error: 'Failed to record join' });
    }
});

/**
 * POST /player/leave
 * Handle player leave event
 */
router.post('/leave', async (req, res) => {
    try {
        const { username, uuid, server } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        // Find active session
        const session = await PlayerSession.findOne({
            minecraftUsername: username.toLowerCase(),
            isOnline: true,
            server: server || 'main'
        });

        if (!session) {
            return res.status(404).json({ error: 'No active session found' });
        }

        // Calculate duration
        const leaveTime = new Date();
        const duration = Math.floor((leaveTime - session.joinTime) / 1000);

        // Update session
        session.leaveTime = leaveTime;
        session.duration = duration;
        session.isOnline = false;
        await session.save();

        // Format duration for display
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        // Notify Discord if configured
        const client = req.discordClient;
        const joinLeaveChannelId = process.env.JOIN_LEAVE_CHANNEL_ID;

        if (client && joinLeaveChannelId) {
            try {
                const channel = await client.channels.fetch(joinLeaveChannelId);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle('Player Left')
                        .addFields(
                            { name: 'Username', value: username, inline: true },
                            { name: 'Server', value: server || 'main', inline: true },
                            { name: 'Session Duration', value: durationStr, inline: true }
                        )
                        .setTimestamp();

                    await channel.send({ embeds: [embed] });
                }
            } catch (err) {
                console.error('[Player] Failed to notify Discord:', err.message);
            }
        }

        res.json({ success: true, duration });
    } catch (error) {
        console.error('[Player] Leave error:', error.message);
        res.status(500).json({ error: 'Failed to record leave' });
    }
});

/**
 * POST /player/command
 * Log player command execution in Minecraft
 */
router.post('/command', async (req, res) => {
    try {
        const { username, command, server } = req.body;

        if (!username || !command) {
            return res.status(400).json({ error: 'Username and command are required' });
        }

        // Log to console
        console.log(`[MC Command] ${username} on ${server || 'main'}: ${command}`);

        // Notify Discord in configured channel
        const client = req.discordClient;
        const channelId = process.env.PLAYER_COMMAND_CHANNEL_ID || '1453068911472803973';

        if (client && channelId) {
            try {
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('Player Command')
                        .setColor(0x3498DB)
                        .addFields(
                            { name: 'Player', value: username, inline: true },
                            { name: 'Server', value: server || 'main', inline: true },
                            { name: 'Command', value: command.substring(0, 1024) }
                        )
                        .setTimestamp();

                    await channel.send({ embeds: [embed] }).catch(() => null);
                }
            } catch (err) {
                console.error('[Player] Failed to notify Discord for command:', err.message);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Player] Command log error:', error.message);
        res.status(500).json({ error: 'Failed to log command' });
    }
});

/**
 * GET /player/online
 * Get currently online players
 */
router.get('/online', async (req, res) => {
    try {
        const { server } = req.query;
        const players = await PlayerSession.getOnlinePlayers(server || null);

        res.json({
            count: players.length,
            players: players.map(p => ({
                username: p.minecraftUsername,
                joinTime: p.joinTime,
                server: p.server
            }))
        });
    } catch (error) {
        console.error('[Player] Error fetching online:', error.message);
        res.status(500).json({ error: 'Failed to fetch online players' });
    }
});

/**
 * GET /player/playtime/:username
 * Get playtime for a specific player
 */
router.get('/playtime/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const totalSeconds = await PlayerSession.getTotalPlaytime(username);

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        // Get recent sessions
        const sessions = await PlayerSession.find({ 
            minecraftUsername: username.toLowerCase() 
        })
            .sort({ joinTime: -1 })
            .limit(10)
            .lean();

        res.json({
            username,
            totalSeconds,
            totalFormatted: `${hours}h ${minutes}m`,
            recentSessions: sessions
        });
    } catch (error) {
        console.error('[Player] Playtime error:', error.message);
        res.status(500).json({ error: 'Failed to get playtime' });
    }
});

module.exports = router;
