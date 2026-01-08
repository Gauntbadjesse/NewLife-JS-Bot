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
const { getNextCaseNumber } = require('../database/caseCounter');
const { isStaff, isAdmin, isModerator } = require('../utils/permissions');
const { sendDm } = require('../utils/dm');
const { executeRcon, kickFromProxy } = require('../utils/rcon');

// Environment config
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || process.env.BAN_LOG_CHANNEL_ID;
const EMBED_COLOR = process.env.EMBED_COLOR || '#10b981';

/**
 * Get embed color as integer
 */
function getEmbedColor() {
    const color = EMBED_COLOR;
    return color.startsWith('#') ? parseInt(color.slice(1), 16) : parseInt(color, 16);
}

/**
 * Normalize UUID - remove dashes and lowercase
 */
function normalizeUuid(uuid) {
    return uuid.replace(/-/g, '').toLowerCase();
}

/**
 * Lookup Minecraft profile from API
 */
async function lookupMcProfile(username, platform = 'java') {
    try {
        let fetcher = globalThis.fetch;
        if (!fetcher) fetcher = require('node-fetch');
        
        const url = platform === 'bedrock'
            ? `https://mcprofile.io/api/v1/bedrock/gamertag/${encodeURIComponent(username)}`
            : `https://mcprofile.io/api/v1/java/username/${encodeURIComponent(username)}`;
        
        const res = await fetcher(url);
        if (!res.ok) return null;
        
        const data = await res.json();
        
        let uuid = null;
        if (platform === 'bedrock') {
            uuid = data.fuuid || data.floodgateuid || data.id || data.uuid;
        } else {
            uuid = data.uuid || data.id;
        }
        
        if (!uuid) return null;
        
        return {
            uuid: uuid.replace(/-/g, ''),
            name: data.name || data.username || username,
            platform
        };
    } catch (e) {
        console.error('MC Profile lookup error:', e);
        return null;
    }
}

/**
 * Parse duration string to milliseconds and expiry date
 * @param {string} duration - Duration string like "1d", "7d", "30d", "1h", "perm"
 * @returns {Object} - { ms, expiresAt, isPermanent, display }
 */
