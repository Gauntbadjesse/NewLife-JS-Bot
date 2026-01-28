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
        
        // Build main embed
        const embed = new EmbedBuilder()
            .setTitle('📊 Weekly Staff Activity Report')
            .setColor(0x10b981)
            .setDescription(`Staff activity summary for the past **7 days**\n\u200b`)
            .addFields(
                { name: '📋 Total Moderations', value: String(activity.totalActions), inline: true },
                { name: '🎫 Tickets Handled', value: String(totalTickets), inline: true },
                { name: '👥 Active Staff', value: String(activity.staffBreakdown.length), inline: true },
                { name: '\u200b', value: '\u200b', inline: false },
                { name: '🚫 Bans', value: String(activity.totalBans), inline: true },
                { name: '👢 Kicks', value: String(activity.totalKicks), inline: true },
                { name: '⚠️ Warnings', value: String(activity.totalWarnings), inline: true },
                { name: '🔇 Mutes', value: String(activity.totalMutes), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'NewLife SMP • Staff Tracking System' });
        
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
                return `\`${idx + 1}.\` **${tag}** — ${s.total} actions${details}`;
            }).join('\n');
            
            embed.addFields({
                name: '\u200b\n🏆 Staff Leaderboard',
                value: breakdown || 'No activity recorded',
                inline: false
            });
        }
        
        // Get staff count from guild
        if (guild) {
            await guild.members.fetch();
            const staffMembers = guild.members.cache.filter(m => m.roles.cache.has(STAFF_ROLE_ID));
            const activeStaffCount = activity.staffBreakdown.length;
            const inactiveStaffCount = Math.max(0, staffMembers.size - activeStaffCount);
            
            // Calculate activity percentage
            const activityRate = staffMembers.size > 0 
                ? ((activeStaffCount / staffMembers.size) * 100).toFixed(1) 
                : 0;
            
            embed.addFields({
                name: '\u200b\n📈 Team Statistics',
                value: `**Total Staff:** ${staffMembers.size}\n**Active (7d):** ${activeStaffCount} (${activityRate}%)\n**Inactive (7d):** ${inactiveStaffCount}`,
                inline: false
            });
            
            // List inactive staff if any
            if (inactiveStaffCount > 0 && inactiveStaffCount <= 10) {
                const activeIds = new Set(activity.staffBreakdown.map(s => s.id).filter(Boolean));
                const inactiveStaff = staffMembers
                    .filter(m => !activeIds.has(m.id))
                    .map(m => m.displayName || m.user.username)
                    .slice(0, 10);
                
                if (inactiveStaff.length > 0) {
                    embed.addFields({
                        name: '⚠️ Inactive Staff Members',
                        value: inactiveStaff.join(', ') || 'None',
                        inline: false
                    });
                }
            }
        }
        
        // Use sendDm utility for better error handling and logging
        const result = await sendDm(client, OWNER_ID, { embeds: [embed] });
        
        if (result.success) {
            console.log('[StaffTracking] Weekly report sent to owner successfully');
        } else {
            console.error('[StaffTracking] Failed to send weekly report:', result.error);
        }
        
        return result;
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
    getStaffActivity
};
