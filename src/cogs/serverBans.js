/**
 * Server Bans Cog
 * Comprehensive ban system with Discord-Minecraft linking
 * Integrates with Velocity proxy for enforcement
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ServerBan = require('../database/models/ServerBan');
const LinkedAccount = require('../database/models/LinkedAccount');
const Kick = require('../database/models/Kick');
const Warning = require('../database/models/Warning');
const Mute = require('../database/models/Mute');
const { getNextCaseNumber } = require('../database/caseCounter');
const { isStaff, isAdmin, isModerator } = require('../utils/permissions');
const { banPlayer, unbanPlayer, kickFromProxy, mutePlayer, unmutePlayer } = require('../utils/rcon');
const { lookupMcProfile } = require('../utils/minecraft');
const { parseDurationFull } = require('../utils/duration');
const { getEmbedColor } = require('../utils/embeds');

// Environment config
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || process.env.BAN_LOG_CHANNEL_ID;

/**
 * Normalize UUID - remove dashes and lowercase
 */
function normalizeUuid(uuid) {
    return uuid.replace(/-/g, '').toLowerCase();
}

function getMentionedDiscordId(target) {
    const mentionMatch = target.match(/<@!?(\d+)>/);
    return mentionMatch ? mentionMatch[1] : null;
}

async function resolvePrimaryLinkedProfile(linkedAccounts, client) {
    if (!linkedAccounts || linkedAccounts.length === 0) {
        return null;
    }

    const primaryAccount = linkedAccounts.find(acc => acc.primary) || linkedAccounts[0];
    const freshProfile = await lookupMcProfile(primaryAccount.minecraftUsername, primaryAccount.platform);

    if (freshProfile) {
        return {
            uuid: normalizeUuid(freshProfile.uuid),
            name: freshProfile.name,
            platform: freshProfile.platform
        };
    }

    return {
        uuid: normalizeUuid(primaryAccount.uuid),
        name: primaryAccount.minecraftUsername,
        platform: primaryAccount.platform
    };
}

async function resolveMinecraftTarget(target, platformOption, client) {
    const discordId = getMentionedDiscordId(target);
    let discordUser = null;
    let linkedAccounts = [];
    let primaryProfile = null;

    if (discordId) {
        try {
            discordUser = await client.users.fetch(discordId);
        } catch (e) {
            return { error: 'Could not find that Discord user.' };
        }

        linkedAccounts = await getAllLinkedAccounts(discordId);
        if (linkedAccounts.length === 0) {
            return { error: 'This Discord user has no linked Minecraft accounts.' };
        }

        primaryProfile = await resolvePrimaryLinkedProfile(linkedAccounts, client);
        if (!primaryProfile) {
            return { error: 'Could not resolve the linked Minecraft account for that user.' };
        }
    } else {
        primaryProfile = await lookupMcProfile(target, platformOption);

        if (!primaryProfile && platformOption === 'java') {
            primaryProfile = await lookupMcProfile(target, 'bedrock');
        }

        if (!primaryProfile) {
            return {
                error: `Could not find Minecraft account: **${target}**\n\nTry specifying the platform with the \`platform\` option.`
            };
        }

        primaryProfile.uuid = normalizeUuid(primaryProfile.uuid);
        linkedAccounts = await getAllLinkedAccounts(null, primaryProfile.uuid);

        if (linkedAccounts.length > 0) {
            const linkedDiscordId = linkedAccounts[0].discordId;
            try {
                discordUser = await client.users.fetch(linkedDiscordId);
            } catch (e) {
                discordUser = null;
            }
        }
    }

    return {
        discordId: discordId || linkedAccounts[0]?.discordId || null,
        discordUser,
        linkedAccounts,
        primaryProfile
    };
}

async function applyMinecraftBan(targets, reason) {
    const results = [];
    for (const target of targets) {
        const result = await banPlayer(target.name, reason);
        results.push({ target, result });
    }
    return results;
}

async function applyMinecraftUnban(targets) {
    const results = [];
    for (const target of targets) {
        const result = await unbanPlayer(target.name);
        results.push({ target, result });
    }
    return results;
}

async function applyMinecraftMute(targets, durationMs) {
    const results = [];
    for (const target of targets) {
        const result = await mutePlayer(target.name, durationMs);
        results.push({ target, result });
    }
    return results;
}

async function applyMinecraftUnmute(targets) {
    const results = [];
    for (const target of targets) {
        const result = await unmutePlayer(target.name);
        results.push({ target, result });
    }
    return results;
}

function dedupeTargets(primaryProfile, linkedAccounts) {
    const targets = [];
    const seen = new Set();

    for (const account of [
        { uuid: primaryProfile.uuid, name: primaryProfile.name, platform: primaryProfile.platform },
        ...linkedAccounts.map(acc => ({
            uuid: normalizeUuid(acc.uuid),
            name: acc.minecraftUsername,
            platform: acc.platform || primaryProfile.platform
        }))
    ]) {
        const key = account.uuid || account.name.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            targets.push(account);
        }
    }

    return targets;
}


/**
 * Get all linked accounts for a discord user or minecraft account
 */
async function getAllLinkedAccounts(discordId = null, uuid = null, mcUsername = null) {
    let query = {};
    
    if (discordId) {
        query = { discordId: String(discordId) };
    } else if (uuid) {
        // First find the discord ID from this UUID, then get all accounts
        const account = await LinkedAccount.findOne({ uuid: uuid.replace(/-/g, '') });
        if (account) {
            query = { discordId: account.discordId };
        } else {
            return [];
        }
    } else if (mcUsername) {
        const account = await LinkedAccount.findOne({ 
            minecraftUsername: { $regex: new RegExp(`^${mcUsername}$`, 'i') }
        });
        if (account) {
            query = { discordId: account.discordId };
        } else {
            return [];
        }
    }
    
    return LinkedAccount.find(query);
}

/**
 * Log ban to channel
 */
async function logBan(client, ban, linkedAccounts) {
    if (!LOG_CHANNEL_ID) return;
    
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (!channel) return;
        
        const accountsList = linkedAccounts.map(acc => {
            const platform = acc.platform === 'bedrock' ? 'Bedrock' : 'Java';
            return `${acc.minecraftUsername} (${platform})`;
        }).join('\n') || 'None linked';
        
        const embed = new EmbedBuilder()
            .setTitle(`Player Banned`)
            .setColor(0xff4444)
            .addFields(
                { name: 'Player', value: `**${ban.primaryUsername}**\n\`${ban.primaryUuid}\``, inline: true },
                { name: 'Platform', value: ban.primaryPlatform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                { name: 'Banned By', value: `<@${ban.staffId}>`, inline: true },
                { name: 'Reason', value: ban.reason, inline: false },
                { name: 'Duration', value: ban.isPermanent ? '**Permanent**' : ban.duration, inline: true }
            )
            .setFooter({ text: `Case #${ban.caseNumber || 'N/A'}` })
            .setTimestamp();
        
        if (ban.discordId) {
            embed.addFields({ name: 'Discord', value: `<@${ban.discordId}>`, inline: true });
        }
        
        if (!ban.isPermanent && ban.expiresAt) {
            embed.addFields({ name: 'Expires', value: `<t:${Math.floor(ban.expiresAt.getTime() / 1000)}:R>`, inline: true });
        }
        
        if (linkedAccounts.length > 1) {
            embed.addFields({ 
                name: `All Banned Accounts (${linkedAccounts.length})`, 
                value: accountsList, 
                inline: false 
            });
        }
        
        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Failed to log ban:', e);
    }
}

