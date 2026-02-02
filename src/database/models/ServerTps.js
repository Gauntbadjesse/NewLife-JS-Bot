/**
 * ServerTps Model
 * Tracks server TPS (ticks per second) and performance metrics
 */
const mongoose = require('mongoose');

const serverTpsSchema = new mongoose.Schema({
    server: { type: String, required: true, index: true },
    tps: { type: Number, required: true },
    mspt: { type: Number, default: 0 }, // Milliseconds per tick
    loadedChunks: { type: Number, default: 0 },
    entityCount: { type: Number, default: 0 },
    playerCount: { type: Number, default: 0 },
    memoryUsed: { type: Number, default: 0 }, // In MB
    memoryMax: { type: Number, default: 0 },  // In MB
    timestamp: { type: Date, default: Date.now, index: true }
}, {
    collection: 'server_tps',
    versionKey: false
});

// TTL index to auto-delete old data (keep 7 days)
serverTpsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });
// Compound index for efficient queries
serverTpsSchema.index({ server: 1, timestamp: -1 });

module.exports = mongoose.model('ServerTps', serverTpsSchema);
