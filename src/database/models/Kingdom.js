/**
 * Kingdom Model
 * Uses existing MongoDB collection 'kingdoms' with snake_case fields
 */
const mongoose = require('mongoose');

const kingdomSchema = new mongoose.Schema({
    guild_id: { type: String, required: true, index: true },
    name: { type: String, required: true, lowercase: true, trim: true },
    leader_role_id: { type: String, required: true },
    member_role_id: { type: String, required: true },
    created_by: { type: String },
    created_at: { type: Date, default: Date.now }
}, {
    collection: 'kingdoms',
    versionKey: false
});

kingdomSchema.index({ guild_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Kingdom', kingdomSchema);
