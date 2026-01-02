/**
 * Kingdom Model
 * Stores kingdom data in its own 'kingdoms' database
 */
const mongoose = require('mongoose');

const kingdomSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, required: true, lowercase: true, trim: true },
    memberRoleId: { type: String, required: true },
    leaderRoleId: { type: String, required: true },
    leaderPing: { type: Boolean, default: false },
    color: { type: String, default: '#3b82f6' },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now }
}, {
    collection: 'kingdoms',
    versionKey: false
});

// Unique constraint on guildId + nameLower
kingdomSchema.index({ guildId: 1, nameLower: 1 }, { unique: true });

// Create a separate connection to the kingdoms database
let kingdomConnection = null;
let kingdomModel = null;

async function getKingdomModel() {
    if (kingdomModel) return kingdomModel;
    
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not configured');
    
    kingdomConnection = await mongoose.createConnection(uri, { dbName: 'kingdoms' }).asPromise();
    kingdomModel = kingdomConnection.model('Kingdom', kingdomSchema);
    
    console.log('[Kingdom] Connected to kingdoms database');
    return kingdomModel;
}

module.exports = { getKingdomModel };
