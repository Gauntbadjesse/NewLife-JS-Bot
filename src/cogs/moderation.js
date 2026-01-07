/**
 * Moderation Cog
 * Implements prefix moderation commands: ban, unban, kick, mute, unmute, lock, unlock
 */

const { randomUUID } = require('crypto');
const Ban = require('../database/models/Ban');
const Warning = require('../database/models/Warning');
const { getNextCaseNumber } = require('../database/caseCounter');
const {
    createErrorEmbed,
    createSuccessEmbed,
    createWarningEmbed,
    createBanEmbed,
    createWarningDMEmbed,
    createBanDMEmbed,
    createHistoryEmbed
} = require('../utils/embeds');
const { isAdmin, isModerator } = require('../utils/permissions');
const { testProxyConnection } = require('../utils/rcon');

// Duration parser: accepts formats like 10m, 1h, 2d or minutes as number
function parseDuration(str) {
    if (!str) return 10 * 60 * 1000; // default 10 minutes
    const match = String(str).toLowerCase().match(/^(\d+)(s|m|h|d)?$/);
    if (!match) return 10 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2] || 'm';
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return value * 60 * 1000;
    }
}

/**
 * Helper: resolve a guild member from an argument (mention or id)
 */
async function resolveMember(message, arg) {
    if (!arg) return null;
    // Mentioned member
    const mentioned = message.mentions.members?.first();
    if (mentioned) return mentioned;

    // Try fetch by ID
    try {
        const byId = await message.guild.members.fetch(arg).catch(() => null);
        if (byId) return byId;
    } catch (e) {
        // ignore
    }

    // Try by username (simple search)
    const lower = arg.toLowerCase();
    const found = message.guild.members.cache.find(m => m.user.username.toLowerCase() === lower || `${m.user.username.toLowerCase()}#${m.user.discriminator}` === lower);
    return found || null;
}

