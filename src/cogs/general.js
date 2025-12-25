/**
 * General Cog
 * Handles help, history, and utility commands for NewLife Management Bot
 * 
 * Permissions:
 * - /help: Everyone
 * - /history: Moderator+
 * - /lookup: Moderator+
 * - /stats: Admin+
 * - /ping: Everyone
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Warning = require('../database/models/Warning');
const Ban = require('../database/models/Ban');
const { 
    createHistoryEmbed, 
    createErrorEmbed,
    getEmbedColor
} = require('../utils/embeds');
const { isStaff, isAdmin } = require('../utils/permissions');

/**
 * Prefix Commands
 */
const commands = {
    // !help - Show all available commands
    help: {
        name: 'help',
        description: 'Show all available commands',
        usage: '!help [command]',
        async execute(message, args, client) {
            const prefix = process.env.BOT_PREFIX || '!';

            if (args[0]) {
                // Show specific command help
                const commandName = args[0].toLowerCase();
                const command = client.commands.get(commandName);

                if (!command) {
                    return message.reply({
                        embeds: [createErrorEmbed('Command Not Found', `No command found with name: \`${commandName}\``)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(getEmbedColor())
                    .setTitle(`Command: ${prefix}${command.name}`)
                    .setDescription(command.description || 'No description available')
                    .addFields({
                        name: 'Usage',
                        value: `\`${command.usage || `${prefix}${command.name}`}\``,
                        inline: false
                    })
                    .setFooter({ text: 'NewLife Management | Help System' })
                    .setTimestamp();

                return message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                });
            }

            // Show all commands
            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('NewLife Management Commands')
                .setDescription(`Use \`${prefix}help <command>\` for detailed information about a specific command.`)
                .addFields(
                    {
                        name: 'Warning Commands',
                        value: [
                            `\`${prefix}warn <case_id>\` - Look up a warning by ID`,
                            `\`${prefix}warnings <player> [page]\` - List player warnings`,
                            `\`${prefix}activewarnings [page]\` - List all active warnings`,
                            `\`${prefix}recentwarnings [count]\` - Show recent warnings`,
                            `\`${prefix}punishwarn <player> <reason>\` - Warn a player via RCON`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: 'Ban Commands',
                        value: [
                            `\`${prefix}ban <case_id>\` - Look up a ban by ID`,
                            `\`${prefix}bans <player> [page]\` - List player bans`,
                            `\`${prefix}activebans [page]\` - List all active bans`,
                            `\`${prefix}recentbans [count]\` - Show recent bans`,
                            `\`${prefix}checkban <player>\` - Check if player is banned`,
                            `\`${prefix}punishban <player> <reason>\` - Ban a player via RCON`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: 'General Commands',
                        value: [
                            `\`${prefix}help [command]\` - Show this help menu`,
                            `\`${prefix}history <player>\` - Show player's full history`,
                            `\`${prefix}lookup <case_id>\` - Look up any case by ID`,
                            `\`${prefix}stats\` - Show database statistics`,
                            `\`${prefix}ping\` - Check bot latency`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setFooter({ text: 'NewLife Management | NewLife SMP' })
                .setTimestamp();

            return message.reply({
                embeds: [embed],
                allowedMentions: { repliedUser: false }
            });
        }
    },

    // !history <player_name> - Show full player history
    history: {
        name: 'history',
        description: 'Show a player\'s full punishment history',
        usage: '!history <player_name>',
        async execute(message, args, client) {
            // Check staff permissions
            if (!isStaff(message.member)) {
                return message.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    allowedMentions: { repliedUser: false }
                });
            }

            if (!args[0]) {
                return message.reply({
                    embeds: [createErrorEmbed('Missing Argument', 'Please provide a player name.\n\n**Usage:** `!history <player_name>`')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const playerName = args[0];

            try {
                const warnings = await Warning.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                }).sort({ createdAt: -1 });

                const bans = await Ban.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                }).sort({ createdAt: -1 });

                if (warnings.length === 0 && bans.length === 0) {
                    return message.reply({
                        embeds: [createErrorEmbed('No History', `No punishment history found for player: \`${playerName}\``)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                return message.reply({
                    embeds: [createHistoryEmbed(playerName, warnings, bans)],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching history:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch player history.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !lookup <case_id> - Look up any case by ID
    lookup: {
        name: 'lookup',
        description: 'Look up any case (warning or ban) by ID',
        usage: '!lookup <case_id>',
        async execute(message, args, client) {
            // Check staff permissions
            if (!isStaff(message.member)) {
                return message.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    allowedMentions: { repliedUser: false }
                });
            }

            if (!args[0]) {
                return message.reply({
                    embeds: [createErrorEmbed('Missing Argument', 'Please provide a case ID.\n\n**Usage:** `!lookup <case_id>`')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const caseId = args[0];

            try {
                // Try to find as warning first (by _id or numeric caseNumber)
                let warning = await Warning.findById(caseId);
                if (!warning && !isNaN(Number(caseId))) warning = await Warning.findOne({ caseNumber: Number(caseId) });
                if (warning) {
                    const { createWarningEmbed } = require('../utils/embeds');
                    return message.reply({
                        embeds: [createWarningEmbed(warning)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                // Try to find as ban (by _id or numeric caseNumber)
                let ban = await Ban.findById(caseId);
                if (!ban && !isNaN(Number(caseId))) ban = await Ban.findOne({ caseNumber: Number(caseId) });
                if (ban) {
                    const { createBanEmbed } = require('../utils/embeds');
                    return message.reply({
                        embeds: [createBanEmbed(ban)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                return message.reply({
                    embeds: [createErrorEmbed('Not Found', `No case found with ID: \`${caseId}\``)],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error looking up case:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to look up case.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !stats - Show database statistics
    stats: {
        name: 'stats',
        description: 'Show database statistics',
        usage: '!stats',
        async execute(message, args, client) {
            // Check staff permissions
            if (!isStaff(message.member)) {
                return message.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    allowedMentions: { repliedUser: false }
                });
            }

            try {
                const totalWarnings = await Warning.countDocuments();
                const activeWarnings = await Warning.countDocuments({ active: true });
                const totalBans = await Ban.countDocuments();
                const activeBans = await Ban.countDocuments({ active: true });

                // Get unique players
                const uniqueWarnedPlayers = await Warning.distinct('uuid');
                const uniqueBannedPlayers = await Ban.distinct('uuid');

                const embed = new EmbedBuilder()
                    .setColor(getEmbedColor())
                    .setTitle('📊 NewLife Management Statistics')
                    .addFields(
                        {
                            name: '⚠️ Warnings',
                            value: `**Total:** ${totalWarnings}\n**Active:** ${activeWarnings}\n**Unique Players:** ${uniqueWarnedPlayers.length}`,
                            inline: true
                        },
                        {
                            name: '🔨 Bans',
                            value: `**Total:** ${totalBans}\n**Active:** ${activeBans}\n**Unique Players:** ${uniqueBannedPlayers.length}`,
                            inline: true
                        },
                        {
                            name: '🤖 Bot Info',
                            value: `**Uptime:** ${formatUptime(client.uptime)}\n**Servers:** ${client.guilds.cache.size}\n**Ping:** ${client.ws.ping}ms`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'NewLife Management • Statistics' })
                    .setTimestamp();

                return message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching stats:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch statistics.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !ping - Check bot latency
    ping: {
        name: 'ping',
        description: 'Check bot latency',
        usage: '!ping',
        async execute(message, args, client) {
            const sent = await message.reply({
                content: 'Pinging...',
                allowedMentions: { repliedUser: false }
            });

            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('Pong!')
                .addFields(
                    {
                        name: 'Bot Latency',
                        value: `\`${sent.createdTimestamp - message.createdTimestamp}ms\``,
                        inline: true
                    },
                    {
                        name: 'API Latency',
                        value: `\`${Math.round(client.ws.ping)}ms\``,
                        inline: true
                    }
                )
                .setFooter({ text: 'NewLife Management' })
                .setTimestamp();

            return sent.edit({
                content: null,
                embeds: [embed]
            });
        }
    }
};

/**
 * Format uptime to human readable string
 * @param {number} uptime - Uptime in milliseconds
 * @returns {string}
 */
function formatUptime(uptime) {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * Slash Commands
 */
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('help')
            .setDescription('Show all available commands'),
        async execute(interaction, client) {
            const prefix = process.env.BOT_PREFIX || '!';

            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('NewLife Management Commands')
                .setDescription('All commands are available as both prefix and slash commands.')
                .addFields(
                    {
                        name: 'Warning Commands (Moderator+)',
                        value: [
                            `\`/warn case <id>\` - Look up a warning by ID`,
                            `\`/warn user <player> <reason>\` - Issue a warning`,
                            `\`/warnings <player>\` - List player warnings`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: 'Ban Commands (Admin+)',
                        value: [
                            `\`/ban case <id>\` - Look up a ban by ID`,
                            `\`/ban user <player> <duration> <reason>\` - Ban a player`,
                            `\`/bans <player>\` - List player bans`,
                            `\`/checkban <player>\` - Check if player is banned (Mod+)`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: 'General Commands',
                        value: [
                            `\`/help\` - Show this help menu`,
                            `\`/history <player>\` - Show player's history (Mod+)`,
                            `\`/lookup <id>\` - Look up any case by ID (Mod+)`,
                            `\`/stats\` - Show database statistics (Admin+)`,
                            `\`/ping\` - Check bot latency`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: 'Ticket Commands',
                        value: [
                            `\`/panel\` - Send the support panel (Supervisor+)`,
                            `\`/close <reason>\` - Close current ticket`,
                            `\`/tclose <time> <reason>\` - Timed ticket close`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setFooter({ text: 'NewLife Management | NewLife SMP' })
                .setTimestamp();

            return interaction.reply({
                embeds: [embed]
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('history')
            .setDescription('Show a player\'s full punishment history')
            .addStringOption(option =>
                option.setName('player')
                    .setDescription('The player name to look up')
                    .setRequired(true)
            ),
        async execute(interaction, client) {
            // Check staff permissions
            if (!isStaff(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    ephemeral: true
                });
            }

            const playerName = interaction.options.getString('player');

            await interaction.deferReply();

            try {
                const warnings = await Warning.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                }).sort({ createdAt: -1 });

                const bans = await Ban.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                }).sort({ createdAt: -1 });

                if (warnings.length === 0 && bans.length === 0) {
                    return interaction.editReply({
                        embeds: [createErrorEmbed('No History', `No punishment history found for player: \`${playerName}\``)]
                    });
                }

                return interaction.editReply({
                    embeds: [createHistoryEmbed(playerName, warnings, bans)]
                });
            } catch (error) {
                console.error('Error fetching history:', error);
                return interaction.editReply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch player history.')]
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('lookup')
            .setDescription('Look up any case (warning or ban) by ID')
            .addStringOption(option =>
                option.setName('case_id')
                    .setDescription('The case ID to look up')
                    .setRequired(true)
            ),
        async execute(interaction, client) {
            // Check staff permissions
            if (!isStaff(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    ephemeral: true
                });
            }

            const caseId = interaction.options.getString('case_id');

            await interaction.deferReply();

            try {
                // Try to find as warning first (by _id or numeric caseNumber)
                let warning = await Warning.findById(caseId);
                if (!warning && !isNaN(Number(caseId))) warning = await Warning.findOne({ caseNumber: Number(caseId) });
                if (warning) {
                    const { createWarningEmbed } = require('../utils/embeds');
                    return interaction.editReply({
                        embeds: [createWarningEmbed(warning)]
                    });
                }

                // Try to find as ban (by _id or numeric caseNumber)
                let ban = await Ban.findById(caseId);
                if (!ban && !isNaN(Number(caseId))) ban = await Ban.findOne({ caseNumber: Number(caseId) });
                if (ban) {
                    const { createBanEmbed } = require('../utils/embeds');
                    return interaction.editReply({
                        embeds: [createBanEmbed(ban)]
                    });
                }

                return interaction.editReply({
                    embeds: [createErrorEmbed('Not Found', `No case found with ID: \`${caseId}\``)]
                });
            } catch (error) {
                console.error('Error looking up case:', error);
                return interaction.editReply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to look up case.')]
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('stats')
            .setDescription('Show database statistics'),
        async execute(interaction, client) {
            // Check admin permissions for /stats
            if (!isAdmin(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You need Admin permissions to use this command.')],
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            try {
                const totalWarnings = await Warning.countDocuments();
                const activeWarnings = await Warning.countDocuments({ active: true });
                const totalBans = await Ban.countDocuments();
                const activeBans = await Ban.countDocuments({ active: true });

                const uniqueWarnedPlayers = await Warning.distinct('uuid');
                const uniqueBannedPlayers = await Ban.distinct('uuid');

                const embed = new EmbedBuilder()
                    .setColor(getEmbedColor())
                    .setTitle('NewLife Management Statistics')
                    .addFields(
                        {
                            name: 'Warnings',
                            value: `**Total:** ${totalWarnings}\n**Active:** ${activeWarnings}\n**Unique Players:** ${uniqueWarnedPlayers.length}`,
                            inline: true
                        },
                        {
                            name: 'Bans',
                            value: `**Total:** ${totalBans}\n**Active:** ${activeBans}\n**Unique Players:** ${uniqueBannedPlayers.length}`,
                            inline: true
                        },
                        {
                            name: 'Bot Info',
                            value: `**Uptime:** ${formatUptime(client.uptime)}\n**Servers:** ${client.guilds.cache.size}\n**Ping:** ${client.ws.ping}ms`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'NewLife Management | Statistics' })
                    .setTimestamp();

                return interaction.editReply({
                    embeds: [embed]
                });
            } catch (error) {
                console.error('Error fetching stats:', error);
                return interaction.editReply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch statistics.')]
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check bot latency'),
        async execute(interaction, client) {
            const sent = await interaction.reply({
                content: 'Pinging...',
                fetchReply: true
            });

            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('Pong!')
                .addFields(
                    {
                        name: 'Bot Latency',
                        value: `\`${sent.createdTimestamp - interaction.createdTimestamp}ms\``,
                        inline: true
                    },
                    {
                        name: 'API Latency',
                        value: `\`${Math.round(client.ws.ping)}ms\``,
                        inline: true
                    }
                )
                .setFooter({ text: 'NewLife Management' })
                .setTimestamp();

            return interaction.editReply({
                content: null,
                embeds: [embed]
            });
        }
    }
];

module.exports = {
    name: 'General',
    description: 'General utility commands',
    commands,
    slashCommands
};
