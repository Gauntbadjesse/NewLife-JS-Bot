/**
 * Appeal Model
 * Stores ban/punishment appeal submissions
 */
const mongoose = require('mongoose');

const appealSchema = new mongoose.Schema({
    discordId: { type: String, required: true },
    discordTag: { type: String },
    caseNumber: { type: Number },
    banId: { type: String },
    playerName: { type: String },
    reason: { type: String, required: true }, // Why they should be unbanned
    additionalInfo: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'denied', 'under_review'], default: 'pending' },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    reviewNotes: { type: String },
    messageId: { type: String }, // The appeal message ID in the appeals channel
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Appeal', appealSchema);
