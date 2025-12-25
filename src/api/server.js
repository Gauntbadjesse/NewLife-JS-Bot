/**
 * API Server
 * Express server for Minecraft-Discord integration
 * 
 * Listens on port 25577 for:
 * - POST /console - Receive console logs from Minecraft
 * - POST /player/join - Player join events
 * - POST /player/leave - Player leave events
 * - POST /player/command - Player command execution
 * - GET /whitelist - Get current whitelist
 * - POST /whitelist/sync - Sync whitelist from Minecraft
 */

const express = require('express');
const consoleRoutes = require('./routes/console');
const playerRoutes = require('./routes/players');
const whitelistRoutes = require('./routes/whitelist');

const app = express();
const PORT = process.env.API_PORT || 25577;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[API] ${timestamp} ${req.method} ${req.path}`);
    next();
});

// Store Discord client reference
let discordClient = null;

// Middleware to attach Discord client to requests
app.use((req, res, next) => {
    req.discordClient = discordClient;
    next();
});

// Routes
app.use('/console', consoleRoutes);
app.use('/player', playerRoutes);
app.use('/whitelist', whitelistRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        discord: discordClient ? 'connected' : 'disconnected'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[API] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

/**
 * Start the API server
 * @param {Client} client - Discord client instance
 */
function startServer(client) {
    discordClient = client;
    
    app.listen(PORT, () => {
        console.log(`╔════════════════════════════════════════╗`);
        console.log(`║       API Server Started               ║`);
        console.log(`╠════════════════════════════════════════╣`);
        console.log(`║ Port: ${PORT}                           ║`);
        console.log(`║ Status: Running                        ║`);
        console.log(`╚════════════════════════════════════════╝`);
    });
}

module.exports = { startServer, app };
