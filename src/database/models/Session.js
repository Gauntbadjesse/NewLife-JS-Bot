/**
 * Session Model
 * Stores web portal sessions (replaces in-memory Map)
 */

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true, index: true },
    discordId: { type: String, required: true, index: true },
    username: { type: String },
    isStaff: { type: Boolean, default: false },
    roles: [{ type: String }],
    createdAt: { type: Date, default: Date.now, expires: 86400 } // 24 hour TTL
});

// TTL index - sessions expire after 24 hours
sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.models.Session || mongoose.model('Session', sessionSchema);
