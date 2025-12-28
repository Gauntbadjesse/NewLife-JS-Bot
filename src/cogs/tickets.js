/**
 * Tickets Cog
 * Support ticket system for NewLife Management Bot
 * 
 * Ticket Types:
 * - General: Questions/concerns (Sr Mod+ access)
 * - Report: Player reports (Sr Mod+ access)
 * - Management: Staff-related issues (Supervisor+ access)
 */

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { 
    isStaff, 
    canAccessManagementTickets,
    getGeneralTicketRoles,
    getManagementTicketRoles,
    isSupervisor
} = require('../utils/permissions');
const { createErrorEmbed, createSuccessEmbed, getEmbedColor } = require('../utils/embeds');
const Application = require('../database/models/Application');
const { randomUUID } = require('crypto');
const { getNextCaseNumber } = require('../database/caseCounter');

/**
 * Upload transcript to paste.rs
 * @param {string} content - Transcript content
 * @returns {Promise<string|null>} URL or null on failure
 */
async function uploadTranscript(content) {
    try {
        const response = await fetch('https://paste.rs/', {
            method: 'POST',
            body: content,
            headers: {
                'Content-Type': 'text/plain'
            }
        });

        if (response.ok) {
            const url = await response.text();
            return url.trim();
        }
    } catch (error) {
        console.error('[Tickets] Failed to upload transcript:', error.message);
    }
    return null;
}

/**
 * Generate ticket transcript
 * @param {TextChannel} channel - Ticket channel
 * @returns {Promise<string>} Transcript content
 */
async function generateTranscript(channel) {
    const messages = [];
    let lastId;

    // Fetch all messages
    while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const fetched = await channel.messages.fetch(options);
        if (fetched.size === 0) break;

        messages.push(...fetched.values());
        lastId = fetched.last().id;
    }

    // Reverse to get chronological order
    messages.reverse();

    // Format transcript
    const lines = [
        '===============================================================',
        '                       TICKET TRANSCRIPT',
        '===============================================================',
        `Ticket: ${channel.name}`,
        `Created: ${channel.createdAt.toUTCString()}`,
        `Closed: ${new Date().toUTCString()}`,
        `Total Messages: ${messages.length}`,
        '===============================================================',
        ''
    ];

    for (const msg of messages) {
        const time = msg.createdAt.toUTCString();
        const author = `${msg.author.tag} (${msg.author.id})`;
        
        lines.push(`[${time}] ${author}`);
        
        if (msg.content) {
            lines.push(msg.content);
        }
        
        if (msg.attachments.size > 0) {
            for (const attachment of msg.attachments.values()) {
                lines.push(`[Attachment: ${attachment.url}]`);
            }
        }
        
        if (msg.embeds.length > 0) {
            lines.push('[Embed content]');
        }
        
        lines.push('');
    }

    lines.push('===============================================================');
    lines.push('                       END OF TRANSCRIPT');
    lines.push('===============================================================');

    return lines.join('\n');
}

/**
 * Create the support panel embed with buttons
 * @returns {Object} { embed, components }
 */
function createSupportPanelEmbed() {
    const embed = new EmbedBuilder()
        .setColor(getEmbedColor())
        .setTitle('Support Center')
        .setDescription('Need assistance? Select a category below to open a ticket.\n\nOur staff team will respond as soon as possible.')
        .addFields(
            {
                name: 'General Support',
                value: 'Questions, concerns, or general inquiries',
                inline: true
            },
            {
                name: 'Player Report',
                value: 'Report a player for rule violations',
                inline: true
            },
            {
                name: 'Management',
                value: 'Staff-related matters',
                inline: true
            }
        )
        .setFooter({ text: 'NewLife SMP | Support System' })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_general')
                .setLabel('General')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('ticket_report')
                .setLabel('Report')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('ticket_management')
                .setLabel('Management')
                .setStyle(ButtonStyle.Secondary)
        );

    return { embed, components: [row] };
}

/**
 * Create apply panel embed (whitelist)
 */
