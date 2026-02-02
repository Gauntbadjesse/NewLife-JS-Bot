/**
 * Minecraft Utility Functions
 * Shared functions for Minecraft profile lookups and UUID handling
 */

/**
 * Look up a Minecraft profile by username
 * @param {string} username - Minecraft username or gamertag
 * @param {string} platform - 'java' or 'bedrock'
 * @returns {Promise<{uuid: string, name: string, platform: string}|null>}
 */
async function lookupMcProfile(username, platform = 'java') {
    try {
        let fetcher = globalThis.fetch;
        if (!fetcher) fetcher = require('node-fetch');
        
        const url = platform === 'bedrock'
            ? `https://mcprofile.io/api/v1/bedrock/gamertag/${encodeURIComponent(username)}`
            : `https://mcprofile.io/api/v1/java/username/${encodeURIComponent(username)}`;
        
        const res = await fetcher(url);
        if (!res.ok) return null;
        
        const data = await res.json();
        
        let uuid = null;
        if (platform === 'bedrock') {
            uuid = data.fuuid || data.floodgateuid || data.id || data.uuid;
        } else {
            uuid = data.uuid || data.id;
        }
        
        if (!uuid) return null;
        
        return {
            uuid: uuid.replace(/-/g, ''),
            name: data.name || data.username || username,
            platform
        };
    } catch (e) {
        console.error('[Minecraft] Profile lookup error:', e.message);
        return null;
    }
}

/**
 * Format a UUID with dashes (8-4-4-4-12 format)
 * @param {string} uuid - UUID without dashes
 * @returns {string} UUID with dashes
 */
function formatUuid(uuid) {
    if (!uuid) return null;
    const clean = uuid.replace(/-/g, '');
    if (clean.length !== 32) return uuid;
    return `${clean.slice(0,8)}-${clean.slice(8,12)}-${clean.slice(12,16)}-${clean.slice(16,20)}-${clean.slice(20)}`;
}

/**
 * Strip dashes from a UUID
 * @param {string} uuid - UUID with or without dashes
 * @returns {string} UUID without dashes
 */
function stripUuid(uuid) {
    if (!uuid) return null;
    return uuid.replace(/-/g, '');
}

/**
 * Parse duration string to milliseconds and expiry date
 * @param {string} duration - Duration string like "1d", "7d", "30d", "1h", "perm"
 * @returns {Object|null} - { ms, expiresAt, isPermanent, display }
 */
function parseDuration(duration) {
    if (!duration) return null;
    
    const lower = duration.toLowerCase().trim();
    
    if (lower === 'perm' || lower === 'permanent' || lower === 'forever') {
        return {
            ms: null,
            expiresAt: null,
            isPermanent: true,
            display: 'Permanent'
        };
    }
    
    const match = lower.match(/^(\d+)([dhms])$/);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    let ms;
    let display;
    switch (unit) {
        case 'd':
            ms = value * 24 * 60 * 60 * 1000;
            display = `${value} day${value !== 1 ? 's' : ''}`;
            break;
        case 'h':
            ms = value * 60 * 60 * 1000;
            display = `${value} hour${value !== 1 ? 's' : ''}`;
            break;
        case 'm':
            ms = value * 60 * 1000;
            display = `${value} minute${value !== 1 ? 's' : ''}`;
            break;
        case 's':
            ms = value * 1000;
            display = `${value} second${value !== 1 ? 's' : ''}`;
            break;
        default:
            return null;
    }
    
    return {
        ms,
        expiresAt: new Date(Date.now() + ms),
        isPermanent: false,
        display
    };
}

module.exports = {
    lookupMcProfile,
    formatUuid,
    stripUuid,
    parseDuration
};
