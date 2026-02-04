/**
 * RCON Utility
 * Handles RCON connections to Minecraft server for NewLife Management Bot
 * Uses a persistent connection to avoid console spam
 */

const { Rcon } = require('rcon-client');

// Persistent connection state
let rconConnection = null;
let isConnecting = false;
let isConnected = false;
let reconnectTimeout = null;
const RECONNECT_DELAY_MS = 10000;

/**
 * Get or create a persistent RCON connection
 */
async function getConnection() {
    if (isConnected && rconConnection) {
        return rconConnection;
    }
    
    if (isConnecting) {
        // Wait a bit and check again
        await new Promise(resolve => setTimeout(resolve, 500));
        return isConnected ? rconConnection : null;
    }
    
    isConnecting = true;
    
    const host = process.env.RCON_HOST;
    const port = parseInt(process.env.RCON_PORT) || 25575;
    const password = process.env.RCON_PASSWORD;

    if (!host || !password) {
        isConnecting = false;
        return null;
    }

    try {
        rconConnection = await Rcon.connect({
            host,
            port,
            password,
            timeout: 5000
        });
        
        isConnected = true;
        isConnecting = false;
        console.log('[RCON] Connected');
        
        // Handle disconnection silently
        rconConnection.on('end', () => {
            if (isConnected) {
                console.log('[RCON] Disconnected - will reconnect when server is back');
            }
            isConnected = false;
            rconConnection = null;
            scheduleReconnect();
        });
        
        rconConnection.on('error', (err) => {
            // Silently handle errors - don't crash the bot
            console.log('[RCON] Connection error (server may be restarting)');
            isConnected = false;
            rconConnection = null;
            scheduleReconnect();
        });
        
        return rconConnection;
        
    } catch (error) {
        isConnecting = false;
        isConnected = false;
        rconConnection = null;
        scheduleReconnect();
        return null;
    }
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect() {
    if (reconnectTimeout) return;
    
    reconnectTimeout = setTimeout(async () => {
        reconnectTimeout = null;
        await getConnection();
    }, RECONNECT_DELAY_MS);
}

/**
 * Execute an RCON command on the Minecraft server
 * @param {string} command - The command to execute
 * @returns {Promise<{success: boolean, response: string}>}
 */
async function executeRcon(command) {
    try {
        const rcon = await getConnection();
        
        if (!rcon) {
            return {
                success: false,
                response: 'RCON not connected (server may be offline)'
            };
        }

        const response = await rcon.send(command);
        
        return {
            success: true,
            response: response || 'Command executed successfully'
        };
    } catch (error) {
        // Connection died
        isConnected = false;
        rconConnection = null;
        scheduleReconnect();

        return {
            success: false,
            response: `RCON error: ${error.message}`
        };
    }
}

/**
 * Warn a player via RCON
 * @param {string} playerName - The player to warn
 * @param {string} reason - The warning reason
 * @returns {Promise<{success: boolean, response: string}>}
 */
async function warnPlayer(playerName, reason) {
    // Warning via RCON is disabled — warnings are stored in the database only
    return {
        success: false,
        response: 'RCON warn disabled: warnings are stored in the database only'
    };
}

/**
 * Ban a player via RCON
 * @param {string} playerName - The player to ban
 * @param {string} reason - The ban reason
 * @returns {Promise<{success: boolean, response: string}>}
 */
async function banPlayer(playerName, reason) {
    // Use banspaper namespaced command for banning
    return executeRcon(`banspaper:ban ${playerName} ${reason}`);
}

/**
 * Unban a player via RCON
 * @param {string} playerName - The player to unban
 * @returns {Promise<{success: boolean, response: string}>}
 */
async function unbanPlayer(playerName) {
    // Use banspaper namespaced command for unbanning
    return executeRcon(`banspaper:unban ${playerName}`);
}

/**
 * Test RCON connection
 * @returns {Promise<{success: boolean, response: string}>}
 */
async function testConnection() {
    return executeRcon('list');
}

/**
 * Execute an RCON command on the Velocity proxy
 * @param {string} command - The command to execute
 * @returns {Promise<{success: boolean, response: string}>}
 */
async function executeProxyRcon(command) {
    let host = process.env.PROXY_RCON_HOST;
    let port = parseInt(process.env.PROXY_RCON_PORT) || 27242;
    const password = process.env.PROXY_RCON_PASSWORD;

    // Strip port from host if someone accidentally included it (e.g. "193.218.34.145:27242")
    if (host && host.includes(':')) {
        const parts = host.split(':');
        host = parts[0];
        // Use the port from the host string if PROXY_RCON_PORT wasn't set
        if (!process.env.PROXY_RCON_PORT && parts[1]) {
            port = parseInt(parts[1]) || 27242;
        }
        console.log(`[ProxyRCON] Warning: Host contained port, extracted host="${host}" port=${port}`);
    }

    if (!host || !password) {
        console.log(`[ProxyRCON] Not configured. host=${host ? 'set' : 'missing'}, password=${password ? 'set' : 'missing'}`);
        return {
            success: false,
            response: 'Proxy RCON is not configured. Please set PROXY_RCON_HOST and PROXY_RCON_PASSWORD in .env'
        };
    }

    console.log(`[ProxyRCON] Connecting to ${host}:${port} (command: ${command})`);

    let rcon = null;

    try {
        rcon = await Rcon.connect({
            host: host,
            port: port,
            password: password,
            timeout: 5000
        });

        const response = await rcon.send(command);
        
        await rcon.end();
        
        return {
            success: true,
            response: response || 'Command executed successfully'
        };
    } catch (error) {
        console.error('Proxy RCON Error:', error.message);
        
        if (rcon) {
            try {
                await rcon.end();
            } catch (e) {
                // Ignore close errors
            }
        }

        return {
            success: false,
            response: `Proxy RCON connection failed: ${error.message}`
        };
    }
}

/**
 * Kick a player from the proxy
 * @param {string} playerName - The player to kick
 * @param {string} reason - The kick reason
 * @returns {Promise<{success: boolean, response: string}>}
 */
async function kickFromProxy(playerName, reason) {
    return executeProxyRcon(`kick ${playerName} ${reason}`);
}

/**
 * Test Proxy RCON connection
 * @returns {Promise<{success: boolean, response: string}>}
 */
async function testProxyConnection() {
    return executeProxyRcon('glist');
}

module.exports = {
    executeRcon,
    warnPlayer,
    banPlayer,
    unbanPlayer,
    testConnection,
    executeProxyRcon,
    kickFromProxy,
    testProxyConnection
};
