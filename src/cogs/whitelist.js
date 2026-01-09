/**
 * Clean Whitelist Cog
 * Provides /whitelist add and /whitelist stats subcommands
 * Tracks weekly stats per staff member in MongoDB
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Rcon } = require('rcon-client');
const LinkedAccount = require('../database/models/LinkedAccount');
const WhitelistStats = require('../database/models/WhitelistStats');
const { isStaff, isOwner } = require('../utils/permissions');

const WHITELIST_ROLE_ID = process.env.WHITELIST_ROLE_ID || null;
const WHITELISTED_ROLE_ID = process.env.WHITELISTED_ROLE_ID || '1374421917284565046';
const WHITELIST_GURU_ROLE_ID = process.env.WHITELIST_GURU_ROLE_ID || '1456563910919454786';

/**
 * Check if member is a whitelist guru (not staff)
 */
function isWhitelistGuru(member) {
    return member && member.roles && member.roles.cache.has(WHITELIST_GURU_ROLE_ID);
}

/**
 * Get the start of the current week (Sunday at midnight UTC)
 */
function getWeekStart() {
    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sunday
    const diff = now.getUTCDate() - day;
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff, 0, 0, 0, 0));
    return weekStart;
}

/**
 * Track a whitelist command usage
 */
async function trackWhitelistUsage(staffId, staffTag, mcname, platform, discordId) {
    const weekStart = getWeekStart();
    
    try {
        await WhitelistStats.findOneAndUpdate(
            { staffId, weekStart },
            {
                $set: { staffTag },
                $inc: { count: 1 },
                $push: {
                    entries: {
                        mcname,
                        platform,
                        discordId,
                        timestamp: new Date()
                    }
                }
            },
            { upsert: true, new: true }
        );
    } catch (err) {
        console.error('Failed to track whitelist usage:', err);
    }
}

/**
 * Track whitelist for guru performance metrics (only for gurus)
 */
async function trackGuruWhitelist(interaction, mcname, platform, discordUser) {
    // Only track for whitelist gurus (not staff)
    if (!isWhitelistGuru(interaction.member)) return;
    
    try {
        const { trackWhitelistSuccess } = require('./guruTracking');
        
        // Try to find the ticket channel ID from the current channel context
        let ticketId = null;
        if (interaction.channel && interaction.channel.name?.startsWith('ticket-apply-')) {
            ticketId = interaction.channel.id;
        }
        
        await trackWhitelistSuccess(
            interaction.user.id,
            interaction.user.tag,
            ticketId,
            mcname,
            platform,
            discordUser.id,
            interaction.guild.id
        );
    } catch (err) {
        console.error('Failed to track guru whitelist:', err);
    }
}

/**
 * Check if member has whitelist guru role or is staff
 */
function canUseWhitelistCommands(member) {
    if (isStaff(member)) return true;
    if (member && member.roles && member.roles.cache.has(WHITELIST_GURU_ROLE_ID)) return true;
    return false;
}

async function getFetcher() {
    if (globalThis.fetch) return globalThis.fetch;
    try {
        const nf = require('node-fetch');
        return nf.default || nf;
    } catch (e) {
        throw new Error('Fetch not available. Install node-fetch or run on Node 18+.');
    }
}

async function lookupProfile(platform, username) {
    const fetch = await getFetcher();
    const url = platform === 'bedrock'
        ? `https://mcprofile.io/api/v1/bedrock/gamertag/${encodeURIComponent(username)}`
        : `https://mcprofile.io/api/v1/java/username/${encodeURIComponent(username)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Profile lookup failed (${res.status})`);
    const data = await res.json();
    let id = null;
    if (platform === 'bedrock') {
        id = data.fuuid || data.floodgateuid || data.id;
    } else {
        id = data.uuid || data.id;
    }
    if (!id) throw new Error('Could not determine UUID/fUUID from profile response');
    return id;
}

