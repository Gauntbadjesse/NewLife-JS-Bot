/**
 * Weekly Stats Cog
 * Tracks /whitelist add usage and DMs owner weekly
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const WeeklyStats = require('../database/models/WeeklyStats');
const { isAdmin, isOwner } = require('../utils/permissions');
const cron = require('node-cron');

let scheduledTask = null;

/**
 * Get current week boundaries (Monday to Sunday)
 */
function getCurrentWeekBounds() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    return { weekStart, weekEnd };
}

/**
 * Get or create current week stats
 */
async function getCurrentWeekStats() {
    const { weekStart, weekEnd } = getCurrentWeekBounds();
    
    let stats = await WeeklyStats.findOne({
        weekStart: { $lte: new Date() },
        weekEnd: { $gte: new Date() }
    });
    
    if (!stats) {
        stats = new WeeklyStats({
            weekStart,
            weekEnd,
            stats: [],
            totalAdds: 0,
            sentToOwner: false
        });
        await stats.save();
    }
    
    return stats;
}

/**
 * Track a whitelist add usage
 */
async function trackWhitelistAdd(userId, username) {
    const stats = await getCurrentWeekStats();
    
    const userStat = stats.stats.find(s => s.userId === userId);
    if (userStat) {
        userStat.count += 1;
    } else {
        stats.stats.push({
            userId,
            username,
            count: 1
        });
    }
    
    stats.totalAdds += 1;
    await stats.save();
}

/**
 * Send weekly report to owner
 */
