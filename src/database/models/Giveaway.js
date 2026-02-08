/**
 * Giveaway Model
 * Stores giveaway data including participants and winners
 */

const mongoose = require('mongoose');

const giveawaySchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    hostId: { type: String, required: true },
    prize: { type: String, required: true },
    description: { type: String },
    winners: { type: Number, default: 1 },
    endsAt: { type: Date, required: true },
    ended: { type: Boolean, default: false },
    winnerIds: [{ type: String }],
    participants: [{ type: String }],
    requiredRole: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Compound index for active giveaway queries
giveawaySchema.index({ endsAt: 1, ended: 1 });
giveawaySchema.index({ messageId: 1 });

module.exports = mongoose.models.Giveaway || mongoose.model('Giveaway', giveawaySchema);
