/**
 * Server Restart Cog
 * Handles scheduled Minecraft server restarts with in-game notifications
 * 
 * Features:
 * - Daily restart at 12:00 AM CST (6:00 AM UTC)
 * - Scheduled restarts with /restart schedule <minutes>
 * - In-game countdown warnings (15m, 10m, 5m, 1m, 30s, 10s, 5, 4, 3, 2, 1)
 * - Discord DM notification to owner on success/failure
 * - Manual restart command for admins
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Rcon } = require('rcon-client');
const cron = require('node-cron');
const { sendDm } = require('../utils/dm');

let scheduledTask = null;
let scheduledRestartTimer = null;
let scheduledRestartTime = null;
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
 * Send a broadcast message to the Minecraft server using tellraw for formatting
 */
async function broadcastTellraw(rcon, message, color = 'red') {
    try {
        // Build tellraw JSON - send to all players (@a)
        const tellrawJson = JSON.stringify([
            { text: '[', color: 'dark_gray' },
            { text: 'Server', color: 'red', bold: true },
            { text: '] ', color: 'dark_gray' },
            { text: message, color: color }
        ]);
        await rcon.send(`tellraw @a ${tellrawJson}`);
    } catch (e) {
        console.error('[ServerRestart] Tellraw broadcast failed:', e.message);
        // Fallback to regular broadcast
        try {
            await rcon.send(`broadcast &c[Server] &f${message}`);
        } catch (e2) {
            console.error('[ServerRestart] Fallback broadcast also failed:', e2.message);
        }
    }
}

/**
 * Send a title to all players
 */
async function sendTitle(rcon, title, subtitle = '', fadeIn = 10, stay = 70, fadeOut = 20) {
    try {
        await rcon.send(`title @a times ${fadeIn} ${stay} ${fadeOut}`);
        if (subtitle) {
            const subtitleJson = JSON.stringify({ text: subtitle, color: 'gray' });
            await rcon.send(`title @a subtitle ${subtitleJson}`);
        }
        const titleJson = JSON.stringify({ text: title, color: 'red', bold: true });
        await rcon.send(`title @a title ${titleJson}`);
    } catch (e) {
        console.error('[ServerRestart] Title failed:', e.message);
    }
}

/**
 * Play a sound to all players
 */
async function playSound(rcon, sound = 'minecraft:block.note_block.pling') {
    try {
        await rcon.send(`playsound ${sound} master @a ~ ~ ~ 1 1`);
    } catch (e) {
        // Sound is optional, silently fail
    }
}

/**
 * Execute the server restart with countdown (30 second countdown)
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

        // Send countdown warnings with tellraw
        await broadcastTellraw(rcon, 'Server restarting in 30 seconds!', 'yellow');
        await playSound(rcon);
        await new Promise(r => setTimeout(r, 10000));

        await broadcastTellraw(rcon, 'Server restarting in 20 seconds!', 'yellow');
        await playSound(rcon);
        await new Promise(r => setTimeout(r, 10000));

        await broadcastTellraw(rcon, 'Server restarting in 10 seconds! Wrap up your stuff!', 'gold');
        await sendTitle(rcon, '10 seconds', 'Server restarting soon!');
        await playSound(rcon);
        await new Promise(r => setTimeout(r, 5000));

        await broadcastTellraw(rcon, 'Server restarting in 5 seconds!', 'red');
        await sendTitle(rcon, '5', 'Server restarting!', 5, 20, 5);
        await playSound(rcon);
        await new Promise(r => setTimeout(r, 1000));

        await sendTitle(rcon, '4', '', 0, 20, 0);
        await playSound(rcon);
        await new Promise(r => setTimeout(r, 1000));

        await sendTitle(rcon, '3', '', 0, 20, 0);
        await playSound(rcon);
        await new Promise(r => setTimeout(r, 1000));

        await sendTitle(rcon, '2', '', 0, 20, 0);
        await playSound(rcon);
        await new Promise(r => setTimeout(r, 1000));

        await sendTitle(rcon, '1', '', 0, 20, 0);
        await playSound(rcon, 'minecraft:block.note_block.bell');
        await new Promise(r => setTimeout(r, 1000));

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
 * Schedule a restart in X minutes with countdown warnings
 */
