/**
 * Application Model
 * Stores whitelist applications with standardized source tracking
 */
const mongoose = require('mongoose');

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

const applicationSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    discordId: { type: String, required: true, index: true },
    playerName: { type: String, required: true },
    platform: { type: String, enum: ['java','bedrock'], required: true },
    age: { type: Number, required: true },
    // Original user input
    whereFoundRaw: { type: String, default: null },
    // Normalized category for analytics
    whereFoundCategory: { 
        type: String, 
        enum: Object.keys(SOURCE_CATEGORIES),
        default: 'other',
        index: true
    },
    whyJoin: { type: String, default: null },
    bring: { type: String, default: null },
    createdAt: { type: Date, required: true, index: true },
    processed: { type: Boolean, default: false }
}, {
    collection: 'applications',
    versionKey: false
});

// Pre-save hook to normalize source
applicationSchema.pre('save', function(next) {
    if (this.whereFoundRaw && !this.whereFoundCategory) {
        this.whereFoundCategory = normalizeSource(this.whereFoundRaw);
    }
    // Support legacy field name
    if (this.whereFound && !this.whereFoundRaw) {
        this.whereFoundRaw = this.whereFound;
        this.whereFoundCategory = normalizeSource(this.whereFound);
    }
    next();
});

// Virtual for backward compatibility
applicationSchema.virtual('whereFound').get(function() {
    return this.whereFoundRaw;
}).set(function(value) {
    this.whereFoundRaw = value;
    this.whereFoundCategory = normalizeSource(value);
});

// Static method to get source analytics
applicationSchema.statics.getSourceAnalytics = async function(startDate = null, endDate = null) {
    const match = {};
    if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = startDate;
        if (endDate) match.createdAt.$lte = endDate;
    }
    
    const pipeline = [
        { $match: match },
        { 
            $group: { 
                _id: '$whereFoundCategory', 
                count: { $sum: 1 } 
            } 
        },
        { $sort: { count: -1 } }
    ];
    
    const results = await this.aggregate(pipeline);
    
    // Map to readable names and calculate percentages
    const total = results.reduce((sum, r) => sum + r.count, 0);
    
    return results.map(r => ({
        category: r._id || 'other',
        label: SOURCE_CATEGORIES[r._id] || 'Other',
        count: r.count,
        percentage: total > 0 ? ((r.count / total) * 100).toFixed(1) : 0
    }));
};

module.exports = mongoose.model('Application', applicationSchema);
module.exports.SOURCE_CATEGORIES = SOURCE_CATEGORIES;
module.exports.normalizeSource = normalizeSource;

