/**
 * Audit Log Cog
 * Comprehensive logging of staff actions with commands to view logs
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const AuditLog = require('../database/models/AuditLog');
const { isAdmin, isManagement, isOwner } = require('../utils/permissions');

// Log channel ID (can be set via env or command)
let AUDIT_LOG_CHANNEL = process.env.AUDIT_LOG_CHANNEL || null;

/**
 * Log an action to the audit log
 */
async function logAction(data) {
    try {
        const entry = new AuditLog({
            action: data.action,
            category: data.category || getCategoryFromAction(data.action),
            staffId: data.staffId,
            staffName: data.staffName,
            targetType: data.targetType || 'none',
            targetId: data.targetId,
            targetName: data.targetName,
            reason: data.reason,
            details: data.details,
            caseNumber: data.caseNumber,
            relatedCases: data.relatedCases,
            guildId: data.guildId,
            channelId: data.channelId,
            createdAt: new Date()
        });

        await entry.save();
        return entry;
    } catch (error) {
        console.error('Failed to log audit action:', error);
        return null;
    }
}

/**
 * Get category from action type
 */
function getCategoryFromAction(action) {
    const categoryMap = {
        warn: 'moderation',
        unwarn: 'moderation',
        pardon_warning: 'moderation',
        ban: 'moderation',
        unban: 'moderation',
        tempban: 'moderation',
        pardon_ban: 'moderation',
        kick: 'moderation',
        mute: 'moderation',
        unmute: 'moderation',
        whitelist_add: 'whitelist',
        whitelist_remove: 'whitelist',
        appeal_approve: 'appeals',
        appeal_deny: 'appeals',
        appeal_review: 'appeals',
        application_approve: 'applications',
        application_deny: 'applications',
        ticket_close: 'tickets',
        ticket_create: 'tickets',
        note_add: 'notes',
        note_delete: 'notes',
        automod_config: 'config',
        reaction_role_config: 'config',
        embed_create: 'config',
        bulk_warn: 'bulk',
        bulk_kick: 'bulk',
        bulk_ban: 'bulk',
        bulk_unban: 'bulk',
        rcon_command: 'rcon'
    };
    return categoryMap[action] || 'other';
}

/**
 * Send audit log to Discord channel
 */
async function sendToLogChannel(client, entry) {
    if (!AUDIT_LOG_CHANNEL) return;

    try {
        const channel = await client.channels.fetch(AUDIT_LOG_CHANNEL);
        if (!channel) return;

        const emoji = getActionEmoji(entry.action);
        const color = getActionColor(entry.action);

        const embed = new EmbedBuilder()
            .setTitle(`${emoji} ${formatActionName(entry.action)}`)
            .setColor(color)
            .addFields(
                { name: 'Staff', value: `${entry.staffName} (<@${entry.staffId}>)`, inline: true }
            )
            .setTimestamp(entry.createdAt);

        if (entry.targetName) {
            embed.addFields({ name: 'Target', value: entry.targetName, inline: true });
        }

        if (entry.reason) {
            embed.addFields({ name: 'Reason', value: entry.reason.substring(0, 1000), inline: false });
        }

        if (entry.caseNumber) {
            embed.addFields({ name: 'Case', value: `#${entry.caseNumber}`, inline: true });
        }

        embed.setFooter({ text: `Category: ${entry.category} | ID: ${entry._id.toString().slice(-8)}` });

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Failed to send audit log to channel:', error);
    }
}

/**
 * Get emoji for action type
 */
function getActionEmoji(action) {
    const emojiMap = {
        warn: '⚠️',
        unwarn: '✅',
        pardon_warning: '📜',
        ban: '🔨',
        unban: '✅',
        tempban: '⏰',
        pardon_ban: '✅',
        kick: '👢',
        mute: '🔇',
        unmute: '🔊',
        whitelist_add: '📝',
        whitelist_remove: '❌',
        appeal_approve: '✅',
        appeal_deny: '❌',
        appeal_review: '🔍',
        application_approve: '✅',
        application_deny: '❌',
        ticket_close: '🎫',
        ticket_create: '🎫',
        note_add: '📝',
        note_delete: '🗑️',
        automod_config: '🛡️',
        reaction_role_config: '🎭',
        embed_create: '📋',
        bulk_warn: '⚠️',
        bulk_kick: '👢',
        bulk_ban: '🔨',
        bulk_unban: '✅',
        rcon_command: '🖥️'
    };
    return emojiMap[action] || '📋';
}

/**
 * Get color for action type
 */
