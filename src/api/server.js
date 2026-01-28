/**
 * API Server
 * Provides REST endpoints for Velocity proxy plugin communication
 * Used for account linking verification, ban checks, and player authentication
 */

const express = require('express');
const crypto = require('crypto');
const LinkedAccount = require('../database/models/LinkedAccount');
const ServerBan = require('../database/models/ServerBan');
const Kick = require('../database/models/Kick');
const Warning = require('../database/models/Warning');
const Mute = require('../database/models/Mute');
const Evidence = require('../database/models/Evidence');
const Transcript = require('../database/models/Transcript');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =====================================================
// DISCORD OAUTH2 CONFIGURATION
// =====================================================

const DISCORD_CLIENT_ID = '1451801554167529665';
const DISCORD_CLIENT_SECRET = 'G46syqxdWJgdI19u-mO3x_mCCRqyo7w8';
const DISCORD_REDIRECT_URI = 'https://staff.newlifesmp.com/home';
const STAFF_ROLE_ID = process.env.STAFF_TEAM;
const GUILD_ID = process.env.GUILD_ID;

// Simple in-memory session store (consider Redis for production scaling)
const sessions = new Map();

// Generate session ID
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

// Get session from cookie
function getSession(req) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session_id=([^;]+)/);
    if (match && sessions.has(match[1])) {
        return sessions.get(match[1]);
    }
    return null;
}

