/**
 * Warnings Cog
 * Handles all warning-related commands for NewLife Management Bot
 * Warnings are added directly to MongoDB (no RCON needed)
 */

const { SlashCommandBuilder } = require('discord.js');
const { randomUUID } = require('crypto');
const Warning = require('../database/models/Warning');
const { getNextCaseNumber } = require('../database/caseCounter');
const { 
    createWarningEmbed, 
    createErrorEmbed, 
    createListEmbed,
    createSuccessEmbed
} = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');
const { findDiscordIdByMinecraft, findMinecraftByDiscordId } = require('../database/watcher');

/**
 * Generate a unique case ID
 */
function generateCaseId() {
    // Use Node's built-in UUID generator to avoid ESM-only uuid package
    return randomUUID();
}

/**
 * Prefix Commands
 */
const commands = {
    // !warn <case_id> - Look up a specific warning by ID
    // !warn <player> <reason> - Issue a warning
    warn: {
        name: 'warn',
        description: 'Look up a warning case by ID or issue a warning',
        usage: '!warn <case_id> OR !warn <player> <reason>',
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
                    embeds: [createErrorEmbed('Missing Argument', 'Please provide a case ID or player name.\n\n**Usage:**\n`!warn <case_id>` - Look up a case\n`!warn <player> <reason>` - Issue a warning')],
                    allowedMentions: { repliedUser: false }
                });
            }

            // If only one argument, treat as case lookup
            if (args.length === 1) {
                const caseId = args[0];
                try {
                    let warning = null;
                    // Try by Mongo ID first
                    warning = await Warning.findById(caseId);
                    // If not found and arg is numeric, try caseNumber
                    if (!warning && !isNaN(Number(caseId))) {
                        warning = await Warning.findOne({ caseNumber: Number(caseId) });
                    }

                    if (!warning) {
                        return message.reply({
                            embeds: [createErrorEmbed('Not Found', `No warning found with case ID: \`${caseId}\``)],
                            allowedMentions: { repliedUser: false }
                        });
                    }

                    return message.reply({
                        embeds: [createWarningEmbed(warning)],
                        allowedMentions: { repliedUser: false }
                    });
                } catch (error) {
                    console.error('Error fetching warning:', error);
                    return message.reply({
                        embeds: [createErrorEmbed('Database Error', 'Failed to fetch warning from database.')],
                        allowedMentions: { repliedUser: false }
                    });
                }
            }

            // Multiple arguments = issue warning
            const playerName = args[0];
            const reason = args.slice(1).join(' ');

            if (!reason) {
                return message.reply({
                    embeds: [createErrorEmbed('Missing Reason', 'Please provide a reason for the warning.\n\n**Usage:** `!warn <player> <reason>`')],
                    allowedMentions: { repliedUser: false }
                });
            }

            try {
                // Create the warning directly in the database
                const caseNumber = await getNextCaseNumber();

                const warning = new Warning({
                    _id: generateCaseId(),
                    caseNumber,
                    uuid: 'discord-issued', // Placeholder since we don't have the MC UUID
                    playerName: playerName,
                    staffUuid: null,
                    staffName: message.author.tag,
                    reason: reason,
                    createdAt: new Date(),
                    active: true
                });

                await warning.save();

                // The watcher will automatically DM the user and log to channel
                return message.reply({
                    embeds: [createSuccessEmbed('Warning Issued', `**Player:** ${playerName}\n**Reason:** ${reason}\n**Case:** #${warning.caseNumber} (id: ${warning._id})`)],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error issuing warning:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Error', 'Failed to issue warning.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !warnings <player_name> - List all warnings for a player
    warnings: {
        name: 'warnings',
        description: 'List all warnings for a player',
        usage: '!warnings <player_name> [page]',
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
                    embeds: [createErrorEmbed('Missing Argument', 'Please provide a player name.\n\n**Usage:** `!warnings <player_name> [page]`')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const playerName = args[0];
            const page = parseInt(args[1]) || 1;
            const perPage = 10;

            try {
                const totalWarnings = await Warning.countDocuments({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                });

                if (totalWarnings === 0) {
                    return message.reply({
                        embeds: [createErrorEmbed('No Warnings', `No warnings found for player: \`${playerName}\``)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                const totalPages = Math.ceil(totalWarnings / perPage);
                const skip = (page - 1) * perPage;

                const warnings = await Warning.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(perPage);

                const items = warnings.map((w) => {
                    const status = w.active ? '[Active]' : '[Removed]';
                    const date = `<t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:R>`;
                    return `${status} #${w.caseNumber || '—'} \`${w._id}\` - ${w.reason.substring(0, 40)}${w.reason.length > 40 ? '...' : ''} (${date})`;
                });

                const embed = createListEmbed(
                    `Warnings for ${playerName}`,
                    items,
                    page,
                    totalPages
                );

                embed.setDescription(`**Total Warnings:** ${totalWarnings}\n\n${items.join('\n')}`);

                return message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching warnings:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch warnings from database.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !activewarnings - List all active warnings
    activewarnings: {
        name: 'activewarnings',
        description: 'List all active warnings',
        usage: '!activewarnings [page]',
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
                const totalWarnings = await Warning.countDocuments({ active: true });

                if (totalWarnings === 0) {
                    return message.reply({
                        embeds: [createErrorEmbed('No Active Warnings', 'There are no active warnings in the database.')],
                        allowedMentions: { repliedUser: false }
                    });
                }

                const totalPages = Math.ceil(totalWarnings / perPage);
                const skip = (page - 1) * perPage;

                const warnings = await Warning.find({ active: true })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(perPage);

                const items = warnings.map((w) => {
                    const date = `<t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:R>`;
                    return `[Active] #${w.caseNumber || '—'} \`${w._id}\` - **${w.playerName}** - ${w.reason.substring(0, 30)}... (${date})`;
                });

                const embed = createListEmbed(
                    'Active Warnings',
                    items,
                    page,
                    totalPages
                );

                embed.setDescription(`**Total Active:** ${totalWarnings}\n\n${items.join('\n')}`);

                return message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching active warnings:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch warnings from database.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !recentwarnings - Show most recent warnings
    recentwarnings: {
        name: 'recentwarnings',
        description: 'Show the most recent warnings',
        usage: '!recentwarnings [count]',
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
                const warnings = await Warning.find()
                    .sort({ createdAt: -1 })
                    .limit(count);

                if (warnings.length === 0) {
                    return message.reply({
                        embeds: [createErrorEmbed('No Warnings', 'There are no warnings in the database.')],
                        allowedMentions: { repliedUser: false }
                    });
                }

                const items = warnings.map((w) => {
                    const status = w.active ? '[Active]' : '[Removed]';
                    const date = `<t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:R>`;
                    return `${status} #${w.caseNumber || '—'} \`${w._id}\` - **${w.playerName}** - ${w.reason.substring(0, 25)}... (${date})`;
                });

                const embed = createListEmbed(
                    'Recent Warnings',
                    items,
                    1,
                    1
                );

                return message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching recent warnings:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch warnings from database.')],
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
            .setName('warn')
            .setDescription('Warning management commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('case')
                    .setDescription('Look up a warning case by ID')
                    .addStringOption(option =>
                        option.setName('case_id')
                            .setDescription('The warning case ID')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('user')
                    .setDescription('Issue a warning to a player')
                    .addStringOption(option =>
                        option.setName('player')
                            .setDescription('The Minecraft player name to warn')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('reason')
                            .setDescription('The reason for the warning')
                            .setRequired(true)
                    )
            ),
        async execute(interaction, client) {
            // Check staff permissions
            if (!isStaff(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'case') {
                // Case lookup
                const caseId = interaction.options.getString('case_id');

                await interaction.deferReply();

                try {
                    let warning = await Warning.findById(caseId);
                    if (!warning && !isNaN(Number(caseId))) warning = await Warning.findOne({ caseNumber: Number(caseId) });

                    if (!warning) {
                        return interaction.editReply({
                            embeds: [createErrorEmbed('Not Found', `No warning found with case ID: \`${caseId}\``)]
                        });
                    }

                    return interaction.editReply({
                        embeds: [createWarningEmbed(warning)]
                    });
                } catch (error) {
                    console.error('Error fetching warning:', error);
                    return interaction.editReply({
                        embeds: [createErrorEmbed('Database Error', 'Failed to fetch warning from database.')]
                    });
                }
            } else if (subcommand === 'user') {
                // Issue warning directly to database
                const playerName = interaction.options.getString('player');
                const reason = interaction.options.getString('reason');

                await interaction.deferReply();

                try {
                    // Create the warning directly in the database
                    const warning = new Warning({
                        _id: generateCaseId(),
                        uuid: 'discord-issued',
                        playerName: playerName,
                        staffUuid: null,
                        staffName: interaction.user.tag,
                        reason: reason,
                        createdAt: new Date(),
                        active: true
                    });

                    await warning.save();

                    // The watcher will automatically DM the user and log to channel
                    return interaction.editReply({
                        embeds: [createSuccessEmbed('Warning Issued', `**Player:** ${playerName}\n**Reason:** ${reason}\n**Case ID:** \`${warning._id}\`\n\n*DM will be sent if player has a linked Discord account.*`)]
                    });
                } catch (error) {
                    console.error('Error issuing warning:', error);
                    return interaction.editReply({
                        embeds: [createErrorEmbed('Error', 'Failed to issue warning.')]
                    });
                }
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('warnings')
            .setDescription('List all warnings for a player')
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
            // Check staff permissions
            if (!isStaff(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    ephemeral: true
                });
            }

            const playerName = interaction.options.getString('player');
            const page = interaction.options.getInteger('page') || 1;
            const perPage = 10;

            await interaction.deferReply();

            try {
                const totalWarnings = await Warning.countDocuments({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                });

                if (totalWarnings === 0) {
                    return interaction.editReply({
                        embeds: [createErrorEmbed('No Warnings', `No warnings found for player: \`${playerName}\``)]
                    });
                }

                const totalPages = Math.ceil(totalWarnings / perPage);
                const skip = (page - 1) * perPage;

                const warnings = await Warning.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(perPage);

                const items = warnings.map((w) => {
                    const status = w.active ? '[Active]' : '[Removed]';
                    const date = `<t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:R>`;
                    return `${status} \`${w._id}\` - ${w.reason.substring(0, 40)}${w.reason.length > 40 ? '...' : ''} (${date})`;
                });

                const embed = createListEmbed(
                    `Warnings for ${playerName}`,
                    items,
                    page,
                    totalPages
                );

                embed.setDescription(`**Total Warnings:** ${totalWarnings}\n\n${items.join('\n')}`);

                return interaction.editReply({
                    embeds: [embed]
                });
            } catch (error) {
                console.error('Error fetching warnings:', error);
                return interaction.editReply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch warnings from database.')]
                });
            }
        }
    }
];

module.exports = {
    name: 'Warnings',
    description: 'Warning management commands',
    commands,
    slashCommands
};
