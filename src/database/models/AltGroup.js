/**
 * ALT Group Model
 * Groups accounts suspected of being ALTs
 */

const mongoose = require('mongoose');

const altGroupSchema = new mongoose.Schema({
    primaryUuid: {
        type: String,
        required: true,
        index: true
    },
    primaryUsername: {
        type: String,
        required: true
    },
    linkedAccounts: [{
        uuid: String,
        username: String,
        addedAt: { type: Date, default: Date.now }
    }],
    sharedIps: [{
        type: String
    }],
    riskScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    flaggedAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed_alt', 'false_positive'],
        default: 'pending'
    },
    resolvedBy: {
        type: String,
        default: null
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Index for lookups
altGroupSchema.index({ 'linkedAccounts.uuid': 1 });
altGroupSchema.index({ status: 1 });

module.exports = mongoose.model('AltGroup', altGroupSchema);
