/**
 * PlayerImpact Model
 * Tracks individual player's impact on server performance
 */
const mongoose = require('mongoose');

const playerImpactSchema = new mongoose.Schema({
    uuid: { type: String, required: true, index: true },
    username: { type: String, required: true },
    server: { type: String, required: true, index: true },
    
    // Impact metrics (flexible schema for various data points)
    entityCount: { type: Number, default: 0 },
    loadedChunks: { type: Number, default: 0 },
    tpsImpact: { type: Number, default: 0 },
    
    // Location at time of measurement
    location: {
        world: { type: String },
        x: { type: Number },
        y: { type: Number },
        z: { type: Number }
    },
    
    // Additional metrics (flexible)
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    
    timestamp: { type: Date, default: Date.now, index: true }
}, {
    collection: 'player_impact',
    versionKey: false
});

// TTL index to auto-delete old data (keep 7 days)
playerImpactSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });
// Compound index for player queries
playerImpactSchema.index({ uuid: 1, timestamp: -1 });
playerImpactSchema.index({ server: 1, timestamp: -1 });

module.exports = mongoose.model('PlayerImpact', playerImpactSchema);
