/**
 * Error Logger Utility
 * Sends all errors to a Discord channel in a code block
 */

const ERROR_LOG_CHANNEL_ID = '1372674267241644187';

let discordClient = null;

/**
 * Initialize the error logger with the Discord client
 */
function initErrorLogger(client) {
    discordClient = client;
}

/**
 * Log an error to the Discord channel
 * @param {string} context - Where the error occurred (e.g., 'infractions.js', 'button handler')
 * @param {Error|string} error - The error object or message
 * @param {Object} extra - Extra context info
 */
async function logError(context, error, extra = {}) {
    // Always log to console
    console.error(`[${context}]`, error);

    if (!discordClient) {
        console.error('[ErrorLogger] Client not initialized');
        return;
    }

    try {
        const channel = await discordClient.channels.fetch(ERROR_LOG_CHANNEL_ID).catch(() => null);
        if (!channel) {
            console.error(`[ErrorLogger] Could not find error log channel: ${ERROR_LOG_CHANNEL_ID}`);
            return;
        }

        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : 'No stack trace';

        // Build extra info string
        let extraInfo = '';
        if (Object.keys(extra).length > 0) {
            extraInfo = '\n\n--- Extra Info ---\n' + Object.entries(extra)
                .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}`)
                .join('\n');
        }

        const logMessage = `[${timestamp}] [${context}]

Error: ${errorMessage}

Stack:
${errorStack}${extraInfo}`;

        // Discord has a 2000 char limit, truncate if needed
        const truncated = logMessage.length > 1900 
            ? logMessage.substring(0, 1900) + '\n... (truncated)'
            : logMessage;

        await channel.send({ content: '```\n' + truncated + '\n```' });
    } catch (e) {
        console.error('[ErrorLogger] Failed to send error to channel:', e);
    }
}

module.exports = {
    initErrorLogger,
    logError
};
