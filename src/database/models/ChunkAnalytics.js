/**
 * Chunk Analytics Model
 * Tracks per-chunk performance data
 */

const mongoose = require('mongoose');

const chunkAnalyticsSchema = new mongoose.Schema({
    server: {
        type: String,
        required: true,
        index: true
    },
    world: {
        type: String,
        required: true
    },
    chunkX: {
        type: Number,
        required: true
    },
    chunkZ: {
        type: Number,
        required: true
    },
    entityCount: {
        type: Number,
        default: 0
    },
    entityBreakdown: {
        type: Map,
        of: Number,
        default: {}
    },
    tileEntityCount: {
        type: Number,
        default: 0
    },
    hopperCount: {
        type: Number,
        default: 0
    },
    redstoneCount: {
        type: Number,
        default: 0
    },
    tickTime: {
        type: Number,
        default: 0 // microseconds
    },
    flagged: {
        type: Boolean,
        default: false
    },
    flagReason: {
        type: String,
        default: null
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    playersNearby: [{
        uuid: String,
        username: String
    }]
}, {
    timestamps: true
});

// Compound index for chunk lookups
chunkAnalyticsSchema.index({ server: 1, world: 1, chunkX: 1, chunkZ: 1 }, { unique: true });
chunkAnalyticsSchema.index({ flagged: 1, entityCount: -1 });

// Auto-delete after 2 weeks
chunkAnalyticsSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

module.exports = mongoose.model('ChunkAnalytics', chunkAnalyticsSchema);
