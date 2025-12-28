/**
 * Discord Ban Model
 * Stores bans issued via prefix commands (Discord moderation)
 * These are Discord-side records only
 */
const mongoose = require('mongoose');

const discordBanSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    caseNumber: { type: Number, index: true, default: null },
    discordId: { type: String, required: true, index: true },
    discordTag: { type: String, required: true },
    staffId: { type: String, required: true },
    staffName: { type: String, required: true },
    reason: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    active: { type: Boolean, default: true },
    duration: { type: Number, default: null },
    expiresAt: { type: Date, default: null },
    removedBy: { type: String, default: null },
    removedAt: { type: Date, default: null },
    source: { type: String, default: 'prefix' }
}, {
    collection: 'discord_bans',
    versionKey: false
});

discordBanSchema.index({ discordId: 1 });
discordBanSchema.index({ active: 1 });
discordBanSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DiscordBan', discordBanSchema);
