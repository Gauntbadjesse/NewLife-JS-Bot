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
const Ban = require('../database/models/Ban');
const { getNextCaseNumber } = require('../database/caseCounter');
const { isAdmin, isSupervisor, isOwner } = require('../utils/permissions');
const { getEmbedColor } = require('../utils/embeds');

// Environment configuration
const APPLICATION_CHANNEL_ID = process.env.APPLICATION_CHANNEL_ID || null;
const APPLICATION_LOG_CHANNEL_ID = process.env.APPLICATION_LOG_CHANNEL_ID || null;
const BAN_LOG_CHANNEL_ID = process.env.BAN_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID || null;
const MINIMUM_AGE = 13; // Discord ToS minimum age

// Progress bar characters for pie chart visualization
const BAR_FULL = '█';
const BAR_EMPTY = '░';

/**
 * Ban underage user for Discord ToS violation
 * @param {Interaction} interaction - The modal interaction
 * @param {number} age - The age entered by the user
 * @param {Client} client - Discord client
 */
async function banUnderageUser(interaction, age, client) {
    const reason = `Underage user (${age} years old) - Discord Terms of Service violation (must be 13+)`;
    const caseId = randomUUID();
    const caseNumber = await getNextCaseNumber();
    
    try {
        // Try to DM the user before banning
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('You Have Been Banned')
                .setDescription(
                    'You have been automatically banned from **NewLife SMP** for violating Discord\'s Terms of Service.\n\n' +
                    '**Reason:** You must be at least 13 years old to use Discord.\n\n' +
                    'If you believe this was a mistake, you may appeal when you meet the age requirement.'
                )
                .setColor(0xED4245)
                .setFooter({ text: 'NewLife SMP' })
                .setTimestamp();
            
            await interaction.user.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch (e) {
            // Ignore DM failures
        }
        
        // Get the member and ban them
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        
        if (member) {
            await interaction.guild.members.ban(member, { 
                reason,
                deleteMessageSeconds: 0 // Don't delete their messages
            });
        } else {
            // If member not found, try banning by ID
            await interaction.guild.bans.create(interaction.user.id, {
                reason,
                deleteMessageSeconds: 0
            });
        }
        
        // Create ban record in database
        const ban = new Ban({
            _id: caseId,
            caseNumber,
            uuid: interaction.user.id,
            playerName: interaction.user.tag,
            staffUuid: client.user.id,
            staffName: client.user.tag,
            reason: reason,
            createdAt: new Date(),
            active: true,
            automated: true,
            automatedReason: 'underage_application'
        });
        
        await ban.save();
        
        // Log the ban to the log channel
        if (BAN_LOG_CHANNEL_ID) {
            try {
                const logChannel = await client.channels.fetch(BAN_LOG_CHANNEL_ID).catch(() => null);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('Automatic Ban - Underage User')
                        .setColor(0xED4245)
                        .addFields(
                            { name: 'User', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                            { name: 'User ID', value: interaction.user.id, inline: true },
                            { name: 'Age Entered', value: String(age), inline: true },
                            { name: 'Reason', value: reason, inline: false },
                            { name: 'Case Number', value: `#${caseNumber}`, inline: true },
                            { name: 'Case ID', value: caseId, inline: true }
                        )
                        .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
                        .setFooter({ text: 'Automated ToS Enforcement' })
                        .setTimestamp();
                    
                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (e) {
                console.error('[Applications] Failed to log underage ban:', e);
            }
        }
        
        console.log(`[Applications] Banned underage user ${interaction.user.tag} (age: ${age}) - Case #${caseNumber}`);
        
        return { success: true, caseNumber, caseId };
    } catch (error) {
        console.error('[Applications] Failed to ban underage user:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate a text-based bar chart for source analytics
 */
function generateSourceChart(analytics, barLength = 20) {
    if (!analytics || analytics.length === 0) {
        return 'No data available.';
    }
    
    const total = analytics.reduce((sum, a) => sum + a.count, 0);
    let chart = '';
    
    for (const source of analytics) {
        const percentage = (source.count / total) * 100;
        const filled = Math.round((percentage / 100) * barLength);
        const empty = barLength - filled;
        const bar = BAR_FULL.repeat(filled) + BAR_EMPTY.repeat(empty);
        
        chart += `${source.label.padEnd(20)} ${bar} ${source.count} (${percentage.toFixed(1)}%)\n`;
    }
    
    return chart;
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

        // Check if user is underage (Discord ToS requires 13+)
        if (age < MINIMUM_AGE) {
            // Ban the user for ToS violation
            const banResult = await banUnderageUser(interaction, age, interaction.client);
            
            if (banResult.success) {
                // Reply will likely fail since user is banned, but try anyway
                return interaction.editReply({ 
                    content: 'Your application could not be processed due to a Terms of Service violation.' 
                }).catch(() => {});
            } else {
                // If ban failed, still reject the application
                console.error('[Applications] Failed to ban underage user:', banResult.error);
                return interaction.editReply({ 
                    content: 'Your application could not be processed. Please contact server staff if you believe this is an error.' 
                });
            }
        }

        // Get linked accounts
        const linkedAccounts = await LinkedAccount.find({ discordId: interaction.user.id });

        // Create the application with normalized source
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
            whereFoundRaw: whereFound,
            whereFoundCategory: WhitelistApplication.normalizeSource(whereFound),
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

/**
 * Prefix Commands
 */
const commands = {
    from: {
        name: 'from',
        description: 'View application source analytics (Owner only)',
        usage: '!from [days]',
        async execute(message, args, client) {
            if (!isOwner(message.member)) {
                return message.reply({ content: 'Permission denied. Owner only.', allowedMentions: { repliedUser: false } });
            }

            try {
                // Parse optional days argument
                const days = parseInt(args[0]) || 0; // 0 = all time
                let startDate = null;
                let periodLabel = 'All Time';
                
                if (days > 0) {
                    startDate = new Date();
                    startDate.setDate(startDate.getDate() - days);
                    periodLabel = `Last ${days} Days`;
                }

                // Get analytics from both Application models
                const [appAnalytics, whitelistAnalytics] = await Promise.all([
                    require('../database/models/Application').getSourceAnalytics(startDate),
                    WhitelistApplication.getSourceAnalytics(startDate)
                ]);

                // Merge results from both models
                const mergedMap = new Map();
                
                for (const item of [...appAnalytics, ...whitelistAnalytics]) {
                    if (mergedMap.has(item.category)) {
                        mergedMap.get(item.category).count += item.count;
                    } else {
                        mergedMap.set(item.category, { ...item });
                    }
                }
                
                // Recalculate percentages
                const merged = Array.from(mergedMap.values());
                const total = merged.reduce((sum, a) => sum + a.count, 0);
                
                merged.forEach(item => {
                    item.percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
                });
                
                // Sort by count
                merged.sort((a, b) => b.count - a.count);

                if (merged.length === 0 || total === 0) {
                    return message.reply({ 
                        content: 'No application data found for the specified period.', 
                        allowedMentions: { repliedUser: false } 
                    });
                }

                // Build the chart
                const chart = generateSourceChart(merged);

                const embed = new EmbedBuilder()
                    .setTitle('Application Source Analytics')
                    .setDescription(`**Period:** ${periodLabel}\n**Total Applications:** ${total}`)
                    .setColor(getEmbedColor())
                    .addFields({
                        name: 'Source Breakdown',
                        value: '```\n' + chart + '```',
                        inline: false
                    })
                    .setFooter({ text: 'NewLife SMP | Application Analytics' })
                    .setTimestamp();

                // Add top 3 as separate fields for emphasis
                if (merged.length >= 1) {
                    embed.addFields({
                        name: 'Top Sources',
                        value: merged.slice(0, 5).map((s, i) => 
                            `**${i + 1}.** ${s.label}: ${s.count} (${s.percentage}%)`
                        ).join('\n'),
                        inline: false
                    });
                }

                return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
            } catch (err) {
                console.error('Error generating source analytics:', err);
                return message.reply({ 
                    content: 'Failed to generate analytics.', 
                    allowedMentions: { repliedUser: false } 
                });
            }
        }
    }
};

module.exports = {
    name: 'Applications',
    description: 'Whitelist application system',
    slashCommands,
    commands,
    handleButton,
    handleModal
};
