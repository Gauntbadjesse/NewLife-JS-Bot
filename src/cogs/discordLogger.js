/**
 * Discord Logger Cog
 * Logs server events: member leave (with roles), message edits/deletes, channel creation
 */

const { EmbedBuilder, AuditLogEvent, ChannelType, Events } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

// Discord logger channel - hardcoded as requested
const DISCORD_LOGGER_CHANNEL_ID = '1442649468586561616';

/**
 * Get the log channel
 */
async function getLogChannel(client) {
    try {
        return await client.channels.fetch(DISCORD_LOGGER_CHANNEL_ID).catch(() => null);
    } catch (e) {
        return null;
    }
}

/**
 * Format roles for display (excludes @everyone)
 */
function formatRoles(roles) {
    const filtered = roles.filter(r => r.name !== '@everyone');
    if (filtered.length === 0) return 'None';
    return filtered.map(r => `<@&${r.id}>`).join(', ');
}

/**
 * Format role names for display (excludes @everyone)
 */
function formatRoleNames(roles) {
    const filtered = roles.filter(r => r.name !== '@everyone');
    if (filtered.length === 0) return 'None';
    return filtered.map(r => r.name).join(', ');
}

/**
 * Handle member leave event
 * Logs user who left with their previous roles
 */
async function handleMemberLeave(member, client) {
    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        // Get the roles the member had before leaving
        const roles = member.roles.cache;
        const roleList = formatRoles(roles);
        const roleNameList = formatRoleNames(roles);

        // Try to determine if they were kicked or banned from audit logs
        let leaveReason = 'Left the server';
        let moderator = null;

        try {
            const fetchedLogs = await member.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MemberKick
            });
            const kickLog = fetchedLogs.entries.first();
            if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 5000) {
                leaveReason = 'Kicked';
                moderator = kickLog.executor;
            }
        } catch (e) {
            // Audit log access may fail, continue without it
        }

        if (leaveReason === 'Left the server') {
            try {
                const fetchedLogs = await member.guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.MemberBanAdd
                });
                const banLog = fetchedLogs.entries.first();
                if (banLog && banLog.target.id === member.id && (Date.now() - banLog.createdTimestamp) < 5000) {
                    leaveReason = 'Banned';
                    moderator = banLog.executor;
                }
            } catch (e) {
                // Audit log access may fail, continue without it
            }
        }

        const embed = new EmbedBuilder()
            .setColor(leaveReason === 'Banned' ? 0xFF0000 : leaveReason === 'Kicked' ? 0xFFA500 : 0x808080)
            .setTitle('👋 Member Left')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `${member.user.tag}\n<@${member.id}>`, inline: true },
                { name: 'User ID', value: member.id, inline: true },
                { name: 'Reason', value: leaveReason, inline: true },
                { name: 'Roles', value: roleList.length > 1024 ? roleNameList.substring(0, 1020) + '...' : roleList, inline: false },
                { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Joined Server', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true }
            )
            .setFooter({ text: `Member count: ${member.guild.memberCount}` })
            .setTimestamp();

        if (moderator) {
            embed.addFields({ name: 'Moderator', value: `${moderator.tag} (${moderator.id})`, inline: false });
        }

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log member leave:', e);
    }
}

/**
 * Handle message delete event
 */
async function handleMessageDelete(message, client) {
    // Ignore DMs, bot messages, and partial messages without content
    if (!message.guild || message.author?.bot) return;

    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        // Try to get who deleted the message from audit logs
        let deletedBy = null;
        try {
            const fetchedLogs = await message.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageDelete
            });
            const deleteLog = fetchedLogs.entries.first();
            if (deleteLog && deleteLog.target.id === message.author?.id && (Date.now() - deleteLog.createdTimestamp) < 5000) {
                deletedBy = deleteLog.executor;
            }
        } catch (e) {
            // Audit log access may fail
        }

        const content = message.content || '*No text content*';
        const truncatedContent = content.length > 1024 ? content.substring(0, 1020) + '...' : content;

        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('🗑️ Message Deleted')
            .addFields(
                { name: 'Author', value: message.author ? `${message.author.tag}\n<@${message.author.id}>` : 'Unknown', inline: true },
                { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                { name: 'Content', value: truncatedContent, inline: false }
            )
            .setFooter({ text: `Message ID: ${message.id}` })
            .setTimestamp();

        if (deletedBy && deletedBy.id !== message.author?.id) {
            embed.addFields({ name: 'Deleted By', value: `${deletedBy.tag} (${deletedBy.id})`, inline: false });
        }

        // Add attachment info if any
        if (message.attachments.size > 0) {
            const attachmentList = message.attachments.map(a => a.name || a.url).join('\n');
            embed.addFields({ name: 'Attachments', value: attachmentList.substring(0, 1024), inline: false });
        }

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log message delete:', e);
    }
}

