/**
 * Centralized Configuration Module
 * All environment variables and settings in one place
 */

require('dotenv').config();

module.exports = {
    // Bot Info
    bot: {
        version: process.env.BOT_VERSION || require('../package.json').version || '1.0.0',
        prefix: process.env.BOT_PREFIX || '!',
        gitBranch: process.env.GIT_BRANCH || 'main',
    },

    // Discord Configuration
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.CLIENT_ID,
        guildId: process.env.GUILD_ID || '1372672239245459498',
        registerGuild: process.env.REGISTER_GUILD,
    },

    // Role IDs
    roles: {
        owner: process.env.OWNER_ROLE_ID,
        ownerId: process.env.OWNER_ID || process.env.OWNER_USER_ID,
        management: process.env.MANAGEMENT_ROLE_ID,
        supervisor: process.env.SUPERVISOR_ROLE_ID,
        admin: process.env.ADMIN_ROLE_ID,
        srMod: process.env.SR_MOD_ROLE_ID,
        moderator: process.env.MODERATOR_ROLE_ID,
        staff: process.env.STAFF_TEAM,
        member: process.env.MEMBER_ROLE_ID || '1374421919373328434',
        premium: process.env.NEWLIFE_PLUS,
        verified: process.env.VERIFIED_ROLE_ID,
        unverified: process.env.UNVERIFIED_ROLE_ID,
        guru: process.env.WHITELIST_GURU,
        currentlyModerating: process.env.CURRENTLY_MODERATING_ROLE_ID,
    },

    // Channel IDs
    channels: {
        logs: process.env.LOG_CHANNEL_ID,
        errors: process.env.ERROR_LOG_CHANNEL_ID || '1372674267241644187',
        memberCounter: process.env.MEMBER_COUNTER_CHANNEL || '1437529792755794123',
        commandLogs: process.env.COMMAND_LOG_CHANNEL_ID,
        modLogs: process.env.MOD_LOG_CHANNEL_ID,
        welcomeChannel: process.env.WELCOME_CHANNEL_ID,
        ticketCategory: process.env.TICKET_CATEGORY_ID,
        ticketLogs: process.env.TICKET_LOG_CHANNEL_ID,
        suggestions: process.env.SUGGESTION_CHANNEL_ID,
        whitelistApps: process.env.WHITELIST_CHANNEL_ID,
        staffApps: process.env.STAFF_APPS_CHANNEL_ID,
        instagram: process.env.INSTAGRAM_CHANNEL_ID,
        pvpLogs: process.env.PVP_LOG_CHANNEL_ID,
    },

    // Database
    database: {
        uri: process.env.MONGODB_URI,
        name: process.env.MONGODB_DATABASE || 'newlife',
        discordBotDb: process.env.DISCORD_BOT_DATABASE || 'discord_bot',
    },

    // RCON Configuration
    rcon: {
        host: process.env.RCON_HOST,
        port: parseInt(process.env.RCON_PORT) || 25575,
        password: process.env.RCON_PASSWORD,
        timeout: 5000,
        reconnectDelay: 10000,
    },

    // API Server
    api: {
        port: parseInt(process.env.API_PORT) || 3000,
        sessionSecret: process.env.SESSION_SECRET || 'newlife-session-secret-change-me',
    },

    // Feature Toggles
    features: {
        endItemsClear: process.env.END_ITEMS_CLEAR_ENABLED === 'true',
        instagramFeed: process.env.INSTAGRAM_ENABLED !== 'false',
        staffTracking: process.env.STAFF_TRACKING_ENABLED !== 'false',
    },

    // Embed Colors
    colors: {
        primary: parseInt((process.env.EMBED_COLOR || '#2B2D31').replace('#', ''), 16),
        success: 0x57F287,
        error: 0xED4245,
        warning: 0xFEE75C,
        info: 0x5865F2,
        ban: 0xFF0000,
        kick: 0xFFA500,
        mute: 0x808080,
    },
};
