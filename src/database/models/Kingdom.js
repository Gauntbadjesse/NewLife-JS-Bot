/**
 * Kingdom Model
 * Stores kingdom data in its own 'kingdoms' database
 */
const mongoose = require('mongoose');

// Member schema to track kingdom membership persistently
const kingdomMemberSchema = new mongoose.Schema({
    odId: { type: String, required: true },
    discordTag: { type: String },
    isLeader: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
    addedBy: { type: String }
}, { _id: false });

const kingdomSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, required: true, lowercase: true, trim: true },
    memberRoleId: { type: String, required: true },
    leaderRoleId: { type: String, required: true },
    leaderPing: { type: Boolean, default: false },
    color: { type: String, default: '#3b82f6' },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now },
    // Persistent member storage
    members: [kingdomMemberSchema]
}, {
    collection: 'kingdoms',
    versionKey: false
});

// Unique constraint on guildId + nameLower
kingdomSchema.index({ guildId: 1, nameLower: 1 }, { unique: true });

// Helper method to add a member
kingdomSchema.methods.addMember = function(discordId, discordTag, isLeader = false, addedBy = null) {
    // Check if already exists
    const existing = this.members.find(m => m.discordId === discordId);
    if (existing) {
        existing.isLeader = isLeader;
        existing.discordTag = discordTag;
        return existing;
    }
    
    const member = {
        discordId,
        discordTag,
        isLeader,
        joinedAt: new Date(),
        addedBy
    };
    this.members.push(member);
    return member;
};

// Helper method to remove a member
kingdomSchema.methods.removeMember = function(discordId) {
    const index = this.members.findIndex(m => m.discordId === discordId);
    if (index > -1) {
        this.members.splice(index, 1);
        return true;
    }
    return false;
};

// Helper method to get member
kingdomSchema.methods.getMember = function(discordId) {
    return this.members.find(m => m.discordId === discordId);
};

// Helper method to set leader status
kingdomSchema.methods.setLeader = function(discordId, isLeader) {
    const member = this.members.find(m => m.discordId === discordId);
    if (member) {
        member.isLeader = isLeader;
        return true;
    }
    return false;
};

// Helper method to get all leaders
kingdomSchema.methods.getLeaders = function() {
    return this.members.filter(m => m.isLeader);
};

// Helper method to get non-leader members
kingdomSchema.methods.getMembers = function() {
    return this.members.filter(m => !m.isLeader);
};

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