/**
 * Handle message edit event
 */
async function handleMessageEdit(oldMessage, newMessage, client) {
    // Ignore DMs, bot messages, and if content hasn't changed
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        const oldContent = oldMessage.content || '*No content cached*';
        const newContent = newMessage.content || '*No content*';

        const truncatedOld = oldContent.length > 1024 ? oldContent.substring(0, 1020) + '...' : oldContent;
        const truncatedNew = newContent.length > 1024 ? newContent.substring(0, 1020) + '...' : newContent;

        const embed = new EmbedBuilder()
            .setColor(0xFFD93D)
            .setTitle('✏️ Message Edited')
            .addFields(
                { name: 'Author', value: newMessage.author ? `${newMessage.author.tag}\n<@${newMessage.author.id}>` : 'Unknown', inline: true },
                { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
                { name: 'Jump to Message', value: `[Click here](${newMessage.url})`, inline: true },
                { name: 'Before', value: truncatedOld, inline: false },
                { name: 'After', value: truncatedNew, inline: false }
            )
            .setFooter({ text: `Message ID: ${newMessage.id}` })
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log message edit:', e);
    }
}

/**
 * Handle channel create event
 */
async function handleChannelCreate(channel, client) {
    // Ignore DM channels
    if (!channel.guild) return;

    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        // Try to get who created the channel from audit logs
        let createdBy = null;
        try {
            const fetchedLogs = await channel.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelCreate
            });
            const createLog = fetchedLogs.entries.first();
            if (createLog && createLog.target.id === channel.id) {
                createdBy = createLog.executor;
            }
        } catch (e) {
            // Audit log access may fail
        }

        const channelTypes = {
            [ChannelType.GuildText]: 'Text Channel',
            [ChannelType.GuildVoice]: 'Voice Channel',
            [ChannelType.GuildCategory]: 'Category',
            [ChannelType.GuildAnnouncement]: 'Announcement Channel',
            [ChannelType.GuildStageVoice]: 'Stage Channel',
            [ChannelType.GuildForum]: 'Forum Channel',
            [ChannelType.GuildMedia]: 'Media Channel',
            [ChannelType.PublicThread]: 'Public Thread',
            [ChannelType.PrivateThread]: 'Private Thread'
        };

        const embed = new EmbedBuilder()
            .setColor(0x6BCB77)
            .setTitle('📁 Channel Created')
            .addFields(
                { name: 'Channel', value: `${channel.name}\n<#${channel.id}>`, inline: true },
                { name: 'Type', value: channelTypes[channel.type] || 'Unknown', inline: true },
                { name: 'Channel ID', value: channel.id, inline: true }
            )
            .setFooter({ text: 'NewLife Management' })
            .setTimestamp();

        if (channel.parent) {
            embed.addFields({ name: 'Category', value: channel.parent.name, inline: true });
        }

        if (createdBy) {
            embed.addFields({ name: 'Created By', value: `${createdBy.tag} (${createdBy.id})`, inline: false });
        }

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log channel create:', e);
    }
}

/**
 * Handle channel delete event
 */
async function handleChannelDelete(channel, client) {
    // Ignore DM channels
    if (!channel.guild) return;

    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        // Try to get who deleted the channel from audit logs
        let deletedBy = null;
        try {
            const fetchedLogs = await channel.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelDelete
            });
            const deleteLog = fetchedLogs.entries.first();
            if (deleteLog && deleteLog.target.id === channel.id) {
                deletedBy = deleteLog.executor;
            }
        } catch (e) {
            // Audit log access may fail
        }

        const channelTypes = {
            [ChannelType.GuildText]: 'Text Channel',
            [ChannelType.GuildVoice]: 'Voice Channel',
            [ChannelType.GuildCategory]: 'Category',
            [ChannelType.GuildAnnouncement]: 'Announcement Channel',
            [ChannelType.GuildStageVoice]: 'Stage Channel',
            [ChannelType.GuildForum]: 'Forum Channel',
            [ChannelType.GuildMedia]: 'Media Channel',
            [ChannelType.PublicThread]: 'Public Thread',
            [ChannelType.PrivateThread]: 'Private Thread'
        };

        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('📁 Channel Deleted')
            .addFields(
                { name: 'Channel', value: channel.name, inline: true },
                { name: 'Type', value: channelTypes[channel.type] || 'Unknown', inline: true },
                { name: 'Channel ID', value: channel.id, inline: true }
            )
            .setFooter({ text: 'NewLife Management' })
            .setTimestamp();

        if (channel.parent) {
            embed.addFields({ name: 'Category', value: channel.parent.name, inline: true });
        }

        if (deletedBy) {
            embed.addFields({ name: 'Deleted By', value: `${deletedBy.tag} (${deletedBy.id})`, inline: false });
        }

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log channel delete:', e);
    }
}

