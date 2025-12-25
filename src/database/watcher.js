/**
 * Database Change Stream Watcher
 * Monitors MongoDB for new warnings and bans to send Discord DMs and log to channel
 */

const mongoose = require('mongoose');
const Warning = require('./models/Warning');
const Ban = require('./models/Ban');
const { createWarningDMEmbed, createBanDMEmbed, createWarningLogEmbed, createBanLogEmbed } = require('../utils/embeds');

let discordClient = null;
let usersCollection = null;

/**
 * Initialize connection to discord_bot database for user lookups
 */
async function initUsersConnection() {
    try {
        const uri = process.env.MONGODB_URI;
        const dbName = process.env.DISCORD_BOT_DATABASE || 'discord_bot';
        
        // Create a separate connection for the discord_bot database
        const conn = await mongoose.createConnection(uri, { dbName }).asPromise();
        usersCollection = conn.collection('users');
        
        console.log(`[Watcher] Connected to ${dbName}.users collection`);
        return true;
    } catch (error) {
        console.error('[Watcher] Failed to connect to discord_bot database:', error.message);
        return false;
    }
}

/**
 * Initialize the database watcher
 * @param {Client} client - Discord.js client
 */
async function initWatcher(client) {
    discordClient = client;
    
    console.log('╔════════════════════════════════════════╗');
    console.log('║    Database Change Watcher Starting    ║');
    console.log('╚════════════════════════════════════════╝');

    // Connect to discord_bot database for user lookups
    await initUsersConnection();

    try {
        // Watch warnings collection
        const warningChangeStream = Warning.watch([], { fullDocument: 'updateLookup' });
        
        warningChangeStream.on('change', async (change) => {
            if (change.operationType === 'insert') {
                console.log(`[Watcher] New warning detected: ${change.fullDocument._id}`);
                await handleNewWarning(change.fullDocument);
            }
        });

        warningChangeStream.on('error', (error) => {
            console.error('[Watcher] Warning stream error:', error.message);
        });

        // Watch bans collection
        const banChangeStream = Ban.watch([], { fullDocument: 'updateLookup' });
        
        banChangeStream.on('change', async (change) => {
            if (change.operationType === 'insert') {
                console.log(`[Watcher] New ban detected: ${change.fullDocument._id}`);
                await handleNewBan(change.fullDocument);
            }
        });

        banChangeStream.on('error', (error) => {
            console.error('[Watcher] Ban stream error:', error.message);
        });

        console.log('[Watcher] Now monitoring warnings and bans collections');
        
    } catch (error) {
        console.error('[Watcher] Failed to initialize:', error.message);
        console.log('[Watcher] Note: Change streams require MongoDB replica set or Atlas cluster');
    }
}

/**
 * Find Discord user ID by Minecraft username from discord_bot.users collection
 * @param {string} minecraftName - Minecraft player name
 * @returns {string|null} Discord user ID or null
 */
async function findDiscordIdByMinecraft(minecraftName) {
    if (!usersCollection) return null;

    try {
        const user = await usersCollection.findOne({
            minecraft_name: { $regex: new RegExp(`^${minecraftName}$`, 'i') }
        });

        if (user && user.discord_id) {
            return user.discord_id.toString();
        }
    } catch (error) {
        console.error('[Watcher] Error looking up user:', error.message);
    }

    return null;
}

/**
 * Find Minecraft username by Discord ID from discord_bot.users collection
 * @param {string} discordId - Discord user ID
 * @returns {Object|null} User object with minecraft_name or null
 */
async function findMinecraftByDiscordId(discordId) {
    if (!usersCollection) return null;

    try {
        const user = await usersCollection.findOne({
            discord_id: discordId
        });

        return user;
    } catch (error) {
        console.error('[Watcher] Error looking up user:', error.message);
    }

    return null;
}

/**
 * Log punishment to the designated channel
 * @param {Object} punishment - Warning or Ban document
 * @param {string} type - 'warning' or 'ban'
 */
