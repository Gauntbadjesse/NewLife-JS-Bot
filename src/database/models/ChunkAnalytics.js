/**
 * ChunkAnalytics Model
 * Tracks chunk-level performance data (entities, tile entities, etc.)
 */
const mongoose = require('mongoose');

const chunkAnalyticsSchema = new mongoose.Schema({
    server: { type: String, required: true, index: true },
    world: { type: String, required: true },
    chunkX: { type: Number, required: true },
    chunkZ: { type: Number, required: true },
    
    // Entity tracking
    entityCount: { type: Number, default: 0 },
    entityBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} }, // { "minecraft:pig": 5, "minecraft:cow": 3 }
    
    // Tile entity tracking
    tileEntityCount: { type: Number, default: 0 },
    hopperCount: { type: Number, default: 0 },
    redstoneCount: { type: Number, default: 0 },
    
    // Flagging for problematic chunks
    flagged: { type: Boolean, default: false, index: true },
    flagReason: { type: String, default: null },
    
    // Players near this chunk when scanned
    playersNearby: [{ type: String }],
    
    lastUpdated: { type: Date, default: Date.now, index: true }
}, {
    collection: 'chunk_analytics',
    versionKey: false
});

// Compound index for chunk lookup
chunkAnalyticsSchema.index({ server: 1, world: 1, chunkX: 1, chunkZ: 1 }, { unique: true });
// Index for finding problem chunks
chunkAnalyticsSchema.index({ flagged: 1, entityCount: -1 });

module.exports = mongoose.model('ChunkAnalytics', chunkAnalyticsSchema);
