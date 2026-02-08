/**
 * MongoDB Database Connection Handler
 * Manages connection to MongoDB for NewLife Management Bot
 */

const mongoose = require('mongoose');

let isConnected = false;

/**
 * Connect to MongoDB database
 * @returns {Promise<void>}
 */
async function connectDatabase() {
    if (isConnected) {
        console.log('📦 Using existing database connection');
        return;
    }

    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DATABASE || 'newlife';

    if (!mongoUri) {
        throw new Error('MONGODB_URI is not defined in environment variables');
    }

    try {
        console.log('🔄 Connecting to MongoDB...');
        
        await mongoose.connect(mongoUri, {
            dbName: dbName,
        });

        isConnected = true;
        
        // Connection event handlers for monitoring
        mongoose.connection.on('disconnected', () => {
            console.error('[MongoDB] ⚠️ Connection lost - Mongoose will attempt to reconnect');
            isConnected = false;
        });

        mongoose.connection.on('reconnected', () => {
            console.log('[MongoDB] ✓ Reconnected successfully');
            isConnected = true;
        });

        mongoose.connection.on('error', (err) => {
            console.error('[MongoDB] Connection error:', err.message);
        });

        // Log connection state changes
        mongoose.connection.on('connecting', () => {
            console.log('[MongoDB] Connecting...');
        });

        mongoose.connection.on('connected', () => {
            console.log('[MongoDB] Connected');
            isConnected = true;
        });
        
        console.log('╔════════════════════════════════════════╗');
        console.log('║     MongoDB Connection Established     ║');
        console.log('╠════════════════════════════════════════╣');
        console.log(`║ Database: ${dbName.padEnd(27)} ║`);
        console.log('║ Status: Connected                      ║');
        console.log('╚════════════════════════════════════════╝\n');

    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        throw error;
    }
}

/**
 * Get the MongoDB database instance
 * @returns {mongoose.Connection}
 */
function getDatabase() {
    return mongoose.connection;
}

/**
 * Check if database is connected
 * @returns {boolean}
 */
function isDatabaseConnected() {
    return mongoose.connection.readyState === 1;
}

/**
 * Disconnect from MongoDB
 * @returns {Promise<void>}
 */
async function disconnectDatabase() {
    if (!isConnected) return;
    
    await mongoose.disconnect();
    isConnected = false;
    console.log('📦 Disconnected from MongoDB');
}

module.exports = {
    connectDatabase,
    getDatabase,
    disconnectDatabase,
    isDatabaseConnected
};