function createApplyPanelEmbed() {
    const embed = new EmbedBuilder()
        .setColor(getEmbedColor())
        .setTitle('Welcome to NewLife SMP')
        .setDescription('If you’d like to join our world, you’ll need to complete a quick whitelist application.\nClick the button below to begin the process.\n\nWe’re excited to see what you’ll bring to the server.')
        .setFooter({ text: 'NewLife SMP | Whitelist Application' })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('apply_panel_apply')
                .setLabel('Apply')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('apply_panel_reapply')
                .setLabel('Reapply')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
        );

    return { embed, components: [row] };
}

/**
 * Create a ticket channel directly (no modal)
 * @param {Interaction} interaction - Discord interaction
 * @param {string} type - Ticket type (general, report, management)
 */
async function createTicket(interaction, type) {
    const guild = interaction.guild;
    const user = interaction.user;
    const categoryId = process.env.TICKET_CATEGORY_ID;

    if (!categoryId) {
        return interaction.reply({
            embeds: [createErrorEmbed('Configuration Error', 'Ticket category is not configured.')],
            ephemeral: true
        });
    }

    // Check for existing ticket
    const existingTicket = guild.channels.cache.find(
        c => c.name === `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${type}`
    );

    if (existingTicket) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ticket Exists', `You already have an open ${type} ticket: ${existingTicket}`)],
            ephemeral: true
        });
    }

    // Get appropriate roles for this ticket type
    const staffRoles = type === 'management' 
        ? getManagementTicketRoles() 
        : getGeneralTicketRoles();

    // Build permission overwrites
    const permissionOverwrites = [
        {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ReadMessageHistory
            ]
        },
        {
            id: interaction.client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        }
    ];

    // Add staff role permissions
    for (const roleId of staffRoles) {
        if (roleId) {
            permissionOverwrites.push({
                id: roleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages
                ]
            });
        }
    }

    // Defer reply while creating ticket
    await interaction.deferReply({ ephemeral: true });

    try {
        // Create the channel
        const ticketChannel = await guild.channels.create({
            name: `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${type}`,
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites: permissionOverwrites
        });

        // Build the combined ticket embed based on type
        let ticketEmbed;

        if (type === 'general') {
            ticketEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('General Support Ticket')
                .setDescription(`Welcome ${user}\n\nThank you for reaching out. A staff member will assist you shortly.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
                .addFields(
                    { name: 'Ticket Type', value: 'General Support', inline: true },
                    { name: 'Created By', value: user.tag, inline: true },
                    { name: 'Status', value: 'Open', inline: true },
                    { name: '\u200B', value: '**Please Provide the Following Information:**', inline: false },
                    { name: 'What is your question or concern?', value: 'Please provide as much detail as possible.', inline: false },
                    { name: 'Is this urgent?', value: 'Let us know if this requires immediate attention.', inline: false }
                )
                .setFooter({ text: `Ticket ID: ${ticketChannel.id} | A staff member will respond shortly.` })
                .setTimestamp();

        } else if (type === 'report') {
            ticketEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('Player Report Ticket')
                .setDescription(`Welcome ${user}\n\nThank you for your report. Our moderation team will review this promptly.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
                .addFields(
                    { name: 'Ticket Type', value: 'Player Report', inline: true },
                    { name: 'Created By', value: user.tag, inline: true },
                    { name: 'Status', value: 'Under Review', inline: true },
                    { name: '\u200B', value: '**Please Provide the Following Information:**', inline: false },
                    { name: '1. Player Username', value: 'Who are you reporting?', inline: false },
                    { name: '2. Rule Violation', value: 'What rule(s) did they break?', inline: false },
                    { name: '3. When Did This Occur?', value: 'Date and approximate time.', inline: false },
                    { name: '4. Evidence', value: 'Please provide screenshots, videos, or other proof.', inline: false }
                )
                .setFooter({ text: `Ticket ID: ${ticketChannel.id} | Your report will be reviewed by our moderation team.` })
                .setTimestamp();

        } else if (type === 'management') {
            ticketEmbed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('Management Ticket')
                .setDescription(`Welcome ${user}\n\nThis ticket is visible only to supervisors and management.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
                .addFields(
                    { name: 'Ticket Type', value: 'Management', inline: true },
                    { name: 'Created By', value: user.tag, inline: true },
                    { name: 'Status', value: 'Confidential', inline: true },
                    { name: '\u200B', value: '**Please Provide the Following Information:**', inline: false },
                    { name: '1. Subject', value: 'What is the topic of this inquiry?', inline: false },
                    { name: '2. Details', value: 'Please explain your concern or request in full.', inline: false },
                    { name: '3. Parties Involved', value: 'Are there specific staff members involved? (if applicable)', inline: false }
                )
                .setFooter({ text: `Ticket ID: ${ticketChannel.id} | This conversation is confidential.` })
                .setTimestamp();
        }

        // Send single message with both pings and the combined embed
        await ticketChannel.send({
            content: `${user} @here - A new ${type} ticket has been created.`,
            embeds: [ticketEmbed]
        });

        // Reply to user
        await interaction.editReply({
            embeds: [createSuccessEmbed('Ticket Created', `Your ticket has been created: ${ticketChannel}`)]
        });

    } catch (error) {
        console.error('[Tickets] Error creating ticket:', error);
        await interaction.editReply({
            embeds: [createErrorEmbed('Error', 'Failed to create ticket. Please try again.')]
        });
    }
}

/**
 * Create whitelist application ticket channel and post responses
 */
async function createApplicationTicket(guild, user, application, client) {
    // Use the provided whitelist category id from the user's request
    const categoryId = '1437529831398047755';
    if (!categoryId) return null;

    const staffRoleId = process.env.STAFF_TEAM;

    const permissionOverwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] }
    ];

    if (staffRoleId) {
        permissionOverwrites.push({ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
    }

    // Create channel
    const channelName = `ticket-apply-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const ticketChannel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: categoryId, permissionOverwrites });

    // Initial embed similar to general tickets
    const initial = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('Whitelist Application')
        .setDescription(`${user} - A new whitelist application has been submitted. Staff will review shortly.`)
        .setTimestamp();

    await ticketChannel.send({ content: `${user}`, embeds: [initial] });

    // Post application responses
    const respEmbed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('Application Responses')
        .addFields(
            { name: 'Why join?', value: application.whyJoin || 'N/A', inline: false },
            { name: 'What will you bring?', value: application.bring || 'N/A', inline: false },
            { name: 'Platform & Username', value: `${application.platform} • ${application.playerName}`, inline: true }
        )
        .setFooter({ text: `Application ID: ${application._id}` })
        .setTimestamp();

    await ticketChannel.send({ embeds: [respEmbed] });
    // Welcome embed will be sent only after the applicant is approved/whitelisted by staff.
    return ticketChannel;
}

/**
 * Close a ticket
 * @param {TextChannel} channel - Ticket channel
 * @param {User} closedBy - User who closed the ticket
 * @param {string} reason - Close reason
 * @param {Client} client - Discord client
 */
async function closeTicket(channel, closedBy, reason, client) {
    try {
        // Generate transcript
        const transcript = await generateTranscript(channel);
        const transcriptUrl = await uploadTranscript(transcript);

        // Get transcript channel
        const transcriptChannelId = process.env.TRANSCRIPT_CHANNEL_ID;
        let transcriptChannel = null;
        
        if (transcriptChannelId) {
            transcriptChannel = await client.channels.fetch(transcriptChannelId).catch(() => null);
        }

        // Create close embed for transcript channel
        const closeEmbed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('Ticket Closed')
            .addFields(
                { name: 'Ticket', value: channel.name, inline: true },
                { name: 'Closed By', value: closedBy.tag, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();

        if (transcriptUrl) {
            closeEmbed.addFields({ name: 'Transcript', value: transcriptUrl, inline: false });
        }

        // Send to transcript channel
        if (transcriptChannel) {
            await transcriptChannel.send({ embeds: [closeEmbed] });
        }

        // Notify in ticket before closing
        await channel.send({
            embeds: [new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('Ticket Closing')
                .setDescription(`This ticket is being closed.\n\n**Closed By:** ${closedBy}\n**Reason:** ${reason}`)
                .setFooter({ text: 'This channel will be deleted in 5 seconds.' })
            ]
        });

        // Wait then delete
        await new Promise(resolve => setTimeout(resolve, 5000));
        await channel.delete();

    } catch (error) {
        console.error('[Tickets] Error closing ticket:', error);
    }
}

/**
 * Parse time string to milliseconds
 * @param {string} timeStr - Time string like "1h", "30m", "1d"
 * @returns {number|null}
 */
function parseTime(timeStr) {
    const match = timeStr.match(/^(\d+)([smhd])$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

/**
 * Prefix Commands
 */
const commands = {};

/**
 * Slash Commands
 */
const slashCommands = [
    // Setup panel command
    {
        data: new SlashCommandBuilder()
            .setName('panel')
            .setDescription('Send the support ticket panel'),
        async execute(interaction, client) {
            if (!isSupervisor(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'Only Supervisors and above can use this command.')],
                    ephemeral: true
                });
            }

            const { embed, components } = createSupportPanelEmbed();
            
            await interaction.channel.send({
                embeds: [embed],
                components: components
            });

            await interaction.reply({
                embeds: [createSuccessEmbed('Panel Sent', 'The support panel has been sent to this channel.')],
                ephemeral: true
            });
        }
    },
    // Whitelist apply panel
    {
        data: new SlashCommandBuilder()
            .setName('apanel')
            .setDescription('Send the whitelist application panel'),
        async execute(interaction, client) {
            if (!isSupervisor(interaction.member)) {
                return interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only Supervisors and above can use this command.')], ephemeral: true });
            }

            const { embed, components } = createApplyPanelEmbed();
            await interaction.channel.send({ embeds: [embed], components });
            return interaction.reply({ embeds: [createSuccessEmbed('Apply Panel Sent', 'Whitelist application panel sent.')], ephemeral: true });
        }
    },
    // Close ticket command
    {
        data: new SlashCommandBuilder()
            .setName('close')
            .setDescription('Close the current ticket')
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for closing the ticket')
                    .setRequired(true)
            ),
        async execute(interaction, client) {
            // Check if this is a ticket channel
            if (!interaction.channel.name.startsWith('ticket-')) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Invalid Channel', 'This command can only be used in ticket channels.')],
                    ephemeral: true
                });
            }

            // Check permissions (staff only)
            if (!isStaff(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'Only staff members can close tickets.')],
                    ephemeral: true
                });
            }

            const reason = interaction.options.getString('reason');

            await interaction.reply({
                embeds: [createSuccessEmbed('Closing Ticket', 'Generating transcript and closing ticket...')]
            });

            await closeTicket(interaction.channel, interaction.user, reason, client);
        }
    },
    // Timed close command
    {
        data: new SlashCommandBuilder()
            .setName('tclose')
            .setDescription('Close the ticket after a specified time')
            .addStringOption(option =>
                option.setName('time')
                    .setDescription('Time until close (e.g., 30s, 5m, 1h)')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for closing the ticket')
                    .setRequired(true)
            ),
        async execute(interaction, client) {
            // Check if this is a ticket channel
            if (!interaction.channel.name.startsWith('ticket-')) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Invalid Channel', 'This command can only be used in ticket channels.')],
                    ephemeral: true
                });
            }

            // Check permissions (staff only)
            if (!isStaff(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'Only staff members can close tickets.')],
                    ephemeral: true
                });
            }

            const timeStr = interaction.options.getString('time');
            const reason = interaction.options.getString('reason');
            const ms = parseTime(timeStr);

            if (!ms) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Invalid Time', 'Please use a valid time format: 30s, 5m, 1h, 1d')],
                    ephemeral: true
                });
            }

            const closeTime = new Date(Date.now() + ms);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('Scheduled Close')
                    .setDescription(`This ticket will be closed <t:${Math.floor(closeTime.getTime() / 1000)}:R>`)
                    .addFields(
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Scheduled By', value: interaction.user.tag, inline: true }
                    )
                    .setTimestamp()
                ]
            });

            // Schedule close
            setTimeout(async () => {
                // Check if channel still exists
                const channel = await client.channels.fetch(interaction.channel.id).catch(() => null);
                if (channel) {
                    await closeTicket(channel, interaction.user, reason, client);
                }
            }, ms);
        }
    }
];

