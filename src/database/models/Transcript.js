/**
 * Transcript Model
 * Stores ticket transcripts with full message data for Discord-style rendering
 */
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    id: String,
    authorId: String,
    authorTag: String,
    authorAvatar: String,
    authorBot: { type: Boolean, default: false },
    content: String,
    timestamp: Date,
    attachments: [{
        url: String,
        name: String,
        contentType: String,
        size: Number
    }],
    embeds: [{
        title: String,
        description: String,
        color: Number,
        fields: [{
            name: String,
            value: String,
            inline: Boolean
        }],
        footer: String,
        timestamp: Date,
        thumbnail: String,
        image: String,
        author: {
            name: String,
            iconUrl: String
        }
    }],
    reactions: [{
        emoji: String,
        count: Number
    }],
    replyTo: String // Message ID being replied to
}, { _id: false });

const transcriptSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true }, // Channel ID
    ticketName: String,
    ticketType: String, // general, report, management, apply
    guildId: String,
    
    // Owner info
    ownerId: { type: String, required: true, index: true },
    ownerTag: String,
    ownerAvatar: String,
    
    // Closer info
    closedById: String,
    closedByTag: String,
    closeReason: String,
    
    // Timestamps
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: Date.now },
    
    // Messages
    messages: [messageSchema],
    messageCount: { type: Number, default: 0 },
    
    // Participants (staff who participated)
    participants: [{
        id: String,
        tag: String,
        avatar: String,
        messageCount: Number
    }]
}, {
    collection: 'transcripts',
    versionKey: false
});

// Index for staff lookups
transcriptSchema.index({ 'participants.id': 1 });
transcriptSchema.index({ closedAt: -1 });

module.exports = mongoose.model('Transcript', transcriptSchema);
