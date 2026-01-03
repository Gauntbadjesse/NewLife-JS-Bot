/**
 * Application Panel Cog
 * Whitelist application system with account linking requirement
 * Users must link at least one Minecraft account before applying
 */
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const { randomUUID } = require('crypto');
const LinkedAccount = require('../database/models/LinkedAccount');
const WhitelistApplication = require('../database/models/WhitelistApplication');
const { isAdmin, isSupervisor } = require('../utils/permissions');
const { getEmbedColor } = require('../utils/embeds');

// Environment configuration
const APPLICATION_CHANNEL_ID = process.env.APPLICATION_CHANNEL_ID || null;
const APPLICATION_LOG_CHANNEL_ID = process.env.APPLICATION_LOG_CHANNEL_ID || null;

/**
 * Lookup Minecraft profile from mcprofile.io
 */
async function lookupMcProfile(platform, username) {
    try {
        let fetcher = globalThis.fetch;
        if (!fetcher) fetcher = require('node-fetch');
        
        // Different endpoint for bedrock vs java
        const endpoint = platform === 'bedrock' 
            ? `https://mcprofile.io/api/v1/bedrock/gamertag/${encodeURIComponent(username)}`
            : `https://mcprofile.io/api/v1/java/username/${encodeURIComponent(username)}`;
        
        const res = await fetcher(endpoint);
        if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
        
        const data = await res.json();
        
        // For bedrock, use fuuid; for java, use uuid
        let id = null;
        if (platform === 'bedrock') {
            id = data.fuuid || data.floodgateuid || data.id;
        } else {
            id = data.uuid || data.id;
        }
        
        if (!id) throw new Error('Could not determine UUID from response');
        
        return {
            uuid: id,
            username: data.name || data.username || username,
            platform
        };
    } catch (e) {
        throw e;
    }
}

