/**
 * Command Logger Utility
 * Logs all Discord command executions to database
 */

const CommandLog = require('../models/CommandLog');
const { EmbedBuilder } = require('discord.js');

/**
 * Log a command execution
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} options - Additional options
 */
async function logCommand(interaction, options = {}) {
    try {
        const startTime = Date.now();

        // Build full command string
        let fullCommand = `/${interaction.commandName}`;
        const args = {};

        if (interaction.options) {
            // Get subcommand if exists
            const subcommand = interaction.options.getSubcommand(false);
            if (subcommand) {
                fullCommand += ` ${subcommand}`;
            }

            // Get all options
            if (interaction.options.data) {
                for (const option of interaction.options.data) {
                    if (option.type === 1) { // Subcommand
                        for (const subOpt of option.options || []) {
                            args[subOpt.name] = subOpt.value;
                            fullCommand += ` ${subOpt.name}:${subOpt.value}`;
                        }
                    } else {
                        args[option.name] = option.value;
                        fullCommand += ` ${option.name}:${option.value}`;
                    }
                }
            }
        }

        // Find target user if applicable
        let targetUserId = null;
        let targetUsername = null;
        
        if (args.user) {
            const targetUser = interaction.options.getUser('user');
            if (targetUser) {
                targetUserId = targetUser.id;
                targetUsername = targetUser.tag;
            }
        }
        if (args.discord) {
            const targetUser = interaction.options.getUser('discord');
            if (targetUser) {
                targetUserId = targetUser.id;
                targetUsername = targetUser.tag;
            }
        }

        // Create log entry
        const logEntry = await CommandLog.create({
            command: interaction.commandName,
            subcommand: interaction.options?.getSubcommand(false) || null,
            fullCommand,
            userId: interaction.user.id,
            username: interaction.user.tag,
            displayName: interaction.member?.displayName || interaction.user.username,
            guildId: interaction.guild?.id || 'DM',
            guildName: interaction.guild?.name || 'Direct Message',
            channelId: interaction.channel?.id || 'unknown',
            channelName: interaction.channel?.name || 'unknown',
            arguments: args,
            targetUserId,
            targetUsername,
            success: options.success !== false,
            errorMessage: options.error || null,
            responseTime: options.responseTime || (Date.now() - startTime),
            executedAt: new Date()
        });

        return logEntry;
    } catch (error) {
        console.error('[CommandLogger] Error logging command:', error.message);
        return null;
    }
}

/**
 * Send command log to Discord channel
 * @param {Client} client - Discord client
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} options - Additional options
 */
async function sendCommandLogToChannel(client, interaction, options = {}) {
    const commandLogChannelId = process.env.COMMAND_LOG_CHANNEL_ID;
    if (!commandLogChannelId) return;

    try {
        const channel = await client.channels.fetch(commandLogChannelId);
        if (!channel) return;

        // Build command string
        let fullCommand = `/${interaction.commandName}`;
        if (interaction.options) {
            const subcommand = interaction.options.getSubcommand(false);
            if (subcommand) fullCommand += ` ${subcommand}`;

            if (interaction.options.data) {
                for (const option of interaction.options.data) {
                    if (option.type === 1) {
                        for (const subOpt of option.options || []) {
                            fullCommand += ` ${subOpt.name}:${subOpt.value}`;
                        }
                    } else {
                        fullCommand += ` ${option.name}:${option.value}`;
                    }
                }
            }
        }

        const embed = new EmbedBuilder()
            .setColor(options.success !== false ? 0x3498DB : 0xE74C3C)
            .setTitle('Command Executed')
            .addFields(
                { name: 'Command', value: `\`${fullCommand}\``, inline: false },
                { name: 'User', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                { name: 'Channel', value: `<#${interaction.channel?.id}>`, inline: true }
            )
            .setTimestamp();

        if (options.error) {
            embed.addFields({ name: 'Error', value: options.error, inline: false });
        }

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('[CommandLogger] Error sending to channel:', error.message);
    }
}

/**
 * Middleware-style function to wrap command execution with logging
 * @param {Function} executeFn - Original execute function
 * @returns {Function} Wrapped function
 */
function withLogging(executeFn) {
    return async function(interaction, client) {
        const startTime = Date.now();
        let success = true;
        let errorMessage = null;

        try {
            await executeFn(interaction, client);
        } catch (error) {
            success = false;
            errorMessage = error.message;
            throw error;
        } finally {
            const responseTime = Date.now() - startTime;
            
            // Log to database
            await logCommand(interaction, { success, error: errorMessage, responseTime });
            
            // Log to Discord channel
            await sendCommandLogToChannel(client, interaction, { success, error: errorMessage });
        }
    };
}

/**
 * Get command usage statistics
 * @param {Object} filters - Query filters
 */
async function getCommandStats(filters = {}) {
    const query = {};
    if (filters.guildId) query.guildId = filters.guildId;
    if (filters.userId) query.userId = filters.userId;
    if (filters.command) query.command = filters.command;
    if (filters.since) query.executedAt = { $gte: filters.since };

    const stats = await CommandLog.aggregate([
        { $match: query },
        {
            $group: {
                _id: '$command',
                count: { $sum: 1 },
                successCount: { $sum: { $cond: ['$success', 1, 0] } },
                avgResponseTime: { $avg: '$responseTime' }
            }
        },
        { $sort: { count: -1 } }
    ]);

    return stats;
}

/**
 * Get user's command history
 * @param {string} userId - Discord user ID
 * @param {number} limit - Max results
 */
async function getUserCommandHistory(userId, limit = 50) {
    return CommandLog.find({ userId })
        .sort({ executedAt: -1 })
        .limit(limit)
        .lean();
}

/**
 * Get recent commands for a guild
 * @param {string} guildId - Guild ID
 * @param {number} limit - Max results
 */
async function getGuildCommandHistory(guildId, limit = 100) {
    return CommandLog.find({ guildId })
        .sort({ executedAt: -1 })
        .limit(limit)
        .lean();
}

module.exports = {
    logCommand,
    sendCommandLogToChannel,
    withLogging,
    getCommandStats,
    getUserCommandHistory,
    getGuildCommandHistory
};
