/**
 * Kick Model
 * Tracks all kicks issued through the bot
 */

const mongoose = require('mongoose');

const kickSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    caseNumber: { type: Number, required: false },
    
    // Target info
    primaryUuid: { type: String, required: true },
    primaryUsername: { type: String, required: true },
    primaryPlatform: { type: String, default: 'java' },
    
    // Discord link (if available)
    discordId: { type: String, default: null },
    discordTag: { type: String, default: null },
    
    // Kick details
    reason: { type: String, required: true },
    
    // Staff info
    staffId: { type: String, required: true },
    staffTag: { type: String, required: true },
    
    // Timestamp
    kickedAt: { type: Date, default: Date.now },
    
    // Whether the kick was executed via RCON
    rconExecuted: { type: Boolean, default: false }
});

// Index for quick lookups
kickSchema.index({ primaryUuid: 1 });
kickSchema.index({ discordId: 1 });
kickSchema.index({ caseNumber: 1 });
kickSchema.index({ kickedAt: -1 });

module.exports = mongoose.model('Kick', kickSchema);
