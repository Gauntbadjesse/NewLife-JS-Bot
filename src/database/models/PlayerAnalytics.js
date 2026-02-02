/**
 * PlayerAnalytics Model
 * Aggregated player analytics data (playtime, sessions, connections)
 */
const mongoose = require('mongoose');

const playerAnalyticsSchema = new mongoose.Schema({
    // Player identity
    uuid: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    
    // Connection stats
    connectionCount: { type: Number, default: 0 },
    sessionCount: { type: Number, default: 0 },
    
    // Playtime tracking (in seconds)
    totalPlaytime: { type: Number, default: 0 },
    
    // Timestamps
    firstSeen: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now, index: true }
}, {
    collection: 'player_analytics',
    versionKey: false
});

// Indexes for efficient queries
playerAnalyticsSchema.index({ totalPlaytime: -1 });
playerAnalyticsSchema.index({ connectionCount: -1 });
playerAnalyticsSchema.index({ username: 1 });

module.exports = mongoose.model('PlayerAnalytics', playerAnalyticsSchema);
