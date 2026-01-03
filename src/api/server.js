/**
 * API Server
 * Provides REST endpoints for Velocity proxy plugin communication
 * Used for account linking verification, ban checks, and player authentication
 */

const express = require('express');
const LinkedAccount = require('../database/models/LinkedAccount');
const ServerBan = require('../database/models/ServerBan');

const app = express();
app.use(express.json());

// API Key middleware for authentication
const API_KEY = process.env.LINK_API_KEY || 'your-secure-api-key-here';

// Log the API key on startup (first 8 chars only for security)
console.log(`[API] Using API key starting with: ${API_KEY.substring(0, 8)}...`);

function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    const apiKey = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : req.headers['x-api-key'];
    
    if (!apiKey || apiKey !== API_KEY) {
        console.log(`[API] Auth failed - received key starting with: ${apiKey ? apiKey.substring(0, 8) + '...' : 'none'}`);
        return res.status(401).json({ 
            success: false, 
            error: 'Unauthorized' 
        });
    }
    next();
}

// Apply authentication to all routes
app.use(authenticate);

/**
 * GET /api/linked/:uuid
 * Check if a Minecraft UUID is linked to a Discord account
 * Used by Velocity plugin on player join
 */
app.get('/api/linked/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        
        if (!uuid) {
            return res.status(400).json({ 
                success: false, 
                error: 'UUID required' 
            });
        }
        
        // Normalize UUID (remove dashes if present)
        const normalizedUuid = uuid.replace(/-/g, '');
        
        // Check for linked account
        const linked = await LinkedAccount.findOne({
            $or: [
                { uuid: normalizedUuid },
                { uuid: uuid },
                { uuid: { $regex: new RegExp(`^${normalizedUuid}$`, 'i') } }
            ]
        });
        
        if (linked) {
            return res.json({
                success: true,
                linked: true,
                data: {
                    discordId: linked.discordId,
                    minecraftUsername: linked.minecraftUsername,
                    uuid: linked.uuid,
                    platform: linked.platform,
                    linkedAt: linked.linkedAt,
                    verified: linked.verified || false
                }
            });
        }
        
        return res.json({
            success: true,
            linked: false
        });
        
    } catch (error) {
        console.error('API Error (GET /api/linked/:uuid):', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

/**
 * GET /api/linked/discord/:discordId
 * Get all linked accounts for a Discord user
 */
app.get('/api/linked/discord/:discordId', async (req, res) => {
    try {
        const { discordId } = req.params;
        
        if (!discordId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Discord ID required' 
            });
        }
        
        const accounts = await LinkedAccount.find({ discordId: String(discordId) });
        
        return res.json({
            success: true,
            count: accounts.length,
            accounts: accounts.map(a => ({
                minecraftUsername: a.minecraftUsername,
                uuid: a.uuid,
                platform: a.platform,
                linkedAt: a.linkedAt,
                verified: a.verified || false,
                primary: a.primary || false
            }))
        });
        
    } catch (error) {
        console.error('API Error (GET /api/linked/discord/:discordId):', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

/**
 * POST /api/link
 * Create a new account link (used by the /linkaccount command verification)
 */
app.post('/api/link', async (req, res) => {
    try {
        const { discordId, minecraftUsername, uuid, platform } = req.body;
        
        if (!discordId || !minecraftUsername || !uuid || !platform) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: discordId, minecraftUsername, uuid, platform' 
            });
        }
        
        // Check if already linked
        const existingByUuid = await LinkedAccount.findOne({ uuid });
        if (existingByUuid) {
            return res.status(409).json({
                success: false,
                error: 'This Minecraft account is already linked to a Discord account',
                linkedTo: existingByUuid.discordId
            });
        }
        
        // Count existing links for this Discord user
        const count = await LinkedAccount.countDocuments({ discordId: String(discordId) });
        
        // Create new link
        const newLink = new LinkedAccount({
            discordId: String(discordId),
            minecraftUsername,
            uuid,
            platform,
            linkedAt: new Date(),
            verified: false,
            primary: count === 0 // First account is primary
        });
        
        await newLink.save();
        
        return res.json({
            success: true,
            message: 'Account linked successfully',
            data: {
                discordId: newLink.discordId,
                minecraftUsername: newLink.minecraftUsername,
                uuid: newLink.uuid,
                platform: newLink.platform,
                primary: newLink.primary
            }
        });
        
    } catch (error) {
        console.error('API Error (POST /api/link):', error);
        
        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                error: 'This account combination already exists'
            });
        }
        
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

/**
 * DELETE /api/link/:uuid
 * Remove an account link (staff only via bot)
 */
app.delete('/api/link/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        
        if (!uuid) {
            return res.status(400).json({ 
                success: false, 
                error: 'UUID required' 
            });
        }
        
        const result = await LinkedAccount.findOneAndDelete({ uuid });
        
        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Link not found'
            });
        }
        
        return res.json({
            success: true,
            message: 'Account unlinked successfully',
            data: {
                discordId: result.discordId,
                minecraftUsername: result.minecraftUsername
            }
        });
        
    } catch (error) {
        console.error('API Error (DELETE /api/link/:uuid):', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'NewLife Link API'
    });
});

// ==================== BAN API ENDPOINTS ====================

/**
 * GET /api/ban/:uuid
 * Check if a player is banned by UUID
 * Returns ban details if banned, or { banned: false } if not
 */
app.get('/api/ban/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        
        if (!uuid) {
            return res.status(400).json({ 
                success: false, 
                error: 'UUID required' 
            });
        }
        
        const normalizedUuid = uuid.replace(/-/g, '');
        
        // Find active ban for this UUID
        const ban = await ServerBan.findActiveBan(normalizedUuid);
        
        if (ban) {
            return res.json({
                success: true,
                banned: true,
                data: {
                    caseNumber: ban.caseNumber,
                    reason: ban.reason,
                    duration: ban.duration,
                    isPermanent: ban.isPermanent,
                    bannedAt: ban.bannedAt,
                    expiresAt: ban.expiresAt,
                    staffTag: ban.staffTag,
                    remaining: ban.getRemainingTime()
                }
            });
        }
        
        return res.json({
            success: true,
            banned: false
        });
        
    } catch (error) {
        console.error('API Error (GET /api/ban/:uuid):', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

/**
 * GET /api/bans/active
 * Get all active bans (for sync/admin purposes)
 */
app.get('/api/bans/active', async (req, res) => {
    try {
        const bans = await ServerBan.find({ active: true }).sort({ bannedAt: -1 }).limit(100);
        
        return res.json({
            success: true,
            count: bans.length,
            bans: bans.map(b => ({
                caseNumber: b.caseNumber,
                primaryUsername: b.primaryUsername,
                primaryUuid: b.primaryUuid,
                bannedUuids: b.bannedUuids,
                reason: b.reason,
                duration: b.duration,
                isPermanent: b.isPermanent,
                bannedAt: b.bannedAt,
                expiresAt: b.expiresAt,
                staffTag: b.staffTag
            }))
        });
        
    } catch (error) {
        console.error('API Error (GET /api/bans/active):', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

/**
 * Start the API server
 */
function startApiServer(port = null) {
    const serverPort = port || process.env.LINK_API_PORT || 3001;
    
    return new Promise((resolve, reject) => {
        const server = app.listen(serverPort, '0.0.0.0', () => {
            console.log(` Link API server running on port ${serverPort}`);
            resolve(server);
        });
        
        server.on('error', (err) => {
            console.error('Failed to start API server:', err);
            reject(err);
        });
    });
}

module.exports = {
    app,
    startApiServer
};
