/**
 * Whitelist Routes
 * Handles whitelist sync between Discord and Minecraft
 */

const express = require('express');
const router = express.Router();
const Whitelist = require('../../models/Whitelist');

/**
 * GET /whitelist
 * Get all active whitelist entries
 */
router.get('/', async (req, res) => {
    try {
        const entries = await Whitelist.find({ active: true })
            .select('minecraftUsername minecraftUuid')
            .lean();

        // Format for Minecraft whitelist.json compatibility
        const whitelist = entries.map(e => ({
            uuid: e.minecraftUuid || '',
            name: e.minecraftUsername
        }));

        res.json(whitelist);
    } catch (error) {
        console.error('[Whitelist] Error fetching:', error.message);
        res.status(500).json({ error: 'Failed to fetch whitelist' });
    }
});

/**
 * GET /whitelist/full
 * Get all whitelist entries with full details
 */
router.get('/full', async (req, res) => {
    try {
        const entries = await Whitelist.find({ active: true }).lean();
        res.json({ entries });
    } catch (error) {
        console.error('[Whitelist] Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch whitelist' });
    }
});

/**
 * POST /whitelist/sync
 * Sync whitelist from Minecraft server
 * Expects array of { uuid, name } objects
 */
router.post('/sync', async (req, res) => {
    try {
        const { players, server } = req.body;

        if (!Array.isArray(players)) {
            return res.status(400).json({ error: 'Players must be an array' });
        }

        let added = 0;
        let updated = 0;

        for (const player of players) {
            const existing = await Whitelist.findOne({ 
                minecraftUsername: player.name.toLowerCase() 
            });

            if (existing) {
                // Update UUID if we have it now
                if (player.uuid && !existing.minecraftUuid) {
                    existing.minecraftUuid = player.uuid;
                    existing.lastSynced = new Date();
                    await existing.save();
                    updated++;
                }
            } else {
                // Add new entry from Minecraft
                await Whitelist.create({
                    minecraftUsername: player.name.toLowerCase(),
                    minecraftUuid: player.uuid || null,
                    addedBy: 'minecraft-sync',
                    lastSynced: new Date(),
                    notes: `Synced from ${server || 'minecraft'}`
                });
                added++;
            }
        }

        // Mark missing players as inactive (optional - commented out for safety)
        // const syncedNames = players.map(p => p.name.toLowerCase());
        // await Whitelist.updateMany(
        //     { minecraftUsername: { $nin: syncedNames }, active: true },
        //     { active: false }
        // );

        res.json({ success: true, added, updated });
    } catch (error) {
        console.error('[Whitelist] Sync error:', error.message);
        res.status(500).json({ error: 'Failed to sync whitelist' });
    }
});

/**
 * POST /whitelist/add
 * Add player to whitelist (from Minecraft plugin)
 */
router.post('/add', async (req, res) => {
    try {
        const { username, uuid, addedBy, server } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const existing = await Whitelist.findOne({ 
            minecraftUsername: username.toLowerCase() 
        });

        if (existing) {
            if (existing.active) {
                return res.json({ success: true, message: 'Already whitelisted', existed: true });
            }
            // Reactivate
            existing.active = true;
            existing.minecraftUuid = uuid || existing.minecraftUuid;
            existing.lastSynced = new Date();
            await existing.save();
            return res.json({ success: true, message: 'Reactivated', reactivated: true });
        }

        await Whitelist.create({
            minecraftUsername: username.toLowerCase(),
            minecraftUuid: uuid || null,
            addedBy: addedBy || 'minecraft',
            lastSynced: new Date(),
            notes: `Added from ${server || 'minecraft'}`
        });

        res.json({ success: true, message: 'Added to whitelist' });
    } catch (error) {
        console.error('[Whitelist] Add error:', error.message);
        res.status(500).json({ error: 'Failed to add to whitelist' });
    }
});

/**
 * POST /whitelist/remove
 * Remove player from whitelist (from Minecraft plugin)
 */
router.post('/remove', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const result = await Whitelist.findOneAndUpdate(
            { minecraftUsername: username.toLowerCase() },
            { active: false },
            { new: true }
        );

        if (!result) {
            return res.status(404).json({ error: 'Player not found in whitelist' });
        }

        res.json({ success: true, message: 'Removed from whitelist' });
    } catch (error) {
        console.error('[Whitelist] Remove error:', error.message);
        res.status(500).json({ error: 'Failed to remove from whitelist' });
    }
});

/**
 * GET /whitelist/check/:username
 * Check if a player is whitelisted
 */
router.get('/check/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        const entry = await Whitelist.findOne({ 
            minecraftUsername: username.toLowerCase(),
            active: true
        }).lean();

        res.json({
            whitelisted: !!entry,
            entry: entry || null
        });
    } catch (error) {
        console.error('[Whitelist] Check error:', error.message);
        res.status(500).json({ error: 'Failed to check whitelist' });
    }
});

/**
 * GET /whitelist/pending
 * Get pending whitelist commands for Minecraft to execute
 * This allows the bot to queue whitelist commands that Minecraft picks up
 */
router.get('/pending', async (req, res) => {
    try {
        // Get entries that need to be synced to Minecraft
        const pending = await Whitelist.find({
            active: true,
            lastSynced: null
        }).select('minecraftUsername').lean();

        const commands = pending.map(p => ({
            action: 'add',
            username: p.minecraftUsername
        }));

        res.json({ commands });
    } catch (error) {
        console.error('[Whitelist] Pending error:', error.message);
        res.status(500).json({ error: 'Failed to get pending commands' });
    }
});

/**
 * POST /whitelist/confirm
 * Confirm that whitelist commands were executed
 */
router.post('/confirm', async (req, res) => {
    try {
        const { usernames } = req.body;

        if (!Array.isArray(usernames)) {
            return res.status(400).json({ error: 'Usernames must be an array' });
        }

        await Whitelist.updateMany(
            { minecraftUsername: { $in: usernames.map(u => u.toLowerCase()) } },
            { lastSynced: new Date() }
        );

        res.json({ success: true, confirmed: usernames.length });
    } catch (error) {
        console.error('[Whitelist] Confirm error:', error.message);
        res.status(500).json({ error: 'Failed to confirm' });
    }
});

module.exports = router;