/**
 * Handle role create event
 */
async function handleRoleCreate(role, client) {
    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        // Try to get who created the role from audit logs
        let createdBy = null;
        try {
            const fetchedLogs = await role.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.RoleCreate
            });
            const createLog = fetchedLogs.entries.first();
            if (createLog && createLog.target.id === role.id) {
                createdBy = createLog.executor;
            }
        } catch (e) {
            // Audit log access may fail
        }

        const embed = new EmbedBuilder()
            .setColor(role.color || 0x6BCB77)
            .setTitle('🏷️ Role Created')
            .addFields(
                { name: 'Role', value: `${role.name}\n<@&${role.id}>`, inline: true },
                { name: 'Role ID', value: role.id, inline: true },
                { name: 'Color', value: role.hexColor || 'None', inline: true },
                { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
                { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true }
            )
            .setFooter({ text: 'NewLife Management' })
            .setTimestamp();

        if (createdBy) {
            embed.addFields({ name: 'Created By', value: `${createdBy.tag} (${createdBy.id})`, inline: false });
        }

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log role create:', e);
    }
}

/**
 * Handle role delete event
 */
async function handleRoleDelete(role, client) {
    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        // Try to get who deleted the role from audit logs
        let deletedBy = null;
        try {
            const fetchedLogs = await role.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.RoleDelete
            });
            const deleteLog = fetchedLogs.entries.first();
            if (deleteLog && deleteLog.target.id === role.id) {
                deletedBy = deleteLog.executor;
            }
        } catch (e) {
            // Audit log access may fail
        }

        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('🏷️ Role Deleted')
            .addFields(
                { name: 'Role', value: role.name, inline: true },
                { name: 'Role ID', value: role.id, inline: true },
                { name: 'Color', value: role.hexColor || 'None', inline: true }
            )
            .setFooter({ text: 'NewLife Management' })
            .setTimestamp();

        if (deletedBy) {
            embed.addFields({ name: 'Deleted By', value: `${deletedBy.tag} (${deletedBy.id})`, inline: false });
        }

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log role delete:', e);
    }
}

/**
 * Handle member ban event
 */
async function handleMemberBan(ban, client) {
    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        // Try to get ban details from audit logs
        let bannedBy = null;
        let reason = ban.reason || 'No reason provided';

        try {
            const fetchedLogs = await ban.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MemberBanAdd
            });
            const banLog = fetchedLogs.entries.first();
            if (banLog && banLog.target.id === ban.user.id && (Date.now() - banLog.createdTimestamp) < 5000) {
                bannedBy = banLog.executor;
                if (banLog.reason) reason = banLog.reason;
            }
        } catch (e) {
            // Audit log access may fail
        }

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🔨 Member Banned')
            .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `${ban.user.tag}\n<@${ban.user.id}>`, inline: true },
                { name: 'User ID', value: ban.user.id, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setFooter({ text: 'NewLife Management' })
            .setTimestamp();

        if (bannedBy) {
            embed.addFields({ name: 'Banned By', value: `${bannedBy.tag} (${bannedBy.id})`, inline: false });
        }

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log member ban:', e);
    }
}

/**
 * Handle member unban event
 */
async function handleMemberUnban(ban, client) {
    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        // Try to get unban details from audit logs
        let unbannedBy = null;

        try {
            const fetchedLogs = await ban.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MemberBanRemove
            });
            const unbanLog = fetchedLogs.entries.first();
            if (unbanLog && unbanLog.target.id === ban.user.id && (Date.now() - unbanLog.createdTimestamp) < 5000) {
                unbannedBy = unbanLog.executor;
            }
        } catch (e) {
            // Audit log access may fail
        }

        const embed = new EmbedBuilder()
            .setColor(0x6BCB77)
            .setTitle('🔓 Member Unbanned')
            .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `${ban.user.tag}\n<@${ban.user.id}>`, inline: true },
                { name: 'User ID', value: ban.user.id, inline: true }
            )
            .setFooter({ text: 'NewLife Management' })
            .setTimestamp();

        if (unbannedBy) {
            embed.addFields({ name: 'Unbanned By', value: `${unbannedBy.tag} (${unbannedBy.id})`, inline: false });
        }

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log member unban:', e);
    }
}

