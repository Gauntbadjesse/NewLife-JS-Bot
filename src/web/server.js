/**
 * Lightweight Web UI for NewLife Management
 * - Discord OAuth (passport-discord)
 * - Views for cases, users, and command logs
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const { connectDatabase } = require('../database/connection');
// Load models from either `database/models` or `models` depending on project layout
function loadModel(name) {
    try {
        return require(`../database/models/${name}`);
    } catch (e) {
        return require(`../models/${name}`);
    }
}

const Ban = loadModel('Ban');
const Warning = loadModel('Warning');
const Fine = loadModel('Fine');
const Application = loadModel('Application');
const LinkedAccount = loadModel('LinkedAccount');
const CommandLog = loadModel('CommandLog');
const ConsoleLog = loadModel('ConsoleLog');
const { getRoleIds } = require('../utils/permissions');
const MongoStore = require('connect-mongo');

const app = express();
const PORT = parseInt(process.env.WEB_PORT, 10) || 3000;

// Passport config
const SCOPES = ['identify', 'guilds'];
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    callbackURL: process.env.OAUTH_REDIRECT_URI,
    scope: SCOPES
}, (accessToken, refreshToken, profile, done) => {
    // profile contains Discord user info
    process.nextTick(() => done(null, profile));
}));

// Session store (use Mongo if configured)
const sessionOptions = {
    secret: process.env.SESSION_SECRET || 'change_this',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
};

if (process.env.SESSION_STORE_MONGO_URI) {
    sessionOptions.store = MongoStore.create({ mongoUrl: process.env.SESSION_STORE_MONGO_URI });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session(sessionOptions));
app.use(passport.initialize());
app.use(passport.session());

// Expose user and isAdmin flag to views
app.use(async (req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.isAdmin = false;
    try {
        if (req.user && req.user.id) {
            // If OWNER_ID env var is set to a Discord user id, treat that user as admin
            const ownerUserId = process.env.OWNER_ID || process.env.OWNER_USER_ID;
            if (ownerUserId && req.user.id === ownerUserId) {
                res.locals.isAdmin = true;
                return next();
            }
            const memberRoles = await getGuildMemberRoles(req.user.id);
            const ids = require('../utils/permissions').getRoleIds();
            const adminRoles = [ids.SUPERVISOR, ids.MANAGEMENT, ids.OWNER].filter(Boolean);
            res.locals.isAdmin = adminRoles.some(r => memberRoles.includes(r));
        }
    } catch (e) {
        console.error('Failed to compute isAdmin for views:', e);
        res.locals.isAdmin = false;
    }
    next();
});

// Helper to format durations in views
app.locals.formatDuration = function(durationMs, createdAt, expiresAt) {
    try {
        // Prefer a valid expiresAt value (relative remaining time)
        if (expiresAt) {
            const e = new Date(expiresAt).getTime();
            const now = Date.now();
            if (!isNaN(e) && e > now) {
                const diff = e - now;
                const days = Math.floor(diff / (24 * 60 * 60 * 1000));
                const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
                if (days > 0) return `${days} day${days>1?'s':''}`;
                if (hours > 0) return `${hours} hour${hours>1?'s':''}`;
                if (minutes > 0) return `${minutes} minute${minutes>1?'s':''}`;
                return `${Math.floor(diff/1000)} second${diff/1000>1?'s':''}`;
            }
        }

        // Fallback to explicit duration (total length)
        if (typeof durationMs === 'number' && !isNaN(durationMs)) {
            const ms = durationMs;
            const days = Math.floor(ms / (24 * 60 * 60 * 1000));
            const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
            if (days > 0) return `${days} day${days>1?'s':''}`;
            if (hours > 0) return `${hours} hour${hours>1?'s':''}`;
            if (minutes > 0) return `${minutes} minute${minutes>1?'s':''}`;
            return `${Math.floor(ms/1000)} second${ms/1000>1?'s':''}`;
        }

        return 'Permanent';
    } catch (e) {
        return 'Unknown';
    }
};

// Ensure DB connection
connectDatabase().catch(err => {
    console.error('Web UI DB connection failed:', err);
    process.exit(1);
});

function ensureAuth(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    res.redirect('/login');
}

async function getGuildMemberRoles(userId) {
    try {
        const guildId = process.env.GUILD_ID;
        if (!guildId) return [];
        const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`;
        const res = await fetch(url, { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.roles) ? data.roles : (data.roles || []);
    } catch (e) {
        console.error('Failed to fetch guild member roles:', e);
        return [];
    }
}

    // Helpers to modify guild member via Discord REST API (uses bot token)
    async function modifyMemberNickname(userId, nick) {
        try {
            const guildId = process.env.GUILD_ID;
            if (!guildId) return false;
            let fetcher = globalThis.fetch;
            if (!fetcher) fetcher = require('node-fetch');
            const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`;
            const res = await fetcher(url, {
                method: 'PATCH',
                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ nick })
            });
            return res.ok;
        } catch (e) { console.error('modifyMemberNickname error', e); return false; }
    }

    async function addMemberRole(userId, roleId) {
        try {
            const guildId = process.env.GUILD_ID;
            if (!guildId) return false;
            let fetcher = globalThis.fetch;
            if (!fetcher) fetcher = require('node-fetch');
            const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`;
            const res = await fetcher(url, {
                method: 'PUT',
                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
            });
            return res.ok;
        } catch (e) { console.error('addMemberRole error', e); return false; }
    }

    async function removeMemberRole(userId, roleId) {
        try {
            const guildId = process.env.GUILD_ID;
            if (!guildId) return false;
            let fetcher = globalThis.fetch;
            if (!fetcher) fetcher = require('node-fetch');
            const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`;
            const res = await fetcher(url, {
                method: 'DELETE',
                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
            });
            return res.ok;
        } catch (e) { console.error('removeMemberRole error', e); return false; }
    }

    // Send a DM to a user via the bot
    async function sendBotDM(userId, embed) {
        try {
            let fetcher = globalThis.fetch;
            if (!fetcher) fetcher = require('node-fetch');

            // Create DM channel
            const createRes = await fetcher('https://discord.com/api/v10/users/@me/channels', {
                method: 'POST',
                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipient_id: String(userId) })
            });
            if (!createRes.ok) return false;
            const channel = await createRes.json();

            // Send message with embed
            const msgRes = await fetcher(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
                method: 'POST',
                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] })
            });

            return msgRes.ok;
        } catch (e) {
            console.error('sendBotDM error', e);
            return false;
        }
    }

    // Lookup Minecraft profile via mcprofile.io (returns uuid for java, fuuid for bedrock)
    async function lookupMcProfile(platform, username) {
        try {
            let fetcher = globalThis.fetch;
            if (!fetcher) fetcher = require('node-fetch');
            const base = 'https://mcprofile.io/api/v1';
            const url = `${base}/${platform}/username/${encodeURIComponent(username)}`;
            const res = await fetcher(url);
            if (!res.ok) throw new Error(`Lookup failed ${res.status}`);
            const data = await res.json();
            
            // For bedrock, prefer fuuid; for java, prefer uuid
            let id = null;
            if (platform === 'bedrock') {
                id = data.fuuid || data.floodgateuid || data.id || data.uuid;
                if (!id && data.data) id = data.data.fuuid || data.data.floodgateuid || data.data.id;
            } else {
                id = data.uuid || data.id;
                if (!id && data.data) id = data.data.uuid || data.data.id;
            }
            if (!id && Array.isArray(data) && data[0]) {
                id = platform === 'bedrock' 
                    ? (data[0].fuuid || data[0].id || data[0].uuid)
                    : (data[0].uuid || data[0].id);
            }
            if (!id) throw new Error('No id in response');
            return id;
        } catch (e) {
            throw e;
        }
    }

async function ensureAdmin(req, res, next) {
    // Allow single-owner override via OWNER_ID env var
    try {
        const ownerUserId = process.env.OWNER_ID || process.env.OWNER_USER_ID;
        if (ownerUserId && req.user && req.user.id === ownerUserId) return next();
    } catch (e) {}

    const ids = getRoleIds();
    const memberRoles = await getGuildMemberRoles(req.user.id);
    const adminRoles = [ids.SUPERVISOR, ids.MANAGEMENT, ids.OWNER].filter(Boolean);
    const has = adminRoles.some(r => memberRoles.includes(r));
    if (has) return next();
    return res.status(403).send('Forbidden - Admins only');
}

// Send RCON command helper
async function sendRconCommand(cmd) {
    try {
        const { Rcon } = require('rcon-client');
        const host = process.env.RCON_HOST;
        const port = Number(process.env.RCON_PORT || 25575);
        const password = process.env.RCON_PASSWORD;
        if (!host || !port || !password) throw new Error('RCON not configured');
        const rcon = await Rcon.connect({ host, port, password });
        try {
            const res = await rcon.send(cmd);
            await rcon.end();
            return res;
        } catch (e) {
            try { await rcon.end(); } catch (e2) {}
            throw e;
        }
    } catch (e) {
        throw e;
    }
}

// Convert milliseconds to a simple rcon duration string like '3d' or '4h' or '30m'
function msToDurationStr(ms) {
    if (!ms || ms <= 0) return '0s';
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    if (days > 0) return `${days}d`;
    const hours = Math.floor(ms / (60 * 60 * 1000));
    if (hours > 0) return `${hours}h`;
    const minutes = Math.floor(ms / (60 * 1000));
    if (minutes > 0) return `${minutes}m`;
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
}

async function ensureStaffOrAdmin(req, res, next) {
    const staffRole = process.env.STAFF_TEAM;
    const ids = getRoleIds();
    const memberRoles = await getGuildMemberRoles(req.user.id);
    const adminRoles = [ids.SUPERVISOR, ids.MANAGEMENT, ids.OWNER].filter(Boolean);
    const isAdmin = adminRoles.some(r => memberRoles.includes(r));
    const isStaff = staffRole && memberRoles.includes(staffRole);
    if (isAdmin || isStaff) return next();
    return res.status(403).send('Forbidden - Staff only');
}

app.get('/', ensureAuth, async (req, res) => {
    try {
        const warnings = await Warning.countDocuments();
        const activeWarnings = await Warning.countDocuments({ active: true });
        const bans = await Ban.countDocuments();
        const activeBans = await Ban.countDocuments({ active: true });
        const commands = await CommandLog.countDocuments();
        res.render('index', { user: req.user, stats: { warnings, activeWarnings, bans, activeBans, commands } });
    } catch (e) {
        console.error(e);
        res.render('index', { user: req.user, stats: {} });
    }
});

app.get('/login', (req, res) => {
    res.render('login', { user: req.user || null, baseUrl: process.env.WEB_BASE_URL || `http://localhost:${PORT}` });
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/login' }), (req, res) => {
    // After successful OAuth, redirect to original destination if present
    try {
        const returnTo = req.session && req.session.returnTo;
        if (returnTo) {
            delete req.session.returnTo;
            return res.redirect(returnTo);
        }
    } catch (e) {
        // ignore
    }
    res.redirect('/');
});

app.get('/logout', (req, res) => {
    req.logout(() => {});
    res.redirect('/login');
});

// Link Minecraft account (user must be logged in via Discord)
// This is now optional - primary linking is done via /linkaccount slash command
app.get('/link-mc', async (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        try {
            if (req.session) req.session.returnTo = '/link-mc';
        } catch (e) { /* ignore */ }
        return res.redirect('/auth/discord');
    }

    // Get user's linked accounts
    const linkedAccounts = await LinkedAccount.find({ discordId: String(req.user.id) }).sort({ linkedAt: -1 });
    res.render('link', { user: req.user, success: null, error: null, linkedAccounts });
});

