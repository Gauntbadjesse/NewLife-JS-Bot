/**
 * End Items Clear Cog
 * 
 * NOTE: The End is now OPEN! This cog is disabled.
 * All item clearing and teleportation functionality has been removed.
 * Keeping the file structure for potential future use.
 */

/**
 * Initialize - disabled since The End is open
 */
async function initEndItemsClear() {
    console.log('[EndClear] Disabled - The End is now open!');
}

/**
 * Stop - no-op since nothing is running
 */
async function stopEndItemsClear() {
    console.log('[EndClear] Already disabled');
}

// No slash commands - The End is open
const slashCommands = [];

module.exports = {
    slashCommands,
    initEndItemsClear,
    stopEndItemsClear
};