/**
 * Slash Commands
 */
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('apanel')
            .setDescription('Post the whitelist application panel (Admin only)'),
        
        async execute(interaction, client) {
            if (!isAdmin(interaction.member) && !isSupervisor(interaction.member)) {
                return interaction.reply({ content: 'Permission denied.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('Apply for Whitelist')
                .setDescription(
                    '**Want to join NewLife SMP?**\n\n' +
                    'Before applying, you must:\n' +
                    '1. Link your Minecraft account(s) to your Discord\n' +
                    '2. Complete the application form\n\n' +
                    '*You can link multiple accounts (Java & Bedrock supported)*\n\n' +
                    '**Click the button below to start!**'
                )
                .setColor(getEmbedColor())
                .setFooter({ text: 'NewLife SMP • Whitelist Applications' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('app_start')
                    .setLabel('Apply for Whitelist')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: 'Application panel posted.', ephemeral: true });
        }
    }
];

/**
 * Handle button interactions
 */
async function handleButton(interaction) {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    if (customId === 'app_start') {
        // Check if user has linked accounts
        const linkedAccounts = await LinkedAccount.find({ discordId: interaction.user.id });

        if (!linkedAccounts || linkedAccounts.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('Link Your Account First')
                .setDescription(
                    'Before you can apply for whitelist, you need to link at least one Minecraft account.\n\n' +
                    '**How to link:**\n' +
                    '1. Use the `/linkaccount` command\n' +
                    '2. Select your platform (Java or Bedrock)\n' +
                    '3. Enter your Minecraft username\n\n' +
                    '*Bedrock users: If your gamertag has a space, include the `.` prefix*'
                )
                .setColor(0xFFA500)
                .setFooter({ text: 'NewLife SMP' });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Check if user already has a pending application
        const existingApp = await WhitelistApplication.findOne({
            discordId: interaction.user.id,
            status: 'pending'
        });

        if (existingApp) {
            return interaction.reply({
                content: 'You already have a pending application. Please wait for it to be reviewed.',
                ephemeral: true
            });
        }

        // Show the application modal
        const modal = new ModalBuilder()
            .setCustomId('app_modal')
            .setTitle('Whitelist Application');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('age')
                    .setLabel('How old are you?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(3)
                    .setPlaceholder('e.g., 18')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('where_found')
                    .setLabel('How did you find NewLife SMP?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100)
                    .setPlaceholder('e.g., Reddit, YouTube, Friend')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('why_join')
                    .setLabel('Why do you want to join?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMinLength(50)
                    .setMaxLength(1000)
                    .setPlaceholder('Tell us about yourself and why you want to be part of our community...')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('playstyle')
                    .setLabel('What is your playstyle?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(500)
                    .setPlaceholder('Builder, redstoner, explorer, farmer, etc.')
            )
        );

        return interaction.showModal(modal);
    }

    // Application review buttons (staff only)
    if (customId.startsWith('app_approve_') || customId.startsWith('app_deny_')) {
        if (!isAdmin(interaction.member) && !isSupervisor(interaction.member)) {
            return interaction.reply({ content: 'Permission denied.', ephemeral: true });
        }

        const appId = customId.split('_')[2];
        const action = customId.startsWith('app_approve_') ? 'approved' : 'denied';

        const app = await WhitelistApplication.findById(appId);
        if (!app) {
            return interaction.reply({ content: 'Application not found.', ephemeral: true });
        }

        if (app.status !== 'pending') {
            return interaction.reply({ content: 'This application has already been processed.', ephemeral: true });
        }

        app.status = action;
        app.reviewedBy = interaction.user.id;
        app.reviewedAt = new Date();
        await app.save();

        // Update the embed
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(action === 'approved' ? 0x57F287 : 0xED4245)
            .setFooter({ text: `${action === 'approved' ? 'Approved' : 'Denied'} by ${interaction.user.tag}` });

        await interaction.update({ embeds: [embed], components: [] });

        // Notify the applicant
        try {
            const member = await interaction.guild.members.fetch(app.discordId).catch(() => null);
            if (member) {
                const dmEmbed = new EmbedBuilder()
                    .setTitle(action === 'approved' ? 'Application Approved' : 'Application Denied')
                    .setDescription(
                        action === 'approved'
                            ? 'Congratulations! Your whitelist application has been approved.\n\nYou should be whitelisted shortly. Check <#general> for server IP and instructions!'
                            : 'Unfortunately, your whitelist application has been denied.\n\nYou may reapply in the future if you believe this was in error.'
                    )
                    .setColor(action === 'approved' ? 0x57F287 : 0xED4245)
                    .setFooter({ text: 'NewLife SMP' })
                    .setTimestamp();

                await member.send({ embeds: [dmEmbed] }).catch(() => {});
            }
        } catch (e) { /* ignore DM failures */ }
    }
}

/**
 * Handle modal submissions
 */
async function handleModal(interaction) {
    if (!interaction.isModalSubmit()) return false;
    if (interaction.customId !== 'app_modal') return false;

    await interaction.deferReply({ ephemeral: true });

    try {
        const age = parseInt(interaction.fields.getTextInputValue('age'));
        const whereFound = interaction.fields.getTextInputValue('where_found');
        const whyJoin = interaction.fields.getTextInputValue('why_join');
        const playstyle = interaction.fields.getTextInputValue('playstyle') || null;

        if (isNaN(age) || age < 1 || age > 120) {
            return interaction.editReply({ content: 'Please enter a valid age.' });
        }

        // Get linked accounts
        const linkedAccounts = await LinkedAccount.find({ discordId: interaction.user.id });

        // Create the application
        const app = new WhitelistApplication({
            _id: randomUUID(),
            discordId: interaction.user.id,
            discordTag: interaction.user.tag,
            linkedAccounts: linkedAccounts.map(a => ({
                minecraftUsername: a.minecraftUsername,
                uuid: a.uuid,
                platform: a.platform
            })),
            age,
            whereFound,
            whyJoin,
            playstyle,
            createdAt: new Date()
        });

        await app.save();

        // Build the application embed for staff
        const accountsText = linkedAccounts.map(a => {
            const platform = a.platform === 'bedrock' ? '[Bedrock]' : '[Java]';
            return `${platform} ${a.minecraftUsername} (\`${a.uuid}\`)`;
        }).join('\n');

        const appEmbed = new EmbedBuilder()
            .setTitle('New Whitelist Application')
            .setDescription(`**Applicant:** ${interaction.user.tag} (<@${interaction.user.id}>)`)
            .addFields(
                { name: 'Linked Accounts', value: accountsText || 'None', inline: false },
                { name: 'Age', value: String(age), inline: true },
                { name: 'Found Us Via', value: whereFound, inline: true },
                { name: 'Why Join', value: whyJoin.substring(0, 1024), inline: false }
            )
            .setColor(getEmbedColor())
            .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
            .setFooter({ text: `Application ID: ${app._id}` })
            .setTimestamp();

        if (playstyle) {
            appEmbed.addFields({ name: 'Playstyle', value: playstyle.substring(0, 1024), inline: false });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`app_approve_${app._id}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`app_deny_${app._id}`)
                .setLabel('Deny')
                .setStyle(ButtonStyle.Danger)
        );

        // Send to application log channel
        if (APPLICATION_LOG_CHANNEL_ID) {
            const logChannel = await interaction.client.channels.fetch(APPLICATION_LOG_CHANNEL_ID).catch(() => null);
            if (logChannel) {
                await logChannel.send({ embeds: [appEmbed], components: [row] });
            }
        }

        // Success response to user
        const successEmbed = new EmbedBuilder()
            .setTitle('Application Submitted')
            .setDescription(
                'Your whitelist application has been submitted!\n\n' +
                'Our staff will review it as soon as possible. You will receive a DM when a decision is made.\n\n' +
                '*Thank you for your interest in NewLife SMP!*'
            )
            .setColor(0x57F287)
            .setFooter({ text: 'NewLife SMP' })
            .setTimestamp();

        return interaction.editReply({ embeds: [successEmbed] });
    } catch (e) {
        console.error('Application modal error:', e);
        return interaction.editReply({ content: 'An error occurred while submitting your application.' });
    }
}

module.exports = {
    name: 'Applications',
    description: 'Whitelist application system',
    slashCommands,
    handleButton,
    handleModal
};
