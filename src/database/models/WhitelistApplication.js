/**
 * Whitelist Application Model
 * Stores whitelist applications submitted through the /apanel
 */
const mongoose = require('mongoose');

const whitelistApplicationSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    discordId: { type: String, required: true, index: true },
    discordTag: { type: String, required: true },
    // Linked accounts at time of application
    linkedAccounts: [{
        minecraftUsername: String,
        uuid: String,
        platform: { type: String, enum: ['java', 'bedrock'] }
    }],
    // Application questions
    age: { type: Number, required: true },
    whereFound: { type: String, default: null },
    whyJoin: { type: String, required: true },
    experience: { type: String, default: null },
    playstyle: { type: String, default: null },
    // Status tracking
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'denied', 'waitlist'], 
        default: 'pending',
        index: true
    },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    // Thread ID for application discussion
    threadId: { type: String, default: null }
}, {
    collection: 'whitelist_applications',
    versionKey: false
});

whitelistApplicationSchema.index({ createdAt: -1 });
whitelistApplicationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('WhitelistApplication', whitelistApplicationSchema);
