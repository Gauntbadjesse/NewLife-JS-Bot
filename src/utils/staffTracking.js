/**
 * Staff Tracking System
 * Tracks staff activity and sends weekly DM reports to the owner
 * Monitors cases handled, online time, and other staff metrics
 */

const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const ServerBan = require('../database/models/ServerBan');
const Kick = require('../database/models/Kick');
const Warning = require('../database/models/Warning');
const Mute = require('../database/models/Mute');

const OWNER_ID = process.env.OWNER_ID || '1215431991893872751'; // Your Discord ID
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
            staffMap.set(key, { id: ban.staffId, tag: ban.staffTag, bans: 0, kicks: 0, warnings: 0, mutes: 0, total: 0 });
        }
        const staff = staffMap.get(key);
        staff.bans++;
        staff.total++;
    }
    
    for (const kick of kicks) {
        const key = kick.staffId || kick.staffTag || 'Unknown';
        if (!staffMap.has(key)) {
            staffMap.set(key, { id: kick.staffId, tag: kick.staffTag, bans: 0, kicks: 0, warnings: 0, mutes: 0, total: 0 });
        }
        const staff = staffMap.get(key);
        staff.kicks++;
        staff.total++;
    }
    
    for (const warning of warnings) {
        const key = warning.staffId || warning.staffName || 'Unknown';
        if (!staffMap.has(key)) {
            staffMap.set(key, { id: warning.staffId, tag: warning.staffName, bans: 0, kicks: 0, warnings: 0, mutes: 0, total: 0 });
        }
        const staff = staffMap.get(key);
        staff.warnings++;
        staff.total++;
    }
    
    for (const mute of mutes) {
        const key = mute.staffId || mute.staffTag || 'Unknown';
        if (!staffMap.has(key)) {
            staffMap.set(key, { id: mute.staffId, tag: mute.staffTag, bans: 0, kicks: 0, warnings: 0, mutes: 0, total: 0 });
        }
        const staff = staffMap.get(key);
        staff.mutes++;
        staff.total++;
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
        
        const activity = await getStaffActivity();
        const owner = await client.users.fetch(OWNER_ID).catch(() => null);
        
        if (!owner) {
            console.error('[StaffTracking] Could not find owner user');
            return;
        }
        
        const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
        
        // Build embed
        const embed = new EmbedBuilder()
            .setTitle('📊 Weekly Staff Activity Report')
            .setColor(0x10b981)
            .setDescription(`Staff moderation activity for the past 7 days`)
            .addFields(
                { name: '📋 Total Actions', value: String(activity.totalActions), inline: true },
                { name: '🚫 Bans', value: String(activity.totalBans), inline: true },
                { name: '👢 Kicks', value: String(activity.totalKicks), inline: true },
                { name: '⚠️ Warnings', value: String(activity.totalWarnings), inline: true },
                { name: '🔇 Mutes', value: String(activity.totalMutes), inline: true },
                { name: '👥 Active Staff', value: String(activity.staffBreakdown.length), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'NewLife SMP Staff Tracking' });
        
        // Add top staff breakdown
        if (activity.staffBreakdown.length > 0) {
            const topStaff = activity.staffBreakdown.slice(0, 10);
            const breakdown = topStaff.map((s, idx) => {
                const tag = s.tag || s.id || 'Unknown';
                return `${idx + 1}. **${tag}** - ${s.total} actions (${s.bans}B ${s.kicks}K ${s.warnings}W ${s.mutes}M)`;
            }).join('\n');
            
            embed.addFields({
                name: '🏆 Top Staff Members',
                value: breakdown || 'No activity',
                inline: false
            });
        }
        
        // Get staff count from guild
        if (guild) {
            await guild.members.fetch();
            const staffMembers = guild.members.cache.filter(m => m.roles.cache.has(STAFF_ROLE_ID));
            const activeStaffCount = activity.staffBreakdown.length;
            const inactiveStaffCount = staffMembers.size - activeStaffCount;
            
            embed.addFields({
                name: '📈 Staff Statistics',
                value: `Total Staff: ${staffMembers.size}\nActive (7d): ${activeStaffCount}\nInactive (7d): ${inactiveStaffCount}`,
                inline: false
            });
        }
        
        await owner.send({ embeds: [embed] });
        console.log('[StaffTracking] Weekly report sent to owner');
    } catch (error) {
        console.error('[StaffTracking] Error sending weekly report:', error);
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
    await sendWeeklyStaffReport(client);
}

module.exports = {
    initStaffTracking,
    sendWeeklyStaffReport,
    sendTestReport,
    getStaffActivity
};
