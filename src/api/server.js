/**
 * API Server
 * Provides REST endpoints for Velocity proxy plugin communication
 * Used for account linking verification, ban checks, and player authentication
 */

const express = require('express');
const LinkedAccount = require('../database/models/LinkedAccount');
const ServerBan = require('../database/models/ServerBan');
const Kick = require('../database/models/Kick');
const Warning = require('../database/models/Warning');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================================
// PASSWORD PROTECTED WEB VIEWER ROUTES
// =====================================================

const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || 'Staff26';

const viewerStyles = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,sans-serif;background:#0f0f1a;color:#e2e8f0;min-height:100vh}
.header{background:#1a1a2e;padding:16px 24px;border-bottom:1px solid #2d2d44;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.logo{font-size:1.3em;font-weight:700;color:#10b981}
.nav{display:flex;gap:6px}
.nav a{color:#94a3b8;text-decoration:none;padding:8px 18px;border-radius:6px;font-weight:500;font-size:.9em;transition:.2s}
.nav a:hover{background:rgba(255,255,255,.05);color:#e2e8f0}
.nav a.active{background:#10b981;color:#0f0f1a}
.logout{padding:6px 14px;background:0 0;border:1px solid #64748b;color:#94a3b8;text-decoration:none;border-radius:5px;font-size:.8em}
.logout:hover{border-color:#ef4444;color:#ef4444}
.main{padding:24px;max-width:1300px;margin:0 auto}
.title{font-size:1.5em;font-weight:600;margin-bottom:20px;color:#f1f5f9}
.stats{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.stat{background:#1a1a2e;padding:14px 20px;border-radius:8px;border:1px solid #2d2d44}
.stat .num{font-size:1.4em;font-weight:700;color:#10b981}
.stat .lbl{font-size:.7em;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:.5px}
.filters{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.search{flex:1;min-width:220px;padding:10px 14px;border:1px solid #2d2d44;border-radius:6px;background:#1a1a2e;color:#e2e8f0;font-size:.9em}
.search:focus{outline:none;border-color:#10b981}
.search::placeholder{color:#64748b}
select{padding:10px 14px;border:1px solid #2d2d44;border-radius:6px;background:#1a1a2e;color:#e2e8f0;font-size:.9em;cursor:pointer}
select:focus{outline:none;border-color:#10b981}
.btn{padding:10px 18px;border:none;border-radius:6px;font-weight:600;font-size:.85em;cursor:pointer}
.btn-go{background:#10b981;color:#0f0f1a}
.btn-go:hover{background:#059669}
.btn-clr{background:#2d2d44;color:#94a3b8;text-decoration:none}
.btn-clr:hover{background:#3f3f5a}
.tbl{background:#1a1a2e;border-radius:10px;border:1px solid #2d2d44;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{padding:12px 14px;text-align:left;background:#222233;color:#64748b;font-weight:600;font-size:.7em;text-transform:uppercase;letter-spacing:.5px}
td{padding:12px 14px;border-top:1px solid #2d2d44;font-size:.85em;color:#cbd5e1}
tr:hover{background:rgba(255,255,255,.02)}
.tag{display:inline-block;padding:3px 8px;border-radius:4px;font-size:.7em;font-weight:600}
.tag-r{background:rgba(239,68,68,.12);color:#f87171}
.tag-g{background:rgba(100,116,139,.12);color:#94a3b8}
.tag-o{background:rgba(139,0,0,.15);color:#fca5a5}
.pages{display:flex;justify-content:center;gap:6px;margin-top:20px}
.pages a,.pages span{padding:8px 14px;border-radius:5px;text-decoration:none;font-size:.85em}
.pages a{background:#1a1a2e;color:#10b981;border:1px solid #2d2d44}
.pages a:hover{background:#2d2d44}
.pages span{color:#64748b}
.empty{text-align:center;padding:50px 20px;color:#64748b}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.login-box{width:100%;max-width:340px;background:#1a1a2e;padding:36px;border-radius:12px;border:1px solid #2d2d44}
.login-box h2{text-align:center;margin-bottom:24px;color:#10b981;font-size:1.3em}
.login-box input{width:100%;padding:12px 14px;margin-bottom:14px;border:1px solid #2d2d44;border-radius:6px;background:#222233;color:#e2e8f0;font-size:1em}
.login-box input:focus{outline:none;border-color:#10b981}
.login-box button{width:100%;padding:12px;background:#10b981;color:#0f0f1a;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:1em}
.login-box .err{color:#f87171;text-align:center;margin-bottom:12px;font-size:.9em}
@media(max-width:768px){.header{flex-wrap:wrap;gap:12px;padding:12px}.nav{width:100%;justify-content:center}.main{padding:16px 12px}th,td{padding:8px 6px;font-size:.75em}.hide{display:none}.filters{flex-direction:column}.search,select{width:100%}}
`;

function checkViewerAuth(req) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/viewer_auth=([^;]+)/);
    return match && match[1] === VIEWER_PASSWORD;
}

function loginPage(error = '') {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Staff Login</title><style>${viewerStyles}</style></head>
<body><div class="login-wrap"><div class="login-box"><h2>Staff Login</h2>${error ? `<p class="err">${error}</p>` : ''}<form method="POST" action="/viewer/login"><input type="password" name="password" placeholder="Password" required autofocus><button type="submit">Login</button></form></div></div></body></html>`;
}

app.get('/viewer/login', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(loginPage());
});

app.post('/viewer/login', (req, res) => {
    if (req.body.password === VIEWER_PASSWORD) {
        res.setHeader('Set-Cookie', `viewer_auth=${VIEWER_PASSWORD}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400`);
        res.redirect('/viewer/bans');
    } else {
        res.setHeader('Content-Type', 'text/html');
        res.send(loginPage('Invalid password'));
    }
});

app.get('/viewer/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'viewer_auth=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0');
    res.redirect('/viewer/login');
});

function viewerAuth(req, res, next) {
    if (!checkViewerAuth(req)) return res.redirect('/viewer/login');
    next();
}

function getHeader(active) {
    return `<div class="header">
    <div class="logo">NewLife SMP</div>
    <nav class="nav">
        <a href="/viewer/bans" class="${active === 'bans' ? 'active' : ''}">Bans</a>
        <a href="/viewer/kicks" class="${active === 'kicks' ? 'active' : ''}">Kicks</a>
        <a href="/viewer/warnings" class="${active === 'warnings' ? 'active' : ''}">Warnings</a>
    </nav>
    <a href="/viewer/logout" class="logout">Logout</a>
</div>`;
}

// Bans Page
app.get('/viewer/bans', viewerAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';
        
        let query = {};
        if (status === 'active') query.active = true;
        else if (status === 'expired') query.active = false;
        
        if (search) {
            const sq = { $or: [
                { primaryUsername: { $regex: search, $options: 'i' } },
                { reason: { $regex: search, $options: 'i' } },
                { staffTag: { $regex: search, $options: 'i' } },
                { discordTag: { $regex: search, $options: 'i' } }
            ]};
            query = Object.keys(query).length ? { $and: [query, sq] } : sq;
        }
        
        const [total, activeCt, permCt, bans] = await Promise.all([
            ServerBan.countDocuments(query),
            ServerBan.countDocuments({ active: true }),
            ServerBan.countDocuments({ active: true, isPermanent: true }),
            ServerBan.find(query).sort({ bannedAt: -1 }).skip(skip).limit(limit)
        ]);
        
        const totalPages = Math.ceil(total / limit);
        let rows = bans.map(b => `<tr>
            <td>#${b.caseNumber || '—'}</td>
            <td>${b.primaryUsername}</td>
            <td class="hide">${b.discordTag || '—'}</td>
            <td>${b.reason.substring(0, 45)}${b.reason.length > 45 ? '...' : ''}</td>
            <td>${b.isPermanent ? '<span class="tag tag-o">Perm</span>' : (b.duration || '—')}</td>
            <td>${b.active ? '<span class="tag tag-r">Active</span>' : '<span class="tag tag-g">Expired</span>'}</td>
            <td class="hide">${b.staffTag || '—'}</td>
            <td class="hide">${new Date(b.bannedAt).toLocaleDateString()}</td>
        </tr>`).join('');
        if (!rows) rows = '<tr><td colspan="8" class="empty">No bans found</td></tr>';
        
        let pag = '';
        if (totalPages > 1) {
            const url = (p) => `/viewer/bans?page=${p}&search=${encodeURIComponent(search)}&status=${status}`;
            if (page > 1) pag += `<a href="${url(page - 1)}">← Prev</a>`;
            pag += `<span>Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) pag += `<a href="${url(page + 1)}">Next →</a>`;
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Bans</title><style>${viewerStyles}</style></head><body>
${getHeader('bans')}
<div class="main">
    <h1 class="title">Bans</h1>
    <div class="stats">
        <div class="stat"><div class="num">${total}</div><div class="lbl">Total</div></div>
        <div class="stat"><div class="num">${activeCt}</div><div class="lbl">Active</div></div>
        <div class="stat"><div class="num">${permCt}</div><div class="lbl">Permanent</div></div>
        <div class="stat"><div class="num">${total - activeCt}</div><div class="lbl">Expired</div></div>
    </div>
    <form class="filters" method="GET">
        <input class="search" type="text" name="search" placeholder="Search..." value="${search}">
        <select name="status"><option value="">All</option><option value="active" ${status === 'active' ? 'selected' : ''}>Active</option><option value="expired" ${status === 'expired' ? 'selected' : ''}>Expired</option></select>
        <button class="btn btn-go" type="submit">Search</button>
        <a class="btn btn-clr" href="/viewer/bans">Clear</a>
    </form>
    <div class="tbl"><table>
        <thead><tr><th>Case</th><th>Player</th><th class="hide">Discord</th><th>Reason</th><th>Duration</th><th>Status</th><th class="hide">Staff</th><th class="hide">Date</th></tr></thead>
        <tbody>${rows}</tbody>
    </table></div>
    <div class="pages">${pag}</div>
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

// Kicks Page
app.get('/viewer/kicks', viewerAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        
        let query = {};
        if (search) {
            query = { $or: [
                { primaryUsername: { $regex: search, $options: 'i' } },
                { reason: { $regex: search, $options: 'i' } },
                { staffTag: { $regex: search, $options: 'i' } },
                { discordTag: { $regex: search, $options: 'i' } }
            ]};
        }
        
        const day = new Date(Date.now() - 86400000);
        const week = new Date(Date.now() - 604800000);
        const [total, k24, k7, kicks] = await Promise.all([
            Kick.countDocuments(query),
            Kick.countDocuments({ kickedAt: { $gte: day } }),
            Kick.countDocuments({ kickedAt: { $gte: week } }),
            Kick.find(query).sort({ kickedAt: -1 }).skip(skip).limit(limit)
        ]);
        
        const totalPages = Math.ceil(total / limit);
        let rows = kicks.map(k => `<tr>
            <td>#${k.caseNumber || '—'}</td>
            <td>${k.primaryUsername}</td>
            <td class="hide">${k.discordTag || '—'}</td>
            <td>${k.reason.substring(0, 45)}${k.reason.length > 45 ? '...' : ''}</td>
            <td class="hide">${k.staffTag || '—'}</td>
            <td>${new Date(k.kickedAt).toLocaleDateString()}</td>
        </tr>`).join('');
        if (!rows) rows = '<tr><td colspan="6" class="empty">No kicks found</td></tr>';
        
        let pag = '';
        if (totalPages > 1) {
            const url = (p) => `/viewer/kicks?page=${p}&search=${encodeURIComponent(search)}`;
            if (page > 1) pag += `<a href="${url(page - 1)}">← Prev</a>`;
            pag += `<span>Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) pag += `<a href="${url(page + 1)}">Next →</a>`;
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Kicks</title><style>${viewerStyles}</style></head><body>
${getHeader('kicks')}
<div class="main">
    <h1 class="title">Kicks</h1>
    <div class="stats">
        <div class="stat"><div class="num">${total}</div><div class="lbl">Total</div></div>
        <div class="stat"><div class="num">${k24}</div><div class="lbl">Last 24h</div></div>
        <div class="stat"><div class="num">${k7}</div><div class="lbl">Last 7 Days</div></div>
    </div>
    <form class="filters" method="GET">
        <input class="search" type="text" name="search" placeholder="Search..." value="${search}">
        <button class="btn btn-go" type="submit">Search</button>
        <a class="btn btn-clr" href="/viewer/kicks">Clear</a>
    </form>
    <div class="tbl"><table>
        <thead><tr><th>Case</th><th>Player</th><th class="hide">Discord</th><th>Reason</th><th class="hide">Staff</th><th>Date</th></tr></thead>
        <tbody>${rows}</tbody>
    </table></div>
    <div class="pages">${pag}</div>
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

// Warnings Page
app.get('/viewer/warnings', viewerAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const cat = req.query.category || '';
        
        let query = {};
        if (status === 'active') query.active = true;
        else if (status === 'removed') query.active = false;
        if (cat && ['behavior', 'chat', 'cheating', 'griefing', 'other'].includes(cat)) query.category = cat;
        
        if (search) {
            const sq = { $or: [
                { discordTag: { $regex: search, $options: 'i' } },
                { playerName: { $regex: search, $options: 'i' } },
                { reason: { $regex: search, $options: 'i' } },
                { staffName: { $regex: search, $options: 'i' } }
            ]};
            query = Object.keys(query).length ? { $and: [query, sq] } : sq;
        }
        
        const [total, activeCt, warnings] = await Promise.all([
            Warning.countDocuments(query),
            Warning.countDocuments({ active: true }),
            Warning.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
        ]);
        
        const totalPages = Math.ceil(total / limit);
        let rows = warnings.map(w => `<tr>
            <td>#${w.caseNumber || '—'}</td>
            <td>${w.discordTag || '—'}</td>
            <td class="hide">${w.playerName || '—'}</td>
            <td>${w.reason.substring(0, 40)}${w.reason.length > 40 ? '...' : ''}</td>
            <td>${w.category ? (w.category.charAt(0).toUpperCase() + w.category.slice(1)) : '—'}</td>
            <td>${w.active ? '<span class="tag tag-r">Active</span>' : '<span class="tag tag-g">Removed</span>'}</td>
            <td class="hide">${w.staffName || '—'}</td>
            <td class="hide">${new Date(w.createdAt).toLocaleDateString()}</td>
        </tr>`).join('');
        if (!rows) rows = '<tr><td colspan="8" class="empty">No warnings found</td></tr>';
        
        let pag = '';
        if (totalPages > 1) {
            const url = (p) => `/viewer/warnings?page=${p}&search=${encodeURIComponent(search)}&status=${status}&category=${cat}`;
            if (page > 1) pag += `<a href="${url(page - 1)}">← Prev</a>`;
            pag += `<span>Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) pag += `<a href="${url(page + 1)}">Next →</a>`;
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Warnings</title><style>${viewerStyles}</style></head><body>
${getHeader('warnings')}
<div class="main">
    <h1 class="title">Warnings</h1>
    <div class="stats">
        <div class="stat"><div class="num">${total}</div><div class="lbl">Total</div></div>
        <div class="stat"><div class="num">${activeCt}</div><div class="lbl">Active</div></div>
        <div class="stat"><div class="num">${total - activeCt}</div><div class="lbl">Removed</div></div>
    </div>
    <form class="filters" method="GET">
        <input class="search" type="text" name="search" placeholder="Search..." value="${search}">
        <select name="category"><option value="">All Categories</option><option value="behavior" ${cat === 'behavior' ? 'selected' : ''}>Behavior</option><option value="chat" ${cat === 'chat' ? 'selected' : ''}>Chat</option><option value="cheating" ${cat === 'cheating' ? 'selected' : ''}>Cheating</option><option value="griefing" ${cat === 'griefing' ? 'selected' : ''}>Griefing</option><option value="other" ${cat === 'other' ? 'selected' : ''}>Other</option></select>
        <select name="status"><option value="">All Status</option><option value="active" ${status === 'active' ? 'selected' : ''}>Active</option><option value="removed" ${status === 'removed' ? 'selected' : ''}>Removed</option></select>
        <button class="btn btn-go" type="submit">Search</button>
        <a class="btn btn-clr" href="/viewer/warnings">Clear</a>
    </form>
    <div class="tbl"><table>
        <thead><tr><th>Case</th><th>Discord</th><th class="hide">MC Name</th><th>Reason</th><th>Category</th><th>Status</th><th class="hide">Staff</th><th class="hide">Date</th></tr></thead>
        <tbody>${rows}</tbody>
    </table></div>
    <div class="pages">${pag}</div>
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

app.get('/viewer', (req, res) => res.redirect('/viewer/bans'));

// =====================================================
// AUTHENTICATED API ROUTES
// =====================================================

const API_KEY = process.env.LINK_API_KEY || 'your-secure-api-key-here';

function authenticate(req, res, next) {
    if (req.path.startsWith('/viewer')) return next();
    const authHeader = req.headers['authorization'];
    const apiKey = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_KEY) return res.status(401).json({ success: false, error: 'Unauthorized' });
    next();
}

app.use('/api', authenticate);

app.get('/api/linked/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        if (!uuid) return res.status(400).json({ success: false, error: 'UUID required' });
        const normalizedUuid = uuid.replace(/-/g, '').toLowerCase();
        const uuidWithDashes = normalizedUuid.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
        const linked = await LinkedAccount.findOne({ $or: [{ uuid: normalizedUuid }, { uuid: uuidWithDashes }, { uuid: uuid.toLowerCase() }, { uuid }] });
        if (linked) {
            return res.json({ success: true, linked: true, data: { discordId: linked.discordId, minecraftUsername: linked.minecraftUsername, uuid: linked.uuid, platform: linked.platform, linkedAt: linked.linkedAt, verified: linked.verified || false } });
        }
        return res.json({ success: true, linked: false });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.get('/api/linked/discord/:discordId', async (req, res) => {
    try {
        const { discordId } = req.params;
        if (!discordId) return res.status(400).json({ success: false, error: 'Discord ID required' });
        const accounts = await LinkedAccount.find({ discordId: String(discordId) });
        return res.json({ success: true, count: accounts.length, accounts: accounts.map(a => ({ minecraftUsername: a.minecraftUsername, uuid: a.uuid, platform: a.platform, linkedAt: a.linkedAt, verified: a.verified || false, primary: a.primary || false })) });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/link', async (req, res) => {
    try {
        const { discordId, minecraftUsername, uuid, platform } = req.body;
        if (!discordId || !minecraftUsername || !uuid || !platform) return res.status(400).json({ success: false, error: 'Missing required fields' });
        const existingByUuid = await LinkedAccount.findOne({ uuid });
        if (existingByUuid) return res.status(409).json({ success: false, error: 'This Minecraft account is already linked', linkedTo: existingByUuid.discordId });
        const count = await LinkedAccount.countDocuments({ discordId: String(discordId) });
        const newLink = new LinkedAccount({ discordId: String(discordId), minecraftUsername, uuid, platform, linkedAt: new Date(), verified: false, primary: count === 0 });
        await newLink.save();
        return res.json({ success: true, message: 'Account linked successfully', data: { discordId: newLink.discordId, minecraftUsername: newLink.minecraftUsername, uuid: newLink.uuid, platform: newLink.platform, primary: newLink.primary } });
    } catch (error) {
        console.error('API Error:', error);
        if (error.code === 11000) return res.status(409).json({ success: false, error: 'This account combination already exists' });
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.delete('/api/link/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        if (!uuid) return res.status(400).json({ success: false, error: 'UUID required' });
        const result = await LinkedAccount.findOneAndDelete({ uuid });
        if (!result) return res.status(404).json({ success: false, error: 'Link not found' });
        return res.json({ success: true, message: 'Account unlinked successfully', data: { discordId: result.discordId, minecraftUsername: result.minecraftUsername } });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'NewLife Link API' }));

app.get('/api/ban/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        if (!uuid) return res.status(400).json({ success: false, error: 'UUID required' });
        const normalizedUuid = uuid.replace(/-/g, '');
        const ban = await ServerBan.findActiveBan(normalizedUuid);
        if (ban) return res.json({ success: true, banned: true, data: { caseNumber: ban.caseNumber, reason: ban.reason, duration: ban.duration, isPermanent: ban.isPermanent, bannedAt: ban.bannedAt, expiresAt: ban.expiresAt, staffTag: ban.staffTag, remaining: ban.getRemainingTime() } });
        return res.json({ success: true, banned: false });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.get('/api/bans/active', async (req, res) => {
    try {
        const bans = await ServerBan.find({ active: true }).sort({ bannedAt: -1 }).limit(100);
        return res.json({ success: true, count: bans.length, bans: bans.map(b => ({ caseNumber: b.caseNumber, primaryUsername: b.primaryUsername, primaryUuid: b.primaryUuid, bannedUuids: b.bannedUuids, reason: b.reason, duration: b.duration, isPermanent: b.isPermanent, bannedAt: b.bannedAt, expiresAt: b.expiresAt, staffTag: b.staffTag })) });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

function startApiServer(port = null) {
    const serverPort = port || process.env.LINK_API_PORT || 3001;
    return new Promise((resolve, reject) => {
        const server = app.listen(serverPort, '0.0.0.0', () => {
            console.log(` Link API server running on port ${serverPort}`);
            console.log(` Web viewer available at http://localhost:${serverPort}/viewer`);
            resolve(server);
        });
        server.on('error', (err) => {
            console.error('Failed to start API server:', err);
            reject(err);
        });
    });
}

module.exports = { app, startApiServer };
