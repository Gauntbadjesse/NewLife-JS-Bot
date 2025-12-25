/**
 * Application Model
 */
const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    discordId: { type: String, required: true, index: true },
    playerName: { type: String, required: true },
    platform: { type: String, enum: ['java','bedrock'], required: true },
    age: { type: Number, required: true },
    whereFound: { type: String, default: null },
    whyJoin: { type: String, default: null },
    bring: { type: String, default: null },
    createdAt: { type: Date, required: true },
    processed: { type: Boolean, default: false }
}, {
    collection: 'applications',
    versionKey: false
});

applicationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Application', applicationSchema);
