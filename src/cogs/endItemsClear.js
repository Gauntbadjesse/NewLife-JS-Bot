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
const POLL_INTERVAL_MS = 1000; // Check every 1 second

// Track players with shulker box warnings (username -> warning timestamp)
const shulkerWarnings = new Map();
const SHULKER_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

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
 * Players excluded from End item clearing
 */
const EXCLUDED_PLAYERS = [
    'torevyn',
    'squarv2',
];

/**
 * Shulker box items (these get a 5-min grace period)
 */
const SHULKER_ITEMS = [
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
];

/**
 * Items cleared immediately (no grace period)
 */
const IMMEDIATE_CLEAR_ITEMS = [
    'minecraft:elytra',
    'minecraft:shulker_shell',
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
 * Combined list for commands that need all items
 */
const END_ITEMS_TO_CLEAR = [...IMMEDIATE_CLEAR_ITEMS, ...SHULKER_ITEMS.filter(i => i !== 'minecraft:shulker_shell')];

/**
 * Check if a player has any shulker boxes
 * @param {string} username - Player's Minecraft username
 * @returns {Promise<boolean>} True if player has shulker boxes
 */
async function playerHasShulkers(username) {
    for (const item of SHULKER_ITEMS) {
        if (item === 'minecraft:shulker_shell') continue; // Skip shells, check boxes only
        const result = await sendCommand(`clear ${username} ${item} 0`);
        if (result && result.match(/(\d+)/)) {
            const count = parseInt(result.match(/(\d+)/)[1]);
            if (count > 0) return true;
        }
    }
    return false;
}

/**
 * Handle a new player joining - run all join commands
 * @param {string} username - Player's Minecraft username
 */
async function handlePlayerJoin(username) {
    // Skip excluded players
    if (EXCLUDED_PLAYERS.some(p => p.toLowerCase() === username.toLowerCase())) {
        console.log(`[EndClear] Skipping excluded player: ${username}`);
        return;
    }
    
    console.log(`[EndClear] Checking ${username} for End items...`);
    
    let totalCleared = 0;
    const itemsCleared = [];
    
    // Clear all End-related items
    for (const item of END_ITEMS_TO_CLEAR) {
        const result = await sendCommand(`clear ${username} ${item}`);
        
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
        console.log(`[EndClear] ${username} has no End items`);
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
 * Poll the server and clear End items from ALL players continuously
 */
async function pollForJoins() {
    try {
        const response = await sendCommand('list');
        if (!response) return;
        
        const currentPlayers = parsePlayerList(response);
        
        // Clear End items from ALL players every poll
        for (const player of currentPlayers) {
            await clearEndItemsSilent(player);
            await checkAndTeleportFromEnd(player);
        }
        
        // Update the online players set
        onlinePlayers = new Set(currentPlayers);
        
    } catch (error) {
        // Silently ignore polling errors
    }
}

/**
 * Clear End items from a player silently (no spam logging)
 * Shulker boxes get a 5-minute grace period
 * @param {string} username - Player's Minecraft username
 */
async function clearEndItemsSilent(username) {
    // Skip excluded players
    if (EXCLUDED_PLAYERS.some(p => p.toLowerCase() === username.toLowerCase())) {
        return;
    }
    
    const usernameLower = username.toLowerCase();
    let totalCleared = 0;
    const itemsCleared = [];
    
    // Clear immediate items (elytra, end stone, etc.)
    for (const item of IMMEDIATE_CLEAR_ITEMS) {
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
    
    // Handle shulker boxes with grace period
    const hasShulkers = await playerHasShulkers(username);
    
    if (hasShulkers) {
        const warningTime = shulkerWarnings.get(usernameLower);
        const now = Date.now();
        
        if (!warningTime) {
            // First time seeing shulkers - warn them and start timer
            shulkerWarnings.set(usernameLower, now);
            console.log(`[EndClear] ${username} has shulker boxes - giving 5 minute warning`);
            await sendCommand(`tellraw ${username} {"text":"[NewLife] You have shulker boxes in your inventory. Please empty them within 5 minutes or they will be cleared!","color":"red","bold":true}`);
            await sendCommand(`title ${username} subtitle {"text":"Empty your shulker boxes!","color":"yellow"}`);
            await sendCommand(`title ${username} title {"text":"5 Minute Warning","color":"red"}`);
            await sendCommand(`playsound minecraft:block.note_block.pling player ${username} ~ ~ ~ 1 0.5`);
        } else if (now - warningTime >= SHULKER_GRACE_PERIOD_MS) {
            // Grace period expired - clear the shulkers
            console.log(`[EndClear] ${username}'s grace period expired - clearing shulker boxes`);
            
            for (const item of SHULKER_ITEMS) {
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
            
            // Remove from tracking
            shulkerWarnings.delete(usernameLower);
            
            if (totalCleared > 0) {
                await sendCommand(`tellraw ${username} {"text":"[NewLife] Your shulker boxes have been cleared. Time expired!","color":"red"}`);
            }
        } else {
            // Still in grace period - remind them every minute
            const timeLeft = Math.ceil((SHULKER_GRACE_PERIOD_MS - (now - warningTime)) / 60000);
            const elapsed = now - warningTime;
            
            // Send reminder at 4, 3, 2, 1 minute marks
            if (elapsed >= 60000 && elapsed < 61000) {
                await sendCommand(`tellraw ${username} {"text":"[NewLife] 4 minutes remaining to empty your shulker boxes!","color":"gold"}`);
            } else if (elapsed >= 120000 && elapsed < 121000) {
                await sendCommand(`tellraw ${username} {"text":"[NewLife] 3 minutes remaining to empty your shulker boxes!","color":"gold"}`);
            } else if (elapsed >= 180000 && elapsed < 181000) {
                await sendCommand(`tellraw ${username} {"text":"[NewLife] 2 minutes remaining to empty your shulker boxes!","color":"yellow"}`);
            } else if (elapsed >= 240000 && elapsed < 241000) {
                await sendCommand(`tellraw ${username} {"text":"[NewLife] 1 minute remaining to empty your shulker boxes!","color":"red"}`);
                await sendCommand(`playsound minecraft:block.note_block.pling player ${username} ~ ~ ~ 1 0.5`);
            }
        }
    } else {
        // No shulkers - remove from tracking if they were being tracked
        if (shulkerWarnings.has(usernameLower)) {
            shulkerWarnings.delete(usernameLower);
            console.log(`[EndClear] ${username} emptied their shulker boxes in time!`);
            await sendCommand(`tellraw ${username} {"text":"[NewLife] Thanks for emptying your shulker boxes!","color":"green"}`);
        }
    }
    
    // Only log and notify if non-shulker items were cleared
    if (totalCleared > 0 && itemsCleared.some(i => !i.includes('shulker'))) {
        console.log(`[EndClear] Cleared from ${username}: ${itemsCleared.join(', ')}`);
        await sendCommand(`tellraw ${username} {"text":"[NewLife] End items have been cleared from your inventory (${totalCleared} items).","color":"yellow"}`);
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
    
    // Initial poll to get current players AND clear their items
    const response = await sendCommand('list');
    if (response) {
        const players = parsePlayerList(response);
        onlinePlayers = new Set(players);
        console.log(`[EndClear] Found ${onlinePlayers.size} players already online: ${players.join(', ') || 'none'}`);
        
        // Clear End items from ALL currently online players
        if (players.length > 0) {
            console.log('[EndClear] Clearing End items from all online players...');
            for (const player of players) {
                await handlePlayerJoin(player);
            }
        }
    }
    
    // Start polling interval
    pollingInterval = setInterval(pollForJoins, POLL_INTERVAL_MS);
    
    console.log('[EndClear] Started - clearing End items every 1 second');
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
    },
    {
        data: new SlashCommandBuilder()
            .setName('clearallend')
            .setDescription('Clear End items from ALL online players'),
        
        async execute(interaction) {
            // Permission check - Admin+
            if (!isAdmin(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You need Admin permissions to use this command.')],
                    ephemeral: true
                });
            }
            
            await interaction.deferReply();
            
            try {
                // Get all online players
                const response = await sendCommand('list');
                if (!response) {
                    return interaction.editReply({
                        embeds: [createErrorEmbed('Error', 'Could not connect to the server.')]
                    });
                }
                
                const players = parsePlayerList(response);
                if (players.length === 0) {
                    return interaction.editReply({
                        embeds: [createErrorEmbed('No Players', 'No players are currently online.')]
                    });
                }
                
                let grandTotal = 0;
                const results = [];
                
                for (const player of players) {
                    let playerTotal = 0;
                    
                    for (const item of END_ITEMS_TO_CLEAR) {
                        const result = await sendCommand(`clear ${player} ${item}`);
                        if (result) {
                            const match = result.match(/Removed (\d+)/i);
                            if (match && parseInt(match[1]) > 0) {
                                playerTotal += parseInt(match[1]);
                            }
                        }
                    }
                    
                    if (playerTotal > 0) {
                        results.push(`${player}: ${playerTotal} items`);
                        grandTotal += playerTotal;
                        await sendCommand(`tellraw ${player} {"text":"[NewLife] End items have been cleared from your inventory (${playerTotal} items).","color":"yellow"}`);
                    }
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('🔮 End Items Cleared - All Players')
                    .setColor(0x9B59B6)
                    .addFields(
                        { name: 'Players Checked', value: String(players.length), inline: true },
                        { name: 'Total Items Removed', value: String(grandTotal), inline: true },
                        { name: 'Cleared By', value: interaction.user.tag, inline: true }
                    )
                    .setTimestamp();
                
                if (results.length > 0) {
                    embed.addFields({ name: 'Players Affected', value: results.join('\n').substring(0, 1024) });
                } else {
                    embed.addFields({ name: 'Players Affected', value: 'None - no End items found on any player' });
                }
                
                await interaction.editReply({ embeds: [embed] });
                
                console.log(`[EndClear] ${interaction.user.tag} cleared ${grandTotal} End items from ${players.length} players`);
                
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
