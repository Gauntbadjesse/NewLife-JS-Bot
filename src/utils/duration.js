/**
 * Duration Utility
 * Centralized duration parsing and formatting
 * Replaces duplicate implementations across cogs
 */

/**
 * Parse duration string to milliseconds
 * Accepts: 30s, 5m, 1h, 2d, 1w, 1mo, perm
 * @param {string} str - Duration string
 * @param {number} defaultMs - Default milliseconds if parsing fails
 * @returns {number|null} Milliseconds or null/default
 */
function parseDuration(str, defaultMs = null) {
    if (!str) return defaultMs;
    
    const input = String(str).toLowerCase().trim();
    
    // Handle permanent duration
    if (input === 'perm' || input === 'permanent' || input === 'forever') {
        return null; // null signifies permanent
    }
    
    // Parse with unit: 30s, 5m, 1h, 2d, 1w, 1mo
    const match = input.match(/^(\d+)(s|m|h|d|w|mo)?$/);
    if (!match) return defaultMs;
    
    const value = parseInt(match[1], 10);
    const unit = match[2] || 'm'; // default to minutes if no unit
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        case 'mo': return value * 30 * 24 * 60 * 60 * 1000;
        default: return defaultMs;
    }
}

/**
 * Parse duration with full result object
 * @param {string} duration - Duration string
 * @returns {Object|null} { ms, expiresAt, isPermanent, display }
 */
function parseDurationFull(duration) {
    if (!duration) return null;
    
    const lower = String(duration).toLowerCase().trim();
    
    if (lower === 'perm' || lower === 'permanent' || lower === 'forever') {
        return {
            ms: null,
            expiresAt: null,
            isPermanent: true,
            display: 'Permanent'
        };
    }
    
    const ms = parseDuration(duration);
    if (ms === null) return null;
    
    return {
        ms,
        expiresAt: new Date(Date.now() + ms),
        isPermanent: false,
        display: formatDuration(ms)
    };
}

/**
 * Format milliseconds to human-readable duration
 * @param {number} ms - Milliseconds
 * @param {Object} options - Formatting options
 * @param {boolean} options.short - Use short format (1d 2h vs 1 day 2 hours)
 * @param {boolean} options.precise - Include smaller units
 * @returns {string} Formatted duration
 */
function formatDuration(ms, options = {}) {
    const { short = true, precise = false } = options;
    
    if (ms === null || ms === undefined) return 'Permanent';
    if (ms <= 0) return short ? '0s' : '0 seconds';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    
    if (short) {
        if (weeks > 0 && !precise) return `${weeks}w ${days % 7}d`;
        if (days > 0 && !precise) return `${days}d ${hours % 24}h`;
        if (hours > 0 && !precise) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0 && !precise) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
    
    const parts = [];
    if (weeks > 0) parts.push(`${weeks} week${weeks !== 1 ? 's' : ''}`);
    if (days % 7 > 0 || (weeks === 0 && days > 0)) {
        const d = weeks > 0 ? days % 7 : days;
        if (d > 0) parts.push(`${d} day${d !== 1 ? 's' : ''}`);
    }
    if (hours % 24 > 0 && (precise || days === 0)) {
        parts.push(`${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`);
    }
    if (minutes % 60 > 0 && (precise || hours === 0)) {
        parts.push(`${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`);
    }
    if (seconds % 60 > 0 && (precise || minutes === 0)) {
        parts.push(`${seconds % 60} second${seconds % 60 !== 1 ? 's' : ''}`);
    }
    
    return parts.join(' ') || '0 seconds';
}

/**
 * Format a timestamp to Discord relative time format
 * @param {Date|number} date - Date or timestamp
 * @returns {string} Discord relative timestamp
 */
function formatDiscordTime(date, style = 'R') {
    const timestamp = date instanceof Date ? Math.floor(date.getTime() / 1000) : Math.floor(date / 1000);
    return `<t:${timestamp}:${style}>`;
}

/**
 * Get time until a date in human readable format
 * @param {Date} date - Target date
 * @returns {string} Human readable time remaining
 */
function getTimeRemaining(date) {
    const now = Date.now();
    const target = date instanceof Date ? date.getTime() : date;
    const remaining = target - now;
    
    if (remaining <= 0) return 'Expired';
    return formatDuration(remaining);
}

module.exports = {
    parseDuration,
    parseDurationFull,
    formatDuration,
    formatDiscordTime,
    getTimeRemaining
};
