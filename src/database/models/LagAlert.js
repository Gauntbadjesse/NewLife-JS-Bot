/**
 * Lag Alert Model
 * Stores lag alerts and suspected lag machines
 */

const mongoose = require('mongoose');

const lagAlertSchema = new mongoose.Schema({
    server: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['tps_drop', 'entity_spam', 'redstone_lag', 'chunk_overload', 'hopper_lag', 'piston_spam', 'suspected_lag_machine'],
        required: true
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    location: {
        world: String,
        x: Number,
        y: Number,
        z: Number,
        chunkX: Number,
        chunkZ: Number
    },
    details: {
        type: String,
        required: true
    },
    metrics: {
        tps: Number,
        mspt: Number,
        entityCount: Number,
        redstoneActivity: Number,
        hopperActivity: Number
    },
    playerNearby: {
        uuid: String,
        username: String
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    resolved: {
        type: Boolean,
        default: false
    },
    resolvedBy: {
        type: String,
        default: null
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    discordMessageId: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Auto-delete after 2 weeks
lagAlertSchema.index({ timestamp: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });
lagAlertSchema.index({ resolved: 1, severity: 1 });

module.exports = mongoose.model('LagAlert', lagAlertSchema);
