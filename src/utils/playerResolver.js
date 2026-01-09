const fetch = require('node-fetch');
const LinkedAccount = require('../database/models/LinkedAccount');

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

/**
 * Resolve a Discord user from a Minecraft username
 * Looks up the LinkedAccount database to find the Discord ID
 * @param {string} mcUsername - Minecraft username to look up
 * @param {Client} client - Discord client to fetch user
 * @returns {Promise<{discordUser: User|null, discordId: string|null, linkedAccount: Object|null}>}
 */
async function resolveDiscordFromMinecraft(mcUsername, client) {
    if (!mcUsername || typeof mcUsername !== 'string') {
        return { discordUser: null, discordId: null, linkedAccount: null };
    }

    try {
        // Look up in LinkedAccount database (case-insensitive)
        const linkedAccount = await LinkedAccount.findOne({
            minecraftUsername: { $regex: new RegExp(`^${mcUsername}$`, 'i') }
        });

        if (!linkedAccount) {
            return { discordUser: null, discordId: null, linkedAccount: null };
        }

        const discordId = linkedAccount.discordId;
        let discordUser = null;

        // Try to fetch the Discord user
        if (client) {
            try {
                discordUser = await client.users.fetch(discordId);
            } catch (e) {
                // User might not exist or bot can't access
            }
        }

        return {
            discordUser,
            discordId,
            linkedAccount
        };
    } catch (e) {
        console.error('[PlayerResolver] Error resolving Discord from MC:', e);
        return { discordUser: null, discordId: null, linkedAccount: null };
    }
}

/**
 * Resolve a target user - accepts either Discord user mention/ID or Minecraft username
 * If a Minecraft username is provided, looks up the linked Discord account
 * @param {Interaction} interaction - Discord interaction
 * @param {string} optionName - Name of the user option
 * @param {string} mcOptionName - Name of the optional MC username option (if separate)
 * @param {Client} client - Discord client
 * @returns {Promise<{user: User|null, discordId: string|null, resolvedFrom: 'discord'|'minecraft'|null, mcUsername: string|null}>}
 */
async function resolveTargetUser(interaction, optionName, mcOptionName, client) {
    // First try to get Discord user directly
    const discordUser = interaction.options.getUser(optionName);
    
    if (discordUser) {
        return {
            user: discordUser,
            discordId: discordUser.id,
            resolvedFrom: 'discord',
            mcUsername: null
        };
    }

    // If no Discord user, try Minecraft name option
    const mcUsername = mcOptionName ? interaction.options.getString(mcOptionName) : null;
    
    if (mcUsername) {
        const result = await resolveDiscordFromMinecraft(mcUsername, client);
        return {
            user: result.discordUser,
            discordId: result.discordId,
            resolvedFrom: result.discordId ? 'minecraft' : null,
            mcUsername
        };
    }

    return { user: null, discordId: null, resolvedFrom: null, mcUsername: null };
}

module.exports = { 
    resolvePlayer, 
    resolveDiscordFromMinecraft, 
    resolveTargetUser,
    looksLikeName,
    looksLikeUuid,
    normalizeUuid
};
