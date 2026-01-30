/**
 * Analytics API Server
 * Provides REST endpoints for Paper and Velocity analytics plugins
 * Receives TPS data, chunk analysis, lag alerts, and connection events
 */

const express = require('express');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Store for analytics data (in-memory, can be extended to MongoDB)
const analyticsData = {
    servers: new Map(), // Server TPS/performance data
    connections: [],    // Recent connection events
    lagAlerts: [],      // Recent lag alerts
    chunks: new Map(),  // Flagged chunks by server
};

// Keep only last N items for in-memory storage
const MAX_CONNECTIONS = 1000;
const MAX_LAG_ALERTS = 500;

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
app.post('/api/analytics/tps', (req, res) => {
    try {
        const { server, tps, mspt, loadedChunks, entityCount, playerCount, memoryUsed, memoryMax } = req.body;
        
        if (!server) {
            return res.status(400).json({ error: 'Missing server name' });
        }
        
        const data = {
            server,
            tps: parseFloat(tps) || 20.0,
            mspt: parseFloat(mspt) || 50.0,
            loadedChunks: parseInt(loadedChunks) || 0,
            entityCount: parseInt(entityCount) || 0,
            playerCount: parseInt(playerCount) || 0,
            memoryUsed: parseInt(memoryUsed) || 0,
            memoryMax: parseInt(memoryMax) || 0,
            timestamp: new Date(),
        };
        
        analyticsData.servers.set(server, data);
        
        // Log if TPS is concerning
        if (data.tps < 18) {
            console.log(`[Analytics] ⚠️ Low TPS on ${server}: ${data.tps.toFixed(2)}`);
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
app.get('/api/analytics/tps', (req, res) => {
    const servers = {};
    for (const [name, data] of analyticsData.servers) {
        servers[name] = data;
    }
    res.json({ servers });
});

/**
 * GET /api/analytics/tps/:server
 * Returns TPS data for a specific server
 */
app.get('/api/analytics/tps/:server', (req, res) => {
    const data = analyticsData.servers.get(req.params.server);
    if (!data) {
        return res.status(404).json({ error: 'Server not found' });
    }
    res.json(data);
});

// =====================================================
// CHUNK ANALYSIS ENDPOINT
// =====================================================

/**
 * POST /api/analytics/chunks
 * Receives flagged chunk data from Paper plugin
 * Body: { server, chunks: [{ world, x, z, entities, hoppers, redstone, ... }] }
 */
app.post('/api/analytics/chunks', (req, res) => {
    try {
        const { server, chunks } = req.body;
        
        if (!server || !chunks) {
            return res.status(400).json({ error: 'Missing server or chunks data' });
        }
        
        analyticsData.chunks.set(server, {
            chunks,
            timestamp: new Date(),
        });
        
        // Log critical chunks
        const criticalChunks = chunks.filter(c => c.entities >= 250);
        if (criticalChunks.length > 0) {
            console.log(`[Analytics] 🚨 ${criticalChunks.length} critical chunks on ${server}`);
        }
        
        res.json({ success: true, received: chunks.length });
    } catch (error) {
        console.error('[Analytics API] Chunks endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/analytics/chunks
 * Returns flagged chunks for all servers
 */
app.get('/api/analytics/chunks', (req, res) => {
    const result = {};
    for (const [server, data] of analyticsData.chunks) {
        result[server] = data;
    }
    res.json(result);
});

/**
 * GET /api/analytics/chunks/:server
 * Returns flagged chunks for a specific server
 */
app.get('/api/analytics/chunks/:server', (req, res) => {
    const data = analyticsData.chunks.get(req.params.server);
    if (!data) {
        return res.status(404).json({ error: 'No chunk data for server' });
    }
    res.json(data);
});

// =====================================================
// LAG ALERT ENDPOINT
// =====================================================

/**
 * POST /api/analytics/lag-alert
 * Receives lag alerts from Paper plugin
 * Body: { server, type, severity, details, location?, playerNearby?, metrics }
 */
app.post('/api/analytics/lag-alert', (req, res) => {
    try {
        const { server, type, severity, details, location, playerNearby, metrics } = req.body;
        
        if (!server || !type || !severity) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const alert = {
            server,
            type,
            severity,
            details,
            location: location || null,
            playerNearby: playerNearby || null,
            metrics: metrics || {},
            timestamp: new Date(),
        };
        
        analyticsData.lagAlerts.unshift(alert);
        
        // Trim old alerts
        if (analyticsData.lagAlerts.length > MAX_LAG_ALERTS) {
            analyticsData.lagAlerts = analyticsData.lagAlerts.slice(0, MAX_LAG_ALERTS);
        }
        
        // Log the alert
        const severityEmoji = severity === 'critical' ? '🚨' : severity === 'high' ? '⚠️' : 'ℹ️';
        console.log(`[Analytics] ${severityEmoji} Lag Alert [${server}] ${type}: ${details}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('[Analytics API] Lag alert endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/analytics/lag-alerts
 * Returns recent lag alerts
 */
app.get('/api/analytics/lag-alerts', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const severity = req.query.severity;
    const server = req.query.server;
    
    let alerts = analyticsData.lagAlerts;
    
    if (severity) {
        alerts = alerts.filter(a => a.severity === severity);
    }
    if (server) {
        alerts = alerts.filter(a => a.server === server);
    }
    
    res.json({ alerts: alerts.slice(0, limit) });
});

// =====================================================
// CONNECTION EVENTS ENDPOINT (Velocity)
// =====================================================

/**
 * POST /api/analytics/connection
 * Receives connection events from Velocity plugin
 * Body: { uuid, username, ip, server, type, sessionDuration, ping }
 */
app.post('/api/analytics/connection', (req, res) => {
    try {
        const { uuid, username, ip, server, type, sessionDuration, ping } = req.body;
        
        if (!uuid || !username || !type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const event = {
            uuid,
            username,
            ip: ip || 'unknown',
            server: server || 'proxy',
            type, // join, leave, server_switch
            sessionDuration: parseInt(sessionDuration) || 0,
            ping: parseInt(ping) || 0,
            timestamp: new Date(),
        };
        
        analyticsData.connections.unshift(event);
        
        // Trim old events
        if (analyticsData.connections.length > MAX_CONNECTIONS) {
            analyticsData.connections = analyticsData.connections.slice(0, MAX_CONNECTIONS);
        }
        
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
app.get('/api/analytics/connections', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const type = req.query.type;
    const username = req.query.username;
    
    let connections = analyticsData.connections;
    
    if (type) {
        connections = connections.filter(c => c.type === type);
    }
    if (username) {
        connections = connections.filter(c => c.username.toLowerCase() === username.toLowerCase());
    }
    
    res.json({ connections: connections.slice(0, limit) });
});

/**
 * GET /api/analytics/player/:username
 * Returns connection history for a specific player
 */
app.get('/api/analytics/player/:username', (req, res) => {
    const username = req.params.username.toLowerCase();
    const connections = analyticsData.connections.filter(
        c => c.username.toLowerCase() === username
    );
    res.json({ username: req.params.username, connections });
});

// =====================================================
// SUMMARY ENDPOINT
// =====================================================

/**
 * GET /api/analytics/summary
 * Returns a summary of all analytics data
 */
app.get('/api/analytics/summary', (req, res) => {
    const servers = {};
    for (const [name, data] of analyticsData.servers) {
        servers[name] = {
            tps: data.tps,
            mspt: data.mspt,
            playerCount: data.playerCount,
            entityCount: data.entityCount,
            lastUpdate: data.timestamp,
        };
    }
    
    const recentAlerts = analyticsData.lagAlerts.slice(0, 10);
    const recentConnections = analyticsData.connections.slice(0, 10);
    
    // Count active players (joined but not left in last hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentJoins = new Set();
    const recentLeaves = new Set();
    
    for (const conn of analyticsData.connections) {
        if (new Date(conn.timestamp).getTime() > oneHourAgo) {
            if (conn.type === 'join') recentJoins.add(conn.uuid);
            if (conn.type === 'leave') recentLeaves.add(conn.uuid);
        }
    }
    
    res.json({
        servers,
        alertCount: analyticsData.lagAlerts.length,
        recentAlerts,
        connectionCount: analyticsData.connections.length,
        recentConnections,
        stats: {
            criticalAlerts: analyticsData.lagAlerts.filter(a => a.severity === 'critical').length,
            uniquePlayersLastHour: recentJoins.size,
        },
    });
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

// Export analytics data for use in cogs
function getAnalyticsData() {
    return analyticsData;
}

module.exports = {
    startAnalyticsServer,
    stopAnalyticsServer,
    getAnalyticsData,
};
