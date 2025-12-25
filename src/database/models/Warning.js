/**
 * Warning Model
 * Schema for player warnings from the NewLife SMP plugin
 */

const mongoose = require('mongoose');

const warningSchema = new mongoose.Schema({
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
    }
}, {
    collection: process.env.WARNINGS_COLLECTION || 'warnings',
    versionKey: false
});

// Index for faster lookups
warningSchema.index({ playerName: 1 });
warningSchema.index({ active: 1 });
warningSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Warning', warningSchema);
