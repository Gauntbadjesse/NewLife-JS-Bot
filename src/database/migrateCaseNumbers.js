/*
 Migration script to backfill sequential case numbers for existing Warnings and Bans.
 Usage (from repo root):
   node src/database/migrateCaseNumbers.js

 It will:
  - connect to MongoDB using MONGODB_URI and MONGODB_DATABASE env vars
  - determine the current maximum `caseNumber` across warnings and bans
  - set the counter to that max
  - assign sequential case numbers to any records missing them (old records)
*/

// Load environment variables from .env when run directly
require('dotenv').config();
const { connectDatabase, disconnectDatabase } = require('./connection');
const Warning = require('./models/Warning');
const Ban = require('./models/Ban');
const Counter = require('./models/Counter');
const { getNextCaseNumber } = require('./caseCounter');

async function setCounterTo(max) {
  await Counter.findOneAndUpdate(
    { _id: 'caseNumber' },
    { $set: { seq: max } },
    { upsert: true }
  ).exec();
}

async function run() {
  try {
    await connectDatabase();
    console.log('\nStarting case number migration...');

    // determine current max caseNumber
    const maxWarn = await Warning.findOne({ caseNumber: { $exists: true } }).sort({ caseNumber: -1 }).select('caseNumber').lean();
    const maxBan = await Ban.findOne({ caseNumber: { $exists: true } }).sort({ caseNumber: -1 }).select('caseNumber').lean();

    const maxA = (maxWarn && maxWarn.caseNumber) ? maxWarn.caseNumber : 0;
    const maxB = (maxBan && maxBan.caseNumber) ? maxBan.caseNumber : 0;
    const currentMax = Math.max(maxA, maxB, 0);

    console.log(`Current max caseNumber found: ${currentMax}`);
    await setCounterTo(currentMax);

    // Backfill warnings
    const missingWarnings = await Warning.find({ $or: [{ caseNumber: { $exists: false } }, { caseNumber: null }] }).sort({ createdAt: 1 }).lean();
    console.log(`Warnings missing caseNumber: ${missingWarnings.length}`);
    let wCount = 0;
    for (const w of missingWarnings) {
      const next = await getNextCaseNumber();
      await Warning.updateOne({ _id: w._id }, { $set: { caseNumber: next } }).exec();
      wCount++;
      if (wCount % 50 === 0) console.log(`Assigned ${wCount} warning case numbers...`);
    }

    // Backfill bans
    const missingBans = await Ban.find({ $or: [{ caseNumber: { $exists: false } }, { caseNumber: null }] }).sort({ createdAt: 1 }).lean();
    console.log(`Bans missing caseNumber: ${missingBans.length}`);
    let bCount = 0;
    for (const b of missingBans) {
      const next = await getNextCaseNumber();
      await Ban.updateOne({ _id: b._id }, { $set: { caseNumber: next } }).exec();
      bCount++;
      if (bCount % 50 === 0) console.log(`Assigned ${bCount} ban case numbers...`);
    }

    console.log(`\nMigration complete. Warnings updated: ${wCount}, Bans updated: ${bCount}`);
    await disconnectDatabase();
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    try { await disconnectDatabase(); } catch (_) {}
    process.exit(1);
  }
}

if (require.main === module) run();
