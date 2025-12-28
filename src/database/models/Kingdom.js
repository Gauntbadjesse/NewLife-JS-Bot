const mongoose = require('mongoose');

const kingdomSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true, lowercase: true, trim: true },
    leaderRoleId: { type: String, required: true },
    memberRoleId: { type: String, required: true },
    color: { type: Number, default: null },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});

kingdomSchema.index({ guildId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Kingdom', kingdomSchema);
