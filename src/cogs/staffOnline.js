/**
 * Staff Online Tracking
 * Monitors staff members on the Minecraft server and grants/removes the "Currently Moderating" role
 * Uses linked accounts to cross-reference Discord users with Minecraft players
 */

const LinkedAccount = require('../database/models/LinkedAccount');
const { executeProxyRcon } = require('../utils/rcon');

// Configuration
const STAFF_ROLE_ID = process.env.STAFF_TEAM || '1372672239245459498';
const CURRENTLY_MODERATING_ROLE_ID = '1461405801930428539';
const GUILD_ID = process.env.GUILD_ID || '1372672239245459498';
const CHECK_INTERVAL = 30000; // Check every 30 seconds

let checkInterval = null;
let isRunning = false;

/**
 * Parse the glist response to get online player names
 * @param {string} response - The raw glist response
 * @returns {string[]} Array of online player usernames
 */
function parseOnlinePlayers(response) {
    if (!response) return [];
    
    const players = [];
    
    // glist format typically shows:
    // "[server] (count): player1, player2, player3"
    // or just "player1, player2, player3"
    // or "There are X players online."
    
    const lines = response.split('\n');
    
    for (const line of lines) {
        // Skip empty lines and "There are X players" lines
        if (!line.trim() || line.includes('There are') || line.includes('players online')) {
            continue;
        }
        
        // Match pattern like "[server] (X): player1, player2"
        const serverMatch = line.match(/\[.+?\]\s*\(\d+\):\s*(.+)/);
        if (serverMatch && serverMatch[1]) {
            const playerList = serverMatch[1]
                .split(',')
                .map(p => p.trim())
                .filter(p => p && p.length > 0 && p.length <= 16); // Valid MC username length
            players.push(...playerList);
            continue;
        }
        
        // Try to match just comma-separated names
        if (line.includes(',')) {
            const playerList = line
                .split(',')
                .map(p => p.trim())
                .filter(p => p && p.length > 0 && p.length <= 16 && !p.includes('[') && !p.includes('('));
            if (playerList.length > 0) {
                players.push(...playerList);
            }
        } else {
            // Single player on a line
            const trimmed = line.trim();
            if (trimmed.length > 0 && trimmed.length <= 16 && !trimmed.includes('[') && !trimmed.includes('(')) {
                players.push(trimmed);
            }
        }
    }
    
    // Remove duplicates
    return [...new Set(players)];
}

/**
 * Get all online players from the Velocity proxy
 * @returns {Promise<string[]>} Array of online player usernames
 */
async function getOnlinePlayers() {
    try {
        // Try both glist and list commands for compatibility
        let result = await executeProxyRcon('glist');
        
        // If glist fails, try regular list command
        if (!result.success || !result.response) {
            console.log('[StaffOnline] glist failed, trying list command...');
            result = await executeProxyRcon('list');
        }
        
        if (!result.success) {
            console.error('[StaffOnline] Failed to get player list:', result.response);
            return [];
        }
        
        const players = parseOnlinePlayers(result.response);
        console.log(`[StaffOnline] Found ${players.length} online players:`, players.join(', '));
        return players;
    } catch (error) {
        console.error('[StaffOnline] Error getting online players:', error.message);
        return [];
    }
}

/**
 * Check staff online status and update roles
 * @param {Client} client - Discord client
 */
