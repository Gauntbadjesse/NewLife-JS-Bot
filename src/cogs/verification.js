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
        // Record acceptance
        try {
            await Verification.findOneAndUpdate(
                { discordId: String(interaction.user.id) },
                { accepted: true, acceptedAt: new Date() },
                { upsert: true }
            );
        } catch (e) {
            console.error('Failed to record verification:', e);
        }

        // Optionally add a verified role
        try {
            if (VERIFIED_ROLE && interaction.member && interaction.member.manageable) {
                await interaction.member.roles.add(VERIFIED_ROLE).catch(() => {});
            }
        } catch (e) {
            // ignore role assignment failures
        }

        // Provide link to web OAuth to connect account (if available)
        const link = WEB_BASE ? `${WEB_BASE.replace(/\/$/, '')}/auth/discord` : null;
        const content = link
            ? `Thank you — you are verified. To link your Minecraft account for the admin panel, please log in here: ${link}`
            : 'Thank you — you are verified.';

        return interaction.update({ content, embeds: [], components: [], ephemeral: true });
    }
}

module.exports = { name: 'Verification', description: 'Verification embed and button handler', commands, handleButton };
