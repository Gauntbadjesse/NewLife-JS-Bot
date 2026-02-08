/**
 * Database Index Setup Script
 * Run this once to ensure all necessary indexes are created
 * 
 * Usage: node src/database/setupIndexes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function setupIndexes() {
    console.log('[Indexes] Connecting to database...');
    
    await mongoose.connect(process.env.MONGODB_URI, {
        dbName: process.env.MONGODB_DATABASE || 'newlife'
    });
    
    console.log('[Indexes] Connected. Setting up indexes...\n');

    // Define all indexes for all collections
    const indexDefinitions = {
        // Moderation collections
        bans: [
            { uuid: 1 },
            { discordId: 1 },
            { caseNumber: 1 },
            { active: 1 },
            { expiresAt: 1, active: 1 }
        ],
        warnings: [
            { uuid: 1 },
            { caseNumber: 1 },
            { active: 1 },
            { createdAt: -1 }
        ],
        kicks: [
            { uuid: 1 },
            { caseNumber: 1 },
            { createdAt: -1 }
        ],
        mutes: [
            { uuid: 1 },
            { caseNumber: 1 },
            { expiresAt: 1, active: 1 }
        ],
        serverbans: [
            { uuid: 1 },
            { discordId: 1 },
            { caseNumber: 1 },
            { active: 1 },
            { expiresAt: 1, active: 1 },
            { playerName: 'text' }
        ],

        // Account linking
        linkedaccounts: [
            { discordId: 1 },
            { uuid: 1 },
            { minecraftUsername: 1 }
        ],

        // Applications and tickets
        applications: [
            { discordId: 1 },
            { status: 1 },
            { createdAt: -1 },
            { status: 1, createdAt: -1 }
        ],
        tickets: [
            { discordId: 1 },
            { channelId: 1 },
            { status: 1 },
            { createdAt: -1 }
        ],
        transcripts: [
            { ticketId: 1 },
            { discordId: 1 },
            { createdAt: -1 }
        ],

        // Staff tracking
        infractions: [
            { staffId: 1 },
            { caseNumber: 1 },
            { active: 1 },
            { createdAt: -1 }
        ],
        notes: [
            { targetId: 1 },
            { createdAt: -1 }
        ],
        guruPerformance: [
            { guruId: 1 },
            { weekStart: 1 },
            { guruId: 1, weekStart: 1 }
        ],
        whitelistStats: [
            { staffId: 1 },
            { weekStart: 1 },
            { staffId: 1, weekStart: 1 }
        ],

        // Giveaways and suggestions
        giveaways: [
            { endsAt: 1, ended: 1 },
            { guildId: 1 },
            { messageId: 1 }
        ],
        suggestions: [
            { guildId: 1, status: 1 },
            { userId: 1, createdAt: -1 },
            { messageId: 1 }
        ],

        // Temp VCs
        tempvchubs: [
            { guildId: 1, hubChannelId: 1 }
        ],
        tempchannels: [
            { channelId: 1 },
            { guildId: 1 },
            { ownerId: 1 }
        ],

        // LOA
        loas: [
            { guildId: 1, userId: 1, active: 1 },
            { endDate: 1, active: 1 }
        ],

        // Sessions (for web portal)
        sessions: [
            { token: 1 },
            { discordId: 1 },
            { createdAt: 1 } // TTL index
        ],

        // Player connections (analytics)
        playerconnections: [
            { uuid: 1 },
            { timestamp: -1 },
            { action: 1, timestamp: -1 }
        ],

        // PvP logs
        pvplogs: [
            { killerId: 1 },
            { victimId: 1 },
            { timestamp: -1 }
        ],

        // Kingdoms
        kingdoms: [
            { name: 1 },
            { leaderId: 1 }
        ],

        // Custom roles
        customroles: [
            { discordId: 1 },
            { roleId: 1 }
        ]
    };

    let totalIndexes = 0;
    let errors = 0;

    for (const [collectionName, indexes] of Object.entries(indexDefinitions)) {
        try {
            const collection = mongoose.connection.collection(collectionName);
            
            for (const indexSpec of indexes) {
                try {
                    await collection.createIndex(indexSpec);
                    totalIndexes++;
                } catch (err) {
                    // Index might already exist or be equivalent
                    if (!err.message.includes('already exists')) {
                        console.warn(`  ⚠ ${collectionName}: ${JSON.stringify(indexSpec)} - ${err.message}`);
                        errors++;
                    }
                }
            }
            console.log(`✓ ${collectionName}: ${indexes.length} indexes`);
        } catch (err) {
            console.error(`✗ ${collectionName}: ${err.message}`);
            errors++;
        }
    }

    console.log(`\n[Indexes] Complete: ${totalIndexes} indexes created/verified, ${errors} errors`);

    // List all indexes for verification
    console.log('\n[Indexes] Current indexes by collection:');
    for (const collectionName of Object.keys(indexDefinitions)) {
        try {
            const collection = mongoose.connection.collection(collectionName);
            const indexes = await collection.indexes();
            console.log(`  ${collectionName}: ${indexes.length} indexes`);
        } catch {
            // Collection might not exist yet
        }
    }

    await mongoose.disconnect();
    console.log('\n[Indexes] Done.');
}

// Run if called directly
if (require.main === module) {
    setupIndexes().catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

module.exports = { setupIndexes };
