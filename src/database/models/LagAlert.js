/**
 * LagAlert Model
 * Tracks lag alerts and performance issues
 */
const mongoose = require('mongoose');

const lagAlertSchema = new mongoose.Schema({
    server: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true }, // 'tps_drop', 'chunk_lag', 'entity_lag', etc.
    severity: { 
        type: String, 
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium',
        index: true
    },
    
    // Location info (optional)
    location: {
        world: { type: String },
        x: { type: Number },
        y: { type: Number },
        z: { type: Number }
    },
    
    // Alert details
    details: { type: String, required: true },
    
    // Players potentially causing/affected
    playerNearby: { type: String, default: null },
    
    // Performance metrics at time of alert
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    
    // Timestamps
    timestamp: { type: Date, default: Date.now, index: true },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date, default: null }
}, {
    collection: 'lag_alerts',
    versionKey: false
});

// TTL index to auto-delete old alerts (keep 30 days)
lagAlertSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });
// Compound index for finding recent alerts by type
lagAlertSchema.index({ server: 1, type: 1, timestamp: -1 });

module.exports = mongoose.model('LagAlert', lagAlertSchema);
