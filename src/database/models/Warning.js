/**
 * Warning Model
 * Schema for player warnings - supports Discord users and linked MC accounts
 */

const mongoose = require('mongoose');

const warningSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    caseNumber: {
        type: Number,
        index: true,
        default: null
    },
    // MC info (optional - may be Discord-only warning)
    uuid: {
        type: String,
        index: true,
        default: null
    },
    playerName: {
        type: String,
        default: null
    },
    platform: {
        type: String,
        enum: ['java', 'bedrock', null],
        default: null
    },
    // All linked UUIDs at time of warning
    warnedUuids: [{
        type: String
    }],
    // Discord info (required)
    discordId: {
        type: String,
        index: true,
        required: true
    },
    discordTag: {
        type: String,
        required: true
    },
    // Staff info
    staffUuid: {
        type: String,
        default: null
    },
    staffName: {
        type: String,
        required: true
    },
    staffId: {
        type: String,
        default: null
    },
    // Warning details
    reason: {
        type: String,
        required: true
    },
    severity: {
        type: String,
        enum: ['minor', 'moderate', 'severe'],
        default: 'moderate'
    },
    category: {
        type: String,
        enum: ['behavior', 'chat', 'cheating', 'griefing', 'other'],
        default: 'other'
    },
    // Timestamps
    createdAt: {
        type: Date,
        required: true,
        default: Date.now
    },
    // Status
    active: {
        type: Boolean,
        default: true
    },
    removedBy: {
        type: String,
        default: null
    },
    removedByTag: {
        type: String,
        default: null
    },
    removedAt: {
        type: Date,
        default: null
    },
    removeReason: {
        type: String,
        default: null
    },
    // DM status
    dmSent: {
        type: Boolean,
        default: false
    }
}, {
    collection: process.env.WARNINGS_COLLECTION || 'warnings',
    versionKey: false
});

// Indexes for faster lookups
warningSchema.index({ playerName: 1 });
warningSchema.index({ discordId: 1, active: 1 });
warningSchema.index({ active: 1 });
warningSchema.index({ createdAt: -1 });
warningSchema.index({ category: 1 });
warningSchema.index({ severity: 1 });
warningSchema.index({ staffId: 1 });

// Static method to count active warnings for a user
warningSchema.statics.countActiveWarnings = async function(discordId) {
    return this.countDocuments({ discordId, active: true });
};

// Static method to get all warnings for a user
warningSchema.statics.getUserWarnings = async function(discordId, includeRemoved = false) {
    const query = { discordId };
    if (!includeRemoved) {
        query.active = true;
    }
    return this.find(query).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Warning', warningSchema);
