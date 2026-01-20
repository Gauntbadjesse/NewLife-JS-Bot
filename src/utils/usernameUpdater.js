/**
 * Username Updater Utility
 * Periodically checks and updates Minecraft usernames for linked accounts
 * Fetches current username from Mojang API and updates database if changed
 */

const LinkedAccount = require('../database/models/LinkedAccount');

// Check every 5 minutes
const CHECK_INTERVAL = 5 * 60 * 1000;
let updateInterval = null;

/**
 * Fetch current username from Mojang API by UUID
 * @param {string} uuid - Player UUID (with or without dashes)
 * @param {string} platform - 'java' or 'bedrock'
 * @returns {Promise<string|null>} Current username or null if not found
 */
async function fetchUsernameFromMojang(uuid, platform) {
    if (platform === 'bedrock') {
        // Bedrock players use floodgate UUIDs, can't query Mojang
        return null;
    }
    
    try {
        // Remove dashes from UUID for API call
        const cleanUuid = uuid.replace(/-/g, '');
        
        const response = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${cleanUuid}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`[UsernameUpdater] UUID ${cleanUuid} not found (may be invalid or bedrock)`);
                return null;
            }
            console.error(`[UsernameUpdater] Mojang API error: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        return data.name || null;
    } catch (error) {
        console.error('[UsernameUpdater] Error fetching from Mojang:', error.message);
        return null;
    }
}

/**
 * Update usernames for all linked Java accounts
 * @returns {Promise<number>} Number of accounts updated
 */
async function updateAllUsernames() {
    try {
        console.log('[UsernameUpdater] Starting username check...');
        
        // Get all linked Java accounts (bedrock can't be checked via Mojang API)
        const accounts = await LinkedAccount.find({ platform: 'java' });
        
        if (accounts.length === 0) {
            console.log('[UsernameUpdater] No Java accounts to check');
            return 0;
        }
        
        let updatedCount = 0;
        let checkedCount = 0;
        
        for (const account of accounts) {
            try {
                // Rate limit: wait 100ms between requests to be nice to Mojang API
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const currentUsername = await fetchUsernameFromMojang(account.uuid, account.platform);
                checkedCount++;
                
                if (currentUsername && currentUsername !== account.minecraftUsername) {
                    const oldUsername = account.minecraftUsername;
                    account.minecraftUsername = currentUsername;
                    await account.save();
                    updatedCount++;
                    console.log(`[UsernameUpdater] Updated: ${oldUsername} -> ${currentUsername} (Discord: ${account.discordId})`);
                }
            } catch (error) {
                console.error(`[UsernameUpdater] Error updating ${account.minecraftUsername}:`, error.message);
            }
        }
        
        console.log(`[UsernameUpdater] Check complete: ${checkedCount} checked, ${updatedCount} updated`);
        return updatedCount;
    } catch (error) {
        console.error('[UsernameUpdater] Error in update process:', error);
        return 0;
    }
}

/**
 * Initialize the username updater system
 * Starts periodic checks for username changes
 */
function initUsernameUpdater() {
    console.log('[UsernameUpdater] Initializing username updater...');
    console.log(`[UsernameUpdater] Check interval: ${CHECK_INTERVAL / 60000} minutes`);
    
    // Run first check after 30 seconds (give bot time to start up)
    setTimeout(() => {
        updateAllUsernames();
    }, 30000);
    
    // Then run on interval
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    
    updateInterval = setInterval(() => {
        updateAllUsernames();
    }, CHECK_INTERVAL);
}

/**
 * Stop the username updater
 */
function stopUsernameUpdater() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
        console.log('[UsernameUpdater] Stopped');
    }
}

module.exports = {
    initUsernameUpdater,
    stopUsernameUpdater,
    updateAllUsernames,
    fetchUsernameFromMojang
};
