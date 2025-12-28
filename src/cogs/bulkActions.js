/**
 * Bulk Actions Cog
 * Commands for performing bulk moderation actions
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Ban = require('../database/models/Ban');
const Warning = require('../database/models/Warning');
const { isAdmin, isManagement } = require('../utils/permissions');
const { Rcon } = require('rcon-client');
const { getNextCaseNumber } = require('../database/caseCounter');
const { randomUUID } = require('crypto');

// RCON configuration
const RCON_HOST = process.env.RCON_HOST || 'localhost';
const RCON_PORT = parseInt(process.env.RCON_PORT) || 25575;
const RCON_PASSWORD = process.env.RCON_PASSWORD || '';

/**
 * Execute RCON command
 */
async function executeRcon(command) {
    const rcon = new Rcon({
        host: RCON_HOST,
        port: RCON_PORT,
        password: RCON_PASSWORD,
        timeout: 5000
    });

    try {
        await rcon.connect();
        const response = await rcon.send(command);
        await rcon.end();
        return response;
    } catch (error) {
        console.error('RCON error:', error);
        throw error;
    }
}

// Pending bulk actions for confirmation
const pendingActions = new Map();

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('bulk')
            .setDescription('Bulk moderation actions')
            .addSubcommand(sub => sub
                .setName('warn')
                .setDescription('Warn multiple players at once')
                .addStringOption(opt => opt.setName('players').setDescription('Player names (comma separated)').setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription('Warning reason').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('kick')
                .setDescription('Kick multiple players at once')
                .addStringOption(opt => opt.setName('players').setDescription('Player names (comma separated)').setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription('Kick reason').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('ban')
                .setDescription('Ban multiple players at once')
                .addStringOption(opt => opt.setName('players').setDescription('Player names (comma separated)').setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription('Ban reason').setRequired(true))
                .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g., 7d, 30d, perm)').setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('unban')
                .setDescription('Unban multiple players at once')
                .addStringOption(opt => opt.setName('players').setDescription('Player names (comma separated)').setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription('Unban reason').setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('pardon-warnings')
                .setDescription('Pardon all warnings for multiple players')
                .addStringOption(opt => opt.setName('players').setDescription('Player names (comma separated)').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('message')
                .setDescription('Send a message to multiple online players')
                .addStringOption(opt => opt.setName('players').setDescription('Player names (comma separated) or "all"').setRequired(true))
                .addStringOption(opt => opt.setName('message').setDescription('Message to send').setRequired(true))
            ),

        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();
            
            // Permission check - bulk actions require admin or management
            if (!isManagement(interaction.member)) {
                return interaction.reply({ content: '❌ Bulk actions require Management or higher.', ephemeral: true });
            }

            const playersInput = interaction.options.getString('players');
            const players = playersInput.split(',').map(p => p.trim()).filter(p => p.length > 0);

            if (players.length === 0) {
                return interaction.reply({ content: '❌ No valid players provided.', ephemeral: true });
            }

            if (players.length > 25) {
                return interaction.reply({ content: '❌ Maximum 25 players per bulk action.', ephemeral: true });
            }

            // Generate action ID
            const actionId = randomUUID().slice(0, 8);

            if (sub === 'warn') {
                const reason = interaction.options.getString('reason');

                // Store pending action
                pendingActions.set(actionId, {
                    type: 'warn',
                    players,
                    reason,
                    staffId: interaction.user.id,
                    staffName: interaction.user.tag,
                    expires: Date.now() + 60000
                });

                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Bulk Warn Confirmation')
                    .setColor('#f59e0b')
                    .setDescription(`You are about to warn **${players.length}** players.`)
                    .addFields(
                        { name: 'Players', value: players.join(', ').substring(0, 1000), inline: false },
                        { name: 'Reason', value: reason, inline: false }
                    )
                    .setFooter({ text: 'This will expire in 60 seconds' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`bulk_confirm_${actionId}`).setLabel('Confirm').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`bulk_cancel_${actionId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                );

                return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }

            if (sub === 'kick') {
                const reason = interaction.options.getString('reason');

                pendingActions.set(actionId, {
                    type: 'kick',
                    players,
                    reason,
                    staffId: interaction.user.id,
                    staffName: interaction.user.tag,
                    expires: Date.now() + 60000
                });

                const embed = new EmbedBuilder()
                    .setTitle('👢 Bulk Kick Confirmation')
                    .setColor('#f97316')
                    .setDescription(`You are about to kick **${players.length}** players from the server.`)
                    .addFields(
                        { name: 'Players', value: players.join(', ').substring(0, 1000), inline: false },
                        { name: 'Reason', value: reason, inline: false }
                    )
                    .setFooter({ text: 'This will expire in 60 seconds' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`bulk_confirm_${actionId}`).setLabel('Confirm').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`bulk_cancel_${actionId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                );

                return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }

            if (sub === 'ban') {
                const reason = interaction.options.getString('reason');
                const duration = interaction.options.getString('duration') || 'perm';

                pendingActions.set(actionId, {
                    type: 'ban',
                    players,
                    reason,
                    duration,
                    staffId: interaction.user.id,
                    staffName: interaction.user.tag,
                    expires: Date.now() + 60000
                });

                const embed = new EmbedBuilder()
                    .setTitle('🔨 Bulk Ban Confirmation')
                    .setColor('#ef4444')
                    .setDescription(`You are about to ban **${players.length}** players.`)
                    .addFields(
                        { name: 'Players', value: players.join(', ').substring(0, 1000), inline: false },
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Duration', value: duration, inline: true }
                    )
                    .setFooter({ text: 'This will expire in 60 seconds' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`bulk_confirm_${actionId}`).setLabel('Confirm').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`bulk_cancel_${actionId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                );

                return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }

            if (sub === 'unban') {
                const reason = interaction.options.getString('reason') || 'Bulk unban';

                pendingActions.set(actionId, {
                    type: 'unban',
                    players,
                    reason,
                    staffId: interaction.user.id,
                    staffName: interaction.user.tag,
                    expires: Date.now() + 60000
                });

                const embed = new EmbedBuilder()
                    .setTitle('✅ Bulk Unban Confirmation')
                    .setColor('#22c55e')
                    .setDescription(`You are about to unban **${players.length}** players.`)
                    .addFields(
                        { name: 'Players', value: players.join(', ').substring(0, 1000), inline: false },
                        { name: 'Reason', value: reason, inline: false }
                    )
                    .setFooter({ text: 'This will expire in 60 seconds' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`bulk_confirm_${actionId}`).setLabel('Confirm').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`bulk_cancel_${actionId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                );

                return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }

            if (sub === 'pardon-warnings') {
                pendingActions.set(actionId, {
                    type: 'pardon-warnings',
                    players,
                    staffId: interaction.user.id,
                    staffName: interaction.user.tag,
                    expires: Date.now() + 60000
                });

                const embed = new EmbedBuilder()
                    .setTitle('📝 Bulk Pardon Warnings Confirmation')
                    .setColor('#8b5cf6')
                    .setDescription(`You are about to pardon all warnings for **${players.length}** players.`)
                    .addFields(
                        { name: 'Players', value: players.join(', ').substring(0, 1000), inline: false }
                    )
                    .setFooter({ text: 'This will expire in 60 seconds' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`bulk_confirm_${actionId}`).setLabel('Confirm').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`bulk_cancel_${actionId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                );

                return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }

            if (sub === 'message') {
                const message = interaction.options.getString('message');
                const isAll = players.length === 1 && players[0].toLowerCase() === 'all';

                await interaction.deferReply({ ephemeral: true });

                try {
                    let count = 0;
                    if (isAll) {
                        await executeRcon(`say ${message}`);
                        count = -1; // Indicates broadcast
                    } else {
                        for (const player of players) {
                            try {
                                await executeRcon(`tell ${player} ${message}`);
                                count++;
                            } catch (e) {
                                // Player might be offline
                            }
                        }
                    }

                    return interaction.editReply({
                        content: isAll
                            ? `✅ Broadcast message sent to all players.`
                            : `✅ Message sent to ${count} of ${players.length} players (others may be offline).`
                    });
                } catch (error) {
                    return interaction.editReply({ content: '❌ Failed to send messages via RCON.' });
                }
            }
        }
    }
];

/**
 * Handle bulk action button confirmations
 */
async function handleBulkButton(interaction, client) {
    const [, action, actionId] = interaction.customId.split('_');

    if (action === 'cancel') {
        pendingActions.delete(actionId);
        return interaction.update({
            content: '❌ Bulk action cancelled.',
            embeds: [],
            components: []
        });
    }

    if (action !== 'confirm') return;

    const pending = pendingActions.get(actionId);
    if (!pending) {
        return interaction.update({
            content: '❌ This action has expired.',
            embeds: [],
            components: []
        });
    }

    if (pending.staffId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Only the initiator can confirm this action.', ephemeral: true });
    }

    pendingActions.delete(actionId);

    await interaction.update({
        content: '⏳ Processing bulk action...',
        embeds: [],
        components: []
    });

    const results = { success: [], failed: [] };

    try {
        if (pending.type === 'warn') {
            for (const player of pending.players) {
                try {
                    const caseNumber = await getNextCaseNumber();
                    const warning = new Warning({
                        _id: randomUUID(),
                        caseNumber,
                        uuid: player,
                        playerName: player,
                        staffUuid: pending.staffId,
                        staffName: pending.staffName,
                        reason: `[Bulk] ${pending.reason}`,
                        active: true,
                        createdAt: new Date()
                    });
                    await warning.save();
                    results.success.push(player);
                } catch (e) {
                    results.failed.push(player);
                }
            }
        }

        if (pending.type === 'kick') {
            for (const player of pending.players) {
                try {
                    await executeRcon(`kick ${player} ${pending.reason}`);
                    results.success.push(player);
                } catch (e) {
                    results.failed.push(player);
                }
            }
        }

        if (pending.type === 'ban') {
            for (const player of pending.players) {
                try {
                    // First, attempt RCON ban. If this fails, do not create DB records or log.
                    try {
                        const rconResponse = await executeRcon(`ban ${player} ${pending.reason}`);
                        const resp = String(rconResponse || '').toLowerCase();
                        const failureKeywords = ['error', 'failed', 'not found', 'no such', 'could not', 'no player', 'exception', 'permission', 'unable'];
                        if (failureKeywords.some(k => resp.includes(k))) {
                            // treat as failure
                            throw new Error(`RCON failure: ${rconResponse}`);
                        }
                    } catch (rerr) {
                        results.failed.push(player);
                        continue; // skip DB save
                    }

                    // Calculate expiry
                    let expiresAt = null;
                    if (pending.duration && pending.duration !== 'perm') {
                        const match = pending.duration.match(/^(\d+)([dhm])$/);
                        if (match) {
                            const value = parseInt(match[1]);
                            const unit = match[2];
                            const ms = unit === 'd' ? value * 86400000 : unit === 'h' ? value * 3600000 : value * 60000;
                            expiresAt = new Date(Date.now() + ms);
                        }
                    }

                    const caseNumber = await getNextCaseNumber();
                    const ban = new Ban({
                        _id: randomUUID(),
                        caseNumber,
                        uuid: player,
                        playerName: player,
                        staffUuid: pending.staffId,
                        staffName: pending.staffName,
                        reason: `[Bulk] ${pending.reason}`,
                        active: true,
                        expiresAt,
                        createdAt: new Date()
                    });
                    await ban.save();

                    results.success.push(player);
                } catch (e) {
                    results.failed.push(player);
                }
            }
        }

        if (pending.type === 'unban') {
            for (const player of pending.players) {
                try {
                    // Attempt RCON pardon first. If RCON fails, do not modify DB.
                    try {
                        await executeRcon(`pardon ${player}`);
                    } catch (rerr) {
                        results.failed.push(player);
                        continue;
                    }

                    // Update database
                    await Ban.updateMany(
                        { playerName: { $regex: new RegExp(`^${player}$`, 'i') }, active: true },
                        { active: false, unbannedBy: pending.staffName, unbannedAt: new Date(), unbanReason: `[Bulk] ${pending.reason}` }
                    );

                    results.success.push(player);
                } catch (e) {
                    results.failed.push(player);
                }
            }
        }

        if (pending.type === 'pardon-warnings') {
            for (const player of pending.players) {
                try {
                    const result = await Warning.updateMany(
                        { playerName: { $regex: new RegExp(`^${player}$`, 'i') }, active: true },
                        { active: false }
                    );
                    results.success.push(`${player} (${result.modifiedCount})`);
                } catch (e) {
                    results.failed.push(player);
                }
            }
        }

        // Build results embed
        const embed = new EmbedBuilder()
            .setTitle(`✅ Bulk ${pending.type.charAt(0).toUpperCase() + pending.type.slice(1)} Complete`)
            .setColor(results.failed.length === 0 ? '#22c55e' : '#f59e0b')
            .addFields(
                { name: '✓ Successful', value: results.success.join(', ') || 'None', inline: false }
            );

        if (results.failed.length > 0) {
            embed.addFields({ name: '✗ Failed', value: results.failed.join(', '), inline: false });
        }

        embed.setFooter({ text: `Executed by ${pending.staffName}` }).setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });

    } catch (error) {
        console.error('Bulk action error:', error);
        await interaction.editReply({ content: '❌ Bulk action failed with an error.' });
    }
}

module.exports = {
    name: 'BulkActions',
    slashCommands,
    handleBulkButton
};
