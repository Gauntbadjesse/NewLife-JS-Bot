/**
 * Whitelist Model
 * Stores whitelist entries with Discord linking
 */

const mongoose = require('mongoose');

const whitelistSchema = new mongoose.Schema({
    // Minecraft username
    minecraftUsername: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    // Minecraft UUID (fetched from Mojang API)
    minecraftUuid: {
        type: String,
        default: null
    },
    // Linked Discord user ID
    discordId: {
        type: String,
        default: null,
        index: true
    },
    // Discord username at time of linking
    discordUsername: {
        type: String,
        default: null
    },
    // Who added this player to whitelist
    addedBy: {
        type: String,
        required: true
    },
    // When they were added
    addedAt: {
        type: Date,
        default: Date.now
    },
    // Is the whitelist entry active?
    active: {
        type: Boolean,
        default: true
    },
    // Notes/reason for whitelisting
    notes: {
        type: String,
        default: null
    },
    // Last synced with Minecraft server
    lastSynced: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient queries
whitelistSchema.index({ active: 1, minecraftUsername: 1 });
whitelistSchema.index({ discordId: 1, active: 1 });

module.exports = mongoose.model('Whitelist', whitelistSchema);
