/**
 * End Items Clear Cog
 * Automatically clears End items from players on join using shared RCON connection
 * 
 * Features:
 * - Uses shared RCON connection (no duplicate connections!)
 * - Auto-clear End items on player join
 * - Remove stellarity.creative_shock tag on join
 * - Reset max_health attribute on join
 * - Teleport players out of The End
 * - Manual /clearend command for staff
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin, isModerator } = require('../utils/permissions');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/embeds');
const { executeRcon } = require('../utils/rcon');

// =====================================================
// POLLING STATE
// =====================================================
let onlinePlayers = new Set();
let pollingInterval = null;
const POLL_INTERVAL_MS = 5000; // Check every 5 seconds

/**
 * Send a command using shared RCON connection
 * @param {string} command - Command to send
 * @returns {Promise<string|null>} Response or null if failed
 */
async function sendCommand(command) {
    const result = await executeRcon(command);
    if (result.success) {
        return result.response;
    }
    return null;
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
 * List of End-related items to clear on player join
 * Note: Ender pearls are NOT included (allowed)
 */
const END_ITEMS_TO_CLEAR = [
    'minecraft:elytra',
    'minecraft:shulker_shell',
    'minecraft:shulker_box',
    'minecraft:white_shulker_box',
    'minecraft:orange_shulker_box',
    'minecraft:magenta_shulker_box',
    'minecraft:light_blue_shulker_box',
    'minecraft:yellow_shulker_box',
    'minecraft:lime_shulker_box',
    'minecraft:pink_shulker_box',
    'minecraft:gray_shulker_box',
    'minecraft:light_gray_shulker_box',
    'minecraft:cyan_shulker_box',
    'minecraft:purple_shulker_box',
    'minecraft:blue_shulker_box',
    'minecraft:brown_shulker_box',
    'minecraft:green_shulker_box',
    'minecraft:red_shulker_box',
    'minecraft:black_shulker_box',
    'minecraft:ender_chest',
    'minecraft:end_crystal',
    'minecraft:dragon_egg',
    'minecraft:dragon_head',
    'minecraft:chorus_fruit',
    'minecraft:chorus_flower',
    'minecraft:popped_chorus_fruit',
    'minecraft:end_rod',
    'minecraft:end_stone',
    'minecraft:end_stone_bricks',
    'minecraft:end_stone_brick_slab',
    'minecraft:end_stone_brick_stairs',
    'minecraft:end_stone_brick_wall',
    'minecraft:purpur_block',
    'minecraft:purpur_pillar',
    'minecraft:purpur_slab',
    'minecraft:purpur_stairs',
];

/**
 * Handle a new player joining - run all join commands
 * @param {string} username - Player's Minecraft username
 */
async function handlePlayerJoin(username) {
    console.log(`[EndClear] Running join commands for ${username}`);
    
    let totalCleared = 0;
    const itemsCleared = [];
    
    // Clear all End-related items
    for (const item of END_ITEMS_TO_CLEAR) {
        const result = await sendCommand(`clear ${username} ${item}`);
        console.log(`[EndClear] clear ${username} ${item} -> ${result}`);
        
        if (result) {
            // Check for "Removed X items" pattern
            const match = result.match(/Removed (\d+)/i);
            if (match && parseInt(match[1]) > 0) {
                const count = parseInt(match[1]);
                totalCleared += count;
                const itemName = item.replace('minecraft:', '');
                itemsCleared.push(`${count}x ${itemName}`);
                console.log(`[EndClear] ✓ Cleared ${count} ${itemName}(s) from ${username}`);
            }
        }
    }
    
    // Notify player if items were cleared
    if (totalCleared > 0) {
        await sendCommand(`tellraw ${username} {"text":"[NewLife] End items have been cleared from your inventory (${totalCleared} items).","color":"yellow"}`);
        console.log(`[EndClear] Total cleared from ${username}: ${itemsCleared.join(', ')}`);
    } else {
        console.log(`[EndClear] No End items found on ${username}`);
    }
    
    // Remove stellarity.creative_shock tag
    await sendCommand(`tag ${username} remove stellarity.creative_shock`);
    
    // Remove stellarity modifiers from block_break_speed
    await sendCommand(`attribute ${username} minecraft:block_break_speed modifier remove stellarity:creative_shock`);
    
    // Remove stellarity:voided modifier from max_health
    await sendCommand(`attribute ${username} minecraft:max_health modifier remove stellarity:voided`);
    
    // Set max_health to 20 (10 hearts default)
    await sendCommand(`attribute ${username} minecraft:max_health base set 20`);
    
    // Set gamemode to survival
    await sendCommand(`gamemode survival ${username}`);
    
    // Check if in The End and teleport out
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
                console.log(`[EndClear] New player detected: ${player}`);
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
 * Initialize the polling
 */
async function initEndItemsClear() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    console.log('[EndClear] Initializing...');
    
    // Initial poll to get current players (without running join commands)
    const response = await sendCommand('list');
    if (response) {
        onlinePlayers = new Set(parsePlayerList(response));
        console.log(`[EndClear] Found ${onlinePlayers.size} players already online`);
    }
    
    // Start polling interval
    pollingInterval = setInterval(pollForJoins, POLL_INTERVAL_MS);
    
    console.log('[EndClear] Started - polling every 5 seconds');
}

/**
 * Stop the polling
 */
async function stopEndItemsClear() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    console.log('[EndClear] Stopped');
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('clearend')
            .setDescription('Clear all End items from a player\'s inventory')
            .addStringOption(option =>
                option.setName('player')
                    .setDescription('Minecraft username to clear End items from')
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
                // Clear all End items using shared RCON connection
                let totalCleared = 0;
                const itemsCleared = [];
                
                for (const item of END_ITEMS_TO_CLEAR) {
                    const result = await sendCommand(`clear ${username} ${item}`);
                    if (result) {
                        const match = result.match(/Removed (\d+)/i);
                        if (match && parseInt(match[1]) > 0) {
                            const count = parseInt(match[1]);
                            totalCleared += count;
                            const itemName = item.replace('minecraft:', '');
                            itemsCleared.push(`${count}x ${itemName}`);
                        }
                    }
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('🔮 End Items Cleared')
                    .setColor(0x9B59B6)
                    .addFields(
                        { name: 'Player', value: username, inline: true },
                        { name: 'Items Removed', value: String(totalCleared), inline: true },
                        { name: 'Cleared By', value: interaction.user.tag, inline: true }
                    )
                    .setTimestamp();
                
                if (itemsCleared.length > 0) {
                    embed.addFields({ name: 'Items', value: itemsCleared.join('\n').substring(0, 1024) || 'None' });
                }
                
                // Notify the player unless silent
                if (!silent && totalCleared > 0) {
                    await sendCommand(`tellraw ${username} {"text":"[NewLife] A staff member has cleared End items from your inventory (${totalCleared} items).","color":"yellow"}`);
                }
                
                await interaction.editReply({ embeds: [embed] });
                
                console.log(`[EndClear] ${interaction.user.tag} cleared ${totalCleared} End item(s) from ${username}: ${itemsCleared.join(', ')}`);
                
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