app.post('/link-mc', ensureAuth, async (req, res) => {
    try {
        const username = (req.body.username || '').trim();
        const platform = (req.body.platform || 'java').toLowerCase();
        
        if (!username) {
            const linkedAccounts = await LinkedAccount.find({ discordId: String(req.user.id) });
            return res.render('link', { user: req.user, success: null, error: 'Please provide a Minecraft username.', linkedAccounts });
        }

        if (platform !== 'java' && platform !== 'bedrock') {
            const linkedAccounts = await LinkedAccount.find({ discordId: String(req.user.id) });
            return res.render('link', { user: req.user, success: null, error: 'Invalid platform. Choose java or bedrock.', linkedAccounts });
        }

        // Resolve MC profile
        let uuid = null;
        try {
            uuid = await lookupMcProfile(platform, username);
        } catch (e) {
            const linkedAccounts = await LinkedAccount.find({ discordId: String(req.user.id) });
            return res.render('link', { user: req.user, success: null, error: 'Failed to resolve Minecraft username. Please verify spelling and try again.', linkedAccounts });
        }

        // Check if already linked to this user
        const existing = await LinkedAccount.findOne({ discordId: String(req.user.id), uuid });
        if (existing) {
            existing.minecraftUsername = username;
            existing.platform = platform;
            existing.linkedAt = new Date();
            await existing.save();
        } else {
            // Check if linked to someone else
            const otherLink = await LinkedAccount.findOne({ uuid });
            if (otherLink) {
                const linkedAccounts = await LinkedAccount.find({ discordId: String(req.user.id) });
                return res.render('link', { user: req.user, success: null, error: 'This Minecraft account is already linked to another Discord user.', linkedAccounts });
            }

            const count = await LinkedAccount.countDocuments({ discordId: String(req.user.id) });
            await new LinkedAccount({ 
                discordId: String(req.user.id), 
                minecraftUsername: username, 
                uuid, 
                platform, 
                linkedAt: new Date(),
                primary: count === 0,
                verified: false
            }).save();
        }

        const linkedAccounts = await LinkedAccount.find({ discordId: String(req.user.id) }).sort({ linkedAt: -1 });
        return res.render('link', { user: req.user, success: `Successfully linked ${username} (${platform})!`, error: null, linkedAccounts });
    } catch (e) {
        console.error('Link MC error:', e);
        const linkedAccounts = await LinkedAccount.find({ discordId: String(req.user.id) });
        return res.render('link', { user: req.user, success: null, error: 'An internal error occurred while linking your account.', linkedAccounts });
    }
});

