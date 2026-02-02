/**
 * AltGroup Model
 * Tracks potential alt account groups detected through shared IPs
 */
const mongoose = require('mongoose');

const altGroupSchema = new mongoose.Schema({
    // Primary account (first detected)
    primaryUuid: { type: String, required: true, index: true },
    primaryUsername: { type: String, required: true },
    
    // Linked accounts detected sharing IPs
    linkedAccounts: [{
        uuid: { type: String, required: true },
        username: { type: String, required: true }
    }],
    
    // Shared IP hashes that triggered detection
    sharedIps: [{ type: String }],
    
    // Risk score (0-100)
    riskScore: { type: Number, default: 0, index: true },
    
    // Review status
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'dismissed', 'banned'],
        default: 'pending',
        index: true
    },
    
    // Staff review info
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: null },
    
    // Timestamps
    detectedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    collection: 'alt_groups',
    versionKey: false
});

// Compound indexes for efficient queries
altGroupSchema.index({ 'linkedAccounts.uuid': 1 });
altGroupSchema.index({ status: 1, riskScore: -1 });
altGroupSchema.index({ detectedAt: -1 });

module.exports = mongoose.model('AltGroup', altGroupSchema);
