/**
 * End Items Clear Cog
 * 
 * STATUS: DISABLED - The End is now open!
 * 
 * This cog previously cleared End items from players on join.
 * All functionality has been disabled. To re-enable, set
 * END_ITEMS_CLEAR_ENABLED=true in your environment variables.
 */

const config = require('../config');

/**
 * Initialize - checks feature toggle
 */
async function initEndItemsClear() {
    if (config.features.endItemsClear) {
        console.log('[EndClear] Feature enabled but not implemented - The End is open!');
    } else {
        console.log('[EndClear] Disabled - The End is open!');
    }
}

/**
 * Stop - no-op since nothing is running
 */
async function stopEndItemsClear() {
    // No-op
}

// No slash commands - The End is open
const slashCommands = [];

module.exports = {
    slashCommands,
    initEndItemsClear,
    stopEndItemsClear
};
