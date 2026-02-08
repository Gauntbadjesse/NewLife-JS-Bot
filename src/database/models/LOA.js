/**
 * LOA Model
 * Stores Leave of Absence records
 */

const mongoose = require('mongoose');

const loaSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    reason: { type: String },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
    approvedBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Compound indexes for common queries
loaSchema.index({ guildId: 1, userId: 1, active: 1 });
loaSchema.index({ endDate: 1, active: 1 }); // For expiration checks

module.exports = mongoose.models.LOA || mongoose.model('LOA', loaSchema);
