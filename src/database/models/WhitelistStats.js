/**
 * WhitelistStats Model
 * Tracks weekly whitelist command usage per staff member
 */
const mongoose = require('mongoose');

const whitelistStatsSchema = new mongoose.Schema({
    staffId: { type: String, required: true, index: true },
    staffTag: { type: String },
    weekStart: { type: Date, required: true, index: true },
    count: { type: Number, default: 0 },
    entries: [{
        mcname: String,
        platform: String,
        discordId: String,
        timestamp: { type: Date, default: Date.now }
    }]
});

// Compound index for efficient lookups
whitelistStatsSchema.index({ staffId: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WhitelistStats', whitelistStatsSchema);
