/**
 * Verification Cog
 * Simple rules acceptance - adds member role
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { getEmbedColor } = require('../utils/embeds');

const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID || '1374421919373328434';
const MEMBER_COUNTER_CHANNEL = process.env.MEMBER_COUNTER_CHANNEL || '1437529792755794123';

const commands = {
    postverify: {
        name: 'postverify',
        description: 'Post the verification embed (Admin only)',
        usage: '!postverify [channel]',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) {
                return message.reply({ content: 'Permission denied.', allowedMentions: { repliedUser: false } });
            }

            let targetChannel = message.channel;
            if (args[0]) {
                const channelId = args[0].replace(/[<#>]/g, '');
                targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) {
                    return message.reply({ content: 'Channel not found.', allowedMentions: { repliedUser: false } });
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('Welcome to NewLife SMP')
                .setDescription(
                    '**Before you can access the server, please verify that you accept our rules.**\n\n' +
                    'By clicking **Verify** below, you acknowledge that you have read and agree to follow the NewLife SMP rules and guidelines.\n\n' +
                    '- Be respectful to all players and staff\n' +
                    '- No griefing, stealing, or cheating\n' +
                    '- No hate speech or harassment\n' +
                    '- Follow staff instructions\n\n' +
                    '*Full rules can be found at [newlifesmp.com/rules](https://newlifesmp.com/rules)*'
                )
                .setColor(getEmbedColor())
                .setFooter({ text: 'NewLife SMP | Verification' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_accept')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
            );

            try {
                await targetChannel.send({ embeds: [embed], components: [row] });
                if (message.channel.id !== targetChannel.id) {
                    await message.reply({ content: `Verification embed posted in ${targetChannel}.`, allowedMentions: { repliedUser: false } });
                }
                try { await message.delete(); } catch (e) {}
            } catch (e) {
                console.error('Failed to post verification embed:', e);
                return message.reply({ content: 'Failed to post verification embed.', allowedMentions: { repliedUser: false } });
            }
        }
    }
};

async function handleButton(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'verify_accept') return;

    try {
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member;
        if (!member) {
            return interaction.editReply({ content: 'Could not find your member data.' });
        }

        // Check if already has member role
        if (member.roles.cache.has(MEMBER_ROLE_ID)) {
            return interaction.editReply({ content: 'You are already verified!' });
        }

        // Add member role
        try {
            await member.roles.add(MEMBER_ROLE_ID);
        } catch (e) {
            console.error('Failed to add member role:', e);
            return interaction.editReply({ content: 'Failed to add role. Please contact staff.' });
        }

        // Update member counter
        try {
            const counterChannel = await interaction.guild.channels.fetch(MEMBER_COUNTER_CHANNEL).catch(() => null);
            if (counterChannel && typeof counterChannel.setTopic === 'function') {
                const verifiedCount = interaction.guild.members.cache.filter(m => m.roles.cache.has(MEMBER_ROLE_ID)).size;
                await counterChannel.setTopic(`Members: ${verifiedCount}`).catch(() => {});
            }
        } catch (e) {}

        const successEmbed = new EmbedBuilder()
            .setTitle('Verification Complete')
            .setDescription(
                'Welcome to NewLife SMP!\n\n' +
                '**Next Steps:**\n' +
                '- Apply for whitelist in <#1437529799987040327>\n' +
                '- Check out the rules at [newlifesmp.com/rules](https://newlifesmp.com/rules)\n\n' +
                'If you need help, open a ticket!'
            )
            .setColor(0x57F287)
            .setFooter({ text: 'NewLife SMP' })
            .setTimestamp();

        return interaction.editReply({ embeds: [successEmbed] });
    } catch (e) {
        console.error('Verification error:', e);
        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({ content: 'An error occurred.', ephemeral: true });
        }
        return interaction.editReply({ content: 'An error occurred.' });
    }
}

module.exports = {
    name: 'Verification',
    description: 'Simple verification system',
    commands,
    slashCommands: [],
    handleButton
};