async function checkStaffOnline(client) {
    if (isRunning) return; // Prevent overlapping checks
    isRunning = true;
    
    try {
        const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
        if (!guild) {
            console.error('[StaffOnline] Could not find guild');
            isRunning = false;
            return;
        }
        
        // Get online players from Minecraft
        const onlinePlayers = await getOnlinePlayers();
        
        // Get all linked accounts
        const linkedAccounts = await LinkedAccount.find({});
        
        // Create a map of minecraft username (lowercase) -> discord ID
        const mcToDiscord = new Map();
        for (const account of linkedAccounts) {
            mcToDiscord.set(account.minecraftUsername.toLowerCase(), account.discordId);
        }
        
        // Find which linked Discord users are currently online
        const onlineDiscordIds = new Set();
        for (const player of onlinePlayers) {
            const discordId = mcToDiscord.get(player.toLowerCase());
            if (discordId) {
                onlineDiscordIds.add(discordId);
            }
        }
        
        // Get the staff role and currently moderating role
        const staffRole = await guild.roles.fetch(STAFF_ROLE_ID).catch(() => null);
        const moderatingRole = await guild.roles.fetch(CURRENTLY_MODERATING_ROLE_ID).catch(() => null);
        
        if (!staffRole) {
            console.error('[StaffOnline] Staff role not found:', STAFF_ROLE_ID);
            isRunning = false;
            return;
        }
        
        if (!moderatingRole) {
            console.error('[StaffOnline] Currently Moderating role not found:', CURRENTLY_MODERATING_ROLE_ID);
            isRunning = false;
            return;
        }
        
        // Fetch all members with the staff role
        await guild.members.fetch();
        const staffMembers = guild.members.cache.filter(m => m.roles.cache.has(STAFF_ROLE_ID));
        
        let rolesAdded = 0;
        let rolesRemoved = 0;
        
        for (const [memberId, member] of staffMembers) {
            const hasModeratingRole = member.roles.cache.has(CURRENTLY_MODERATING_ROLE_ID);
            const isOnlineInMC = onlineDiscordIds.has(memberId);
            
            try {
                if (isOnlineInMC && !hasModeratingRole) {
                    // Staff is online in MC but doesn't have the role - add it
                    await member.roles.add(CURRENTLY_MODERATING_ROLE_ID, 'Staff online on Minecraft server');
                    rolesAdded++;
                    console.log(`[StaffOnline] Added moderating role to ${member.user.tag}`);
                } else if (!isOnlineInMC && hasModeratingRole) {
                    // Staff is not online in MC but has the role - remove it
                    await member.roles.remove(CURRENTLY_MODERATING_ROLE_ID, 'Staff no longer online on Minecraft server');
                    rolesRemoved++;
                    console.log(`[StaffOnline] Removed moderating role from ${member.user.tag}`);
                }
            } catch (err) {
                console.error(`[StaffOnline] Failed to update role for ${member.user.tag}:`, err.message);
            }
        }
        
        // Also remove the role from anyone who has it but isn't staff (cleanup)
        const membersWithModeratingRole = guild.members.cache.filter(m => 
            m.roles.cache.has(CURRENTLY_MODERATING_ROLE_ID) && !m.roles.cache.has(STAFF_ROLE_ID)
        );
        
        for (const [memberId, member] of membersWithModeratingRole) {
            try {
                await member.roles.remove(CURRENTLY_MODERATING_ROLE_ID, 'User is not staff');
                rolesRemoved++;
                console.log(`[StaffOnline] Removed moderating role from non-staff ${member.user.tag}`);
            } catch (err) {
                console.error(`[StaffOnline] Failed to remove role from ${member.user.tag}:`, err.message);
            }
        }
        
        if (rolesAdded > 0 || rolesRemoved > 0) {
            console.log(`[StaffOnline] Updated roles: +${rolesAdded} -${rolesRemoved} | Online staff in MC: ${onlineDiscordIds.size}`);
        }
        
    } catch (error) {
        console.error('[StaffOnline] Error in check:', error);
    } finally {
        isRunning = false;
    }
}

/**
 * Initialize the staff online tracking system
 * @param {Client} client - Discord client
 */
function initStaffOnlineTracker(client) {
    console.log('[StaffOnline] Initializing staff online tracker...');
    console.log(`[StaffOnline] Staff Role: ${STAFF_ROLE_ID}`);
    console.log(`[StaffOnline] Currently Moderating Role: ${CURRENTLY_MODERATING_ROLE_ID}`);
    console.log(`[StaffOnline] Check Interval: ${CHECK_INTERVAL / 1000}s`);
    
    // Run immediately on startup
    checkStaffOnline(client);
    
    // Then run on interval
    if (checkInterval) {
        clearInterval(checkInterval);
    }
    
    checkInterval = setInterval(() => {
        checkStaffOnline(client);
    }, CHECK_INTERVAL);
    
    console.log('[StaffOnline] Staff online tracker initialized!');
}

/**
 * Stop the staff online tracker
 */
function stopStaffOnlineTracker() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
        console.log('[StaffOnline] Stopped staff online tracker');
    }
}

module.exports = {
    initStaffOnlineTracker,
    stopStaffOnlineTracker,
    checkStaffOnline,
    commands: {},
    slashCommands: []
};