async function scheduleRestart(minutes, reason = 'Scheduled restart') {
    // Cancel any existing scheduled restart
    cancelScheduledRestart();
    
    const restartTime = Date.now() + (minutes * 60 * 1000);
    scheduledRestartTime = restartTime;
    
    console.log(`[ServerRestart] Scheduling restart in ${minutes} minutes`);
    
    // Warning intervals in minutes before restart
    const warningMinutes = [15, 10, 5, 1];
    const warningTimeouts = [];
    
    // Connect to RCON for warnings
    let rcon = null;
    try {
        rcon = await connectRcon();
    } catch (e) {
        console.error('[ServerRestart] Failed to connect RCON for scheduled restart:', e.message);
        return { success: false, error: e.message };
    }
    
    // Initial announcement
    await broadcastTellraw(rcon, `Server will restart in ${minutes} minute${minutes !== 1 ? 's' : ''}!`, 'yellow');
    await playSound(rcon);
    
    // Schedule warning messages
    for (const warnMin of warningMinutes) {
        if (warnMin < minutes) {
            const delay = (minutes - warnMin) * 60 * 1000;
            const timeout = setTimeout(async () => {
                try {
                    const conn = await connectRcon();
                    if (warnMin === 1) {
                        await broadcastTellraw(conn, `Server restarting in 1 minute! Wrap up your stuff!`, 'gold');
                        await sendTitle(conn, '1 minute', 'Server restarting soon!');
                    } else {
                        await broadcastTellraw(conn, `Server restarting in ${warnMin} minutes!`, 'yellow');
                    }
                    await playSound(conn);
                    await conn.end();
                } catch (e) {
                    console.error(`[ServerRestart] Warning at ${warnMin}m failed:`, e.message);
                }
            }, delay);
            warningTimeouts.push(timeout);
        }
    }
    
    // Schedule 30-second countdown (30 seconds before restart)
    const countdownDelay = (minutes * 60 * 1000) - 30000;
    if (countdownDelay > 0) {
        const countdownTimeout = setTimeout(async () => {
            // Execute the final 30-second countdown and restart
            await executeRestart(reason);
            scheduledRestartTime = null;
        }, countdownDelay);
        warningTimeouts.push(countdownTimeout);
    } else {
        // Less than 30 seconds, execute immediately
        setTimeout(async () => {
            await executeRestart(reason);
            scheduledRestartTime = null;
        }, minutes * 60 * 1000);
    }
    
    // Store all timeouts for cancellation
    scheduledRestartTimer = warningTimeouts;
    
    await rcon.end();
    return { success: true, restartTime };
}

/**
 * Cancel a scheduled restart
 */
