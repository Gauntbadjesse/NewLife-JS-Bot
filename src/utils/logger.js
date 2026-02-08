/**
 * Centralized Logger Utility
 * Standardized logging format across all modules
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

// Current log level (can be set via env)
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// ANSI colors for terminal
const colors = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
};

/**
 * Format timestamp for logging
 * @returns {string}
 */
function timestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Core logging function
 * @param {string} level - Log level
 * @param {string} module - Module name
 * @param {string} message - Log message
 * @param {Object} [data] - Additional data
 */
function log(level, module, message, data = null) {
    const levelNum = LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
    if (levelNum < currentLevel) return;

    const levelColors = {
        DEBUG: colors.dim,
        INFO: colors.green,
        WARN: colors.yellow,
        ERROR: colors.red,
    };

    const color = levelColors[level] || colors.reset;
    const ts = `${colors.dim}${timestamp()}${colors.reset}`;
    const lvl = `${color}${level.padEnd(5)}${colors.reset}`;
    const mod = `${colors.cyan}[${module}]${colors.reset}`;

    if (data) {
        console.log(`${ts} ${lvl} ${mod} ${message}`, data);
    } else {
        console.log(`${ts} ${lvl} ${mod} ${message}`);
    }
}

/**
 * Create a logger instance for a specific module
 * @param {string} moduleName - Name of the module
 * @returns {Object} Logger instance with debug, info, warn, error methods
 */
function createLogger(moduleName) {
    return {
        debug: (message, data) => log('DEBUG', moduleName, message, data),
        info: (message, data) => log('INFO', moduleName, message, data),
        warn: (message, data) => log('WARN', moduleName, message, data),
        error: (message, data) => log('ERROR', moduleName, message, data),
        
        // Shorthand for success messages
        success: (message, data) => log('INFO', moduleName, `✓ ${message}`, data),
    };
}

// Default export for quick use
module.exports = {
    debug: (mod, msg, data) => log('DEBUG', mod, msg, data),
    info: (mod, msg, data) => log('INFO', mod, msg, data),
    warn: (mod, msg, data) => log('WARN', mod, msg, data),
    error: (mod, msg, data) => log('ERROR', mod, msg, data),
    createLogger,
    LOG_LEVELS,
};
