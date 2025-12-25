/**
 * Console Log Model
 * Stores Minecraft server console output
 */

const mongoose = require('mongoose');

const consoleLogSchema = new mongoose.Schema({
    // Log level (INFO, WARN, ERROR, etc.)
    level: {
        type: String,
        default: 'INFO',
        index: true
    },
    // Log message
    message: {
        type: String,
        required: true
    },
    // Source (plugin name, server, etc.)
    source: {
        type: String,
        default: 'Server'
    },
    // Server identifier (for multi-server setups)
    server: {
        type: String,
        default: 'main',
        index: true
    },
    // Timestamp from Minecraft
    minecraftTimestamp: {
        type: Date,
        default: null
    },
    // When received by API
    receivedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true,
    // Auto-expire old logs after 7 days
    expireAfterSeconds: 604800
});

// Index for efficient queries
consoleLogSchema.index({ server: 1, receivedAt: -1 });
consoleLogSchema.index({ level: 1, receivedAt: -1 });

module.exports = mongoose.model('ConsoleLog', consoleLogSchema);
