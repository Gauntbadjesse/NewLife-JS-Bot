/**
 * Ingame Warning Model
 * Stores warnings issued via slash commands (in-game moderation)
 * These are synced with the Minecraft server
 */
const mongoose = require('mongoose');

const ingameWarningSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    caseNumber: { type: Number, index: true, default: null },
    uuid: { type: String, required: true, index: true },
    playerName: { type: String, required: true },
    platform: { type: String, enum: ['java', 'bedrock'], default: 'java' },
    staffId: { type: String, default: null },
    staffName: { type: String, required: true },
    reason: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    active: { type: Boolean, default: true },
    removedBy: { type: String, default: null },
    removedAt: { type: Date, default: null },
    source: { type: String, default: 'slash' }
}, {
    collection: 'ingame_warnings',
    versionKey: false
});

ingameWarningSchema.index({ playerName: 1 });
ingameWarningSchema.index({ active: 1 });
ingameWarningSchema.index({ createdAt: -1 });

module.exports = mongoose.model('IngameWarning', ingameWarningSchema);
