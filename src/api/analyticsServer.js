/**
 * Analytics API Server
 * Provides REST endpoints for Paper and Velocity analytics plugins
 * Receives TPS data, chunk analysis, lag alerts, and connection events
 * Stores all data to MongoDB for persistence and dashboard access
 */

const express = require('express');
const crypto = require('crypto');

// Import MongoDB models
const ServerTps = require('../database/models/ServerTps');
const ChunkAnalytics = require('../database/models/ChunkAnalytics');
const LagAlert = require('../database/models/LagAlert');
const PlayerConnection = require('../database/models/PlayerConnection');
const PlayerAnalytics = require('../database/models/PlayerAnalytics');
const AltGroup = require('../database/models/AltGroup');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Hash IP for privacy
function hashIp(ip) {
    return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'newlife')).digest('hex').substring(0, 16);
}

/**
 * Authentication middleware
 */
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    const apiKey = process.env.ANALYTICS_API_KEY;
    
    if (!apiKey) {
        console.warn('[Analytics API] Warning: ANALYTICS_API_KEY not set, allowing all requests');
        return next();
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization header' });
    }
    
    const token = authHeader.substring(7);
    if (token !== apiKey) {
        return res.status(403).json({ error: 'Invalid API key' });
    }
    
    next();
}

// Apply authentication to all /api routes
app.use('/api', authenticate);

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'analytics-api' });
});

// =====================================================
// TPS / PERFORMANCE ENDPOINT
// =====================================================

/**
 * POST /api/analytics/tps
 * Receives TPS and performance data from Paper plugin
 * Body: { server, tps, mspt, loadedChunks, entityCount, playerCount, memoryUsed, memoryMax }
 */
