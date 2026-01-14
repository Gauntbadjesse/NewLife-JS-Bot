/**
 * Mute Model
 * Stores discord mute records with expiration
 */

const mongoose = require('mongoose');

const muteSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // UUID
    caseNumber: { type: Number, required: true },
    
    // Target user info
    discordId: { type: String, required: true, index: true },
    discordTag: { type: String },
    
    // Linked Minecraft info (if available)
    uuid: { type: String },
    playerName: { type: String },
    platform: { type: String },
    
    // Mute details
    reason: { type: String, required: true },
    duration: { type: String }, // Display string like "1h", "1d"
    durationMs: { type: Number }, // Duration in ms
    
    // Timestamps
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, index: true },
    
    // Staff who issued
    staffId: { type: String, required: true },
    staffName: { type: String },
    
    // Status
    active: { type: Boolean, default: true, index: true },
    dmSent: { type: Boolean, default: false },
    
    // Unmute info (if manually unmuted)
    unmutedAt: { type: Date },
    unmutedBy: { type: String },
    unmutedByTag: { type: String }
}, {
    collection: 'mutes',
    versionKey: false
});

// Compound index for efficient lookups
muteSchema.index({ discordId: 1, active: 1 });
muteSchema.index({ expiresAt: 1, active: 1 });

// Static method to get active mute for a user
muteSchema.statics.getActiveMute = function(discordId) {
    return this.findOne({ 
        discordId: String(discordId), 
        active: true,
        $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ]
    });
};

// Static method to count active mutes for a user
muteSchema.statics.countActiveMutes = function(discordId) {
    return this.countDocuments({ 
        discordId: String(discordId), 
        active: true 
    });
};

// Static method to get all expired but still active mutes
muteSchema.statics.getExpiredMutes = function() {
    return this.find({
        active: true,
        expiresAt: { $ne: null, $lte: new Date() }
    });
};

module.exports = mongoose.model('Mute', muteSchema);
