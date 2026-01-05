/**
 * Guru Tracking Cog
 * Tracks whitelist guru performance metrics and sends weekly reports with diamond pay recommendations
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

// Whitelist guru role ID
const WHITELIST_GURU_ROLE_ID = '1456563910919454786';

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
 * Get performance rating emoji based on score
 */
function getPerformanceEmoji(score) {
    if (score >= 90) return '🌟';      // Excellent
    if (score >= 80) return '⭐';      // Great
    if (score >= 70) return '✨';      // Good
    if (score >= 60) return '👍';      // Satisfactory
    if (score >= 50) return '📊';      // Average
    return '📉';                        // Needs improvement
}

/**
 * Get response time rating
 */
function getResponseTimeRating(avgMs) {
    const minutes = avgMs / 60000;
    if (minutes <= 5) return '🚀 Excellent';
    if (minutes <= 15) return '⚡ Great';
    if (minutes <= 30) return '✅ Good';
    if (minutes <= 60) return '⏰ Needs Work';
    return '🐢 Slow';
}

/**
 * Track when a guru responds to an apply ticket
 * Called from tickets.js when a message is sent in an apply ticket by a guru
 */
async function trackGuruResponse(guruId, guruTag, ticketId, ticketChannelId, applicantId, applicantTag, ticketCreatedAt, messageContent, guildId) {
    try {
        const responseTime = new Date();
        const responseTimeMs = responseTime.getTime() - ticketCreatedAt.getTime();
        const didGreet = containsGreeting(messageContent);
        
        // Get or create performance record for this week
        const record = await GuruPerformance.getOrCreateForGuru(guruId, guruTag, guildId);
        
        // Check if we already tracked this ticket
        const existingInteraction = record.interactions.find(i => i.ticketId === ticketId);
        
        if (!existingInteraction) {
            // Add new interaction
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
            // Update first response if not already set
            record.updateInteraction(ticketId, {
                firstResponseAt: responseTime,
                responseTimeMs,
                didGreet: existingInteraction.didGreet || didGreet,
                greetingMessage: existingInteraction.greetingMessage || (didGreet ? messageContent.substring(0, 200) : null)
            });
        } else if (didGreet && !existingInteraction.didGreet) {
            // Update greeting detection if found in later message
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
 * Called from whitelist.js after successful whitelist
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
            // Create new interaction if not tracked yet (whitelist outside of ticket)
            record.addInteraction({
                ticketId: ticketId || `direct-${Date.now()}`,
                applicantId,
                ticketCreatedAt: new Date(),
                firstResponseAt: new Date(),
                responseTimeMs: 0,
                didGreet: true, // Assume greeting for direct whitelists
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
 * Track when a ticket is abandoned (closed without whitelist or denial)
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
        .setTitle('💎 Weekly Guru Performance Report')
        .setDescription(`**Week:** ${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}\n\n` +
            `**Total Whitelists:** ${totalWhitelists}\n` +
            `**Total Tickets Claimed:** ${totalTickets}\n` +
            `**Active Gurus:** ${records.length}`)
        .setColor(0x00D4FF)
        .setTimestamp();
    
    if (records.length === 0) {
        embed.addFields({
            name: '📊 No Activity',
            value: 'No guru activity recorded this week.',
            inline: false
        });
        return embed;
    }
    
    // Sort by performance score
    const sortedRecords = [...records].sort((a, b) => b.performanceScore - a.performanceScore);
    
    // Add individual guru stats
    for (const record of sortedRecords.slice(0, 10)) {
        const emoji = getPerformanceEmoji(record.performanceScore);
        const responseRating = getResponseTimeRating(record.avgResponseTimeMs);
        
        embed.addFields({
            name: `${emoji} ${record.guruTag || record.guruId}`,
            value: [
                `**Score:** ${record.performanceScore}/100`,
                `**Whitelisted:** ${record.totalWhitelisted} | **Denied:** ${record.totalDenied}`,
                `**Avg Response:** ${formatResponseTime(record.avgResponseTimeMs)} (${responseRating})`,
                `**Greeting Rate:** ${record.greetingRate.toFixed(0)}%`,
                `**💎 Pay Range:** ${record.diamondRangeMin}-${record.diamondRangeMax} diamonds`,
                `**💎 Recommended:** ${record.recommendedDiamonds} diamonds`
            ].join('\n'),
            inline: true
        });
    }
    
    // Add summary section
    let totalDiamondsMin = 0;
    let totalDiamondsMax = 0;
    let totalRecommended = 0;
    
    for (const record of records) {
        totalDiamondsMin += record.diamondRangeMin;
        totalDiamondsMax += record.diamondRangeMax;
        totalRecommended += record.recommendedDiamonds;
    }
    
    embed.addFields({
        name: '💰 Total Payment Summary',
        value: [
            `**Minimum:** ${totalDiamondsMin} diamonds`,
            `**Recommended:** ${totalRecommended} diamonds`,
            `**Maximum:** ${totalDiamondsMax} diamonds`
        ].join('\n'),
        inline: false
    });
    
    embed.setFooter({ text: 'NewLife SMP | Guru Performance Tracking' });
    
    return embed;
}

/**
 * Send weekly report to owner
 */
async function sendWeeklyGuruReport(client) {
    const ownerId = process.env.OWNER_ID || process.env.OWNER_USER_ID;
    if (!ownerId) {
        console.error('[GuruTracking] Owner ID not configured for weekly report');
        return;
    }
    
    const guildId = process.env.GUILD_ID || '1372672239245459498';
    
    try {
        // Get last week's records
        const records = await GuruPerformance.getLastWeekRecords(guildId);
        
        if (records.length === 0) {
            console.log('[GuruTracking] No guru records for last week');
            return;
        }
        
        // Check if already sent
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
        
        // Build and send report
        const embed = buildWeeklyReportEmbed(records, lastWeekStart, lastWeekEnd);
        
        await sendDm(client, ownerId, {
            content: '📊 **Weekly Guru Performance Report**\nHere\'s how your whitelist gurus performed this week:',
            embeds: [embed]
        });
        
        // Mark as sent
        for (const record of records) {
            record.reportSent = true;
            record.reportSentAt = new Date();
            await record.save();
        }
        
        console.log('[GuruTracking] Weekly guru report sent to owner');
    } catch (err) {
        console.error('[GuruTracking] Failed to send weekly report:', err);
    }
}

/**
 * Scheduled task reference
 */
let scheduledTask = null;

/**
 * Initialize the weekly scheduler
 */
function initGuruScheduler(client) {
    // Schedule for every Monday at 9:00 AM EST
    scheduledTask = cron.schedule('0 9 * * 1', async () => {
        console.log('[GuruTracking] Running weekly guru report...');
        await sendWeeklyGuruReport(client);
    }, {
        timezone: 'America/New_York'
    });
    
    console.log('[GuruTracking] Weekly scheduler initialized');
}

/**
 * Stop scheduler
 */
function stopGuruScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
}

/**
 * Slash Commands
 */
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
                    .setDescription('The guru to check')
                    .setRequired(true))
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
                    .setDescription('The guru to check')
                    .setRequired(true))
                .addIntegerOption(opt => opt
                    .setName('weeks')
                    .setDescription('Number of weeks to look back')
                    .setRequired(false))
            ),
        
        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();
            
            // Permission check
            if (!isOwner(interaction.member) && !isManagement(interaction.member)) {
                return interaction.reply({ content: 'Permission denied. Owner/Management only.', ephemeral: true });
            }
            
            // STATS - Current week overview
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
                    embed.setTitle('📊 Current Week Guru Stats');
                    
                    return interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error('[GuruTracking] Stats command error:', err);
                    return interaction.editReply({ content: 'Failed to fetch stats.' });
                }
            }
            
            // PERFORMANCE - Specific guru
            if (sub === 'performance') {
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    const targetUser = interaction.options.getUser('user');
                    const guildId = interaction.guild.id;
                    
                    const record = await GuruPerformance.findOne({ 
                        guruId: targetUser.id, 
                        guildId,
                        weekStart: GuruPerformance.getWeekBounds().weekStart
                    });
                    
                    if (!record || record.interactions.length === 0) {
                        return interaction.editReply({ content: `No performance data for ${targetUser.tag} this week.` });
                    }
                    
                    const emoji = getPerformanceEmoji(record.performanceScore);
                    
                    const embed = new EmbedBuilder()
                        .setTitle(`${emoji} ${targetUser.tag}'s Performance`)
                        .setColor(record.performanceScore >= 70 ? 0x00FF00 : record.performanceScore >= 50 ? 0xFFFF00 : 0xFF0000)
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
                            { name: '💎 Recommended Pay', value: `${record.recommendedDiamonds} diamonds`, inline: true },
                            { name: '💎 Pay Range', value: `${record.diamondRangeMin}-${record.diamondRangeMax} diamonds`, inline: true }
                        )
                        .setFooter({ text: 'NewLife SMP | Guru Performance' })
                        .setTimestamp();
                    
                    // Add recent interactions
                    const recentInteractions = record.interactions.slice(-5).reverse();
                    if (recentInteractions.length > 0) {
                        let interactionList = '';
                        for (const i of recentInteractions) {
                            const outcomeEmoji = i.outcome === 'whitelisted' ? '✅' : i.outcome === 'denied' ? '❌' : i.outcome === 'abandoned' ? '⚠️' : '⏳';
                            const greetEmoji = i.didGreet ? '👋' : '';
                            interactionList += `${outcomeEmoji} ${i.mcUsername || 'Unknown'} - ${formatResponseTime(i.responseTimeMs)} ${greetEmoji}\n`;
                        }
                        embed.addFields({ name: 'Recent Activity', value: interactionList || 'None', inline: false });
                    }
                    
                    return interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error('[GuruTracking] Performance command error:', err);
                    return interaction.editReply({ content: 'Failed to fetch performance data.' });
                }
            }
            
            // REPORT - Manual trigger
            if (sub === 'report') {
                if (!isOwner(interaction.member)) {
                    return interaction.reply({ content: 'Permission denied. Owner only.', ephemeral: true });
                }
                
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    await sendWeeklyGuruReport(client);
                    return interaction.editReply({ content: '✅ Weekly report sent to your DMs.' });
                } catch (err) {
                    console.error('[GuruTracking] Report command error:', err);
                    return interaction.editReply({ content: 'Failed to send report.' });
                }
            }
            
            // HISTORY - Multi-week view
            if (sub === 'history') {
                if (!isOwner(interaction.member)) {
                    return interaction.reply({ content: 'Permission denied. Owner only.', ephemeral: true });
                }
                
                await interaction.deferReply({ ephemeral: true });
                
                try {
                    const targetUser = interaction.options.getUser('user');
                    const weeksBack = interaction.options.getInteger('weeks') || 4;
                    const guildId = interaction.guild.id;
                    
                    // Get records for past N weeks
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
                        .setTitle(`📈 ${targetUser.tag}'s Performance History`)
                        .setColor(0x00D4FF)
                        .setThumbnail(targetUser.displayAvatarURL())
                        .setTimestamp();
                    
                    let totalDiamonds = 0;
                    let totalWhitelists = 0;
                    
                    for (const record of records) {
                        const weekLabel = record.weekStart.toISOString().split('T')[0];
                        const emoji = getPerformanceEmoji(record.performanceScore);
                        
                        embed.addFields({
                            name: `${emoji} Week of ${weekLabel}`,
                            value: [
                                `Score: ${record.performanceScore}/100`,
                                `Whitelisted: ${record.totalWhitelisted}`,
                                `💎 ${record.recommendedDiamonds} diamonds`
                            ].join(' | '),
                            inline: false
                        });
                        
                        totalDiamonds += record.recommendedDiamonds;
                        totalWhitelists += record.totalWhitelisted;
                    }
                    
                    embed.addFields({
                        name: '📊 Totals',
                        value: `**Whitelists:** ${totalWhitelists} | **💎 Diamonds:** ${totalDiamonds}`,
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
    // Export tracking functions for use in other cogs
    trackGuruResponse,
    trackWhitelistSuccess,
    trackTicketDenied,
    trackTicketAbandoned,
    containsGreeting,
    // Export scheduler functions
    initGuruScheduler,
    stopGuruScheduler,
    sendWeeklyGuruReport,
    // Export constants
    WHITELIST_GURU_ROLE_ID
};
