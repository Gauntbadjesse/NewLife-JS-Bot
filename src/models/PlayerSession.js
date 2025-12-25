/**
 * Player Session Model
 * Tracks player playtime and session data
 */

const mongoose = require('mongoose');

const playerSessionSchema = new mongoose.Schema({
    // Minecraft username
    minecraftUsername: {
        type: String,
        required: true,
        index: true
    },
    // Minecraft UUID
    minecraftUuid: {
        type: String,
        default: null,
        index: true
    },
    // Linked Discord ID (from whitelist)
    discordId: {
        type: String,
        default: null,
        index: true
    },
    // Session start time
    joinTime: {
        type: Date,
        required: true
    },
    // Session end time (null if still online)
    leaveTime: {
        type: Date,
        default: null
    },
    // Session duration in seconds
    duration: {
        type: Number,
        default: 0
    },
    // Is player currently online?
    isOnline: {
        type: Boolean,
        default: true,
        index: true
    },
    // IP address (hashed for privacy)
    ipHash: {
        type: String,
        default: null
    },
    // Server the player joined
    server: {
        type: String,
        default: 'main'
    }
}, {
    timestamps: true
});

// Compound indexes
playerSessionSchema.index({ minecraftUsername: 1, joinTime: -1 });
playerSessionSchema.index({ isOnline: 1, server: 1 });

/**
 * Static method to get total playtime for a player
 */
playerSessionSchema.statics.getTotalPlaytime = async function(username) {
    const result = await this.aggregate([
        { $match: { minecraftUsername: username.toLowerCase() } },
        { $group: { _id: null, totalSeconds: { $sum: '$duration' } } }
    ]);
    return result[0]?.totalSeconds || 0;
};

/**
 * Static method to get online players
 */
playerSessionSchema.statics.getOnlinePlayers = async function(server = null) {
    const query = { isOnline: true };
    if (server) query.server = server;
    return this.find(query).select('minecraftUsername joinTime server');
};

module.exports = mongoose.model('PlayerSession', playerSessionSchema);
