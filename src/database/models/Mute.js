/**
 * Mute Model
 * Stores moderation mute records with expiration.
 * Discord linkage is optional because some actions are Minecraft-only.
 */

const mongoose = require('mongoose');

const muteSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // UUID
    caseNumber: { type: Number, required: true },
    
    // Target user info
    discordId: { type: String, default: null, index: true },
    discordTag: { type: String, default: null },
    
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
muteSchema.index({ uuid: 1, active: 1 });
muteSchema.index({ playerName: 1, active: 1 });
muteSchema.index({ expiresAt: 1, active: 1 });

function buildTargetQuery(target) {
    const query = {
        active: true,
        $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ]
    };

    if (!target) return query;

    if (typeof target === 'string') {
        query.$or.unshift({ discordId: String(target) });
        return query;
    }

    if (target.discordId) {
        query.$or.unshift({ discordId: String(target.discordId) });
    }

    if (target.uuid) {
        query.$or.unshift({ uuid: String(target.uuid).replace(/-/g, '').toLowerCase() });
    }

    if (target.playerName) {
        query.$or.unshift({ playerName: target.playerName });
    }

    return query;
}

// Static method to get active mute for a user
muteSchema.statics.getActiveMute = function(target) {
    return this.findOne(buildTargetQuery(target));
};

// Static method to count active mutes for a user
muteSchema.statics.countActiveMutes = function(target) {
    const query = { active: true };
    if (typeof target === 'string') {
        query.discordId = String(target);
    } else if (target && typeof target === 'object') {
        if (target.discordId) query.discordId = String(target.discordId);
        else if (target.uuid) query.uuid = String(target.uuid).replace(/-/g, '').toLowerCase();
        else if (target.playerName) query.playerName = target.playerName;
    }
    return this.countDocuments(query);
};

// Static method to get all expired but still active mutes
muteSchema.statics.getExpiredMutes = function() {
    return this.find({
        active: true,
        expiresAt: { $ne: null, $lte: new Date() }
    });
};

module.exports = mongoose.model('Mute', muteSchema);
