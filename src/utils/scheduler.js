/**
 * Centralized Scheduler Module
 * All cron jobs and scheduled tasks in one place
 */

const cron = require('node-cron');
const logger = require('./logger').createLogger('Scheduler');

// Track all scheduled tasks
const tasks = new Map();
const intervals = new Map();

/**
 * Schedule a cron job
 * @param {string} name - Unique name for the task
 * @param {string} cronExpr - Cron expression (e.g., '0 0 * * *' for daily at midnight)
 * @param {Function} handler - Async function to execute
 * @param {Object} options - Options
 * @param {string} [options.timezone='UTC'] - Timezone for the cron
 * @param {boolean} [options.runOnStart=false] - Run immediately on registration
 * @returns {Object} The cron task
 */
function schedule(name, cronExpr, handler, options = {}) {
    const { timezone = 'UTC', runOnStart = false } = options;

    // Stop existing task if it exists
    if (tasks.has(name)) {
        tasks.get(name).stop();
        logger.warn(`Replacing existing task: ${name}`);
    }

    const wrappedHandler = async () => {
        try {
            logger.debug(`Running scheduled task: ${name}`);
            await handler();
        } catch (error) {
            logger.error(`Task ${name} failed: ${error.message}`);
        }
    };

    const task = cron.schedule(cronExpr, wrappedHandler, { timezone });
    tasks.set(name, task);
    
    logger.info(`Registered: ${name} (${cronExpr} ${timezone})`);

    if (runOnStart) {
        logger.debug(`Running ${name} immediately (runOnStart)`);
        wrappedHandler();
    }

    return task;
}

/**
 * Schedule an interval task
 * @param {string} name - Unique name for the interval
 * @param {number} intervalMs - Interval in milliseconds
 * @param {Function} handler - Async function to execute
 * @param {Object} options - Options
 * @param {boolean} [options.runOnStart=false] - Run immediately on registration
 * @returns {NodeJS.Timer} The interval
 */
function scheduleInterval(name, intervalMs, handler, options = {}) {
    const { runOnStart = false } = options;

    // Clear existing interval if it exists
    if (intervals.has(name)) {
        clearInterval(intervals.get(name));
        logger.warn(`Replacing existing interval: ${name}`);
    }

    const wrappedHandler = async () => {
        try {
            await handler();
        } catch (error) {
            logger.error(`Interval ${name} failed: ${error.message}`);
        }
    };

    const interval = setInterval(wrappedHandler, intervalMs);
    intervals.set(name, interval);

    const seconds = Math.round(intervalMs / 1000);
    logger.info(`Registered interval: ${name} (every ${seconds}s)`);

    if (runOnStart) {
        wrappedHandler();
    }

    return interval;
}

/**
 * Stop a specific task by name
 * @param {string} name - Task name
 */
function stopTask(name) {
    if (tasks.has(name)) {
        tasks.get(name).stop();
        tasks.delete(name);
        logger.info(`Stopped task: ${name}`);
    }
    if (intervals.has(name)) {
        clearInterval(intervals.get(name));
        intervals.delete(name);
        logger.info(`Stopped interval: ${name}`);
    }
}

/**
 * Stop all scheduled tasks and intervals
 */
function stopAll() {
    for (const [name, task] of tasks) {
        task.stop();
        logger.debug(`Stopped task: ${name}`);
    }
    tasks.clear();

    for (const [name, interval] of intervals) {
        clearInterval(interval);
        logger.debug(`Stopped interval: ${name}`);
    }
    intervals.clear();

    logger.info('All scheduled tasks stopped');
}

/**
 * Get list of all registered tasks
 * @returns {string[]} Array of task names
 */
function listTasks() {
    return [...tasks.keys(), ...intervals.keys()];
}

module.exports = {
    schedule,
    scheduleInterval,
    stopTask,
    stopAll,
    listTasks,
};