const commands = {
    // !ban <user|id|name> <reason>
    ban: {
        name: 'ban',
        description: 'Ban a Discord member (Admin+)',
        usage: '!ban <user> <reason>',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')], allowedMentions: { repliedUser: false } });
            }

            if (!args[0]) return message.reply({ embeds: [createErrorEmbed('Missing Argument', 'Please provide a user to ban.')], allowedMentions: { repliedUser: false } });

            const targetArg = args[0];
            const reason = args.slice(1).join(' ') || 'No reason provided';

            const member = await resolveMember(message, targetArg);

            const caseId = randomUUID();
            const caseNumber = await getNextCaseNumber();

            try {
                if (member) {
                    await message.guild.members.ban(member, { reason });

                    // Create ban record in DB
                    const ban = new Ban({
                        _id: caseId,
                        caseNumber,
                        uuid: member.id,
                        playerName: `${member.user.tag}`,
                        staffUuid: message.author.id,
                        staffName: message.author.tag,
                        reason: reason,
                        createdAt: new Date(),
                        active: true
                    });

                    await ban.save();

                    // Respond with single-line case message
                    await message.channel.send(`**Case #${ban.caseNumber} - ${member.user.tag}** (id: ${ban._id}) has been banned.`);
                } else {
                    // No guild member found, still record a ban entry (use provided string as playerName)
                    const ban = new Ban({
                        _id: caseId,
                        caseNumber,
                        uuid: 'discord-issued',
                        playerName: targetArg,
                        staffUuid: message.author.id,
                        staffName: message.author.tag,
                        reason: reason,
                        createdAt: new Date(),
                        active: true
                    });

                    await ban.save();
                    await message.channel.send(`**Case #${ban.caseNumber} - ${targetArg}** (id: ${ban._id}) has been recorded as banned (member not found on guild).`);
                }
            } catch (error) {
                console.error('Error executing ban:', error);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to ban the user.')], allowedMentions: { repliedUser: false } });
            } finally {
                // Attempt to delete invoking message
                try { await message.delete(); } catch (e) { /* ignore */ }
            }
        }
    },

    // !rcon - test proxy RCON connection (Admin+)
    rcon: {
        name: 'rcon',
        description: 'Test Velocity proxy RCON connection (Admin+)',
        usage: '!rcon',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')], allowedMentions: { repliedUser: false } });
            }

            try {
                await message.channel.send('Testing proxy RCON connection...');
                const result = await testProxyConnection();

                if (result.success) {
                    await message.channel.send({ embeds: [createSuccessEmbed('Proxy RCON OK', `${result.response}`)] });
                } else {
                    await message.channel.send({ embeds: [createErrorEmbed('Proxy RCON Failed', `${result.response}`)] });
                }

                // Log to configured log channel
                const logChannelId = process.env.LOG_CHANNEL_ID;
                if (logChannelId) {
                    try {
                        const ch = await client.channels.fetch(logChannelId).catch(() => null);
                        if (ch) {
                            const embed = new (require('discord.js').EmbedBuilder)()
                                .setTitle('Proxy RCON Test')
                                .setColor(result.success ? 0x57F287 : 0xff4444)
                                .addFields(
                                    { name: 'Initiated By', value: `${message.author.tag} (<@${message.author.id}>)`, inline: false },
                                    { name: 'Result', value: result.success ? 'Success' : 'Failure', inline: true },
                                    { name: 'Response', value: `${result.response}`.substring(0, 1000), inline: false }
                                )
                                .setTimestamp();

                            await ch.send({ embeds: [embed] }).catch(() => {});
                        }
                    } catch (e) { console.error('Failed to log proxy rcon test:', e); }
                }

            } catch (e) {
                console.error('Error testing proxy rcon:', e);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to test proxy RCON.')], allowedMentions: { repliedUser: false } });
            } finally {
                try { await message.delete(); } catch (e) { /* ignore */ }
            }
        }
    },

    // !unban <userId|tag>
    unban: {
        name: 'unban',
        description: 'Unban a user (Admin+)',
        usage: '!unban <userId|username#discriminator>',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')], allowedMentions: { repliedUser: false } });
            }

            if (!args[0]) return message.reply({ embeds: [createErrorEmbed('Missing Argument', 'Please provide a user ID or tag to unban.')], allowedMentions: { repliedUser: false } });

            const target = args[0];
            try {
                // Try to parse as ID
                const idCandidate = target.replace(/[<>@!]/g, '');

                await message.guild.bans.remove(idCandidate).catch(() => null);

                // Find latest active ban in DB for this user id or tag
                const ban = await Ban.findOne({ $or: [{ uuid: idCandidate }, { playerName: target }], active: true }).sort({ createdAt: -1 });

                if (ban) {
                    ban.active = false;
                    ban.removedBy = message.author.tag;
                    ban.removedAt = new Date();
                    await ban.save();
                    await message.channel.send(`**Case #${ban.caseNumber} - ${ban.playerName}** (id: ${ban._id}) has been unbanned.`);
                } else {
                    await message.channel.send(`User \`${target}\` has been unbanned (no active DB record found).`);
                }
            } catch (error) {
                console.error('Error unbanning:', error);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to unban the user.')], allowedMentions: { repliedUser: false } });
            } finally {
                try { await message.delete(); } catch (e) { /* ignore */ }
            }
        }
    },

    // !kick <user> <reason>
    kick: {
        name: 'kick',
        description: 'Kick a Discord member (Admin+)',
        usage: '!kick <user> <reason>',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')], allowedMentions: { repliedUser: false } });
            }

            if (!args[0]) return message.reply({ embeds: [createErrorEmbed('Missing Argument', 'Please provide a user to kick.')], allowedMentions: { repliedUser: false } });

            const targetArg = args[0];
            const reason = args.slice(1).join(' ') || 'No reason provided';
            const member = await resolveMember(message, targetArg);
            const caseId = randomUUID();
            const caseNumber = await getNextCaseNumber();

            try {
                if (!member) return message.reply({ embeds: [createErrorEmbed('Not Found', 'Member not found.')], allowedMentions: { repliedUser: false } });

                await member.kick(reason);
                await message.channel.send(`**Case #${caseNumber} - ${member.user.tag}** (id: ${caseId}) has been kicked.`);
            } catch (error) {
                console.error('Error kicking member:', error);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to kick the user.')], allowedMentions: { repliedUser: false } });
            } finally {
                try { await message.delete(); } catch (e) { /* ignore */ }
            }
        }
    },

    // !mute <user> [duration] [reason]
    // Uses Discord timeout (milliseconds). Duration formats: 10m,1h,2d. Default 10m.
    mute: {
        name: 'mute',
        description: 'Timeout a member (Moderator+)',
        usage: '!mute <user> [duration] [reason]',
        async execute(message, args, client) {
            if (!isModerator(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')], allowedMentions: { repliedUser: false } });
            }

            if (!args[0]) return message.reply({ embeds: [createErrorEmbed('Missing Argument', 'Please provide a user to mute.')], allowedMentions: { repliedUser: false } });

            const member = await resolveMember(message, args[0]);
            if (!member) return message.reply({ embeds: [createErrorEmbed('Not Found', 'Member not found.')], allowedMentions: { repliedUser: false } });

            // optional duration
            let durationMs = parseDuration(args[1]);
            let reason = '';
            if (args.length >= 3) {
                // args[1] was duration, rest is reason
                reason = args.slice(2).join(' ');
            } else {
                reason = args.slice(1).join(' ') || 'Muted by staff';
            }

            // cap to Discord timeout max (28 days)
            const MAX = 28 * 24 * 60 * 60 * 1000;
            if (durationMs > MAX) durationMs = MAX;

            const caseId = randomUUID();

            try {
                await member.timeout(durationMs, `${message.author.tag}: ${reason}`);

                // Create a warning record to represent the mute so it can be pardoned
                const warning = new Warning({
                    _id: caseId,
                    caseNumber,
                    uuid: member.id,
                    playerName: member.user.tag,
                    staffUuid: message.author.id,
                    staffName: message.author.tag,
                    reason: `Mute: ${reason}`,
                    createdAt: new Date(),
                    active: true
                });
                await warning.save();

                // DM the user
                try {
                    const u = await client.users.fetch(member.id).catch(() => null);
                    if (u) await u.send({ embeds: [createWarningDMEmbed(warning)] }).catch(() => null);
                } catch (e) { /* ignore DM failures */ }

                await message.channel.send(`**Case #${warning.caseNumber} - ${member.user.tag}** (id: ${warning._id}) has been muted for ${Math.round(durationMs/60000)} minute(s).`);
            } catch (error) {
                console.error('Error timing out member:', error);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to timeout (mute) the user.')], allowedMentions: { repliedUser: false } });
            } finally {
                try { await message.delete(); } catch (e) { /* ignore */ }
            }
        }
    },

    // !unmute <user>
    unmute: {
        name: 'unmute',
        description: 'Remove timeout from a member (Moderator+)',
        usage: '!unmute <user>',
        async execute(message, args, client) {
            if (!isModerator(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')], allowedMentions: { repliedUser: false } });
            }

            if (!args[0]) return message.reply({ embeds: [createErrorEmbed('Missing Argument', 'Please provide a user to unmute.')], allowedMentions: { repliedUser: false } });

            const member = await resolveMember(message, args[0]);
            const caseId = randomUUID();
            // caseNumber not needed for unmute message itself

            try {
                if (!member) return message.reply({ embeds: [createErrorEmbed('Not Found', 'Member not found.')], allowedMentions: { repliedUser: false } });

                await member.timeout(null, `Unmuted by ${message.author.tag}`);

                // Mark latest mute-warning as removed (reason starts with 'Mute:')
                const warn = await Warning.findOne({ uuid: member.id, active: true, reason: { $regex: '^Mute:' } }).sort({ createdAt: -1 });
                if (warn) {
                    warn.active = false;
                    warn.removedBy = message.author.tag;
                    warn.removedAt = new Date();
                    await warn.save();
                }

                // DM the user
                try {
                    const u = await client.users.fetch(member.id).catch(() => null);
                    if (u && warn) await u.send({ embeds: [createWarningDMEmbed(warn)] }).catch(() => null);
                } catch (e) { /* ignore */ }

                await message.channel.send(`**Unmute - ${member.user.tag}** (performed by ${message.author.tag}).`);
            } catch (error) {
                console.error('Error removing timeout from member:', error);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to unmute the user.')], allowedMentions: { repliedUser: false } });
            } finally {
                try { await message.delete(); } catch (e) { /* ignore */ }
            }
        }
    },

    // !case <id> - look up a case by ID
    case: {
        name: 'case',
        description: 'Look up a case by ID (Moderator+)',
        usage: '!case <id>',
        async execute(message, args, client) {
            if (!isModerator(message.member)) return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission.')], allowedMentions: { repliedUser: false } });
            if (!args[0]) return message.reply({ embeds: [createErrorEmbed('Missing Argument', 'Please provide a case ID.')], allowedMentions: { repliedUser: false } });

            const id = args[0];
            try {
                let warning = null;
                let ban = null;

                // Try by Mongo ID first
                warning = await Warning.findById(id);
                if (!warning && !isNaN(Number(id))) {
                    warning = await Warning.findOne({ caseNumber: Number(id) });
                }

                if (warning) return message.reply({ embeds: [createWarningEmbed(warning)], allowedMentions: { repliedUser: false } });

                // Try ban by Mongo ID or numeric caseNumber
                ban = await Ban.findById(id);
                if (!ban && !isNaN(Number(id))) {
                    ban = await Ban.findOne({ caseNumber: Number(id) });
                }

                if (ban) return message.reply({ embeds: [createBanEmbed(ban)], allowedMentions: { repliedUser: false } });

                return message.reply({ embeds: [createErrorEmbed('Not Found', `No case found with ID: \`${id}\``)], allowedMentions: { repliedUser: false } });
            } catch (e) {
                console.error('Error fetching case:', e);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to fetch case.')], allowedMentions: { repliedUser: false } });
            }
        }
    },

    // !pardon <case> - remove a case (Moderator+ for warnings, Admin+ for bans)
    pardon: {
        name: 'pardon',
        description: 'Pardon (remove) a case by ID',
        usage: '!pardon <case_id>',
        async execute(message, args, client) {
            if (!args[0]) return message.reply({ embeds: [createErrorEmbed('Missing Argument', 'Please provide a case ID.')], allowedMentions: { repliedUser: false } });
            const id = args[0];

            try {
                // Try to find warning by Mongo ID or numeric caseNumber
                let warning = await Warning.findById(id);
                if (!warning && !isNaN(Number(id))) warning = await Warning.findOne({ caseNumber: Number(id) });
                if (warning) {
                    // only Moderator+ can pardon warnings
                    if (!isModerator(message.member)) return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to pardon warnings.')], allowedMentions: { repliedUser: false } });
                    warning.active = false;
                    warning.removedBy = message.author.tag;
                    warning.removedAt = new Date();
                    await warning.save();

                    // DM the user
                    try {
                        const u = await client.users.fetch(warning.uuid).catch(() => null);
                        if (u) await u.send({ embeds: [createWarningDMEmbed(warning)] }).catch(() => null);
                    } catch (e) { }

                    await message.channel.send(`**Case #${warning.caseNumber} - ${warning.playerName}** (id: ${warning._id}) has been pardoned.`);
                    try { await message.delete(); } catch (e) { }
                    return;
                }

                // Try to find ban by Mongo ID or numeric caseNumber
                let ban = await Ban.findById(id);
                if (!ban && !isNaN(Number(id))) ban = await Ban.findOne({ caseNumber: Number(id) });
                if (ban) {
                    // only Admin+ can pardon bans
                    if (!isAdmin(message.member)) return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to pardon bans.')], allowedMentions: { repliedUser: false } });
                    ban.active = false;
                    ban.removedBy = message.author.tag;
                    ban.removedAt = new Date();
                    await ban.save();

                    // Attempt to unban on guild
                    try { await message.guild.bans.remove(ban.uuid).catch(() => null); } catch (e) { }

                    // DM the user
                    try {
                        const u = await client.users.fetch(ban.uuid).catch(() => null);
                        if (u) await u.send({ embeds: [createBanDMEmbed(ban)] }).catch(() => null);
                    } catch (e) { }

                    await message.channel.send(`**Case #${ban.caseNumber} - ${ban.playerName}** (id: ${ban._id}) has been pardoned (unbanned).`);
                    try { await message.delete(); } catch (e) { }
                    return;
                }

                return message.reply({ embeds: [createErrorEmbed('Not Found', `No case found with ID: \`${id}\``)], allowedMentions: { repliedUser: false } });
            } catch (e) {
                console.error('Error pardoning case:', e);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to pardon case.')], allowedMentions: { repliedUser: false } });
            }
        }
    },

    // !lookup <user> - show stats and moderation cases for a user
    lookup: {
        name: 'lookup',
        description: 'Show user moderation stats and cases (Moderator+)',
        usage: '!lookup <user>',
        async execute(message, args, client) {
            if (!isModerator(message.member)) return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission.')], allowedMentions: { repliedUser: false } });
            if (!args[0]) return message.reply({ embeds: [createErrorEmbed('Missing Argument', 'Please provide a user to lookup.')], allowedMentions: { repliedUser: false } });

            const targetArg = args[0];
            const member = await resolveMember(message, targetArg);
            let uuid = null;
            let displayName = targetArg;
            if (member) {
                uuid = member.id;
                displayName = member.user.tag;
            }

            try {
                const warnings = uuid ? await Warning.find({ uuid }).sort({ createdAt: -1 }) : await Warning.find({ playerName: { $regex: new RegExp(`^${targetArg}$`, 'i') } }).sort({ createdAt: -1 });
                const bans = uuid ? await Ban.find({ uuid }).sort({ createdAt: -1 }) : await Ban.find({ playerName: { $regex: new RegExp(`^${targetArg}$`, 'i') } }).sort({ createdAt: -1 });

                return message.reply({ embeds: [createHistoryEmbed(displayName, warnings, bans)], allowedMentions: { repliedUser: false } });
            } catch (e) {
                console.error('Error during lookup:', e);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to lookup user.')], allowedMentions: { repliedUser: false } });
            }
        }
    },

    // !lock - lock current channel (Admin+)
    lock: {
        name: 'lock',
        description: 'Lock the current channel to prevent sending messages (Admin+)',
        usage: '!lock',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')], allowedMentions: { repliedUser: false } });
            }

            try {
                await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
                await message.channel.send('Channel has been locked.');
            } catch (error) {
                console.error('Error locking channel:', error);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to lock the channel.')], allowedMentions: { repliedUser: false } });
            } finally {
                try { await message.delete(); } catch (e) { /* ignore */ }
            }
        }
    },

    // !unlock - unlock current channel (Admin+)
    unlock: {
        name: 'unlock',
        description: 'Unlock the current channel (Admin+)',
        usage: '!unlock',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')], allowedMentions: { repliedUser: false } });
            }

            try {
                await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
                await message.channel.send('Channel has been unlocked.');
            } catch (error) {
                console.error('Error unlocking channel:', error);
                return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to unlock the channel.')], allowedMentions: { repliedUser: false } });
            } finally {
                try { await message.delete(); } catch (e) { /* ignore */ }
            }
        }
    }
};

module.exports = { commands };
