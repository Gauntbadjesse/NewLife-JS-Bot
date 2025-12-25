/**
 * Audit Log Model
 * Tracks all staff actions for accountability
 */

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    // Action info
    action: {
        type: String,
        required: true,
        enum: [
            // Moderation actions
            'warn', 'unwarn', 'pardon_warning',
            'ban', 'unban', 'tempban', 'pardon_ban',
            'kick', 'mute', 'unmute',
            // Whitelist
            'whitelist_add', 'whitelist_remove',
            // Admin actions
            'appeal_approve', 'appeal_deny', 'appeal_review',
            'application_approve', 'application_deny',
            'ticket_close', 'ticket_create',
            'note_add', 'note_delete',
            // Config actions
            'automod_config', 'reaction_role_config', 'embed_create',
            // Bulk actions
            'bulk_warn', 'bulk_kick', 'bulk_ban', 'bulk_unban',
            // Other
            'rcon_command', 'other'
        ]
    },
    category: {
        type: String,
        enum: ['moderation', 'whitelist', 'appeals', 'applications', 'tickets', 'notes', 'config', 'bulk', 'rcon', 'other'],
        default: 'other'
    },
    
    // Who performed the action
    staffId: {
        type: String,
        required: true
    },
    staffName: {
        type: String,
        required: true
    },
    
    // Target of the action
    targetType: {
        type: String,
        enum: ['player', 'user', 'channel', 'role', 'message', 'config', 'multiple', 'none'],
        default: 'none'
    },
    targetId: String,
    targetName: String,
    
    // Details
    reason: String,
    details: mongoose.Schema.Types.Mixed, // Additional action-specific data
    
    // References
    caseNumber: Number,
    relatedCases: [Number],
    
    // Guild info
    guildId: String,
    channelId: String,
    
    // Timestamp
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for efficient querying
auditLogSchema.index({ guildId: 1, createdAt: -1 });
auditLogSchema.index({ staffId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetId: 1 });
auditLogSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
