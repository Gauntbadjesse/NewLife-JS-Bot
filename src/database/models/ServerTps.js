/**
 * Server TPS Model
 * Tracks server performance over time
 */

const mongoose = require('mongoose');

const serverTpsSchema = new mongoose.Schema({
    server: {
        type: String,
        required: true,
        index: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    tps: {
        type: Number,
        required: true
    },
    mspt: {
        type: Number,
        default: 0
    },
    loadedChunks: {
        type: Number,
        default: 0
    },
    entityCount: {
        type: Number,
        default: 0
    },
    playerCount: {
        type: Number,
        default: 0
    },
    memoryUsed: {
        type: Number,
        default: 0 // MB
    },
    memoryMax: {
        type: Number,
        default: 0 // MB
    }
}, {
    timestamps: true
});

// Auto-delete after 2 weeks
serverTpsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

// Compound index for queries
serverTpsSchema.index({ server: 1, timestamp: -1 });

module.exports = mongoose.model('ServerTps', serverTpsSchema);
