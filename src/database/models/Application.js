/**
 * Application Model
 * Stores whitelist applications with standardized source tracking
 */
const mongoose = require('mongoose');
const { SOURCE_CATEGORIES, normalizeSource } = require('../../utils/sourceNormalizer');

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

