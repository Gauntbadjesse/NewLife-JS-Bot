/**
 * CustomEmbed Model
 * Stores custom embeds created via admin UI
 */
const mongoose = require('mongoose');

const customEmbedSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    title: { type: String },
    description: { type: String },
    color: { type: String, default: '#10b981' },
    thumbnail: { type: String },
    image: { type: String },
    footer: { type: String },
    fields: [{
        name: { type: String },
        value: { type: String },
        inline: { type: Boolean, default: false }
    }],
    buttons: [{
        label: { type: String },
        style: { type: String, enum: ['primary', 'secondary', 'success', 'danger', 'link'], default: 'primary' },
        customId: { type: String }, // For non-link buttons
        url: { type: String }, // For link buttons
        emoji: { type: String },
        action: { type: String } // Special actions like 'appeal', 'ticket', etc.
    }],
    channelId: { type: String }, // Where it was sent
    messageId: { type: String }, // The message ID if sent
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String },
    updatedAt: { type: Date },
    updatedBy: { type: String }
});

module.exports = mongoose.model('CustomEmbed', customEmbedSchema);
