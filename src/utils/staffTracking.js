/**
 * Staff Tracking System
 * Tracks staff activity and sends weekly DM reports to the owner
 * Monitors cases handled, online time, ticket responses, and other staff metrics
 */

const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const ServerBan = require('../database/models/ServerBan');
const Kick = require('../database/models/Kick');
const Warning = require('../database/models/Warning');
const Mute = require('../database/models/Mute');
const GuruPerformance = require('../database/models/GuruPerformance');
const { sendDm } = require('./dm');

// Hardcoded owner ID for staff reports
const OWNER_ID = '1237471534541439068';
const STAFF_ROLE_ID = process.env.STAFF_TEAM || '1372672239245459498';
const GUILD_ID = process.env.GUILD_ID || '1372672239245459498';

/**
 * Get detailed staff activity for a specific staff member
 * @param {string} staffId - Discord ID of staff member
 * @param {number} days - Number of days to look back (default 7)
 * @returns {Promise<Object>} Detailed staff activity data
 */
async function getStaffMemberActivity(staffId, days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const [bans, kicks, warnings, mutes] = await Promise.all([
        ServerBan.find({ staffId, bannedAt: { $gte: startDate } }).sort({ bannedAt: -1 }).lean(),
        Kick.find({ staffId, kickedAt: { $gte: startDate } }).sort({ kickedAt: -1 }).lean(),
        Warning.find({ staffId, createdAt: { $gte: startDate } }).sort({ createdAt: -1 }).lean(),
        Mute.find({ staffId, createdAt: { $gte: startDate } }).sort({ createdAt: -1 }).lean()
    ]);
    
    // Get all-time stats
    const [allTimeBans, allTimeKicks, allTimeWarnings, allTimeMutes] = await Promise.all([
        ServerBan.countDocuments({ staffId }),
        Kick.countDocuments({ staffId }),
        Warning.countDocuments({ staffId }),
        Mute.countDocuments({ staffId })
    ]);
    
    // Get ticket activity
    let ticketsThisWeek = 0;
    let allTimeTickets = 0;
    try {
        const guruRecord = await GuruPerformance.findOne({ discordId: staffId }).lean();
        if (guruRecord && guruRecord.interactions) {
            ticketsThisWeek = guruRecord.interactions.filter(i => 
                new Date(i.timestamp) >= startDate
            ).length;
            allTimeTickets = guruRecord.interactions.length;
        }
    } catch (e) {
        console.error('[StaffTracking] Error fetching guru data:', e.message);
    }
    
    return {
        thisWeek: {
            bans: bans.length,
            kicks: kicks.length,
            warnings: warnings.length,
            mutes: mutes.length,
            tickets: ticketsThisWeek,
            total: bans.length + kicks.length + warnings.length + mutes.length + ticketsThisWeek
        },
        allTime: {
            bans: allTimeBans,
            kicks: allTimeKicks,
            warnings: allTimeWarnings,
            mutes: allTimeMutes,
            tickets: allTimeTickets,
            total: allTimeBans + allTimeKicks + allTimeWarnings + allTimeMutes + allTimeTickets
        },
        recentActions: [
            ...bans.slice(0, 3).map(b => ({ type: 'Ban', target: b.discordTag || b.minecraftUsername, reason: b.reason, date: b.bannedAt })),
            ...kicks.slice(0, 3).map(k => ({ type: 'Kick', target: k.discordTag || k.minecraftUsername, reason: k.reason, date: k.kickedAt })),
            ...warnings.slice(0, 3).map(w => ({ type: 'Warning', target: w.discordTag || w.targetName, reason: w.reason, date: w.createdAt })),
            ...mutes.slice(0, 3).map(m => ({ type: 'Mute', target: m.discordTag, reason: m.reason, date: m.createdAt }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5)
    };
}

/**
 * Get staff activity for the past week
 * @param {string} staffId - Discord ID of staff member (optional)
 * @returns {Promise<Object>} Staff activity data
 */
async function getStaffActivity(staffId = null) {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const query = staffId ? { staffId } : {};
    const timeQuery = { ...query, createdAt: { $gte: oneWeekAgo } };
    const banTimeQuery = { ...query, bannedAt: { $gte: oneWeekAgo } };
    const kickTimeQuery = { ...query, kickedAt: { $gte: oneWeekAgo } };
    
    const [bans, kicks, warnings, mutes] = await Promise.all([
        ServerBan.find(banTimeQuery).lean(),
        Kick.find(kickTimeQuery).lean(),
        Warning.find(timeQuery).lean(),
        Mute.find(timeQuery).lean()
    ]);
    
    // Group by staff
    const staffMap = new Map();
    
    for (const ban of bans) {
        const key = ban.staffId || ban.staffTag || 'Unknown';
        if (!staffMap.has(key)) {
            staffMap.set(key, { 
                id: ban.staffId, 
                tag: ban.staffTag, 
                bans: 0, 
                kicks: 0, 
                warnings: 0, 
                mutes: 0, 
                tickets: 0,
                total: 0 
            });
        }
        const staff = staffMap.get(key);
        staff.bans++;
        staff.total++;
    }
    
    for (const kick of kicks) {
        const key = kick.staffId || kick.staffTag || 'Unknown';
        if (!staffMap.has(key)) {
            staffMap.set(key, { 
                id: kick.staffId, 
                tag: kick.staffTag, 
                bans: 0, 
                kicks: 0, 
                warnings: 0, 
                mutes: 0, 
                tickets: 0,
                total: 0 
            });
        }
        const staff = staffMap.get(key);
        staff.kicks++;
        staff.total++;
    }
    
    for (const warning of warnings) {
        const key = warning.staffId || warning.staffName || 'Unknown';
        if (!staffMap.has(key)) {
            staffMap.set(key, { 
                id: warning.staffId, 
                tag: warning.staffName, 
                bans: 0, 
                kicks: 0, 
                warnings: 0, 
                mutes: 0, 
                tickets: 0,
                total: 0 
            });
        }
        const staff = staffMap.get(key);
        staff.warnings++;
        staff.total++;
    }
    
    for (const mute of mutes) {
        const key = mute.staffId || mute.staffTag || 'Unknown';
        if (!staffMap.has(key)) {
            staffMap.set(key, { 
                id: mute.staffId, 
                tag: mute.staffTag, 
                bans: 0, 
                kicks: 0, 
                warnings: 0, 
                mutes: 0, 
                tickets: 0,
                total: 0 
            });
        }
        const staff = staffMap.get(key);
        staff.mutes++;
        staff.total++;
    }
    
    // Get ticket activity from GuruPerformance (whitelist gurus)
    try {
        const guruRecords = await GuruPerformance.find({
            'interactions.timestamp': { $gte: oneWeekAgo }
        }).lean();
        
        for (const guru of guruRecords) {
            const weeklyInteractions = guru.interactions.filter(i => 
                new Date(i.timestamp) >= oneWeekAgo
            );
            
            if (weeklyInteractions.length > 0) {
                const key = guru.discordId || guru.discordUsername || 'Unknown';
                if (!staffMap.has(key)) {
                    staffMap.set(key, { 
                        id: guru.discordId, 
                        tag: guru.discordUsername, 
                        bans: 0, 
                        kicks: 0, 
                        warnings: 0, 
                        mutes: 0, 
                        tickets: 0,
                        total: 0 
                    });
                }
                const staff = staffMap.get(key);
                staff.tickets += weeklyInteractions.length;
                staff.total += weeklyInteractions.length;
            }
        }
    } catch (e) {
        console.error('[StaffTracking] Error fetching guru performance:', e.message);
    }
    
    return {
        totalBans: bans.length,
        totalKicks: kicks.length,
        totalWarnings: warnings.length,
        totalMutes: mutes.length,
        totalActions: bans.length + kicks.length + warnings.length + mutes.length,
        staffBreakdown: Array.from(staffMap.values()).sort((a, b) => b.total - a.total)
    };
}

/**
 * Send weekly staff report to owner
 * @param {Client} client - Discord client
 */
async function sendWeeklyStaffReport(client) {
    try {
        console.log('[StaffTracking] Generating weekly staff report...');
        console.log(`[StaffTracking] Sending report to owner: ${OWNER_ID}`);
        
        const activity = await getStaffActivity();
        const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
        
        // Calculate total tickets from breakdown
        const totalTickets = activity.staffBreakdown.reduce((sum, s) => sum + (s.tickets || 0), 0);
        
        // Build main summary embed
        const summaryEmbed = new EmbedBuilder()
            .setTitle('Weekly Staff Activity Report')
            .setColor(0x10b981)
            .setDescription(`Staff activity summary for the past **7 days**\n\u200b`)
            .addFields(
                { name: 'Total Moderations', value: String(activity.totalActions), inline: true },
                { name: 'Tickets Handled', value: String(totalTickets), inline: true },
                { name: 'Active Staff', value: String(activity.staffBreakdown.length), inline: true },
                { name: '\u200b', value: '\u200b', inline: false },
                { name: 'Bans', value: String(activity.totalBans), inline: true },
                { name: 'Kicks', value: String(activity.totalKicks), inline: true },
                { name: 'Warnings', value: String(activity.totalWarnings), inline: true },
                { name: 'Mutes', value: String(activity.totalMutes), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'NewLife SMP | Staff Tracking System' });
        
        // Add top staff breakdown with detailed stats
        if (activity.staffBreakdown.length > 0) {
            const topStaff = activity.staffBreakdown.slice(0, 15);
            const breakdown = topStaff.map((s, idx) => {
                const tag = s.tag || s.id || 'Unknown';
                const parts = [];
                if (s.bans > 0) parts.push(`${s.bans}B`);
                if (s.kicks > 0) parts.push(`${s.kicks}K`);
                if (s.warnings > 0) parts.push(`${s.warnings}W`);
                if (s.mutes > 0) parts.push(`${s.mutes}M`);
                if (s.tickets > 0) parts.push(`${s.tickets}T`);
                const details = parts.length > 0 ? ` (${parts.join(' ')})` : '';
                return `\`${idx + 1}.\` **${tag}** - ${s.total} actions${details}`;
            }).join('\n');
            
            summaryEmbed.addFields({
                name: '\u200b\nStaff Leaderboard',
                value: breakdown || 'No activity recorded',
                inline: false
            });
        }
        
        // Get staff members from guild for inactive tracking and individual reports
        let staffMembers = null;
        let inactiveStaff = [];
        
        if (guild) {
            await guild.members.fetch();
            staffMembers = guild.members.cache.filter(m => m.roles.cache.has(STAFF_ROLE_ID));
            const activeStaffCount = activity.staffBreakdown.length;
            const inactiveStaffCount = Math.max(0, staffMembers.size - activeStaffCount);
            
            // Calculate activity percentage
            const activityRate = staffMembers.size > 0 
                ? ((activeStaffCount / staffMembers.size) * 100).toFixed(1) 
                : 0;
            
            summaryEmbed.addFields({
                name: '\u200b\nTeam Statistics',
                value: `**Total Staff:** ${staffMembers.size}\n**Active (7d):** ${activeStaffCount} (${activityRate}%)\n**Inactive (7d):** ${inactiveStaffCount}`,
                inline: false
            });
            
            // Identify inactive staff
            const activeIds = new Set(activity.staffBreakdown.map(s => s.id).filter(Boolean));
            inactiveStaff = staffMembers
                .filter(m => !activeIds.has(m.id))
                .map(m => ({ id: m.id, name: m.displayName || m.user.username, tag: m.user.tag }));
            
            if (inactiveStaff.length > 0 && inactiveStaff.length <= 15) {
                summaryEmbed.addFields({
                    name: 'Inactive Staff Members',
                    value: inactiveStaff.map(s => s.name).join(', ') || 'None',
                    inline: false
                });
            }
        }
        
        // Send main summary embed first
        const result = await sendDm(client, OWNER_ID, { embeds: [summaryEmbed] });
        
        if (!result.success) {
            console.error('[StaffTracking] Failed to send summary report:', result.error);
            return result;
        }
        
        console.log('[StaffTracking] Summary report sent, now generating individual staff reports...');
        
        // Generate individual staff member reports
        const allStaffToReport = [];
        
        // Add active staff with their activity
        for (const staffData of activity.staffBreakdown) {
            if (staffData.id) {
                const member = staffMembers?.get(staffData.id);
                allStaffToReport.push({
                    id: staffData.id,
                    name: member?.displayName || staffData.tag || 'Unknown',
                    tag: member?.user?.tag || staffData.tag || 'Unknown',
                    avatar: member?.user?.displayAvatarURL({ size: 64 }) || null,
                    isActive: true
                });
            }
        }
        
        // Add inactive staff
        for (const staff of inactiveStaff) {
            const member = staffMembers?.get(staff.id);
            allStaffToReport.push({
                id: staff.id,
                name: staff.name,
                tag: staff.tag,
                avatar: member?.user?.displayAvatarURL({ size: 64 }) || null,
                isActive: false
            });
        }
        
        // Build individual embeds (max 10 per message due to Discord limits)
        const individualEmbeds = [];
        
        for (const staff of allStaffToReport) {
            const staffActivity = await getStaffMemberActivity(staff.id);
            
            // Determine performance rating
            let rating = 'Inactive';
            let ratingColor = 0x6b7280; // Gray
            
            if (staffActivity.thisWeek.total > 0) {
                if (staffActivity.thisWeek.total >= 20) {
                    rating = 'Excellent';
                    ratingColor = 0x10b981; // Green
                } else if (staffActivity.thisWeek.total >= 10) {
                    rating = 'Good';
                    ratingColor = 0x3b82f6; // Blue
                } else if (staffActivity.thisWeek.total >= 5) {
                    rating = 'Moderate';
                    ratingColor = 0xf59e0b; // Yellow
                } else {
                    rating = 'Low';
                    ratingColor = 0xef4444; // Red
                }
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`${staff.name}`)
                .setColor(ratingColor)
                .setDescription(`**Performance Rating:** ${rating}\n**Discord:** ${staff.tag}`)
                .addFields(
                    { name: 'This Week', value: '\u200b', inline: false },
                    { name: 'Bans', value: String(staffActivity.thisWeek.bans), inline: true },
                    { name: 'Kicks', value: String(staffActivity.thisWeek.kicks), inline: true },
                    { name: 'Warnings', value: String(staffActivity.thisWeek.warnings), inline: true },
                    { name: 'Mutes', value: String(staffActivity.thisWeek.mutes), inline: true },
                    { name: 'Tickets', value: String(staffActivity.thisWeek.tickets), inline: true },
                    { name: 'Weekly Total', value: String(staffActivity.thisWeek.total), inline: true },
                    { name: '\u200b\nAll-Time Stats', value: '\u200b', inline: false },
                    { name: 'Total Actions', value: String(staffActivity.allTime.total), inline: true },
                    { name: 'Bans', value: String(staffActivity.allTime.bans), inline: true },
                    { name: 'Kicks', value: String(staffActivity.allTime.kicks), inline: true }
                );
            
            // Add recent actions if any
            if (staffActivity.recentActions.length > 0) {
                const recentList = staffActivity.recentActions.map(a => {
                    const date = new Date(a.date);
                    const dateStr = `<t:${Math.floor(date.getTime() / 1000)}:R>`;
                    const reason = a.reason ? (a.reason.length > 30 ? a.reason.substring(0, 30) + '...' : a.reason) : 'No reason';
                    return `**${a.type}** ${a.target || 'Unknown'} - ${reason} (${dateStr})`;
                }).join('\n');
                
                embed.addFields({
                    name: '\u200b\nRecent Actions',
                    value: recentList,
                    inline: false
                });
            }
            
            if (staff.avatar) {
                embed.setThumbnail(staff.avatar);
            }
            
            embed.setFooter({ text: `Staff ID: ${staff.id}` });
            
            individualEmbeds.push(embed);
        }
        
        // Send individual reports in batches of 10 (Discord limit)
        for (let i = 0; i < individualEmbeds.length; i += 10) {
            const batch = individualEmbeds.slice(i, i + 10);
            await sendDm(client, OWNER_ID, { embeds: batch });
            
            // Small delay between batches to avoid rate limits
            if (i + 10 < individualEmbeds.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log(`[StaffTracking] Sent ${individualEmbeds.length} individual staff reports`);
        console.log('[StaffTracking] Weekly report completed successfully');
        
        return { success: true };
    } catch (error) {
        console.error('[StaffTracking] Error sending weekly report:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Initialize staff tracking system
 * Sets up weekly cron job to send reports
 * @param {Client} client - Discord client
 */
function initStaffTracking(client) {
    console.log('[StaffTracking] Initializing staff tracking system...');
    console.log(`[StaffTracking] Weekly reports will be sent to: ${OWNER_ID}`);
    
    // Schedule weekly report every Monday at 9:00 AM UTC
    cron.schedule('0 9 * * 1', async () => {
        await sendWeeklyStaffReport(client);
    }, {
        timezone: 'UTC'
    });
    
    console.log('[StaffTracking] Scheduled weekly reports for Mondays at 9:00 AM UTC');
}

/**
 * Manual trigger for testing
 * @param {Client} client - Discord client
 */
async function sendTestReport(client) {
    return await sendWeeklyStaffReport(client);
}

module.exports = {
    initStaffTracking,
    sendWeeklyStaffReport,
    sendTestReport,
    getStaffActivity,
    getStaffMemberActivity
};
