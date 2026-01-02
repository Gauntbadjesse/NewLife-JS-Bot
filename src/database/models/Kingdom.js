/**
 * Kingdom Model
 * Uses existing MongoDB collection 'kingdoms' from discord_bot database
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

// Create a separate connection to the discord_bot database
let kingdomModel = null;

async function getKingdomModel() {
    if (kingdomModel) return kingdomModel;
    
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.DISCORD_BOT_DATABASE || 'discord_bot';
    
    const conn = await mongoose.createConnection(uri, { dbName }).asPromise();
    kingdomModel = conn.model('Kingdom', kingdomSchema);
    
    return kingdomModel;
}

module.exports = { getKingdomModel };
