/**
 * Suggestion Model
 * Stores user suggestions with voting data
 */

const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    messageId: { type: String, required: true, index: true },
    threadId: { type: String },
    userId: { type: String, required: true, index: true },
    suggestion: { type: String, required: true },
    upvotes: [{ type: String }], // Array of user IDs who upvoted
    downvotes: [{ type: String }], // Array of user IDs who downvoted
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'denied', 'implemented'],
        default: 'pending',
        index: true
    },
    staffNotes: { type: String },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Compound indexes for common queries
suggestionSchema.index({ guildId: 1, status: 1 });
suggestionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Suggestion || mongoose.model('Suggestion', suggestionSchema);