function getActionColor(action) {
    if (['ban', 'tempban', 'kick', 'bulk_ban', 'bulk_kick'].includes(action)) {
        return '#ef4444';
    }
    if (['warn', 'bulk_warn', 'mute'].includes(action)) {
        return '#f59e0b';
    }
    if (['unban', 'unwarn', 'pardon_warning', 'pardon_ban', 'unmute', 'bulk_unban', 'appeal_approve', 'application_approve'].includes(action)) {
        return '#22c55e';
    }
    if (['whitelist_add', 'whitelist_remove'].includes(action)) {
        return '#3b82f6';
    }
    return '#6366f1';
}

/**
 * Format action name for display
 */
function formatActionName(action) {
    return action
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('auditlog')
            .setDescription('View and manage audit logs')
            .addSubcommand(sub => sub
                .setName('view')
                .setDescription('View recent audit logs')
                .addStringOption(opt => opt.setName('category').setDescription('Filter by category')
                    .addChoices(
                        { name: 'Moderation', value: 'moderation' },
                        { name: 'Whitelist', value: 'whitelist' },
                        { name: 'Appeals', value: 'appeals' },
                        { name: 'Applications', value: 'applications' },
                        { name: 'Tickets', value: 'tickets' },
                        { name: 'Notes', value: 'notes' },
                        { name: 'Config', value: 'config' },
                        { name: 'Bulk', value: 'bulk' },
                        { name: 'RCON', value: 'rcon' },
                        { name: 'All', value: 'all' }
                    ))
                .addUserOption(opt => opt.setName('staff').setDescription('Filter by staff member'))
                .addIntegerOption(opt => opt.setName('limit').setDescription('Number of entries (default: 10)'))
            )
            .addSubcommand(sub => sub
                .setName('search')
                .setDescription('Search audit logs')
                .addStringOption(opt => opt.setName('query').setDescription('Search query').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('staff')
                .setDescription('View actions by a specific staff member')
                .addUserOption(opt => opt.setName('member').setDescription('Staff member').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('player')
                .setDescription('View all actions related to a player')
                .addStringOption(opt => opt.setName('name').setDescription('Player name').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('stats')
                .setDescription('View audit log statistics')
            )
            .addSubcommand(sub => sub
                .setName('setchannel')
                .setDescription('Set the audit log channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('Log channel').setRequired(true))
            ),

        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();

            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Permission denied.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            if (sub === 'view') {
                const category = interaction.options.getString('category') || 'all';
                const staffUser = interaction.options.getUser('staff');
                const limit = Math.min(interaction.options.getInteger('limit') || 10, 25);

                const query = { guildId: interaction.guild.id };
                if (category !== 'all') query.category = category;
                if (staffUser) query.staffId = staffUser.id;

                const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit);

                if (logs.length === 0) {
                    return interaction.editReply({ content: '📋 No audit logs found.' });
                }

                const embed = new EmbedBuilder()
                    .setTitle('📋 Audit Logs')
                    .setColor('#3b82f6')
                    .setDescription(`Showing ${logs.length} recent entries`)
                    .setTimestamp();

                for (const log of logs) {
                    const emoji = getActionEmoji(log.action);
                    const time = `<t:${Math.floor(new Date(log.createdAt).getTime() / 1000)}:R>`;
                    const target = log.targetName ? ` → ${log.targetName}` : '';
                    
                    embed.addFields({
                        name: `${emoji} ${formatActionName(log.action)}${target}`,
                        value: `By: ${log.staffName} | ${time}${log.caseNumber ? ` | Case #${log.caseNumber}` : ''}`,
                        inline: false
                    });
                }

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'search') {
                const query = interaction.options.getString('query');

                const logs = await AuditLog.find({
                    guildId: interaction.guild.id,
                    $or: [
                        { targetName: { $regex: query, $options: 'i' } },
                        { staffName: { $regex: query, $options: 'i' } },
                        { reason: { $regex: query, $options: 'i' } }
                    ]
                }).sort({ createdAt: -1 }).limit(15);

                if (logs.length === 0) {
                    return interaction.editReply({ content: `📋 No logs found matching "${query}".` });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`🔍 Search: "${query}"`)
                    .setColor('#f59e0b')
                    .setDescription(`Found ${logs.length} matching entries`)
                    .setTimestamp();

                for (const log of logs.slice(0, 10)) {
                    const emoji = getActionEmoji(log.action);
                    const time = `<t:${Math.floor(new Date(log.createdAt).getTime() / 1000)}:R>`;
                    
                    embed.addFields({
                        name: `${emoji} ${formatActionName(log.action)}`,
                        value: `By: ${log.staffName} | Target: ${log.targetName || 'N/A'} | ${time}`,
                        inline: false
                    });
                }

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'staff') {
                const member = interaction.options.getUser('member');

                const logs = await AuditLog.find({
                    guildId: interaction.guild.id,
                    staffId: member.id
                }).sort({ createdAt: -1 }).limit(20);

                // Get stats
                const stats = await AuditLog.aggregate([
                    { $match: { guildId: interaction.guild.id, staffId: member.id } },
                    { $group: { _id: '$action', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]);

                const embed = new EmbedBuilder()
                    .setTitle(`👤 Staff Activity: ${member.tag}`)
                    .setColor('#6366f1')
                    .setThumbnail(member.displayAvatarURL())
                    .setTimestamp();

                if (stats.length > 0) {
                    const statsList = stats.slice(0, 10).map(s => 
                        `${getActionEmoji(s._id)} ${formatActionName(s._id)}: ${s.count}`
                    ).join('\n');
                    embed.addFields({ name: '📊 Action Summary', value: statsList, inline: false });
                }

                if (logs.length > 0) {
                    const recentList = logs.slice(0, 5).map(log => {
                        const time = `<t:${Math.floor(new Date(log.createdAt).getTime() / 1000)}:R>`;
                        return `${getActionEmoji(log.action)} ${formatActionName(log.action)} - ${time}`;
                    }).join('\n');
                    embed.addFields({ name: '📜 Recent Actions', value: recentList, inline: false });
                }

                const totalActions = await AuditLog.countDocuments({
                    guildId: interaction.guild.id,
                    staffId: member.id
                });
                embed.setFooter({ text: `Total logged actions: ${totalActions}` });

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'player') {
                const playerName = interaction.options.getString('name');

                const logs = await AuditLog.find({
                    guildId: interaction.guild.id,
                    targetName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                }).sort({ createdAt: -1 }).limit(20);

                if (logs.length === 0) {
                    return interaction.editReply({ content: `📋 No actions found for player "${playerName}".` });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`🎮 Player History: ${playerName}`)
                    .setColor('#22c55e')
                    .setTimestamp();

                for (const log of logs.slice(0, 15)) {
                    const time = `<t:${Math.floor(new Date(log.createdAt).getTime() / 1000)}:R>`;
                    embed.addFields({
                        name: `${getActionEmoji(log.action)} ${formatActionName(log.action)}`,
                        value: `By: ${log.staffName} | ${time}${log.reason ? `\nReason: ${log.reason.substring(0, 100)}` : ''}`,
                        inline: false
                    });
                }

                embed.setFooter({ text: `Total actions: ${logs.length}` });

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'stats') {
                const totalLogs = await AuditLog.countDocuments({ guildId: interaction.guild.id });
                
                const byCategory = await AuditLog.aggregate([
                    { $match: { guildId: interaction.guild.id } },
                    { $group: { _id: '$category', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]);

                const topStaff = await AuditLog.aggregate([
                    { $match: { guildId: interaction.guild.id } },
                    { $group: { _id: { id: '$staffId', name: '$staffName' }, count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 5 }
                ]);

                const last24h = await AuditLog.countDocuments({
                    guildId: interaction.guild.id,
                    createdAt: { $gte: new Date(Date.now() - 86400000) }
                });

                const embed = new EmbedBuilder()
                    .setTitle('📊 Audit Log Statistics')
                    .setColor('#8b5cf6')
                    .addFields(
                        { name: '📈 Total Logged Actions', value: totalLogs.toString(), inline: true },
                        { name: '⏰ Last 24 Hours', value: last24h.toString(), inline: true }
                    )
                    .setTimestamp();

                if (byCategory.length > 0) {
                    const categoryList = byCategory.map(c => `**${c._id}:** ${c.count}`).join('\n');
                    embed.addFields({ name: '📁 By Category', value: categoryList, inline: false });
                }

                if (topStaff.length > 0) {
                    const staffList = topStaff.map((s, i) => {
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                        return `${medal} ${s._id.name}: ${s.count}`;
                    }).join('\n');
                    embed.addFields({ name: '👥 Most Active Staff', value: staffList, inline: false });
                }

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'setchannel') {
                if (!isOwner(interaction.member)) {
                    return interaction.editReply({ content: '❌ Only the owner can set the audit log channel.' });
                }

                const channel = interaction.options.getChannel('channel');
                AUDIT_LOG_CHANNEL = channel.id;

                return interaction.editReply({
                    content: `✅ Audit log channel set to <#${channel.id}>.\n\n**Note:** Add \`AUDIT_LOG_CHANNEL=${channel.id}\` to your .env to persist this setting.`
                });
            }
        }
    }
];

module.exports = {
    name: 'AuditLog',
    slashCommands,
    logAction,
    sendToLogChannel,
    getActionEmoji,
    formatActionName,
    getCategoryFromAction,
    setLogChannel: (id) => { AUDIT_LOG_CHANNEL = id; }
};
