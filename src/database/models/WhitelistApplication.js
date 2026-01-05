/**
 * Whitelist Application Model
 * Stores whitelist applications submitted through the /apanel
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
    
    if (lower.includes('youtube') || lower.includes('yt') || lower.includes('video')) return 'youtube';
    if (lower.includes('tiktok') || lower.includes('tik tok') || lower.includes('tt')) return 'tiktok';
    if (lower.includes('reddit') || lower.includes('r/')) return 'reddit';
    if (lower.includes('twitter') || lower === 'x' || lower.includes('tweet')) return 'twitter';
    if (lower.includes('discord') || lower.includes('disboard')) return 'discord';
    if (lower.includes('friend') || lower.includes('word of mouth') || lower.includes('someone told') || 
        lower.includes('brother') || lower.includes('sister') || lower.includes('family') ||
        lower.includes('referred') || lower.includes('recommendation')) return 'friend';
    if (lower.includes('google') || lower.includes('search') || lower.includes('bing')) return 'search';
    if (lower.includes('server list') || lower.includes('minecraft-server') || lower.includes('topg') ||
        lower.includes('planet minecraft')) return 'minecraft_server_list';
    if (lower.includes('twitch') || lower.includes('stream')) return 'twitch';
    
    return 'other';
}

const whitelistApplicationSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    discordId: { type: String, required: true, index: true },
    discordTag: { type: String, required: true },
    // Linked accounts at time of application
    linkedAccounts: [{
        minecraftUsername: String,
        uuid: String,
        platform: { type: String, enum: ['java', 'bedrock'] }
    }],
    // Application questions
    age: { type: Number, required: true },
    whereFoundRaw: { type: String, default: null },
    whereFoundCategory: { 
        type: String, 
        enum: Object.keys(SOURCE_CATEGORIES),
        default: 'other',
        index: true
    },
    whyJoin: { type: String, required: true },
    experience: { type: String, default: null },
    playstyle: { type: String, default: null },
    // Status tracking
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'denied', 'waitlist'], 
        default: 'pending',
        index: true
    },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    // Thread ID for application discussion
    threadId: { type: String, default: null }
}, {
    collection: 'whitelist_applications',
    versionKey: false
});

// Virtual for backward compatibility
whitelistApplicationSchema.virtual('whereFound').get(function() {
    return this.whereFoundRaw;
}).set(function(value) {
    this.whereFoundRaw = value;
    this.whereFoundCategory = normalizeSource(value);
});

// Pre-save hook to normalize source
whitelistApplicationSchema.pre('save', function(next) {
    if (this.whereFoundRaw && !this.whereFoundCategory) {
        this.whereFoundCategory = normalizeSource(this.whereFoundRaw);
    }
    next();
});

// Static method to get source analytics
whitelistApplicationSchema.statics.getSourceAnalytics = async function(startDate = null, endDate = null) {
    const match = {};
    if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = startDate;
        if (endDate) match.createdAt.$lte = endDate;
    }
    
    const pipeline = [
        { $match: match },
        { $group: { _id: '$whereFoundCategory', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ];
    
    const results = await this.aggregate(pipeline);
    const total = results.reduce((sum, r) => sum + r.count, 0);
    
    return results.map(r => ({
        category: r._id || 'other',
        label: SOURCE_CATEGORIES[r._id] || 'Other',
        count: r.count,
        percentage: total > 0 ? ((r.count / total) * 100).toFixed(1) : 0
    }));
};

whitelistApplicationSchema.index({ createdAt: -1 });
whitelistApplicationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('WhitelistApplication', whitelistApplicationSchema);
module.exports.SOURCE_CATEGORIES = SOURCE_CATEGORIES;
module.exports.normalizeSource = normalizeSource;