// Staff dashboard (read-only for staff, full for admins)
app.get('/dashboard', ensureAuth, ensureStaffOrAdmin, async (req, res) => {
    try {
        const warnings = await Warning.countDocuments();
        const commands = await CommandLog.countDocuments();
        res.render('dashboard', { user: req.user, stats: { warnings, commands } });
    } catch (e) {
        console.error(e);
        res.render('dashboard', { user: req.user, stats: {} });
    }
});

// Admin console (Supervisor/Management/Owner only)
app.get('/admin', ensureAuth, ensureAdmin, async (req, res) => {
    const appPage = Math.max(1, parseInt(req.query.apppage || '1', 10));
    const linkedPage = Math.max(1, parseInt(req.query.linkedpage || '1', 10));
    const perPage = 20;
    try {
        const [applications, totalApps] = await Promise.all([
            Application.find().sort({ createdAt: -1 }).skip((appPage-1)*perPage).limit(perPage),
            Application.countDocuments()
        ]);
        const [linked, totalLinked] = await Promise.all([
            LinkedAccount.find().sort({ linkedAt: -1 }).skip((linkedPage-1)*perPage).limit(perPage),
            LinkedAccount.countDocuments()
        ]);

        const appPages = Math.max(1, Math.ceil(totalApps / perPage));
        const linkedPages = Math.max(1, Math.ceil(totalLinked / perPage));

        res.render('admin', { user: req.user, applications, linked, pagination: { app: { page: appPage, pages: appPages }, linked: { page: linkedPage, pages: linkedPages } } });
    } catch (e) {
        console.error(e);
        res.render('admin', { user: req.user, applications: [], linked: [], pagination: { app: { page:1, pages:1 }, linked: { page:1, pages:1 } } });
    }
});

