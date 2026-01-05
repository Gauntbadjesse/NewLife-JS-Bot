/**
 * Migration Script: Normalize Application Sources
 * 
 * This script updates existing applications to have normalized
 * source categories for analytics purposes.
 * 
 * Run with: node scripts/migrateApplicationSources.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Source normalization function (duplicated here for standalone use)
function normalizeSource(input) {
    if (!input) return 'other';
    
    const lower = input.toLowerCase().trim();
    
    if (lower.includes('youtube') || lower.includes('yt') || lower.includes('video')) return 'youtube';
    if (lower.includes('tiktok') || lower.includes('tik tok') || lower.includes('tt')) return 'tiktok';
    if (lower.includes('reddit') || lower.includes('r/')) return 'reddit';
    if (lower.includes('twitter') || lower === 'x' || lower.includes('tweet')) return 'twitter';
    if (lower.includes('discord') || lower.includes('disboard')) return 'discord';
    if (lower.includes('friend') || lower.includes('word of mouth') || lower.includes('someone told') || 
        lower.includes('brother') || lower.includes('sister') || lower.includes('family') ||
        lower.includes('referred') || lower.includes('recommendation')) return 'friend';
    if (lower.includes('google') || lower.includes('search') || lower.includes('bing')) return 'search';
    if (lower.includes('server list') || lower.includes('minecraft-server') || lower.includes('topg') ||
        lower.includes('planet minecraft')) return 'minecraft_server_list';
    if (lower.includes('twitch') || lower.includes('stream')) return 'twitch';
    
    return 'other';
}

async function migrate() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not set');
        process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected.');

    const db = mongoose.connection.db;

    // Migrate applications collection
    console.log('\nMigrating applications collection...');
    const applications = db.collection('applications');
    const appCursor = applications.find({ whereFoundCategory: { $exists: false } });
    
    let appCount = 0;
    while (await appCursor.hasNext()) {
        const doc = await appCursor.next();
        const rawSource = doc.whereFound || doc.whereFoundRaw;
        const category = normalizeSource(rawSource);
        
        await applications.updateOne(
            { _id: doc._id },
            { 
                $set: { 
                    whereFoundRaw: rawSource,
                    whereFoundCategory: category 
                }
            }
        );
        appCount++;
    }
    console.log(`Updated ${appCount} applications.`);

    // Migrate whitelist_applications collection
    console.log('\nMigrating whitelist_applications collection...');
    const whitelistApps = db.collection('whitelist_applications');
    const wlCursor = whitelistApps.find({ whereFoundCategory: { $exists: false } });
    
    let wlCount = 0;
    while (await wlCursor.hasNext()) {
        const doc = await wlCursor.next();
        const rawSource = doc.whereFound || doc.whereFoundRaw;
        const category = normalizeSource(rawSource);
        
        await whitelistApps.updateOne(
            { _id: doc._id },
            { 
                $set: { 
                    whereFoundRaw: rawSource,
                    whereFoundCategory: category 
                }
            }
        );
        wlCount++;
    }
    console.log(`Updated ${wlCount} whitelist applications.`);

    // Print summary
    console.log('\n--- Migration Summary ---');
    console.log(`Applications migrated: ${appCount}`);
    console.log(`Whitelist applications migrated: ${wlCount}`);
    console.log('Migration complete!');

    await mongoose.disconnect();
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
