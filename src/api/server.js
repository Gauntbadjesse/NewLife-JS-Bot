/**
 * API Server
 * Provides REST endpoints for Velocity proxy plugin communication
 * Used for account linking verification, ban checks, and player authentication
 */

const express = require('express');
const LinkedAccount = require('../database/models/LinkedAccount');
const ServerBan = require('../database/models/ServerBan');
const Kick = require('../database/models/Kick');

const app = express();
app.use(express.json());

// =====================================================
// PUBLIC WEB VIEWER ROUTES (No Authentication)
// =====================================================

const viewerStyles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: #eee;
        min-height: 100vh;
        padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { 
        text-align: center; 
        margin-bottom: 30px; 
        color: #10b981;
        font-size: 2.5em;
    }
    .nav { 
        display: flex; 
        justify-content: center; 
        gap: 20px; 
        margin-bottom: 30px;
        flex-wrap: wrap;
    }
    .nav a { 
        color: #10b981; 
        text-decoration: none; 
        padding: 12px 24px; 
        border: 2px solid #10b981;
        border-radius: 8px;
        transition: all 0.3s;
        font-weight: 600;
    }
    .nav a:hover, .nav a.active { 
        background: #10b981; 
        color: #1a1a2e; 
    }
    .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
    }
    .stat-card {
        background: rgba(255,255,255,0.05);
        padding: 20px;
        border-radius: 12px;
        text-align: center;
        border: 1px solid rgba(255,255,255,0.1);
    }
    .stat-card h3 { color: #10b981; font-size: 2em; }
    .stat-card p { color: #aaa; margin-top: 5px; }
    table { 
        width: 100%; 
        border-collapse: collapse; 
        background: rgba(255,255,255,0.05);
        border-radius: 12px;
        overflow: hidden;
    }
    th, td { 
        padding: 15px; 
        text-align: left; 
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    th { 
        background: rgba(16, 185, 129, 0.2); 
        color: #10b981;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.85em;
    }
    tr:hover { background: rgba(255,255,255,0.03); }
    .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 0.8em;
        font-weight: 600;
    }
    .badge-active { background: #ef4444; color: white; }
    .badge-expired { background: #6b7280; color: white; }
    .badge-perm { background: #8b0000; color: white; }
    .search-box {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        flex-wrap: wrap;
    }
    .search-box input {
        flex: 1;
        min-width: 200px;
        padding: 12px 16px;
        border: 2px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        background: rgba(255,255,255,0.05);
        color: #eee;
        font-size: 1em;
    }
    .search-box input:focus {
        outline: none;
        border-color: #10b981;
    }
    .search-box button {
        padding: 12px 24px;
        background: #10b981;
        color: #1a1a2e;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
    }
    .pagination {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-top: 20px;
    }
    .pagination a {
        color: #10b981;
        text-decoration: none;
        padding: 8px 16px;
        border: 1px solid #10b981;
        border-radius: 6px;
    }
    .pagination a:hover { background: #10b981; color: #1a1a2e; }
    .empty { text-align: center; padding: 40px; color: #888; }
    @media (max-width: 768px) {
        th, td { padding: 10px; font-size: 0.9em; }
        .hide-mobile { display: none; }
    }
`;

// Bans viewer page
app.get('/viewer/bans', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        
        let query = {};
        if (search) {
            query = {
                $or: [
                    { primaryUsername: { $regex: search, $options: 'i' } },
                    { reason: { $regex: search, $options: 'i' } },
                    { staffTag: { $regex: search, $options: 'i' } }
                ]
            };
        }
        
        const total = await ServerBan.countDocuments(query);
        const activeBans = await ServerBan.countDocuments({ active: true });
        const bans = await ServerBan.find(query)
            .sort({ bannedAt: -1 })
            .skip(skip)
            .limit(limit);
        
        const totalPages = Math.ceil(total / limit);
        
        let rows = '';
        for (const ban of bans) {
            const status = ban.active 
                ? '<span class="badge badge-active">Active</span>' 
                : '<span class="badge badge-expired">Expired</span>';
            const duration = ban.isPermanent 
                ? '<span class="badge badge-perm">Permanent</span>' 
                : (ban.duration || 'N/A');
            const date = new Date(ban.bannedAt).toLocaleDateString();
            
            rows += `
                <tr>
                    <td>#${ban.caseNumber || 'N/A'}</td>
                    <td>${ban.primaryUsername}</td>
                    <td>${ban.reason.substring(0, 50)}${ban.reason.length > 50 ? '...' : ''}</td>
                    <td>${duration}</td>
                    <td>${status}</td>
                    <td class="hide-mobile">${ban.staffTag || 'Unknown'}</td>
                    <td class="hide-mobile">${date}</td>
                </tr>
            `;
        }
        
        if (!rows) {
            rows = '<tr><td colspan="7" class="empty">No bans found</td></tr>';
        }
        
        let pagination = '';
        if (totalPages > 1) {
            if (page > 1) {
                pagination += `<a href="/viewer/bans?page=${page-1}&search=${encodeURIComponent(search)}">Previous</a>`;
            }
            pagination += `<span style="padding: 8px 16px; color: #888;">Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) {
                pagination += `<a href="/viewer/bans?page=${page+1}&search=${encodeURIComponent(search)}">Next</a>`;
            }
        }
        
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ban Viewer - NewLife SMP</title>
    <style>${viewerStyles}</style>
</head>
<body>
    <div class="container">
        <h1>NewLife SMP - Ban Viewer</h1>
        <nav class="nav">
            <a href="/viewer/bans" class="active">Bans</a>
            <a href="/viewer/kicks">Kicks</a>
        </nav>
        <div class="stats">
            <div class="stat-card">
                <h3>${total}</h3>
                <p>Total Bans</p>
            </div>
            <div class="stat-card">
                <h3>${activeBans}</h3>
                <p>Active Bans</p>
            </div>
            <div class="stat-card">
                <h3>${total - activeBans}</h3>
                <p>Expired/Unbanned</p>
            </div>
        </div>
        <form class="search-box" method="GET" action="/viewer/bans">
            <input type="text" name="search" placeholder="Search by player, reason, or staff..." value="${search}">
            <button type="submit">Search</button>
        </form>
        <table>
            <thead>
                <tr>
                    <th>Case</th>
                    <th>Player</th>
                    <th>Reason</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th class="hide-mobile">Staff</th>
                    <th class="hide-mobile">Date</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
        <div class="pagination">${pagination}</div>
    </div>
</body>
</html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Viewer error:', error);
        res.status(500).send('Error loading bans');
    }
});

// Kicks viewer page
app.get('/viewer/kicks', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        
        let query = {};
        if (search) {
            query = {
                $or: [
                    { primaryUsername: { $regex: search, $options: 'i' } },
                    { reason: { $regex: search, $options: 'i' } },
                    { staffTag: { $regex: search, $options: 'i' } }
                ]
            };
        }
        
        const total = await Kick.countDocuments(query);
        const kicks = await Kick.find(query)
            .sort({ kickedAt: -1 })
            .skip(skip)
            .limit(limit);
        
        const totalPages = Math.ceil(total / limit);
        
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const kicks24h = await Kick.countDocuments({ kickedAt: { $gte: oneDayAgo } });
        const kicks7d = await Kick.countDocuments({ kickedAt: { $gte: sevenDaysAgo } });
        
        let rows = '';
        for (const kick of kicks) {
            const date = new Date(kick.kickedAt).toLocaleDateString();
            const time = new Date(kick.kickedAt).toLocaleTimeString();
            
            rows += `
                <tr>
                    <td>#${kick.caseNumber || 'N/A'}</td>
                    <td>${kick.primaryUsername}</td>
                    <td>${kick.reason.substring(0, 50)}${kick.reason.length > 50 ? '...' : ''}</td>
                    <td class="hide-mobile">${kick.staffTag || 'Unknown'}</td>
                    <td>${date}</td>
                    <td class="hide-mobile">${time}</td>
                </tr>
            `;
        }
        
        if (!rows) {
            rows = '<tr><td colspan="6" class="empty">No kicks found</td></tr>';
        }
        
        let pagination = '';
        if (totalPages > 1) {
            if (page > 1) {
                pagination += `<a href="/viewer/kicks?page=${page-1}&search=${encodeURIComponent(search)}">Previous</a>`;
            }
            pagination += `<span style="padding: 8px 16px; color: #888;">Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) {
                pagination += `<a href="/viewer/kicks?page=${page+1}&search=${encodeURIComponent(search)}">Next</a>`;
            }
        }
        
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kick Viewer - NewLife SMP</title>
    <style>${viewerStyles}</style>
</head>
<body>
    <div class="container">
        <h1>NewLife SMP - Kick Viewer</h1>
        <nav class="nav">
            <a href="/viewer/bans">Bans</a>
            <a href="/viewer/kicks" class="active">Kicks</a>
        </nav>
        <div class="stats">
            <div class="stat-card">
                <h3>${total}</h3>
                <p>Total Kicks</p>
            </div>
            <div class="stat-card">
                <h3>${kicks24h}</h3>
                <p>Last 24 Hours</p>
            </div>
            <div class="stat-card">
                <h3>${kicks7d}</h3>
                <p>Last 7 Days</p>
            </div>
        </div>
        <form class="search-box" method="GET" action="/viewer/kicks">
            <input type="text" name="search" placeholder="Search by player, reason, or staff..." value="${search}">
            <button type="submit">Search</button>
        </form>
        <table>
            <thead>
                <tr>
                    <th>Case</th>
                    <th>Player</th>
                    <th>Reason</th>
                    <th class="hide-mobile">Staff</th>
                    <th>Date</th>
                    <th class="hide-mobile">Time</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
        <div class="pagination">${pagination}</div>
    </div>
</body>
</html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Viewer error:', error);
        res.status(500).send('Error loading kicks');
    }
});

// Redirect /viewer to /viewer/bans
app.get('/viewer', (req, res) => {
    res.redirect('/viewer/bans');
});

// =====================================================
// AUTHENTICATED API ROUTES
// =====================================================

// API Key middleware for authentication
const API_KEY = process.env.LINK_API_KEY || 'your-secure-api-key-here';

function authenticate(req, res, next) {
    // Skip authentication for viewer routes (already handled above)
    if (req.path.startsWith('/viewer')) {
        return next();
    }
    
    const authHeader = req.headers['authorization'];
    const apiKey = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : req.headers['x-api-key'];
    
    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({ 
            success: false, 
            error: 'Unauthorized' 
        });
    }
    next();
}

// Apply authentication to API routes only
app.use('/api', authenticate);

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
        
        // Normalize UUID - remove dashes and lowercase
        const normalizedUuid = uuid.replace(/-/g, '').toLowerCase();
        
        // Also create version with dashes (standard format)
        const uuidWithDashes = normalizedUuid.replace(
            /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
            '$1-$2-$3-$4-$5'
        );
        
        // Check for linked account - try multiple formats
        const linked = await LinkedAccount.findOne({
            $or: [
                { uuid: normalizedUuid },
                { uuid: uuidWithDashes },
                { uuid: uuid.toLowerCase() },
                { uuid: uuid }
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
            console.log(` Web viewer available at http://localhost:${serverPort}/viewer`);
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
