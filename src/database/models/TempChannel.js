/**
 * TempChannel Model
 * Stores active temporary voice channels
 */

const mongoose = require('mongoose');

const tempChannelSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true, index: true },
    hubId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Index for lookups by channel
tempChannelSchema.index({ channelId: 1 });

module.exports = mongoose.models.TempChannel || mongoose.model('TempChannel', tempChannelSchema);