/**
 * Log unban to channel
 */
async function logUnban(client, ban, staffMember) {
    if (!LOG_CHANNEL_ID) return;
    
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setTitle(`Player Unbanned`)
            .setColor(0x57F287)
            .addFields(
                { name: 'Player', value: `**${ban.primaryUsername}**`, inline: true },
                { name: 'Unbanned By', value: `<@${staffMember.id}>`, inline: true },
                { name: 'Original Reason', value: ban.reason, inline: false }
            )
            .setFooter({ text: `Case #${ban.caseNumber || 'N/A'}` })
            .setTimestamp();
        
        if (ban.unbanReason) {
            embed.addFields({ name: 'Unban Reason', value: ban.unbanReason, inline: false });
        }
        
        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Failed to log unban:', e);
    }
}

/**
 * Log kick to channel
 */
async function logKick(client, kick, linkedAccounts) {
    if (!LOG_CHANNEL_ID) return;
    
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setTitle(`Player Kicked`)
            .setColor(0xFFA500)
            .addFields(
                { name: 'Player', value: `**${kick.primaryUsername}**\n\`${kick.primaryUuid}\``, inline: true },
                { name: 'Platform', value: kick.primaryPlatform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                { name: 'Kicked By', value: `<@${kick.staffId}>`, inline: true },
                { name: 'Reason', value: kick.reason, inline: false }
            )
            .setFooter({ text: `Case #${kick.caseNumber || 'N/A'}` })
            .setTimestamp();
        
        if (kick.discordId) {
            embed.addFields({ name: 'Discord', value: `<@${kick.discordId}>`, inline: true });
        }
        
        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Failed to log kick:', e);
    }
}

/**
 * Log warning to channel
 */
async function logWarning(client, warning, linkedAccounts = []) {
    if (!LOG_CHANNEL_ID) return;
    
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (!channel) return;
        
        const severityColors = {
            minor: 0xFFFF00,
            moderate: 0xFFA500,
            severe: 0xFF4444
        };
        
        const targetLabel = warning.discordId
            ? `<@${warning.discordId}>${warning.discordTag ? ` (${warning.discordTag})` : ''}`
            : warning.playerName || 'Unknown';

        const embed = new EmbedBuilder()
            .setTitle(`Player Warned`)
            .setColor(severityColors[warning.severity] || 0xFFA500)
            .addFields(
                { name: 'Target', value: targetLabel, inline: true },
                { name: 'Warned By', value: `<@${warning.staffId}>`, inline: true },
                { name: 'Severity', value: warning.severity.charAt(0).toUpperCase() + warning.severity.slice(1), inline: true },
                { name: 'Category', value: warning.category.charAt(0).toUpperCase() + warning.category.slice(1), inline: true },
                { name: 'Reason', value: warning.reason, inline: false }
            )
            .setFooter({ text: `Case #${warning.caseNumber || 'N/A'}` })
            .setTimestamp();
        
        if (warning.playerName) {
            embed.addFields({ name: 'Minecraft', value: `**${warning.playerName}** (${warning.platform || 'java'})`, inline: true });
        }
        
        if (linkedAccounts.length > 1) {
            const accountsList = linkedAccounts.map(a => `• ${a.minecraftUsername} (${a.platform})`).join('\n');
            embed.addFields({ 
                name: `Linked Accounts (${linkedAccounts.length})`, 
                value: accountsList, 
                inline: false 
            });
        }
        
        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Failed to log warning:', e);
    }
}

async function logMute(client, mute, linkedAccounts = []) {
    if (!LOG_CHANNEL_ID) return;

    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const targetLabel = mute.discordId
            ? `<@${mute.discordId}>${mute.discordTag ? ` (${mute.discordTag})` : ''}`
            : mute.playerName || 'Unknown';

        const embed = new EmbedBuilder()
            .setTitle('Player Muted')
            .setColor(0xFF4444)
            .addFields(
                { name: 'Target', value: targetLabel, inline: true },
                { name: 'Muted By', value: `<@${mute.staffId}>`, inline: true },
                { name: 'Duration', value: mute.duration || 'Permanent', inline: true },
                { name: 'Reason', value: mute.reason, inline: false }
            )
            .setFooter({ text: `Case #${mute.caseNumber || 'N/A'}` })
            .setTimestamp();

        if (mute.playerName) {
            embed.addFields({ name: 'Minecraft', value: `**${mute.playerName}** (${mute.platform || 'java'})`, inline: true });
        }

        if (mute.expiresAt) {
            embed.addFields({ name: 'Expires', value: `<t:${Math.floor(new Date(mute.expiresAt).getTime() / 1000)}:R>`, inline: true });
        }

        if (linkedAccounts.length > 1) {
            embed.addFields({
                name: `Linked Accounts (${linkedAccounts.length})`,
                value: linkedAccounts.map(a => `• ${a.minecraftUsername} (${a.platform})`).join('\n'),
                inline: false
            });
        }

        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Failed to log mute:', e);
    }
}

