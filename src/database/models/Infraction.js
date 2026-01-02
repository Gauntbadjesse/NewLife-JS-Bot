/**
 * Staff Infraction Model
 * Tracks staff infractions: terminations, warnings, notices, strikes
 */
const mongoose = require('mongoose');

const infractionSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    caseNumber: { type: Number, required: true, unique: true, index: true },
    
    // Target staff member
    targetId: { type: String, required: true, index: true },
    targetTag: { type: String, required: true },
    
    // Issuing staff member
    issuerId: { type: String, required: true },
    issuerTag: { type: String, required: true },
    issuerNickname: { type: String, default: null },
    
    // Infraction details
    type: { 
        type: String, 
        enum: ['termination', 'warning', 'notice', 'strike'], 
        required: true,
        index: true
    },
    reason: { type: String, required: true },
    
    // Status
    active: { type: Boolean, default: true },
    
    // Timestamps
    createdAt: { type: Date, default: Date.now, index: true },
    
    // Guild info
    guildId: { type: String, required: true }
}, {
    collection: 'infractions',
    versionKey: false
});

// Indexes for efficient querying
infractionSchema.index({ targetId: 1, createdAt: -1 });
infractionSchema.index({ type: 1, createdAt: -1 });
infractionSchema.index({ guildId: 1, createdAt: -1 });

module.exports = mongoose.model('Infraction', infractionSchema);
