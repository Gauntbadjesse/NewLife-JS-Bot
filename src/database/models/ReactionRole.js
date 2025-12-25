/**
 * ReactionRole Model
 * Stores reaction role configurations
 */
const mongoose = require('mongoose');

const reactionRoleSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    emoji: { type: String, required: true }, // Unicode emoji or custom emoji ID
    roleId: { type: String, required: true },
    description: { type: String },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String }
});

// Compound index for quick lookups
reactionRoleSchema.index({ messageId: 1, emoji: 1 });

module.exports = mongoose.model('ReactionRole', reactionRoleSchema);