async function logUnmute(client, mute, staffMember, reason, linkedAccounts = []) {
    if (!LOG_CHANNEL_ID) return;

    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const targetLabel = mute.discordId
            ? `<@${mute.discordId}>${mute.discordTag ? ` (${mute.discordTag})` : ''}`
            : mute.playerName || 'Unknown';

        const embed = new EmbedBuilder()
            .setTitle('Player Unmuted')
            .setColor(0x57F287)
            .addFields(
                { name: 'Target', value: targetLabel, inline: true },
                { name: 'Unmuted By', value: `<@${staffMember.id}>`, inline: true },
                { name: 'Reason', value: reason || 'No reason provided', inline: false }
            )
            .setFooter({ text: `Case #${mute.caseNumber || 'N/A'}` })
            .setTimestamp();

        if (mute.playerName) {
            embed.addFields({ name: 'Minecraft', value: `**${mute.playerName}** (${mute.platform || 'java'})`, inline: true });
        }

        if (linkedAccounts.length > 1) {
            embed.addFields({
                name: `Linked Accounts (${linkedAccounts.length})`,
                value: linkedAccounts.map(a => `• ${a.minecraftUsername} (${a.platform})`).join('\n'),
                inline: false
            });
        }

        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Failed to log unmute:', e);
    }
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Ban a linked Minecraft player from the server')
            .addStringOption(opt => opt
                .setName('target')
                .setDescription('Minecraft username or @Discord user linked to Minecraft')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('duration')
                .setDescription('Duration (e.g., 1d, 7d, 30d, 1h) or "perm" for permanent')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('platform')
                .setDescription('Platform (if resolving by username)')
                .setRequired(false)
                .addChoices(
                    { name: 'Java', value: 'java' },
                    { name: 'Bedrock', value: 'bedrock' }
                )
            ),

        async execute(interaction, client) {
            // Permission check - Staff only
            if (!isStaff(interaction.member)) {
                return interaction.reply({ 
                    content: 'You do not have permission to use this command.', 
                    flags: 64
                });
            }

            await interaction.deferReply();

            const target = interaction.options.getString('target');
            const reason = interaction.options.getString('reason');
            const durationInput = interaction.options.getString('duration');
            const platformOption = interaction.options.getString('platform') || 'java';

            // Parse duration
            const durationData = parseDurationFull(durationInput);
            if (!durationData) {
                return interaction.editReply({
                    content: 'Invalid duration format. Use formats like `1m`, `1h`, `1d`, `1w`, `1mo`, or `perm` for permanent.'
                });
            }

            const resolvedTarget = await resolveMinecraftTarget(target, platformOption, client);
            if (resolvedTarget.error) {
                return interaction.editReply({ content: resolvedTarget.error });
            }

            const { primaryProfile, discordId, discordUser, linkedAccounts } = resolvedTarget;

            // Check if already banned
            const existingBan = await ServerBan.findActiveBan(primaryProfile.uuid);
            if (existingBan) {
                return interaction.editReply({
                    content: `**${primaryProfile.name}** is already banned.\n**Reason:** ${existingBan.reason}\n**Expires:** ${existingBan.isPermanent ? 'Never (Permanent)' : `<t:${Math.floor(existingBan.expiresAt.getTime() / 1000)}:R>`}`
                });
            }

            // Collect all UUIDs to ban (normalized)
            const bannedUuids = dedupeTargets(primaryProfile, linkedAccounts).map(target => target.uuid);

            // Get case number
            let caseNumber;
            try {
                caseNumber = await getNextCaseNumber('serverban');
            } catch (e) {
                caseNumber = null;
            }

            // Create the ban
            const ban = new ServerBan({
                caseNumber,
                primaryUuid: primaryProfile.uuid,
                primaryUsername: primaryProfile.name,
                primaryPlatform: primaryProfile.platform,
                bannedUuids,
                discordId: discordId || null,
                discordTag: discordUser?.tag || null,
                reason,
                duration: durationData.display,
                isPermanent: durationData.isPermanent,
                expiresAt: durationData.expiresAt,
                staffId: interaction.user.id,
                staffTag: interaction.user.tag,
                active: true
            });

            await ban.save();

            const banTargets = dedupeTargets(primaryProfile, linkedAccounts);
            const banResults = await applyMinecraftBan(banTargets, reason);

            // Log to channel
            await logBan(client, ban, linkedAccounts);

            // Build response embed
            const embed = new EmbedBuilder()
                .setTitle('Player Banned')
                .setColor(0xff4444)
                .addFields(
                    { name: 'Player', value: `**${primaryProfile.name}**`, inline: true },
                    { name: 'Platform', value: primaryProfile.platform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                    { name: 'Duration', value: durationData.isPermanent ? '**Permanent**' : durationData.display, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Minecraft Enforcement', value: banResults.map(entry => `**${entry.target.name}**: ${entry.result.success ? 'Applied' : 'Failed'}${entry.result.success ? '' : ` (${entry.result.response})`}`).join('\n').substring(0, 1024), inline: false }
                )
                .setFooter({ text: `Case #${caseNumber || 'N/A'} | Banned by ${interaction.user.tag}` })
                .setTimestamp();

            if (linkedAccounts.length > 1) {
                embed.addFields({ 
                    name: `Linked Accounts Banned (${bannedUuids.length})`, 
                    value: linkedAccounts.map(a => `• ${a.minecraftUsername} (${a.platform})`).join('\n'), 
                    inline: false 
                });
            }

            if (!durationData.isPermanent) {
                embed.addFields({ 
                    name: 'Expires', 
                    value: `<t:${Math.floor(durationData.expiresAt.getTime() / 1000)}:F>`, 
                    inline: false 
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('softban')
            .setDescription('Softban a linked Minecraft player by banning and immediately unbanning them')
            .addStringOption(opt => opt
                .setName('target')
                .setDescription('Minecraft username or @Discord user linked to Minecraft')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for the softban')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('platform')
                .setDescription('Platform (if resolving by username)')
                .setRequired(false)
                .addChoices(
                    { name: 'Java', value: 'java' },
                    { name: 'Bedrock', value: 'bedrock' }
                )
            ),

        async execute(interaction, client) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({
                    content: 'You do not have permission to use this command.',
                    flags: 64
                });
            }

            await interaction.deferReply();

            const target = interaction.options.getString('target');
            const reason = interaction.options.getString('reason');
            const platformOption = interaction.options.getString('platform') || 'java';

            const resolvedTarget = await resolveMinecraftTarget(target, platformOption, client);
            if (resolvedTarget.error) {
                return interaction.editReply({ content: resolvedTarget.error });
            }

            const { primaryProfile, discordId, discordUser, linkedAccounts } = resolvedTarget;

            const caseNumber = await getNextCaseNumber('ban').catch(() => Date.now());
            const { randomUUID } = require('crypto');
            const softban = new ServerBan({
                _id: randomUUID(),
                caseNumber,
                primaryUuid: primaryProfile?.uuid || discordId,
                primaryUsername: primaryProfile?.name || discordUser?.tag || target,
                primaryPlatform: primaryProfile?.platform || 'java',
                bannedUuids: [
                    normalizeUuid(primaryProfile?.uuid || discordId),
                    ...linkedAccounts.map(account => normalizeUuid(account.uuid))
                ].filter((uuid, index, list) => uuid && list.indexOf(uuid) === index),
                discordId,
                discordTag: discordUser?.tag || null,
                reason,
                duration: 'softban',
                isPermanent: false,
                expiresAt: new Date(),
                staffId: interaction.user.id,
                staffTag: interaction.user.tag,
                active: false,
                bannedAt: new Date(),
                unbannedAt: new Date(),
                unbannedBy: interaction.user.id,
                unbannedByTag: interaction.user.tag,
                unbanReason: `Softban: ${reason}`
            });

            try {
                const banTargets = dedupeTargets(primaryProfile, linkedAccounts);
                await applyMinecraftBan(banTargets, `Softban: ${reason}`);
                await applyMinecraftUnban(banTargets);
            } catch (error) {
                console.error('Error executing softban:', error);
                return interaction.editReply({ content: `Failed to softban the user: ${error.message}` });
            }

            await softban.save();

            await logSoftban(client, softban, linkedAccounts);

            const embed = new EmbedBuilder()
                .setTitle('Player Softbanned')
                .setColor(0xff4444)
                .addFields(
                    { name: 'Player', value: `**${softban.primaryUsername}**`, inline: true },
                    { name: 'Platform', value: softban.primaryPlatform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setFooter({ text: `Case #${caseNumber || 'N/A'} | Softbanned by ${interaction.user.tag}` })
                .setTimestamp();

            if (linkedAccounts.length > 1) {
                embed.addFields({
                    name: `Linked Accounts`,
                    value: linkedAccounts.map(a => `• ${a.minecraftUsername} (${a.platform})`).join('\n'),
                    inline: false
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('unban')
            .setDescription('Unban a linked Minecraft player from the server')
            .addStringOption(opt => opt
                .setName('target')
                .setDescription('Minecraft username or @Discord user linked to Minecraft')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for unbanning')
                .setRequired(false)
            )
            .addStringOption(opt => opt
                .setName('platform')
                .setDescription('Platform (if resolving by username)')
                .setRequired(false)
                .addChoices(
                    { name: 'Java', value: 'java' },
                    { name: 'Bedrock', value: 'bedrock' }
                )
            ),

        async execute(interaction, client) {
            // Permission check - Staff only
            if (!isStaff(interaction.member)) {
                return interaction.reply({ 
                    content: 'You do not have permission to use this command.', 
                    flags: 64
                });
            }

            await interaction.deferReply();

            const target = interaction.options.getString('target');
            const unbanReason = interaction.options.getString('reason') || 'No reason provided';
            const platformOption = interaction.options.getString('platform') || 'java';

            const resolvedTarget = await resolveMinecraftTarget(target, platformOption, client);
            if (resolvedTarget.error) {
                return interaction.editReply({ content: resolvedTarget.error });
            }

            const { primaryProfile, discordId, discordUser, linkedAccounts } = resolvedTarget;

            // Collect all UUIDs to unban
            const uuidsToUnban = dedupeTargets(primaryProfile, linkedAccounts);

            // Find and unban ALL active bans for these UUIDs
            const unbannedBans = [];
            for (const targetAccount of uuidsToUnban) {
                const uuid = targetAccount.uuid;
                const bans = await ServerBan.find({
                    $or: [
                        { primaryUuid: uuid, active: true },
                        { bannedUuids: uuid, active: true }
                    ]
                });
                
                for (const ban of bans) {
                    if (!unbannedBans.find(b => b._id.toString() === ban._id.toString())) {
                        ban.active = false;
                        ban.unbannedAt = new Date();
                        ban.unbannedBy = interaction.user.id;
                        ban.unbannedByTag = interaction.user.tag;
                        ban.unbanReason = unbanReason;
                        await ban.save();
                        unbannedBans.push(ban);

                        await unbanPlayer(ban.primaryUsername).catch(() => null);
                        for (const bannedUuid of ban.bannedUuids || []) {
                            const linkedAccount = linkedAccounts.find(acc => normalizeUuid(acc.uuid) === normalizeUuid(bannedUuid));
                            if (linkedAccount) {
                                await unbanPlayer(linkedAccount.minecraftUsername).catch(() => null);
                            }
                        }
                        
                        // Log each unban
                        await logUnban(client, ban, interaction.user);
                    }
                }
            }

            if (unbannedBans.length === 0) {
                return interaction.editReply({ 
                    content: `No active bans found for **${primaryProfile.name}**${discordUser ? ` (<@${discordId}>)` : ''}.` 
                });
            }

            // Build response embed
            const embed = new EmbedBuilder()
                .setTitle('Player Unbanned')
                .setColor(0x57F287)
                .addFields(
                    { name: 'Player', value: `**${primaryProfile.name}**`, inline: true },
                    { name: 'Platform', value: primaryProfile.platform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                    { name: 'Bans Removed', value: `${unbannedBans.length}`, inline: true },
                    { name: 'Unban Reason', value: unbanReason, inline: false }
                )
                .setFooter({ text: `Unbanned by ${interaction.user.tag}` })
                .setTimestamp();

            if (linkedAccounts.length > 1) {
                embed.addFields({ 
                    name: `Linked Accounts Unbanned (${linkedAccounts.length})`, 
                    value: linkedAccounts.map(a => `• ${a.minecraftUsername} (${a.platform})`).join('\n'), 
                    inline: false 
                });
            }

            // Show original ban reasons
            const reasons = [...new Set(unbannedBans.map(b => b.reason))];
            if (reasons.length > 0) {
                embed.addFields({ 
                    name: 'Original Ban Reason(s)', 
                    value: reasons.slice(0, 3).join('\n').substring(0, 1000), 
                    inline: false 
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('checkban')
            .setDescription('Check if a player is banned')
            .addStringOption(opt => opt
                .setName('target')
                .setDescription('Minecraft username or @Discord user')
                .setRequired(true)
            ),

        async execute(interaction, client) {
            // Permission check - Staff only
            if (!isStaff(interaction.member)) {
                return interaction.reply({ 
                    content: 'You do not have permission to use this command.', 
                    flags: 64
                });
            }

            await interaction.deferReply({ flags: 64 });

            const target = interaction.options.getString('target');

            let uuid = null;
            let username = target;

            // Check if Discord mention
            const mentionMatch = target.match(/<@!?(\d+)>/);
            if (mentionMatch) {
                const discordId = mentionMatch[1];
                const accounts = await getAllLinkedAccounts(discordId);
                
                if (accounts.length > 0) {
                    uuid = normalizeUuid(accounts[0].uuid);
                    username = accounts[0].minecraftUsername;
                } else {
                    return interaction.editReply({ content: 'This Discord user has no linked accounts.' });
                }
            } else {
                // Lookup profile
                let profile = await lookupMcProfile(target, 'java');
                if (!profile) profile = await lookupMcProfile(target, 'bedrock');
                
                if (profile) {
                    uuid = normalizeUuid(profile.uuid);
                    username = profile.name;
                }
            }

            // Find ban
            let ban = null;
            if (uuid) {
                ban = await ServerBan.findActiveBan(uuid);
            }
            
            if (!ban) {
                ban = await ServerBan.findOne({
                    primaryUsername: { $regex: new RegExp(`^${username}$`, 'i') },
                    active: true
                });
            }

            if (!ban) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Not Banned')
                            .setDescription(`**${username}** is not currently banned.`)
                            .setColor(0x57F287)
                            .setTimestamp()
                    ]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('Active Ban Found')
                .setColor(0xff4444)
                .addFields(
                    { name: 'Player', value: `**${ban.primaryUsername}**`, inline: true },
                    { name: 'Platform', value: ban.primaryPlatform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                    { name: 'Reason', value: ban.reason, inline: false },
                    { name: 'Duration', value: ban.isPermanent ? '**Permanent**' : ban.duration, inline: true },
                    { name: 'Banned By', value: ban.staffTag || `<@${ban.staffId}>`, inline: true },
                    { name: 'Banned At', value: `<t:${Math.floor(new Date(ban.bannedAt).getTime() / 1000)}:F>`, inline: false }
                )
                .setFooter({ text: `Case #${ban.caseNumber || 'N/A'}` })
                .setTimestamp();

            if (!ban.isPermanent && ban.expiresAt) {
                embed.addFields({ 
                    name: 'Expires', 
                    value: `<t:${Math.floor(ban.expiresAt.getTime() / 1000)}:R>`, 
                    inline: true 
                });
            }

            if (ban.discordId) {
                embed.addFields({ name: 'Discord', value: `<@${ban.discordId}>`, inline: true });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('banhistory')
            .setDescription('View ban history for a player')
            .addStringOption(opt => opt
                .setName('target')
                .setDescription('Minecraft username')
                .setRequired(true)
            ),

        async execute(interaction, client) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ content: 'Permission denied.', flags: 64 });
            }

            await interaction.deferReply({ flags: 64 });

            const target = interaction.options.getString('target');

            // Lookup profile
            let profile = await lookupMcProfile(target, 'java');
            if (!profile) profile = await lookupMcProfile(target, 'bedrock');

            let bans = [];

            if (profile) {
                bans = await ServerBan.findAllBans(normalizeUuid(profile.uuid));
            }

            if (bans.length === 0) {
                // Try by username
                bans = await ServerBan.find({
                    primaryUsername: { $regex: new RegExp(`^${target}$`, 'i') }
                }).sort({ bannedAt: -1 });
            }

            if (bans.length === 0) {
                return interaction.editReply({ content: `No ban history found for **${target}**.` });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Ban History: ${profile?.name || target}`)
                .setColor(getEmbedColor())
                .setFooter({ text: `${bans.length} ban(s) found` })
                .setTimestamp();

            for (const ban of bans.slice(0, 10)) {
                const status = ban.active ? 'Active' : 'Expired/Unbanned';
                const date = `<t:${Math.floor(new Date(ban.bannedAt).getTime() / 1000)}:d>`;
                
                embed.addFields({
                    name: `Case #${ban.caseNumber || 'N/A'} - ${status}`,
                    value: [
                        `**Reason:** ${ban.reason.substring(0, 100)}`,
                        `**Duration:** ${ban.isPermanent ? 'Permanent' : ban.duration}`,
                        `**Date:** ${date}`,
                        `**By:** ${ban.staffTag || 'Unknown'}`
                    ].join('\n'),
                    inline: false
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('kick')
            .setDescription('Kick a linked Minecraft player from the server')
            .addStringOption(opt => opt
                .setName('target')
                .setDescription('Minecraft username or @Discord user linked to Minecraft')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for the kick')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('platform')
                .setDescription('Platform (if resolving by username)')
                .setRequired(false)
                .addChoices(
                    { name: 'Java', value: 'java' },
                    { name: 'Bedrock', value: 'bedrock' }
                )
            ),

        async execute(interaction, client) {
            // Permission check - Staff only
            if (!isStaff(interaction.member)) {
                return interaction.reply({ 
                    content: 'You do not have permission to use this command.', 
                    flags: 64
                });
            }

            await interaction.deferReply();

            const target = interaction.options.getString('target');
            const reason = interaction.options.getString('reason');
            const platformOption = interaction.options.getString('platform') || 'java';

            const resolvedTarget = await resolveMinecraftTarget(target, platformOption, client);
            if (resolvedTarget.error) {
                return interaction.editReply({ content: resolvedTarget.error });
            }

            const { primaryProfile, discordId, discordUser, linkedAccounts } = resolvedTarget;

            // Get case number
            let caseNumber;
            try {
                caseNumber = await getNextCaseNumber('kick');
            } catch (e) {
                caseNumber = null;
            }

            // Create the kick record
            const { randomUUID } = require('crypto');
            const kick = new Kick({
                _id: randomUUID(),
                caseNumber,
                primaryUuid: primaryProfile.uuid,
                primaryUsername: primaryProfile.name,
                primaryPlatform: primaryProfile.platform,
                discordId: discordId || null,
                discordTag: discordUser?.tag || null,
                reason,
                staffId: interaction.user.id,
                staffTag: interaction.user.tag,
                kickedAt: new Date(),
                rconExecuted: false
            });

            // Execute the kick via the proxy bridge
            const kickTargets = dedupeTargets(primaryProfile, linkedAccounts);
            const kickResults = [];
            for (const targetAccount of kickTargets) {
                const kickResult = await kickFromProxy(targetAccount.name, reason);
                kickResults.push({ target: targetAccount, result: kickResult });
                kick.rconExecuted = kick.rconExecuted || kickResult.success;
            }

            await kick.save();

            // Log to channel
            await logKick(client, kick, linkedAccounts);

            // Build response embed
            const embed = new EmbedBuilder()
                .setTitle('Player Kicked')
                .setColor(0xFFA500)
                .addFields(
                    { name: 'Player', value: `**${primaryProfile.name}**`, inline: true },
                    { name: 'Platform', value: primaryProfile.platform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                    { name: 'RCON', value: kickResults.some(entry => entry.result.success) ? 'Success' : 'Failed', inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Minecraft Enforcement', value: kickResults.map(entry => `**${entry.target.name}**: ${entry.result.success ? 'Kicked' : 'Failed'}${entry.result.success ? '' : ` (${entry.result.response})`}`).join('\n').substring(0, 1024), inline: false }
                )
                .setFooter({ text: `Case #${caseNumber || 'N/A'} | Kicked by ${interaction.user.tag}` })
                .setTimestamp();

            if (linkedAccounts.length > 1) {
                embed.addFields({ 
                    name: `Linked Accounts Kicked (${linkedAccounts.length})`, 
                    value: linkedAccounts.map(a => `- ${a.minecraftUsername} (${a.platform})`).join('\n'), 
                    inline: false 
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('warn')
            .setDescription('Warn a linked Minecraft player')
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for the warning')
                .setRequired(true)
            )
            .addUserOption(opt => opt
                .setName('target')
                .setDescription('Discord user linked to the Minecraft account')
                .setRequired(false)
            )
            .addStringOption(opt => opt
                .setName('mcname')
                .setDescription('Or enter a Minecraft username to lookup')
                .setRequired(false)
            )
            .addStringOption(opt => opt
                .setName('severity')
                .setDescription('Severity of the warning')
                .setRequired(false)
                .addChoices(
                    { name: 'Minor', value: 'minor' },
                    { name: 'Moderate', value: 'moderate' },
                    { name: 'Severe', value: 'severe' }
                )
            )
            .addStringOption(opt => opt
                .setName('category')
                .setDescription('Category of the warning')
                .setRequired(false)
                .addChoices(
                    { name: 'Behavior', value: 'behavior' },
                    { name: 'Chat', value: 'chat' },
                    { name: 'Cheating', value: 'cheating' },
                    { name: 'Griefing', value: 'griefing' },
                    { name: 'PVP', value: 'pvp' },
                    { name: 'Other', value: 'other' }
                )
            ),

        async execute(interaction, client) {
            // Permission check - Staff only
            if (!isStaff(interaction.member)) {
                return interaction.reply({ 
                    content: 'You do not have permission to use this command.', 
                    flags: 64
                });
            }

            await interaction.deferReply();

            let targetUser = interaction.options.getUser('target');
            const mcname = interaction.options.getString('mcname');
            const reason = interaction.options.getString('reason');
            const severity = interaction.options.getString('severity') || 'moderate';
            const category = interaction.options.getString('category') || 'other';

            let targetUserResolved = null;
            if (targetUser) {
                targetUserResolved = await resolveMinecraftTarget(`<@${targetUser.id}>`, 'java', interaction.client);
            } else if (mcname) {
                targetUserResolved = await resolveMinecraftTarget(mcname, 'java', interaction.client);
            }

            if (!targetUserResolved || targetUserResolved.error) {
                return interaction.editReply({ content: targetUserResolved?.error || 'You must provide either a Discord user or a Minecraft username.' });
            }

            const { discordId, discordUser, linkedAccounts, primaryProfile } = targetUserResolved;
            const targetName = primaryProfile?.name || linkedAccounts[0]?.minecraftUsername || targetUser?.tag || mcname;
            const discordTag = discordUser?.tag || targetUser?.tag || null;

            // Get case number
            let caseNumber;
            try {
                caseNumber = await getNextCaseNumber('warning');
            } catch (e) {
                caseNumber = Date.now();
            }

            // Collect all linked UUIDs
            const warnedUuids = linkedAccounts.map(a => normalizeUuid(a.uuid));

            // Create the warning record
            const { randomUUID } = require('crypto');
            const warning = new Warning({
                _id: randomUUID(),
                caseNumber,
                uuid: primaryProfile?.uuid || null,
                playerName: primaryProfile?.name || null,
                platform: primaryProfile?.platform || null,
                warnedUuids,
                discordId: discordId || null,
                discordTag,
                reason,
                severity,
                category,
                staffUuid: null,
                staffName: interaction.user.tag,
                staffId: interaction.user.id,
                createdAt: new Date(),
                active: true,
                dmSent: false
            });

            await warning.save();

            // Log to channel
            await logWarning(client, warning, linkedAccounts);

            // Get total active warnings for this user
            const totalWarnings = await Warning.countActiveWarnings({
                discordId: discordId || null,
                uuid: primaryProfile?.uuid || null,
                playerName: primaryProfile?.name || null
            });

            // Build response embed
            const severityColors = {
                minor: 0xFFFF00,
                moderate: 0xFFA500,
                severe: 0xFF4444
            };

            const embed = new EmbedBuilder()
                .setTitle('Warning Issued')
                .setColor(severityColors[severity] || 0xFFA500)
                .addFields(
                    { name: 'Target', value: discordId ? `${discordTag} (<@${discordId}>)` : targetName, inline: true },
                    { name: 'Severity', value: severity.charAt(0).toUpperCase() + severity.slice(1), inline: true },
                    { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1), inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Total Warnings', value: `${totalWarnings}`, inline: true },
                    { name: 'Minecraft Target', value: primaryProfile ? `**${primaryProfile.name}** (${primaryProfile.platform})` : 'Unknown', inline: false }
                )
                .setFooter({ text: `Case #${caseNumber} | Warned by ${interaction.user.tag}` })
                .setTimestamp();

            if (linkedAccounts.length > 1) {
                embed.addFields({ 
                    name: `All Linked Accounts (${linkedAccounts.length})`, 
                    value: linkedAccounts.map(a => `• ${a.minecraftUsername} (${a.platform})`).join('\n'), 
                    inline: false 
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('mute')
            .setDescription('Mute a linked Minecraft player for a period of time')
            .addStringOption(opt => opt
                .setName('duration')
                .setDescription('Mute duration (e.g., 10m, 1h, 1d)')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for the mute')
                .setRequired(true)
            )
            .addUserOption(opt => opt
                .setName('target')
                .setDescription('Discord user linked to the Minecraft account')
                .setRequired(false)
            )
            .addStringOption(opt => opt
                .setName('mcname')
                .setDescription('Or enter a Minecraft username to lookup')
                .setRequired(false)
            ),

        async execute(interaction, client) {
            // Permission check - Staff only
            if (!isStaff(interaction.member)) {
                return interaction.reply({ 
                    content: 'You do not have permission to use this command.', 
                    flags: 64
                });
            }

            await interaction.deferReply();

            let targetUser = interaction.options.getUser('target');
            const mcname = interaction.options.getString('mcname');
            const reason = interaction.options.getString('reason');
            const durationStr = interaction.options.getString('duration');

            let targetUserResolved = null;
            if (targetUser) {
                targetUserResolved = await resolveMinecraftTarget(`<@${targetUser.id}>`, 'java', interaction.client);
            } else if (mcname) {
                targetUserResolved = await resolveMinecraftTarget(mcname, 'java', interaction.client);
            }

            if (!targetUserResolved || targetUserResolved.error) {
                return interaction.editReply({ content: targetUserResolved?.error || 'You must provide either a Discord user or a Minecraft username.' });
            }

            // Parse duration
            const durationParsed = parseDurationFull(durationStr);
            if (!durationParsed) {
                return interaction.editReply({ content: 'Invalid duration format. Use formats like: 10m, 1h, 1d, 1w, 1mo, or perm.' });
            }

            const { discordId, discordUser, linkedAccounts, primaryProfile } = targetUserResolved;
            const targetName = primaryProfile?.name || linkedAccounts[0]?.minecraftUsername || mcname || targetUser?.tag;
            const discordTag = discordUser?.tag || targetUser?.tag || null;
            const muteTargets = dedupeTargets(primaryProfile, linkedAccounts);

            // Get case number
            let caseNumber;
            try {
                caseNumber = await getNextCaseNumber('mute');
            } catch (e) {
                caseNumber = Date.now();
            }

            const appliedMutes = await applyMinecraftMute(muteTargets, durationParsed.ms);

            // Create the mute record
            const { randomUUID } = require('crypto');
            const mute = new Mute({
                _id: randomUUID(),
                caseNumber,
                discordId: discordId || null,
                discordTag,
                uuid: primaryProfile?.uuid || null,
                playerName: primaryProfile?.name || null,
                platform: primaryProfile?.platform || null,
                reason,
                duration: durationParsed.display,
                durationMs: durationParsed.ms,
                expiresAt: durationParsed.expiresAt,
                staffId: interaction.user.id,
                staffName: interaction.user.tag,
                createdAt: new Date(),
                active: true,
                dmSent: false
            });

            await mute.save();

            await logMute(client, mute, linkedAccounts);

            // Build response embed
            const embed = new EmbedBuilder()
                .setTitle('User Muted')
                .setColor(0xFF4444)
                .addFields(
                    { name: 'Target', value: discordId ? `${discordTag} (<@${discordId}>)` : targetName, inline: true },
                    { name: 'Duration', value: durationParsed.display, inline: true },
                    { name: 'Expires', value: durationParsed.expiresAt ? `<t:${Math.floor(durationParsed.expiresAt.getTime() / 1000)}:R>` : 'Permanent', inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Minecraft Target', value: primaryProfile ? `**${primaryProfile.name}** (${primaryProfile.platform})` : 'Unknown', inline: false }
                )
                .setFooter({ text: `Case #${caseNumber} | Muted by ${interaction.user.tag}` })
                .setTimestamp();

            embed.addFields({
                name: 'Minecraft Enforcement',
                value: appliedMutes.map(entry => `**${entry.target.name}**: ${entry.result.success ? 'Muted' : 'Failed'}${entry.result.success ? '' : ` (${entry.result.response})`}`).join('\n').substring(0, 1024),
                inline: false
            });

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('unmute')
            .setDescription('Unmute a linked Minecraft player')
            .addUserOption(opt => opt
                .setName('target')
                .setDescription('Discord user linked to the Minecraft account')
                .setRequired(false)
            )
            .addStringOption(opt => opt
                .setName('mcname')
                .setDescription('Or enter a Minecraft username to lookup')
                .setRequired(false)
            )
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for unmuting')
                .setRequired(false)
            ),

        async execute(interaction, client) {
            // Permission check - Staff only
            if (!isStaff(interaction.member)) {
                return interaction.reply({ 
                    content: 'You do not have permission to use this command.', 
                    flags: 64
                });
            }

            await interaction.deferReply();

            const targetUser = interaction.options.getUser('target');
            const mcname = interaction.options.getString('mcname');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            let resolvedTarget = null;

            if (targetUser) {
                resolvedTarget = await resolveMinecraftTarget(`<@${targetUser.id}>`, 'java', interaction.client);
            } else if (mcname) {
                resolvedTarget = await resolveMinecraftTarget(mcname, 'java', interaction.client);
            }

            if (resolvedTarget.error) {
                return interaction.editReply({ content: resolvedTarget.error });
            }
            if (!resolvedTarget) {
                return interaction.editReply({ content: 'You must provide either a Discord user or a Minecraft username.' });
            }

            const { discordId, discordUser, linkedAccounts, primaryProfile } = resolvedTarget;
            const discordTag = discordUser?.tag || targetUser?.tag || null;
            const muteTargets = dedupeTargets(primaryProfile, linkedAccounts);

            const muteQuery = {
                active: true,
                $or: []
            };
            if (discordId) muteQuery.$or.push({ discordId });
            if (primaryProfile?.uuid) muteQuery.$or.push({ uuid: normalizeUuid(primaryProfile.uuid) });
            if (primaryProfile?.name) muteQuery.$or.push({ playerName: { $regex: new RegExp(`^${primaryProfile.name}$`, 'i') } });

            const activeMutes = muteQuery.$or.length > 0 ? await Mute.find(muteQuery).sort({ createdAt: -1 }) : [];
            for (const activeMute of activeMutes) {
                activeMute.active = false;
                activeMute.unmutedAt = new Date();
                activeMute.unmutedBy = interaction.user.id;
                activeMute.unmutedByTag = interaction.user.tag;
                await activeMute.save();
            }

            const appliedUnmutes = await applyMinecraftUnmute(muteTargets);
            await logUnmute(
                client,
                activeMutes[0] || {
                    caseNumber: null,
                    discordId: discordId || null,
                    discordTag,
                    playerName: primaryProfile?.name || null,
                    platform: primaryProfile?.platform || null
                },
                interaction.user,
                reason,
                linkedAccounts
            );

            const embed = new EmbedBuilder()
                .setTitle('User Unmuted')
                .setColor(0x00FF00)
                .addFields(
                    { name: 'Target', value: discordId ? `${discordTag} (<@${discordId}>)` : (primaryProfile?.name || mcname || targetUser?.tag || 'Unknown'), inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setFooter({ text: `Unmuted by ${interaction.user.tag}` })
                .setTimestamp();

            if (primaryProfile) {
                embed.addFields({ name: 'Minecraft Target', value: `**${primaryProfile.name}** (${primaryProfile.platform})`, inline: false });
            }

            if (activeMutes.length > 0) {
                embed.addFields({ name: 'Original Mute', value: `Case #${activeMutes[0].caseNumber}${activeMutes.length > 1 ? ` (+${activeMutes.length - 1} more)` : ''}`, inline: true });
            }

            embed.addFields({
                name: 'Minecraft Enforcement',
                value: appliedUnmutes.map(entry => `**${entry.target.name}**: ${entry.result.success ? 'Unmuted' : 'Failed'}${entry.result.success ? '' : ` (${entry.result.response})`}`).join('\n').substring(0, 1024),
                inline: false
            });

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('warnings')
            .setDescription('View warnings for a user')
            .addUserOption(opt => opt
                .setName('target')
                .setDescription('Discord user to check')
                .setRequired(false)
            )
            .addStringOption(opt => opt
                .setName('mcname')
                .setDescription('Or enter a Minecraft username to lookup')
                .setRequired(false)
            )
            .addBooleanOption(opt => opt
                .setName('include_removed')
                .setDescription('Include removed warnings')
                .setRequired(false)
            ),

        async execute(interaction, client) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ content: 'Permission denied.', flags: 64 });
            }

            await interaction.deferReply({ flags: 64 });

            let targetUser = interaction.options.getUser('target');
            const mcname = interaction.options.getString('mcname');
            const includeRemoved = interaction.options.getBoolean('include_removed') || false;

            let targetUserResolved = null;
            if (targetUser) {
                targetUserResolved = await resolveMinecraftTarget(`<@${targetUser.id}>`, 'java', interaction.client);
            } else if (mcname) {
                targetUserResolved = await resolveMinecraftTarget(mcname, 'java', interaction.client);
            }

            if (!targetUserResolved || targetUserResolved.error) {
                return interaction.editReply({ content: targetUserResolved?.error || 'You must provide either a Discord user or a Minecraft username.' });
            }

            const { discordId, discordUser, linkedAccounts, primaryProfile } = targetUserResolved;
            const warnings = await Warning.getUserWarnings({
                discordId: discordId || null,
                uuid: primaryProfile?.uuid || null,
                playerName: primaryProfile?.name || targetUser?.tag || mcname || null
            }, includeRemoved);

            if (warnings.length === 0) {
                return interaction.editReply({ 
                    content: `**${discordUser?.tag || targetUser?.tag || primaryProfile?.name || linkedAccounts[0]?.minecraftUsername || mcname}** has no${includeRemoved ? '' : ' active'} warnings.` 
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Warnings: ${discordUser?.tag || targetUser?.tag || primaryProfile?.name || linkedAccounts[0]?.minecraftUsername || mcname}`)
                .setColor(0xFFA500)
                .setFooter({ text: `${warnings.length} warning(s) found` })
                .setTimestamp();

            const lines = warnings.slice(0, 10).map(w => {
                const status = w.active ? '' : '[REMOVED]';
                const date = `<t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:R>`;
                const sev = w.severity.charAt(0).toUpperCase() + w.severity.slice(1);
                const cat = w.category.charAt(0).toUpperCase() + w.category.slice(1);
                return `**#${w.caseNumber}** ${status} - ${sev} (${cat})\n${w.reason.substring(0, 80)}${w.reason.length > 80 ? '...' : ''}\n${date} by ${w.staffName}`;
            });

            embed.setDescription(lines.join('\n\n'));

            if (warnings.length > 10) {
                embed.addFields({ 
                    name: 'Note', 
                    value: `Showing 10 of ${warnings.length} warnings. View all at the web viewer.`, 
                    inline: false 
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('removewarn')
            .setDescription('Remove a warning from a user')
            .addIntegerOption(opt => opt
                .setName('case')
                .setDescription('Case number of the warning')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for removing the warning')
                .setRequired(false)
            ),

        async execute(interaction, client) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ content: 'Permission denied.', flags: 64 });
            }

            await interaction.deferReply();

            const caseNumber = interaction.options.getInteger('case');
            const removeReason = interaction.options.getString('reason') || 'No reason provided';

            const warning = await Warning.findOne({ caseNumber, active: true });

            if (!warning) {
                return interaction.editReply({ content: `No active warning found with case #${caseNumber}.` });
            }

            warning.active = false;
            warning.removedBy = interaction.user.id;
            warning.removedByTag = interaction.user.tag;
            warning.removedAt = new Date();
            warning.removeReason = removeReason;
            await warning.save();

            const embed = new EmbedBuilder()
                .setTitle('Warning Removed')
                .setColor(0x57F287)
                .addFields(
                    { name: 'Case', value: `#${caseNumber}`, inline: true },
                    { name: 'Target', value: warning.discordId ? `<@${warning.discordId}>` : (warning.playerName || 'Unknown'), inline: true },
                    { name: 'Original Reason', value: warning.reason, inline: false },
                    { name: 'Removal Reason', value: removeReason, inline: false }
                )
                .setFooter({ text: `Removed by ${interaction.user.tag}` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('recentbans')
            .setDescription('View recent bans')
            .addIntegerOption(opt => opt
                .setName('count')
                .setDescription('Number of bans to show (default 10, max 25)')
                .setRequired(false)
            ),

        async execute(interaction, client) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ content: 'Permission denied.', flags: 64 });
            }

            await interaction.deferReply({ flags: 64 });

            const count = Math.min(interaction.options.getInteger('count') || 10, 25);

            const bans = await ServerBan.find().sort({ bannedAt: -1 }).limit(count);

            if (bans.length === 0) {
                return interaction.editReply({ content: 'No bans found.' });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Recent Bans (${bans.length})`)
                .setColor(0xff4444)
                .setFooter({ text: 'NewLife SMP' })
                .setTimestamp();

            const lines = bans.map(ban => {
                const status = ban.active ? 'Active' : 'Expired';
                const date = `<t:${Math.floor(new Date(ban.bannedAt).getTime() / 1000)}:R>`;
                return `**#${ban.caseNumber || 'N/A'}** - ${ban.primaryUsername} [${status}]\n${ban.reason.substring(0, 50)}${ban.reason.length > 50 ? '...' : ''} | ${date}`;
            });

            embed.setDescription(lines.join('\n\n'));

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('recentkicks')
            .setDescription('View recent kicks')
            .addIntegerOption(opt => opt
                .setName('count')
                .setDescription('Number of kicks to show (default 10, max 25)')
                .setRequired(false)
            ),

        async execute(interaction, client) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ content: 'Permission denied.', flags: 64 });
            }

            await interaction.deferReply({ flags: 64 });

            const count = Math.min(interaction.options.getInteger('count') || 10, 25);

            const kicks = await Kick.find().sort({ kickedAt: -1 }).limit(count);

            if (kicks.length === 0) {
                return interaction.editReply({ content: 'No kicks found.' });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Recent Kicks (${kicks.length})`)
                .setColor(0xFFA500)
                .setFooter({ text: 'NewLife SMP' })
                .setTimestamp();

            const lines = kicks.map(kick => {
                const date = `<t:${Math.floor(new Date(kick.kickedAt).getTime() / 1000)}:R>`;
                return `**#${kick.caseNumber || 'N/A'}** - ${kick.primaryUsername}\n${kick.reason.substring(0, 50)}${kick.reason.length > 50 ? '...' : ''} | ${date}`;
            });

            embed.setDescription(lines.join('\n\n'));

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('kickhistory')
            .setDescription('View kick history for a player')
            .addStringOption(opt => opt
                .setName('target')
                .setDescription('Minecraft username')
                .setRequired(true)
            ),

        async execute(interaction, client) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ content: 'Permission denied.', flags: 64 });
            }

            await interaction.deferReply({ flags: 64 });

            const target = interaction.options.getString('target');

            // Lookup profile
            let profile = await lookupMcProfile(target, 'java');
            if (!profile) profile = await lookupMcProfile(target, 'bedrock');

            let kicks = [];

            if (profile) {
                kicks = await Kick.find({
                    primaryUuid: normalizeUuid(profile.uuid)
                }).sort({ kickedAt: -1 });
            }

            if (kicks.length === 0) {
                // Try by username
                kicks = await Kick.find({
                    primaryUsername: { $regex: new RegExp(`^${target}$`, 'i') }
                }).sort({ kickedAt: -1 });
            }

            if (kicks.length === 0) {
                return interaction.editReply({ content: `No kick history found for **${target}**.` });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Kick History: ${profile?.name || target}`)
                .setColor(0xFFA500)
                .setFooter({ text: `${kicks.length} kick(s) found` })
                .setTimestamp();

            for (const kick of kicks.slice(0, 10)) {
                const date = `<t:${Math.floor(new Date(kick.kickedAt).getTime() / 1000)}:d>`;
                
                embed.addFields({
                    name: `Case #${kick.caseNumber || 'N/A'}`,
                    value: [
                        `**Reason:** ${kick.reason.substring(0, 100)}`,
                        `**Date:** ${date}`,
                        `**By:** ${kick.staffTag || 'Unknown'}`
                    ].join('\n'),
                    inline: false
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    }
];

/**
 * Process expired mutes - removes the Minecraft mute from expired mutes.
 * Should be called periodically.
 */
async function processExpiredMutes(client) {
    try {
        const expiredMutes = await Mute.getExpiredMutes();
        
        for (const mute of expiredMutes) {
            try {
                const targetName = mute.playerName || null;
                if (targetName) {
                    await unmutePlayer(targetName).catch(() => null);
                }

                if (mute.uuid) {
                    const linkedAccounts = await getAllLinkedAccounts(null, mute.uuid).catch(() => []);
                    for (const account of linkedAccounts) {
                        await unmutePlayer(account.minecraftUsername).catch(() => null);
                    }
                }
                
                // Mark as inactive
                mute.active = false;
                mute.unmutedAt = new Date();
                mute.unmutedBy = 'system';
                mute.unmutedByTag = 'Auto-expire';
                await mute.save();

                if (targetName) {
                    console.log(`[Mutes] Expired mute lifted for ${targetName}`);
                }
            } catch (e) {
                console.error(`Failed to process expired mute for ${mute.playerName || mute.discordId || mute._id}:`, e);
            }
        }
    } catch (e) {
        console.error('Error processing expired mutes:', e);
    }
}

let muteProcessorInterval = null;

/**
 * Initialize mute expiration processor
 * Checks every 30 seconds for expired mutes
 */
function initMuteProcessor(client) {
    // Process immediately
    processExpiredMutes(client);
    
    // Then check every 30 seconds
    muteProcessorInterval = setInterval(() => processExpiredMutes(client), 30 * 1000);
    console.log(' Mute expiration processor initialized');
}

function stopMuteProcessor() {
    if (muteProcessorInterval) {
        clearInterval(muteProcessorInterval);
        muteProcessorInterval = null;
    }
}

module.exports = {
    name: 'ServerBans',
    slashCommands,
    lookupMcProfile,
    getAllLinkedAccounts,
    initMuteProcessor,
    stopMuteProcessor
};