// Admin: edit ban (form)
app.get('/admin/ban/:id/edit', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const ban = await Ban.findById(req.params.id);
        if (!ban) return res.status(404).send('Not found');
        res.render('admin_edit_ban', { user: req.user, ban });
    } catch (e) {
        console.error('Admin edit ban view error:', e);
        res.status(500).send('Error');
    }
});

// Admin: apply time edit to ban (add/remove/set/permanent)
app.post('/admin/ban/:id/edit', ensureAuth, ensureAdmin, express.urlencoded({ extended: true }), async (req, res) => {
    try {
        const ban = await Ban.findById(req.params.id);
        if (!ban) return res.status(404).send('Not found');

        const action = req.body.action;
        const amount = parseInt(req.body.amount || '0', 10) || 0;
        const unit = req.body.unit || 'm'; // m/h/d
        const reason = (req.body.reason || '').trim();

        // Require a reason when making edits via the admin UI
        if (!reason) return res.status(400).send('A reason is required to edit a ban.');

        const unitMs = unit === 'd' ? 24 * 60 * 60 * 1000 : unit === 'h' ? 60 * 60 * 1000 : 60 * 1000;
        const delta = amount * unitMs;
        const now = Date.now();

        let newExpires = null;

        if (action === 'make_perm') {
            newExpires = null;
        } else if (action === 'set') {
            // Set remaining time to amount/unit from now
            newExpires = new Date(now + delta);
        } else if (action === 'add') {
            if (ban.expiresAt && new Date(ban.expiresAt).getTime() > now) {
                newExpires = new Date(new Date(ban.expiresAt).getTime() + delta);
            } else {
                newExpires = new Date(now + delta);
            }
        } else if (action === 'remove') {
            if (ban.expiresAt && new Date(ban.expiresAt).getTime() > now) {
                const candidate = new Date(new Date(ban.expiresAt).getTime() - delta);
                if (candidate.getTime() <= now) {
                    // Explicit unban: mark as removed
                    newExpires = null;
                    ban.active = false;
                    ban.removedBy = `${req.user.username || req.user.id}`;
                    ban.removedAt = new Date();
                } else {
                    newExpires = candidate;
                }
            } else {
                // nothing to remove, keep permanent
                newExpires = null;
            }
        } else {
            return res.status(400).send('Unknown action');
        }

        // Update DB fields
        if (newExpires) {
            ban.expiresAt = newExpires;
            ban.duration = new Date(ban.expiresAt).getTime() - new Date(ban.createdAt).getTime();
        } else {
            ban.expiresAt = null;
            ban.duration = null;
        }

        await ban.save();

        // Apply to game via RCON if possible
        try {
            if (!ban.active) {
                // explicit unban
                try {
                    await sendRconCommand(`banspaper:unban ${ban.playerName}`);
                } catch (e) {
                    try { await sendRconCommand(`pardon ${ban.playerName}`); } catch (e2) { console.warn('RCON unban failed', e2); }
                }
            } else {
                // rcon command wants a duration relative to now (or 'perm')
                let rconArg = 'perm';
                if (ban.expiresAt) {
                    const remaining = new Date(ban.expiresAt).getTime() - now;
                    rconArg = msToDurationStr(remaining);
                }
                const cmd = `banspaper:ban ${ban.playerName} ${rconArg}`;
                await sendRconCommand(cmd).catch(e => { console.warn('RCON ban adjust failed', e); });
            }
        } catch (e) {
            console.error('RCON adjust error:', e);
        }

        // Audit log: record the edit action using CommandLog
        try {
            await CommandLog.create({
                command: 'ban_edit',
                subcommand: action,
                fullCommand: `ban_edit action:${action} amount:${amount} unit:${unit} reason:${(req.body.reason||'').replace(/`/g,'') } target:${ban._id}`,
                userId: req.user.id || (req.user && req.user.id) || 'web',
                username: (req.user && (req.user.username ? `${req.user.username}#${req.user.discriminator}` : req.user.tag)) || 'web',
                displayName: req.user.displayName || null,
                guildId: process.env.GUILD_ID || 'unknown',
                guildName: null,
                channelId: 'web-ui',
                channelName: 'web-ui',
                arguments: { action, amount, unit, reason: (req.body.reason||''), banId: ban._id },
                targetUserId: ban.uuid || null,
                targetUsername: ban.playerName || null,
                success: true,
                errorMessage: null,
                responseTime: 0,
                executedAt: new Date()
            });
        } catch (e) {
            console.error('Failed to write ban edit audit log:', e);
        }

        return res.redirect('/admin');
    } catch (e) {
        console.error('Admin edit ban error:', e);
        res.status(500).send('Error');
    }
});

