/**
 * General Cog
 * Handles help, history, and utility commands for NewLife Management Bot
 * 
 * Commands:
 * - !help: Everyone
 * - !history: Staff+
 * - !lookup: Moderator+
 * - !stats: Admin+
 * - !ping: Everyone
 * - !update: Owner only - Pull latest from git and restart
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Warning = require('../database/models/Warning');
const Ban = require('../database/models/Ban');
const Infraction = require('../database/models/Infraction');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const path = require('path');
const { 
    createHistoryEmbed, 
    createErrorEmbed,
    getEmbedColor
} = require('../utils/embeds');
const { isStaff, isAdmin, isModerator, isSupervisor, isManagement, isOwner } = require('../utils/permissions');

/**
 * Prefix Commands
 */
const commands = {
    // !help - Show all available commands
    help: {
        name: 'help',
        description: 'Show all available commands',
        usage: '!help [command]',
        async execute(message, args, client) {
            const prefix = process.env.BOT_PREFIX || '!';
            const member = message.member;

            if (args[0]) {
                // Show specific command help
                const commandName = args[0].toLowerCase();
                const command = client.commands.get(commandName);

                if (!command) {
                    return message.reply({
                        embeds: [createErrorEmbed('Command Not Found', `No command found with name: \`${commandName}\``)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(getEmbedColor())
                    .setTitle(`Command: ${prefix}${command.name}`)
                    .setDescription(command.description || 'No description available')
                    .addFields({
                        name: 'Usage',
                        value: `\`${command.usage || `${prefix}${command.name}`}\``,
                        inline: false
                    })
                    .setFooter({ text: 'NewLife Management' })
                    .setTimestamp();

                return message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                });
            }

            // Build permission-filtered help
            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('NewLife Management Commands')
                .setDescription(`Use \`${prefix}help <command>\` for detailed information about a specific command.`)
                .setFooter({ text: 'NewLife Management' })
                .setTimestamp();

            // Everyone commands
            const everyoneCommands = [
                `\`${prefix}help [command]\` - Show this help menu`,
                `\`${prefix}ping\` - Check bot latency`,
                `\`${prefix}kingdom\` - Kingdom management`
            ];
            embed.addFields({ name: 'General Commands', value: everyoneCommands.join('\n'), inline: false });

            // Staff+ commands
            if (isStaff(member)) {
                const staffCommands = [
                    `\`${prefix}embed <rules|guru>\` - Send a preset embed`,
                    `\`${prefix}dm guru @user\` - DM the guru guide to a user`
                ];
                embed.addFields({ name: 'Staff Commands', value: staffCommands.join('\n'), inline: false });
            }

            // Moderator+ commands
            if (isModerator(member)) {
                const modCommands = [
                    `\`${prefix}warn <case_id>\` - Look up a warning by ID`,
                    `\`${prefix}warnings <player> [page]\` - List player warnings`,
                    `\`${prefix}activewarnings [page]\` - List all active warnings`,
                    `\`${prefix}recentwarnings [count]\` - Show recent warnings`,
                    `\`${prefix}punishwarn <player> <reason>\` - Warn a player via RCON`,
                    `\`${prefix}history <player>\` - Show player's full history`,
                    `\`${prefix}lookup <case_id>\` - Look up any case by ID`,
                    `\`${prefix}checkban <player>\` - Check if player is banned`
                ];
                embed.addFields({ name: 'Moderator Commands', value: modCommands.join('\n'), inline: false });
            }

            // Admin+ commands
            if (isAdmin(member)) {
                const adminCommands = [
                    `\`${prefix}ban <case_id>\` - Look up a ban by ID`,
                    `\`${prefix}bans <player> [page]\` - List player bans`,
                    `\`${prefix}activebans [page]\` - List all active bans`,
                    `\`${prefix}recentbans [count]\` - Show recent bans`,
                    `\`${prefix}punishban <player> <reason>\` - Ban a player via RCON`,
                    `\`${prefix}stats\` - Show database statistics`
                ];
                embed.addFields({ name: 'Admin Commands', value: adminCommands.join('\n'), inline: false });
            }

            // Owner commands
            if (isOwner(member)) {
                const ownerCommands = [
                    `\`${prefix}update\` - Pull latest from git and restart`
                ];
                embed.addFields({ name: 'Owner Commands', value: ownerCommands.join('\n'), inline: false });
            }

            return message.reply({
                embeds: [embed],
                allowedMentions: { repliedUser: false }
            });
        }
    },

    // !history <player_name> - Show full player history
    history: {
        name: 'history',
        description: 'Show a player\'s full punishment history',
        usage: '!history <player_name>',
        async execute(message, args, client) {
            // Check staff permissions
            if (!isStaff(message.member)) {
                return message.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    allowedMentions: { repliedUser: false }
                });
            }

            if (!args[0]) {
                return message.reply({
                    embeds: [createErrorEmbed('Missing Argument', 'Please provide a player name.\n\n**Usage:** `!history <player_name>`')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const playerName = args[0];

            try {
                const warnings = await Warning.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                }).sort({ createdAt: -1 });

                const bans = await Ban.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                }).sort({ createdAt: -1 });

                if (warnings.length === 0 && bans.length === 0) {
                    return message.reply({
                        embeds: [createErrorEmbed('No History', `No punishment history found for player: \`${playerName}\``)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                return message.reply({
                    embeds: [createHistoryEmbed(playerName, warnings, bans)],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching history:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch player history.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !lookup <case_id> - Look up any case by ID
    lookup: {
        name: 'lookup',
        description: 'Look up any case (warning or ban) by ID',
        usage: '!lookup <case_id>',
        async execute(message, args, client) {
            // Check staff permissions
            if (!isStaff(message.member)) {
                return message.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    allowedMentions: { repliedUser: false }
                });
            }

            if (!args[0]) {
                return message.reply({
                    embeds: [createErrorEmbed('Missing Argument', 'Please provide a case ID.\n\n**Usage:** `!lookup <case_id>`')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const caseId = args[0];

            try {
                // Try to find as warning first (by _id or numeric caseNumber)
                let warning = await Warning.findById(caseId);
                if (!warning && !isNaN(Number(caseId))) warning = await Warning.findOne({ caseNumber: Number(caseId) });
                if (warning) {
                    const { createWarningEmbed } = require('../utils/embeds');
                    return message.reply({
                        embeds: [createWarningEmbed(warning)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                // Try to find as ban (by _id or numeric caseNumber)
                let ban = await Ban.findById(caseId);
                if (!ban && !isNaN(Number(caseId))) ban = await Ban.findOne({ caseNumber: Number(caseId) });
                if (ban) {
                    const { createBanEmbed } = require('../utils/embeds');
                    return message.reply({
                        embeds: [createBanEmbed(ban)],
                        allowedMentions: { repliedUser: false }
                    });
                }

                // Try to find as infraction (by _id or numeric caseNumber)
                let infraction = await Infraction.findById(caseId);
                if (!infraction && !isNaN(Number(caseId))) infraction = await Infraction.findOne({ caseNumber: Number(caseId) });
                if (infraction) {
                    const INFRACTION_TYPES = {
                        termination: { label: 'Termination', color: 0x8B0000 },
                        warning: { label: 'Warning', color: 0xFF4500 },
                        notice: { label: 'Notice', color: 0xFFD700 },
                        strike: { label: 'Strike', color: 0xDC143C }
                    };
                    const typeConfig = INFRACTION_TYPES[infraction.type];
                    const embed = new EmbedBuilder()
                        .setTitle(`Staff ${typeConfig.label} - Case #${infraction.caseNumber}`)
                        .setColor(typeConfig.color)
                        .addFields(
                            { name: 'Staff Member', value: `<@${infraction.targetId}>\n\`${infraction.targetTag}\``, inline: true },
                            { name: 'Type', value: `**${typeConfig.label}**`, inline: true },
                            { name: 'Date', value: `<t:${Math.floor(new Date(infraction.createdAt).getTime() / 1000)}:F>`, inline: true },
                            { name: 'Reason', value: infraction.reason, inline: false },
                            { name: 'Issued By', value: infraction.issuerNickname || infraction.issuerTag, inline: true },
                            { name: 'Status', value: infraction.active ? 'Active' : 'Revoked', inline: true }
                        )
                        .setFooter({ text: `Case #${infraction.caseNumber}` })
                        .setTimestamp(infraction.createdAt);
                    return message.reply({
                        embeds: [embed],
                        allowedMentions: { repliedUser: false }
                    });
                }

                return message.reply({
                    embeds: [createErrorEmbed('Not Found', `No case found with ID: \`${caseId}\``)],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error looking up case:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to look up case.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !stats - Show database statistics
    stats: {
        name: 'stats',
        description: 'Show database statistics',
        usage: '!stats',
        async execute(message, args, client) {
            // Check staff permissions
            if (!isStaff(message.member)) {
                return message.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    allowedMentions: { repliedUser: false }
                });
            }

            try {
                const totalWarnings = await Warning.countDocuments();
                const activeWarnings = await Warning.countDocuments({ active: true });
                const totalBans = await Ban.countDocuments();
                const activeBans = await Ban.countDocuments({ active: true });
                const totalInfractions = await Infraction.countDocuments();
                const activeInfractions = await Infraction.countDocuments({ active: true });

                // Get unique players
                const uniqueWarnedPlayers = await Warning.distinct('uuid');
                const uniqueBannedPlayers = await Ban.distinct('uuid');
                const uniqueInfractedStaff = await Infraction.distinct('targetId');

                const embed = new EmbedBuilder()
                    .setColor(getEmbedColor())
                    .setTitle('NewLife Management Statistics')
                    .addFields(
                        {
                            name: 'Warnings',
                            value: `**Total:** ${totalWarnings}\n**Active:** ${activeWarnings}\n**Unique Players:** ${uniqueWarnedPlayers.length}`,
                            inline: true
                        },
                        {
                            name: 'Bans',
                            value: `**Total:** ${totalBans}\n**Active:** ${activeBans}\n**Unique Players:** ${uniqueBannedPlayers.length}`,
                            inline: true
                        },
                        {
                            name: 'Staff Infractions',
                            value: `**Total:** ${totalInfractions}\n**Active:** ${activeInfractions}\n**Unique Staff:** ${uniqueInfractedStaff.length}`,
                            inline: true
                        },
                        {
                            name: 'Bot Info',
                            value: `**Uptime:** ${formatUptime(client.uptime)}\n**Servers:** ${client.guilds.cache.size}\n**Ping:** ${client.ws.ping}ms`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'NewLife Management | Statistics' })
                    .setTimestamp();

                return message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error fetching stats:', error);
                return message.reply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch statistics.')],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    },

    // !ping - Check bot latency
    ping: {
        name: 'ping',
        description: 'Check bot latency',
        usage: '!ping',
        async execute(message, args, client) {
            const sent = await message.reply({
                content: 'Pinging...',
                allowedMentions: { repliedUser: false }
            });

            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('Pong!')
                .addFields(
                    {
                        name: 'Bot Latency',
                        value: `\`${sent.createdTimestamp - message.createdTimestamp}ms\``,
                        inline: true
                    },
                    {
                        name: 'API Latency',
                        value: `\`${Math.round(client.ws.ping)}ms\``,
                        inline: true
                    }
                )
                .setFooter({ text: 'NewLife Management' })
                .setTimestamp();

            return sent.edit({
                content: null,
                embeds: [embed]
            });
        }
    },

    // !update - Pull latest code, install deps, and restart (Admin only)
    update: {
        name: 'update',
        description: 'Pull latest from git, install deps, and restart the bot (Admin only)',
        usage: '!update',
        async execute(message, args, client) {
            const ownerId = process.env.OWNER_USER_ID || process.env.BOT_OWNER_ID;
            if (!ownerId) {
                return message.reply({ embeds: [createErrorEmbed('Not Configured', 'OWNER_USER_ID is not set in the environment. Set it to the Discord user ID allowed to run `!update`.')], allowedMentions: { repliedUser: false } });
            }

            if (message.author.id !== String(ownerId)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only the configured bot owner can run this command.')], allowedMentions: { repliedUser: false } });
            }

            const repoDir = path.resolve(__dirname, '..', '..');
            const branch = process.env.GIT_BRANCH || 'main';
            // Build initial embed with step placeholders
            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('System Update')
                .setDescription(`Preparing update from **${branch}**...`)
                .setTimestamp()
                .addFields(
                    { name: 'Step 1', value: 'Fetching updates...', inline: true },
                    { name: 'Step 2', value: 'Pending...', inline: true },
                    { name: 'Step 3', value: 'Pending...', inline: true }
                );

            const status = await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });

            // Helper to update step text
            function updateSteps(stepResults) {
                const fields = [
                    { name: 'Step 1', value: stepResults[0], inline: true },
                    { name: 'Step 2', value: stepResults[1], inline: true },
                    { name: 'Step 3', value: stepResults[2], inline: true }
                ];
                embed.setFields(fields);
                return status.edit({ embeds: [embed] });
            }

            try {
                // Step 1: Fetch and reset
                await updateSteps(['Fetching...', 'Pending...', 'Pending...']);
                await execAsync(`git fetch --all`, { cwd: repoDir, timeout: 5 * 60 * 1000 });
                await execAsync(`git reset --hard origin/${branch}`, { cwd: repoDir, timeout: 5 * 60 * 1000 });

                // Get latest commit info
                let commitInfo = '';
                try {
                    const { stdout } = await execAsync(`git log -1 --pretty=format:%h\n%an\n%s`, { cwd: repoDir, timeout: 10 * 1000 });
                    const parts = stdout.split('\n');
                    commitInfo = `**${parts[0]}** — ${parts[2]}\nby ${parts[1]}`;
                } catch (e) {
                    commitInfo = 'Unable to read commit info';
                }

                await updateSteps([`Fetched updates\n${commitInfo}`, 'Applying changes', 'Installing dependencies']);

                // Step 3: Install dependencies
                await execAsync(`npm install --production`, { cwd: repoDir, timeout: 10 * 60 * 1000 });
                await updateSteps([`Fetched updates\n${commitInfo}`, 'Changes applied', 'Dependencies installed']);

                // Finalize
                embed.setColor(0x57F287); // green
                embed.setTitle('Update Complete');
                embed.setDescription(`Update from **${branch}** applied successfully. Restarting to activate changes...`);
                embed.setFooter({ text: 'Update complete — exiting to allow process manager restart' });

                await status.edit({ embeds: [embed], allowedMentions: { repliedUser: false } });

                // Delete the invoking command and the update embed after 5s, then exit so process manager can restart
                setTimeout(async () => {
                    try {
                        await message.delete().catch(() => {});
                        await status.delete().catch(() => {});
                    } catch (delErr) {
                        // ignore deletion errors
                    } finally {
                        process.exit(0);
                    }
                }, 5000);
            } catch (err) {
                console.error('Update failed:', err);
                const output = String(err.stderr || err.stdout || err.message || err).slice(0, 1800);
                embed.setColor(0xED4245); // red
                embed.setTitle('Update Failed');
                embed.setDescription('An error occurred while applying the update.');
                updateSteps(['Failed', 'Failed', 'Failed']).catch(() => {});
                await status.edit({ embeds: [embed], allowedMentions: { repliedUser: false } });
                // Send truncated error details as a followup to keep embed clean
                try {
                    await message.channel.send({ content: `Error details (truncated):\n\n${output}`, allowedMentions: { repliedUser: false } });
                } catch (sendErr) {
                    // ignore
                }
            }
        }
    },

    // !test1 - Apply permission overwrites so the unverified role cannot view any channels (Admin only)
    test1: {
        name: 'test1',
        description: 'Deny view access to all channels for the unverified role (Admin only)',
        usage: '!test1',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')], allowedMentions: { repliedUser: false } });
            }

            const roleId = process.env.UNVERIFIED_ROLE || '1454700802752118906';
            const statusMsg = await message.reply({ content: 'Updating channel permission overwrites for unverified role...', allowedMentions: { repliedUser: false } });

            try {
                for (const ch of message.guild.channels.cache.values()) {
                    try {
                        if (!ch || !ch.permissionOverwrites) continue;
                        await ch.permissionOverwrites.edit(roleId, { ViewChannel: false, SendMessages: false, ReadMessageHistory: false }).catch(() => {});
                    } catch (e) {
                        // ignore per-channel errors
                    }
                }

                await statusMsg.edit({ content: 'Permission overwrites applied to all channels.' });
            } catch (error) {
                console.error('Error applying test1 perms:', error);
                await statusMsg.edit({ content: 'Failed to apply permission overwrites to all channels.' }).catch(() => {});
            } finally {
                try { await message.delete(); } catch (e) { /* ignore */ }
            }
        }
    },

    // !temp2 - Add member role to all users (Owner only)
    temp2: {
        name: 'temp2',
        description: 'Add member role to all users in the server (Owner only)',
        usage: '!temp2',
        async execute(message, args, client) {
            if (!isOwner(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only the owner can run this command.')], allowedMentions: { repliedUser: false } });
            }

            const memberRoleId = '1374421919373328434';
            const statusMsg = await message.reply({ content: 'Adding member role to all users... This may take a while.', allowedMentions: { repliedUser: false } });

            try {
                // Fetch all members
                await message.guild.members.fetch();
                const members = message.guild.members.cache.filter(m => !m.user.bot);
                let added = 0;
                let skipped = 0;
                let failed = 0;

                for (const [, member] of members) {
                    if (member.roles.cache.has(memberRoleId)) {
                        skipped++;
                        continue;
                    }
                    try {
                        await member.roles.add(memberRoleId, 'Bulk member role assignment via !temp2');
                        added++;
                    } catch (e) {
                        failed++;
                    }

                    // Rate limit: 1 per 100ms
                    if (added % 10 === 0) {
                        await statusMsg.edit({ content: `Adding member role... ${added} added, ${skipped} already had it, ${failed} failed.` }).catch(() => {});
                        await new Promise(r => setTimeout(r, 100));
                    }
                }

                await statusMsg.edit({ content: `Done! Added member role to **${added}** users. **${skipped}** already had it. **${failed}** failed.` });
            } catch (error) {
                console.error('Error in temp2:', error);
                await statusMsg.edit({ content: 'Failed to add member role to users.' }).catch(() => {});
            }
        }
    },

    // !memberupdate - Update the member counter channel name (Admin only)
    memberupdate: {
        name: 'memberupdate',
        description: 'Update the member counter channel name (Admin only)',
        usage: '!memberupdate',
        async execute(message, args, client) {
            if (!isAdmin(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')], allowedMentions: { repliedUser: false } });
            }

            const memberCounterChannel = process.env.MEMBER_COUNTER_CHANNEL || '1437529792755794123';
            
            try {
                const ch = await message.guild.channels.fetch(memberCounterChannel).catch(() => null);
                if (!ch) {
                    return message.reply({ content: `Could not find counter channel: ${memberCounterChannel}`, allowedMentions: { repliedUser: false } });
                }
                
                if (typeof ch.setName !== 'function') {
                    return message.reply({ content: 'Counter channel does not support renaming.', allowedMentions: { repliedUser: false } });
                }
                
                const memberCount = message.guild.memberCount;
                await ch.setName(`Members: ${memberCount}`);
                
                return message.reply({ content: `Member counter updated! **Members: ${memberCount}**`, allowedMentions: { repliedUser: false } });
            } catch (error) {
                console.error('Error updating member counter:', error);
                return message.reply({ content: 'Failed to update member counter.', allowedMentions: { repliedUser: false } });
            }
        }
    },

    // !addkingdoms - Add the preset kingdoms to the database (Owner only)
    addkingdoms: {
        name: 'addkingdoms',
        description: 'Add preset kingdoms to the database (Owner only)',
        usage: '!addkingdoms',
        async execute(message, args, client) {
            if (!isOwner(message.member)) {
                return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only the owner can run this command.')], allowedMentions: { repliedUser: false } });
            }

            const statusMsg = await message.reply({ content: 'Adding kingdoms to database...', allowedMentions: { repliedUser: false } });

            try {
                const { getKingdomModel } = require('../database/models/Kingdom');
                const Kingdom = await getKingdomModel();
                
                const kingdoms = [
                    { guild_id: '1372672239245459498', name: 'builders league', leader_role_id: '1453163359469043812', member_role_id: '1453163231886708900', created_by: '1237471534541439068', created_at: new Date('2025-12-23T23:12:57.300Z') },
                    { guild_id: '1372672239245459498', name: 'themonarch', leader_role_id: '1453168137792131166', member_role_id: '1453167996980822086', created_by: '1237471534541439068', created_at: new Date('2025-12-24T00:04:54.742Z') },
                    { guild_id: '1372672239245459498', name: 'reaverking', leader_role_id: '1454195529612267737', member_role_id: '1454195395641999524', created_by: '1237471534541439068', created_at: new Date('2025-12-26T19:42:12.602Z') },
                    { guild_id: '1372672239245459498', name: 'northwatch', leader_role_id: '1454704723885031435', member_role_id: '1454704562589143051', created_by: '1237471534541439068', created_at: new Date('2025-12-28T05:18:13.655Z') },
                    { guild_id: '1372672239245459498', name: 'los craftos hermanos', leader_role_id: '1454705253462180025', member_role_id: '1454705158326980817', created_by: '1237471534541439068', created_at: new Date('2025-12-28T05:20:26.886Z') }
                ];
                
                let added = 0;
                let updated = 0;
                
                for (const k of kingdoms) {
                    const existing = await Kingdom.findOne({ guild_id: k.guild_id, name: k.name });
                    if (existing) {
                        await Kingdom.updateOne({ _id: existing._id }, k);
                        updated++;
                    } else {
                        await new Kingdom(k).save();
                        added++;
                    }
                }
                
                const total = await Kingdom.countDocuments({ guild_id: '1372672239245459498' });
                await statusMsg.edit({ content: `Done! Added **${added}** kingdoms, updated **${updated}** kingdoms. Total kingdoms: **${total}**` });
            } catch (error) {
                console.error('Error adding kingdoms:', error);
                await statusMsg.edit({ content: `Failed to add kingdoms: ${error.message}` }).catch(() => {});
            }
        }
    },

    // !m - Show online members or members in a role
    m: {
        name: 'm',
        description: 'Show online members or members in a specific role',
        usage: '!m [role name]',
        async execute(message, args, client) {
            try {
                // Fetch all members (without presence requirement)
                await message.guild.members.fetch().catch(() => {});

                if (args.length === 0) {
                    // Show online count and total server members
                    const allMembers = message.guild.members.cache.filter(m => !m.user.bot);
                    const totalMembers = allMembers.size;
                    const onlineCount = allMembers.filter(m => 
                        m.presence && ['online', 'idle', 'dnd'].includes(m.presence.status)
                    ).size;

                    const embed = new EmbedBuilder()
                        .setColor(getEmbedColor())
                        .setTitle('Server Members')
                        .setDescription(`**${message.guild.name}**`)
                        .addFields(
                            { name: 'Online', value: `${onlineCount}`, inline: true },
                            { name: 'Total', value: `${totalMembers}`, inline: true }
                        )
                        .setFooter({ text: 'NewLife SMP' })
                        .setTimestamp();

                    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
                } else {
                    // Show members in a role - fuzzy match
                    const input = args.join(' ').toLowerCase();
                    
                    // Get all roles and calculate similarity
                    const rolesArray = [];
                    message.guild.roles.cache.forEach(r => {
                        if (r.id !== message.guild.id) { // Exclude @everyone
                            rolesArray.push({
                                role: r,
                                name: r.name.toLowerCase(),
                                score: calculateSimilarity(input, r.name.toLowerCase())
                            });
                        }
                    });
                    rolesArray.sort((a, b) => b.score - a.score);

                    // Get the best match (must have some similarity)
                    const bestMatch = rolesArray[0];
                    if (!bestMatch || bestMatch.score < 0.2) {
                        return message.reply({ 
                            content: `No matching role found for: **${args.join(' ')}**`, 
                            allowedMentions: { repliedUser: false } 
                        });
                    }

                    const role = bestMatch.role;

                    // Get members with this role
                    const membersArray = [];
                    message.guild.members.cache.forEach(m => {
                        if (!m.user.bot && m.roles.cache.has(role.id)) {
                            membersArray.push(m);
                        }
                    });

                    const onlineCount = membersArray.filter(m => m.presence && ['online', 'idle', 'dnd'].includes(m.presence.status)).length;
                    const offlineCount = membersArray.length - onlineCount;

                    // Sort: online first, then by name
                    membersArray.sort((a, b) => {
                        const aOnline = a.presence && ['online', 'idle', 'dnd'].includes(a.presence.status);
                        const bOnline = b.presence && ['online', 'idle', 'dnd'].includes(b.presence.status);
                        if (aOnline && !bOnline) return -1;
                        if (!aOnline && bOnline) return 1;
                        return a.displayName.localeCompare(b.displayName);
                    });

                    // Build member list (max 30 shown)
                    const memberList = membersArray.slice(0, 30).map(m => {
                        const status = m.presence?.status;
                        const indicator = status === 'online' ? '🟢' : status === 'idle' ? '🟡' : status === 'dnd' ? '🔴' : '⚫';
                        return `${indicator} ${m.displayName}`;
                    }).join('\n');

                    const embed = new EmbedBuilder()
                        .setColor(role.color || getEmbedColor())
                        .setTitle(`Members with ${role.name}`)
                        .setDescription(memberList || 'No members')
                        .addFields(
                            { name: 'Online', value: `${onlineCount}`, inline: true },
                            { name: 'Offline', value: `${offlineCount}`, inline: true },
                            { name: 'Total', value: `${membersArray.length}`, inline: true }
                        )
                        .setFooter({ text: membersArray.length > 30 ? `Showing 30 of ${membersArray.length} members` : 'NewLife SMP' })
                        .setTimestamp();

                    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
                }
            } catch (error) {
                console.error('Error in !m command:', error);
                return message.reply({ content: `Error: ${error.message}`, allowedMentions: { repliedUser: false } });
            }
        }
    },
};

/**
 * Calculate similarity between two strings (0-1)
 * Uses a combination of includes check and Levenshtein-like scoring
 */
function calculateSimilarity(input, target) {
    // Exact match
    if (input === target) return 1;
    
    // Target starts with input
    if (target.startsWith(input)) return 0.9;
    
    // Target contains input
    if (target.includes(input)) return 0.7;
    
    // Input contains target
    if (input.includes(target)) return 0.6;
    
    // Calculate character overlap
    const inputChars = new Set(input.split(''));
    const targetChars = new Set(target.split(''));
    let overlap = 0;
    for (const char of inputChars) {
        if (targetChars.has(char)) overlap++;
    }
    const overlapScore = overlap / Math.max(inputChars.size, targetChars.size);
    
    // Check for word matches
    const inputWords = input.split(/\s+/);
    const targetWords = target.split(/\s+/);
    let wordMatches = 0;
    for (const word of inputWords) {
        if (targetWords.some(tw => tw.includes(word) || word.includes(tw))) {
            wordMatches++;
        }
    }
    const wordScore = inputWords.length > 0 ? wordMatches / inputWords.length : 0;
    
    return Math.max(overlapScore * 0.4, wordScore * 0.5);
}

/**
 * Format uptime to human readable string
 * @param {number} uptime - Uptime in milliseconds
 * @returns {string}
 */
function formatUptime(uptime) {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * Slash Commands
 */
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('help')
            .setDescription('Show all available commands'),
        async execute(interaction, client) {
            const prefix = process.env.BOT_PREFIX || '!';
            const member = interaction.member;

            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('NewLife Management Commands')
                .setDescription('All commands are available as both prefix and slash commands.')
                .setFooter({ text: 'NewLife Management' })
                .setTimestamp();

            // Everyone commands
            const everyoneCommands = [
                `\`/help\` - Show this help menu`,
                `\`/ping\` - Check bot latency`,
                `\`!kingdom\` - Kingdom management`
            ];
            embed.addFields({ name: 'General Commands', value: everyoneCommands.join('\n'), inline: false });

            // Moderator+ commands
            if (isModerator(member)) {
                const modCommands = [
                    `\`/warn case <id>\` - Look up a warning by ID`,
                    `\`/warn user <player> <reason>\` - Issue a warning`,
                    `\`/warnings <player>\` - List player warnings`,
                    `\`/history <player>\` - Show player's history`,
                    `\`/lookup <id>\` - Look up any case by ID`,
                    `\`/checkban <player>\` - Check if player is banned`
                ];
                embed.addFields({ name: 'Moderator Commands', value: modCommands.join('\n'), inline: false });
            }

            // Admin+ commands
            if (isAdmin(member)) {
                const adminCommands = [
                    `\`/ban case <id>\` - Look up a ban by ID`,
                    `\`/ban user <player> <duration> <reason>\` - Ban a player`,
                    `\`/bans <player>\` - List player bans`,
                    `\`/stats\` - Show database statistics`
                ];
                embed.addFields({ name: 'Admin Commands', value: adminCommands.join('\n'), inline: false });
            }

            // Supervisor+ commands
            if (isSupervisor(member)) {
                const supervisorCommands = [
                    `\`/panel\` - Send the support panel`,
                    `\`/close <reason>\` - Close current ticket`,
                    `\`/tclose <time> <reason>\` - Timed ticket close`
                ];
                embed.addFields({ name: 'Supervisor Commands', value: supervisorCommands.join('\n'), inline: false });
            }

            // Management+ commands
            if (isManagement(member)) {
                const managementCommands = [
                    `\`/infract <user> <type> <reason>\` - Issue a staff infraction`,
                    `\`/infractions [user] [type]\` - View staff infractions`,
                    `\`/revokeinfraction <case>\` - Revoke an infraction`
                ];
                embed.addFields({ name: 'Management Commands', value: managementCommands.join('\n'), inline: false });
            }

            return interaction.reply({
                embeds: [embed]
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('history')
            .setDescription('Show a player\'s full punishment history')
            .addStringOption(option =>
                option.setName('player')
                    .setDescription('The player name to look up')
                    .setRequired(true)
            ),
        async execute(interaction, client) {
            // Check staff permissions
            if (!isStaff(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    ephemeral: true
                });
            }

            const playerName = interaction.options.getString('player');

            await interaction.deferReply();

            try {
                const warnings = await Warning.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                }).sort({ createdAt: -1 });

                const bans = await Ban.find({ 
                    playerName: { $regex: new RegExp(`^${playerName}$`, 'i') }
                }).sort({ createdAt: -1 });

                if (warnings.length === 0 && bans.length === 0) {
                    return interaction.editReply({
                        embeds: [createErrorEmbed('No History', `No punishment history found for player: \`${playerName}\``)]
                    });
                }

                return interaction.editReply({
                    embeds: [createHistoryEmbed(playerName, warnings, bans)]
                });
            } catch (error) {
                console.error('Error fetching history:', error);
                return interaction.editReply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch player history.')]
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('lookup')
            .setDescription('Look up any case (warning or ban) by ID')
            .addStringOption(option =>
                option.setName('case_id')
                    .setDescription('The case ID to look up')
                    .setRequired(true)
            ),
        async execute(interaction, client) {
            // Check staff permissions
            if (!isStaff(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    ephemeral: true
                });
            }

            const caseId = interaction.options.getString('case_id');

            await interaction.deferReply();

            try {
                // Try to find as warning first (by _id or numeric caseNumber)
                let warning = await Warning.findById(caseId);
                if (!warning && !isNaN(Number(caseId))) warning = await Warning.findOne({ caseNumber: Number(caseId) });
                if (warning) {
                    const { createWarningEmbed } = require('../utils/embeds');
                    return interaction.editReply({
                        embeds: [createWarningEmbed(warning)]
                    });
                }

                // Try to find as ban (by _id or numeric caseNumber)
                let ban = await Ban.findById(caseId);
                if (!ban && !isNaN(Number(caseId))) ban = await Ban.findOne({ caseNumber: Number(caseId) });
                if (ban) {
                    const { createBanEmbed } = require('../utils/embeds');
                    return interaction.editReply({
                        embeds: [createBanEmbed(ban)]
                    });
                }

                // Try to find as infraction (by _id or numeric caseNumber)
                let infraction = await Infraction.findById(caseId);
                if (!infraction && !isNaN(Number(caseId))) infraction = await Infraction.findOne({ caseNumber: Number(caseId) });
                if (infraction) {
                    const INFRACTION_TYPES = {
                        termination: { label: 'Termination', color: 0x8B0000 },
                        warning: { label: 'Warning', color: 0xFF4500 },
                        notice: { label: 'Notice', color: 0xFFD700 },
                        strike: { label: 'Strike', color: 0xDC143C }
                    };
                    const typeConfig = INFRACTION_TYPES[infraction.type];
                    const embed = new EmbedBuilder()
                        .setTitle(`Staff ${typeConfig.label} - Case #${infraction.caseNumber}`)
                        .setColor(typeConfig.color)
                        .addFields(
                            { name: 'Staff Member', value: `<@${infraction.targetId}>\n\`${infraction.targetTag}\``, inline: true },
                            { name: 'Type', value: `**${typeConfig.label}**`, inline: true },
                            { name: 'Date', value: `<t:${Math.floor(new Date(infraction.createdAt).getTime() / 1000)}:F>`, inline: true },
                            { name: 'Reason', value: infraction.reason, inline: false },
                            { name: 'Issued By', value: infraction.issuerNickname || infraction.issuerTag, inline: true },
                            { name: 'Status', value: infraction.active ? 'Active' : 'Revoked', inline: true }
                        )
                        .setFooter({ text: `Case #${infraction.caseNumber}` })
                        .setTimestamp(infraction.createdAt);
                    return interaction.editReply({ embeds: [embed] });
                }

                return interaction.editReply({
                    embeds: [createErrorEmbed('Not Found', `No case found with ID: \`${caseId}\``)]
                });
            } catch (error) {
                console.error('Error looking up case:', error);
                return interaction.editReply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to look up case.')]
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('stats')
            .setDescription('Show database statistics'),
        async execute(interaction, client) {
            // Check admin permissions for /stats
            if (!isAdmin(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You need Admin permissions to use this command.')],
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            try {
                const totalWarnings = await Warning.countDocuments();
                const activeWarnings = await Warning.countDocuments({ active: true });
                const totalBans = await Ban.countDocuments();
                const activeBans = await Ban.countDocuments({ active: true });
                const totalInfractions = await Infraction.countDocuments();
                const activeInfractions = await Infraction.countDocuments({ active: true });

                const uniqueWarnedPlayers = await Warning.distinct('uuid');
                const uniqueBannedPlayers = await Ban.distinct('uuid');
                const uniqueInfractedStaff = await Infraction.distinct('targetId');

                const embed = new EmbedBuilder()
                    .setColor(getEmbedColor())
                    .setTitle('NewLife Management Statistics')
                    .addFields(
                        {
                            name: 'Warnings',
                            value: `**Total:** ${totalWarnings}\n**Active:** ${activeWarnings}\n**Unique Players:** ${uniqueWarnedPlayers.length}`,
                            inline: true
                        },
                        {
                            name: 'Bans',
                            value: `**Total:** ${totalBans}\n**Active:** ${activeBans}\n**Unique Players:** ${uniqueBannedPlayers.length}`,
                            inline: true
                        },
                        {
                            name: 'Staff Infractions',
                            value: `**Total:** ${totalInfractions}\n**Active:** ${activeInfractions}\n**Unique Staff:** ${uniqueInfractedStaff.length}`,
                            inline: true
                        },
                        {
                            name: 'Bot Info',
                            value: `**Uptime:** ${formatUptime(client.uptime)}\n**Servers:** ${client.guilds.cache.size}\n**Ping:** ${client.ws.ping}ms`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'NewLife Management' })
                    .setTimestamp();

                return interaction.editReply({
                    embeds: [embed]
                });
            } catch (error) {
                console.error('Error fetching stats:', error);
                return interaction.editReply({
                    embeds: [createErrorEmbed('Database Error', 'Failed to fetch statistics.')]
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check bot latency'),
        async execute(interaction, client) {
            const sent = await interaction.reply({
                content: 'Pinging...',
                fetchReply: true
            });

            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('Pong!')
                .addFields(
                    {
                        name: 'Bot Latency',
                        value: `\`${sent.createdTimestamp - interaction.createdTimestamp}ms\``,
                        inline: true
                    },
                    {
                        name: 'API Latency',
                        value: `\`${Math.round(client.ws.ping)}ms\``,
                        inline: true
                    }
                )
                .setFooter({ text: 'NewLife Management' })
                .setTimestamp();

            return interaction.editReply({
                content: null,
                embeds: [embed]
            });
        }
    }
];

module.exports = {
    name: 'General',
    description: 'General utility commands',
    commands,
    slashCommands
};