function cancelScheduledRestart() {
    if (scheduledRestartTimer) {
        if (Array.isArray(scheduledRestartTimer)) {
            scheduledRestartTimer.forEach(t => clearTimeout(t));
        } else {
            clearTimeout(scheduledRestartTimer);
        }
        scheduledRestartTimer = null;
    }
    scheduledRestartTime = null;
    console.log('[ServerRestart] Scheduled restart cancelled');
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
            .setDescription('Manage server restarts (Admin only)')
            .addSubcommand(sub => sub
                .setName('now')
                .setDescription('Restart the server immediately (30s countdown)')
                .addStringOption(o => o
                    .setName('reason')
                    .setDescription('Reason for restart')
                    .setRequired(false)))
            .addSubcommand(sub => sub
                .setName('schedule')
                .setDescription('Schedule a restart in X minutes')
                .addIntegerOption(o => o
                    .setName('minutes')
                    .setDescription('Minutes until restart (1-60)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(60))
                .addStringOption(o => o
                    .setName('reason')
                    .setDescription('Reason for restart')
                    .setRequired(false)))
            .addSubcommand(sub => sub
                .setName('cancel')
                .setDescription('Cancel a scheduled restart'))
            .addSubcommand(sub => sub
                .setName('status')
                .setDescription('Check restart scheduler status'))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        async execute(interaction, client) {
            // Double-check admin permission
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: '❌ You need Administrator permission to use this command.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();
            botClient = client;

            switch (subcommand) {
                case 'now': {
                    const reason = interaction.options.getString('reason') || 'Manual restart by admin';

                    await interaction.reply({
                        content: `🔄 **Server restart initiated**\nReason: ${reason}\nStarting 30-second countdown...`,
                        ephemeral: false
                    });

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
                    break;
                }

                case 'schedule': {
                    const minutes = interaction.options.getInteger('minutes');
                    const reason = interaction.options.getString('reason') || `Scheduled restart by ${interaction.user.tag}`;

                    await interaction.deferReply({ ephemeral: false });

                    const result = await scheduleRestart(minutes, reason);

                    if (result.success) {
                        const restartTimestamp = Math.floor(result.restartTime / 1000);
                        await interaction.editReply({
                            content: `⏰ **Server restart scheduled**\n` +
                                `• Restarting <t:${restartTimestamp}:R> (<t:${restartTimestamp}:T>)\n` +
                                `• Reason: ${reason}\n` +
                                `• Warnings will be sent at 15, 10, 5, and 1 minute(s)\n` +
                                `• Use \`/restart cancel\` to abort`
                        });
                    } else {
                        await interaction.editReply({
                            content: `❌ Failed to schedule restart: ${result.error}`
                        });
                    }
                    break;
                }

                case 'cancel': {
                    if (!scheduledRestartTime) {
                        return interaction.reply({
                            content: '❌ No restart is currently scheduled.',
                            ephemeral: true
                        });
                    }

                    // Announce cancellation in-game
                    try {
                        const rcon = await connectRcon();
                        await broadcastTellraw(rcon, 'Scheduled restart has been cancelled!', 'green');
                        await rcon.end();
                    } catch (e) {
                        console.error('[ServerRestart] Failed to announce cancellation:', e.message);
                    }

                    cancelScheduledRestart();

                    await interaction.reply({
                        content: '✅ Scheduled restart has been cancelled.',
                        ephemeral: false
                    });
                    break;
                }

                case 'status': {
                    const isRunning = scheduledTask !== null;
                    const hasScheduledRestart = scheduledRestartTime !== null;
                    const nextDaily = isRunning ? 'Daily at 12:00 AM CST (6:00 AM UTC)' : 'Not scheduled';

                    const embed = new EmbedBuilder()
                        .setColor(isRunning ? 0x57F287 : 0xFEE75C)
                        .setTitle('🔄 Server Restart Status')
                        .addFields(
                            { name: 'Daily Scheduler', value: isRunning ? '✅ Active' : '❌ Inactive', inline: true },
                            { name: 'Next Daily', value: nextDaily, inline: true },
                            { name: 'RCON', value: process.env.RCON_HOST ? '✅ Configured' : '❌ Not set', inline: true }
                        )
                        .setTimestamp();

                    if (hasScheduledRestart) {
                        const restartTimestamp = Math.floor(scheduledRestartTime / 1000);
                        embed.addFields({
                            name: '⏰ Scheduled Restart',
                            value: `<t:${restartTimestamp}:R> (<t:${restartTimestamp}:T>)`,
                            inline: false
                        });
                        embed.setColor(0xED4245);
                    }

                    embed.setFooter({ text: 'Use /restart now for immediate restart, /restart schedule for timed restart' });

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    break;
                }
            }
        }
    }
];

module.exports = {
    slashCommands,
    initScheduler,
    stopScheduler,
    executeRestart,
    scheduleRestart,
    cancelScheduledRestart
};