async function sendRconCommand(cmd) {
    const host = process.env.RCON_HOST;
    const port = Number(process.env.RCON_PORT || 25575);
    const password = process.env.RCON_PASSWORD;
    if (!host || !port || !password) throw new Error('RCON not configured');
    const conn = await Rcon.connect({ host, port, password });
    try {
        const res = await conn.send(cmd);
        await conn.end();
        return res;
    } catch (err) {
        try { await conn.end(); } catch (e) {}
        throw err;
    }
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('whitelist')
            .setDescription('Manage whitelist entries')
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('Add a player to the whitelist')
                .addStringOption(o => o.setName('platform').setDescription('java or bedrock').setRequired(true)
                    .addChoices({ name: 'java', value: 'java' }, { name: 'bedrock', value: 'bedrock' }))
                .addStringOption(o => o.setName('mcname').setDescription('Minecraft username').setRequired(true))
                .addUserOption(o => o.setName('discord').setDescription('Discord user to link').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('stats')
                .setDescription('View weekly whitelist stats (Owner only)')
            ),

        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();
            
            // STATS SUBCOMMAND
            if (sub === 'stats') {
                if (!isOwner(interaction.member)) {
                    return interaction.reply({ content: 'Permission denied. Owner only.', ephemeral: true });
                }
                
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    const weekStart = getWeekStart();
                    const stats = await WhitelistStats.find({ weekStart }).sort({ count: -1 });
                    
                    if (stats.length === 0) {
                        return interaction.editReply({ content: 'No whitelist stats for this week yet.' });
                    }
                    
                    const totalWhitelists = stats.reduce((sum, s) => sum + s.count, 0);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('Weekly Whitelist Stats')
                        .setDescription(`Week starting: ${weekStart.toISOString().split('T')[0]}`)
                        .setColor(parseInt((process.env.EMBED_COLOR || '#10b981').replace('#', ''), 16))
                        .setFooter({ text: `Total: ${totalWhitelists} whitelists this week` })
                        .setTimestamp();
                    
                    for (const stat of stats.slice(0, 25)) {
                        const user = await client.users.fetch(stat.staffId).catch(() => null);
                        const name = user ? user.tag : stat.staffTag || stat.staffId;
                        embed.addFields({
                            name: name,
                            value: `${stat.count} whitelist(s)`,
                            inline: true
                        });
                    }
                    
                    return interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error('Error fetching whitelist stats:', err);
                    return interaction.editReply({ content: 'Failed to fetch stats.' });
                }
            }
            
            // ADD SUBCOMMAND
            if (sub === 'add') {
                if (!canUseWhitelistCommands(interaction.member)) {
                    return interaction.reply({ content: 'Permission denied.', ephemeral: true });
                }
                
                await interaction.deferReply({ ephemeral: false });
                
                try {
                    const platform = interaction.options.getString('platform');
                    const mcname = interaction.options.getString('mcname');
                    const discordUser = interaction.options.getUser('discord');

                    let uuid = null;
                    try {
                        uuid = await lookupProfile(platform, mcname);
                    } catch (err) {
                        return interaction.editReply({ content: `Profile lookup failed: ${err.message}` });
                    }

                    try {
                        if (platform === 'java') await sendRconCommand(`whitelist add ${mcname}`);
                        else await sendRconCommand(`fwhitelist add ${uuid}`);
                    } catch (err) {
                        console.error('RCON error:', err);
                        return interaction.editReply({ content: `Failed to send whitelist command: ${err.message}` });
                    }

                    try {
                        const existing = await LinkedAccount.findOne({ discordId: String(discordUser.id), minecraftUsername: mcname });
                        if (!existing) {
                            await new LinkedAccount({ discordId: String(discordUser.id), minecraftUsername: mcname, uuid, platform, linkedAt: new Date() }).save();
                        }
                    } catch (err) {
                        console.error('Failed to persist linked account:', err);
                    }

                    // Track stats for this whitelist action
                    await trackWhitelistUsage(interaction.user.id, interaction.user.tag, mcname, platform, discordUser.id);

                    // Track guru performance metrics (only if user is a guru)
                    await trackGuruWhitelist(interaction, mcname, platform, discordUser);

                    try {
                        const guild = interaction.guild;
                        if (guild) {
                            const member = await guild.members.fetch(discordUser.id).catch(() => null);
                            if (member) {
                                try { await member.setNickname(mcname, 'Auto whitelist rename'); } catch (e) {}
                                if (WHITELIST_ROLE_ID) {
                                    try { await member.roles.add(WHITELIST_ROLE_ID, 'Auto whitelist role'); } catch (e) {}
                                }
                                try { await member.roles.add(WHITELISTED_ROLE_ID, 'User whitelisted'); } catch (e) {}
                            }
                        }
                    } catch (err) { console.error('Failed to update guild member:', err); }

                    try {
                        const { sendDm } = require('../utils/dm');
                        const colorVal = process.env.EMBED_COLOR || '#2B2D31';
                        const embedColor = (typeof colorVal === 'string' && colorVal.startsWith('#')) ? parseInt(colorVal.slice(1), 16) : colorVal;
                        const welcomeEmbed = new EmbedBuilder()
                            .setTitle("We're glad to have you here!")
                            .setDescription("Before you jump in, please make sure you've read our rules and understand how the server works.\nNewLife SMP is built on respect, fairness, and community — and we're excited to see what you'll bring to the world.")
                            .setColor(embedColor)
                            .addFields(
                                { name: 'Wiki', value: '[Wiki](https://wiki.newlifesmp.com)', inline: true },
                                { name: 'Rules', value: '[Rules](https://newlifesmp.com/rules)', inline: true },
                                { name: 'Modpack', value: '[Modpack](https://modrinth.com/modpack/thenewlife-modpack)', inline: true },
                                { name: 'Support', value: '[Support](https://discord.com/channels/1372672239245459498/1437529798707777537)', inline: false }
                            )
                            .setFooter({ text: 'Welcome to NewLife SMP' })
                            .setTimestamp();

                        const dmRes = await sendDm(client, discordUser.id, { content: `Whitelisted **${mcname}** (${platform}) and linked to <@${discordUser.id}>. imperical`, embeds: [welcomeEmbed] });
                        if (!dmRes.success) console.warn('DM failed for whitelist:', dmRes.error);
                    } catch (e) { /* ignore DM failures */ }

                    try {
                        // Whitelist log channel - specific channel for whitelist notifications
                        const WHITELIST_LOG_CHANNEL_ID = process.env.WHITELIST_LOG_CHANNEL_ID || '1442648914204295168';
                        const ch = await client.channels.fetch(WHITELIST_LOG_CHANNEL_ID).catch(() => null);
                        if (ch) {
                            const logEmbed = new EmbedBuilder()
                                .setTitle('Whitelist Added')
                                .addFields(
                                    { name: 'Minecraft', value: `${mcname} (${platform})`, inline: true },
                                    { name: 'UUID', value: uuid || 'N/A', inline: true },
                                    { name: 'Discord', value: `${discordUser.tag} (${discordUser.id})`, inline: true },
                                    { name: 'Added By', value: `${interaction.user.tag}`, inline: true }
                                )
                                .setTimestamp();
                            await ch.send({ embeds: [logEmbed] }).catch(() => null);
                        }
                    } catch (e) { console.error('Failed to send log:', e); }

                    return interaction.editReply({ content: `Whitelisted **${mcname}** (${platform}) and linked to <@${discordUser.id}>.` });
                } catch (err) {
                    console.error('Whitelist execute error:', err);
                    return interaction.editReply({ content: 'An unexpected error occurred.' });
                }
            }
            
            return interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
        }
    }
];

