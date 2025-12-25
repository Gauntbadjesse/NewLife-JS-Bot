/**
 * Command Log Model
 * Logs all commands executed in Discord
 */

const mongoose = require('mongoose');

const commandLogSchema = new mongoose.Schema({
    // Command name
    command: {
        type: String,
        required: true,
        index: true
    },
    // Subcommand if applicable
    subcommand: {
        type: String,
        default: null
    },
    // Full command string with arguments
    fullCommand: {
        type: String,
        required: true
    },
    // User who executed the command
    userId: {
        type: String,
        required: true,
        index: true
    },
    // Username at time of execution
    username: {
        type: String,
        required: true
    },
    // User's display name
    displayName: {
        type: String,
        default: null
    },
    // Guild/Server ID
    guildId: {
        type: String,
        required: true,
        index: true
    },
    // Guild name
    guildName: {
        type: String,
        default: null
    },
    // Channel ID where command was executed
    channelId: {
        type: String,
        required: true
    },
    // Channel name
    channelName: {
        type: String,
        default: null
    },
    // Command arguments/options
    arguments: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    // Target user if command targets someone
    targetUserId: {
        type: String,
        default: null
    },
    // Target username
    targetUsername: {
        type: String,
        default: null
    },
    // Was the command successful?
    success: {
        type: Boolean,
        default: true
    },
    // Error message if failed
    errorMessage: {
        type: String,
        default: null
    },
    // Response time in ms
    responseTime: {
        type: Number,
        default: null
    },
    // Timestamp
    executedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Compound indexes for efficient queries
commandLogSchema.index({ guildId: 1, executedAt: -1 });
commandLogSchema.index({ userId: 1, executedAt: -1 });
commandLogSchema.index({ command: 1, executedAt: -1 });

module.exports = mongoose.model('CommandLog', commandLogSchema);