async function logPunishment(punishment, type) {
    if (!discordClient) return;

    const channelId = process.env.LOG_CHANNEL_ID;
    if (!channelId) {
        console.log('[Watcher] No LOG_CHANNEL_ID configured');
        return;
    }

    try {
        const channel = await discordClient.channels.fetch(channelId).catch(() => null);
        
        if (!channel) {
            console.error('[Watcher] Could not find log channel:', channelId);
            return;
        }

        const embed = type === 'warning' 
            ? createWarningLogEmbed(punishment)
            : createBanLogEmbed(punishment);

        await channel.send({ embeds: [embed] });
        console.log(`[Watcher] Logged ${type} to channel`);
    } catch (error) {
        console.error('[Watcher] Error logging to channel:', error.message);
    }
}

/**
 * Handle new warning - find linked Discord user and DM them
 * @param {Object} warning - Warning document
 */
async function handleNewWarning(warning) {
    if (!discordClient) return;

    // Log to channel
    await logPunishment(warning, 'warning');

    try {
        // Try to find linked Discord user
        const discordId = await findDiscordIdByMinecraft(warning.playerName);
        
        if (discordId) {
            const user = await discordClient.users.fetch(discordId).catch(() => null);
            
                if (user) {
                    try {
                        const { sendDm } = require('../utils/dm');
                        const res = await sendDm(discordClient, discordId, { embeds: [createWarningDMEmbed(warning)] });
                        if (res.success) console.log(`[Watcher] Sent warning DM to ${user.tag} for case ${warning._id}`);
                        else console.log(`[Watcher] Could not DM ${discordId}: ${res.error}`);
                    } catch (dmError) {
                        console.log(`[Watcher] Could not DM ${discordId}: ${dmError.message}`);
                    }
                }
        } else {
            console.log(`[Watcher] No linked Discord account for player ${warning.playerName}`);
        }
    } catch (error) {
        console.error('[Watcher] Error handling warning:', error);
    }
}

/**
 * Handle new ban - find linked Discord user and DM them
 * @param {Object} ban - Ban document
 */
async function handleNewBan(ban) {
    if (!discordClient) return;

    // Log to channel
    await logPunishment(ban, 'ban');

    try {
        // Try to find linked Discord user
        const discordId = await findDiscordIdByMinecraft(ban.playerName);
        
        if (discordId) {
            const user = await discordClient.users.fetch(discordId).catch(() => null);
            
                if (user) {
                    try {
                        const { sendDm } = require('../utils/dm');
                        const res = await sendDm(discordClient, discordId, { embeds: [createBanDMEmbed(ban)] });
                        if (res.success) console.log(`[Watcher] Sent ban DM to ${user.tag} for case ${ban._id}`);
                        else console.log(`[Watcher] Could not DM ${discordId}: ${res.error}`);
                    } catch (dmError) {
                        console.log(`[Watcher] Could not DM ${discordId}: ${dmError.message}`);
                    }
                }
        } else {
            console.log(`[Watcher] No linked Discord account for player ${ban.playerName}`);
        }
    } catch (error) {
        console.error('[Watcher] Error handling ban:', error);
    }
}

/**
 * Manually send a DM for a punishment
 * @param {string} discordId - Discord user ID to DM
 * @param {Object} punishment - Warning or Ban document
 * @param {string} type - 'warning' or 'ban'
 */
async function sendPunishmentDM(discordId, punishment, type) {
    if (!discordClient) return { success: false, error: 'Client not initialized' };

    try {
        const { sendDm } = require('../utils/dm');
        const embed = type === 'warning' ? createWarningDMEmbed(punishment) : createBanDMEmbed(punishment);
        const res = await sendDm(discordClient, discordId, { embeds: [embed] });
        return res;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    initWatcher,
    findDiscordIdByMinecraft,
    findMinecraftByDiscordId,
    sendPunishmentDM,
    logPunishment
};
