/**
 * Appeals Cog
 * Handles ban appeal submissions and management
 * 
 * Features:
 * - Appeal button on embed in support channel
 * - Modal form for appeal submission
 * - Appeals sent to appeals channel for review
 * - Supervisor/Management/Owner can approve/deny
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const Appeal = require('../database/models/Appeal');
const Ban = require('../database/models/Ban');
const { isSupervisor } = require('../utils/permissions');
const { executeRcon } = require('../utils/rcon');

const APPEAL_BUTTON_CHANNEL = '1437529797709529191';
const APPEALS_REVIEW_CHANNEL = '1440146866225549316';

/**
 * Send the appeal embed with button to the designated channel
 */
async function sendAppealEmbed(client) {
    try {
        const channel = await client.channels.fetch(APPEAL_BUTTON_CHANNEL);
        if (!channel) {
            console.error('Appeal button channel not found');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('🔔 Ban Appeal')
            .setDescription(
                'Have you been banned and believe it was unfair or want a second chance?\n\n' +
                '**Before appealing, please note:**\n' +
                '• Appeals are reviewed by senior staff\n' +
                '• Be honest and respectful in your appeal\n' +
                '• Provide your Minecraft username and ban reason\n' +
                '• Appeals typically take 24-72 hours to review\n\n' +
                'Click the button below to submit your appeal.'
            )
            .setColor('#f59e0b')
            .setFooter({ text: 'NewLife SMP Appeals' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('appeal_start')
                    .setLabel('Submit Appeal')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📝')
            );

        await channel.send({ embeds: [embed], components: [row] });
        console.log('Appeal embed sent to channel');
    } catch (error) {
        console.error('Failed to send appeal embed:', error);
    }
}

/**
 * Handle appeal button click - show modal
 */
async function handleAppealButton(interaction) {
    if (interaction.customId !== 'appeal_start') return false;

    // Check if user already has a pending appeal
    const existingAppeal = await Appeal.findOne({ 
        discordId: interaction.user.id, 
        status: { $in: ['pending', 'under_review'] }
    });

    if (existingAppeal) {
        return interaction.reply({
            content: '❌ You already have a pending appeal. Please wait for it to be reviewed.',
            ephemeral: true
        });
    }

    const modal = new ModalBuilder()
        .setCustomId('appeal_modal')
        .setTitle('Ban Appeal Form');

    const mcNameInput = new TextInputBuilder()
        .setCustomId('mc_name')
        .setLabel('Minecraft Username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Your Minecraft username')
        .setRequired(true)
        .setMaxLength(32);

    const banReasonInput = new TextInputBuilder()
        .setCustomId('ban_reason')
        .setLabel('What were you banned for?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('The reason shown when you try to join')
        .setRequired(true)
        .setMaxLength(200);

    const appealReasonInput = new TextInputBuilder()
        .setCustomId('appeal_reason')
        .setLabel('Why should you be unbanned?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Explain why you believe you should be given another chance...')
        .setRequired(true)
        .setMaxLength(1000);

    const additionalInput = new TextInputBuilder()
        .setCustomId('additional_info')
        .setLabel('Additional Information (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Any other information you want to add...')
        .setRequired(false)
        .setMaxLength(500);

    modal.addComponents(
        new ActionRowBuilder().addComponents(mcNameInput),
        new ActionRowBuilder().addComponents(banReasonInput),
        new ActionRowBuilder().addComponents(appealReasonInput),
        new ActionRowBuilder().addComponents(additionalInput)
    );

    await interaction.showModal(modal);
    return true;
}

/**
 * Handle appeal modal submission
 */
async function handleAppealModal(interaction) {
    if (interaction.customId !== 'appeal_modal') return false;

    await interaction.deferReply({ ephemeral: true });

    try {
        const mcName = interaction.fields.getTextInputValue('mc_name');
        const banReason = interaction.fields.getTextInputValue('ban_reason');
        const appealReason = interaction.fields.getTextInputValue('appeal_reason');
        const additionalInfo = interaction.fields.getTextInputValue('additional_info') || null;

        // Try to find their ban in the database
        const ban = await Ban.findOne({
            playerName: { $regex: new RegExp(`^${mcName}$`, 'i') },
            active: true
        }).sort({ createdAt: -1 });

        // Create the appeal
        const appeal = new Appeal({
            discordId: interaction.user.id,
            discordTag: interaction.user.tag,
            playerName: mcName,
            caseNumber: ban?.caseNumber || null,
            banId: ban?._id || null,
            reason: appealReason,
            additionalInfo: additionalInfo,
            status: 'pending'
        });

        await appeal.save();

        // Send to appeals review channel
        const reviewChannel = await interaction.client.channels.fetch(APPEALS_REVIEW_CHANNEL);
        if (reviewChannel) {
            const reviewEmbed = new EmbedBuilder()
                .setTitle('📋 New Ban Appeal')
                .setColor('#f59e0b')
                .addFields(
                    { name: 'Appellant', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                    { name: 'Minecraft Name', value: mcName, inline: true },
                    { name: 'Case #', value: ban?.caseNumber ? `#${ban.caseNumber}` : 'Not found', inline: true },
                    { name: 'Original Ban Reason', value: ban?.reason || banReason, inline: false },
                    { name: 'Appeal Reason', value: appealReason.substring(0, 1024), inline: false }
                )
                .setFooter({ text: `Appeal ID: ${appeal._id}` })
                .setTimestamp();

            if (additionalInfo) {
                reviewEmbed.addFields({ name: 'Additional Info', value: additionalInfo.substring(0, 1024), inline: false });
            }

            const reviewRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`appeal_approve_${appeal._id}`)
                        .setLabel('Approve')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId(`appeal_deny_${appeal._id}`)
                        .setLabel('Deny')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌'),
                    new ButtonBuilder()
                        .setCustomId(`appeal_review_${appeal._id}`)
                        .setLabel('Under Review')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔍')
                );

            const msg = await reviewChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
            appeal.messageId = msg.id;
            await appeal.save();
        }

        await interaction.editReply({
            content: '✅ Your appeal has been submitted successfully!\n\nOur staff will review it within 24-72 hours. You will be notified of the decision via DM.',
        });

    } catch (error) {
        console.error('Error handling appeal modal:', error);
        await interaction.editReply({
            content: '❌ An error occurred while submitting your appeal. Please try again later.',
        });
    }

    return true;
}

/**
 * Handle appeal review buttons (approve/deny/under_review)
 */
async function handleAppealReview(interaction) {
    if (!interaction.customId.startsWith('appeal_')) return false;
    if (interaction.customId === 'appeal_start') return false;

    const parts = interaction.customId.split('_');
    const action = parts[1]; // approve, deny, or review
    const appealId = parts[2];

    // Check permissions - Supervisor+ only
    if (!isSupervisor(interaction.member)) {
        return interaction.reply({
            content: '❌ Only Supervisors, Management, and Owners can review appeals.',
            ephemeral: true
        });
    }

    try {
        const appeal = await Appeal.findById(appealId);
        if (!appeal) {
            return interaction.reply({
                content: '❌ Appeal not found.',
                ephemeral: true
            });
        }

        if (appeal.status !== 'pending' && appeal.status !== 'under_review') {
            return interaction.reply({
                content: `❌ This appeal has already been ${appeal.status}.`,
                ephemeral: true
            });
        }

        let newStatus;
        let dmMessage;
        let embedColor;

        switch (action) {
            case 'approve':
                newStatus = 'approved';
                embedColor = '#22c55e';
                dmMessage = `✅ **Good news!** Your ban appeal for **${appeal.playerName}** has been approved!\n\nYou should now be able to rejoin the server. Please make sure to follow the rules.`;
                
                // Try to unban via RCON
                try {
                    await executeRcon(`pardon ${appeal.playerName}`);
                } catch (e) {
                    console.warn('RCON unban failed:', e);
                }

                // Update ban record
                if (appeal.banId) {
                    await Ban.findByIdAndUpdate(appeal.banId, {
                        active: false,
                        removedBy: interaction.user.tag,
                        removedAt: new Date(),
                        removeReason: 'Appeal approved'
                    });
                }
                break;

            case 'deny':
                newStatus = 'denied';
                embedColor = '#ef4444';
                dmMessage = `❌ Your ban appeal for **${appeal.playerName}** has been denied.\n\nIf you believe this decision was made in error, you may submit a new appeal in 30 days.`;
                break;

            case 'review':
                newStatus = 'under_review';
                embedColor = '#3b82f6';
                dmMessage = `🔍 Your ban appeal for **${appeal.playerName}** is now under review.\n\nA staff member is looking into your case. You will be notified once a decision is made.`;
                break;

            default:
                return interaction.reply({ content: '❌ Invalid action.', ephemeral: true });
        }

        // Update appeal
        appeal.status = newStatus;
        appeal.reviewedBy = interaction.user.tag;
        appeal.reviewedAt = new Date();
        await appeal.save();

        // Update the embed
        const originalEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setColor(embedColor)
            .addFields({ 
                name: 'Status', 
                value: `${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)} by ${interaction.user.tag}`,
                inline: false 
            });

        // Disable buttons if approved or denied
        let components = [];
        if (newStatus === 'under_review') {
            components = interaction.message.components;
        }

        await interaction.update({ embeds: [updatedEmbed], components });

        // DM the appellant
        try {
            const user = await interaction.client.users.fetch(appeal.discordId);
            await user.send(dmMessage);
        } catch (e) {
            console.warn('Failed to DM appellant:', e);
        }

        if (newStatus !== 'under_review') {
            await interaction.followUp({
                content: `✅ Appeal ${newStatus}. User has been notified.`,
                ephemeral: true
            });
        }

    } catch (error) {
        console.error('Error handling appeal review:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing the appeal.',
            ephemeral: true
        });
    }

    return true;
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('appeal')
            .setDescription('Appeal management commands')
            .addSubcommand(sub => sub
                .setName('setup')
                .setDescription('Send the appeal embed to the support channel (Admin+)')
            )
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List pending appeals (Supervisor+)')
            )
            .addSubcommand(sub => sub
                .setName('view')
                .setDescription('View a specific appeal')
                .addStringOption(opt => opt.setName('id').setDescription('Appeal ID').setRequired(true))
            ),

        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();

            if (sub === 'setup') {
                if (!isSupervisor(interaction.member)) {
                    return interaction.reply({ content: '❌ Permission denied.', ephemeral: true });
                }
                await interaction.deferReply({ ephemeral: true });
                await sendAppealEmbed(client);
                return interaction.editReply({ content: '✅ Appeal embed sent!' });
            }

            if (sub === 'list') {
                if (!isSupervisor(interaction.member)) {
                    return interaction.reply({ content: '❌ Permission denied.', ephemeral: true });
                }
                await interaction.deferReply({ ephemeral: true });

                const appeals = await Appeal.find({ status: { $in: ['pending', 'under_review'] } })
                    .sort({ createdAt: -1 })
                    .limit(20);

                if (appeals.length === 0) {
                    return interaction.editReply({ content: '📋 No pending appeals.' });
                }

                const lines = appeals.map(a => 
                    `• **${a.playerName}** - ${a.status} - <t:${Math.floor(a.createdAt.getTime()/1000)}:R> - ID: \`${a._id}\``
                );

                const embed = new EmbedBuilder()
                    .setTitle('📋 Pending Appeals')
                    .setDescription(lines.join('\n'))
                    .setColor('#f59e0b')
                    .setFooter({ text: `${appeals.length} appeal(s)` });

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'view') {
                if (!isSupervisor(interaction.member)) {
                    return interaction.reply({ content: '❌ Permission denied.', ephemeral: true });
                }

                const appealId = interaction.options.getString('id');
                const appeal = await Appeal.findById(appealId);

                if (!appeal) {
                    return interaction.reply({ content: '❌ Appeal not found.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`📋 Appeal: ${appeal.playerName}`)
                    .setColor(appeal.status === 'approved' ? '#22c55e' : appeal.status === 'denied' ? '#ef4444' : '#f59e0b')
                    .addFields(
                        { name: 'Discord', value: `<@${appeal.discordId}>`, inline: true },
                        { name: 'Status', value: appeal.status, inline: true },
                        { name: 'Case #', value: appeal.caseNumber ? `#${appeal.caseNumber}` : 'N/A', inline: true },
                        { name: 'Appeal Reason', value: appeal.reason.substring(0, 1024), inline: false }
                    )
                    .setTimestamp(appeal.createdAt);

                if (appeal.reviewedBy) {
                    embed.addFields({ name: 'Reviewed By', value: appeal.reviewedBy, inline: true });
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    }
];

module.exports = {
    name: 'Appeals',
    slashCommands,
    handleAppealButton,
    handleAppealModal,
    handleAppealReview,
    sendAppealEmbed
};
