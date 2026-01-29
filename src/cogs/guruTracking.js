/**
 * Guru Tracking Cog
 * Tracks whitelist guru performance metrics and sends weekly reports with diamond pay
 * 
 * Commands:
 * - /guru stats - View current week stats (owner only)
 * - /guru performance <user> - View specific guru's performance (owner only)
 * - /guru report - Manually trigger weekly report (owner only)
 * 
 * Tracked Metrics:
 * - Response time to apply tickets
 * - Whether they greet applicants properly
 * - Success rate (whitelisted vs total claimed)
 * - Total volume processed
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const GuruPerformance = require('../database/models/GuruPerformance');
const { isOwner, isManagement } = require('../utils/permissions');
const { sendDm } = require('../utils/dm');
const cron = require('node-cron');

// Whitelist guru role ID - from environment or default
const WHITELIST_GURU_ROLE_ID = process.env.WHITELIST_GURU_ROLE_ID || '1456563910919454786';

// Common greeting patterns to detect
const GREETING_PATTERNS = [
    /^(hi|hey|hello|welcome|greetings|howdy|hiya|heya)/i,
    /good\s*(morning|afternoon|evening|day)/i,
    /thanks?\s*for\s*(applying|your\s*application)/i,
    /welcome\s*to/i,
    /nice\s*to\s*meet/i,
    /appreciate\s*(you|your)/i
];

/**
 * Check if a message contains a greeting
 */
