/**
 * Fetch Helper Utility
 * Provides consistent fetch functionality across Node versions
 */

let cachedFetch = null;

/**
 * Get a fetch implementation
 * Uses native fetch on Node 18+ or falls back to node-fetch
 * @returns {Promise<Function>} - Fetch function
 */
async function getFetch() {
    if (cachedFetch) return cachedFetch;
    
    if (globalThis.fetch) {
        cachedFetch = globalThis.fetch;
        return cachedFetch;
    }
    
    try {
        const nf = require('node-fetch');
        cachedFetch = nf.default || nf;
        return cachedFetch;
    } catch (e) {
        throw new Error('Fetch not available. Install node-fetch or run on Node 18+.');
    }
}

/**
 * Perform a fetch request with error handling
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const fetch = await getFetch();
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    getFetch,
    fetchWithTimeout
};
