/**
 * Source Normalizer Utility
 * Centralizes source normalization for application analytics
 */

// Standardized source categories for analytics
const SOURCE_CATEGORIES = {
    'youtube': 'YouTube',
    'tiktok': 'TikTok',
    'reddit': 'Reddit',
    'twitter': 'Twitter/X',
    'discord': 'Discord',
    'friend': 'Friend/Word of Mouth',
    'search': 'Search Engine',
    'minecraft_server_list': 'Server List',
    'twitch': 'Twitch',
    'other': 'Other'
};

/**
 * Normalize user input to a standard category
 * @param {string} input - Raw user input
 * @returns {string} - Normalized category key
 */
function normalizeSource(input) {
    if (!input) return 'other';
    
    const lower = input.toLowerCase().trim();
    
    // YouTube variations
    if (lower.includes('youtube') || lower.includes('yt') || lower.includes('video')) {
        return 'youtube';
    }
    
    // TikTok variations
    if (lower.includes('tiktok') || lower.includes('tik tok') || lower.includes('tt')) {
        return 'tiktok';
    }
    
    // Reddit variations
    if (lower.includes('reddit') || lower.includes('r/')) {
        return 'reddit';
    }
    
    // Twitter/X variations
    if (lower.includes('twitter') || lower.includes(' x ') || lower === 'x' || lower.includes('tweet')) {
        return 'twitter';
    }
    
    // Discord variations
    if (lower.includes('discord') || lower.includes('disboard') || lower.includes('server listing')) {
        return 'discord';
    }
    
    // Friend/Word of mouth variations
    if (lower.includes('friend') || lower.includes('word of mouth') || lower.includes('someone told') || 
        lower.includes('my ') || lower.includes('a friend') || lower.includes('buddy') ||
        lower.includes('brother') || lower.includes('sister') || lower.includes('family') ||
        lower.includes('referred') || lower.includes('recommendation')) {
        return 'friend';
    }
    
    // Search engine variations
    if (lower.includes('google') || lower.includes('search') || lower.includes('bing') || 
        lower.includes('looked up') || lower.includes('searched')) {
        return 'search';
    }
    
    // Server list variations
    if (lower.includes('server list') || lower.includes('minecraft-server') || lower.includes('topg') ||
        lower.includes('planet minecraft') || lower.includes('mc-list') || lower.includes('minecraftservers')) {
        return 'minecraft_server_list';
    }
    
    // Twitch variations
    if (lower.includes('twitch') || lower.includes('stream') || lower.includes('streamer')) {
        return 'twitch';
    }
    
    return 'other';
}

/**
 * Get the display label for a category
 * @param {string} category - Category key
 * @returns {string} - Display label
 */
function getCategoryLabel(category) {
    return SOURCE_CATEGORIES[category] || 'Other';
}

module.exports = {
    SOURCE_CATEGORIES,
    normalizeSource,
    getCategoryLabel
};