// Admin: view single application
app.get('/admin/application/:id', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const a = await Application.findById(req.params.id);
        if (!a) return res.status(404).send('Not found');
        res.render('application', { user: req.user, app: a });
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

// Admin: unlink a linked account
app.get('/admin/unlink/:id', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        await LinkedAccount.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

// Admin: approve application (mark processed)
app.get('/admin/approve/:id', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const app = await Application.findById(req.params.id);
        if (!app) return res.status(404).send('Not found');
        if (app.processed) return res.redirect('/admin');

        // Since whitelisting is performed via Discord (/whitelist add), the web UI should
        // only persist the application data and mark the application processed.
        // Lookup profile to obtain uuid/fuuid for storage (best-effort)
        let uuid = null;
        try {
            uuid = await lookupMcProfile(app.platform, app.playerName);
        } catch (e) {
            console.warn('Profile lookup (storage-only) failed:', e.message || e);
        }

        // Persist linked account if not exists (do not perform RCON/role changes here)
        const existing = await LinkedAccount.findOne({ discordId: app.discordId });
        if (!existing) {
            const linked = new LinkedAccount({ discordId: app.discordId, minecraftUsername: app.playerName, uuid, platform: app.platform, linkedAt: new Date() });
            await linked.save();
        }

        // Mark as processed
        app.processed = true;
        await app.save();

        return res.redirect('/admin');
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

// Admin: deny application (mark processed)
app.get('/admin/deny/:id', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        await Application.findByIdAndUpdate(req.params.id, { processed: true });
        res.redirect('/admin');
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

// Cases listing
app.get('/cases', ensureAuth, async (req, res) => {
    const page = parseInt(req.query.page || '1', 10);
    const perPage = 25;
    try {
        const warnings = await Warning.find().sort({ createdAt: -1 }).skip((page-1)*perPage).limit(perPage);
        const activeBans = await Ban.find({ active: true }).sort({ createdAt: -1 }).limit(200);
        const inactiveBans = await Ban.find({ active: false }).sort({ createdAt: -1 }).limit(200);
        const unpaidFines = await Fine.find({ paid: false }).sort({ createdAt: -1 }).limit(200);
        const paidFines = await Fine.find({ paid: true }).sort({ createdAt: -1 }).limit(200);
        const applications = await Application.find().sort({ createdAt: -1 }).limit(200);
        const linked = await LinkedAccount.find().sort({ linkedAt: -1 }).limit(200);
        res.render('cases', { user: req.user, warnings, activeBans, inactiveBans, unpaidFines, paidFines, applications, linked, page });
    } catch (e) {
        console.error(e);
        res.render('cases', { user: req.user, warnings: [], activeBans: [], inactiveBans: [], unpaidFines: [], paidFines: [], applications: [], linked: [], page });
    }
});

// User lookup
app.get('/user/:id', ensureAuth, async (req, res) => {
    const id = req.params.id;
    try {
        const warnings = await Warning.find({ $or: [{ uuid: id }, { playerName: { $regex: new RegExp(`^${id}$`, 'i') } }] }).sort({ createdAt: -1 });
        const bans = await Ban.find({ $or: [{ uuid: id }, { playerName: { $regex: new RegExp(`^${id}$`, 'i') } }] }).sort({ createdAt: -1 });
        const fines = await Fine.find({ $or: [{ uuid: id }, { playerName: { $regex: new RegExp(`^${id}$`, 'i') } }] }).sort({ createdAt: -1 });
        res.render('user', { user: req.user, target: id, warnings, bans, fines });
    } catch (e) {
        console.error(e);
        res.render('user', { user: req.user, target: id, warnings: [], bans: [], fines: [] });
    }
});

// Commands log
app.get('/commands', ensureAuth, async (req, res) => {
    const items = await CommandLog.find().sort({ createdAt: -1 }).limit(200);
    res.render('commands', { user: req.user, items });
});

// Simple API JSON endpoints (for integration)
app.get('/api/cases/recent', ensureAuth, async (req, res) => {
    const warnings = await Warning.find().sort({ createdAt: -1 }).limit(100);
    const bans = await Ban.find().sort({ createdAt: -1 }).limit(100);
    res.json({ warnings, bans });
});

// ============================================
// AUTOMOD CONFIGURATION ROUTES
// ============================================
const AutomodConfig = loadModel('AutomodConfig');

app.get('/admin/automod', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        let config = await AutomodConfig.findOne({ guildId });
        if (!config) {
            config = new AutomodConfig({ guildId });
            await config.save();
        }
        res.render('automod', { user: req.user, config });
    } catch (e) {
        console.error(e);
        res.status(500).send('Error loading automod config');
    }
});

app.post('/admin/automod/save', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        let config = await AutomodConfig.findOne({ guildId });
        if (!config) config = new AutomodConfig({ guildId });

        // Parse form data
        config.enabled = req.body.enabled === 'on';
        config.logChannelId = req.body.logChannelId || null;
        config.exemptRoles = (req.body.exemptRoles || '').split(',').map(s => s.trim()).filter(Boolean);
        config.exemptChannels = (req.body.exemptChannels || '').split(',').map(s => s.trim()).filter(Boolean);

        // Word filter
        config.wordFilterEnabled = req.body.wordFilterEnabled === 'on';
        config.bannedWords = (req.body.bannedWords || '').split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
        config.wordFilterAction = req.body.wordFilterAction || 'delete';
        config.wordFilterMuteDuration = parseInt(req.body.wordFilterMuteDuration) || 300000;

        // Spam detection
        config.spamDetectionEnabled = req.body.spamDetectionEnabled === 'on';
        config.spamThreshold = parseInt(req.body.spamThreshold) || 5;
        config.spamTimeWindow = parseInt(req.body.spamTimeWindow) || 5000;
        config.spamAction = req.body.spamAction || 'mute';
        config.spamMuteDuration = parseInt(req.body.spamMuteDuration) || 300000;

        // Link filter
        config.linkFilterEnabled = req.body.linkFilterEnabled === 'on';
        config.allowedDomains = (req.body.allowedDomains || '').split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
        config.linkFilterAction = req.body.linkFilterAction || 'delete';

        // Caps filter
        config.capsFilterEnabled = req.body.capsFilterEnabled === 'on';
        config.capsThreshold = parseInt(req.body.capsThreshold) || 70;
        config.capsMinLength = parseInt(req.body.capsMinLength) || 10;
        config.capsAction = req.body.capsAction || 'delete';

        // Mention spam
        config.mentionSpamEnabled = req.body.mentionSpamEnabled === 'on';
        config.mentionThreshold = parseInt(req.body.mentionThreshold) || 5;
        config.mentionAction = req.body.mentionAction || 'mute';

        config.updatedBy = req.user.username || req.user.id;
        config.updatedAt = new Date();

        await config.save();
        res.redirect('/admin/automod');
    } catch (e) {
        console.error(e);
        res.status(500).send('Error saving config');
    }
});

