/**
 * RCON Utility
 * Handles RCON connections to Minecraft server for NewLife Management Bot
 */

const { Rcon } = require('rcon-client');

/**
 * Execute an RCON command on the Minecraft server
 * @param {string} command - The command to execute
 * @returns {Promise<{success: boolean, response: string}>}
 */
async function executeRcon(command) {
    const host = process.env.RCON_HOST;
    const port = parseInt(process.env.RCON_PORT) || 25575;
    const password = process.env.RCON_PASSWORD;

    if (!host || !password) {
        return {
            success: false,
            response: 'RCON is not configured. Please set RCON_HOST and RCON_PASSWORD in .env'
        };
    }

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
        // Log success (trim response for logs)
        try {
            console.log(`[ProxyRCON] Executed "${command}" on ${host}:${port} - response: ${String(response).slice(0, 300)}`);
        } catch (e) {
            console.log('[ProxyRCON] Executed command (response logging failed)');
        }        
        return {
            success: true,
            response: response || 'Command executed successfully'
        };
    } catch (error) {
        console.error('RCON Error:', error.message);
        
        if (rcon) {
            try {
                await rcon.end();
            } catch (e) {
                // Ignore close errors
            }
        }

        return {
            success: false,
            response: `RCON connection failed: ${error.message}`
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
    const host = process.env.PROXY_RCON_HOST;
    const port = parseInt(process.env.PROXY_RCON_PORT) || 27242;
    const password = process.env.PROXY_RCON_PASSWORD;

    if (!host || !password) {
        return {
            success: false,
            response: 'Proxy RCON is not configured. Please set PROXY_RCON_HOST and PROXY_RCON_PASSWORD in .env'
        };
    }

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
