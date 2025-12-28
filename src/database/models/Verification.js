const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
    discordId: { type: String, required: true, index: true },
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date },
}, {
    collection: 'verifications',
    versionKey: false
});

verificationSchema.index({ discordId: 1 });

module.exports = mongoose.model('Verification', verificationSchema);