app.post('/api/analytics/tps', async (req, res) => {
    try {
        const { server, tps, mspt, loadedChunks, entityCount, playerCount, memoryUsed, memoryMax } = req.body;
        
        if (!server) {
            return res.status(400).json({ error: 'Missing server name' });
        }
        
        // Store to MongoDB
        await ServerTps.create({
            server,
            tps: parseFloat(tps) || 20.0,
            mspt: parseFloat(mspt) || 50.0,
            loadedChunks: parseInt(loadedChunks) || 0,
            entityCount: parseInt(entityCount) || 0,
            playerCount: parseInt(playerCount) || 0,
            memoryUsed: parseInt(memoryUsed) || 0,
            memoryMax: parseInt(memoryMax) || 0,
        });
        
        // Log if TPS is concerning
        const tpsValue = parseFloat(tps) || 20.0;
        if (tpsValue < 18) {
            console.log(`[Analytics] Low TPS on ${server}: ${tpsValue.toFixed(2)}`);
        }
        
        // Emit TPS update event for all low TPS (alerts handled in analytics cog)
        if (tpsValue < 18 && global.discordClient) {
            global.discordClient.emit('analyticsEvent', {
                type: 'tps_update',
                server,
                tps: tpsValue,
                mspt: parseFloat(mspt) || 50.0,
                loadedChunks: parseInt(loadedChunks) || 0,
                entityCount: parseInt(entityCount) || 0,
                playerCount: parseInt(playerCount) || 0,
                memoryUsed: parseInt(memoryUsed) || 0,
                memoryMax: parseInt(memoryMax) || 0,
            });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('[Analytics API] TPS endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/analytics/tps
 * Returns current TPS data for all servers
 */
app.get('/api/analytics/tps', async (req, res) => {
    try {
        // Get latest TPS for each server
        const servers = await ServerTps.aggregate([
            { $sort: { timestamp: -1 } },
            { $group: { 
                _id: '$server',
                tps: { $first: '$tps' },
                mspt: { $first: '$mspt' },
                loadedChunks: { $first: '$loadedChunks' },
                entityCount: { $first: '$entityCount' },
                playerCount: { $first: '$playerCount' },
                timestamp: { $first: '$timestamp' },
            }}
        ]);
        
        const result = {};
        for (const s of servers) {
            result[s._id] = s;
        }
        res.json({ servers: result });
    } catch (error) {
        console.error('[Analytics API] TPS GET error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/analytics/tps/:server
 * Returns TPS data for a specific server
 */
app.get('/api/analytics/tps/:server', async (req, res) => {
    try {
        const data = await ServerTps.findOne({ server: req.params.server })
            .sort({ timestamp: -1 });
        if (!data) {
            return res.status(404).json({ error: 'Server not found' });
        }
        res.json(data);
    } catch (error) {
        console.error('[Analytics API] TPS server GET error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =====================================================
// CHUNK ANALYSIS ENDPOINT
// =====================================================

/**
 * POST /api/analytics/chunks
 * Receives flagged chunk data from Paper plugin
 * Body: { server, chunks: [{ world, x, z, entities, hoppers, redstone, ... }] }
 */
app.post('/api/analytics/chunks', async (req, res) => {
    try {
        const { server, chunks } = req.body;
        
        if (!server || !chunks) {
            return res.status(400).json({ error: 'Missing server or chunks data' });
        }
        
        const flaggedChunks = [];
        let totalEntities = 0;
        const globalBreakdown = {};
        
        for (const chunk of chunks) {
            const { world, x, z, entities, entityBreakdown, hoppers, redstone, tileEntities, playersNearby } = chunk;
            
            totalEntities += entities || 0;
            
            // Aggregate entity types globally
            if (entityBreakdown) {
                for (const [type, count] of Object.entries(entityBreakdown)) {
                    globalBreakdown[type] = (globalBreakdown[type] || 0) + count;
                }
            }
            
            let flagged = false;
            let flagReason = null;
            
            if (entities >= 250) {
                flagged = true;
                flagReason = 'Critical entity count';
            } else if (entities >= 100) {
                flagged = true;
                flagReason = 'High entity count';
            } else if (hoppers >= 50) {
                flagged = true;
                flagReason = 'High hopper count';
            } else if (redstone >= 100) {
                flagged = true;
                flagReason = 'High redstone count';
            }
            
            await ChunkAnalytics.findOneAndUpdate(
                { server, world, chunkX: x, chunkZ: z },
                {
                    entityCount: entities || 0,
                    entityBreakdown: entityBreakdown || {},
                    tileEntityCount: tileEntities || 0,
                    hopperCount: hoppers || 0,
                    redstoneCount: redstone || 0,
                    flagged,
                    flagReason,
                    playersNearby: playersNearby || [],
                    lastUpdated: new Date()
                },
                { upsert: true }
            );
            
            if (flagged) {
                flaggedChunks.push({ world, x, z, entities, hoppers, redstone, flagReason });
            }
        }
        
        // Log critical chunks
        const criticalChunks = chunks.filter(c => c.entities >= 250);
        if (criticalChunks.length > 0) {
            console.log(`[Analytics] ${criticalChunks.length} critical chunks on ${server}`);
        }
        
        // Emit flagged chunks to Discord
        if (flaggedChunks.length > 0 && global.discordClient) {
            global.discordClient.emit('analyticsEvent', {
                type: 'chunk_scan',
                server,
                chunks: flaggedChunks
            });
        }
        
        // Log summary
        console.log(`[Analytics] ${server}: ${chunks.length} chunks, ${totalEntities} total entities`);
        if (Object.keys(globalBreakdown).length > 0) {
            const topEntities = Object.entries(globalBreakdown)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => `${type}:${count}`)
                .join(', ');
            console.log(`[Analytics] Top entities: ${topEntities}`);
        }
        
        res.json({ 
            success: true, 
            received: chunks.length, 
            flagged: flaggedChunks.length,
            totalEntities,
            topEntities: Object.entries(globalBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 10)
        });
    } catch (error) {
        console.error('[Analytics API] Chunks endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/analytics/chunks
 * Returns flagged chunks for all servers
 */
app.get('/api/analytics/chunks', async (req, res) => {
    try {
        const chunks = await ChunkAnalytics.find({ flagged: true })
            .sort({ entityCount: -1 })
            .limit(50);
        res.json({ chunks });
    } catch (error) {
        console.error('[Analytics API] Chunks GET error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/analytics/chunks/:server
 * Returns flagged chunks for a specific server
 */
app.get('/api/analytics/chunks/:server', async (req, res) => {
    try {
        const chunks = await ChunkAnalytics.find({ 
            server: req.params.server,
            flagged: true 
        }).sort({ entityCount: -1 });
        res.json({ chunks });
    } catch (error) {
        console.error('[Analytics API] Chunks server GET error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =====================================================
// LAG ALERT ENDPOINT
// =====================================================

/**
 * POST /api/analytics/lag-alert
 * Receives lag alerts from Paper plugin
 * Body: { server, type, severity, details, location?, playerNearby?, metrics }
 */
app.post('/api/analytics/lag-alert', async (req, res) => {
    try {
        const { server, type, severity, details, location, playerNearby, metrics } = req.body;
        
        if (!server || !type || !severity) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const alert = await LagAlert.create({
            server,
            type,
            severity: severity || 'medium',
            details: details || `${type} alert on ${server}`, // Provide default if missing
            location,
            playerNearby,
            metrics: metrics || {},
        });
        
        // Log the alert
        const severityLabel = severity === 'critical' ? 'CRITICAL' : severity === 'high' ? 'HIGH' : 'INFO';
        console.log(`[Analytics] [${severityLabel}] Lag Alert [${server}] ${type}: ${details}`);
        
        // Emit to Discord
        if (global.discordClient) {
            global.discordClient.emit('analyticsEvent', {
                type: 'lag_alert',
                ...alert.toObject()
            });
        }
        
        res.json({ success: true, alertId: alert._id });
    } catch (error) {
        console.error('[Analytics API] Lag alert endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/analytics/lag-alerts
 * Returns recent lag alerts
 */
app.get('/api/analytics/lag-alerts', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const severity = req.query.severity;
        const server = req.query.server;
        
        const query = {};
        if (severity) query.severity = severity;
        if (server) query.server = server;
        
        const alerts = await LagAlert.find(query)
            .sort({ timestamp: -1 })
            .limit(limit);
        
        res.json({ alerts });
    } catch (error) {
        console.error('[Analytics API] Lag alerts GET error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =====================================================
// CONNECTION EVENTS ENDPOINT (Velocity)
// =====================================================

/**
 * POST /api/analytics/connection
 * Receives connection events from Velocity plugin
 * Body: { uuid, username, ip, server, type, sessionDuration, ping }
 */
app.post('/api/analytics/connection', async (req, res) => {
    try {
        const { uuid, username, ip, server, type, sessionDuration, ping } = req.body;
        
        if (!uuid || !username || !type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const ipHash = hashIp(ip || 'unknown');
        
        // Store connection
        await PlayerConnection.create({
            uuid,
            username,
            ip: ip || 'unknown',
            ipHash,
            server: server || 'proxy',
            type, // join, leave, server_switch
            sessionDuration: parseInt(sessionDuration) || 0,
            ping: parseInt(ping) || 0,
        });
        
        // Update player analytics
        const updateData = {
            $set: { username, lastSeen: new Date() },
            $setOnInsert: { firstSeen: new Date() },
            $inc: { connectionCount: 1 }
        };
        
        if (sessionDuration) {
            updateData.$inc.totalPlaytime = sessionDuration;
            updateData.$inc.sessionCount = 1;
        }
        
        await PlayerAnalytics.findOneAndUpdate(
            { uuid },
            updateData,
            { upsert: true }
        );
        
        // Check for ALTs on join
        if (type === 'join' && ip && global.discordClient) {
            const sameIpAccounts = await PlayerConnection.aggregate([
                { $match: { ipHash, uuid: { $ne: uuid } } },
                { $group: { _id: '$uuid', username: { $last: '$username' }, count: { $sum: 1 } } }
            ]);
            
            if (sameIpAccounts.length > 0) {
                // Check if already flagged
                const existing = await AltGroup.findOne({
                    $or: [
                        { primaryUuid: uuid },
                        { 'linkedAccounts.uuid': uuid }
                    ]
                });
                
                if (!existing) {
                    // Create new ALT group
                    const altGroup = await AltGroup.create({
                        primaryUuid: uuid,
                        primaryUsername: username,
                        linkedAccounts: sameIpAccounts.map(a => ({
                            uuid: a._id,
                            username: a.username,
                            connectionCount: a.count
                        })),
                        sharedIpHash: ipHash,
                        status: 'pending',
                        riskScore: Math.min(100, sameIpAccounts.length * 25)
                    });
                    
                    global.discordClient.emit('analyticsEvent', {
                        type: 'alt_detected',
                        primary: { uuid, username },
                        alts: sameIpAccounts,
                        groupId: altGroup._id
                    });
                }
            }
        }
        
        // Note: End items clearing is handled by endItemsClear.js cog via RCON polling
        
        res.json({ success: true });
    } catch (error) {
        console.error('[Analytics API] Connection endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/analytics/connections
 * Returns recent connection events
 */
app.get('/api/analytics/connections', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const type = req.query.type;
        const username = req.query.username;
        
        const query = {};
        if (type) query.type = type;
        if (username) query.username = new RegExp(username, 'i');
        
        const connections = await PlayerConnection.find(query)
            .sort({ timestamp: -1 })
            .limit(limit);
        
        res.json({ connections });
    } catch (error) {
        console.error('[Analytics API] Connections GET error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/analytics/player/:username
 * Returns connection history for a specific player
 */
app.get('/api/analytics/player/:username', async (req, res) => {
    try {
        const connections = await PlayerConnection.find({
            username: new RegExp(`^${req.params.username}$`, 'i')
        }).sort({ timestamp: -1 }).limit(100);
        
        const analytics = await PlayerAnalytics.findOne({
            username: new RegExp(`^${req.params.username}$`, 'i')
        });
        
        res.json({ 
            username: req.params.username, 
            analytics,
            connections 
        });
    } catch (error) {
        console.error('[Analytics API] Player GET error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =====================================================
// SUMMARY ENDPOINT
// =====================================================

/**
 * GET /api/analytics/summary
 * Returns a summary of all analytics data
 */
app.get('/api/analytics/summary', async (req, res) => {
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        // Get latest TPS for each server
        const servers = await ServerTps.aggregate([
            { $sort: { timestamp: -1 } },
            { $group: { 
                _id: '$server',
                tps: { $first: '$tps' },
                mspt: { $first: '$mspt' },
                playerCount: { $first: '$playerCount' },
                entityCount: { $first: '$entityCount' },
                timestamp: { $first: '$timestamp' },
            }}
        ]);
        
        const serverData = {};
        for (const s of servers) {
            serverData[s._id] = s;
        }
        
        // Get alert count
        const alertCount = await LagAlert.countDocuments({ timestamp: { $gte: oneDayAgo } });
        const recentAlerts = await LagAlert.find({ timestamp: { $gte: oneDayAgo } })
            .sort({ timestamp: -1 })
            .limit(10);
        
        // Get connection count
        const connectionCount = await PlayerConnection.countDocuments({ timestamp: { $gte: oneDayAgo } });
        const uniquePlayers = await PlayerConnection.distinct('uuid', { timestamp: { $gte: oneDayAgo } });
        
        res.json({
            servers: serverData,
            alertCount,
            recentAlerts,
            connectionCount,
            stats: {
                criticalAlerts: await LagAlert.countDocuments({ 
                    timestamp: { $gte: oneDayAgo },
                    severity: 'critical'
                }),
                uniquePlayersLastDay: uniquePlayers.length,
            },
        });
    } catch (error) {
        console.error('[Analytics API] Summary GET error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =====================================================
// START SERVER
// =====================================================

let analyticsServer = null;

function startAnalyticsServer(client) {
    const port = parseInt(process.env.ANALYTICS_API_PORT) || 3002;
    
    // Make Discord client available to routes if needed
    app.set('discordClient', client);
    
    analyticsServer = app.listen(port, () => {
        console.log(`[Analytics API] Server running on port ${port}`);
    });
    
    analyticsServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[Analytics API] Port ${port} is already in use`);
        } else {
            console.error('[Analytics API] Server error:', err);
        }
    });
    
    return analyticsServer;
}

function stopAnalyticsServer() {
    if (analyticsServer) {
        analyticsServer.close();
        analyticsServer = null;
    }
}

module.exports = {
    startAnalyticsServer,
    stopAnalyticsServer,
};
