/**
 * Linked Account Model
 */
const mongoose = require('mongoose');

const linkedSchema = new mongoose.Schema({
    discordId: { type: String, required: true, index: true },
    minecraftUsername: { type: String, required: true },
    uuid: { type: String, required: true, index: true },
    platform: { type: String, enum: ['java','bedrock'], required: true },
    linkedAt: { type: Date, default: Date.now }
}, {
    collection: 'linked_accounts',
    versionKey: false
});

linkedSchema.index({ discordId: 1 });
linkedSchema.index({ uuid: 1 });

module.exports = mongoose.model('LinkedAccount', linkedSchema);