function parseDuration(duration) {
    if (!duration) return null;
    
    const lower = duration.toLowerCase().trim();
    
    if (lower === 'perm' || lower === 'permanent' || lower === 'forever') {
        return {
            ms: null,
            expiresAt: null,
            isPermanent: true,
            display: 'Permanent'
        };
    }
    
    const match = lower.match(/^(\d+)([dhms])$/);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    let ms;
    let display;
    
    switch (unit) {
        case 'd':
            ms = value * 24 * 60 * 60 * 1000;
            display = `${value} day${value > 1 ? 's' : ''}`;
            break;
        case 'h':
            ms = value * 60 * 60 * 1000;
            display = `${value} hour${value > 1 ? 's' : ''}`;
            break;
        case 'm':
            ms = value * 60 * 1000;
            display = `${value} minute${value > 1 ? 's' : ''}`;
            break;
        case 's':
            ms = value * 1000;
            display = `${value} second${value > 1 ? 's' : ''}`;
            break;
        default:
            return null;
    }
    
    return {
        ms,
        expiresAt: new Date(Date.now() + ms),
        isPermanent: false,
        display
    };
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
 * Send ban DM to user
 */
async function sendBanDm(client, discordId, banData) {
    const embed = new EmbedBuilder()
        .setTitle('You Have Been Banned')
        .setColor(0xff4444)
        .setDescription(`You have been banned from **NewLife SMP**.`)
        .addFields(
            { name: 'Reason', value: banData.reason, inline: false },
            { name: 'Duration', value: banData.isPermanent ? 'Permanent' : banData.durationDisplay, inline: true },
            { name: 'Banned At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: 'NewLife SMP' })
        .setTimestamp();
    
    if (!banData.isPermanent && banData.expiresAt) {
        embed.addFields({
            name: 'Expires',
            value: `<t:${Math.floor(banData.expiresAt.getTime() / 1000)}:R>`,
            inline: true
        });
    }
    
    embed.addFields({
        name: 'Appeal',
        value: 'If you believe this ban was issued in error, you may appeal in our Discord server.',
        inline: false
    });
    
    return sendDm(client, discordId, { embeds: [embed] });
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
 * Kick player from server via RCON
 */
async function kickPlayer(username, reason) {
    try {
        const result = await executeRcon(`kick ${username} ${reason}`);
        return result.success;
    } catch (e) {
        console.error('Failed to kick player via RCON:', e);
        return false;
    }
}

/**
 * Send kick DM to user
 */
async function sendKickDm(client, discordId, kickData) {
    const embed = new EmbedBuilder()
        .setTitle('You Have Been Kicked')
        .setColor(0xFFA500)
        .setDescription(`You have been kicked from **NewLife SMP**.`)
        .addFields(
            { name: 'Reason', value: kickData.reason, inline: false },
            { name: 'Kicked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: 'NewLife SMP | You may rejoin the server' })
        .setTimestamp();
    
    return sendDm(client, discordId, { embeds: [embed] });
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
 * Send warning DM to user
 */
async function sendWarningDm(client, discordId, warningData) {
    const severityColors = {
        minor: 0xFFFF00,
        moderate: 0xFFA500,
        severe: 0xFF4444
    };
    
    const embed = new EmbedBuilder()
        .setTitle('⚠️ You Have Been Warned')
        .setColor(severityColors[warningData.severity] || 0xFFA500)
        .setDescription(`You have received a warning on **NewLife SMP**.`)
        .addFields(
            { name: 'Reason', value: warningData.reason, inline: false },
            { name: 'Severity', value: warningData.severity.charAt(0).toUpperCase() + warningData.severity.slice(1), inline: true },
            { name: 'Category', value: warningData.category.charAt(0).toUpperCase() + warningData.category.slice(1), inline: true },
            { name: 'Warned At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setFooter({ text: `Case #${warningData.caseNumber} | NewLife SMP` })
        .setTimestamp();
    
    embed.addFields({
        name: '⚠️ Notice',
        value: 'Continued violations may result in further action including kicks or bans.',
        inline: false
    });
    
    return sendDm(client, discordId, { embeds: [embed] });
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
        
        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Player Warned`)
            .setColor(severityColors[warning.severity] || 0xFFA500)
            .addFields(
                { name: 'Discord User', value: `<@${warning.discordId}> (${warning.discordTag})`, inline: true },
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

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Ban a player from the server')
            .addStringOption(opt => opt
                .setName('target')
                .setDescription('Minecraft username or @Discord user')
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
                .setDescription('Platform (if banning by username)')
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
            const durationData = parseDuration(durationInput);
            if (!durationData) {
                return interaction.editReply({
                    content: 'Invalid duration format. Use formats like `1d`, `7d`, `30d`, `1h`, `30m`, or `perm` for permanent.'
                });
            }

            let primaryProfile = null;
            let discordId = null;
            let discordUser = null;
            let linkedAccounts = [];

            // Check if target is a Discord mention
            const mentionMatch = target.match(/<@!?(\d+)>/);
            if (mentionMatch) {
                discordId = mentionMatch[1];
                
                try {
                    discordUser = await client.users.fetch(discordId);
                } catch (e) {
                    return interaction.editReply({ content: 'Could not find that Discord user.' });
                }
                
                // Get linked accounts for this Discord user
                linkedAccounts = await getAllLinkedAccounts(discordId);
                
                if (linkedAccounts.length === 0) {
                    return interaction.editReply({ 
                        content: 'This Discord user has no linked Minecraft accounts.' 
                    });
                }
                
                // Use first account as primary - also lookup fresh profile to ensure we have correct data
                const primary = linkedAccounts[0];
                const freshProfile = await lookupMcProfile(primary.minecraftUsername, primary.platform);
                
                if (freshProfile) {
                    primaryProfile = {
                        uuid: normalizeUuid(freshProfile.uuid),
                        name: freshProfile.name,
                        platform: freshProfile.platform
                    };
                } else {
                    primaryProfile = {
                        uuid: normalizeUuid(primary.uuid),
                        name: primary.minecraftUsername,
                        platform: primary.platform
                    };
                }
            } else {
                // Target is a Minecraft username - lookup profile
                primaryProfile = await lookupMcProfile(target, platformOption);
                
                if (!primaryProfile) {
                    // Try bedrock if java failed
                    if (platformOption === 'java') {
                        primaryProfile = await lookupMcProfile(target, 'bedrock');
                    }
                }
                
                if (!primaryProfile) {
                    return interaction.editReply({ 
                        content: `Could not find Minecraft account: **${target}**\n\nTry specifying the platform with the \`platform\` option.` 
                    });
                }
                
                // Normalize the UUID
                primaryProfile.uuid = normalizeUuid(primaryProfile.uuid);
                
                // Find linked accounts from this UUID
                linkedAccounts = await getAllLinkedAccounts(null, primaryProfile.uuid);
                
                if (linkedAccounts.length > 0) {
                    discordId = linkedAccounts[0].discordId;
                    try {
                        discordUser = await client.users.fetch(discordId);
                    } catch (e) {
                        // Discord user not found, continue without
                    }
                }
            }

            // Check if already banned
            const existingBan = await ServerBan.findActiveBan(primaryProfile.uuid);
            if (existingBan) {
                return interaction.editReply({
                    content: `**${primaryProfile.name}** is already banned.\n**Reason:** ${existingBan.reason}\n**Expires:** ${existingBan.isPermanent ? 'Never (Permanent)' : `<t:${Math.floor(existingBan.expiresAt.getTime() / 1000)}:R>`}`
                });
            }

            // Collect all UUIDs to ban (normalized)
            const bannedUuids = [primaryProfile.uuid];
            for (const account of linkedAccounts) {
                const normalizedAccUuid = normalizeUuid(account.uuid);
                if (!bannedUuids.includes(normalizedAccUuid)) {
                    bannedUuids.push(normalizedAccUuid);
                }
            }

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

            // Send DM to banned user (works for both Discord mention and MC username if linked)
            if (discordId) {
                await sendBanDm(client, discordId, {
                    reason,
                    isPermanent: durationData.isPermanent,
                    durationDisplay: durationData.display,
                    expiresAt: durationData.expiresAt
                });
            }

            // Kick all linked players from the proxy with "Ban loading..." message and create Kick records
            const kickedPlayers = [];
            for (const account of linkedAccounts) {
                const kicked = await kickFromProxy(account.minecraftUsername, 'Ban loading...');

                // Create Kick record
                try {
                    const { randomUUID } = require('crypto');
                    let kickCaseNumber = null;
                    try { kickCaseNumber = await getNextCaseNumber('kick'); } catch (e) { kickCaseNumber = null; }

                    const kickDoc = new Kick({
                        _id: randomUUID(),
                        caseNumber: kickCaseNumber,
                        primaryUuid: normalizeUuid(account.uuid || primaryProfile.uuid),
                        primaryUsername: account.minecraftUsername,
                        primaryPlatform: account.platform || primaryProfile.platform,
                        discordId: discordId || null,
                        discordTag: discordUser?.tag || null,
                        reason: 'Ban loading...',
                        staffId: interaction.user.id,
                        staffTag: interaction.user.tag,
                        kickedAt: new Date(),
                        rconExecuted: Boolean(kicked.success)
                    });

                    await kickDoc.save();

                    // Log the kick to the log channel
                    await logKick(client, kickDoc, [account]).catch(() => {});

                    console.log(`[ServerBan] Recorded kick for ${account.minecraftUsername} (rcon: ${kicked.success})`);
                } catch (e) {
                    console.error('[ServerBan] Failed to record kick:', e);
                }

                if (kicked.success) kickedPlayers.push(account.minecraftUsername);
            }

            // Also try to kick the primary profile if not in linked accounts
            if (!linkedAccounts.find(a => a.minecraftUsername.toLowerCase() === primaryProfile.name.toLowerCase())) {
                const kicked = await kickFromProxy(primaryProfile.name, 'Ban loading...');

                try {
                    const { randomUUID } = require('crypto');
                    let kickCaseNumber = null;
                    try { kickCaseNumber = await getNextCaseNumber('kick'); } catch (e) { kickCaseNumber = null; }

                    const kickDoc = new Kick({
                        _id: randomUUID(),
                        caseNumber: kickCaseNumber,
                        primaryUuid: normalizeUuid(primaryProfile.uuid),
                        primaryUsername: primaryProfile.name,
                        primaryPlatform: primaryProfile.platform,
                        discordId: discordId || null,
                        discordTag: discordUser?.tag || null,
                        reason: 'Ban loading...',
                        staffId: interaction.user.id,
                        staffTag: interaction.user.tag,
                        kickedAt: new Date(),
                        rconExecuted: Boolean(kicked.success)
                    });

                    await kickDoc.save();
                    await logKick(client, kickDoc, []).catch(() => {});

                    console.log(`[ServerBan] Recorded kick for ${primaryProfile.name} (rcon: ${kicked.success})`);
                } catch (e) {
                    console.error('[ServerBan] Failed to record kick for primary profile:', e);
                }

                if (kicked.success) kickedPlayers.push(primaryProfile.name);
            }

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
                    { name: 'Reason', value: reason, inline: false }
                )
                .setFooter({ text: `Case #${caseNumber || 'N/A'} | Banned by ${interaction.user.tag}` })
                .setTimestamp();

            if (discordUser) {
                embed.addFields({ name: 'Discord', value: `${discordUser.tag} (<@${discordId}>)`, inline: false });
            }

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
            .setName('unban')
            .setDescription('Unban a player from the server')
            .addStringOption(opt => opt
                .setName('target')
                .setDescription('Minecraft username or @Discord user')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for unbanning')
                .setRequired(false)
            )
            .addStringOption(opt => opt
                .setName('platform')
                .setDescription('Platform (if unbanning by username)')
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

            let primaryProfile = null;
            let discordId = null;
            let discordUser = null;
            let linkedAccounts = [];

            // Check if target is a Discord mention
            const mentionMatch = target.match(/<@!?(\d+)>/);
            if (mentionMatch) {
                discordId = mentionMatch[1];
                
                try {
                    discordUser = await client.users.fetch(discordId);
                } catch (e) {
                    return interaction.editReply({ content: 'Could not find that Discord user.' });
                }
                
                // Get linked accounts for this Discord user
                linkedAccounts = await getAllLinkedAccounts(discordId);
                
                if (linkedAccounts.length === 0) {
                    return interaction.editReply({ 
                        content: 'This Discord user has no linked Minecraft accounts.' 
                    });
                }
                
                // Use first account as primary
                const primary = linkedAccounts[0];
                const freshProfile = await lookupMcProfile(primary.minecraftUsername, primary.platform);
                
                if (freshProfile) {
                    primaryProfile = {
                        uuid: normalizeUuid(freshProfile.uuid),
                        name: freshProfile.name,
                        platform: freshProfile.platform
                    };
                } else {
                    primaryProfile = {
                        uuid: normalizeUuid(primary.uuid),
                        name: primary.minecraftUsername,
                        platform: primary.platform
                    };
                }
            } else {
                // Target is a Minecraft username - lookup profile
                primaryProfile = await lookupMcProfile(target, platformOption);
                
                if (!primaryProfile) {
                    // Try bedrock if java failed
                    if (platformOption === 'java') {
                        primaryProfile = await lookupMcProfile(target, 'bedrock');
                    }
                }
                
                if (!primaryProfile) {
                    // Try to find by username in existing bans
                    const existingBan = await ServerBan.findOne({
                        primaryUsername: { $regex: new RegExp(`^${target}$`, 'i') },
                        active: true
                    });
                    
                    if (existingBan) {
                        primaryProfile = {
                            uuid: existingBan.primaryUuid,
                            name: existingBan.primaryUsername,
                            platform: existingBan.primaryPlatform || 'java'
                        };
                        discordId = existingBan.discordId;
                    } else {
                        return interaction.editReply({ 
                            content: `Could not find Minecraft account or active ban for: **${target}**` 
                        });
                    }
                }
                
                if (primaryProfile) {
                    // Normalize the UUID
                    primaryProfile.uuid = normalizeUuid(primaryProfile.uuid);
                    
                    // Find linked accounts from this UUID
                    linkedAccounts = await getAllLinkedAccounts(null, primaryProfile.uuid);
                    
                    if (linkedAccounts.length > 0 && !discordId) {
                        discordId = linkedAccounts[0].discordId;
                        try {
                            discordUser = await client.users.fetch(discordId);
                        } catch (e) {
                            // Discord user not found, continue without
                        }
                    }
                }
            }

            // Collect all UUIDs to unban
            const uuidsToUnban = [primaryProfile.uuid];
            for (const account of linkedAccounts) {
                const normalizedAccUuid = normalizeUuid(account.uuid);
                if (!uuidsToUnban.includes(normalizedAccUuid)) {
                    uuidsToUnban.push(normalizedAccUuid);
                }
            }

            // Find and unban ALL active bans for these UUIDs
            const unbannedBans = [];
            for (const uuid of uuidsToUnban) {
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

            if (discordUser) {
                embed.addFields({ name: 'Discord', value: `${discordUser.tag} (<@${discordId}>)`, inline: false });
            }

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
            .setDescription('Kick a player from the server')
            .addStringOption(opt => opt
                .setName('target')
                .setDescription('Minecraft username or @Discord user')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for the kick')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('platform')
                .setDescription('Platform (if kicking by username)')
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

            let primaryProfile = null;
            let discordId = null;
            let discordUser = null;
            let linkedAccounts = [];

            // Check if target is a Discord mention
            const mentionMatch = target.match(/<@!?(\d+)>/);
            if (mentionMatch) {
                discordId = mentionMatch[1];
                
                try {
                    discordUser = await client.users.fetch(discordId);
                } catch (e) {
                    return interaction.editReply({ content: 'Could not find that Discord user.' });
                }
                
                // Get linked accounts for this Discord user
                linkedAccounts = await getAllLinkedAccounts(discordId);
                
                if (linkedAccounts.length === 0) {
                    return interaction.editReply({ 
                        content: 'This Discord user has no linked Minecraft accounts.' 
                    });
                }
                
                const primary = linkedAccounts[0];
                const freshProfile = await lookupMcProfile(primary.minecraftUsername, primary.platform);
                
                if (freshProfile) {
                    primaryProfile = {
                        uuid: normalizeUuid(freshProfile.uuid),
                        name: freshProfile.name,
                        platform: freshProfile.platform
                    };
                } else {
                    primaryProfile = {
                        uuid: normalizeUuid(primary.uuid),
                        name: primary.minecraftUsername,
                        platform: primary.platform
                    };
                }
            } else {
                // Target is a Minecraft username - lookup profile
                primaryProfile = await lookupMcProfile(target, platformOption);
                
                if (!primaryProfile) {
                    if (platformOption === 'java') {
                        primaryProfile = await lookupMcProfile(target, 'bedrock');
                    }
                }
                
                if (!primaryProfile) {
                    return interaction.editReply({ 
                        content: `Could not find Minecraft account: **${target}**\n\nTry specifying the platform with the \`platform\` option.` 
                    });
                }
                
                primaryProfile.uuid = normalizeUuid(primaryProfile.uuid);
                
                linkedAccounts = await getAllLinkedAccounts(null, primaryProfile.uuid);
                
                if (linkedAccounts.length > 0) {
                    discordId = linkedAccounts[0].discordId;
                    try {
                        discordUser = await client.users.fetch(discordId);
                    } catch (e) {
                        // Discord user not found, continue without
                    }
                }
            }

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

            // Execute the kick via proxy RCON
            const kickResult = await kickFromProxy(primaryProfile.name, reason);
            kick.rconExecuted = kickResult.success;

            // Also kick all linked accounts
            for (const account of linkedAccounts) {
                if (account.minecraftUsername.toLowerCase() !== primaryProfile.name.toLowerCase()) {
                    await kickFromProxy(account.minecraftUsername, reason);
                }
            }

            await kick.save();

            // Send DM to kicked user
            if (discordId) {
                await sendKickDm(client, discordId, { reason });
            }

            // Log to channel
            await logKick(client, kick, linkedAccounts);

            // Build response embed
            const embed = new EmbedBuilder()
                .setTitle('Player Kicked')
                .setColor(0xFFA500)
                .addFields(
                    { name: 'Player', value: `**${primaryProfile.name}**`, inline: true },
                    { name: 'Platform', value: primaryProfile.platform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                    { name: 'RCON', value: kickResult.success ? 'Success' : 'Failed', inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setFooter({ text: `Case #${caseNumber || 'N/A'} | Kicked by ${interaction.user.tag}` })
                .setTimestamp();

            if (discordUser) {
                embed.addFields({ name: 'Discord', value: `${discordUser.tag} (<@${discordId}>)`, inline: false });
            }

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
            .setDescription('Warn a Discord user')
            .addUserOption(opt => opt
                .setName('target')
                .setDescription('Discord user to warn')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for the warning')
                .setRequired(true)
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

            const targetUser = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason');
            const severity = interaction.options.getString('severity') || 'moderate';
            const category = interaction.options.getString('category') || 'other';

            const discordId = targetUser.id;
            const discordTag = targetUser.tag;

            // Get linked accounts for this user
            const linkedAccounts = await getAllLinkedAccounts(discordId);

            let primaryProfile = null;
            if (linkedAccounts.length > 0) {
                const primary = linkedAccounts[0];
                const freshProfile = await lookupMcProfile(primary.minecraftUsername, primary.platform);
                
                if (freshProfile) {
                    primaryProfile = {
                        uuid: normalizeUuid(freshProfile.uuid),
                        name: freshProfile.name,
                        platform: freshProfile.platform
                    };
                } else {
                    primaryProfile = {
                        uuid: normalizeUuid(primary.uuid),
                        name: primary.minecraftUsername,
                        platform: primary.platform
                    };
                }
            }

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
                discordId,
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

            // Send DM to warned user
            let dmSent = false;
            try {
                const dmResult = await sendWarningDm(client, discordId, {
                    reason,
                    severity,
                    category,
                    caseNumber
                });
                dmSent = dmResult;
                warning.dmSent = dmSent;
                await warning.save();
            } catch (e) {
                console.error('Failed to send warning DM:', e);
            }

            // Log to channel
            await logWarning(client, warning, linkedAccounts);

            // Get total active warnings for this user
            const totalWarnings = await Warning.countActiveWarnings(discordId);

            // Build response embed
            const severityColors = {
                minor: 0xFFFF00,
                moderate: 0xFFA500,
                severe: 0xFF4444
            };

            const embed = new EmbedBuilder()
                .setTitle('⚠️ Warning Issued')
                .setColor(severityColors[severity] || 0xFFA500)
                .addFields(
                    { name: 'User', value: `${discordTag} (<@${discordId}>)`, inline: true },
                    { name: 'Severity', value: severity.charAt(0).toUpperCase() + severity.slice(1), inline: true },
                    { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1), inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Total Warnings', value: `${totalWarnings}`, inline: true },
                    { name: 'DM Sent', value: dmSent ? 'Yes' : 'No', inline: true }
                )
                .setFooter({ text: `Case #${caseNumber} | Warned by ${interaction.user.tag}` })
                .setTimestamp();

            if (primaryProfile) {
                embed.addFields({ 
                    name: 'Minecraft Account', 
                    value: `**${primaryProfile.name}** (${primaryProfile.platform})`, 
                    inline: false 
                });
            }

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
            .setName('warnings')
            .setDescription('View warnings for a user')
            .addUserOption(opt => opt
                .setName('target')
                .setDescription('Discord user to check')
                .setRequired(true)
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

            const targetUser = interaction.options.getUser('target');
            const includeRemoved = interaction.options.getBoolean('include_removed') || false;

            const warnings = await Warning.getUserWarnings(targetUser.id, includeRemoved);

            if (warnings.length === 0) {
                return interaction.editReply({ 
                    content: `**${targetUser.tag}** has no${includeRemoved ? '' : ' active'} warnings.` 
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Warnings: ${targetUser.tag}`)
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
                    { name: 'User', value: `<@${warning.discordId}>`, inline: true },
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

module.exports = {
    name: 'ServerBans',
    slashCommands,
    lookupMcProfile,
    getAllLinkedAccounts
};
