const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const Verification = require('../database/models/Verification');
const { isAdmin } = require('../utils/permissions');

const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID || '1454688062033629184';
const WEB_BASE = process.env.WEB_BASE_URL || process.env.WEB_BASE || null;
const VERIFIED_ROLE = process.env.VERIFIED_ROLE_ID || null;

// Post the persistent verification embed to a channel (admin-only prefix command)
const commands = {
    postverify: {
        name: 'postverify',
        description: 'Post the persistent verification embed (Admin only)',
        usage: '!postverify',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) return message.reply({ content: 'Permission denied.' });

            const channel = await message.client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
            if (!channel) return message.reply({ content: `Failed to find channel ${VERIFY_CHANNEL_ID}` });

            const embed = new EmbedBuilder()
                .setTitle('Welcome to NewLife SMP')
                .setDescription('Please verify that you accept the Code of Conduct and connect your account to gain access to the server.')
                .setColor(0x5865F2)
                .setFooter({ text: 'Click Verify to begin the verification process.' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('verify_open').setLabel('Verify').setStyle(ButtonStyle.Primary)
            );

            try {
                await channel.send({ embeds: [embed], components: [row] });
                return message.reply({ content: 'Verification embed posted.', allowedMentions: { repliedUser: false } });
            } catch (e) {
                console.error('Failed to post verification embed:', e);
                return message.reply({ content: 'Failed to post verification embed.' });
            }
        }
    }
};

// Handle button interactions
async function handleButton(interaction) {
    if (!interaction.isButton()) return;

    const id = interaction.customId;

    if (id === 'verify_open') {
        // Present acceptance buttons and the code of conduct text
        const coc = `By clicking **Accept** you acknowledge that you have read and agree to follow the NewLife SMP Code of Conduct. You also consent to linking your Discord account to your Minecraft account via the web panel.`;

        const embed = new EmbedBuilder()
            .setTitle('NewLife SMP — Code of Conduct')
            .setDescription(coc)
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('verify_accept').setLabel('Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('verify_decline').setLabel('Decline').setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (id === 'verify_decline') {
        return interaction.update({ content: 'You must accept the Code of Conduct to access the server.', embeds: [], components: [], ephemeral: true });
    }

    if (id === 'verify_accept') {
        // Do NOT record acceptance or assign roles yet.
        // User must complete the web linking step to finalize verification.

        // Present a grey embed with a link button to the web linking page
        const linkBase = WEB_BASE ? WEB_BASE.replace(/\/$/, '') : null;
        const linkUrl = linkBase ? `${linkBase}/link-mc` : null;

        const embed = new EmbedBuilder()
            .setTitle('Link Your Minecraft Account')
            .setDescription('To complete verification, please link your Minecraft account so staff can match you in the admin panel. Click the button below to open the linking page.')
            .setColor(0x808080)
            .setTimestamp();

        const row = [];
        if (linkUrl) {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const action = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Link Minecraft Account').setURL(linkUrl).setStyle(ButtonStyle.Link)
            );
            row.push(action);
        }

        const replyOptions = { embeds: [embed], components: row.length ? row : [], ephemeral: true };
        return interaction.update(replyOptions);
    }
}

module.exports = { name: 'Verification', description: 'Verification embed and button handler', commands, handleButton };
