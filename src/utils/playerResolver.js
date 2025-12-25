const fetch = require('node-fetch');

// Normalize UUID (remove dashes)
function normalizeUuid(id) {
    return id.replace(/-/g, '').toLowerCase();
}

function looksLikeUuid(input) {
    return /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/.test(input);
}

function looksLikeName(input) {
    return /^[a-zA-Z0-9_]{2,16}$/.test(input);
}

/**
 * Resolve a player input (username or uuid) to an object { name, uuid }
 * Returns null if not resolvable.
 */
async function resolvePlayer(input) {
    if (!input || typeof input !== 'string') return null;
    input = input.trim();

    // If it's a mention or contains non-player characters, bail
    const mention = input.match(/<@!?(\d+)>/);
    if (mention) return null;

    try {
        // If it looks like a UUID, query by UUID
        if (looksLikeUuid(input)) {
            const id = normalizeUuid(input);
            const res = await fetch(`https://mcprofile.io/api/v1/java/profile/uuid/${id}`);
            if (!res.ok) return { uuid: id };
            const data = await res.json();
            if (data && data.uuid) return { uuid: data.uuid, name: data.name };
            return { uuid: id };
        }

        // If it looks like a username, query by name
        if (looksLikeName(input)) {
            const res = await fetch(`https://mcprofile.io/api/v1/java/profile/name/${encodeURIComponent(input)}`);
            if (!res.ok) return null;
            const data = await res.json();
            if (data && data.uuid) return { uuid: data.uuid, name: data.name };
            return null;
        }

        return null;
    } catch (e) {
        return null;
    }
}

module.exports = { resolvePlayer };
