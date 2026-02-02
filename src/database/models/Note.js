/**
 * Note Model
 * Staff notes on players (private, not shown to players)
 */
const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    playerName: { type: String, required: true, index: true },
    uuid: { type: String, index: true },
    staffId: { type: String, required: true },
    staffName: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Compound index for efficient player lookups
noteSchema.index({ playerName: 1, createdAt: -1 });

module.exports = mongoose.model('Note', noteSchema);
