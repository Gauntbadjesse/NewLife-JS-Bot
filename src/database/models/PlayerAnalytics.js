/**
 * Player Analytics Model
 * Aggregated player statistics
 */

const mongoose = require('mongoose');

const playerAnalyticsSchema = new mongoose.Schema({
    uuid: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    username: {
        type: String,
        required: true
    },
    firstSeen: {
        type: Date,
        default: Date.now
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    totalPlaytime: {
        type: Number,
        default: 0 // In seconds
    },
    sessionCount: {
        type: Number,
        default: 0
    },
    averageSessionLength: {
        type: Number,
        default: 0 // In seconds
    },
    favoriteServer: {
        type: String,
        default: null
    },
    serverPlaytime: {
        type: Map,
        of: Number,
        default: {}
    },
    peakHours: [{
        type: Number // 0-23
    }],
    ipHistory: [{
        ip: String,
        ipHash: String,
        firstUsed: Date,
        lastUsed: Date
    }],
    connectionCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PlayerAnalytics', playerAnalyticsSchema);
