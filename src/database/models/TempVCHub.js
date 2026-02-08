/**
 * TempVCHub Model
 * Stores temporary voice channel hub configurations
 */

const mongoose = require('mongoose');

const tempVCHubSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    hubChannelId: { type: String, required: true },
    categoryId: { type: String },
    defaultName: { type: String, default: "{user}'s Channel" },
    defaultLimit: { type: Number, default: 0, min: 0, max: 99 },
    createdAt: { type: Date, default: Date.now }
});

// Unique compound index
tempVCHubSchema.index({ guildId: 1, hubChannelId: 1 }, { unique: true });

module.exports = mongoose.models.TempVCHub || mongoose.model('TempVCHub', tempVCHubSchema);