/**
 * Send weekly whitelist stats to owner
 * Call this from a scheduled task (e.g., every Sunday)
 */
async function sendWeeklyStatsToOwner(client) {
    const ownerId = process.env.OWNER_ID;
    if (!ownerId) {
        console.warn('OWNER_ID not set, cannot send weekly stats');
        return;
    }
    
    try {
        // Get last week's stats
        const lastWeekStart = new Date(getWeekStart());
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        
        const stats = await WhitelistStats.find({ weekStart: lastWeekStart }).sort({ count: -1 });
        
        if (stats.length === 0) {
            console.log('No whitelist stats for last week');
            return;
        }
        
        const totalWhitelists = stats.reduce((sum, s) => sum + s.count, 0);
        const weekEnd = new Date(lastWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        
        const embed = new EmbedBuilder()
            .setTitle('Weekly Whitelist Report')
            .setDescription(`Week: ${lastWeekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`)
            .setColor(parseInt((process.env.EMBED_COLOR || '#10b981').replace('#', ''), 16))
            .setFooter({ text: `Total: ${totalWhitelists} whitelists` })
            .setTimestamp();
        
        let staffList = '';
        for (const stat of stats) {
            const user = await client.users.fetch(stat.staffId).catch(() => null);
            const name = user ? user.tag : stat.staffTag || stat.staffId;
            staffList += `**${name}**: ${stat.count} whitelist(s)\n`;
        }
        
        embed.addFields({ name: 'Staff Stats', value: staffList || 'None', inline: false });
        
        const { sendDm } = require('../utils/dm');
        await sendDm(client, ownerId, { content: '**Weekly Whitelist Report**', embeds: [embed] });
        console.log('Weekly whitelist stats sent to owner');
    } catch (err) {
        console.error('Failed to send weekly whitelist stats:', err);
    }
}

module.exports = { name: 'Whitelist', slashCommands, sendWeeklyStatsToOwner, getWeekStart };

