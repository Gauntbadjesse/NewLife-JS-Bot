/**
 * Evidence Model
 * Stores evidence (text, images) linked to moderation cases
 */
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const evidenceItemSchema = new mongoose.Schema({
    type: { type: String, enum: ['text', 'image'], required: true },
    content: { type: String, required: true }, // Text content or image URL/base64
    filename: { type: String, default: null }, // Original filename for images
    mimeType: { type: String, default: null }, // MIME type for images
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: String, required: true }, // Discord ID of staff
    addedByTag: { type: String, required: true } // Discord tag of staff
}, { _id: true });

const evidenceSchema = new mongoose.Schema({
    _id: { type: String, default: () => randomUUID() },
    caseNumber: { type: Number, required: true, index: true },
    caseType: { type: String, enum: ['ban', 'kick', 'warning', 'mute'], required: true },
    targetDiscordId: { type: String, required: true, index: true },
    targetTag: { type: String, default: null },
    items: [evidenceItemSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    collection: 'evidence',
    versionKey: false
});

// Compound index
evidenceSchema.index({ caseNumber: 1, caseType: 1 }, { unique: true });

// Update timestamp on save
evidenceSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

/**
 * Get evidence for a specific case
 */
evidenceSchema.statics.getForCase = async function(caseNumber, caseType) {
    const evidence = await this.findOne({ caseNumber, caseType });
    return evidence ? [evidence] : [];
};

/**
 * Get all evidence for a user
 */
evidenceSchema.statics.getForUser = async function(discordId) {
    return this.find({ targetDiscordId: discordId }).sort({ createdAt: -1 });
};

/**
 * Add evidence item to a case
 */
evidenceSchema.statics.addEvidence = async function(caseNumber, caseType, targetDiscordId, type, content, addedBy, addedByTag, filename = null, mimeType = null) {
    let evidence = await this.findOne({ caseNumber, caseType });
    
    const item = {
        type,
        content,
        addedBy,
        addedByTag,
        filename,
        mimeType,
        addedAt: new Date()
    };
    
    if (!evidence) {
        evidence = new this({
            caseNumber,
            caseType,
            targetDiscordId: targetDiscordId || 'unknown',
            items: [item]
        });
    } else {
        evidence.items.push(item);
    }
    
    return evidence.save();
};

module.exports = mongoose.model('Evidence', evidenceSchema);
