/**
 * TimedClose Model
 * Stores scheduled ticket closures to persist across bot restarts
 */
const mongoose = require('mongoose');

const timedCloseSchema = new mongoose.Schema({
    channelId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    closeAt: { type: Date, required: true, index: true },
    reason: { type: String, required: true },
    scheduledBy: { type: String, required: true },
    scheduledByTag: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Index for efficient lookups
timedCloseSchema.index({ closeAt: 1 });

module.exports = mongoose.model('TimedClose', timedCloseSchema);
