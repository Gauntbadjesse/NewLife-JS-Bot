/**
 * AutomodConfig Model
 * Stores automod configuration for the server
 */
const mongoose = require('mongoose');

const automodConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    
    // Word Filter
    wordFilterEnabled: { type: Boolean, default: false },
    bannedWords: [{ type: String }],
    wordFilterAction: { type: String, enum: ['warn', 'delete', 'mute', 'kick', 'ban'], default: 'delete' },
    wordFilterMuteDuration: { type: Number, default: 300000 }, // 5 min default
    
    // Spam Detection
    spamDetectionEnabled: { type: Boolean, default: false },
    spamThreshold: { type: Number, default: 5 }, // messages
    spamTimeWindow: { type: Number, default: 5000 }, // 5 seconds
    spamAction: { type: String, enum: ['warn', 'delete', 'mute', 'kick'], default: 'mute' },
    spamMuteDuration: { type: Number, default: 600000 }, // 10 min
    
    // Link Filter
    linkFilterEnabled: { type: Boolean, default: false },
    allowedDomains: [{ type: String }],
    linkFilterAction: { type: String, enum: ['warn', 'delete', 'mute'], default: 'delete' },
    
    // Caps Filter
    capsFilterEnabled: { type: Boolean, default: false },
    capsThreshold: { type: Number, default: 70 }, // percentage
    capsMinLength: { type: Number, default: 10 }, // min chars to check
    capsAction: { type: String, enum: ['warn', 'delete'], default: 'delete' },
    
    // Mention Spam
    mentionSpamEnabled: { type: Boolean, default: false },
    mentionThreshold: { type: Number, default: 5 },
    mentionAction: { type: String, enum: ['warn', 'delete', 'mute', 'kick'], default: 'mute' },
    
    // Raid Protection
    raidProtectionEnabled: { type: Boolean, default: false },
    raidJoinThreshold: { type: Number, default: 10 }, // joins per minute
    raidAction: { type: String, enum: ['lockdown', 'kick_new', 'verification'], default: 'lockdown' },
    
    // Exempt roles and channels
    exemptRoles: [{ type: String }],
    exemptChannels: [{ type: String }],
    
    // Log channel
    logChannelId: { type: String },
    
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: String }
});

module.exports = mongoose.model('AutomodConfig', automodConfigSchema);
