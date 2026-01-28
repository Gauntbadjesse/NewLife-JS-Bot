/**
 * Server Restart Cog
 * Handles scheduled Minecraft server restarts with in-game notifications
 * 
 * Features:
 * - Daily restart at 12:00 AM CST (6:00 AM UTC)
 * - In-game countdown warnings (30s, 20s, 10s, 5s, 2s)
 * - Discord DM notification to owner on success/failure
 * - Manual restart command for admins
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Rcon } = require('rcon-client');
const cron = require('node-cron');
const { sendDm } = require('../utils/dm');

let scheduledTask = null;
let botClient = null;

const OWNER_ID = () => process.env.OWNER_ID || process.env.OWNER_USER_ID;

/**
 * Connect to RCON
 */
async function connectRcon() {
    const host = process.env.RCON_HOST;
    const port = parseInt(process.env.RCON_PORT) || 25575;
    const password = process.env.RCON_PASSWORD;

    if (!host || !password) {
        throw new Error('RCON credentials not configured (RCON_HOST, RCON_PASSWORD)');
    }

    const rcon = await Rcon.connect({
        host,
        port,
        password,
        timeout: 10000
    });

    return rcon;
}

/**
 * Send a broadcast message to the Minecraft server
 */
async function broadcast(rcon, message) {
    try {
        await rcon.send(`broadcast ${message}`);
    } catch (e) {
        console.error('[ServerRestart] Broadcast failed:', e.message);
    }
}

/**
 * Execute the server restart with countdown
 */
async function executeRestart(reason = 'Scheduled maintenance') {
    const ownerId = OWNER_ID();
    let rcon = null;
    let success = false;
    let errorMsg = null;

    console.log(`[ServerRestart] Starting restart sequence - ${reason}`);

    try {
        rcon = await connectRcon();
        console.log('[ServerRestart] Connected to RCON');

        // Send countdown warnings
        await broadcast(rcon, '&c[Server] &fRestarting in 30 seconds for scheduled maintenance!');
        await new Promise(r => setTimeout(r, 10000));

        await broadcast(rcon, '&c[Server] &fRestarting in 20 seconds!');
        await new Promise(r => setTimeout(r, 10000));

        await broadcast(rcon, '&c[Server] &fRestarting in 10 seconds!');
        await new Promise(r => setTimeout(r, 5000));

        await broadcast(rcon, '&c[Server] &fRestarting in 5 seconds!');
        await new Promise(r => setTimeout(r, 3000));

        await broadcast(rcon, '&c[Server] &fRestarting in 2 seconds!');
        await new Promise(r => setTimeout(r, 2000));

        // Send restart command
        console.log('[ServerRestart] Sending restart command...');
        const response = await rcon.send('restart');
        console.log('[ServerRestart] Restart response:', response);

        await rcon.end();
        success = true;
        console.log('[ServerRestart] Server restart initiated successfully');

    } catch (error) {
        errorMsg = error.message;
        console.error('[ServerRestart] Error:', error.message);

        if (rcon) {
            try {
                await rcon.end();
            } catch (e) {}
        }
    }

    // Send DM notification to owner
    if (botClient && ownerId) {
        const embed = new EmbedBuilder()
            .setTimestamp();

        if (success) {
            embed
                .setColor(0x57F287)
                .setTitle('✅ Server Restart Successful')
                .setDescription(`The Minecraft server has been restarted.`)
                .addFields(
                    { name: 'Reason', value: reason, inline: true },
                    { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                );
        } else {
            embed
                .setColor(0xED4245)
                .setTitle('❌ Server Restart Failed')
                .setDescription(`Failed to restart the Minecraft server.`)
                .addFields(
                    { name: 'Reason', value: reason, inline: true },
                    { name: 'Error', value: `\`\`\`${errorMsg}\`\`\``, inline: false }
                );
        }

        await sendDm(botClient, ownerId, { embeds: [embed] });
    }

    return { success, error: errorMsg };
}

/**
 * Initialize the scheduled restart task
 */
function initScheduler(client) {
    botClient = client;

    // Cancel existing task if any
    if (scheduledTask) {
        scheduledTask.stop();
    }

    // Schedule for 12:00 AM CST (6:00 AM UTC) every day
    // CST = UTC-6
    scheduledTask = cron.schedule('0 6 * * *', async () => {
        console.log('[ServerRestart] Scheduled restart triggered');
        await executeRestart('Daily scheduled restart');
    }, {
        timezone: 'UTC'
    });

    console.log('[ServerRestart] Daily restart scheduler initialized (12:00 AM CST / 6:00 AM UTC)');
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
        console.log('[ServerRestart] Scheduler stopped');
    }
}

// Slash commands
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('restart')
            .setDescription('Restart the Minecraft server (Admin only)')
            .addStringOption(o => o
                .setName('reason')
                .setDescription('Reason for restart')
                .setRequired(false))
            .addIntegerOption(o => o
                .setName('delay')
                .setDescription('Delay in seconds before countdown starts (default: 0)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(300))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        async execute(interaction, client) {
            // Double-check admin permission
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: '❌ You need Administrator permission to use this command.',
                    ephemeral: true
                });
            }

            const reason = interaction.options.getString('reason') || 'Manual restart by admin';
            const delay = interaction.options.getInteger('delay') || 0;

            await interaction.reply({
                content: `🔄 **Server restart initiated**\nReason: ${reason}${delay > 0 ? `\nStarting countdown in ${delay} seconds...` : '\nStarting countdown...'}`,
                ephemeral: false
            });

            // Wait for initial delay if specified
            if (delay > 0) {
                await new Promise(r => setTimeout(r, delay * 1000));
            }

            // Execute the restart
            botClient = client;
            const result = await executeRestart(reason);

            if (result.success) {
                await interaction.followUp({
                    content: '✅ Server restart command sent successfully!',
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    content: `❌ Restart failed: ${result.error}`,
                    ephemeral: true
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('restartstatus')
            .setDescription('Check the server restart scheduler status (Admin only)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        async execute(interaction) {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: '❌ You need Administrator permission to use this command.',
                    ephemeral: true
                });
            }

            const isRunning = scheduledTask !== null;
            const nextRun = isRunning ? 'Daily at 12:00 AM CST (6:00 AM UTC)' : 'Not scheduled';

            const embed = new EmbedBuilder()
                .setColor(isRunning ? 0x57F287 : 0xED4245)
                .setTitle('Server Restart Scheduler')
                .addFields(
                    { name: 'Status', value: isRunning ? '✅ Active' : '❌ Inactive', inline: true },
                    { name: 'Next Restart', value: nextRun, inline: true },
                    { name: 'RCON Host', value: process.env.RCON_HOST ? '✅ Configured' : '❌ Not set', inline: true }
                )
                .setFooter({ text: 'Use /restart to manually restart the server' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
];

module.exports = {
    slashCommands,
    initScheduler,
    stopScheduler,
    executeRestart
};
