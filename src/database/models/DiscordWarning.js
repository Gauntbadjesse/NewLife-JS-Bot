/**
 * Discord Warning Model
 * Stores warnings issued via prefix commands (Discord moderation)
 * These are Discord-side records only
 */
const mongoose = require('mongoose');

const discordWarningSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    caseNumber: { type: Number, index: true, default: null },
    discordId: { type: String, required: true, index: true },
    discordTag: { type: String, required: true },
    staffId: { type: String, required: true },
    staffName: { type: String, required: true },
    reason: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    active: { type: Boolean, default: true },
    removedBy: { type: String, default: null },
    removedAt: { type: Date, default: null },
    source: { type: String, default: 'prefix' }
}, {
    collection: 'discord_warnings',
    versionKey: false
});

discordWarningSchema.index({ discordId: 1 });
discordWarningSchema.index({ active: 1 });
discordWarningSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DiscordWarning', discordWarningSchema);
