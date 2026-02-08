/**
 * Cleanup Manager
 * Centralized cleanup for intervals, timeouts, and resources
 * Ensures graceful shutdown
 */

// Track all cleanupable resources
const intervals = new Map();
const timeouts = new Map();
const cleanupFunctions = [];

let cleanupId = 0;

/**
 * Register an interval for cleanup
 * @param {string} name - Identifier for the interval
 * @param {NodeJS.Timer} interval - Interval reference
 * @returns {string} Interval ID for later removal
 */
function registerInterval(name, interval) {
    const id = `${name}_${++cleanupId}`;
    intervals.set(id, { name, interval, createdAt: Date.now() });
    console.log(`[Cleanup] Registered interval: ${name}`);
    return id;
}

/**
 * Register a timeout for cleanup
 * @param {string} name - Identifier for the timeout
 * @param {NodeJS.Timeout} timeout - Timeout reference
 * @returns {string} Timeout ID for later removal
 */
function registerTimeout(name, timeout) {
    const id = `${name}_${++cleanupId}`;
    timeouts.set(id, { name, timeout, createdAt: Date.now() });
    return id;
}

/**
 * Register a cleanup function to be called on shutdown
 * @param {string} name - Identifier for the cleanup function
 * @param {Function} fn - Async function to call on cleanup
 */
function registerCleanup(name, fn) {
    cleanupFunctions.push({ name, fn });
    console.log(`[Cleanup] Registered cleanup function: ${name}`);
}

/**
 * Remove a registered interval
 * @param {string} id - Interval ID returned from registerInterval
 */
function removeInterval(id) {
    const entry = intervals.get(id);
    if (entry) {
        clearInterval(entry.interval);
        intervals.delete(id);
    }
}

/**
 * Remove a registered timeout
 * @param {string} id - Timeout ID returned from registerTimeout
 */
function removeTimeout(id) {
    const entry = timeouts.get(id);
    if (entry) {
        clearTimeout(entry.timeout);
        timeouts.delete(id);
    }
}

/**
 * Clear all intervals and timeouts
 */
function clearAll() {
    let cleared = 0;
    
    for (const [id, entry] of intervals) {
        clearInterval(entry.interval);
        cleared++;
    }
    intervals.clear();
    
    for (const [id, entry] of timeouts) {
        clearTimeout(entry.timeout);
        cleared++;
    }
    timeouts.clear();
    
    console.log(`[Cleanup] Cleared ${cleared} intervals/timeouts`);
    return cleared;
}

/**
 * Run all registered cleanup functions
 */
async function runCleanup() {
    console.log('[Cleanup] Running cleanup functions...');
    
    // Clear all intervals/timeouts first
    clearAll();
    
    // Run cleanup functions
    for (const { name, fn } of cleanupFunctions) {
        try {
            await fn();
            console.log(`[Cleanup] ✓ ${name}`);
        } catch (error) {
            console.error(`[Cleanup] ✗ ${name}:`, error.message);
        }
    }
    
    console.log('[Cleanup] Cleanup complete');
}

/**
 * Get cleanup statistics
 */
function getStats() {
    return {
        intervals: intervals.size,
        timeouts: timeouts.size,
        cleanupFunctions: cleanupFunctions.length,
        details: {
            intervals: Array.from(intervals.values()).map(e => e.name),
            cleanupFunctions: cleanupFunctions.map(c => c.name)
        }
    };
}

/**
 * Initialize shutdown handlers
 * Call this once in bot.js
 */
function initShutdownHandlers() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    for (const signal of signals) {
        process.on(signal, async () => {
            console.log(`\n[Cleanup] Received ${signal}, shutting down gracefully...`);
            await runCleanup();
            process.exit(0);
        });
    }
    
    process.on('uncaughtException', async (error) => {
        console.error('[Cleanup] Uncaught exception:', error);
        await runCleanup();
        process.exit(1);
    });
    
    console.log('[Cleanup] Shutdown handlers initialized');
}

module.exports = {
    registerInterval,
    registerTimeout,
    registerCleanup,
    removeInterval,
    removeTimeout,
    clearAll,
    runCleanup,
    getStats,
    initShutdownHandlers
};
