/**
 * Player Connection Model
 * Tracks player connections for ALT detection and analytics
 */

const mongoose = require('mongoose');

const playerConnectionSchema = new mongoose.Schema({
    uuid: {
        type: String,
        required: true,
        index: true
    },
    username: {
        type: String,
        required: true
    },
    ip: {
        type: String,
        required: true,
        index: true
    },
    ipHash: {
        type: String,
        required: true,
        index: true
    },
    server: {
        type: String,
        default: 'proxy'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    sessionDuration: {
        type: Number,
        default: 0
    },
    ping: {
        type: Number,
        default: 0
    },
    type: {
        type: String,
        enum: ['join', 'leave', 'server_switch'],
        default: 'join'
    }
}, {
    timestamps: true
});

// Index for cleanup (2 week retention)
playerConnectionSchema.index({ timestamp: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

// Index for ALT detection queries
playerConnectionSchema.index({ ip: 1, uuid: 1 });
playerConnectionSchema.index({ ipHash: 1, uuid: 1 });

module.exports = mongoose.model('PlayerConnection', playerConnectionSchema);