// ============================================
// CUSTOM EMBEDS ROUTES
// ============================================
const CustomEmbed = loadModel('CustomEmbed');

app.get('/admin/embeds', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        const embeds = await CustomEmbed.find({ guildId }).sort({ createdAt: -1 });
        res.render('embeds', { user: req.user, embeds });
    } catch (e) {
        console.error(e);
        res.render('embeds', { user: req.user, embeds: [] });
    }
});

app.post('/admin/embeds/create', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        const embed = new CustomEmbed({
            guildId,
            name: (req.body.name || '').toLowerCase().replace(/\s+/g, '-'),
            title: req.body.title,
            description: req.body.description || null,
            color: req.body.color || '#3b82f6',
            footer: req.body.footer || null,
            image: req.body.image || null,
            buttons: [],
            createdBy: req.user.id
        });
        await embed.save();
        res.redirect('/admin/embeds/' + embed._id);
    } catch (e) {
        console.error(e);
        res.redirect('/admin/embeds');
    }
});

app.get('/admin/embeds/:id', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const embed = await CustomEmbed.findById(req.params.id);
        if (!embed) return res.status(404).send('Not found');
        res.render('embed_edit', { user: req.user, embed });
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

app.post('/admin/embeds/:id/update', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const embed = await CustomEmbed.findById(req.params.id);
        if (!embed) return res.status(404).send('Not found');
        
        embed.title = req.body.title;
        embed.description = req.body.description || null;
        embed.color = req.body.color || '#3b82f6';
        embed.footer = req.body.footer || null;
        embed.image = req.body.image || null;
        
        await embed.save();
        res.redirect('/admin/embeds/' + embed._id);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

app.post('/admin/embeds/:id/addbutton', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const embed = await CustomEmbed.findById(req.params.id);
        if (!embed) return res.status(404).send('Not found');
        
        embed.buttons.push({
            label: req.body.label,
            style: req.body.style || 'primary',
            emoji: req.body.emoji || null,
            action: req.body.action,
            customId: req.body.action !== 'url' ? `ce_${req.body.action}_${Date.now()}` : null,
            url: req.body.action === 'url' ? req.body.value : null
        });
        
        await embed.save();
        res.redirect('/admin/embeds/' + embed._id);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

app.post('/admin/embeds/:id/removebutton', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const embed = await CustomEmbed.findById(req.params.id);
        if (!embed) return res.status(404).send('Not found');
        
        const index = parseInt(req.body.index);
        if (index >= 0 && index < embed.buttons.length) {
            embed.buttons.splice(index, 1);
            await embed.save();
        }
        
        res.redirect('/admin/embeds/' + embed._id);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

app.post('/admin/embeds/:id/delete', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        await CustomEmbed.deleteOne({ _id: req.params.id });
        res.redirect('/admin/embeds');
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

// ============================================
// REACTION ROLES ROUTES
// ============================================
const ReactionRole = loadModel('ReactionRole');

app.get('/admin/reactionroles', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        const roles = await ReactionRole.find({ guildId });
        
        // Group by messageId
        const messages = {};
        roles.forEach(r => {
            if (!messages[r.messageId]) messages[r.messageId] = [];
            messages[r.messageId].push(r);
        });
        
        res.render('reactionroles', { user: req.user, messages });
    } catch (e) {
        console.error(e);
        res.render('reactionroles', { user: req.user, messages: {} });
    }
});

app.post('/admin/reactionroles/add', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        const rr = new ReactionRole({
            guildId,
            messageId: req.body.messageId,
            channelId: 'unknown', // Would need bot to get actual channel
            emoji: req.body.emoji,
            roleId: req.body.roleId,
            description: req.body.label || null
        });
        await rr.save();
        res.redirect('/admin/reactionroles');
    } catch (e) {
        console.error(e);
        res.redirect('/admin/reactionroles');
    }
});

app.post('/admin/reactionroles/remove', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        await ReactionRole.deleteOne({ messageId: req.body.messageId, roleId: req.body.roleId });
        res.redirect('/admin/reactionroles');
    } catch (e) {
        console.error(e);
        res.redirect('/admin/reactionroles');
    }
});

app.post('/admin/reactionroles/delete', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        await ReactionRole.deleteMany({ messageId: req.body.messageId });
        res.redirect('/admin/reactionroles');
    } catch (e) {
        console.error(e);
        res.redirect('/admin/reactionroles');
    }
});

// ============================================
// AUDIT LOG ROUTES
// ============================================
const AuditLog = loadModel('AuditLog');

app.get('/admin/auditlog', ensureAuth, ensureAdmin, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        const page = parseInt(req.query.page || '1');
        const perPage = 50;
        const category = req.query.category || 'all';
        
        const query = { guildId };
        if (category !== 'all') query.category = category;
        
        const total = await AuditLog.countDocuments(query);
        const logs = await AuditLog.find(query).sort({ createdAt: -1 }).skip((page-1)*perPage).limit(perPage);
        
        res.render('auditlog', { 
            user: req.user, 
            logs, 
            page, 
            totalPages: Math.ceil(total / perPage),
            category 
        });
    } catch (e) {
        console.error(e);
        res.render('auditlog', { user: req.user, logs: [], page: 1, totalPages: 1, category: 'all' });
    }
});

app.listen(PORT, () => console.log(`Web UI listening on ${PORT}`));
