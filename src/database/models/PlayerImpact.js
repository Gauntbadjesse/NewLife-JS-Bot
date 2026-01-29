/**
 * Player Impact Model
 * Tracks individual player's impact on server performance
 */

const mongoose = require('mongoose');

const playerImpactSchema = new mongoose.Schema({
    uuid: {
        type: String,
        required: true,
        index: true
    },
    username: {
        type: String,
        required: true
    },
    server: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    tickContribution: {
        type: Number,
        default: 0 // Estimated tick time caused by player
    },
    blocksPlaced: {
        type: Number,
        default: 0
    },
    blocksBroken: {
        type: Number,
        default: 0
    },
    entitiesSpawned: {
        type: Number,
        default: 0
    },
    redstoneTriggered: {
        type: Number,
        default: 0
    },
    hoppersInteracted: {
        type: Number,
        default: 0
    },
    chunkLoads: {
        type: Number,
        default: 0
    },
    location: {
        world: String,
        x: Number,
        y: Number,
        z: Number
    }
}, {
    timestamps: true
});

// Auto-delete after 2 weeks
playerImpactSchema.index({ timestamp: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });
playerImpactSchema.index({ uuid: 1, server: 1, timestamp: -1 });

module.exports = mongoose.model('PlayerImpact', playerImpactSchema);
