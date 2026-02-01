/**
 * End Items Clear Cog
 * Automatically clears elytras from players on join using RCON polling
 * 
 * Features:
 * - Auto-clear elytras on player join (via RCON /list polling)
 * - Manual /clearend command for staff to clear items from specific players
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { executeRcon } = require('../utils/rcon');
const { isAdmin, isModerator } = require('../utils/permissions');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/embeds');

// =====================================================
// PLAYER JOIN DETECTION VIA RCON POLLING
// =====================================================
let onlinePlayers = new Set();
let pollingInterval = null;
const POLL_INTERVAL_MS = 5000; // Check every 5 seconds

/**
 * Parse the /list command response to get player names
 * @param {string} response - RCON response from /list
 * @returns {string[]} Array of player names
 */
function parsePlayerList(response) {
    if (!response) return [];
    
    // Response format: "There are X of a max of Y players online: Player1, Player2, Player3"
    // Or: "There are 0 of a max of Y players online:"
    const match = response.match(/players online:\s*(.*)/i);
    if (!match || !match[1] || match[1].trim() === '') return [];
    
    return match[1].split(',').map(name => {
        // Strip any special characters/prefixes (like ○, ●, etc.) and trim whitespace
        return name.replace(/[^\w_]/g, '').trim();
    }).filter(name => name.length > 0);
}

/**
 * Clear elytra and shulker shells from a player
 * @param {string} username - Player's Minecraft username
 */
async function clearElytraFromPlayer(username) {
    let totalCleared = 0;
    
    try {
        // Clear elytras
        const elytraResult = await executeRcon(`clear ${username} minecraft:elytra`);
        if (elytraResult.success && elytraResult.response) {
            const match = elytraResult.response.match(/Removed (\d+) item/i);
            if (match) {
                const count = parseInt(match[1]);
                if (count > 0) {
                    console.log(`[EndClear] Cleared ${count} elytra(s) from ${username}`);
                    totalCleared += count;
                }
            }
        }
        
        // Clear shulker shells
        const shellResult = await executeRcon(`clear ${username} minecraft:shulker_shell`);
        if (shellResult.success && shellResult.response) {
            const match = shellResult.response.match(/Removed (\d+) item/i);
            if (match) {
                const count = parseInt(match[1]);
                if (count > 0) {
                    console.log(`[EndClear] Cleared ${count} shulker shell(s) from ${username}`);
                    totalCleared += count;
                }
            }
        }
        
        // Notify the player if anything was cleared
        if (totalCleared > 0) {
            await executeRcon(`tellraw ${username} {"text":"[NewLife] End items (elytras/shulker shells) have been cleared from your inventory.","color":"yellow"}`);
        }
        
        return totalCleared;
    } catch (error) {
        console.error(`[EndClear] Error clearing items from ${username}:`, error);
        return 0;
    }
}

/**
 * Check if a player is in The End and teleport them out
 * @param {string} username - Player's Minecraft username
 */
async function checkAndTeleportFromEnd(username) {
    try {
        // Get player's current dimension
        const result = await executeRcon(`data get entity ${username} Dimension`);
        if (result.success && result.response) {
            // Response format: "Player has the following entity data: "minecraft:the_end""
            if (result.response.includes('the_end')) {
                console.log(`[EndClear] ${username} is in The End! Teleporting them out...`);
                
                // Teleport to overworld at specified coordinates
                const tpResult = await executeRcon(`execute in minecraft:overworld run tp ${username} -835 108 356`);
                
                if (tpResult.success) {
                    console.log(`[EndClear] Teleported ${username} from The End to overworld`);
                    await executeRcon(`tellraw ${username} {"text":"[NewLife] The End is currently disabled. You have been teleported to the overworld.","color":"red"}`);
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error(`[EndClear] Error checking dimension for ${username}:`, error);
        return false;
    }
}

/**
 * Poll the server for online players and detect joins
 */
async function pollForJoins() {
    try {
        const result = await executeRcon('list');
        if (!result.success) return;
        
        const currentPlayers = new Set(parsePlayerList(result.response));
        
        // Find new players (in current but not in previous)
        for (const player of currentPlayers) {
            if (!onlinePlayers.has(player)) {
                // New player detected!
                console.log(`[EndClear] Player joined: ${player}`);
                
                // Small delay to ensure player is fully loaded
                setTimeout(async () => {
                    await clearElytraFromPlayer(player);
                    await checkAndTeleportFromEnd(player);
                }, 1500);
            }
        }
        
        // Check ALL online players for being in The End (not just new joins)
        for (const player of currentPlayers) {
            await checkAndTeleportFromEnd(player);
        }
        
        // Update the online players set
        onlinePlayers = currentPlayers;
        
    } catch (error) {
        // Silently ignore polling errors (server might be restarting)
    }
}

/**
 * Initialize the RCON polling for player joins
 */
function initEndItemsClear() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    console.log('[EndClear] Starting RCON polling for player joins...');
    
    // Initial poll to get current players
    pollForJoins();
    
    // Start polling interval
    pollingInterval = setInterval(pollForJoins, POLL_INTERVAL_MS);
    
    console.log(`[EndClear] Polling every ${POLL_INTERVAL_MS / 1000} seconds for new players`);
}

/**
 * Stop the polling
 */
function stopEndItemsClear() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log('[EndClear] Stopped RCON polling');
    }
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
                // Clear elytra
                const result = await executeRcon(`clear ${username} minecraft:elytra`);
                
                let count = 0;
                if (result.success && result.response) {
                    const match = result.response.match(/Removed (\d+) item/i);
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
                    await executeRcon(`tellraw ${username} {"text":"[NewLife] A staff member has cleared elytras from your inventory.","color":"yellow"}`);
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
    clearElytraFromPlayer
};
