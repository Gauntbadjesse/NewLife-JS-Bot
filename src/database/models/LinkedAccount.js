/**
 * Linked Account Model
 * Stores Discord-to-Minecraft account links
 * Supports multiple accounts per Discord user and both Java/Bedrock platforms
 */
const mongoose = require('mongoose');

const linkedAccountSchema = new mongoose.Schema({
    discordId: { type: String, required: true, index: true },
    minecraftUsername: { type: String, required: true },
    // For Java: standard UUID, For Bedrock: fUUID (floodgate UUID)
    uuid: { type: String, required: true, index: true },
    platform: { type: String, enum: ['java', 'bedrock'], required: true },
    linkedAt: { type: Date, default: Date.now },
    linkedBy: { type: String, default: null }, // Staff ID if manually linked
    verified: { type: Boolean, default: false },
    primary: { type: Boolean, default: false } // Primary account for nickname
}, {
    collection: 'linked_accounts',
    versionKey: false
});

// Compound index to prevent duplicate links
linkedAccountSchema.index({ discordId: 1, uuid: 1 }, { unique: true });
linkedAccountSchema.index({ discordId: 1 });
linkedAccountSchema.index({ uuid: 1 });
linkedAccountSchema.index({ minecraftUsername: 1 });

module.exports = mongoose.model('LinkedAccount', linkedAccountSchema);
