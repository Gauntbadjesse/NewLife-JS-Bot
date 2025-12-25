/**
 * Ban Model
 * Schema for player bans from the NewLife SMP plugin
 */

const mongoose = require('mongoose');

const banSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    uuid: {
        type: String,
        required: true,
        index: true
    },
    caseNumber: {
        type: Number,
        index: true,
        default: null
    },
    playerName: {
        type: String,
        required: true
    },
    staffUuid: {
        type: String,
        default: null
    },
    staffName: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        required: true
    },
    active: {
        type: Boolean,
        default: true
    },
    removedBy: {
        type: String,
        default: null
    },
    removedAt: {
        type: Date,
        default: null
    },
    // Optional: Duration for temp bans
    duration: {
        type: Number,
        default: null
    },
    expiresAt: {
        type: Date,
        default: null
    }
}, {
    collection: process.env.BANS_COLLECTION || 'bans',
    versionKey: false
});

// Index for faster lookups
banSchema.index({ playerName: 1 });
banSchema.index({ active: 1 });
banSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Ban', banSchema);
