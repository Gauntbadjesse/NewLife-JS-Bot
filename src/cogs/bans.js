/**
 * Bans Cog
 * Handles all ban-related commands for NewLife Management Bot
 * Bans use RCON with banspaper:ban <user> <time> command
 * 
 * Permissions:
 * - /ban case: Admin+
 * - /ban user: Admin+
 * - /bans: Admin+
 * - /checkban: Moderator+
 */

const { SlashCommandBuilder } = require('discord.js');
const { randomUUID } = require('crypto');
const Ban = require('../database/models/Ban');
const { getNextCaseNumber } = require('../database/caseCounter');
const { 
    createBanEmbed, 
    createErrorEmbed, 
    createListEmbed,
    createSuccessEmbed
} = require('../utils/embeds');
const { isStaff, isAdmin } = require('../utils/permissions');
const { executeRcon } = require('../utils/rcon');

/**
 * Generate a unique case ID
 */
function generateCaseId() {
    return randomUUID();
}

/**
 * Parse duration string to milliseconds
 * @param {string} duration - Duration string like "1d", "2h", "30m", "perm"
 * @returns {Object} - { ms: milliseconds, display: string } or null for permanent
 */
function parseDuration(duration) {
    if (!duration) return null;
    const lower = duration.toLowerCase();
    if (lower === 'perm' || lower === 'permanent') {
        return { ms: null, display: 'Permanent', permanent: true };
    }

    const match = duration.match(/^(\d+)([dhms])$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    let ms;
    let display;

    switch (unit) {
        case 'd':
            ms = value * 24 * 60 * 60 * 1000;
            display = `${value} day${value > 1 ? 's' : ''}`;
            break;
        case 'h':
            ms = value * 60 * 60 * 1000;
            display = `${value} hour${value > 1 ? 's' : ''}`;
            break;
        case 'm':
            ms = value * 60 * 1000;
            display = `${value} minute${value > 1 ? 's' : ''}`;
            break;
        case 's':
            ms = value * 1000;
            display = `${value} second${value > 1 ? 's' : ''}`;
            break;
        default:
            return null;
    }

    return { ms, display, permanent: false };
}

/**
 * Prefix Commands
 */
const commands = {
    // !ban <case_id> - Look up a specific ban by ID
    ban: {
        name: 'ban',
        description: 'Look up a ban case by ID',
        usage: '!ban <case_id>',
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
                    embeds: [createErrorEmbed('Missing Argument', 'Please provide a case ID.\n\n**Usage:** `!ban <case_id>`')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const caseId = args[0];

            try {
                let ban = await Ban.findById(caseId);
                if (!ban && !isNaN(Number(caseId))) ban = await Ban.findOne({ caseNumber: Number(caseId) });

                if (!ban) {
                    return message.reply({
                        embeds: [createErrorEmbed('Not Found', `No ban found with case ID: \`${caseId}\``)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                return message.reply({
                    embeds: [createBanEmbed(ban)],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching ban:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch ban from database.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !bans <player_name> - List all bans for a player
    bans: {
        name: 'bans',
        description: 'List all bans for a player',
        usage: '!bans <player_name> [page]',
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
                    embeds: [createErrorEmbed('Missing Argument', 'Please provide a player name.\n\n**Usage:** `!bans <player_name> [page]`')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const playerName = args[0];
            const page = parseInt(args[1]) || 1;
            const perPage = 10;

            try {
                const totalBans = await Ban.countDocuments({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                });

                if (totalBans === 0) {
                    return message.reply({
                        embeds: [createErrorEmbed('No Bans', `No bans found for player: \`${playerName}\``)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                const totalPages = Math.ceil(totalBans / perPage);
                const skip = (page - 1) * perPage;

                const bans = await Ban.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(perPage);

                const items = bans.map((b) => {
                    const status = b.active ? '[Active]' : '[Unbanned]';
                    const date = `<t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R>`;
                    return `${status} #${b.caseNumber || '—'} \`${b._id}\` - ${b.reason.substring(0, 40)}${b.reason.length > 40 ? '...' : ''} (${date})`;
                });

                const embed = createListEmbed(
                    `Bans for ${playerName}`,
                    items,
                    page,
                    totalPages
                );

                embed.setDescription(`**Total Bans:** ${totalBans}\n\n${items.join('\n')}`);

                return message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching bans:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch bans from database.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !activebans - List all active bans
    activebans: {
        name: 'activebans',
        description: 'List all active bans',
        usage: '!activebans [page]',
        async execute(message, args, client) {
            // Check staff permissions
            if (!isStaff(message.member)) {
                return message.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const page = parseInt(args[0]) || 1;
            const perPage = 10;

            try {
                const totalBans = await Ban.countDocuments({ active: true });

                if (totalBans === 0) {
                    return message.reply({
                        embeds: [createErrorEmbed('No Active Bans', 'There are no active bans in the database.')],
                        allowedMentions: { repliedUser: false }
                    });
                }

                const totalPages = Math.ceil(totalBans / perPage);
                const skip = (page - 1) * perPage;

                const bans = await Ban.find({ active: true })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(perPage);

                const items = bans.map((b) => {
                    const date = `<t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R>`;
                    return `[Active] #${b.caseNumber || '—'} \`${b._id}\` - **${b.playerName}** - ${b.reason.substring(0, 30)}... (${date})`;
                });

                const embed = createListEmbed(
                    'Active Bans',
                    items,
                    page,
                    totalPages
                );

                embed.setDescription(`**Total Active:** ${totalBans}\n\n${items.join('\n')}`);

                return message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching active bans:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch bans from database.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !recentbans - Show most recent bans
    recentbans: {
        name: 'recentbans',
        description: 'Show the most recent bans',
        usage: '!recentbans [count]',
        async execute(message, args, client) {
            // Check staff permissions
            if (!isStaff(message.member)) {
                return message.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const count = Math.min(parseInt(args[0]) || 10, 25);

            try {
                const bans = await Ban.find()
                    .sort({ createdAt: -1 })
                    .limit(count);

                if (bans.length === 0) {
                    return message.reply({
                        embeds: [createErrorEmbed('No Bans', 'There are no bans in the database.')],
                        allowedMentions: { repliedUser: false }
                    });
                }

                const items = bans.map((b) => {
                    const status = b.active ? '[Active]' : '[Unbanned]';
                    const date = `<t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R>`;
                    return `${status} #${b.caseNumber || '—'} \`${b._id}\` - **${b.playerName}** - ${b.reason.substring(0, 25)}... (${date})`;
                });

                const embed = createListEmbed(
                    'Recent Bans',
                    items,
                    1,
                    1
                );

                return message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching recent bans:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch bans from database.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !checkban <player_name> - Check if a player is currently banned
    checkban: {
        name: 'checkban',
        description: 'Check if a player is currently banned',
        usage: '!checkban <player_name>',
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
                    embeds: [createErrorEmbed('Missing Argument', 'Please provide a player name.\n\n**Usage:** `!checkban <player_name>`')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const playerName = args[0];

            try {
                const activeBan = await Ban.findOne({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') },
                    active: true
                }).sort({ createdAt: -1 });

                if (!activeBan) {
                    return message.reply({
                        embeds: [createErrorEmbed('Not Banned', `Player \`${playerName}\` is not currently banned.`)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                return message.reply({
                    embeds: [createBanEmbed(activeBan)],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error checking ban:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to check ban status.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    }
};

/**
 * Slash Commands with Subcommands
 */
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Ban management commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('case')
                    .setDescription('Look up a ban case by ID')
                    .addStringOption(option =>
                        option.setName('case_id')
                            .setDescription('The ban case ID')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('user')
                    .setDescription('Ban a player via RCON (uses banspaper:ban)')
                    .addStringOption(option =>
                        option.setName('player')
                            .setDescription('The Minecraft player name to ban')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('duration')
                            .setDescription('Ban duration (e.g., 1d, 2h, 30m, or "perm" for permanent)')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('reason')
                            .setDescription('The reason for the ban')
                            .setRequired(true)
                    )
            ),
        async execute(interaction, client) {
            // Check admin permissions for /ban
            if (!isAdmin(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You need Admin permissions to use this command.')],
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'case') {
                // Case lookup
                const caseId = interaction.options.getString('case_id');

                await interaction.deferReply();

                try {
                    const ban = await Ban.findById(caseId);

                    if (!ban) {
                        return interaction.editReply({
                            embeds: [createErrorEmbed('Not Found', `No ban found with case ID: \`${caseId}\``)]
                        });
                    }

                    return interaction.editReply({
                        embeds: [createBanEmbed(ban)]
                    });
                } catch (error) {
                    console.error('Error fetching ban:', error);
                    return interaction.editReply({
                        embeds: [createErrorEmbed('Database Error', 'Failed to fetch ban from database.')]
                    });
                }
            } else if (subcommand === 'user') {
                // Issue ban via RCON using mban command
                const playerName = interaction.options.getString('player');
                const durationStr = interaction.options.getString('duration');
                const reason = interaction.options.getString('reason');

                await interaction.deferReply();

                try {
                    // Parse duration
                    const duration = parseDuration(durationStr);
                    if (!duration) {
                        return interaction.editReply({
                            embeds: [createErrorEmbed('Invalid Duration', 'Duration must be in the format `1d`, `2h`, `30m`, `15s`, or `perm` for permanent.')]
                        });
                    }
                    const isPermanent = !!duration.permanent;

                    // For banspaper:ban command: banspaper:ban <player> <duration>
                    const rconDuration = isPermanent ? 'perm' : durationStr;
                    const rconCommand = `banspaper:ban ${playerName} ${rconDuration}`;
                    
                    const rconResult = await executeRcon(rconCommand);

                    // Determine if RCON reported a failure — treat common failure phrases as errors
                    const responseText = String(rconResult.response || '').toLowerCase();
                    const failureKeywords = ['error', 'failed', 'not found', 'no such', 'could not', 'no player', 'exception', 'permission', 'unable'];
                    const rconReportedFailure = !rconResult.success || failureKeywords.some(k => responseText.includes(k));

                    if (rconReportedFailure) {
                        // Don't create DB records or log this action — just inform the issuer of the error
                        return interaction.editReply({
                            embeds: [createErrorEmbed('RCON Error', rconResult.response || 'Failed to execute ban command')]
                        });
                    }

                    // Create the ban entry in the database
                    const now = new Date();
                        const caseNumber = await getNextCaseNumber();
                        const ban = new Ban({
                            _id: generateCaseId(),
                            caseNumber,
                            uuid: 'discord-issued',
                            playerName: playerName,
                            staffUuid: null,
                            staffName: interaction.user.tag,
                            reason: reason,
                            createdAt: now,
                            active: true,
                            duration: duration && !duration.permanent ? duration.ms : null,
                            expiresAt: duration && !duration.permanent ? new Date(now.getTime() + duration.ms) : null
                        });

                    await ban.save();

                    // The watcher will automatically DM the user and log to channel
                    const durationText = duration.display || (isPermanent ? 'Permanent' : 'Unknown');
                    
                    return interaction.editReply({
                        embeds: [createSuccessEmbed('Ban Issued', `**Player:** ${playerName}\n**Duration:** ${durationText}\n**Reason:** ${reason}\n**Case:** #${ban.caseNumber} (id: ${ban._id})\n**RCON:** ${rconResult.response || 'Executed'}\n\n*DM will be sent if player has a linked Discord account.*`)]
                    });
                } catch (error) {
                    console.error('Error issuing ban:', error);
                    return interaction.editReply({
                        embeds: [createErrorEmbed('Error', 'Failed to issue ban.')]
                    });
                }
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('bans')
            .setDescription('List all bans for a player')
            .addStringOption(option =>
                option.setName('player')
                    .setDescription('The player name to look up')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('page')
                    .setDescription('Page number')
                    .setRequired(false)
            ),
        async execute(interaction, client) {
            // Check admin permissions for /bans
            if (!isAdmin(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You need Admin permissions to use this command.')],
                    ephemeral: true
                });
            }

            const playerName = interaction.options.getString('player');
            const page = interaction.options.getInteger('page') || 1;
            const perPage = 10;

            await interaction.deferReply();

            try {
                const totalBans = await Ban.countDocuments({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                });

                if (totalBans === 0) {
                    return interaction.editReply({
                        embeds: [createErrorEmbed('No Bans', `No bans found for player: \`${playerName}\``)]
                    });
                }

                const totalPages = Math.ceil(totalBans / perPage);
                const skip = (page - 1) * perPage;

                const bans = await Ban.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(perPage);

                const items = bans.map((b) => {
                    const status = b.active ? '[Active]' : '[Unbanned]';
                    const date = `<t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R>`;
                    return `${status} #${b.caseNumber || '—'} \`${b._id}\` - ${b.reason.substring(0, 40)}${b.reason.length > 40 ? '...' : ''} (${date})`;
                });

                const embed = createListEmbed(
                    `Bans for ${playerName}`,
                    items,
                    page,
                    totalPages
                );

                embed.setDescription(`**Total Bans:** ${totalBans}\n\n${items.join('\n')}`);

                return interaction.editReply({
                    embeds: [embed]
                });
            } catch (error) {
                console.error('Error fetching bans:', error);
                return interaction.editReply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch bans from database.')]
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('checkban')
            .setDescription('Check if a player is currently banned')
            .addStringOption(option =>
                option.setName('player')
                    .setDescription('The player name to check')
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
                const activeBan = await Ban.findOne({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') },
                    active: true
                }).sort({ createdAt: -1 });

                if (!activeBan) {
                    return interaction.editReply({
                        embeds: [createErrorEmbed('Not Banned', `Player \`${playerName}\` is not currently banned.`)]
                    });
                }

                return interaction.editReply({
                    embeds: [createBanEmbed(activeBan)]
                });
            } catch (error) {
                console.error('Error checking ban:', error);
                return interaction.editReply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to check ban status.')]
                });
            }
        }
    }
];

module.exports = {
    name: 'Bans',
    description: 'Ban management commands',
    commands,
    slashCommands
};
