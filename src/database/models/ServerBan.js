/**
 * Server Ban Model
 * Stores player bans with linked account support
 * Integrates with Velocity proxy for enforcement
 */
const mongoose = require('mongoose');

const serverBanSchema = new mongoose.Schema({
    // Case tracking
    caseNumber: { type: Number, unique: true, sparse: true },
    
    // Target information (primary - the account that was directly banned)
    primaryUuid: { type: String, required: true, index: true },
    primaryUsername: { type: String, required: true },
    primaryPlatform: { type: String, enum: ['java', 'bedrock'], required: true },
    
    // All UUIDs associated with this ban (for linked accounts)
    bannedUuids: [{ type: String, index: true }],
    
    // Discord link
    discordId: { type: String, index: true },
    discordTag: { type: String },
    
    // Ban details
    reason: { type: String, required: true },
    duration: { type: String, required: true }, // "perm" or duration string like "7d", "30d"
    isPermanent: { type: Boolean, default: false },
    
    // Timestamps
    bannedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, index: true }, // null for permanent
    
    // Staff who issued the ban
    staffId: { type: String, required: true },
    staffTag: { type: String, required: true },
    
    // Status
    active: { type: Boolean, default: true, index: true },
    
    // If unbanned
    unbannedAt: { type: Date },
    unbannedBy: { type: String },
    unbannedByTag: { type: String },
    unbanReason: { type: String }
}, {
    collection: 'server_bans',
    timestamps: true
});

// Compound indexes for efficient lookups
serverBanSchema.index({ active: 1, expiresAt: 1 });
serverBanSchema.index({ bannedUuids: 1, active: 1 });

/**
 * Check if this ban is expired
 */
serverBanSchema.methods.isExpired = function() {
    if (this.isPermanent) return false;
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
};

/**
 * Get remaining time as human readable string
 */
serverBanSchema.methods.getRemainingTime = function() {
    if (this.isPermanent) return 'Permanent';
    if (!this.expiresAt) return 'Unknown';
    
    const now = new Date();
    const diff = this.expiresAt - now;
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

/**
 * Static: Find active ban for a UUID
 */
serverBanSchema.statics.findActiveBan = async function(uuid) {
    const normalizedUuid = uuid.replace(/-/g, '');
    
    // Find ban where this UUID is in bannedUuids and ban is active
    const ban = await this.findOne({
        bannedUuids: { $in: [normalizedUuid, uuid] },
        active: true
    });
    
    if (!ban) return null;
    
    // Check if expired
    if (ban.isExpired()) {
        // Auto-expire the ban
        ban.active = false;
        await ban.save();
        return null;
    }
    
    return ban;
};

/**
 * Static: Find all bans for a player (active and inactive)
 */
serverBanSchema.statics.findAllBans = async function(uuid) {
    const normalizedUuid = uuid.replace(/-/g, '');
    
    return this.find({
        bannedUuids: { $in: [normalizedUuid, uuid] }
    }).sort({ bannedAt: -1 });
};

module.exports = mongoose.model('ServerBan', serverBanSchema);