async function sendWeeklyReport(client) {
    const ownerId = process.env.OWNER_ID || process.env.OWNER_USER_ID;
    if (!ownerId) {
        console.error('Owner ID not configured for weekly stats');
        return;
    }

    // Get last week's stats (the week that just ended)
    const now = new Date();
    const { weekStart: currentWeekStart } = getCurrentWeekBounds();
    
    // Find stats for the previous week
    const lastWeekEnd = new Date(currentWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    lastWeekEnd.setHours(23, 59, 59, 999);
    
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
    lastWeekStart.setHours(0, 0, 0, 0);

    const stats = await WeeklyStats.findOne({
        weekStart: { $gte: lastWeekStart, $lte: lastWeekEnd }
    });

    if (!stats || stats.sentToOwner) {
        console.log('Weekly stats already sent or no stats to send');
        return;
    }

    try {
        const owner = await client.users.fetch(ownerId);
        if (!owner) {
            console.error('Could not fetch owner user');
            return;
        }

        // Build the report
        const embed = new EmbedBuilder()
            .setTitle('Weekly Whitelist Report')
            .setDescription(`Week of ${lastWeekStart.toLocaleDateString()} - ${lastWeekEnd.toLocaleDateString()}`)
            .setColor('#3b82f6')
            .setTimestamp();

        // Sort by count descending
        const sortedStats = stats.stats.sort((a, b) => b.count - a.count);

        if (sortedStats.length === 0) {
            embed.addFields({
                name: 'Usage',
                value: 'No whitelist additions this week.'
            });
        } else {
            let leaderboard = '';
            let rank = 1;
            for (const stat of sortedStats.slice(0, 15)) {
                const medal = rank <= 3 ? `#${rank}` : `${rank}.`;
                leaderboard += `${medal} **${stat.username}** - ${stat.count} adds\n`;
                rank++;
            }

            embed.addFields(
                { name: 'Staff Leaderboard', value: leaderboard || 'No data', inline: false },
                { name: 'Total Whitelist Adds', value: `${stats.totalAdds}`, inline: true },
                { name: 'Active Staff', value: `${stats.stats.length}`, inline: true }
            );

            // Calculate averages
            if (stats.stats.length > 0) {
                const avg = (stats.totalAdds / stats.stats.length).toFixed(1);
                embed.addFields({ name: 'Avg per Staff', value: avg, inline: true });
            }
        }

        embed.setFooter({ text: 'NewLife SMP Weekly Report • Use /weekstats for current week' });

        await owner.send({ embeds: [embed] });
        
        // Mark as sent
        stats.sentToOwner = true;
        await stats.save();
        
        console.log('Weekly whitelist report sent to owner');
    } catch (error) {
        console.error('Failed to send weekly report:', error);
    }
}

/**
 * Initialize the weekly scheduler
 */
function initScheduler(client) {
    // Schedule for every Monday at 9 AM
    scheduledTask = cron.schedule('0 9 * * 1', async () => {
        console.log('Running weekly whitelist stats report...');
        await sendWeeklyReport(client);
    }, {
        timezone: 'America/New_York'
    });

    console.log('Weekly stats scheduler initialized');
}

/**
 * Cleanup scheduler
 */
function stopScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('weekstats')
            .setDescription('View whitelist stats')
            .addSubcommand(sub => sub
                .setName('current')
                .setDescription('View current week stats')
            )
            .addSubcommand(sub => sub
                .setName('send')
                .setDescription('Manually send weekly report to owner (Owner only)')
            )
            .addSubcommand(sub => sub
                .setName('history')
                .setDescription('View past week stats')
                .addIntegerOption(opt => opt.setName('weeks').setDescription('How many weeks back (1-10)').setRequired(false))
            ),

        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();

            if (sub === 'current') {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({ content: 'Permission denied.', ephemeral: true });
                }

                const stats = await getCurrentWeekStats();
                const { weekStart, weekEnd } = getCurrentWeekBounds();

                const embed = new EmbedBuilder()
                    .setTitle('Current Week Whitelist Stats')
                    .setDescription(`${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`)
                    .setColor('#3b82f6');

                const sortedStats = stats.stats.sort((a, b) => b.count - a.count);

                if (sortedStats.length === 0) {
                    embed.addFields({ name: 'Usage', value: 'No whitelist additions this week yet.' });
                } else {
                    let leaderboard = '';
                    let rank = 1;
                    for (const stat of sortedStats.slice(0, 15)) {
                        const medal = rank <= 3 ? `#${rank}` : `${rank}.`;
                        leaderboard += `${medal} **${stat.username}** - ${stat.count} adds\n`;
                        rank++;
                    }

                    embed.addFields(
                        { name: 'Staff Leaderboard', value: leaderboard, inline: false },
                        { name: 'Total', value: `${stats.totalAdds}`, inline: true },
                        { name: 'Staff', value: `${stats.stats.length}`, inline: true }
                    );
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (sub === 'send') {
                if (!isOwner(interaction.member)) {
                    return interaction.reply({ content: 'Only the owner can manually send reports.', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });
                await sendWeeklyReport(client);
                return interaction.editReply({ content: 'Weekly report sent (if there was one to send).' });
            }

            if (sub === 'history') {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({ content: 'Permission denied.', ephemeral: true });
                }

                const weeksBack = interaction.options.getInteger('weeks') || 1;
                const now = new Date();
                const { weekStart: currentWeekStart } = getCurrentWeekBounds();

                // Calculate target week
                const targetWeekEnd = new Date(currentWeekStart);
                targetWeekEnd.setDate(targetWeekEnd.getDate() - (7 * (weeksBack - 1)) - 1);
                
                const targetWeekStart = new Date(targetWeekEnd);
                targetWeekStart.setDate(targetWeekEnd.getDate() - 6);

                const stats = await WeeklyStats.findOne({
                    weekStart: { $gte: targetWeekStart },
                    weekEnd: { $lte: new Date(targetWeekEnd.getTime() + 86400000) }
                });

                const embed = new EmbedBuilder()
                    .setTitle(`Whitelist Stats (${weeksBack} week${weeksBack > 1 ? 's' : ''} ago)`)
                    .setDescription(`${targetWeekStart.toLocaleDateString()} - ${targetWeekEnd.toLocaleDateString()}`)
                    .setColor('#6366f1');

                if (!stats || stats.stats.length === 0) {
                    embed.addFields({ name: 'Data', value: 'No stats found for this period.' });
                } else {
                    let leaderboard = '';
                    const sortedStats = stats.stats.sort((a, b) => b.count - a.count);
                    let rank = 1;
                    for (const stat of sortedStats.slice(0, 15)) {
                        const medal = rank <= 3 ? `#${rank}` : `${rank}.`;
                        leaderboard += `${medal} **${stat.username}** - ${stat.count} adds\n`;
                        rank++;
                    }

                    embed.addFields(
                        { name: 'Staff Leaderboard', value: leaderboard, inline: false },
                        { name: 'Total', value: `${stats.totalAdds}`, inline: true }
                    );
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    }
];

module.exports = {
    name: 'WeeklyStats',
    slashCommands,
    trackWhitelistAdd,
    getCurrentWeekStats,
    sendWeeklyReport,
    initScheduler,
    stopScheduler
};
