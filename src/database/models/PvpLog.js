const mongoose = require('mongoose');

const pvpLogSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['status_change', 'pvp_kill', 'invalid_pvp', 'death']
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now
    },
    // For status_change
    uuid: String,
    username: String,
    enabled: Boolean,
    // For pvp_kill
    killer: {
        uuid: String,
        username: String,
        pvp_enabled: Boolean,
        status: String
    },
    victim: {
        uuid: String,
        username: String,
        pvp_enabled: Boolean,
        status: String
    },
    consensual: Boolean,
    // For invalid_pvp
    attacker: {
        uuid: String,
        username: String,
        pvp_enabled: Boolean
    },
    damage: Number,
    // For death
    cause: String,
    // Discord message ID for tracking
    messageId: String,
    channelId: String
}, {
    timestamps: true
});

// Index for faster queries
pvpLogSchema.index({ type: 1, timestamp: -1 });
pvpLogSchema.index({ 'killer.uuid': 1 });
pvpLogSchema.index({ 'victim.uuid': 1 });
pvpLogSchema.index({ uuid: 1 });

module.exports = mongoose.model('PvpLog', pvpLogSchema);