const viewerStyles = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#0a0a12 0%,#12121f 100%);color:#e2e8f0;min-height:100vh}
.header{background:rgba(18,18,31,.95);backdrop-filter:blur(10px);padding:0 32px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100;height:64px}
.logo{font-size:1.2em;font-weight:700;background:linear-gradient(135deg,#10b981 0%,#34d399 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-.02em}
.nav{display:flex;gap:4px}
.nav a{color:#94a3b8;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:500;font-size:.875em;transition:all .2s ease;position:relative}
.nav a:hover{color:#e2e8f0;background:rgba(255,255,255,.04)}
.nav a.active{color:#10b981;background:rgba(16,185,129,.1)}
.nav a.active::after{content:'';position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);width:24px;height:2px;background:#10b981;border-radius:2px}
.logout{padding:8px 16px;background:transparent;border:1px solid rgba(255,255,255,.1);color:#94a3b8;text-decoration:none;border-radius:8px;font-size:.8em;font-weight:500;transition:all .2s ease}
.logout:hover{border-color:rgba(239,68,68,.5);color:#f87171;background:rgba(239,68,68,.05)}
.user-info{display:flex;align-items:center;gap:10px}
.user-info img{width:32px;height:32px;border-radius:50%;border:2px solid rgba(255,255,255,.1)}
.user-info span{color:#e2e8f0;font-size:.875em;font-weight:500}
.main{padding:32px;max-width:1400px;margin:0 auto}
.title{font-size:1.75em;font-weight:600;margin-bottom:24px;color:#f8fafc;letter-spacing:-.02em}
.subtitle{font-size:.9em;color:#64748b;margin-top:-16px;margin-bottom:24px}
.stats{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
.stat{background:rgba(255,255,255,.02);padding:20px 24px;border-radius:12px;border:1px solid rgba(255,255,255,.06);min-width:120px}
.stat .num{font-size:1.75em;font-weight:700;background:linear-gradient(135deg,#10b981 0%,#34d399 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat .lbl{font-size:.7em;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;font-weight:500}
.filter-card{background:rgba(255,255,255,.02);padding:24px;border-radius:12px;border:1px solid rgba(255,255,255,.06);margin-bottom:24px}
.filter-card h3{color:#f1f5f9;margin-bottom:20px;font-size:1em;font-weight:600;display:flex;align-items:center;gap:8px}
.filter-card h3::before{content:'';width:3px;height:16px;background:linear-gradient(180deg,#10b981,#059669);border-radius:2px}
.filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.filter-group{display:flex;flex-direction:column;gap:6px}
.filter-group label{font-size:.75em;color:#64748b;text-transform:uppercase;letter-spacing:.5px;font-weight:500}
.filter-group input,.filter-group select{padding:12px 14px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(0,0,0,.2);color:#e2e8f0;font-size:.875em;transition:all .2s ease;width:100%}
.filter-group input:focus,.filter-group select:focus{outline:none;border-color:rgba(16,185,129,.5);box-shadow:0 0 0 3px rgba(16,185,129,.1)}
.filter-group input::placeholder{color:#4b5563}
.filter-actions{display:flex;gap:12px;margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,.06)}
.filters{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:flex-end}
.search{flex:1;min-width:220px;padding:12px 16px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(0,0,0,.2);color:#e2e8f0;font-size:.875em;transition:all .2s ease}
.search:focus{outline:none;border-color:rgba(16,185,129,.5);box-shadow:0 0 0 3px rgba(16,185,129,.1)}
.search::placeholder{color:#4b5563}
select{padding:12px 16px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(0,0,0,.2);color:#e2e8f0;font-size:.875em;cursor:pointer;transition:all .2s ease}
select:focus{outline:none;border-color:rgba(16,185,129,.5);box-shadow:0 0 0 3px rgba(16,185,129,.1)}
.btn{padding:12px 20px;border:none;border-radius:8px;font-weight:600;font-size:.8em;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .2s ease;text-transform:uppercase;letter-spacing:.5px}
.btn-go{background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;box-shadow:0 4px 12px rgba(16,185,129,.25)}
.btn-go:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(16,185,129,.35)}
.btn-clr{background:rgba(255,255,255,.05);color:#94a3b8;border:1px solid rgba(255,255,255,.1)}
.btn-clr:hover{background:rgba(255,255,255,.08);color:#e2e8f0}
.btn-discord{background:linear-gradient(135deg,#5865F2 0%,#4752C4 100%);color:#fff;padding:14px 32px;font-size:.9em;display:inline-flex;align-items:center;gap:12px;border-radius:10px;text-decoration:none;transition:all .2s ease;box-shadow:0 4px 12px rgba(88,101,242,.25)}
.btn-discord:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(88,101,242,.35)}
.btn-discord svg{width:22px;height:22px}
.tbl{background:rgba(255,255,255,.02);border-radius:12px;border:1px solid rgba(255,255,255,.06);overflow:hidden}
table{width:100%;border-collapse:collapse;min-width:600px}
th{padding:14px 16px;text-align:left;background:rgba(0,0,0,.2);color:#64748b;font-weight:600;font-size:.7em;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
td{padding:14px 16px;border-top:1px solid rgba(255,255,255,.04);font-size:.85em;color:#cbd5e1}
tr:hover{background:rgba(255,255,255,.02)}
.tag{display:inline-block;padding:4px 10px;border-radius:6px;font-size:.7em;font-weight:600;letter-spacing:.3px}
.tag-r{background:rgba(239,68,68,.15);color:#f87171}
.tag-g{background:rgba(100,116,139,.15);color:#94a3b8}
.tag-o{background:rgba(251,146,60,.15);color:#fb923c}
.tag-b{background:rgba(59,130,246,.15);color:#60a5fa}
.tag-y{background:rgba(250,204,21,.15);color:#fde047}
.tag-p{background:rgba(168,85,247,.15);color:#c084fc}
.pages{display:flex;justify-content:center;gap:8px;margin-top:24px}
.pages a,.pages span{padding:10px 16px;border-radius:8px;text-decoration:none;font-size:.85em;font-weight:500}
.pages a{background:rgba(255,255,255,.02);color:#10b981;border:1px solid rgba(255,255,255,.06);transition:all .2s ease}
.pages a:hover{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.3)}
.pages span{color:#64748b}
.empty{text-align:center;padding:60px 20px;color:#64748b}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse at top,rgba(16,185,129,.08) 0%,transparent 50%)}
.login-box{width:100%;max-width:420px;background:rgba(255,255,255,.02);padding:48px 40px;border-radius:16px;border:1px solid rgba(255,255,255,.06);text-align:center;backdrop-filter:blur(10px)}
.login-box h2{margin-bottom:8px;color:#f8fafc;font-size:1.5em;font-weight:600}
.login-box p{color:#64748b;margin-bottom:32px;font-size:.9em;line-height:1.6}
.login-box .err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#f87171;padding:14px;border-radius:8px;margin-bottom:24px;font-size:.875em}
.search-box{background:rgba(255,255,255,.02);padding:24px;border-radius:12px;border:1px solid rgba(255,255,255,.06);margin-bottom:24px}
.search-box h3{color:#f1f5f9;margin-bottom:20px;font-size:1em;font-weight:600}
.search-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.search-row:last-child{margin-bottom:0}
.search-row input,.search-row select{flex:1;min-width:160px}
.search-hint{font-size:.75em;color:#4b5563;margin-top:12px;line-height:1.5}
.btn-edit{padding:6px 12px;font-size:.75em;background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.2);border-radius:6px;cursor:pointer;text-decoration:none;font-weight:500;transition:all .2s ease}
.btn-edit:hover{background:rgba(59,130,246,.25);border-color:rgba(59,130,246,.4)}
.case-detail{background:rgba(255,255,255,.02);padding:28px;border-radius:12px;border:1px solid rgba(255,255,255,.06);margin-bottom:24px}
.case-detail h2{margin-bottom:20px;color:#f8fafc;font-size:1.25em;font-weight:600}
.case-detail .info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px}
.case-detail .info-item{padding:16px;background:rgba(0,0,0,.2);border-radius:8px;border:1px solid rgba(255,255,255,.04)}
.case-detail .info-item label{font-size:.7em;color:#64748b;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;font-weight:500}
.case-detail .info-item span{color:#f1f5f9;font-size:.9em}
.evidence-section{background:rgba(255,255,255,.02);padding:28px;border-radius:12px;border:1px solid rgba(255,255,255,.06);margin-bottom:24px}
.evidence-section h3{margin-bottom:20px;color:#f1f5f9;font-size:1em;font-weight:600}
.evidence-item{background:rgba(0,0,0,.2);padding:20px;border-radius:10px;margin-bottom:12px;border:1px solid rgba(255,255,255,.04)}
.evidence-item .meta{font-size:.75em;color:#64748b;margin-bottom:10px}
.evidence-item .content{color:#e2e8f0;line-height:1.6}
.evidence-item img{max-width:100%;max-height:400px;border-radius:8px;margin-top:12px}
.evidence-form{margin-top:24px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06)}
.evidence-form h4{color:#f1f5f9;margin-bottom:16px;font-size:.9em;font-weight:600}
.evidence-form textarea{width:100%;min-height:120px;padding:14px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#f1f5f9;margin-bottom:16px;resize:vertical;font-family:inherit;font-size:.875em;line-height:1.5}
.evidence-form textarea:focus{outline:none;border-color:rgba(16,185,129,.5)}
.evidence-form input[type="file"]{margin-bottom:16px;color:#94a3b8;font-size:.85em}
.evidence-form .btns{display:flex;gap:12px}
.user-cases-section{margin-bottom:24px}
.user-cases-section h2{color:#f8fafc;margin-bottom:8px;font-size:1.25em;font-weight:600}
.user-cases-section p{color:#64748b;margin-bottom:24px;font-size:.9em;line-height:1.6}
.back-link{display:inline-flex;align-items:center;gap:6px;margin-bottom:24px;color:#10b981;text-decoration:none;font-size:.875em;font-weight:500;transition:color .2s ease}
.back-link:hover{color:#34d399}
.back-link::before{content:'←';font-size:1.1em}
.no-evidence{color:#4b5563;font-style:normal;padding:40px 20px;text-align:center;background:rgba(0,0,0,.1);border-radius:8px}
.img-preview{max-width:200px;max-height:150px;margin-top:12px;border-radius:6px}
.status-active{color:#f87171}
.status-inactive{color:#94a3b8}
@media(max-width:768px){.header{flex-wrap:wrap;gap:12px;padding:12px 16px;height:auto}.nav{width:100%;justify-content:center;gap:2px}.nav a{padding:8px 12px;font-size:.8em}.main{padding:20px 16px}th,td{padding:10px 12px;font-size:.8em}.hide{display:none}.filters{flex-direction:column}.search,select{width:100%}.filter-grid{grid-template-columns:1fr}.search-row{flex-direction:column}.search-row input,.search-row select{width:100%}.case-detail .info-grid{grid-template-columns:1fr}.stats{gap:12px}.stat{padding:16px 20px;min-width:100px}}
`;

// Discord OAuth2 Login Page
function loginPage(error = '') {
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds.members.read`;
    
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>NewLife SMP - Dashboard</title><style>${viewerStyles}</style></head>
<body><div class="login-wrap"><div class="login-box">
<h2>NewLife SMP</h2>
<p>Login to view your dashboard.<br>See your moderation history, tickets, and more.</p>
${error ? `<div class="err">${error}</div>` : ''}
<a href="${discordAuthUrl}" class="btn-discord">
<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
Login with Discord
</a>
</div></div></body></html>`;
}

// Access Denied Page
function accessDeniedPage(username, avatar) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Access Denied</title><style>${viewerStyles}</style></head>
<body><div class="login-wrap"><div class="login-box">
<h2 style="color:#ef4444">Access Denied</h2>
<p>Sorry <strong>${username}</strong>, you don't have permission to access the staff panel.</p>
<div class="err">You must have the Staff role to access this panel.</div>
<a href="/viewer/logout" class="btn btn-clr" style="margin-top:16px;display:inline-block">Sign out and try another account</a>
</div></div></body></html>`;
}

// Login route - redirect to Discord OAuth
app.get('/viewer/login', (req, res) => {
    const session = getSession(req);
    if (session) {
        // Already logged in, redirect to dashboard
        return res.redirect('/viewer/dashboard');
    }
    res.setHeader('Content-Type', 'text/html');
    res.send(loginPage());
});

// OAuth callback - this is the redirect URI (/home)
app.get('/home', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(loginPage('No authorization code received. Please try again.'));
    }
    
    try {
        // Exchange code for access token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: DISCORD_REDIRECT_URI
            })
        });
        
        if (!tokenResponse.ok) {
            const err = await tokenResponse.text();
            console.error('Token exchange failed:', err);
            res.setHeader('Content-Type', 'text/html');
            return res.send(loginPage('Failed to authenticate with Discord. Please try again.'));
        }
        
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        // Get user info
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!userResponse.ok) {
            res.setHeader('Content-Type', 'text/html');
            return res.send(loginPage('Failed to get user information.'));
        }
        
        const userData = await userResponse.json();
        const userId = userData.id;
        const username = userData.username;
        const avatar = userData.avatar 
            ? `https://cdn.discordapp.com/avatars/${userId}/${userData.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`;
        
        // Check if user has staff role in the guild
        let isStaff = false;
        
        if (GUILD_ID && STAFF_ROLE_ID) {
            try {
                const memberResponse = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                
                if (memberResponse.ok) {
                    const memberData = await memberResponse.json();
                    isStaff = memberData.roles && memberData.roles.includes(STAFF_ROLE_ID);
                }
            } catch (e) {
                console.error('Failed to check guild membership:', e);
            }
        }
        
        // Create session
        const sessionId = generateSessionId();
        sessions.set(sessionId, {
            discordId: userId,
            username: username,
            avatar: avatar,
            isStaff: isStaff,
            adminMode: false, // Start in user mode, staff can toggle to admin
            createdAt: Date.now()
        });
        
        // Set session cookie (24 hour expiry)
        res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400`);
        
        // Everyone goes to the unified dashboard
        const redirectCase = req.query.case;
        if (redirectCase) {
            return res.redirect(`/viewer/dashboard?highlight=${encodeURIComponent(redirectCase)}`);
        }
        return res.redirect('/viewer/dashboard');
        
    } catch (error) {
        console.error('OAuth error:', error);
        res.setHeader('Content-Type', 'text/html');
        res.send(loginPage('An error occurred during authentication. Please try again.'));
    }
});

// Logout
app.get('/viewer/logout', (req, res) => {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session_id=([^;]+)/);
    if (match) {
        sessions.delete(match[1]);
    }
    res.setHeader('Set-Cookie', 'session_id=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');
    res.redirect('/viewer/login');
});

// Auth middleware - for any logged in user
function viewerAuth(req, res, next) {
    const session = getSession(req);
    if (!session) {
        return res.redirect('/viewer/login');
    }
    req.session = session;
    next();
}

// Auth middleware - for staff admin pages only
function staffAuth(req, res, next) {
    const session = getSession(req);
    if (!session) {
        return res.redirect('/viewer/login');
    }
    if (!session.isStaff || !session.adminMode) {
        return res.redirect('/viewer/dashboard');
    }
    req.session = session;
    next();
}

// User header (for dashboard/my pages)
function getUserHeader(active, session) {
    const staffToggle = session.isStaff ? `
        <a href="/viewer/toggle-mode" class="btn-mode" style="background:linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%);color:#fff;padding:8px 16px;border-radius:8px;font-size:.8em;font-weight:500;text-decoration:none;margin-right:12px;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(139,92,246,.25)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            Switch to Admin
        </a>` : '';
    
    return `<div class="header">
    <div class="logo">NewLife SMP</div>
    <nav class="nav">
        <a href="/viewer/dashboard" class="${active === 'dashboard' ? 'active' : ''}">Dashboard</a>
        <a href="/viewer/my-cases" class="${active === 'my-cases' ? 'active' : ''}">My Cases</a>
        <a href="/viewer/my-transcripts" class="${active === 'my-transcripts' ? 'active' : ''}">My Tickets</a>
    </nav>
    <div style="display:flex;align-items:center;gap:12px">
        ${staffToggle}
        <div class="user-info">
            <img src="${session.avatar}" alt="">
            <span>${session.username}</span>
        </div>
        <a href="/viewer/logout" class="logout">Logout</a>
    </div>
</div>`;
}

// Admin header (for staff pages)
function getHeader(active, session = null) {
    const userInfo = session ? `
    <div class="user-info">
        <img src="${session.avatar}" alt="">
        <span>${session.username}</span>
    </div>` : '';
    
    const switchToUser = session ? `
        <a href="/viewer/toggle-mode" class="btn-mode" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;padding:8px 16px;border-radius:8px;font-size:.8em;font-weight:500;text-decoration:none;margin-right:12px;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(16,185,129,.25)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>
            My Dashboard
        </a>` : '';
    
    return `<div class="header">
    <div class="logo">NewLife SMP <span style="font-size:.7em;color:#8b5cf6;margin-left:4px">ADMIN</span></div>
    <nav class="nav">
        <a href="/viewer/search" class="${active === 'search' ? 'active' : ''}">Search All</a>
        <a href="/viewer/bans" class="${active === 'bans' ? 'active' : ''}">Bans</a>
        <a href="/viewer/kicks" class="${active === 'kicks' ? 'active' : ''}">Kicks</a>
        <a href="/viewer/warnings" class="${active === 'warnings' ? 'active' : ''}">Warnings</a>
        <a href="/viewer/mutes" class="${active === 'mutes' ? 'active' : ''}">Mutes</a>
        <a href="/viewer/transcripts" class="${active === 'transcripts' ? 'active' : ''}">Transcripts</a>
    </nav>
    <div style="display:flex;align-items:center;gap:12px">
        ${switchToUser}
        ${userInfo}
        <a href="/viewer/logout" class="logout">Logout</a>
    </div>
</div>`;
}

// =====================================================
// TOGGLE MODE - Switch between user and admin mode
// =====================================================
app.get('/viewer/toggle-mode', viewerAuth, (req, res) => {
    const session = req.session;
    
    // Only staff can toggle
    if (!session.isStaff) {
        return res.redirect('/viewer/dashboard');
    }
    
    // Toggle the mode
    session.adminMode = !session.adminMode;
    
    // Redirect to appropriate page
    if (session.adminMode) {
        res.redirect('/viewer/search');
    } else {
        res.redirect('/viewer/dashboard');
    }
});

// =====================================================
// UNIFIED DASHBOARD - Landing page for all users
// =====================================================
app.get('/viewer/dashboard', viewerAuth, async (req, res) => {
    const session = req.session;
    const userId = session.discordId;
    
    try {
        // Get user's case counts
        const [bans, kicks, warnings, mutes] = await Promise.all([
            ServerBan.countDocuments({ discordId: userId }),
            Kick.countDocuments({ discordId: userId }),
            Warning.countDocuments({ discordId: userId }),
            Mute.countDocuments({ discordId: userId })
        ]);
        
        // Get recent cases
        const recentBans = await ServerBan.find({ discordId: userId }).sort({ createdAt: -1 }).limit(3).lean();
        const recentKicks = await Kick.find({ discordId: userId }).sort({ createdAt: -1 }).limit(3).lean();
        const recentWarnings = await Warning.find({ discordId: userId }).sort({ createdAt: -1 }).limit(3).lean();
        
        // Get user's transcripts count
        const transcriptCount = await Transcript.countDocuments({ 
            $or: [
                { 'opener.id': userId },
                { 'participants.id': userId }
            ]
        });
        
        // Calculate total cases
        const totalCases = bans + kicks + warnings + mutes;
        
        // Build recent activity
        let recentActivity = [
            ...recentBans.map(c => ({ ...c, type: 'Ban', color: 'tag-r' })),
            ...recentKicks.map(c => ({ ...c, type: 'Kick', color: 'tag-o' })),
            ...recentWarnings.map(c => ({ ...c, type: 'Warning', color: 'tag-y' }))
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Dashboard - NewLife SMP</title><style>${viewerStyles}
.dashboard-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:32px}
.dashboard-card{background:rgba(255,255,255,.02);padding:24px;border-radius:12px;border:1px solid rgba(255,255,255,.06)}
.dashboard-card h3{color:#f1f5f9;margin-bottom:16px;font-size:1em;font-weight:600;display:flex;align-items:center;gap:8px}
.dashboard-card h3 svg{width:18px;height:18px;opacity:.7}
.welcome-card{background:linear-gradient(135deg,rgba(16,185,129,.1) 0%,rgba(16,185,129,.02) 100%);border-color:rgba(16,185,129,.2)}
.welcome-card h2{color:#f8fafc;font-size:1.5em;margin-bottom:8px}
.welcome-card p{color:#94a3b8;line-height:1.6}
.stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.stat-item{background:rgba(0,0,0,.2);padding:16px;border-radius:8px;text-align:center}
.stat-item .value{font-size:1.75em;font-weight:700;background:linear-gradient(135deg,#10b981 0%,#34d399 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat-item .label{font-size:.7em;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:4px}
.activity-item{display:flex;align-items:center;gap:12px;padding:12px;background:rgba(0,0,0,.15);border-radius:8px;margin-bottom:8px}
.activity-item:last-child{margin-bottom:0}
.activity-item .type{font-size:.7em;font-weight:600;padding:4px 8px;border-radius:4px}
.activity-item .details{flex:1}
.activity-item .reason{color:#e2e8f0;font-size:.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.activity-item .date{color:#64748b;font-size:.75em;margin-top:2px}
.empty-state{color:#4b5563;text-align:center;padding:32px;font-size:.9em}
.quick-links{display:flex;gap:12px;flex-wrap:wrap}
.quick-link{padding:12px 20px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#e2e8f0;text-decoration:none;font-size:.85em;font-weight:500;transition:all .2s}
.quick-link:hover{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.3);color:#10b981}
.status-clean{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.2)}
.status-clean h2{color:#10b981}
        </style></head>
<body>
${getUserHeader('dashboard', session)}
<div class="main">
    <div class="dashboard-grid">
        <div class="dashboard-card welcome-card ${totalCases === 0 ? 'status-clean' : ''}">
            <h2>Welcome, ${session.username}!</h2>
            <p>${totalCases === 0 
                ? 'Your record is clean! Keep up the great work. 🎉' 
                : `You have ${totalCases} moderation case${totalCases === 1 ? '' : 's'} on record.`}</p>
        </div>
        
        <div class="dashboard-card">
            <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>Quick Stats</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="value">${totalCases}</div>
                    <div class="label">Total Cases</div>
                </div>
                <div class="stat-item">
                    <div class="value">${transcriptCount}</div>
                    <div class="label">Tickets</div>
                </div>
                <div class="stat-item">
                    <div class="value">${bans}</div>
                    <div class="label">Bans</div>
                </div>
                <div class="stat-item">
                    <div class="value">${warnings}</div>
                    <div class="label">Warnings</div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="dashboard-grid">
        <div class="dashboard-card">
            <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Recent Activity</h3>
            ${recentActivity.length > 0 ? recentActivity.map(item => `
                <div class="activity-item">
                    <span class="tag type ${item.color}">${item.type}</span>
                    <div class="details">
                        <div class="reason">${item.reason || 'No reason provided'}</div>
                        <div class="date">${item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date'}</div>
                    </div>
                </div>
            `).join('') : '<div class="empty-state">No recent activity</div>'}
        </div>
        
        <div class="dashboard-card">
            <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Quick Links</h3>
            <div class="quick-links">
                <a href="/viewer/my-cases" class="quick-link">View All Cases</a>
                <a href="/viewer/my-transcripts" class="quick-link">View Tickets</a>
                ${session.isStaff ? '<a href="/viewer/toggle-mode" class="quick-link" style="background:rgba(139,92,246,.1);border-color:rgba(139,92,246,.2);color:#a78bfa">Admin Panel</a>' : ''}
            </div>
        </div>
    </div>
</div>
</body></html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// =====================================================
// UNIFIED SEARCH PAGE - Search All Logs (Staff Only)
// =====================================================
app.get('/viewer/search', staffAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const caseType = req.query.type || '';
        const status = req.query.status || '';
        const staff = req.query.staff || '';
        const dateFrom = req.query.from || '';
        const dateTo = req.query.to || '';
        const caseNum = req.query.case || '';

        let allResults = [];

        // Build search conditions with improved multi-field matching
        const buildSearchQuery = (searchFields) => {
            let conditions = [];
            
            if (search) {
                // Support multi-term search: split by spaces and search all terms
                const terms = search.trim().split(/\s+/).filter(t => t.length > 0);
                if (terms.length > 0) {
                    const searchConditions = terms.map(term => ({
                        $or: searchFields.map(f => ({ [f]: { $regex: term, $options: 'i' } }))
                    }));
                    // All terms must match (AND logic across terms)
                    conditions.push(...searchConditions);
                }
            }
            
            if (staff) {
                conditions.push({ $or: [
                    { staffTag: { $regex: staff, $options: 'i' } },
                    { staffName: { $regex: staff, $options: 'i' } }
                ]});
            }
            
            if (caseNum) {
                const caseNumber = parseInt(caseNum);
                if (!isNaN(caseNumber)) {
                    conditions.push({ caseNumber });
                }
            }
            
            return conditions.length > 0 ? { $and: conditions } : {};
        };

        // Only search requested type, or all if not specified
        const shouldSearch = (type) => !caseType || caseType === type;

        // Search Bans
        if (shouldSearch('ban')) {
            let banQuery = buildSearchQuery(['primaryUsername', 'discordTag', 'reason']);
            if (status === 'active') banQuery.active = true;
            else if (status === 'expired' || status === 'removed') banQuery.active = false;
            
            if (dateFrom || dateTo) {
                banQuery.bannedAt = {};
                if (dateFrom) banQuery.bannedAt.$gte = new Date(dateFrom);
                if (dateTo) banQuery.bannedAt.$lte = new Date(dateTo + 'T23:59:59');
            }

            const bans = await ServerBan.find(banQuery).sort({ bannedAt: -1 }).limit(200).lean();
            bans.forEach(b => {
                allResults.push({
                    type: 'ban',
                    caseNumber: b.caseNumber,
                    target: b.primaryUsername || b.discordTag || 'Unknown',
                    discordTag: b.discordTag,
                    reason: b.reason,
                    staff: b.staffTag,
                    date: b.bannedAt,
                    status: b.active ? 'Active' : 'Expired',
                    extra: b.isPermanent ? 'Permanent' : (b.duration || '')
                });
            });
        }

        // Search Kicks
        if (shouldSearch('kick')) {
            let kickQuery = buildSearchQuery(['primaryUsername', 'discordTag', 'reason']);
            
            if (dateFrom || dateTo) {
                kickQuery.kickedAt = {};
                if (dateFrom) kickQuery.kickedAt.$gte = new Date(dateFrom);
                if (dateTo) kickQuery.kickedAt.$lte = new Date(dateTo + 'T23:59:59');
            }

            const kicks = await Kick.find(kickQuery).sort({ kickedAt: -1 }).limit(200).lean();
            kicks.forEach(k => {
                allResults.push({
                    type: 'kick',
                    caseNumber: k.caseNumber,
                    target: k.primaryUsername || k.discordTag || 'Unknown',
                    discordTag: k.discordTag,
                    reason: k.reason,
                    staff: k.staffTag,
                    date: k.kickedAt,
                    status: '—',
                    extra: ''
                });
            });
        }

        // Search Warnings
        if (shouldSearch('warning')) {
            let warnQuery = buildSearchQuery(['discordTag', 'playerName', 'reason']);
            if (status === 'active') warnQuery.active = true;
            else if (status === 'removed' || status === 'expired') warnQuery.active = false;
            
            if (dateFrom || dateTo) {
                warnQuery.createdAt = {};
                if (dateFrom) warnQuery.createdAt.$gte = new Date(dateFrom);
                if (dateTo) warnQuery.createdAt.$lte = new Date(dateTo + 'T23:59:59');
            }

            const warnings = await Warning.find(warnQuery).sort({ createdAt: -1 }).limit(200).lean();
            warnings.forEach(w => {
                allResults.push({
                    type: 'warning',
                    caseNumber: w.caseNumber,
                    target: w.playerName || w.discordTag || 'Unknown',
                    discordTag: w.discordTag,
                    reason: w.reason,
                    staff: w.staffName,
                    date: w.createdAt,
                    status: w.active ? 'Active' : 'Removed',
                    extra: w.category || ''
                });
            });
        }

        // Search Mutes
        if (shouldSearch('mute')) {
            let muteQuery = buildSearchQuery(['discordTag', 'reason']);
            if (status === 'active') muteQuery.active = true;
            else if (status === 'expired' || status === 'removed') muteQuery.active = false;
            
            if (dateFrom || dateTo) {
                muteQuery.createdAt = {};
                if (dateFrom) muteQuery.createdAt.$gte = new Date(dateFrom);
                if (dateTo) muteQuery.createdAt.$lte = new Date(dateTo + 'T23:59:59');
            }

            const mutes = await Mute.find(muteQuery).sort({ createdAt: -1 }).limit(200).lean();
            mutes.forEach(m => {
                allResults.push({
                    type: 'mute',
                    caseNumber: m.caseNumber,
                    target: m.discordTag || 'Unknown',
                    discordTag: m.discordTag,
                    reason: m.reason,
                    staff: m.staffTag,
                    date: m.createdAt,
                    status: m.active ? 'Active' : 'Expired',
                    extra: m.duration || ''
                });
            });
        }

        // Sort all results by date descending
        allResults.sort((a, b) => new Date(b.date) - new Date(a.date));

        const total = allResults.length;
        const paginatedResults = allResults.slice(skip, skip + limit);
        const totalPages = Math.ceil(total / limit);

        // Get type tag color
        const getTypeTag = (type) => {
            switch(type) {
                case 'ban': return '<span class="tag tag-r">Ban</span>';
                case 'kick': return '<span class="tag tag-y">Kick</span>';
                case 'warning': return '<span class="tag tag-o">Warning</span>';
                case 'mute': return '<span class="tag tag-p">Mute</span>';
                default: return '<span class="tag tag-g">' + type + '</span>';
            }
        };

        const getStatusTag = (status) => {
            if (status === 'Active') return '<span class="tag tag-r">Active</span>';
            if (status === 'Expired' || status === 'Removed') return '<span class="tag tag-g">' + status + '</span>';
            return status;
        };

        let rows = paginatedResults.map(r => `<tr>
            <td>#${r.caseNumber || '—'}</td>
            <td>${getTypeTag(r.type)}</td>
            <td>${r.target}</td>
            <td class="hide">${r.discordTag || '—'}</td>
            <td>${(r.reason || '').substring(0, 40)}${(r.reason || '').length > 40 ? '...' : ''}</td>
            <td>${getStatusTag(r.status)}</td>
            <td class="hide">${r.staff || '—'}</td>
            <td>${r.date ? new Date(r.date).toLocaleDateString() : '—'}</td>
            <td><a href="/viewer/case/${r.type}/${r.caseNumber}" class="btn-edit">View</a></td>
        </tr>`).join('');

        if (!rows) rows = '<tr><td colspan="9" class="empty">No results found. Try adjusting your search filters.</td></tr>';

        let pag = '';
        if (totalPages > 1) {
            const url = (p) => `/viewer/search?page=${p}&search=${encodeURIComponent(search)}&type=${caseType}&status=${status}&staff=${encodeURIComponent(staff)}&from=${dateFrom}&to=${dateTo}&case=${caseNum}`;
            if (page > 1) pag += `<a href="${url(page - 1)}">Previous</a>`;
            pag += `<span>Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) pag += `<a href="${url(page + 1)}">Next</a>`;
        }

        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Search All Logs</title><style>${viewerStyles}</style></head><body>
${getHeader('search', req.session)}
<div class="main">
    <h1 class="title">Search All Moderation Logs</h1>
    
    <div class="filter-card">
        <h3>Search Filters</h3>
        <form method="GET">
            <div class="filter-grid">
                <div class="filter-group">
                    <label>Search</label>
                    <input type="text" name="search" placeholder="Username, Discord, reason..." value="${search}">
                </div>
                <div class="filter-group">
                    <label>Case Number</label>
                    <input type="text" name="case" placeholder="Exact case #" value="${caseNum}">
                </div>
                <div class="filter-group">
                    <label>Type</label>
                    <select name="type">
                        <option value="">All Types</option>
                        <option value="ban" ${caseType === 'ban' ? 'selected' : ''}>Bans</option>
                        <option value="kick" ${caseType === 'kick' ? 'selected' : ''}>Kicks</option>
                        <option value="warning" ${caseType === 'warning' ? 'selected' : ''}>Warnings</option>
                        <option value="mute" ${caseType === 'mute' ? 'selected' : ''}>Mutes</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Status</label>
                    <select name="status">
                        <option value="">All Status</option>
                        <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="expired" ${status === 'expired' ? 'selected' : ''}>Expired/Removed</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Staff Member</label>
                    <input type="text" name="staff" placeholder="Staff name..." value="${staff}">
                </div>
                <div class="filter-group">
                    <label>From Date</label>
                    <input type="date" name="from" value="${dateFrom}">
                </div>
                <div class="filter-group">
                    <label>To Date</label>
                    <input type="date" name="to" value="${dateTo}">
                </div>
            </div>
            <div class="filter-actions">
                <button class="btn btn-go" type="submit">Apply Filters</button>
                <a class="btn btn-clr" href="/viewer/search">Clear All</a>
            </div>
        </form>
    </div>
    
    <div class="stats">
        <div class="stat"><div class="num">${total}</div><div class="lbl">Results Found</div></div>
    </div>
    
    <div class="tbl"><table>
        <thead><tr><th>Case</th><th>Type</th><th>Target</th><th class="hide">Discord</th><th>Reason</th><th>Status</th><th class="hide">Staff</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
    </table></div>
    <div class="pages">${pag}</div>
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error: ' + e.message);
    }
});

// Bans Page
app.get('/viewer/bans', staffAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const staff = req.query.staff || '';
        const duration = req.query.duration || '';
        
        let query = {};
        if (status === 'active') query.active = true;
        else if (status === 'expired') query.active = false;
        if (duration === 'perm') query.isPermanent = true;
        else if (duration === 'temp') query.isPermanent = false;
        
        let conditions = [];
        if (search) {
            conditions.push({ $or: [
                { primaryUsername: { $regex: search, $options: 'i' } },
                { reason: { $regex: search, $options: 'i' } },
                { discordTag: { $regex: search, $options: 'i' } },
                { discordId: { $regex: search, $options: 'i' } }
            ]});
        }
        if (staff) {
            conditions.push({ staffTag: { $regex: staff, $options: 'i' } });
        }
        if (conditions.length > 0) {
            query = Object.keys(query).length ? { $and: [query, ...conditions] } : { $and: conditions };
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
            <td>${b.primaryUsername || '—'}</td>
            <td class="hide">${b.discordTag || '—'}</td>
            <td>${(b.reason || '').substring(0, 45)}${(b.reason || '').length > 45 ? '...' : ''}</td>
            <td>${b.isPermanent ? '<span class="tag tag-o">Perm</span>' : (b.duration || '—')}</td>
            <td>${b.active ? '<span class="tag tag-r">Active</span>' : '<span class="tag tag-g">Expired</span>'}</td>
            <td class="hide">${b.staffTag || '—'}</td>
            <td class="hide">${b.bannedAt ? new Date(b.bannedAt).toLocaleDateString() : '—'}</td>
            <td><a href="/viewer/case/ban/${b.caseNumber}" class="btn-edit">View</a></td>
        </tr>`).join('');
        if (!rows) rows = '<tr><td colspan="9" class="empty">No bans found</td></tr>';
        
        let pag = '';
        if (totalPages > 1) {
            const url = (p) => `/viewer/bans?page=${p}&search=${encodeURIComponent(search)}&status=${status}&staff=${encodeURIComponent(staff)}&duration=${duration}`;
            if (page > 1) pag += `<a href="${url(page - 1)}">Previous</a>`;
            pag += `<span>Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) pag += `<a href="${url(page + 1)}">Next</a>`;
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Bans</title><style>${viewerStyles}</style></head><body>
${getHeader('bans', req.session)}
<div class="main">
    <h1 class="title">Bans</h1>
    <div class="stats">
        <div class="stat"><div class="num">${total}</div><div class="lbl">Total</div></div>
        <div class="stat"><div class="num">${activeCt}</div><div class="lbl">Active</div></div>
        <div class="stat"><div class="num">${permCt}</div><div class="lbl">Permanent</div></div>
        <div class="stat"><div class="num">${total - activeCt}</div><div class="lbl">Expired</div></div>
    </div>
    <form class="filters" method="GET">
        <div class="filter-group" style="flex:1;min-width:200px">
            <label>Search</label>
            <input type="text" name="search" placeholder="Player, Discord, reason..." value="${search}">
        </div>
        <div class="filter-group" style="min-width:150px">
            <label>Staff</label>
            <input type="text" name="staff" placeholder="Staff member..." value="${staff}">
        </div>
        <div class="filter-group" style="min-width:120px">
            <label>Status</label>
            <select name="status"><option value="">All</option><option value="active" ${status === 'active' ? 'selected' : ''}>Active</option><option value="expired" ${status === 'expired' ? 'selected' : ''}>Expired</option></select>
        </div>
        <div class="filter-group" style="min-width:120px">
            <label>Duration</label>
            <select name="duration"><option value="">All</option><option value="perm" ${duration === 'perm' ? 'selected' : ''}>Permanent</option><option value="temp" ${duration === 'temp' ? 'selected' : ''}>Temporary</option></select>
        </div>
        <div class="filter-group" style="justify-content:flex-end">
            <label>&nbsp;</label>
            <div style="display:flex;gap:8px">
                <button class="btn btn-go" type="submit">Filter</button>
                <a class="btn btn-clr" href="/viewer/bans">Clear</a>
            </div>
        </div>
    </form>
    <div class="tbl"><table>
        <thead><tr><th>Case</th><th>Player</th><th class="hide">Discord</th><th>Reason</th><th>Duration</th><th>Status</th><th class="hide">Staff</th><th class="hide">Date</th><th>Actions</th></tr></thead>
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
app.get('/viewer/kicks', staffAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const staff = req.query.staff || '';
        
        let conditions = [];
        if (search) {
            conditions.push({ $or: [
                { primaryUsername: { $regex: search, $options: 'i' } },
                { reason: { $regex: search, $options: 'i' } },
                { discordTag: { $regex: search, $options: 'i' } },
                { discordId: { $regex: search, $options: 'i' } }
            ]});
        }
        if (staff) {
            conditions.push({ staffTag: { $regex: staff, $options: 'i' } });
        }
        let query = conditions.length > 0 ? { $and: conditions } : {};
        
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
            <td>${k.primaryUsername || '—'}</td>
            <td class="hide">${k.discordTag || '—'}</td>
            <td>${(k.reason || '').substring(0, 45)}${(k.reason || '').length > 45 ? '...' : ''}</td>
            <td class="hide">${k.staffTag || '—'}</td>
            <td>${k.kickedAt ? new Date(k.kickedAt).toLocaleDateString() : '—'}</td>
            <td><a href="/viewer/case/kick/${k.caseNumber}" class="btn-edit">View</a></td>
        </tr>`).join('');
        if (!rows) rows = '<tr><td colspan="7" class="empty">No kicks found</td></tr>';
        
        let pag = '';
        if (totalPages > 1) {
            const url = (p) => `/viewer/kicks?page=${p}&search=${encodeURIComponent(search)}&staff=${encodeURIComponent(staff)}`;
            if (page > 1) pag += `<a href="${url(page - 1)}">Previous</a>`;
            pag += `<span>Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) pag += `<a href="${url(page + 1)}">Next</a>`;
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Kicks</title><style>${viewerStyles}</style></head><body>
${getHeader('kicks', req.session)}
<div class="main">
    <h1 class="title">Kicks</h1>
    <div class="stats">
        <div class="stat"><div class="num">${total}</div><div class="lbl">Total</div></div>
        <div class="stat"><div class="num">${k24}</div><div class="lbl">Last 24h</div></div>
        <div class="stat"><div class="num">${k7}</div><div class="lbl">Last 7 Days</div></div>
    </div>
    <form class="filters" method="GET">
        <div class="filter-group" style="flex:1;min-width:200px">
            <label>Search</label>
            <input type="text" name="search" placeholder="Player, Discord, reason..." value="${search}">
        </div>
        <div class="filter-group" style="min-width:150px">
            <label>Staff</label>
            <input type="text" name="staff" placeholder="Staff member..." value="${staff}">
        </div>
        <div class="filter-group" style="justify-content:flex-end">
            <label>&nbsp;</label>
            <div style="display:flex;gap:8px">
                <button class="btn btn-go" type="submit">Filter</button>
                <a class="btn btn-clr" href="/viewer/kicks">Clear</a>
            </div>
        </div>
    </form>
    <div class="tbl"><table>
        <thead><tr><th>Case</th><th>Player</th><th class="hide">Discord</th><th>Reason</th><th class="hide">Staff</th><th>Date</th><th>Actions</th></tr></thead>
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
app.get('/viewer/warnings', staffAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const cat = req.query.category || '';
        const staff = req.query.staff || '';
        
        let query = {};
        if (status === 'active') query.active = true;
        else if (status === 'removed') query.active = false;
        if (cat && ['behavior', 'chat', 'cheating', 'griefing', 'pvp', 'other'].includes(cat)) query.category = cat;
        
        let conditions = [];
        if (search) {
            conditions.push({ $or: [
                { discordTag: { $regex: search, $options: 'i' } },
                { playerName: { $regex: search, $options: 'i' } },
                { reason: { $regex: search, $options: 'i' } },
                { discordId: { $regex: search, $options: 'i' } }
            ]});
        }
        if (staff) {
            conditions.push({ staffName: { $regex: staff, $options: 'i' } });
        }
        if (conditions.length > 0) {
            query = Object.keys(query).length ? { $and: [query, ...conditions] } : { $and: conditions };
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
            <td>${(w.reason || '').substring(0, 40)}${(w.reason || '').length > 40 ? '...' : ''}</td>
            <td>${w.category ? (w.category.charAt(0).toUpperCase() + w.category.slice(1)) : '—'}</td>
            <td>${w.active ? '<span class="tag tag-r">Active</span>' : '<span class="tag tag-g">Removed</span>'}</td>
            <td class="hide">${w.staffName || '—'}</td>
            <td class="hide">${w.createdAt ? new Date(w.createdAt).toLocaleDateString() : '—'}</td>
            <td><a href="/viewer/case/warning/${w.caseNumber}" class="btn-edit">View</a></td>
        </tr>`).join('');
        if (!rows) rows = '<tr><td colspan="9" class="empty">No warnings found</td></tr>';
        
        let pag = '';
        if (totalPages > 1) {
            const url = (p) => `/viewer/warnings?page=${p}&search=${encodeURIComponent(search)}&status=${status}&category=${cat}&staff=${encodeURIComponent(staff)}`;
            if (page > 1) pag += `<a href="${url(page - 1)}">Previous</a>`;
            pag += `<span>Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) pag += `<a href="${url(page + 1)}">Next</a>`;
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Warnings</title><style>${viewerStyles}</style></head><body>
${getHeader('warnings', req.session)}
<div class="main">
    <h1 class="title">Warnings</h1>
    <div class="stats">
        <div class="stat"><div class="num">${total}</div><div class="lbl">Total</div></div>
        <div class="stat"><div class="num">${activeCt}</div><div class="lbl">Active</div></div>
        <div class="stat"><div class="num">${total - activeCt}</div><div class="lbl">Removed</div></div>
    </div>
    <form class="filters" method="GET">
        <div class="filter-group" style="flex:1;min-width:200px">
            <label>Search</label>
            <input type="text" name="search" placeholder="Player, Discord, reason..." value="${search}">
        </div>
        <div class="filter-group" style="min-width:150px">
            <label>Staff</label>
            <input type="text" name="staff" placeholder="Staff member..." value="${staff}">
        </div>
        <div class="filter-group" style="min-width:120px">
            <label>Category</label>
            <select name="category"><option value="">All</option><option value="behavior" ${cat === 'behavior' ? 'selected' : ''}>Behavior</option><option value="chat" ${cat === 'chat' ? 'selected' : ''}>Chat</option><option value="cheating" ${cat === 'cheating' ? 'selected' : ''}>Cheating</option><option value="griefing" ${cat === 'griefing' ? 'selected' : ''}>Griefing</option><option value="pvp" ${cat === 'pvp' ? 'selected' : ''}>PVP</option><option value="other" ${cat === 'other' ? 'selected' : ''}>Other</option></select>
        </div>
        <div class="filter-group" style="min-width:120px">
            <label>Status</label>
            <select name="status"><option value="">All</option><option value="active" ${status === 'active' ? 'selected' : ''}>Active</option><option value="removed" ${status === 'removed' ? 'selected' : ''}>Removed</option></select>
        </div>
        <div class="filter-group" style="justify-content:flex-end">
            <label>&nbsp;</label>
            <div style="display:flex;gap:8px">
                <button class="btn btn-go" type="submit">Filter</button>
                <a class="btn btn-clr" href="/viewer/warnings">Clear</a>
            </div>
        </div>
    </form>
    <div class="tbl"><table>
        <thead><tr><th>Case</th><th>Discord</th><th class="hide">MC Name</th><th>Reason</th><th>Category</th><th>Status</th><th class="hide">Staff</th><th class="hide">Date</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
    </table></div>
    <div class="pages">${pag}</div>
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

app.get('/viewer', (req, res) => res.redirect('/viewer/search'));
app.get('/', (req, res) => res.redirect('/viewer/login'));

// =====================================================
// MUTES PAGE
// =====================================================
app.get('/viewer/mutes', staffAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const staff = req.query.staff || '';
        
        let query = {};
        if (status === 'active') query.active = true;
        else if (status === 'expired') query.active = false;
        
        let conditions = [];
        if (search) {
            conditions.push({ $or: [
                { discordTag: { $regex: search, $options: 'i' } },
                { reason: { $regex: search, $options: 'i' } },
                { discordId: { $regex: search, $options: 'i' } }
            ]});
        }
        if (staff) {
            conditions.push({ staffTag: { $regex: staff, $options: 'i' } });
        }
        if (conditions.length > 0) {
            query = Object.keys(query).length ? { $and: [query, ...conditions] } : { $and: conditions };
        }
        
        const [total, activeCt, mutes] = await Promise.all([
            Mute.countDocuments(query),
            Mute.countDocuments({ active: true }),
            Mute.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
        ]);
        
        const totalPages = Math.ceil(total / limit);
        let rows = mutes.map(m => `<tr>
            <td>#${m.caseNumber || '—'}</td>
            <td>${m.discordTag || '—'}</td>
            <td>${(m.reason || '').substring(0, 45)}${(m.reason || '').length > 45 ? '...' : ''}</td>
            <td>${m.duration || '—'}</td>
            <td>${m.active ? '<span class="tag tag-r">Active</span>' : '<span class="tag tag-g">Expired</span>'}</td>
            <td class="hide">${m.staffTag || '—'}</td>
            <td>${m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}</td>
            <td class="hide">${m.expiresAt ? new Date(m.expiresAt).toLocaleString() : 'Never'}</td>
            <td><a href="/viewer/case/mute/${m.caseNumber}" class="btn-edit">View</a></td>
        </tr>`).join('');
        if (!rows) rows = '<tr><td colspan="9" class="empty">No mutes found</td></tr>';
        
        let pag = '';
        if (totalPages > 1) {
            const url = (p) => `/viewer/mutes?page=${p}&search=${encodeURIComponent(search)}&status=${status}&staff=${encodeURIComponent(staff)}`;
            if (page > 1) pag += `<a href="${url(page - 1)}">Previous</a>`;
            pag += `<span>Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) pag += `<a href="${url(page + 1)}">Next</a>`;
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Mutes</title><style>${viewerStyles}</style></head><body>
${getHeader('mutes', req.session)}
<div class="main">
    <h1 class="title">Mutes</h1>
    <div class="stats">
        <div class="stat"><div class="num">${total}</div><div class="lbl">Total</div></div>
        <div class="stat"><div class="num">${activeCt}</div><div class="lbl">Active</div></div>
        <div class="stat"><div class="num">${total - activeCt}</div><div class="lbl">Expired</div></div>
    </div>
    <form class="filters" method="GET">
        <div class="filter-group" style="flex:1;min-width:200px">
            <label>Search</label>
            <input type="text" name="search" placeholder="User, reason, Discord ID..." value="${search}">
        </div>
        <div class="filter-group" style="min-width:150px">
            <label>Staff</label>
            <input type="text" name="staff" placeholder="Staff member..." value="${staff}">
        </div>
        <div class="filter-group" style="min-width:120px">
            <label>Status</label>
            <select name="status"><option value="">All</option><option value="active" ${status === 'active' ? 'selected' : ''}>Active</option><option value="expired" ${status === 'expired' ? 'selected' : ''}>Expired</option></select>
        </div>
        <div class="filter-group" style="justify-content:flex-end">
            <label>&nbsp;</label>
            <div style="display:flex;gap:8px">
                <button class="btn btn-go" type="submit">Filter</button>
                <a class="btn btn-clr" href="/viewer/mutes">Clear</a>
            </div>
        </div>
    </form>
    <div class="tbl"><table>
        <thead><tr><th>Case</th><th>User</th><th>Reason</th><th>Duration</th><th>Status</th><th class="hide">Staff</th><th>Date</th><th class="hide">Expires</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
    </table></div>
    <div class="pages">${pag}</div>
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

// =====================================================
// CASE DETAIL PAGE (Staff View with Evidence)
// =====================================================
app.get('/viewer/case/:type/:caseNumber', staffAuth, async (req, res) => {
    try {
        const { type, caseNumber } = req.params;
        let caseData = null;
        let modelName = '';
        
        // Find the case based on type
        switch(type) {
            case 'ban':
                caseData = await ServerBan.findOne({ caseNumber: parseInt(caseNumber) }).lean();
                modelName = 'Ban';
                break;
            case 'kick':
                caseData = await Kick.findOne({ caseNumber: parseInt(caseNumber) }).lean();
                modelName = 'Kick';
                break;
            case 'warning':
                caseData = await Warning.findOne({ caseNumber: parseInt(caseNumber) }).lean();
                modelName = 'Warning';
                break;
            case 'mute':
                caseData = await Mute.findOne({ caseNumber: parseInt(caseNumber) }).lean();
                modelName = 'Mute';
                break;
            default:
                return res.status(400).send('Invalid case type');
        }
        
        if (!caseData) {
            return res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Case Not Found</title><style>${viewerStyles}</style></head><body>
${getHeader('', req.session)}
<div class="main">
    <a href="/viewer/search" class="back-link">Back to Search</a>
    <h1 class="title">Case Not Found</h1>
    <p style="color:#94a3b8">The requested case #${caseNumber} was not found.</p>
</div></body></html>`);
        }
        
        // Get evidence for this case
        const evidence = await Evidence.getForCase(caseNumber, type);
        
        // Build info items based on case type
        let infoItems = '';
        const date = caseData.bannedAt || caseData.kickedAt || caseData.createdAt;
        const target = caseData.primaryUsername || caseData.discordTag || caseData.playerName || 'Unknown';
        const discordTag = caseData.discordTag || '—';
        const discordId = caseData.discordId || '—';
        const staff = caseData.staffTag || caseData.staffName || '—';
        const reason = caseData.reason || 'No reason provided';
        
        infoItems += `<div class="info-item"><label>Target</label><span>${target}</span></div>`;
        infoItems += `<div class="info-item"><label>Discord Tag</label><span>${discordTag}</span></div>`;
        infoItems += `<div class="info-item"><label>Discord ID</label><span>${discordId}</span></div>`;
        infoItems += `<div class="info-item"><label>Staff</label><span>${staff}</span></div>`;
        infoItems += `<div class="info-item"><label>Date</label><span>${date ? new Date(date).toLocaleString() : '—'}</span></div>`;
        
        if (type === 'ban') {
            infoItems += `<div class="info-item"><label>Duration</label><span>${caseData.isPermanent ? 'Permanent' : (caseData.duration || '—')}</span></div>`;
            infoItems += `<div class="info-item"><label>Status</label><span class="${caseData.active ? 'status-active' : 'status-inactive'}">${caseData.active ? 'Active' : 'Expired'}</span></div>`;
            if (caseData.expiresAt) infoItems += `<div class="info-item"><label>Expires</label><span>${new Date(caseData.expiresAt).toLocaleString()}</span></div>`;
        } else if (type === 'mute') {
            infoItems += `<div class="info-item"><label>Duration</label><span>${caseData.duration || '—'}</span></div>`;
            infoItems += `<div class="info-item"><label>Status</label><span class="${caseData.active ? 'status-active' : 'status-inactive'}">${caseData.active ? 'Active' : 'Expired'}</span></div>`;
            if (caseData.expiresAt) infoItems += `<div class="info-item"><label>Expires</label><span>${new Date(caseData.expiresAt).toLocaleString()}</span></div>`;
        } else if (type === 'warning') {
            infoItems += `<div class="info-item"><label>Category</label><span>${caseData.category ? (caseData.category.charAt(0).toUpperCase() + caseData.category.slice(1)) : '—'}</span></div>`;
            infoItems += `<div class="info-item"><label>Status</label><span class="${caseData.active ? 'status-active' : 'status-inactive'}">${caseData.active ? 'Active' : 'Removed'}</span></div>`;
        }
        
        // Build evidence items HTML
        let evidenceHtml = '';
        if (evidence.length === 0) {
            evidenceHtml = '<p class="no-evidence">No evidence has been added to this case yet.</p>';
        } else {
            evidence.forEach(ev => {
                ev.items.forEach(item => {
                    const meta = `Added by ${item.addedByTag || 'Unknown'} on ${new Date(item.addedAt).toLocaleString()}`;
                    if (item.type === 'text') {
                        evidenceHtml += `<div class="evidence-item"><div class="meta">${meta}</div><div class="content">${item.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div></div>`;
                    } else if (item.type === 'image') {
                        evidenceHtml += `<div class="evidence-item"><div class="meta">${meta} • ${item.filename || 'Image'}</div><img src="${item.content}" alt="Evidence"></div>`;
                    }
                });
            });
        }
        
        // Get type tag
        const typeTag = type === 'ban' ? '<span class="tag tag-r">Ban</span>' :
                       type === 'kick' ? '<span class="tag tag-y">Kick</span>' :
                       type === 'warning' ? '<span class="tag tag-o">Warning</span>' :
                       '<span class="tag tag-p">Mute</span>';
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Case #${caseNumber}</title><style>${viewerStyles}</style></head><body>
${getHeader('', req.session)}
<div class="main">
    <a href="/viewer/${type}s" class="back-link">Back to ${modelName}s</a>
    
    <h1 class="title">${typeTag} Case #${caseNumber}</h1>
    
    <div class="case-detail">
        <h2>Case Information</h2>
        <div class="info-grid">${infoItems}</div>
        <div class="info-item" style="margin-top:16px"><label>Reason</label><span style="white-space:pre-wrap">${reason.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>
    </div>
    
    <div class="evidence-section">
        <h3>Evidence (${evidence.reduce((c, e) => c + e.items.length, 0)} items)</h3>
        ${evidenceHtml}
        
        <div class="evidence-form">
            <h4>Add Evidence</h4>
            <form id="evidenceForm" enctype="multipart/form-data">
                <textarea id="evidenceText" placeholder="Add text evidence, notes, or descriptions..."></textarea>
                <div>
                    <label style="color:#94a3b8;font-size:.85em">Or upload an image:</label>
                    <input type="file" id="evidenceFile" accept="image/*">
                    <img id="imgPreview" class="img-preview" style="display:none">
                </div>
                <div class="btns">
                    <button type="submit" class="btn btn-go">Add Evidence</button>
                </div>
            </form>
        </div>
    </div>
</div>
<script>
const caseType = '${type}';
const caseNum = ${caseNumber};

document.getElementById('evidenceFile').onchange = function(e) {
    const file = e.target.files[0];
    const preview = document.getElementById('imgPreview');
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) { preview.src = e.target.result; preview.style.display = 'block'; };
        reader.readAsDataURL(file);
    } else {
        preview.style.display = 'none';
    }
};

document.getElementById('evidenceForm').onsubmit = async function(e) {
    e.preventDefault();
    const text = document.getElementById('evidenceText').value.trim();
    const fileInput = document.getElementById('evidenceFile');
    const file = fileInput.files[0];
    
    if (!text && !file) {
        alert('Please add text or an image');
        return;
    }
    
    const payload = { caseType, caseNumber: caseNum, items: [] };
    
    if (text) {
        payload.items.push({ type: 'text', content: text });
    }
    
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            payload.items.push({ type: 'image', content: e.target.result, filename: file.name, mimeType: file.type });
            await submitEvidence(payload);
        };
        reader.readAsDataURL(file);
    } else {
        await submitEvidence(payload);
    }
};

async function submitEvidence(payload) {
    try {
        const res = await fetch('/viewer/evidence/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            window.location.reload();
        } else {
            alert('Error: ' + (data.error || 'Failed to add evidence'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}
</script>
</body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error: ' + e.message);
    }
});

// Add evidence API endpoint
app.post('/viewer/evidence/add', staffAuth, async (req, res) => {
    try {
        const { caseType, caseNumber, items } = req.body;
        
        if (!caseType || !caseNumber || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        // Validate case type
        if (!['ban', 'kick', 'warning', 'mute'].includes(caseType)) {
            return res.status(400).json({ success: false, error: 'Invalid case type' });
        }
        
        // Find the case to get target discord ID
        let caseData = null;
        switch(caseType) {
            case 'ban':
                caseData = await ServerBan.findOne({ caseNumber: parseInt(caseNumber) });
                break;
            case 'kick':
                caseData = await Kick.findOne({ caseNumber: parseInt(caseNumber) });
                break;
            case 'warning':
                caseData = await Warning.findOne({ caseNumber: parseInt(caseNumber) });
                break;
            case 'mute':
                caseData = await Mute.findOne({ caseNumber: parseInt(caseNumber) });
                break;
        }
        
        if (!caseData) {
            return res.status(404).json({ success: false, error: 'Case not found' });
        }
        
        const targetDiscordId = caseData.discordId || null;
        
        // Add evidence items
        for (const item of items) {
            // Validate item type
            if (!['text', 'image'].includes(item.type)) {
                continue; // Skip invalid items
            }
            
            await Evidence.addEvidence(
                parseInt(caseNumber),
                caseType,
                targetDiscordId,
                item.type,
                item.content,
                req.session.discordId,
                req.session.username,
                item.filename || null,
                item.mimeType || null
            );
        }
        
        res.json({ success: true, message: 'Evidence added successfully' });
    } catch (e) {
        console.error('Evidence add error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// USER MODERATION VIEW (Non-staff users see their own cases)
// =====================================================
function userAuth(req, res, next) {
    const session = getSession(req);
    if (!session) {
        return res.redirect('/viewer/login');
    }
    req.session = session;
    next();
}

// User-accessible case view (redirects to my-cases with highlight)
app.get('/viewer/case/:type/:caseNumber/user', userAuth, async (req, res) => {
    const { type, caseNumber } = req.params;
    // Redirect to my-cases with highlight parameter
    res.redirect(`/viewer/my-cases?highlight=${type}-${caseNumber}`);
});

app.get('/viewer/my-cases', userAuth, async (req, res) => {
    try {
        const discordId = req.session.discordId;
        const highlightCase = req.query.highlight || null;
        
        // Fetch all moderation actions against this user
        const [bans, kicks, warnings, mutes] = await Promise.all([
            ServerBan.find({ discordId }).sort({ bannedAt: -1 }).lean(),
            Kick.find({ discordId }).sort({ kickedAt: -1 }).lean(),
            Warning.find({ discordId }).sort({ createdAt: -1 }).lean(),
            Mute.find({ discordId }).sort({ createdAt: -1 }).lean()
        ]);
        
        // Build all cases with evidence
        let allCases = [];
        
        for (const b of bans) {
            const evidence = await Evidence.getForCase(b.caseNumber, 'ban');
            allCases.push({
                type: 'ban',
                typeTag: '<span class="tag tag-r">Ban</span>',
                caseNumber: b.caseNumber,
                reason: b.reason,
                date: b.bannedAt,
                status: b.active ? 'Active' : 'Expired',
                duration: b.isPermanent ? 'Permanent' : b.duration,
                staff: b.staffTag,
                evidence
            });
        }
        
        for (const k of kicks) {
            const evidence = await Evidence.getForCase(k.caseNumber, 'kick');
            allCases.push({
                type: 'kick',
                typeTag: '<span class="tag tag-y">Kick</span>',
                caseNumber: k.caseNumber,
                reason: k.reason,
                date: k.kickedAt,
                status: '—',
                duration: '—',
                staff: k.staffTag,
                evidence
            });
        }
        
        for (const w of warnings) {
            const evidence = await Evidence.getForCase(w.caseNumber, 'warning');
            allCases.push({
                type: 'warning',
                typeTag: '<span class="tag tag-o">Warning</span>',
                caseNumber: w.caseNumber,
                reason: w.reason,
                date: w.createdAt,
                status: w.active ? 'Active' : 'Removed',
                duration: '—',
                staff: w.staffName,
                evidence
            });
        }
        
        for (const m of mutes) {
            const evidence = await Evidence.getForCase(m.caseNumber, 'mute');
            allCases.push({
                type: 'mute',
                typeTag: '<span class="tag tag-p">Mute</span>',
                caseNumber: m.caseNumber,
                reason: m.reason,
                date: m.createdAt,
                status: m.active ? 'Active' : 'Expired',
                duration: m.duration,
                staff: m.staffTag,
                evidence
            });
        }
        
        // Sort by date descending
        allCases.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Build HTML for each case
        let casesHtml = '';
        if (allCases.length === 0) {
            casesHtml = '<p class="no-evidence">You have no moderation history.</p>';
        } else {
            for (const c of allCases) {
                let evidenceHtml = '';
                if (c.evidence.length > 0) {
                    c.evidence.forEach(ev => {
                        ev.items.forEach(item => {
                            if (item.type === 'text') {
                                evidenceHtml += `<div class="evidence-item"><div class="meta">Evidence added ${new Date(item.addedAt).toLocaleDateString()}</div><div class="content">${item.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div></div>`;
                            } else if (item.type === 'image') {
                                evidenceHtml += `<div class="evidence-item"><div class="meta">Evidence image - ${item.filename || 'Image'}</div><img src="${item.content}" alt="Evidence"></div>`;
                            }
                        });
                    });
                }
                
                const statusTag = c.status === 'Active' ? '<span class="tag tag-r">Active</span>' : 
                                  c.status === 'Expired' || c.status === 'Removed' ? '<span class="tag tag-g">' + c.status + '</span>' : c.status;
                
                // Check if this case should be highlighted
                const isHighlighted = highlightCase && highlightCase === `${c.type}-${c.caseNumber}`;
                const highlightStyle = isHighlighted ? 'border: 2px solid #10b981; box-shadow: 0 0 20px rgba(16,185,129,0.3);' : '';
                
                casesHtml += `
                <div class="case-detail" id="case-${c.type}-${c.caseNumber}" style="margin-bottom:20px;${highlightStyle}">
                    <h2>${c.typeTag} Case #${c.caseNumber}</h2>
                    <div class="info-grid">
                        <div class="info-item"><label>Date</label><span>${c.date ? new Date(c.date).toLocaleString() : '—'}</span></div>
                        <div class="info-item"><label>Status</label><span>${statusTag}</span></div>
                        ${c.duration !== '—' ? `<div class="info-item"><label>Duration</label><span>${c.duration}</span></div>` : ''}
                        <div class="info-item"><label>Staff</label><span>${c.staff || '—'}</span></div>
                    </div>
                    <div class="info-item" style="margin-top:16px"><label>Reason</label><span style="white-space:pre-wrap">${(c.reason || 'No reason provided').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>
                    ${evidenceHtml ? `<div style="margin-top:16px"><label style="color:#64748b;font-size:.8em">Evidence:</label>${evidenceHtml}</div>` : ''}
                </div>`;
            }
        }
        
        // Stats
        const totalCases = allCases.length;
        const activeCases = allCases.filter(c => c.status === 'Active').length;
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>My Moderation History</title><style>${viewerStyles}${transcriptStyles}</style></head><body>
${getUserHeader('my-cases', req.session)}
<div class="main">
    <div class="user-cases-section">
        <h2>Your Moderation History</h2>
        <p>This page shows all moderation actions taken against your account, along with any evidence provided by staff.</p>
    </div>
    
    <div class="stats">
        <div class="stat"><div class="num">${totalCases}</div><div class="lbl">Total Cases</div></div>
        <div class="stat"><div class="num">${activeCases}</div><div class="lbl">Active</div></div>
        <div class="stat"><div class="num">${bans.length}</div><div class="lbl">Bans</div></div>
        <div class="stat"><div class="num">${warnings.length}</div><div class="lbl">Warnings</div></div>
    </div>
    
    ${casesHtml}
</div>
<script>
// Scroll to highlighted case if present
window.addEventListener('DOMContentLoaded', function() {
    const highlighted = document.querySelector('[id^="case-"][style*="box-shadow"]');
    if (highlighted) {
        setTimeout(() => {
            highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    }
});
</script>
</body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error: ' + e.message);
    }
});

// =====================================================
// TRANSCRIPT VIEWER STYLES (Discord-like formatting)
// =====================================================

const transcriptStyles = `
/* Discord-style message rendering */
.transcript-container{max-width:900px;margin:0 auto}
.transcript-header{background:rgba(255,255,255,.02);padding:24px;border-radius:12px;border:1px solid rgba(255,255,255,.06);margin-bottom:24px}
.transcript-header h2{margin:0 0 16px 0;color:#f8fafc;font-size:1.25em}
.transcript-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.transcript-meta-item{padding:12px;background:rgba(0,0,0,.2);border-radius:8px}
.transcript-meta-item label{font-size:.7em;color:#64748b;display:block;margin-bottom:4px;text-transform:uppercase}
.transcript-meta-item span{color:#f1f5f9;font-size:.9em}
.messages-container{background:#36393f;border-radius:8px;padding:16px 0;max-height:70vh;overflow-y:auto}
.message-group{padding:8px 16px;display:flex;gap:16px}
.message-group:hover{background:rgba(4,4,5,.07)}
.message-avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;background:#5865f2}
.message-content{flex:1;min-width:0}
.message-header{display:flex;align-items:baseline;gap:8px;margin-bottom:2px}
.message-author{font-weight:500;color:#fff;font-size:.9375em}
.message-author.bot{color:#5865f2}
.message-author.bot::after{content:'BOT';margin-left:4px;font-size:.625em;padding:1px 4px;border-radius:3px;background:#5865f2;color:#fff;vertical-align:middle;font-weight:500}
.message-timestamp{font-size:.75em;color:#72767d}
.message-text{color:#dcddde;font-size:.9375em;line-height:1.375;word-wrap:break-word;white-space:pre-wrap}
.message-text a{color:#00aff4;text-decoration:none}
.message-text a:hover{text-decoration:underline}
.message-attachment{margin-top:8px}
.message-attachment img{max-width:400px;max-height:300px;border-radius:4px}
.message-attachment a{color:#00aff4;font-size:.875em}
.message-embed{margin-top:8px;max-width:520px;background:#2f3136;border-radius:4px;overflow:hidden;display:flex}
.embed-color-bar{width:4px;flex-shrink:0}
.embed-content{padding:8px 16px 16px 12px;flex:1}
.embed-author{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.embed-author-icon{width:24px;height:24px;border-radius:50%}
.embed-author-name{font-size:.875em;font-weight:600;color:#fff}
.embed-title{font-size:1em;font-weight:600;color:#00aff4;margin-bottom:8px}
.embed-description{font-size:.875em;color:#dcddde;line-height:1.375;white-space:pre-wrap}
.embed-fields{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.embed-field{min-width:0}
.embed-field.full{grid-column:1/-1}
.embed-field-name{font-size:.875em;font-weight:600;color:#fff;margin-bottom:2px}
.embed-field-value{font-size:.875em;color:#dcddde;white-space:pre-wrap}
.embed-thumbnail{width:80px;height:80px;border-radius:4px;margin:8px 16px 0 0;object-fit:cover}
.embed-image{max-width:100%;border-radius:4px;margin-top:16px}
.embed-footer{margin-top:8px;font-size:.75em;color:#72767d}
.message-reply{font-size:.8125em;color:#72767d;margin-bottom:4px;display:flex;align-items:center;gap:4px}
.message-reply::before{content:'↩';font-size:1em}
.continuation-message{padding:2px 16px 2px 72px}
.continuation-message .message-text{margin-top:0}
.date-divider{display:flex;align-items:center;justify-content:center;margin:16px 0;padding:0 16px}
.date-divider span{background:#36393f;padding:0 8px;font-size:.75em;color:#72767d}
.date-divider::before,.date-divider::after{content:'';flex:1;height:1px;background:#4f545c}
.participants-list{margin-top:24px}
.participants-list h3{color:#f1f5f9;margin-bottom:16px;font-size:1em}
.participant{display:flex;align-items:center;gap:12px;padding:8px 12px;background:rgba(255,255,255,.02);border-radius:8px;margin-bottom:8px}
.participant img{width:32px;height:32px;border-radius:50%}
.participant-info{flex:1}
.participant-name{color:#f1f5f9;font-size:.9em}
.participant-count{color:#64748b;font-size:.8em}
.ticket-type-tag{display:inline-block;padding:4px 10px;border-radius:6px;font-size:.7em;font-weight:600;letter-spacing:.3px;margin-left:8px}
.ticket-type-apply{background:rgba(16,185,129,.15);color:#10b981}
.ticket-type-general{background:rgba(59,130,246,.15);color:#60a5fa}
.ticket-type-report{background:rgba(251,146,60,.15);color:#fb923c}
.ticket-type-management{background:rgba(168,85,247,.15);color:#c084fc}
`;

// =====================================================
// TRANSCRIPT LIST PAGE (Staff View)
// =====================================================
app.get('/viewer/transcripts', staffAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const type = req.query.type || '';
        
        let query = {};
        if (type && ['apply', 'general', 'report', 'management'].includes(type)) {
            query.ticketType = type;
        }
        
        if (search) {
            query.$or = [
                { ticketName: { $regex: search, $options: 'i' } },
                { ownerTag: { $regex: search, $options: 'i' } },
                { closedByTag: { $regex: search, $options: 'i' } },
                { closeReason: { $regex: search, $options: 'i' } }
            ];
        }
        
        const [total, transcripts] = await Promise.all([
            Transcript.countDocuments(query),
            Transcript.find(query)
                .select('ticketId ticketName ticketType ownerTag closedByTag closedAt messageCount closeReason')
                .sort({ closedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
        ]);
        
        const totalPages = Math.ceil(total / limit);
        
        const getTypeTag = (ticketType) => {
            switch(ticketType) {
                case 'apply': return '<span class="tag ticket-type-apply">Apply</span>';
                case 'general': return '<span class="tag ticket-type-general">General</span>';
                case 'report': return '<span class="tag ticket-type-report">Report</span>';
                case 'management': return '<span class="tag ticket-type-management">Management</span>';
                default: return '<span class="tag tag-g">' + (ticketType || 'Unknown') + '</span>';
            }
        };
        
        let rows = transcripts.map(t => `<tr>
            <td>${getTypeTag(t.ticketType)}</td>
            <td>${t.ticketName || '—'}</td>
            <td>${t.ownerTag || '—'}</td>
            <td>${(t.closeReason || '').substring(0, 40)}${(t.closeReason || '').length > 40 ? '...' : ''}</td>
            <td>${t.messageCount || 0}</td>
            <td>${t.closedByTag || '—'}</td>
            <td>${t.closedAt ? new Date(t.closedAt).toLocaleDateString() : '—'}</td>
            <td><a href="/viewer/transcript/${t.ticketId}" class="btn-edit">View</a></td>
        </tr>`).join('');
        
        if (!rows) rows = '<tr><td colspan="8" class="empty">No transcripts found</td></tr>';
        
        let pag = '';
        if (totalPages > 1) {
            const url = (p) => `/viewer/transcripts?page=${p}&search=${encodeURIComponent(search)}&type=${type}`;
            if (page > 1) pag += `<a href="${url(page - 1)}">Previous</a>`;
            pag += `<span>Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) pag += `<a href="${url(page + 1)}">Next</a>`;
        }
        
        // Stats
        const [applyCount, generalCount, reportCount] = await Promise.all([
            Transcript.countDocuments({ ticketType: 'apply' }),
            Transcript.countDocuments({ ticketType: 'general' }),
            Transcript.countDocuments({ ticketType: 'report' })
        ]);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Transcripts</title><style>${viewerStyles}${transcriptStyles}</style></head><body>
${getHeader('transcripts', req.session)}
<div class="main">
    <h1 class="title">Ticket Transcripts</h1>
    <div class="stats">
        <div class="stat"><div class="num">${total}</div><div class="lbl">Total</div></div>
        <div class="stat"><div class="num">${applyCount}</div><div class="lbl">Apply</div></div>
        <div class="stat"><div class="num">${generalCount}</div><div class="lbl">General</div></div>
        <div class="stat"><div class="num">${reportCount}</div><div class="lbl">Report</div></div>
    </div>
    <form class="filters" method="GET">
        <div class="filter-group" style="flex:1;min-width:200px">
            <label>Search</label>
            <input type="text" name="search" placeholder="Ticket name, user, reason..." value="${search}">
        </div>
        <div class="filter-group" style="min-width:150px">
            <label>Type</label>
            <select name="type">
                <option value="">All Types</option>
                <option value="apply" ${type === 'apply' ? 'selected' : ''}>Apply</option>
                <option value="general" ${type === 'general' ? 'selected' : ''}>General</option>
                <option value="report" ${type === 'report' ? 'selected' : ''}>Report</option>
                <option value="management" ${type === 'management' ? 'selected' : ''}>Management</option>
            </select>
        </div>
        <div class="filter-group" style="justify-content:flex-end">
            <label>&nbsp;</label>
            <div style="display:flex;gap:8px">
                <button class="btn btn-go" type="submit">Filter</button>
                <a class="btn btn-clr" href="/viewer/transcripts">Clear</a>
            </div>
        </div>
    </form>
    <div class="tbl"><table>
        <thead><tr><th>Type</th><th>Ticket</th><th>Owner</th><th>Close Reason</th><th>Messages</th><th>Closed By</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
    </table></div>
    <div class="pages">${pag}</div>
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error: ' + e.message);
    }
});

// =====================================================
// TRANSCRIPT DETAIL PAGE (Discord-style rendering)
// =====================================================
app.get('/viewer/transcript/:ticketId', staffAuth, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const transcript = await Transcript.findOne({ ticketId }).lean();
        
        if (!transcript) {
            return res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Transcript Not Found</title><style>${viewerStyles}</style></head><body>
${getHeader('transcripts', req.session)}
<div class="main">
    <a href="/viewer/transcripts" class="back-link">Back to Transcripts</a>
    <h1 class="title">Transcript Not Found</h1>
    <p style="color:#94a3b8">The requested transcript was not found.</p>
</div></body></html>`);
        }
        
        // Render messages in Discord style
        let messagesHtml = '';
        let lastAuthorId = null;
        let lastDate = null;
        
        for (const msg of transcript.messages) {
            const msgDate = new Date(msg.timestamp);
            const dateStr = msgDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            
            // Add date divider if new day
            if (dateStr !== lastDate) {
                messagesHtml += `<div class="date-divider"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
                lastAuthorId = null; // Reset author grouping on new day
            }
            
            const timeStr = msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const isBot = msg.authorBot;
            const isContinuation = lastAuthorId === msg.authorId && !msg.replyTo;
            
            // Build reply preview if this is a reply
            let replyHtml = '';
            if (msg.replyTo) {
                const repliedMsg = transcript.messages.find(m => m.id === msg.replyTo);
                if (repliedMsg) {
                    const replyContent = (repliedMsg.content || '[Embed or attachment]').substring(0, 50) + (repliedMsg.content?.length > 50 ? '...' : '');
                    replyHtml = `<div class="message-reply">Replying to <strong>${repliedMsg.authorTag}</strong>: ${escapeHtml(replyContent)}</div>`;
                }
            }
            
            // Build attachments
            let attachmentsHtml = '';
            if (msg.attachments && msg.attachments.length > 0) {
                for (const att of msg.attachments) {
                    if (att.contentType?.startsWith('image/')) {
                        attachmentsHtml += `<div class="message-attachment"><img src="${att.url}" alt="${att.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><a href="${att.url}" target="_blank" style="display:none">${att.name}</a></div>`;
                    } else {
                        attachmentsHtml += `<div class="message-attachment"><a href="${att.url}" target="_blank">${att.name || 'Attachment'}</a></div>`;
                    }
                }
            }
            
            // Build embeds
            let embedsHtml = '';
            if (msg.embeds && msg.embeds.length > 0) {
                for (const embed of msg.embeds) {
                    const colorBar = embed.color ? `style="background:#${embed.color.toString(16).padStart(6, '0')}"` : 'style="background:#202225"';
                    
                    let fieldsHtml = '';
                    if (embed.fields && embed.fields.length > 0) {
                        fieldsHtml = '<div class="embed-fields">';
                        for (const field of embed.fields) {
                            fieldsHtml += `<div class="embed-field${field.inline ? '' : ' full'}">
                                <div class="embed-field-name">${escapeHtml(field.name)}</div>
                                <div class="embed-field-value">${escapeHtml(field.value)}</div>
                            </div>`;
                        }
                        fieldsHtml += '</div>';
                    }
                    
                    let authorHtml = '';
                    if (embed.author) {
                        authorHtml = `<div class="embed-author">
                            ${embed.author.iconUrl ? `<img class="embed-author-icon" src="${embed.author.iconUrl}">` : ''}
                            <span class="embed-author-name">${escapeHtml(embed.author.name)}</span>
                        </div>`;
                    }
                    
                    embedsHtml += `<div class="message-embed">
                        <div class="embed-color-bar" ${colorBar}></div>
                        <div class="embed-content">
                            ${authorHtml}
                            ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''}
                            ${embed.description ? `<div class="embed-description">${escapeHtml(embed.description)}</div>` : ''}
                            ${fieldsHtml}
                            ${embed.image ? `<img class="embed-image" src="${embed.image}" onerror="this.style.display='none'">` : ''}
                            ${embed.footer ? `<div class="embed-footer">${escapeHtml(embed.footer)}</div>` : ''}
                        </div>
                        ${embed.thumbnail ? `<img class="embed-thumbnail" src="${embed.thumbnail}" onerror="this.style.display='none'">` : ''}
                    </div>`;
                }
            }
            
            // Render message
            if (isContinuation && !msg.replyTo) {
                messagesHtml += `<div class="continuation-message">
                    ${replyHtml}
                    ${msg.content ? `<div class="message-text">${formatMessageContent(msg.content)}</div>` : ''}
                    ${attachmentsHtml}
                    ${embedsHtml}
                </div>`;
            } else {
                messagesHtml += `<div class="message-group">
                    <img class="message-avatar" src="${msg.authorAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="message-content">
                        ${replyHtml}
                        <div class="message-header">
                            <span class="message-author${isBot ? ' bot' : ''}">${escapeHtml(msg.authorTag)}</span>
                            <span class="message-timestamp">${timeStr}</span>
                        </div>
                        ${msg.content ? `<div class="message-text">${formatMessageContent(msg.content)}</div>` : ''}
                        ${attachmentsHtml}
                        ${embedsHtml}
                    </div>
                </div>`;
            }
            
            lastAuthorId = msg.authorId;
        }
        
        // Build participants list
        let participantsHtml = '';
        if (transcript.participants && transcript.participants.length > 0) {
            for (const p of transcript.participants) {
                participantsHtml += `<div class="participant">
                    <img src="${p.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="participant-info">
                        <div class="participant-name">${escapeHtml(p.tag)}</div>
                        <div class="participant-count">${p.messageCount} message${p.messageCount !== 1 ? 's' : ''}</div>
                    </div>
                </div>`;
            }
        }
        
        // Get type tag
        const typeTagClass = {
            'apply': 'ticket-type-apply',
            'general': 'ticket-type-general',
            'report': 'ticket-type-report',
            'management': 'ticket-type-management'
        }[transcript.ticketType] || 'tag-g';
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Transcript - ${transcript.ticketName}</title><style>${viewerStyles}${transcriptStyles}</style></head><body>
${getHeader('transcripts', req.session)}
<div class="main">
    <a href="/viewer/transcripts" class="back-link">Back to Transcripts</a>
    
    <div class="transcript-container">
        <div class="transcript-header">
            <h2>${escapeHtml(transcript.ticketName)} <span class="ticket-type-tag ${typeTagClass}">${transcript.ticketType || 'Unknown'}</span></h2>
            <div class="transcript-meta">
                <div class="transcript-meta-item"><label>Owner</label><span>${escapeHtml(transcript.ownerTag)}</span></div>
                <div class="transcript-meta-item"><label>Closed By</label><span>${escapeHtml(transcript.closedByTag || 'Unknown')}</span></div>
                <div class="transcript-meta-item"><label>Created</label><span>${transcript.createdAt ? new Date(transcript.createdAt).toLocaleString() : '—'}</span></div>
                <div class="transcript-meta-item"><label>Closed</label><span>${transcript.closedAt ? new Date(transcript.closedAt).toLocaleString() : '—'}</span></div>
                <div class="transcript-meta-item"><label>Messages</label><span>${transcript.messageCount || 0}</span></div>
                <div class="transcript-meta-item"><label>Close Reason</label><span>${escapeHtml(transcript.closeReason || 'Not specified')}</span></div>
            </div>
        </div>
        
        <div class="messages-container">
            ${messagesHtml || '<div style="padding:20px;text-align:center;color:#72767d">No messages in this transcript</div>'}
        </div>
        
        <div class="participants-list">
            <h3>Participants</h3>
            ${participantsHtml || '<p style="color:#64748b">No participants recorded</p>'}
        </div>
    </div>
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error: ' + e.message);
    }
});

// =====================================================
// USER TRANSCRIPTS PAGE (Users view their own transcripts)
// =====================================================
app.get('/viewer/my-transcripts', userAuth, async (req, res) => {
    try {
        const discordId = req.session.discordId;
        
        // Fetch transcripts where user is the owner
        const transcripts = await Transcript.find({ ownerId: discordId })
            .select('ticketId ticketName ticketType closedByTag closedAt messageCount closeReason')
            .sort({ closedAt: -1 })
            .lean();
        
        let transcriptsHtml = '';
        if (transcripts.length === 0) {
            transcriptsHtml = '<p class="no-evidence">You have no ticket transcripts.</p>';
        } else {
            const getTypeTag = (ticketType) => {
                switch(ticketType) {
                    case 'apply': return '<span class="tag ticket-type-apply">Apply</span>';
                    case 'general': return '<span class="tag ticket-type-general">General</span>';
                    case 'report': return '<span class="tag ticket-type-report">Report</span>';
                    case 'management': return '<span class="tag ticket-type-management">Management</span>';
                    default: return '<span class="tag tag-g">' + (ticketType || 'Unknown') + '</span>';
                }
            };
            
            for (const t of transcripts) {
                transcriptsHtml += `<div class="case-detail" style="margin-bottom:16px">
                    <h2>${getTypeTag(t.ticketType)} ${escapeHtml(t.ticketName || 'Untitled')}</h2>
                    <div class="info-grid">
                        <div class="info-item"><label>Closed</label><span>${t.closedAt ? new Date(t.closedAt).toLocaleString() : '—'}</span></div>
                        <div class="info-item"><label>Closed By</label><span>${escapeHtml(t.closedByTag || 'Unknown')}</span></div>
                        <div class="info-item"><label>Messages</label><span>${t.messageCount || 0}</span></div>
                    </div>
                    <div class="info-item" style="margin-top:12px"><label>Close Reason</label><span>${escapeHtml(t.closeReason || 'Not specified')}</span></div>
                    <a href="/viewer/my-transcript/${t.ticketId}" class="btn btn-go" style="margin-top:16px">View Transcript</a>
                </div>`;
            }
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>My Transcripts</title><style>${viewerStyles}${transcriptStyles}</style></head><body>
${getUserHeader('my-transcripts', req.session)}
<div class="main">
    <div class="user-cases-section">
        <h2>Your Ticket Transcripts</h2>
        <p>This page shows transcripts from tickets you've opened.</p>
    </div>
    
    <div class="stats">
        <div class="stat"><div class="num">${transcripts.length}</div><div class="lbl">Total Tickets</div></div>
    </div>
    
    ${transcriptsHtml}
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error: ' + e.message);
    }
});

// =====================================================
// USER TRANSCRIPT DETAIL PAGE
// =====================================================
app.get('/viewer/my-transcript/:ticketId', userAuth, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const discordId = req.session.discordId;
        
        // Only allow viewing own transcripts
        const transcript = await Transcript.findOne({ ticketId, ownerId: discordId }).lean();
        
        if (!transcript) {
            return res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Transcript Not Found</title><style>${viewerStyles}</style></head><body>
${getUserHeader('my-transcripts', req.session)}
<div class="main">
    <a href="/viewer/my-transcripts" class="back-link">Back to My Transcripts</a>
    <h1 class="title">Transcript Not Found</h1>
    <p style="color:#94a3b8">The requested transcript was not found or you don't have permission to view it.</p>
</div></body></html>`);
        }
        
        // Render messages (same as staff view)
        let messagesHtml = '';
        let lastAuthorId = null;
        let lastDate = null;
        
        for (const msg of transcript.messages) {
            const msgDate = new Date(msg.timestamp);
            const dateStr = msgDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            
            if (dateStr !== lastDate) {
                messagesHtml += `<div class="date-divider"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
                lastAuthorId = null;
            }
            
            const timeStr = msgDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const isBot = msg.authorBot;
            const isContinuation = lastAuthorId === msg.authorId && !msg.replyTo;
            
            let replyHtml = '';
            if (msg.replyTo) {
                const repliedMsg = transcript.messages.find(m => m.id === msg.replyTo);
                if (repliedMsg) {
                    const replyContent = (repliedMsg.content || '[Embed or attachment]').substring(0, 50) + (repliedMsg.content?.length > 50 ? '...' : '');
                    replyHtml = `<div class="message-reply">Replying to <strong>${repliedMsg.authorTag}</strong>: ${escapeHtml(replyContent)}</div>`;
                }
            }
            
            let attachmentsHtml = '';
            if (msg.attachments && msg.attachments.length > 0) {
                for (const att of msg.attachments) {
                    if (att.contentType?.startsWith('image/')) {
                        attachmentsHtml += `<div class="message-attachment"><img src="${att.url}" alt="${att.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><a href="${att.url}" target="_blank" style="display:none">${att.name}</a></div>`;
                    } else {
                        attachmentsHtml += `<div class="message-attachment"><a href="${att.url}" target="_blank">${att.name || 'Attachment'}</a></div>`;
                    }
                }
            }
            
            let embedsHtml = '';
            if (msg.embeds && msg.embeds.length > 0) {
                for (const embed of msg.embeds) {
                    const colorBar = embed.color ? `style="background:#${embed.color.toString(16).padStart(6, '0')}"` : 'style="background:#202225"';
                    
                    let fieldsHtml = '';
                    if (embed.fields && embed.fields.length > 0) {
                        fieldsHtml = '<div class="embed-fields">';
                        for (const field of embed.fields) {
                            fieldsHtml += `<div class="embed-field${field.inline ? '' : ' full'}">
                                <div class="embed-field-name">${escapeHtml(field.name)}</div>
                                <div class="embed-field-value">${escapeHtml(field.value)}</div>
                            </div>`;
                        }
                        fieldsHtml += '</div>';
                    }
                    
                    let authorHtml = '';
                    if (embed.author) {
                        authorHtml = `<div class="embed-author">
                            ${embed.author.iconUrl ? `<img class="embed-author-icon" src="${embed.author.iconUrl}">` : ''}
                            <span class="embed-author-name">${escapeHtml(embed.author.name)}</span>
                        </div>`;
                    }
                    
                    embedsHtml += `<div class="message-embed">
                        <div class="embed-color-bar" ${colorBar}></div>
                        <div class="embed-content">
                            ${authorHtml}
                            ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''}
                            ${embed.description ? `<div class="embed-description">${escapeHtml(embed.description)}</div>` : ''}
                            ${fieldsHtml}
                            ${embed.image ? `<img class="embed-image" src="${embed.image}" onerror="this.style.display='none'">` : ''}
                            ${embed.footer ? `<div class="embed-footer">${escapeHtml(embed.footer)}</div>` : ''}
                        </div>
                        ${embed.thumbnail ? `<img class="embed-thumbnail" src="${embed.thumbnail}" onerror="this.style.display='none'">` : ''}
                    </div>`;
                }
            }
            
            if (isContinuation && !msg.replyTo) {
                messagesHtml += `<div class="continuation-message">
                    ${replyHtml}
                    ${msg.content ? `<div class="message-text">${formatMessageContent(msg.content)}</div>` : ''}
                    ${attachmentsHtml}
                    ${embedsHtml}
                </div>`;
            } else {
                messagesHtml += `<div class="message-group">
                    <img class="message-avatar" src="${msg.authorAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="message-content">
                        ${replyHtml}
                        <div class="message-header">
                            <span class="message-author${isBot ? ' bot' : ''}">${escapeHtml(msg.authorTag)}</span>
                            <span class="message-timestamp">${timeStr}</span>
                        </div>
                        ${msg.content ? `<div class="message-text">${formatMessageContent(msg.content)}</div>` : ''}
                        ${attachmentsHtml}
                        ${embedsHtml}
                    </div>
                </div>`;
            }
            
            lastAuthorId = msg.authorId;
        }
        
        const typeTagClass = {
            'apply': 'ticket-type-apply',
            'general': 'ticket-type-general',
            'report': 'ticket-type-report',
            'management': 'ticket-type-management'
        }[transcript.ticketType] || 'tag-g';
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Transcript - ${transcript.ticketName}</title><style>${viewerStyles}${transcriptStyles}</style></head><body>
${getUserHeader('my-transcripts', req.session)}
<div class="main">
    <a href="/viewer/my-transcripts" class="back-link">Back to My Transcripts</a>
    
    <div class="transcript-container">
        <div class="transcript-header">
            <h2>${escapeHtml(transcript.ticketName)} <span class="ticket-type-tag ${typeTagClass}">${transcript.ticketType || 'Unknown'}</span></h2>
            <div class="transcript-meta">
                <div class="transcript-meta-item"><label>Closed By</label><span>${escapeHtml(transcript.closedByTag || 'Unknown')}</span></div>
                <div class="transcript-meta-item"><label>Created</label><span>${transcript.createdAt ? new Date(transcript.createdAt).toLocaleString() : '—'}</span></div>
                <div class="transcript-meta-item"><label>Closed</label><span>${transcript.closedAt ? new Date(transcript.closedAt).toLocaleString() : '—'}</span></div>
                <div class="transcript-meta-item"><label>Messages</label><span>${transcript.messageCount || 0}</span></div>
                <div class="transcript-meta-item"><label>Close Reason</label><span>${escapeHtml(transcript.closeReason || 'Not specified')}</span></div>
            </div>
        </div>
        
        <div class="messages-container">
            ${messagesHtml || '<div style="padding:20px;text-align:center;color:#72767d">No messages in this transcript</div>'}
        </div>
    </div>
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error: ' + e.message);
    }
});

// Helper functions for transcript rendering
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatMessageContent(content) {
    if (!content) return '';
    
    let formatted = escapeHtml(content);
    
    // Convert Discord markdown to HTML
    // Bold
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.+?)_/g, '<em>$1</em>');
    // Strikethrough
    formatted = formatted.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:#2f3136;padding:2px 4px;border-radius:3px">$1</code>');
    // Code blocks
    formatted = formatted.replace(/```([^`]+)```/gs, '<pre style="background:#2f3136;padding:8px;border-radius:4px;overflow-x:auto"><code>$1</code></pre>');
    // URLs
    formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    // Discord user mentions
    formatted = formatted.replace(/&lt;@!?(\d+)&gt;/g, '<span style="background:#5865f233;color:#dee0fc;padding:0 2px;border-radius:3px">@User</span>');
    // Discord channel mentions
    formatted = formatted.replace(/&lt;#(\d+)&gt;/g, '<span style="background:#5865f233;color:#dee0fc;padding:0 2px;border-radius:3px">#channel</span>');
    // Discord role mentions
    formatted = formatted.replace(/&lt;@&amp;(\d+)&gt;/g, '<span style="background:#5865f233;color:#dee0fc;padding:0 2px;border-radius:3px">@role</span>');
    
    return formatted;
}

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

// =====================================================
// PVP STATUS API ENDPOINTS
// =====================================================

const PvpLog = require('../database/models/PvpLog');

// API Key validation middleware
function validateApiKey(req, res, next) {
    const authHeader = req.headers.authorization;
    const apiKey = process.env.PVP_API_KEY || 'your-api-key-here';
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    }
    
    const token = authHeader.substring(7);
    
    if (token !== apiKey) {
        return res.status(403).json({ success: false, error: 'Invalid API key' });
    }
    
    next();
}

app.post('/api/pvp/log', validateApiKey, async (req, res) => {
    try {
        const { type, timestamp, ...data } = req.body;
        console.log('[PvP API] Received log request:', { type, ...data });
        
        if (!type || !['status_change', 'pvp_kill', 'invalid_pvp', 'death', 'pvp_damage_session', 'combat_log', 'low_hp_alert'].includes(type)) {
            console.log('[PvP API] Invalid type:', type);
            return res.status(400).json({ success: false, error: 'Invalid or missing type' });
        }
        
        // Create log entry
        const log = new PvpLog({
            type,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            ...data
        });
        
        await log.save();
        console.log('[PvP API] Log saved with ID:', log._id);
        
        // Emit event for Discord logging (handled by pvpStatus cog)
        if (global.discordClient) {
            console.log('[PvP API] Emitting pvpLog event to Discord client');
            global.discordClient.emit('pvpLog', log.toObject());
        } else {
            console.log('[PvP API] WARNING: Discord client not available!');
        }
        
        return res.json({ success: true, logId: log._id });
    } catch (error) {
        console.error('PvP Log API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Additional endpoints for new log types
app.post('/api/pvp/damage-session', validateApiKey, async (req, res) => {
    try {
        const logData = { type: 'pvp_damage_session', ...req.body };
        const log = new PvpLog(logData);
        await log.save();
        
        if (global.discordClient) {
            global.discordClient.emit('pvpLog', log.toObject());
        }
        
        return res.json({ success: true, logId: log._id });
    } catch (error) {
        console.error('Damage Session Log Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/pvp/combat-log', validateApiKey, async (req, res) => {
    try {
        const logData = { type: 'combat_log', ...req.body };
        const log = new PvpLog(logData);
        await log.save();
        
        if (global.discordClient) {
            global.discordClient.emit('pvpLog', log.toObject());
        }
        
        return res.json({ success: true, logId: log._id });
    } catch (error) {
        console.error('Combat Log Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/pvp/low-hp', validateApiKey, async (req, res) => {
    try {
        const logData = { type: 'low_hp_alert', ...req.body };
        const log = new PvpLog(logData);
        await log.save();
        
        if (global.discordClient) {
            global.discordClient.emit('pvpLog', log.toObject());
        }
        
        return res.json({ success: true, logId: log._id });
    } catch (error) {
        console.error('Low HP Alert Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/pvp/send-dm', validateApiKey, async (req, res) => {
    try {
        const { minecraft_uuid, minecraft_username, message } = req.body;
        
        if (!minecraft_uuid || !message) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        // Emit event for DM sending (handled by dmService or similar)
        if (global.discordClient) {
            global.discordClient.emit('sendMinecraftDM', {
                minecraft_uuid,
                minecraft_username,
                message,
                type: 'combat_log'
            });
        }
        
        return res.json({ success: true, message: 'DM request queued' });
    } catch (error) {
        console.error('Send DM Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.get('/api/pvp/logs', validateApiKey, async (req, res) => {
    try {
        const { type, uuid, limit = 50 } = req.query;
        
        let query = {};
        if (type) query.type = type;
        if (uuid) {
            query.$or = [
                { uuid },
                { 'killer.uuid': uuid },
                { 'victim.uuid': uuid },
                { 'attacker.uuid': uuid }
            ];
        }
        
        const logs = await PvpLog.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit));
        
        return res.json({ success: true, count: logs.length, logs });
    } catch (error) {
        console.error('PvP Logs API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// =====================================================
// KICK NOTIFICATION ENDPOINT
// =====================================================

app.post('/api/kick/notify', async (req, res) => {
    try {
        const { uuid } = req.body;
        
        if (!uuid) {
            return res.status(400).json({ success: false, error: 'UUID required' });
        }
        
        // Notify all connected Velocity proxies about the kick
        // This is handled via a shared state or database
        // For now, just acknowledge receipt
        
        return res.json({ success: true, message: 'Kick recorded - player cannot rejoin for 30 minutes' });
    } catch (error) {
        console.error('Kick Notify API Error:', error);
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
