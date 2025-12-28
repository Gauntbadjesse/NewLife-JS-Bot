/**
 * Verification Cog
 * Simple rules acceptance verification system
 * No web redirect - just accept rules and get verified role
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { getEmbedColor } = require('../utils/embeds');

// Environment configuration
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || '1454699545329008802';
const UNVERIFIED_ROLE_ID = process.env.UNVERIFIED_ROLE || '1454700802752118906';
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID || '1374421919373328434';

/**
 * Prefix Commands
 */
const commands = {
    postverify: {
        name: 'postverify',
        description: 'Post the verification embed (Admin only)',
        usage: '!postverify [channel]',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) {
                return message.reply({ content: '❌ Permission denied.', allowedMentions: { repliedUser: false } });
            }

            // Use provided channel or current channel
            let targetChannel = message.channel;
            if (args[0]) {
                const channelId = args[0].replace(/[<#>]/g, '');
                targetChannel = await client.channels.fetch(channelId).catch(() => null);
                if (!targetChannel) {
                    return message.reply({ content: '❌ Channel not found.', allowedMentions: { repliedUser: false } });
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('Welcome to NewLife SMP')
                .setDescription(
                    '**Before you can access the server, please verify that you accept our rules.**\n\n' +
                    '📜 By clicking **Verify** below, you acknowledge that you have read and agree to follow the NewLife SMP rules and guidelines.\n\n' +
                    '• Be respectful to all players and staff\n' +
                    '• No griefing, stealing, or cheating\n' +
                    '• No hate speech or harassment\n' +
                    '• Follow staff instructions\n\n' +
                    '*Full rules can be found at [newlifesmp.com/rules](https://newlifesmp.com/rules)*'
                )
                .setColor(getEmbedColor())
                .setFooter({ text: 'NewLife SMP • Verification' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_accept')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅')
            );

            try {
                await targetChannel.send({ embeds: [embed], components: [row] });
                if (message.channel.id !== targetChannel.id) {
                    await message.reply({ content: `✅ Verification embed posted in ${targetChannel}.`, allowedMentions: { repliedUser: false } });
                }
                try { await message.delete(); } catch (e) { /* ignore */ }
            } catch (e) {
                console.error('Failed to post verification embed:', e);
                return message.reply({ content: '❌ Failed to post verification embed.', allowedMentions: { repliedUser: false } });
            }
        }
    }
};

/**
 * Handle button interactions
 */
async function handleButton(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'verify_accept') return;

    try {
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member;
        if (!member) {
            return interaction.editReply({ content: '❌ Could not find your member data.' });
        }

        // Check if already verified
        if (VERIFIED_ROLE_ID && member.roles.cache.has(VERIFIED_ROLE_ID)) {
            return interaction.editReply({ content: '✅ You are already verified!' });
        }

        // Remove unverified role and add verified roles
        const rolesToAdd = [VERIFIED_ROLE_ID, MEMBER_ROLE_ID].filter(Boolean);
        const rolesToRemove = [UNVERIFIED_ROLE_ID].filter(Boolean);

        try {
            for (const roleId of rolesToRemove) {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId).catch(() => {});
                }
            }
            for (const roleId of rolesToAdd) {
                if (!member.roles.cache.has(roleId)) {
                    await member.roles.add(roleId).catch(() => {});
                }
            }
        } catch (e) {
            console.error('Failed to update roles during verification:', e);
        }

        // Success response
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Verification Complete')
            .setDescription(
                'Welcome to NewLife SMP!\n\n' +
                '**Next Steps:**\n' +
                '• To join the Minecraft server, apply for whitelist in <#1437529799987040327>\n' +
                '• Check out the rules at [newlifesmp.com/rules](https://newlifesmp.com/rules)\n' +
                '• View our wiki at [wiki.newlifesmp.com](https://wiki.newlifesmp.com)\n\n' +
                'If you need help, open a ticket or ask in the community channels!'
            )
            .setColor(0x57F287)
            .setFooter({ text: 'NewLife SMP' })
            .setTimestamp();

        return interaction.editReply({ embeds: [successEmbed] });
    } catch (e) {
        console.error('Verification button error:', e);
        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({ content: '❌ An error occurred during verification.', ephemeral: true });
        }
        return interaction.editReply({ content: '❌ An error occurred during verification.' });
    }
}

module.exports = {
    name: 'Verification',
    description: 'Simple rules acceptance verification',
    commands,
    handleButton
};