/**
 * Handle member join event (for logging purposes)
 */
async function handleMemberJoin(member, client) {
    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
        const isNewAccount = accountAge < 7;

        const embed = new EmbedBuilder()
            .setColor(isNewAccount ? 0xFFA500 : 0x6BCB77)
            .setTitle('📥 Member Joined')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'User', value: `${member.user.tag}\n<@${member.id}>`, inline: true },
                { name: 'User ID', value: member.id, inline: true },
                { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Account Age', value: `${accountAge} days${isNewAccount ? ' ⚠️' : ''}`, inline: true }
            )
            .setFooter({ text: `Member count: ${member.guild.memberCount}` })
            .setTimestamp();

        if (isNewAccount) {
            embed.addFields({ name: '⚠️ Warning', value: 'New account (less than 7 days old)', inline: false });
        }

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log member join:', e);
    }
}

/**
 * Handle bulk message delete event
 */
async function handleBulkMessageDelete(messages, channel, client) {
    if (!channel.guild) return;

    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('🗑️ Bulk Messages Deleted')
            .addFields(
                { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                { name: 'Count', value: `${messages.size} messages`, inline: true }
            )
            .setFooter({ text: 'NewLife Management' })
            .setTimestamp();

        // Create a text file with message contents if there's content
        const messageLog = messages
            .map(m => `[${m.createdAt?.toISOString() || 'Unknown'}] ${m.author?.tag || 'Unknown'}: ${m.content || '*No content*'}`)
            .reverse()
            .join('\n');

        if (messageLog.length > 0 && messageLog.length < 1900) {
            embed.addFields({ name: 'Message Log', value: `\`\`\`\n${messageLog.substring(0, 1000)}\n\`\`\``, inline: false });
        }

        await logChannel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[DiscordLogger] Failed to log bulk message delete:', e);
    }
}

/**
 * Handle voice state update (joins, leaves, moves)
 */
async function handleVoiceStateUpdate(oldState, newState, client) {
    const logChannel = await getLogChannel(client);
    if (!logChannel) return;

    try {
        const member = newState.member || oldState.member;
        if (!member) return;

        let embed;

        // User joined a voice channel
        if (!oldState.channel && newState.channel) {
            embed = new EmbedBuilder()
                .setColor(0x6BCB77)
                .setTitle('🔊 Voice Channel Joined')
                .addFields(
                    { name: 'User', value: `${member.user.tag}\n<@${member.id}>`, inline: true },
                    { name: 'Channel', value: `<#${newState.channel.id}>`, inline: true }
                )
                .setTimestamp();
        }
        // User left a voice channel
        else if (oldState.channel && !newState.channel) {
            embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('🔇 Voice Channel Left')
                .addFields(
                    { name: 'User', value: `${member.user.tag}\n<@${member.id}>`, inline: true },
                    { name: 'Channel', value: `<#${oldState.channel.id}>`, inline: true }
                )
                .setTimestamp();
        }
        // User moved between voice channels
        else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
            embed = new EmbedBuilder()
                .setColor(0xFFD93D)
                .setTitle('🔀 Voice Channel Moved')
                .addFields(
                    { name: 'User', value: `${member.user.tag}\n<@${member.id}>`, inline: true },
                    { name: 'From', value: `<#${oldState.channel.id}>`, inline: true },
                    { name: 'To', value: `<#${newState.channel.id}>`, inline: true }
                )
                .setTimestamp();
        }

        if (embed) {
            embed.setFooter({ text: 'NewLife Management' });
            await logChannel.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error('[DiscordLogger] Failed to log voice state update:', e);
    }
}

module.exports = {
    name: 'DiscordLogger',
    handleMemberLeave,
    handleMessageDelete,
    handleMessageEdit,
    handleChannelCreate,
    handleChannelDelete,
    handleRoleCreate,
    handleRoleDelete,
    handleMemberBan,
    handleMemberUnban,
    handleMemberJoin,
    handleBulkMessageDelete,
    handleVoiceStateUpdate
};