function containsGreeting(messageContent) {
    if (!messageContent || typeof messageContent !== 'string') return false;
    
    const content = messageContent.toLowerCase().trim();
    
    for (const pattern of GREETING_PATTERNS) {
        if (pattern.test(content)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Format milliseconds to human-readable time
 */
function formatResponseTime(ms) {
    if (!ms || ms < 0) return 'N/A';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Get performance rating text based on score
 */
function getPerformanceRating(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Great';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Satisfactory';
    if (score >= 50) return 'Average';
    return 'Needs Improvement';
}

/**
 * Get response time rating text
 */
function getResponseTimeRating(avgMs) {
    const minutes = avgMs / 60000;
    if (minutes <= 5) return 'Excellent';
    if (minutes <= 15) return 'Great';
    if (minutes <= 30) return 'Good';
    if (minutes <= 60) return 'Needs Work';
    return 'Slow';
}

/**
 * Track when a guru responds to an apply ticket
 */
async function trackGuruResponse(guruId, guruTag, ticketId, ticketChannelId, applicantId, applicantTag, ticketCreatedAt, messageContent, guildId) {
    try {
        const responseTime = new Date();
        const responseTimeMs = responseTime.getTime() - ticketCreatedAt.getTime();
        const didGreet = containsGreeting(messageContent);
        
        const record = await GuruPerformance.getOrCreateForGuru(guruId, guruTag, guildId);
        const existingInteraction = record.interactions.find(i => i.ticketId === ticketId);
        
        if (!existingInteraction) {
            record.addInteraction({
                ticketId,
                ticketChannelId,
                applicantId,
                applicantTag,
                ticketCreatedAt,
                firstResponseAt: responseTime,
                responseTimeMs,
                didGreet,
                greetingMessage: didGreet ? messageContent.substring(0, 200) : null,
                outcome: 'pending'
            });
        } else if (!existingInteraction.firstResponseAt) {
            record.updateInteraction(ticketId, {
                firstResponseAt: responseTime,
                responseTimeMs,
                didGreet: existingInteraction.didGreet || didGreet,
                greetingMessage: existingInteraction.greetingMessage || (didGreet ? messageContent.substring(0, 200) : null)
            });
        } else if (didGreet && !existingInteraction.didGreet) {
            record.updateInteraction(ticketId, {
                didGreet: true,
                greetingMessage: messageContent.substring(0, 200)
            });
        }
        
        await record.save();
        console.log(`[GuruTracking] Tracked response from ${guruTag} in ticket ${ticketId}, response time: ${formatResponseTime(responseTimeMs)}`);
        
        return record;
    } catch (err) {
        console.error('[GuruTracking] Failed to track guru response:', err);
        return null;
    }
}

/**
 * Track when a guru successfully whitelists someone
 */
async function trackWhitelistSuccess(guruId, guruTag, ticketId, mcUsername, platform, applicantId, guildId) {
    try {
        const record = await GuruPerformance.getOrCreateForGuru(guruId, guruTag, guildId);
        const existingInteraction = record.interactions.find(i => i.ticketId === ticketId);
        
        if (existingInteraction) {
            record.updateInteraction(ticketId, {
                outcome: 'whitelisted',
                whitelistedAt: new Date(),
                mcUsername,
                platform
            });
        } else {
            record.addInteraction({
                ticketId: ticketId || `direct-${Date.now()}`,
                applicantId,
                ticketCreatedAt: new Date(),
                firstResponseAt: new Date(),
                responseTimeMs: 0,
                didGreet: true,
                outcome: 'whitelisted',
                whitelistedAt: new Date(),
                mcUsername,
                platform
            });
        }
        
        await record.save();
        console.log(`[GuruTracking] Tracked whitelist by ${guruTag}: ${mcUsername} (${platform})`);
        
        return record;
    } catch (err) {
        console.error('[GuruTracking] Failed to track whitelist success:', err);
        return null;
    }
}

/**
 * Track when a ticket is denied
 */
async function trackTicketDenied(guruId, guruTag, ticketId, applicantId, reason, guildId) {
    try {
        const record = await GuruPerformance.getOrCreateForGuru(guruId, guruTag, guildId);
        const existingInteraction = record.interactions.find(i => i.ticketId === ticketId);
        
        if (existingInteraction) {
            record.updateInteraction(ticketId, {
                outcome: 'denied',
                notes: reason
            });
            await record.save();
        }
        
        return record;
    } catch (err) {
        console.error('[GuruTracking] Failed to track ticket denial:', err);
        return null;
    }
}

/**
 * Track when a ticket is abandoned
 */
async function trackTicketAbandoned(guruId, guruTag, ticketId, guildId) {
    try {
        const record = await GuruPerformance.getOrCreateForGuru(guruId, guruTag, guildId);
        const existingInteraction = record.interactions.find(i => i.ticketId === ticketId);
        
        if (existingInteraction && existingInteraction.outcome === 'pending') {
            record.updateInteraction(ticketId, {
                outcome: 'abandoned'
            });
            await record.save();
        }
        
        return record;
    } catch (err) {
        console.error('[GuruTracking] Failed to track ticket abandonment:', err);
        return null;
    }
}

/**
 * Build weekly report embed for owner DM
 */
function buildWeeklyReportEmbed(records, weekStart, weekEnd) {
    const totalWhitelists = records.reduce((sum, r) => sum + r.totalWhitelisted, 0);
    const totalTickets = records.reduce((sum, r) => sum + r.totalTicketsClaimed, 0);
    
    const embed = new EmbedBuilder()
        .setTitle('Weekly Guru Performance Report')
        .setDescription(
            `**Week:** ${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}\n\n` +
            `**Total Whitelists:** ${totalWhitelists}\n` +
            `**Total Tickets Claimed:** ${totalTickets}\n` +
            `**Active Gurus:** ${records.length}`
        )
        .setColor(0x2B2D31)
        .setTimestamp();
    
    if (records.length === 0) {
        embed.addFields({
            name: 'No Activity',
            value: 'No guru activity recorded this week.',
            inline: false
        });
        return embed;
    }
    
    // Sort by performance score
    const sortedRecords = [...records].sort((a, b) => b.performanceScore - a.performanceScore);
    
    // Build payment summary
    let paymentSummary = '```\n';
    paymentSummary += 'GURU                      DIAMONDS\n';
    paymentSummary += '------------------------------------\n';
    
    let totalDiamonds = 0;
    for (const record of sortedRecords) {
        const name = (record.guruTag || record.guruId).substring(0, 24).padEnd(24);
        const diamonds = String(record.recommendedDiamonds).padStart(10);
        paymentSummary += `${name}  ${diamonds}\n`;
        totalDiamonds += record.recommendedDiamonds;
    }
    
    paymentSummary += '------------------------------------\n';
    paymentSummary += `${'TOTAL'.padEnd(24)}  ${String(totalDiamonds).padStart(10)}\n`;
    paymentSummary += '```';
    
    embed.addFields({
        name: 'Payment Summary',
        value: paymentSummary,
        inline: false
    });
    
    // Add individual guru stats
    for (const record of sortedRecords.slice(0, 10)) {
        const rating = getPerformanceRating(record.performanceScore);
        const responseRating = getResponseTimeRating(record.avgResponseTimeMs);
        
        embed.addFields({
            name: `${record.guruTag || record.guruId} [${rating}]`,
            value: [
                `Score: ${record.performanceScore}/100`,
                `Whitelisted: ${record.totalWhitelisted} | Denied: ${record.totalDenied}`,
                `Avg Response: ${formatResponseTime(record.avgResponseTimeMs)} (${responseRating})`,
                `Greeting Rate: ${record.greetingRate.toFixed(0)}%`,
                `**Payment: ${record.recommendedDiamonds} diamonds**`
            ].join('\n'),
            inline: true
        });
    }
    
    embed.setFooter({ text: 'NewLife SMP | Guru Performance Tracking' });
    
    return embed;
}

/**
 * Send weekly report to owner and additional recipients
 */
async function sendWeeklyGuruReport(client) {
    const ownerId = process.env.OWNER_ID || process.env.OWNER_USER_ID;
    // Additional recipients for guru reports (comma-separated in env, or hardcoded)
    const additionalRecipients = (process.env.GURU_REPORT_RECIPIENTS || '519184985366986765').split(',').map(id => id.trim()).filter(id => id);
    
    if (!ownerId) {
        console.error('[GuruTracking] Owner ID not configured for weekly report');
        return;
    }
    
    const guildId = process.env.GUILD_ID || '1372672239245459498';
    
    try {
        const records = await GuruPerformance.getLastWeekRecords(guildId);
        
        if (records.length === 0) {
            console.log('[GuruTracking] No guru records for last week');
            return;
        }
        
        const alreadySent = records.every(r => r.reportSent);
        if (alreadySent) {
            console.log('[GuruTracking] Weekly report already sent');
            return;
        }
        
        const { weekStart, weekEnd } = GuruPerformance.getWeekBounds();
        const lastWeekStart = new Date(weekStart);
        lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
        const lastWeekEnd = new Date(weekEnd);
        lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() - 7);
        
        const embed = buildWeeklyReportEmbed(records, lastWeekStart, lastWeekEnd);
        
        const messageContent = {
            content: '**Weekly Guru Performance Report**\nHere is how your whitelist gurus performed this week:',
            embeds: [embed]
        };
        
        // Send to owner
        await sendDm(client, ownerId, messageContent);
        console.log('[GuruTracking] Weekly guru report sent to owner');
        
        // Send to additional recipients
        for (const recipientId of additionalRecipients) {
            if (recipientId !== ownerId) {
                try {
                    await sendDm(client, recipientId, messageContent);
                    console.log(`[GuruTracking] Weekly guru report sent to ${recipientId}`);
                } catch (err) {
                    console.error(`[GuruTracking] Failed to send report to ${recipientId}:`, err.message);
                }
            }
        }
        
        for (const record of records) {
            record.reportSent = true;
            record.reportSentAt = new Date();
            await record.save();
        }
        
        console.log('[GuruTracking] Weekly guru report delivery complete');
    } catch (err) {
        console.error('[GuruTracking] Failed to send weekly report:', err);
    }
}

let scheduledTask = null;

function initGuruScheduler(client) {
    scheduledTask = cron.schedule('0 9 * * 1', async () => {
        console.log('[GuruTracking] Running weekly guru report...');
        await sendWeeklyGuruReport(client);
    }, {
        timezone: 'America/New_York'
    });
    
    console.log('[GuruTracking] Weekly scheduler initialized');
}

function stopGuruScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
}

const { resolveDiscordFromMinecraft } = require('../utils/playerResolver');

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('guru')
            .setDescription('Guru performance management')
            .addSubcommand(sub => sub
                .setName('stats')
                .setDescription('View current week guru stats (Owner/Management only)')
            )
            .addSubcommand(sub => sub
                .setName('performance')
                .setDescription('View specific guru performance (Owner/Management only)')
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription('The guru to check (Discord user)')
                    .setRequired(false))
                .addStringOption(opt => opt
                    .setName('mcname')
                    .setDescription('Or enter a Minecraft username to lookup')
                    .setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('report')
                .setDescription('Manually trigger weekly report (Owner only)')
            )
            .addSubcommand(sub => sub
                .setName('history')
                .setDescription('View guru history across weeks (Owner only)')
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription('The guru to check (Discord user)')
                    .setRequired(false))
                .addStringOption(opt => opt
                    .setName('mcname')
                    .setDescription('Or enter a Minecraft username to lookup')
                    .setRequired(false))
                .addIntegerOption(opt => opt
                    .setName('weeks')
                    .setDescription('Number of weeks to look back')
                    .setRequired(false))
            ),
        
        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();
            
            if (!isOwner(interaction.member) && !isManagement(interaction.member)) {
                return interaction.reply({ content: 'Permission denied. Owner/Management only.', ephemeral: true });
            }
            
            if (sub === 'stats') {
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    const guildId = interaction.guild.id;
                    const { weekStart, weekEnd } = GuruPerformance.getWeekBounds();
                    const records = await GuruPerformance.getWeeklyRecords(guildId);
                    
                    if (records.length === 0) {
                        return interaction.editReply({ content: 'No guru activity recorded this week yet.' });
                    }
                    
                    const embed = buildWeeklyReportEmbed(records, weekStart, weekEnd);
                    embed.setTitle('Current Week Guru Stats');
                    
                    return interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error('[GuruTracking] Stats command error:', err);
                    return interaction.editReply({ content: 'Failed to fetch stats.' });
                }
            }
            
            if (sub === 'performance') {
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    let targetUser = interaction.options.getUser('user');
                    const mcname = interaction.options.getString('mcname');
                    const guildId = interaction.guild.id;
                    
                    // If no Discord user provided, try to resolve from Minecraft name
                    if (!targetUser && mcname) {
                        const resolved = await resolveDiscordFromMinecraft(mcname, client);
                        if (resolved.discordUser) {
                            targetUser = resolved.discordUser;
                        } else if (resolved.discordId) {
                            targetUser = await client.users.fetch(resolved.discordId).catch(() => null);
                        }
                        if (!targetUser) {
                            return interaction.editReply({ content: `Could not find a Discord user linked to Minecraft name: **${mcname}**` });
                        }
                    }
                    
                    if (!targetUser) {
                        return interaction.editReply({ content: 'Please provide either a Discord user or a Minecraft username.' });
                    }
                    
                    const record = await GuruPerformance.findOne({ 
                        guruId: targetUser.id, 
                        guildId,
                        weekStart: GuruPerformance.getWeekBounds().weekStart
                    });
                    
                    if (!record || record.interactions.length === 0) {
                        return interaction.editReply({ content: `No performance data for ${targetUser.tag} this week.` });
                    }
                    
                    const rating = getPerformanceRating(record.performanceScore);
                    
                    const embed = new EmbedBuilder()
                        .setTitle(`${targetUser.tag} - ${rating}`)
                        .setColor(record.performanceScore >= 70 ? 0x57F287 : record.performanceScore >= 50 ? 0xFEE75C : 0xED4245)
                        .setThumbnail(targetUser.displayAvatarURL())
                        .addFields(
                            { name: 'Performance Score', value: `${record.performanceScore}/100`, inline: true },
                            { name: 'Tickets Claimed', value: `${record.totalTicketsClaimed}`, inline: true },
                            { name: 'Whitelisted', value: `${record.totalWhitelisted}`, inline: true },
                            { name: 'Denied', value: `${record.totalDenied}`, inline: true },
                            { name: 'Abandoned', value: `${record.totalAbandoned}`, inline: true },
                            { name: 'Completion Rate', value: `${record.completionRate.toFixed(1)}%`, inline: true },
                            { name: 'Avg Response Time', value: formatResponseTime(record.avgResponseTimeMs), inline: true },
                            { name: 'Fastest Response', value: formatResponseTime(record.minResponseTimeMs), inline: true },
                            { name: 'Slowest Response', value: formatResponseTime(record.maxResponseTimeMs), inline: true },
                            { name: 'Greeting Rate', value: `${record.greetingRate.toFixed(1)}%`, inline: true },
                            { name: 'Payment', value: `${record.recommendedDiamonds} diamonds`, inline: true }
                        )
                        .setFooter({ text: 'NewLife SMP | Guru Performance' })
                        .setTimestamp();
                    
                    const recentInteractions = record.interactions.slice(-5).reverse();
                    if (recentInteractions.length > 0) {
                        let interactionList = '';
                        for (const i of recentInteractions) {
                            const outcome = i.outcome === 'whitelisted' ? '[Approved]' : i.outcome === 'denied' ? '[Denied]' : i.outcome === 'abandoned' ? '[Abandoned]' : '[Pending]';
                            const greet = i.didGreet ? '[Greeted]' : '';
                            interactionList += `${outcome} ${i.mcUsername || 'Unknown'} - ${formatResponseTime(i.responseTimeMs)} ${greet}\n`;
                        }
                        embed.addFields({ name: 'Recent Activity', value: interactionList || 'None', inline: false });
                    }
                    
                    return interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error('[GuruTracking] Performance command error:', err);
                    return interaction.editReply({ content: 'Failed to fetch performance data.' });
                }
            }
            
            if (sub === 'report') {
                if (!isOwner(interaction.member)) {
                    return interaction.reply({ content: 'Permission denied. Owner only.', ephemeral: true });
                }
                
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    await sendWeeklyGuruReport(client);
                    return interaction.editReply({ content: 'Weekly report sent to your DMs.' });
                } catch (err) {
                    console.error('[GuruTracking] Report command error:', err);
                    return interaction.editReply({ content: 'Failed to send report.' });
                }
            }
            
            if (sub === 'history') {
                if (!isOwner(interaction.member)) {
                    return interaction.reply({ content: 'Permission denied. Owner only.', ephemeral: true });
                }
                
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    let targetUser = interaction.options.getUser('user');
                    const mcname = interaction.options.getString('mcname');
                    const weeksBack = interaction.options.getInteger('weeks') || 4;
                    const guildId = interaction.guild.id;
                    
                    // If no Discord user provided, try to resolve from Minecraft name
                    if (!targetUser && mcname) {
                        const resolved = await resolveDiscordFromMinecraft(mcname, client);
                        if (resolved.discordUser) {
                            targetUser = resolved.discordUser;
                        } else if (resolved.discordId) {
                            targetUser = await client.users.fetch(resolved.discordId).catch(() => null);
                        }
                        if (!targetUser) {
                            return interaction.editReply({ content: `Could not find a Discord user linked to Minecraft name: **${mcname}**` });
                        }
                    }
                    
                    if (!targetUser) {
                        return interaction.editReply({ content: 'Please provide either a Discord user or a Minecraft username.' });
                    }
                    
                    const now = new Date();
                    const records = await GuruPerformance.find({
                        guruId: targetUser.id,
                        guildId,
                        weekStart: { 
                            $gte: new Date(now.getTime() - (weeksBack * 7 * 24 * 60 * 60 * 1000))
                        }
                    }).sort({ weekStart: -1 });
                    
                    if (records.length === 0) {
                        return interaction.editReply({ content: `No history found for ${targetUser.tag} in the past ${weeksBack} weeks.` });
                    }
                    
                    const embed = new EmbedBuilder()
                        .setTitle(`${targetUser.tag} - Performance History`)
                        .setColor(0x2B2D31)
                        .setThumbnail(targetUser.displayAvatarURL())
                        .setTimestamp();
                    
                    let totalDiamonds = 0;
                    let totalWhitelists = 0;
                    
                    for (const record of records) {
                        const weekLabel = record.weekStart.toISOString().split('T')[0];
                        const rating = getPerformanceRating(record.performanceScore);
                        
                        embed.addFields({
                            name: `Week of ${weekLabel} [${rating}]`,
                            value: [
                                `Score: ${record.performanceScore}/100`,
                                `Whitelisted: ${record.totalWhitelisted}`,
                                `Payment: ${record.recommendedDiamonds} diamonds`
                            ].join(' | '),
                            inline: false
                        });
                        
                        totalDiamonds += record.recommendedDiamonds;
                        totalWhitelists += record.totalWhitelisted;
                    }
                    
                    embed.addFields({
                        name: 'Totals',
                        value: `**Whitelists:** ${totalWhitelists} | **Diamonds:** ${totalDiamonds}`,
                        inline: false
                    });
                    
                    embed.setFooter({ text: `Showing ${records.length} week(s) of data` });
                    
                    return interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error('[GuruTracking] History command error:', err);
                    return interaction.editReply({ content: 'Failed to fetch history.' });
                }
            }
        }
    }
];

module.exports = {
    name: 'GuruTracking',
    description: 'Whitelist guru performance tracking system',
    slashCommands,
    trackGuruResponse,
    trackWhitelistSuccess,
    trackTicketDenied,
    trackTicketAbandoned,
    containsGreeting,
    initGuruScheduler,
    stopGuruScheduler,
    sendWeeklyGuruReport,
    WHITELIST_GURU_ROLE_ID
};
