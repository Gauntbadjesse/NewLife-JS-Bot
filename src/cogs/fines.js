/**
 * Fines Cog
 * /fine <user> <amount> <time?> - issue a fine
 * /paid <case_id> - mark fine paid
 */
const { SlashCommandBuilder } = require('discord.js');
const { randomUUID } = require('crypto');
const Fine = require('../database/models/Fine');
const { getNextCaseNumber } = require('../database/caseCounter');
const { createFineEmbed, createFineDMEmbed, createFineLogEmbed, createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');
const { isStaff, isAdmin } = require('../utils/permissions');

function parseDuration(duration) {
    if (!duration) return null;
    const match = String(duration).toLowerCase().match(/^(\d+)(s|m|h|d)$/);
    if (!match) return null;
    const v = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 'd': return v * 24 * 60 * 60 * 1000;
        case 'h': return v * 60 * 60 * 1000;
        case 'm': return v * 60 * 1000;
        case 's': return v * 1000;
        default: return null;
    }
}

const commands = {
    fine: {
        name: 'fine',
        description: 'Issue a fine to a user (Staff+)',
        usage: '/fine <user> <amount> <time?>',
        async execute(interaction, client) {
            // This execute is intended for slash command handling; if you route prefix commands elsewhere adapt as needed.
        }
    }
};

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('fine')
            .setDescription('Issue a fine to a player')
            .addStringOption(option => option.setName('player').setDescription('Discord user id or player name').setRequired(true))
            .addStringOption(option => option.setName('amount').setDescription('Amount and currency (e.g. 50 coins)').setRequired(true))
            .addStringOption(option => option.setName('time').setDescription('Due time (e.g. 7d, 24h)')),
        async execute(interaction, client) {
            if (!isStaff(interaction.member)) return interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to issue fines.')], ephemeral: true });
            await interaction.deferReply({ ephemeral: false });
            try {
                const player = interaction.options.getString('player');
                const amount = interaction.options.getString('amount');
                const timeStr = interaction.options.getString('time');

                const memberId = player.replace(/[<>@!]/g, '');
                const isMention = /^(\d{17,19})$/.test(memberId);
                const uuid = isMention ? memberId : 'discord-issued';
                const playerName = isMention ? (interaction.options.getString('player') || memberId) : player;

                const now = new Date();
                const caseNumber = await getNextCaseNumber();
                const caseId = randomUUID();

                const dueMs = parseDuration(timeStr);
                const dueAt = dueMs ? new Date(now.getTime() + dueMs) : null;

                const fine = new Fine({
                    _id: caseId,
                    caseNumber,
                    uuid: uuid,
                    playerName,
                    staffUuid: interaction.user.id,
                    staffName: interaction.user.tag,
                    amount,
                    note: null,
                    createdAt: now,
                    dueAt: dueAt,
                    paid: false
                });

                await fine.save();

                // DM the user if possible
                try {
                    if (uuid !== 'discord-issued') {
                        const { sendDm } = require('../utils/dm');
                        await sendDm(client, uuid, { embeds: [createFineDMEmbed(fine)] });
                    }
                } catch (e) { /* ignore DM failures */ }

                // Reply and log
                await interaction.editReply({ embeds: [createSuccessEmbed('Fine Issued', `Case #${fine.caseNumber} issued to ${fine.playerName}.`)] });

                // If there's a command log channel, send a log embed
                const logChannelId = process.env.LOG_CHANNEL_ID;
                if (logChannelId) {
                    try {
                        const ch = await client.channels.fetch(logChannelId).catch(() => null);
                        if (ch) await ch.send({ embeds: [createFineLogEmbed(fine)] }).catch(() => null);
                    } catch (e) {}
                }

            } catch (e) {
                console.error('Error issuing fine:', e);
                return interaction.editReply({ embeds: [createErrorEmbed('Error', 'Failed to issue fine.')] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('paid')
            .setDescription('Mark a fine as paid')
            .addStringOption(option => option.setName('case').setDescription('Fine case id or number').setRequired(true)),
        async execute(interaction, client) {
            if (!isStaff(interaction.member)) return interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission.')], ephemeral: true });
            await interaction.deferReply({ ephemeral: false });
            try {
                const q = interaction.options.getString('case');
                let fine = await Fine.findById(q);
                if (!fine && !isNaN(Number(q))) fine = await Fine.findOne({ caseNumber: Number(q) });
                if (!fine) return interaction.editReply({ embeds: [createErrorEmbed('Not Found', `No fine found for: \`${q}\``)] });

                fine.paid = true;
                fine.paidBy = interaction.user.tag;
                fine.paidAt = new Date();
                await fine.save();

                // DM the user
                try {
                    if (fine.uuid && fine.uuid !== 'discord-issued') {
                        const { sendDm } = require('../utils/dm');
                        await sendDm(client, fine.uuid, { embeds: [createSuccessEmbed('Fine Paid', `Your fine #${fine.caseNumber} has been marked as paid. Thank you.`)] });
                    }
                } catch (e) { }

                // Reply
                await interaction.editReply({ embeds: [createSuccessEmbed('Marked Paid', `Case #${fine.caseNumber} marked as paid.`)] });

            } catch (e) {
                console.error('Error marking fine paid:', e);
                return interaction.editReply({ embeds: [createErrorEmbed('Error', 'Failed to mark fine as paid.')] });
            }
        }
    }
];

module.exports = { name: 'Fines', commands, slashCommands };