/**
 * Button interaction handler
 */
async function handleButton(interaction) {
    const customId = interaction.customId;

    // Handle ticket creation buttons - direct ticket creation, no modal
    if (customId === 'ticket_general') {
        await createTicket(interaction, 'general');
    }
    else if (customId === 'ticket_report') {
        await createTicket(interaction, 'report');
    }
    else if (customId === 'ticket_management') {
        // Check if user can create management tickets
        if (!canAccessManagementTickets(interaction.member)) {
            return interaction.reply({
                embeds: [createErrorEmbed('Access Denied', 'Management tickets are only available to Supervisors and above.')],
                ephemeral: true
            });
        }
        await createTicket(interaction, 'management');
    }
    // Apply panel button handlers
    else if (customId === 'apply_panel_apply') {
        // Show modal to the user
        const modal = new ModalBuilder()
            .setCustomId('apply_modal')
            .setTitle('Whitelist Application');

        const whereInput = new TextInputBuilder().setCustomId('whereFound').setLabel('Where did you find us?').setStyle(TextInputStyle.Short).setRequired(false);
        const ageInput = new TextInputBuilder().setCustomId('age').setLabel('Age (will be kept private)').setStyle(TextInputStyle.Short).setRequired(true);
        const whyInput = new TextInputBuilder().setCustomId('whyJoin').setLabel('Why do you want to join?').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const bringInput = new TextInputBuilder().setCustomId('bring').setLabel('What will you bring to the community?').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const platformNameInput = new TextInputBuilder()
            .setCustomId('platformName')
            .setLabel('Platform & username (e.g. java:Notch)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(whereInput);
        const row2 = new ActionRowBuilder().addComponents(ageInput);
        const row3 = new ActionRowBuilder().addComponents(whyInput);
        const row4 = new ActionRowBuilder().addComponents(bringInput);
        const row5 = new ActionRowBuilder().addComponents(platformNameInput);

        modal.addComponents(row1, row2, row3, row4, row5);

        // Show modal
        try {
            await interaction.showModal(modal);
        } catch (e) {
            console.error('Failed to show apply modal:', e);
            await interaction.reply({ embeds: [createErrorEmbed('Error', 'Failed to open application form.')], ephemeral: true });
        }
    }
}

/**
 * Modal submission handler (not used - tickets open directly)
 */
async function handleModalSubmit(interaction) {
    try {
        if (interaction.customId === 'apply_modal') {
            // Extract values
            const whereFound = interaction.fields.getTextInputValue('whereFound') || null;
            const ageRaw = interaction.fields.getTextInputValue('age');
            const whyJoin = interaction.fields.getTextInputValue('whyJoin') || null;
            const bring = interaction.fields.getTextInputValue('bring') || null;
            const platformName = interaction.fields.getTextInputValue('platformName') || '';

            const age = Number.parseInt(ageRaw, 10);
            // Validate age: required and must be a positive integer
            if (!ageRaw || Number.isNaN(age) || age <= 0) {
                await interaction.reply({ embeds: [createErrorEmbed('Invalid Application', 'Please provide a valid age (a positive number).')], ephemeral: true });
                return;
            }
            // parse platformName like 'java:Notch' or 'bedrock:gtag' or 'java Notch'
            let platform = 'java';
            let playerName = platformName;
            if (platformName.includes(':')) {
                const parts = platformName.split(':');
                platform = parts[0].toLowerCase();
                playerName = parts.slice(1).join(':');
            } else if (platformName.includes(' ')) {
                const parts = platformName.split(' ');
                platform = parts[0].toLowerCase();
                playerName = parts.slice(1).join(' ');
            }

            if (!['java','bedrock'].includes(platform)) platform = 'java';

            const appId = randomUUID();
            const caseNumber = await getNextCaseNumber();
            const app = new Application({ _id: appId, discordId: interaction.user.id, playerName: playerName, platform, age, whereFound, whyJoin, bring, createdAt: new Date() });
            await app.save();

            // Create ticket channel and post responses
            const channel = await createApplicationTicket(interaction.guild, interaction.user, app, interaction.client);

            await interaction.reply({ embeds: [createSuccessEmbed('Application Submitted', `Your application has been submitted and a ticket was opened: ${channel}`)], ephemeral: true });
        }
    } catch (e) {
        console.error('Error handling apply modal submit:', e);
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ embeds: [createErrorEmbed('Error', 'Failed to process application.')], ephemeral: true });
    }
}

module.exports = {
    name: 'Tickets',
    description: 'Support ticket system',
    commands,
    slashCommands,
    handleButton,
    handleModalSubmit
};
