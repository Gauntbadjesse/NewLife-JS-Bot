/**
 * End Items Clear Cog
 * Automatically clears elytras from players on join using PERSISTENT RCON connection
 * 
 * Features:
 * - Persistent RCON connection (no console spam!)
 * - Auto-clear elytras/shulker shells on player join
 * - Remove stellarity.creative_shock tag on join
 * - Reset max_health attribute on join
 * - Teleport players out of The End
 * - Manual /clearend command for staff
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Rcon } = require('rcon-client');
const { isAdmin, isModerator } = require('../utils/permissions');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/embeds');

// =====================================================
// PERSISTENT RCON CONNECTION
// =====================================================
let rconConnection = null;
let isConnecting = false;
let onlinePlayers = new Set();
let pollingInterval = null;
const POLL_INTERVAL_MS = 5000; // Check every 5 seconds

/**
 * Get or create a persistent RCON connection
 */
async function getRcon() {
    // If we have a valid connection, return it
    if (rconConnection && rconConnection.authenticated) {
        return rconConnection;
    }
    
    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return getRcon();
    }
    
    isConnecting = true;
    
    try {
        const host = process.env.RCON_HOST;
        const port = parseInt(process.env.RCON_PORT) || 25575;
        const password = process.env.RCON_PASSWORD;
        
        if (!host || !password) {
            console.error('[EndClear] RCON not configured');
            isConnecting = false;
            return null;
        }
        
        // Close existing connection if any
        if (rconConnection) {
            try {
                await rconConnection.end();
            } catch (e) { /* ignore */ }
        }
        
        rconConnection = await Rcon.connect({
            host,
            port,
            password,
            timeout: 10000
        });
        
        console.log('[EndClear] Persistent RCON connection established');
        
        // Handle disconnection
        rconConnection.on('end', () => {
            console.log('[EndClear] RCON connection closed');
            rconConnection = null;
        });
        
        rconConnection.on('error', (err) => {
            console.error('[EndClear] RCON error:', err.message);
            rconConnection = null;
        });
        
        isConnecting = false;
        return rconConnection;
        
    } catch (error) {
        console.error('[EndClear] Failed to connect to RCON:', error.message);
        rconConnection = null;
        isConnecting = false;
        return null;
    }
}

/**
 * Send a command using the persistent RCON connection
 * @param {string} command - Command to send
 * @returns {Promise<string|null>} Response or null on failure
 */
async function sendCommand(command) {
    try {
        const rcon = await getRcon();
        if (!rcon) return null;
        
        const response = await rcon.send(command);
        return response;
    } catch (error) {
        // Connection might be dead, reset it
        rconConnection = null;
        return null;
    }
}

/**
 * Parse the /list command response to get player names
 * @param {string} response - RCON response from /list
 * @returns {string[]} Array of player names
 */
function parsePlayerList(response) {
    if (!response) return [];
    
    const match = response.match(/players online:\s*(.*)/i);
    if (!match || !match[1] || match[1].trim() === '') return [];
    
    return match[1].split(',').map(name => {
        // Strip any special characters/prefixes (like ○, ●, etc.)
        return name.replace(/[^\w_]/g, '').trim();
    }).filter(name => name.length > 0);
}

/**
 * Handle a new player joining - run all join commands
 * @param {string} username - Player's Minecraft username
 */
async function handlePlayerJoin(username) {
    console.log(`[EndClear] Running join commands for ${username}`);
    
    // 1. Clear elytras
    const elytraResult = await sendCommand(`clear ${username} minecraft:elytra`);
    if (elytraResult && elytraResult.includes('Removed')) {
        const match = elytraResult.match(/Removed (\d+)/);
        if (match && parseInt(match[1]) > 0) {
            console.log(`[EndClear] Cleared ${match[1]} elytra(s) from ${username}`);
            await sendCommand(`tellraw ${username} {"text":"[NewLife] Elytras have been cleared from your inventory.","color":"yellow"}`);
        }
    }
    
    // 2. Clear shulker shells
    const shellResult = await sendCommand(`clear ${username} minecraft:shulker_shell`);
    if (shellResult && shellResult.includes('Removed')) {
        const match = shellResult.match(/Removed (\d+)/);
        if (match && parseInt(match[1]) > 0) {
            console.log(`[EndClear] Cleared ${match[1]} shulker shell(s) from ${username}`);
        }
    }
    
    // 3. Remove stellarity.creative_shock tag
    await sendCommand(`tag ${username} remove stellarity.creative_shock`);
    
    // 4. Remove stellarity modifiers from block_break_speed
    await sendCommand(`attribute ${username} minecraft:block_break_speed modifier remove stellarity:creative_shock`);
    
    // 5. Remove stellarity:voided modifier from max_health
    await sendCommand(`attribute ${username} minecraft:max_health modifier remove stellarity:voided`);
    
    // 6. Set max_health to 20 (10 hearts default)
    await sendCommand(`attribute ${username} minecraft:max_health base set 20`);
    
    // 7. Set gamemode to survival
    await sendCommand(`gamemode survival ${username}`);
    
    // 8. Check if in The End and teleport out
    await checkAndTeleportFromEnd(username);
}

/**
 * Check if a player is in The End and teleport them out
 * @param {string} username - Player's Minecraft username
 * @returns {Promise<boolean>} True if player was teleported
 */
async function checkAndTeleportFromEnd(username) {
    const dimResult = await sendCommand(`data get entity ${username} Dimension`);
    
    if (dimResult && dimResult.includes('the_end')) {
        console.log(`[EndClear] ${username} is in The End! Teleporting out...`);
        await sendCommand(`execute in minecraft:overworld run tp ${username} -835 108 356`);
        await sendCommand(`tellraw ${username} {"text":"[NewLife] The End is currently disabled. You have been teleported to the overworld.","color":"red"}`);
        return true;
    }
    
    return false;
}

/**
 * Poll the server for online players and detect joins
 */
async function pollForJoins() {
    try {
        const response = await sendCommand('list');
        if (!response) return;
        
        const currentPlayers = new Set(parsePlayerList(response));
        
        // Find new players (joined since last poll)
        for (const player of currentPlayers) {
            if (!onlinePlayers.has(player)) {
                // New player detected - run join commands after short delay
                setTimeout(() => handlePlayerJoin(player), 1500);
            }
        }
        
        // Check ALL players for being in The End (continuous enforcement)
        for (const player of currentPlayers) {
            await checkAndTeleportFromEnd(player);
        }
        
        // Update the online players set
        onlinePlayers = currentPlayers;
        
    } catch (error) {
        // Silently ignore polling errors
    }
}

/**
 * Initialize the persistent RCON connection and polling
 */
async function initEndItemsClear() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    console.log('[EndClear] Initializing with persistent RCON connection...');
    
    // Establish initial connection
    await getRcon();
    
    // Initial poll to get current players (without running join commands)
    const response = await sendCommand('list');
    if (response) {
        onlinePlayers = new Set(parsePlayerList(response));
        console.log(`[EndClear] Found ${onlinePlayers.size} players already online`);
    }
    
    // Start polling interval
    pollingInterval = setInterval(pollForJoins, POLL_INTERVAL_MS);
    
    console.log(`[EndClear] Polling every ${POLL_INTERVAL_MS / 1000} seconds`);
}

/**
 * Stop the polling and close RCON connection
 */
async function stopEndItemsClear() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    if (rconConnection) {
        try {
            await rconConnection.end();
        } catch (e) { /* ignore */ }
        rconConnection = null;
    }
    
    console.log('[EndClear] Stopped');
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('clearend')
            .setDescription('Clear elytras from a player\'s inventory')
            .addStringOption(option =>
                option.setName('player')
                    .setDescription('Minecraft username to clear elytras from')
                    .setRequired(true)
            )
            .addBooleanOption(option =>
                option.setName('silent')
                    .setDescription('Don\'t notify the player')
                    .setRequired(false)
            ),
        
        async execute(interaction) {
            // Permission check - Moderator+
            if (!isModerator(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You need Moderator permissions to use this command.')],
                    ephemeral: true
                });
            }
            
            await interaction.deferReply();
            
            const username = interaction.options.getString('player');
            const silent = interaction.options.getBoolean('silent') || false;
            
            try {
                // Clear elytra using persistent connection
                const result = await sendCommand(`clear ${username} minecraft:elytra`);
                
                let count = 0;
                if (result) {
                    const match = result.match(/Removed (\d+) item/i);
                    if (match) {
                        count = parseInt(match[1]);
                    }
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('🔮 Elytras Cleared')
                    .setColor(0x9B59B6)
                    .addFields(
                        { name: 'Player', value: username, inline: true },
                        { name: 'Elytras Removed', value: String(count), inline: true },
                        { name: 'Cleared By', value: interaction.user.tag, inline: true }
                    )
                    .setTimestamp();
                
                // Notify the player unless silent
                if (!silent && count > 0) {
                    await sendCommand(`tellraw ${username} {"text":"[NewLife] A staff member has cleared elytras from your inventory.","color":"yellow"}`);
                }
                
                await interaction.editReply({ embeds: [embed] });
                
                console.log(`[EndClear] ${interaction.user.tag} cleared ${count} elytra(s) from ${username}`);
                
            } catch (error) {
                console.error('[EndClear] Command error:', error);
                await interaction.editReply({
                    embeds: [createErrorEmbed('Error', `An error occurred: ${error.message}`)]
                });
            }
        }
    }
];

// Export the init function for bot.js to call
module.exports = {
    slashCommands,
    initEndItemsClear,
    stopEndItemsClear,
    sendCommand
};
