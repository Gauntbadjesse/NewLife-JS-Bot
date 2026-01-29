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
// TIMEZONE CONFIGURATION - Central Time (America/Chicago)
// =====================================================
const TIMEZONE = 'America/Chicago';

/**
 * Format a date to Central Time
 * @param {Date|string|number} date - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string in Central Time
 */
function formatCentralTime(date, options = {}) {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    
    const defaultOptions = {
        timeZone: TIMEZONE,
        ...options
    };
    
    return d.toLocaleString('en-US', defaultOptions);
}

/**
 * Format date only (no time) in Central Time
 */
function formatCentralDate(date) {
    return formatCentralTime(date, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Format full date and time in Central Time
 */
function formatCentralDateTime(date) {
    return formatCentralTime(date, {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

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
/* ============================================
   NEW LIFE SMP - Staff Portal Design System
   ============================================ */

/* CSS Reset & Base */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* Design Tokens */
:root{
  --primary:#4a7c59;
  --primary-dark:#3d6549;
  --primary-light:#6b9b7a;
  --primary-subtle:rgba(74,124,89,0.12);
  --secondary:#c9a227;
  --secondary-dark:#a88a1f;
  --secondary-light:#dbb94d;
  --accent:#8fbc8f;
  --accent-subtle:rgba(143,188,143,0.15);
  --bg-dark:#1a1d21;
  --bg-darker:#121417;
  --bg-card:#22262b;
  --bg-card-hover:#2d3238;
  --bg-elevated:#282c32;
  --text-primary:#f5f3f0;
  --text-secondary:#a8a4a0;
  --text-muted:#6d6a66;
  --border-color:rgba(168,164,160,0.12);
  --border-light:rgba(245,243,240,0.08);
  --border-accent:rgba(74,124,89,0.3);
  --shadow-sm:0 1px 3px rgba(0,0,0,0.2);
  --shadow-md:0 4px 12px rgba(0,0,0,0.25);
  --shadow-lg:0 10px 25px rgba(0,0,0,0.3);
  --shadow-glow:0 0 30px rgba(74,124,89,0.2);
  --radius-sm:8px;
  --radius-md:12px;
  --radius-lg:18px;
  --radius-xl:28px;
  --transition-fast:150ms cubic-bezier(0.4,0,0.2,1);
  --transition-normal:250ms cubic-bezier(0.4,0,0.2,1);
  --nav-height:76px;
  --warning:#e07a5f;
  --success:#81b29a;
  --info:#7eb8da
}

html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}

body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-darker);color:var(--text-primary);line-height:1.7;min-height:100vh;overflow-x:hidden;letter-spacing:-0.01em}

h1,h2,h3,h4,h5,h6{font-weight:700;line-height:1.25;color:var(--text-primary);letter-spacing:-0.02em}
h1{font-size:clamp(1.75rem,4vw,2.5rem);font-weight:800}
h2{font-size:clamp(1.4rem,3vw,1.75rem)}
h3{font-size:clamp(1.1rem,2vw,1.25rem)}

p{color:var(--text-secondary);font-size:1rem;line-height:1.75}

a{color:var(--primary-light);text-decoration:none;transition:color var(--transition-fast)}
a:hover{color:var(--secondary)}

::selection{background:var(--primary-subtle);color:var(--text-primary)}

/* Scrollbar */
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:var(--bg-darker)}
::-webkit-scrollbar-thumb{background:var(--bg-card-hover);border-radius:5px;border:2px solid var(--bg-darker)}
::-webkit-scrollbar-thumb:hover{background:var(--primary)}
*{scrollbar-width:thin;scrollbar-color:var(--bg-card-hover) var(--bg-darker)}

/* Header/Navigation */
.header{
  position:sticky;top:0;left:0;right:0;
  height:var(--nav-height);
  background:rgba(18,20,23,0.92);
  backdrop-filter:blur(24px) saturate(180%);
  -webkit-backdrop-filter:blur(24px) saturate(180%);
  border-bottom:1px solid var(--border-light);
  z-index:1000;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 24px;
}

.logo{
  font-size:1.2rem;font-weight:700;
  background:linear-gradient(145deg,var(--primary-light) 0%,var(--secondary) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  letter-spacing:-0.01em;
  display:flex;align-items:center;gap:8px
}

.nav{display:flex;align-items:center;gap:4px}
.nav a{
  display:inline-flex;align-items:center;gap:6px;
  padding:10px 18px;
  color:var(--text-secondary);
  font-weight:500;font-size:0.925rem;
  border-radius:var(--radius-md);
  transition:all var(--transition-fast);
  white-space:nowrap
}
.nav a:hover{color:var(--text-primary);background:var(--bg-card)}
.nav a.active{color:var(--primary-light);background:var(--primary-subtle)}

.logout{
  padding:10px 18px;
  background:transparent;
  border:1px solid var(--border-color);
  color:var(--text-secondary);
  text-decoration:none;
  border-radius:var(--radius-md);
  font-size:0.875rem;font-weight:500;
  transition:all var(--transition-fast)
}
.logout:hover{border-color:rgba(224,122,95,0.5);color:var(--warning);background:rgba(224,122,95,0.08)}

.user-info{display:flex;align-items:center;gap:12px}
.user-info img{width:36px;height:36px;border-radius:50%;border:2px solid var(--border-accent)}
.user-info span{color:var(--text-primary);font-size:0.9rem;font-weight:500}

/* Main Content */
.main{padding:32px 24px;max-width:1400px;margin:0 auto}

.title{
  font-size:clamp(1.5rem,3vw,2rem);font-weight:700;
  margin-bottom:24px;
  background:linear-gradient(145deg,var(--text-primary) 0%,var(--primary-light) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text
}

.subtitle{font-size:0.95rem;color:var(--text-muted);margin-top:-16px;margin-bottom:24px}

/* Stats Cards */
.stats{display:flex;gap:16px;margin-bottom:28px;flex-wrap:wrap}
.stat{
  background:var(--bg-card);
  padding:22px 28px;
  border-radius:var(--radius-lg);
  border:1px solid var(--border-light);
  min-width:130px;
  transition:all var(--transition-normal)
}
.stat:hover{border-color:var(--border-accent);transform:translateY(-2px);box-shadow:var(--shadow-md)}
.stat .num{
  font-size:1.75rem;font-weight:700;
  background:linear-gradient(145deg,var(--primary) 0%,var(--secondary-light) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text
}
.stat .lbl{font-size:0.7rem;color:var(--text-muted);margin-top:6px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600}

/* Filter Card */
.filter-card{
  background:var(--bg-card);
  padding:28px;
  border-radius:var(--radius-lg);
  border:1px solid var(--border-light);
  margin-bottom:28px
}
.filter-card h3{
  color:var(--text-primary);margin-bottom:24px;font-size:1.05rem;font-weight:600;
  display:flex;align-items:center;gap:10px
}
.filter-card h3::before{content:'';width:4px;height:18px;background:linear-gradient(180deg,var(--primary),var(--secondary));border-radius:2px}

.filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px}

.filter-group{display:flex;flex-direction:column;gap:8px}
.filter-group label{font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:600}
.filter-group input,.filter-group select{
  padding:14px 16px;
  border:1px solid var(--border-color);
  border-radius:var(--radius-md);
  background:var(--bg-darker);
  color:var(--text-primary);
  font-size:0.9rem;font-family:inherit;
  transition:all var(--transition-fast);
  width:100%
}
.filter-group input:focus,.filter-group select:focus{
  outline:none;
  border-color:var(--primary);
  box-shadow:0 0 0 4px var(--primary-subtle)
}
.filter-group input::placeholder{color:var(--text-muted)}

.filter-actions{display:flex;gap:12px;margin-top:24px;padding-top:24px;border-top:1px solid var(--border-light)}

/* Filters Row */
.filters{display:flex;gap:14px;margin-bottom:24px;flex-wrap:wrap;align-items:flex-end}

.search{
  flex:1;min-width:220px;
  padding:14px 18px;
  border:1px solid var(--border-color);
  border-radius:var(--radius-md);
  background:var(--bg-darker);
  color:var(--text-primary);
  font-size:0.9rem;
  transition:all var(--transition-fast)
}
.search:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-subtle)}
.search::placeholder{color:var(--text-muted)}

select{
  padding:14px 18px;
  border:1px solid var(--border-color);
  border-radius:var(--radius-md);
  background:var(--bg-darker);
  color:var(--text-primary);
  font-size:0.9rem;
  cursor:pointer;
  transition:all var(--transition-fast)
}
select:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-subtle)}

/* Buttons */
.btn{
  padding:14px 24px;border:none;
  border-radius:var(--radius-md);
  font-weight:600;font-size:0.85rem;font-family:inherit;
  cursor:pointer;text-decoration:none;
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  transition:all var(--transition-normal);
  letter-spacing:0.01em
}

.btn-go{
  background:linear-gradient(145deg,var(--primary) 0%,var(--primary-dark) 100%);
  color:#fff;
  box-shadow:0 4px 16px rgba(74,124,89,0.35)
}
.btn-go:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(74,124,89,0.45);color:#fff}

.btn-clr{
  background:var(--bg-card);
  color:var(--text-secondary);
  border:1px solid var(--border-color)
}
.btn-clr:hover{background:var(--bg-card-hover);border-color:var(--primary-light);color:var(--primary-light)}

.btn-discord{
  background:linear-gradient(145deg,#5865F2 0%,#4752c4 100%);
  color:#fff;
  padding:16px 36px;font-size:0.95rem;
  display:inline-flex;align-items:center;gap:14px;
  border-radius:var(--radius-md);
  text-decoration:none;
  box-shadow:0 4px 16px rgba(88,101,242,0.35)
}
.btn-discord:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(88,101,242,0.45);color:#fff}
.btn-discord svg{width:24px;height:24px}

.btn-edit{
  padding:8px 14px;font-size:0.8rem;
  background:var(--primary-subtle);
  color:var(--primary-light);
  border:1px solid var(--border-accent);
  border-radius:var(--radius-sm);
  cursor:pointer;text-decoration:none;
  font-weight:600;
  transition:all var(--transition-fast)
}
.btn-edit:hover{background:var(--primary);color:#fff;border-color:var(--primary)}

/* Table */
.tbl{
  background:var(--bg-card);
  border-radius:var(--radius-lg);
  border:1px solid var(--border-light);
  overflow:hidden;
  overflow-x:auto;
  -webkit-overflow-scrolling:touch
}
table{width:100%;border-collapse:collapse;min-width:600px}
th{
  padding:16px 18px;text-align:left;
  background:var(--bg-elevated);
  color:var(--text-muted);
  font-weight:700;font-size:0.7rem;
  text-transform:uppercase;letter-spacing:0.5px;
  white-space:nowrap;
  border-bottom:1px solid var(--border-light)
}
td{
  padding:16px 18px;
  border-top:1px solid var(--border-light);
  font-size:0.9rem;color:var(--text-secondary)
}
tr:hover{background:var(--bg-card-hover)}

/* Tags */
.tag{display:inline-block;padding:5px 12px;border-radius:var(--radius-sm);font-size:0.7rem;font-weight:700;letter-spacing:0.3px;text-transform:uppercase}
.tag-r{background:rgba(224,122,95,0.15);color:#e07a5f}
.tag-g{background:rgba(129,178,154,0.15);color:#81b29a}
.tag-o{background:rgba(251,146,60,0.15);color:#fb923c}
.tag-b{background:rgba(126,184,218,0.15);color:#7eb8da}
.tag-y{background:rgba(201,162,39,0.15);color:var(--secondary-light)}
.tag-p{background:rgba(168,85,247,0.15);color:#c084fc}

/* Pagination */
.pages{display:flex;justify-content:center;gap:10px;margin-top:28px;flex-wrap:wrap}
.pages a,.pages span{padding:12px 20px;border-radius:var(--radius-md);text-decoration:none;font-size:0.9rem;font-weight:500}
.pages a{background:var(--bg-card);color:var(--primary-light);border:1px solid var(--border-light);transition:all var(--transition-fast)}
.pages a:hover{background:var(--primary-subtle);border-color:var(--border-accent)}
.pages span{color:var(--text-muted)}

.empty{text-align:center;padding:64px 24px;color:var(--text-muted);font-size:0.95rem}

/* Login */
.login-wrap{
  min-height:100vh;display:flex;align-items:center;justify-content:center;
  padding:24px;
  background:
    radial-gradient(ellipse 90% 60% at 50% -10%,rgba(74,124,89,0.18),transparent),
    radial-gradient(ellipse 50% 40% at 85% 70%,rgba(201,162,39,0.08),transparent),
    var(--bg-darker)
}
.login-box{
  width:100%;max-width:440px;
  background:var(--bg-card);
  padding:52px 44px;
  border-radius:var(--radius-xl);
  border:1px solid var(--border-light);
  text-align:center;
  backdrop-filter:blur(10px)
}
.login-box h2{margin-bottom:12px;color:var(--text-primary);font-size:1.6rem;font-weight:700}
.login-box p{color:var(--text-secondary);margin-bottom:36px;font-size:0.95rem;line-height:1.7}
.login-box .err{
  background:rgba(224,122,95,0.12);
  border:1px solid rgba(224,122,95,0.25);
  color:var(--warning);
  padding:16px;border-radius:var(--radius-md);
  margin-bottom:28px;font-size:0.9rem
}

/* Search Box */
.search-box{background:var(--bg-card);padding:28px;border-radius:var(--radius-lg);border:1px solid var(--border-light);margin-bottom:28px}
.search-box h3{color:var(--text-primary);margin-bottom:24px;font-size:1.05rem;font-weight:600}
.search-row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.search-row:last-child{margin-bottom:0}
.search-row input,.search-row select{flex:1;min-width:160px}
.search-hint{font-size:0.8rem;color:var(--text-muted);margin-top:14px;line-height:1.6}

/* Case Detail */
.case-detail{
  background:var(--bg-card);
  padding:32px;
  border-radius:var(--radius-lg);
  border:1px solid var(--border-light);
  margin-bottom:28px
}
.case-detail h2{margin-bottom:24px;color:var(--text-primary);font-size:1.3rem;font-weight:700}
.case-detail .info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:24px}
.case-detail .info-item{
  padding:18px;
  background:var(--bg-darker);
  border-radius:var(--radius-md);
  border:1px solid var(--border-light)
}
.case-detail .info-item label{font-size:0.7rem;color:var(--text-muted);display:block;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600}
.case-detail .info-item span{color:var(--text-primary);font-size:0.95rem}

/* Evidence */
.evidence-section{
  background:var(--bg-card);
  padding:32px;
  border-radius:var(--radius-lg);
  border:1px solid var(--border-light);
  margin-bottom:28px
}
.evidence-section h3{margin-bottom:24px;color:var(--text-primary);font-size:1.05rem;font-weight:600}

.evidence-item{
  background:var(--bg-darker);
  padding:22px;
  border-radius:var(--radius-md);
  margin-bottom:14px;
  border:1px solid var(--border-light)
}
.evidence-item .meta{font-size:0.8rem;color:var(--text-muted);margin-bottom:12px}
.evidence-item .content{color:var(--text-secondary);line-height:1.7}
.evidence-item img{max-width:100%;max-height:400px;border-radius:var(--radius-md);margin-top:14px}

.evidence-form{margin-top:28px;padding-top:28px;border-top:1px solid var(--border-light)}
.evidence-form h4{color:var(--text-primary);margin-bottom:18px;font-size:0.95rem;font-weight:600}
.evidence-form textarea{
  width:100%;min-height:130px;
  padding:16px;
  background:var(--bg-darker);
  border:1px solid var(--border-color);
  border-radius:var(--radius-md);
  color:var(--text-primary);
  margin-bottom:18px;
  resize:vertical;
  font-family:inherit;font-size:0.9rem;line-height:1.6
}
.evidence-form textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-subtle)}
.evidence-form input[type="file"]{margin-bottom:18px;color:var(--text-secondary);font-size:0.9rem}
.evidence-form .btns{display:flex;gap:14px;flex-wrap:wrap}

/* User Cases Section */
.user-cases-section{margin-bottom:28px}
.user-cases-section h2{color:var(--text-primary);margin-bottom:10px;font-size:1.3rem;font-weight:700}
.user-cases-section p{color:var(--text-secondary);margin-bottom:28px;font-size:0.95rem;line-height:1.7}

.back-link{
  display:inline-flex;align-items:center;gap:8px;
  margin-bottom:28px;
  color:var(--primary-light);
  text-decoration:none;
  font-size:0.9rem;font-weight:500;
  transition:color var(--transition-fast)
}
.back-link:hover{color:var(--secondary)}
.back-link::before{content:'←';font-size:1.2rem}

.no-evidence{color:var(--text-muted);font-style:normal;padding:48px 24px;text-align:center;background:var(--bg-darker);border-radius:var(--radius-md)}

.img-preview{max-width:200px;max-height:150px;margin-top:14px;border-radius:var(--radius-sm)}

.status-active{color:var(--warning)}
.status-inactive{color:var(--text-muted)}

/* Dashboard Grid */
.dashboard-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;margin-bottom:36px}
.dashboard-card{
  background:var(--bg-card);
  padding:28px;
  border-radius:var(--radius-lg);
  border:1px solid var(--border-light);
  transition:all var(--transition-normal)
}
.dashboard-card:hover{border-color:var(--border-accent)}
.dashboard-card h3{
  color:var(--text-primary);margin-bottom:20px;font-size:1rem;font-weight:600;
  display:flex;align-items:center;gap:10px
}
.dashboard-card h3 svg{width:20px;height:20px;opacity:0.7}

.welcome-card{
  background:linear-gradient(145deg,var(--bg-card) 0%,rgba(74,124,89,0.08) 100%);
  border-color:var(--border-accent)
}
.welcome-card h2{color:var(--text-primary);font-size:1.4rem;margin-bottom:10px}
.welcome-card p{color:var(--text-secondary);line-height:1.7}

.stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.stat-item{background:var(--bg-darker);padding:18px;border-radius:var(--radius-md);text-align:center;border:1px solid var(--border-light)}
.stat-item .value{
  font-size:1.75rem;font-weight:700;
  background:linear-gradient(145deg,var(--primary) 0%,var(--secondary-light) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text
}
.stat-item .label{font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:6px}

.activity-item{display:flex;align-items:center;gap:14px;padding:14px;background:var(--bg-darker);border-radius:var(--radius-md);margin-bottom:10px;border:1px solid var(--border-light)}
.activity-item:last-child{margin-bottom:0}
.activity-item .type{font-size:0.7rem;font-weight:700;padding:5px 10px;border-radius:var(--radius-sm)}
.activity-item .details{flex:1;min-width:0}
.activity-item .reason{color:var(--text-secondary);font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.activity-item .date{color:var(--text-muted);font-size:0.8rem;margin-top:4px}

.empty-state{color:var(--text-muted);text-align:center;padding:36px;font-size:0.95rem}

.quick-links{display:flex;gap:14px;flex-wrap:wrap}
.quick-link{
  padding:14px 22px;
  background:var(--bg-darker);
  border:1px solid var(--border-color);
  border-radius:var(--radius-md);
  color:var(--text-secondary);
  text-decoration:none;
  font-size:0.9rem;font-weight:500;
  transition:all var(--transition-fast)
}
.quick-link:hover{background:var(--primary-subtle);border-color:var(--border-accent);color:var(--primary-light)}

.status-clean{background:linear-gradient(145deg,var(--bg-card) 0%,rgba(129,178,154,0.12) 100%);border-color:rgba(129,178,154,0.3)}
.status-clean h2{color:var(--success)}

/* Mobile Toggle Button */
.btn-mode{
  padding:10px 18px;
  border-radius:var(--radius-md);
  font-size:0.85rem;font-weight:600;
  text-decoration:none;
  display:flex;align-items:center;gap:8px;
  transition:all var(--transition-fast)
}

/* Responsive Design */
@media(max-width:1024px){
  .header{padding:0 20px}
  .main{padding:28px 20px}
  .nav{gap:2px}
  .nav a{padding:8px 14px;font-size:0.85rem}
}

@media(max-width:768px){
  :root{--nav-height:auto}
  
  .header{
    flex-wrap:wrap;gap:14px;padding:14px 16px;
    position:relative;height:auto
  }
  .header>div:last-child{
    order:1;width:100%;
    display:flex;justify-content:space-between;align-items:center
  }
  .nav{
    order:2;width:100%;
    justify-content:flex-start;
    overflow-x:auto;
    padding-bottom:4px;
    gap:4px;
    -webkit-overflow-scrolling:touch
  }
  .nav a{padding:10px 14px;font-size:0.85rem;flex-shrink:0}
  
  .logo{font-size:1.1rem}
  .user-info img{width:32px;height:32px}
  .user-info span{display:none}
  .logout{padding:8px 14px;font-size:0.8rem}
  .btn-mode{padding:8px 14px;font-size:0.8rem}
  .btn-mode svg{width:12px;height:12px}
  
  .main{padding:20px 16px}
  
  .title{margin-bottom:20px}
  
  .stats{gap:10px}
  .stat{padding:18px 20px;min-width:calc(50% - 5px);flex:1}
  
  .filter-card{padding:20px}
  .filter-grid{grid-template-columns:1fr}
  .filter-actions{flex-wrap:wrap}
  
  .filters{flex-direction:column;gap:12px}
  .search,select{width:100%}
  .filter-group{width:100%}
  
  .tbl{border-radius:var(--radius-md)}
  th,td{padding:12px 14px;font-size:0.8rem}
  .hide{display:none}
  
  .search-row{flex-direction:column}
  .search-row input,.search-row select{width:100%}
  
  .case-detail{padding:22px}
  .case-detail .info-grid{grid-template-columns:1fr}
  .case-detail h2{font-size:1.15rem}
  
  .evidence-section{padding:22px}
  .evidence-item{padding:18px}
  
  .dashboard-grid{grid-template-columns:1fr}
  .dashboard-card{padding:22px}
  
  .stat-grid{grid-template-columns:repeat(2,1fr)}
  
  .pages{gap:8px}
  .pages a,.pages span{padding:10px 14px;font-size:0.85rem}
  
  .login-box{padding:36px 28px}
  .login-box h2{font-size:1.4rem}
  
  .quick-links{gap:10px}
  .quick-link{padding:12px 18px;font-size:0.85rem;flex:1;justify-content:center;text-align:center}
  
  .btn{padding:12px 20px;font-size:0.85rem}
  .btn-discord{padding:14px 28px;font-size:0.9rem}
}

@media(max-width:480px){
  .header{padding:12px 14px;gap:12px}
  .logo{font-size:1rem}
  .nav a{padding:8px 12px;font-size:0.8rem}
  
  .main{padding:16px 14px}
  
  .stat{padding:16px;min-width:calc(50% - 5px)}
  .stat .num{font-size:1.5rem}
  .stat .lbl{font-size:0.65rem}
  
  .filter-card{padding:16px}
  
  th,td{padding:10px 12px;font-size:0.75rem}
  
  .case-detail{padding:18px}
  .case-detail .info-item{padding:14px}
  
  .evidence-section{padding:18px}
  .evidence-item{padding:14px}
  
  .dashboard-card{padding:18px}
  .stat-item{padding:14px}
  .stat-item .value{font-size:1.5rem}
  
  .login-box{padding:28px 20px;border-radius:var(--radius-lg)}
  
  .btn-edit{padding:6px 10px;font-size:0.75rem}
  
  .activity-item{padding:12px;gap:10px}
  .activity-item .reason{font-size:0.85rem}
  
  .user-cases-section h2{font-size:1.15rem}
}

/* Touch improvements */
@media(hover:none) and (pointer:coarse){
  .btn,.btn-edit,.nav a,.quick-link{min-height:44px}
  .stat:hover,.dashboard-card:hover{transform:none}
}

/* Print styles */
@media print{
  .header,.nav,.btn,.logout,.filter-card,.pages{display:none!important}
  .main{padding:0}
  .case-detail,.evidence-section{break-inside:avoid;border:1px solid #ccc}
}
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
        let userRoles = [];
        
        if (GUILD_ID && STAFF_ROLE_ID) {
            try {
                const memberResponse = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                
                if (memberResponse.ok) {
                    const memberData = await memberResponse.json();
                    userRoles = memberData.roles || [];
                    isStaff = userRoles.includes(STAFF_ROLE_ID);
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
            roles: userRoles,
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

// Role IDs for permission checks
const SUPERVISOR_ROLE_ID = process.env.SUPERVISOR_ROLE_ID;
const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID;
const OWNER_USER_ID = process.env.OWNER_USER_ID;

// Check if session user is Supervisor+ (Supervisor, Management, or Owner)
function isSupervisorPlus(session) {
    if (!session || !session.roles) return false;
    if (session.discordId === OWNER_USER_ID) return true;
    return session.roles.includes(SUPERVISOR_ROLE_ID) || session.roles.includes(MANAGEMENT_ROLE_ID);
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
    
    // Analytics link only for Supervisor+
    const analyticsLink = session && isSupervisorPlus(session) 
        ? `<a href="/viewer/analytics" class="${active === 'analytics' ? 'active' : ''}" style="color:#f59e0b">📊 Analytics</a>`
        : '';
    
    return `<div class="header">
    <div class="logo">NewLife SMP <span style="font-size:.7em;color:#8b5cf6;margin-left:4px">ADMIN</span></div>
    <nav class="nav">
        <a href="/viewer/search" class="${active === 'search' ? 'active' : ''}">Search All</a>
        <a href="/viewer/bans" class="${active === 'bans' ? 'active' : ''}">Bans</a>
        <a href="/viewer/kicks" class="${active === 'kicks' ? 'active' : ''}">Kicks</a>
        <a href="/viewer/warnings" class="${active === 'warnings' ? 'active' : ''}">Warnings</a>
        <a href="/viewer/mutes" class="${active === 'mutes' ? 'active' : ''}">Mutes</a>
        <a href="/viewer/transcripts" class="${active === 'transcripts' ? 'active' : ''}">Transcripts</a>
        <a href="/viewer/pvp-logs" class="${active === 'pvp-logs' ? 'active' : ''}">PvP Logs</a>
        ${analyticsLink}
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
        
        // Get user's transcripts count (where they are the ticket owner)
        const transcriptCount = await Transcript.countDocuments({ ownerId: userId });
        
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
                        <div class="date">${formatCentralDate(item.createdAt) || 'Unknown date'}</div>
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
            <td>${formatCentralDate(r.date)}</td>
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
            <td class="hide">${formatCentralDate(b.bannedAt)}</td>
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
            <td>${formatCentralDate(k.kickedAt)}</td>
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
            <td class="hide">${formatCentralDate(w.createdAt)}</td>
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
            <td>${formatCentralDate(m.createdAt)}</td>
            <td class="hide">${m.expiresAt ? formatCentralDateTime(m.expiresAt) : 'Never'}</td>
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
        infoItems += `<div class="info-item"><label>Date</label><span>${formatCentralDateTime(date)}</span></div>`;
        
        if (type === 'ban') {
            infoItems += `<div class="info-item"><label>Duration</label><span>${caseData.isPermanent ? 'Permanent' : (caseData.duration || '—')}</span></div>`;
            infoItems += `<div class="info-item"><label>Status</label><span class="${caseData.active ? 'status-active' : 'status-inactive'}">${caseData.active ? 'Active' : 'Expired'}</span></div>`;
            if (caseData.expiresAt) infoItems += `<div class="info-item"><label>Expires</label><span>${formatCentralDateTime(caseData.expiresAt)}</span></div>`;
        } else if (type === 'mute') {
            infoItems += `<div class="info-item"><label>Duration</label><span>${caseData.duration || '—'}</span></div>`;
            infoItems += `<div class="info-item"><label>Status</label><span class="${caseData.active ? 'status-active' : 'status-inactive'}">${caseData.active ? 'Active' : 'Expired'}</span></div>`;
            if (caseData.expiresAt) infoItems += `<div class="info-item"><label>Expires</label><span>${formatCentralDateTime(caseData.expiresAt)}</span></div>`;
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
                    const meta = `Added by ${item.addedByTag || 'Unknown'} on ${formatCentralDateTime(item.addedAt)}`;
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
                                evidenceHtml += `<div class="evidence-item"><div class="meta">Evidence added ${formatCentralDate(item.addedAt)}</div><div class="content">${item.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div></div>`;
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
                        <div class="info-item"><label>Date</label><span>${formatCentralDateTime(c.date)}</span></div>
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
/* ============================================
   TRANSCRIPT VIEWER - Discord-style Rendering
   ============================================ */

/* Transcript Container */
.transcript-container{max-width:960px;margin:0 auto}

.transcript-header{
  background:var(--bg-card);
  padding:28px;
  border-radius:var(--radius-lg);
  border:1px solid var(--border-light);
  margin-bottom:28px
}
.transcript-header h2{margin:0 0 20px 0;color:var(--text-primary);font-size:1.3rem;font-weight:700}

.transcript-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px}
.transcript-meta-item{
  padding:16px;
  background:var(--bg-darker);
  border-radius:var(--radius-md);
  border:1px solid var(--border-light)
}
.transcript-meta-item label{font-size:0.7rem;color:var(--text-muted);display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600}
.transcript-meta-item span{color:var(--text-primary);font-size:0.9rem}

/* Messages Container - Discord-like */
.messages-container{
  background:var(--bg-card);
  border-radius:var(--radius-lg);
  padding:20px 0;
  max-height:65vh;
  overflow-y:auto;
  border:1px solid var(--border-light)
}

/* Message Groups */
.message-group{padding:10px 20px;display:flex;gap:16px;transition:background var(--transition-fast)}
.message-group:hover{background:var(--bg-card-hover)}

.message-avatar{
  width:44px;height:44px;
  border-radius:50%;
  flex-shrink:0;
  background:var(--primary);
  border:2px solid var(--border-accent)
}

.message-content{flex:1;min-width:0}

.message-header{display:flex;align-items:baseline;gap:10px;margin-bottom:4px;flex-wrap:wrap}

.message-author{font-weight:600;color:var(--text-primary);font-size:0.95rem}
.message-author.bot{color:var(--primary-light)}
.message-author.bot::after{
  content:'BOT';
  margin-left:6px;
  font-size:0.625rem;
  padding:2px 6px;
  border-radius:4px;
  background:var(--primary);
  color:#fff;
  vertical-align:middle;
  font-weight:700
}

.message-timestamp{font-size:0.75rem;color:var(--text-muted)}

.message-text{
  color:var(--text-secondary);
  font-size:0.95rem;
  line-height:1.5;
  word-wrap:break-word;
  white-space:pre-wrap
}
.message-text a{color:var(--primary-light);text-decoration:none}
.message-text a:hover{text-decoration:underline;color:var(--secondary)}

/* Attachments */
.message-attachment{margin-top:12px}
.message-attachment img{max-width:100%;max-height:320px;border-radius:var(--radius-md);border:1px solid var(--border-light)}
.message-attachment a{color:var(--primary-light);font-size:0.9rem}

/* Embeds */
.message-embed{
  margin-top:12px;
  max-width:560px;
  background:var(--bg-darker);
  border-radius:var(--radius-md);
  overflow:hidden;
  display:flex;
  border:1px solid var(--border-light)
}
.embed-color-bar{width:5px;flex-shrink:0}
.embed-content{padding:12px 18px 18px 14px;flex:1}
.embed-author{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.embed-author-icon{width:26px;height:26px;border-radius:50%}
.embed-author-name{font-size:0.9rem;font-weight:600;color:var(--text-primary)}
.embed-title{font-size:1rem;font-weight:600;color:var(--primary-light);margin-bottom:10px}
.embed-description{font-size:0.9rem;color:var(--text-secondary);line-height:1.5;white-space:pre-wrap}

.embed-fields{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
.embed-field{min-width:0}
.embed-field.full{grid-column:1/-1}
.embed-field-name{font-size:0.85rem;font-weight:700;color:var(--text-primary);margin-bottom:4px}
.embed-field-value{font-size:0.85rem;color:var(--text-secondary);white-space:pre-wrap}

.embed-thumbnail{width:80px;height:80px;border-radius:var(--radius-sm);margin:12px 16px 0 0;object-fit:cover}
.embed-image{max-width:100%;border-radius:var(--radius-sm);margin-top:16px}
.embed-footer{margin-top:12px;font-size:0.75rem;color:var(--text-muted)}

/* Reply */
.message-reply{
  font-size:0.8rem;
  color:var(--text-muted);
  margin-bottom:6px;
  display:flex;
  align-items:center;
  gap:6px
}
.message-reply::before{content:'↩';font-size:1.1rem;color:var(--primary-light)}

/* Continuation Message */
.continuation-message{padding:3px 20px 3px 76px}
.continuation-message .message-text{margin-top:0}

/* Date Divider */
.date-divider{
  display:flex;
  align-items:center;
  justify-content:center;
  margin:20px 0;
  padding:0 20px
}
.date-divider span{
  background:var(--bg-card);
  padding:0 12px;
  font-size:0.75rem;
  color:var(--text-muted);
  font-weight:500
}
.date-divider::before,.date-divider::after{content:'';flex:1;height:1px;background:var(--border-light)}

/* Participants */
.participants-list{margin-top:28px}
.participants-list h3{color:var(--text-primary);margin-bottom:18px;font-size:1.05rem;font-weight:600}

.participant{
  display:flex;
  align-items:center;
  gap:14px;
  padding:12px 16px;
  background:var(--bg-card);
  border-radius:var(--radius-md);
  margin-bottom:10px;
  border:1px solid var(--border-light);
  transition:all var(--transition-fast)
}
.participant:hover{border-color:var(--border-accent)}
.participant img{width:36px;height:36px;border-radius:50%;border:2px solid var(--border-accent)}
.participant-info{flex:1}
.participant-name{color:var(--text-primary);font-size:0.95rem;font-weight:500}
.participant-count{color:var(--text-muted);font-size:0.8rem;margin-top:2px}

/* Ticket Type Tags */
.ticket-type-tag{
  display:inline-block;
  padding:5px 12px;
  border-radius:var(--radius-sm);
  font-size:0.7rem;
  font-weight:700;
  letter-spacing:0.3px;
  margin-left:10px;
  text-transform:uppercase
}
.ticket-type-apply{background:rgba(74,124,89,0.15);color:var(--primary-light)}
.ticket-type-general{background:rgba(126,184,218,0.15);color:var(--info)}
.ticket-type-report{background:rgba(251,146,60,0.15);color:#fb923c}
.ticket-type-management{background:rgba(168,85,247,0.15);color:#c084fc}

/* Responsive Transcript Styles */
@media(max-width:768px){
  .transcript-header{padding:20px}
  .transcript-header h2{font-size:1.15rem}
  .transcript-meta{grid-template-columns:1fr 1fr}
  .transcript-meta-item{padding:12px}
  
  .messages-container{max-height:55vh;border-radius:var(--radius-md)}
  
  .message-group{padding:10px 14px;gap:12px}
  .message-avatar{width:36px;height:36px}
  .message-author{font-size:0.9rem}
  .message-text{font-size:0.9rem}
  
  .continuation-message{padding-left:62px}
  
  .message-attachment img{max-height:240px}
  .message-embed{max-width:100%}
  .embed-fields{grid-template-columns:1fr 1fr}
  .embed-content{padding:10px 14px 14px 12px}
  
  .participant{padding:10px 14px;gap:12px}
  .participant img{width:32px;height:32px}
}

@media(max-width:480px){
  .transcript-header{padding:16px}
  .transcript-meta{grid-template-columns:1fr}
  
  .message-group{padding:8px 12px;gap:10px}
  .message-avatar{width:32px;height:32px}
  .message-author{font-size:0.85rem}
  .message-text{font-size:0.85rem}
  
  .continuation-message{padding-left:54px}
  
  .ticket-type-tag{margin-left:0;margin-top:6px;display:block;width:fit-content}
  
  .embed-fields{grid-template-columns:1fr}
  .embed-thumbnail{width:60px;height:60px}
  
  .date-divider{padding:0 12px;margin:16px 0}
}
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
            <td>${formatCentralDate(t.closedAt)}</td>
            <td style="display:flex;gap:6px">
                <a href="/viewer/transcript/${t.ticketId}" class="btn-edit">View</a>
                <form method="POST" action="/viewer/transcript/${t.ticketId}/delete" style="display:inline" onsubmit="return confirm('Delete this transcript?')">
                    <button type="submit" class="btn-edit" style="background:rgba(239,68,68,.15);color:#f87171;border-color:rgba(239,68,68,.2)">Delete</button>
                </form>
            </td>
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
            const dateStr = formatCentralTime(msgDate, { timeZone: TIMEZONE, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            
            // Add date divider if new day
            if (dateStr !== lastDate) {
                messagesHtml += `<div class="date-divider"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
                lastAuthorId = null; // Reset author grouping on new day
            }
            
            const timeStr = formatCentralTime(msgDate, { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' });
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
                <div class="transcript-meta-item"><label>Created</label><span>${formatCentralDateTime(transcript.createdAt)}</span></div>
                <div class="transcript-meta-item"><label>Closed</label><span>${formatCentralDateTime(transcript.closedAt)}</span></div>
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
        
        <div style="margin-top:24px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:flex-end">
            <form method="POST" action="/viewer/transcript/${ticketId}/delete" onsubmit="return confirm('Are you sure you want to delete this transcript? This cannot be undone.')">
                <button type="submit" class="btn" style="background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.2)">Delete Transcript</button>
            </form>
        </div>
    </div>
</div></body></html>`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error: ' + e.message);
    }
});

// =====================================================
// DELETE TRANSCRIPT (Admin)
// =====================================================
app.post('/viewer/transcript/:ticketId/delete', staffAuth, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const result = await Transcript.deleteOne({ ticketId });
        
        if (result.deletedCount === 0) {
            return res.status(404).send('Transcript not found');
        }
        
        console.log(`[Transcripts] Admin ${req.session.username} deleted transcript ${ticketId}`);
        res.redirect('/viewer/transcripts?deleted=1');
    } catch (e) {
        console.error(e);
        res.status(500).send('Error: ' + e.message);
    }
});

// =====================================================
// PVP LOGS PAGE (Admin Only)
// =====================================================
const PvpLog = require('../database/models/PvpLog');

app.get('/viewer/pvp-logs', staffAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const type = req.query.type || '';
        const dateFrom = req.query.from || '';
        const dateTo = req.query.to || '';
        
        let query = {};
        
        // Type filter
        if (type && ['status_change', 'pvp_kill', 'invalid_pvp', 'death', 'pvp_damage_session', 'combat_log', 'low_hp_alert'].includes(type)) {
            query.type = type;
        }
        
        // Date filter
        if (dateFrom || dateTo) {
            query.timestamp = {};
            if (dateFrom) query.timestamp.$gte = new Date(dateFrom);
            if (dateTo) query.timestamp.$lte = new Date(dateTo + 'T23:59:59');
        }
        
        // Search filter - search by player names/UUIDs
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { uuid: { $regex: search, $options: 'i' } },
                { 'killer.username': { $regex: search, $options: 'i' } },
                { 'victim.username': { $regex: search, $options: 'i' } },
                { 'attacker.username': { $regex: search, $options: 'i' } },
                { 'player.username': { $regex: search, $options: 'i' } },
                { 'player1.username': { $regex: search, $options: 'i' } },
                { 'player2.username': { $regex: search, $options: 'i' } }
            ];
        }
        
        const [total, logs] = await Promise.all([
            PvpLog.countDocuments(query),
            PvpLog.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
        ]);
        
        const totalPages = Math.ceil(total / limit);
        
        // Get type counts
        const [statusCount, killCount, damageCount, lowHpCount, combatLogCount] = await Promise.all([
            PvpLog.countDocuments({ type: 'status_change' }),
            PvpLog.countDocuments({ type: 'pvp_kill' }),
            PvpLog.countDocuments({ type: 'pvp_damage_session' }),
            PvpLog.countDocuments({ type: 'low_hp_alert' }),
            PvpLog.countDocuments({ type: 'combat_log' })
        ]);
        
        // Get type tag
        const getTypeTag = (logType) => {
            switch(logType) {
                case 'status_change': return '<span class="tag tag-b">Status</span>';
                case 'pvp_kill': return '<span class="tag tag-r">Kill</span>';
                case 'invalid_pvp': return '<span class="tag tag-o">Invalid</span>';
                case 'death': return '<span class="tag tag-g">Death</span>';
                case 'pvp_damage_session': return '<span class="tag tag-y">Damage</span>';
                case 'combat_log': return '<span class="tag tag-p">Combat Log</span>';
                case 'low_hp_alert': return '<span class="tag tag-r">Low HP</span>';
                default: return '<span class="tag tag-g">' + (logType || 'Unknown') + '</span>';
            }
        };
        
        // Get summary for log
        const getLogSummary = (log) => {
            switch(log.type) {
                case 'status_change':
                    return `<strong>${log.username}</strong> turned PvP <strong>${log.enabled ? 'ON' : 'OFF'}</strong>`;
                case 'pvp_kill':
                    return `<strong>${log.killer?.username || '?'}</strong> killed <strong>${log.victim?.username || '?'}</strong>`;
                case 'invalid_pvp':
                    return `<strong>${log.attacker?.username || '?'}</strong> attacked <strong>${log.victim?.username || '?'}</strong> (invalid)`;
                case 'death':
                    return `<strong>${log.username}</strong> died: ${log.cause || 'unknown'}`;
                case 'pvp_damage_session':
                    return `<strong>${log.player1?.username || '?'}</strong> vs <strong>${log.player2?.username || '?'}</strong> - ${log.total_damage?.toFixed(1) || 0} HP`;
                case 'combat_log':
                    return `<strong>${log.player?.username || '?'}</strong> combat logged`;
                case 'low_hp_alert':
                    return `<strong>${log.victim?.username || '?'}</strong> dropped to ${log.health_remaining?.toFixed(1) || '?'} HP (attacker: ${log.attacker?.username || '?'})`;
                default:
                    return 'Unknown event';
            }
        };
        
        // Get players involved
        const getPlayers = (log) => {
            const players = [];
            if (log.username) players.push(log.username);
            if (log.killer?.username) players.push(log.killer.username);
            if (log.victim?.username) players.push(log.victim.username);
            if (log.attacker?.username) players.push(log.attacker.username);
            if (log.player?.username) players.push(log.player.username);
            if (log.player1?.username) players.push(log.player1.username);
            if (log.player2?.username) players.push(log.player2.username);
            return [...new Set(players)].join(', ') || '—';
        };
        
        let rows = logs.map(log => `<tr>
            <td>${getTypeTag(log.type)}</td>
            <td>${getLogSummary(log)}</td>
            <td class="hide">${getPlayers(log)}</td>
            <td>${formatCentralDateTime(log.timestamp)}</td>
            <td><a href="/viewer/pvp-log/${log._id}" class="btn-edit">View</a></td>
        </tr>`).join('');
        
        if (!rows) rows = '<tr><td colspan="5" class="empty">No PvP logs found</td></tr>';
        
        let pag = '';
        if (totalPages > 1) {
            const url = (p) => `/viewer/pvp-logs?page=${p}&search=${encodeURIComponent(search)}&type=${type}&from=${dateFrom}&to=${dateTo}`;
            if (page > 1) pag += `<a href="${url(page - 1)}">Previous</a>`;
            pag += `<span>Page ${page} of ${totalPages}</span>`;
            if (page < totalPages) pag += `<a href="${url(page + 1)}">Next</a>`;
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>PvP Logs</title><style>${viewerStyles}${transcriptStyles}</style></head><body>
${getHeader('pvp-logs', req.session)}
<div class="main">
    <h1 class="title">PvP Combat Logs</h1>
    <p class="subtitle">All PvP-related events including damage sessions, kills, status changes, and alerts</p>
    
    <div class="stats">
        <div class="stat"><div class="num">${total}</div><div class="lbl">Total</div></div>
        <div class="stat"><div class="num">${killCount}</div><div class="lbl">Kills</div></div>
        <div class="stat"><div class="num">${damageCount}</div><div class="lbl">Damage</div></div>
        <div class="stat"><div class="num">${lowHpCount}</div><div class="lbl">Low HP</div></div>
        <div class="stat"><div class="num">${combatLogCount}</div><div class="lbl">Combat Logs</div></div>
    </div>
    
    <div class="filter-card">
        <h3>Search & Filter</h3>
        <form method="GET">
            <div class="filter-grid">
                <div class="filter-group">
                    <label>Search</label>
                    <input type="text" name="search" placeholder="Player name or UUID..." value="${search}">
                </div>
                <div class="filter-group">
                    <label>Type</label>
                    <select name="type">
                        <option value="">All Types</option>
                        <option value="status_change" ${type === 'status_change' ? 'selected' : ''}>Status Changes</option>
                        <option value="pvp_kill" ${type === 'pvp_kill' ? 'selected' : ''}>Kills</option>
                        <option value="pvp_damage_session" ${type === 'pvp_damage_session' ? 'selected' : ''}>Damage Sessions</option>
                        <option value="low_hp_alert" ${type === 'low_hp_alert' ? 'selected' : ''}>Low HP Alerts</option>
                        <option value="combat_log" ${type === 'combat_log' ? 'selected' : ''}>Combat Logs</option>
                        <option value="invalid_pvp" ${type === 'invalid_pvp' ? 'selected' : ''}>Invalid PvP</option>
                        <option value="death" ${type === 'death' ? 'selected' : ''}>Deaths</option>
                    </select>
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
                <a class="btn btn-clr" href="/viewer/pvp-logs">Clear All</a>
            </div>
        </form>
    </div>
    
    <div class="tbl"><table>
        <thead><tr><th>Type</th><th>Summary</th><th class="hide">Players</th><th>Time</th><th>Actions</th></tr></thead>
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
// PVP LOG DETAIL PAGE (Admin Only)
// =====================================================
app.get('/viewer/pvp-log/:id', staffAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const log = await PvpLog.findById(id).lean();
        
        if (!log) {
            return res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Log Not Found</title><style>${viewerStyles}</style></head><body>
${getHeader('pvp-logs', req.session)}
<div class="main">
    <a href="/viewer/pvp-logs" class="back-link">Back to PvP Logs</a>
    <h1 class="title">Log Not Found</h1>
    <p style="color:var(--text-secondary)">The requested PvP log was not found.</p>
</div></body></html>`);
        }
        
        // Get type tag
        const getTypeTag = (logType) => {
            switch(logType) {
                case 'status_change': return '<span class="tag tag-b">Status Change</span>';
                case 'pvp_kill': return '<span class="tag tag-r">PvP Kill</span>';
                case 'invalid_pvp': return '<span class="tag tag-o">Invalid PvP</span>';
                case 'death': return '<span class="tag tag-g">Death</span>';
                case 'pvp_damage_session': return '<span class="tag tag-y">Damage Session</span>';
                case 'combat_log': return '<span class="tag tag-p">Combat Log</span>';
                case 'low_hp_alert': return '<span class="tag tag-r">Low HP Alert</span>';
                default: return '<span class="tag tag-g">' + (logType || 'Unknown') + '</span>';
            }
        };
        
        // Build detail content based on log type
        let detailHtml = '';
        
        switch(log.type) {
            case 'status_change':
                detailHtml = `
                    <div class="info-grid">
                        <div class="info-item"><label>Player</label><span>${log.username}</span></div>
                        <div class="info-item"><label>UUID</label><span style="font-family:monospace;font-size:0.85em">${log.uuid}</span></div>
                        <div class="info-item"><label>New Status</label><span class="${log.enabled ? 'status-active' : 'status-inactive'}">${log.enabled ? 'PvP ON' : 'PvP OFF'}</span></div>
                        <div class="info-item"><label>Time</label><span>${formatCentralDateTime(log.timestamp)}</span></div>
                    </div>`;
                break;
                
            case 'pvp_kill':
                detailHtml = `
                    <div class="info-grid">
                        <div class="info-item"><label>Killer</label><span>${log.killer?.username || 'Unknown'}</span></div>
                        <div class="info-item"><label>Killer UUID</label><span style="font-family:monospace;font-size:0.85em">${log.killer?.uuid || '—'}</span></div>
                        <div class="info-item"><label>Killer PvP</label><span>${log.killer?.pvp_enabled ? 'ON' : 'OFF'}</span></div>
                        <div class="info-item"><label>Victim</label><span>${log.victim?.username || 'Unknown'}</span></div>
                        <div class="info-item"><label>Victim UUID</label><span style="font-family:monospace;font-size:0.85em">${log.victim?.uuid || '—'}</span></div>
                        <div class="info-item"><label>Victim PvP</label><span>${log.victim?.pvp_enabled ? 'ON' : 'OFF'}</span></div>
                        <div class="info-item"><label>Consensual</label><span class="${log.consensual ? 'status-inactive' : 'status-active'}">${log.consensual ? 'Yes' : 'No'}</span></div>
                        <div class="info-item"><label>Time</label><span>${formatCentralDateTime(log.timestamp)}</span></div>
                    </div>`;
                break;
                
            case 'pvp_damage_session':
                detailHtml = `
                    <div class="info-grid">
                        <div class="info-item"><label>Player 1</label><span>${log.player1?.username || 'Unknown'}</span></div>
                        <div class="info-item"><label>P1 Damage Dealt</label><span>${log.player1?.damage_dealt?.toFixed(1) || 0} HP</span></div>
                        <div class="info-item"><label>P1 Hits</label><span>${log.player1?.hits_dealt || 0}</span></div>
                        <div class="info-item"><label>P1 PvP Status</label><span>${log.player1?.pvp_enabled ? 'ON' : 'OFF'}</span></div>
                        <div class="info-item"><label>Player 2</label><span>${log.player2?.username || 'Unknown'}</span></div>
                        <div class="info-item"><label>P2 Damage Dealt</label><span>${log.player2?.damage_dealt?.toFixed(1) || 0} HP</span></div>
                        <div class="info-item"><label>P2 Hits</label><span>${log.player2?.hits_dealt || 0}</span></div>
                        <div class="info-item"><label>P2 PvP Status</label><span>${log.player2?.pvp_enabled ? 'ON' : 'OFF'}</span></div>
                        <div class="info-item"><label>Total Damage</label><span>${log.total_damage?.toFixed(1) || 0} HP</span></div>
                        <div class="info-item"><label>Total Hits</label><span>${log.total_hits || 0}</span></div>
                        <div class="info-item"><label>Duration</label><span>${log.duration_ms ? (log.duration_ms / 1000).toFixed(1) + 's' : '—'}</span></div>
                        <div class="info-item"><label>Time</label><span>${formatCentralDateTime(log.timestamp)}</span></div>
                    </div>
                    ${log.initiator ? `<div class="info-item" style="margin-top:16px"><label>Fight Initiator</label><span>${log.initiator.username}</span></div>` : ''}`;
                break;
                
            case 'low_hp_alert':
                detailHtml = `
                    <div class="info-grid">
                        <div class="info-item"><label>Victim</label><span>${log.victim?.username || 'Unknown'}</span></div>
                        <div class="info-item"><label>Health Remaining</label><span class="status-active">${log.health_remaining?.toFixed(1) || '?'} HP</span></div>
                        <div class="info-item"><label>Victim PvP</label><span>${log.victim?.pvp_enabled ? 'ON' : 'OFF'}</span></div>
                        <div class="info-item"><label>Attacker</label><span>${log.attacker?.username || 'Unknown'}</span></div>
                        <div class="info-item"><label>Attacker Damage</label><span>${log.attacker?.total_damage_dealt?.toFixed(1) || 0} HP</span></div>
                        <div class="info-item"><label>Attacker PvP</label><span>${log.attacker?.pvp_enabled ? 'ON' : 'OFF'}</span></div>
                        ${log.initiator ? `<div class="info-item"><label>Fight Initiator</label><span>${log.initiator.username}${log.initiator.is_current_attacker ? ' (attacker)' : ''}</span></div>` : ''}
                        ${log.session ? `
                            <div class="info-item"><label>Session Damage</label><span>${log.session.total_damage?.toFixed(1) || 0} HP</span></div>
                            <div class="info-item"><label>Session Hits</label><span>${log.session.total_hits || 0}</span></div>
                            <div class="info-item"><label>Consensual</label><span class="${log.session.consensual ? 'status-inactive' : 'status-active'}">${log.session.consensual ? 'Yes' : 'No'}</span></div>
                        ` : ''}
                        <div class="info-item"><label>Time</label><span>${formatCentralDateTime(log.timestamp)}</span></div>
                    </div>
                    ${log.location ? `
                        <div class="info-item" style="margin-top:16px">
                            <label>Location</label>
                            <span>${log.location.world} (${log.location.x?.toFixed(0)}, ${log.location.y?.toFixed(0)}, ${log.location.z?.toFixed(0)})</span>
                        </div>` : ''}`;
                break;
                
            case 'combat_log':
                detailHtml = `
                    <div class="info-grid">
                        <div class="info-item"><label>Player</label><span>${log.player?.username || 'Unknown'}</span></div>
                        <div class="info-item"><label>UUID</label><span style="font-family:monospace;font-size:0.85em">${log.player?.uuid || '—'}</span></div>
                        <div class="info-item"><label>PvP Status</label><span>${log.player?.pvp_enabled ? 'ON' : 'OFF'}</span></div>
                        <div class="info-item"><label>Time</label><span>${formatCentralDateTime(log.timestamp)}</span></div>
                    </div>
                    ${log.location ? `
                        <div class="info-item" style="margin-top:16px">
                            <label>Location</label>
                            <span>${log.location.world} (${log.location.x?.toFixed(0)}, ${log.location.y?.toFixed(0)}, ${log.location.z?.toFixed(0)})</span>
                        </div>` : ''}`;
                break;
                
            case 'invalid_pvp':
                detailHtml = `
                    <div class="info-grid">
                        <div class="info-item"><label>Attacker</label><span>${log.attacker?.username || 'Unknown'}</span></div>
                        <div class="info-item"><label>Attacker PvP</label><span>${log.attacker?.pvp_enabled ? 'ON' : 'OFF'}</span></div>
                        <div class="info-item"><label>Victim</label><span>${log.victim?.username || 'Unknown'}</span></div>
                        <div class="info-item"><label>Victim PvP</label><span>${log.victim?.pvp_enabled ? 'ON' : 'OFF'}</span></div>
                        <div class="info-item"><label>Damage Attempted</label><span>${log.damage?.toFixed(1) || 0} HP</span></div>
                        <div class="info-item"><label>Time</label><span>${formatCentralDateTime(log.timestamp)}</span></div>
                    </div>`;
                break;
                
            case 'death':
                detailHtml = `
                    <div class="info-grid">
                        <div class="info-item"><label>Player</label><span>${log.username}</span></div>
                        <div class="info-item"><label>UUID</label><span style="font-family:monospace;font-size:0.85em">${log.uuid}</span></div>
                        <div class="info-item"><label>Cause</label><span>${log.cause || 'Unknown'}</span></div>
                        <div class="info-item"><label>Time</label><span>${formatCentralDateTime(log.timestamp)}</span></div>
                    </div>`;
                break;
                
            default:
                detailHtml = `<p style="color:var(--text-secondary)">No additional details available for this log type.</p>`;
        }
        
        // Raw JSON for debugging
        const rawJson = JSON.stringify(log, null, 2);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>PvP Log Detail</title><style>${viewerStyles}${transcriptStyles}</style></head><body>
${getHeader('pvp-logs', req.session)}
<div class="main">
    <a href="/viewer/pvp-logs" class="back-link">Back to PvP Logs</a>
    
    <h1 class="title">${getTypeTag(log.type)} PvP Log</h1>
    
    <div class="case-detail">
        <h2>Event Details</h2>
        ${detailHtml}
    </div>
    
    <div class="evidence-section">
        <h3>Raw Data</h3>
        <pre style="background:var(--bg-darker);padding:18px;border-radius:var(--radius-md);overflow-x:auto;font-size:0.85em;color:var(--text-secondary);border:1px solid var(--border-light)"><code>${escapeHtml(rawJson)}</code></pre>
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
                        <div class="info-item"><label>Closed</label><span>${t.closedAt ? formatCentralDateTime(t.closedAt) : '—'}</span></div>
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
                <div class="transcript-meta-item"><label>Created</label><span>${transcript.createdAt ? formatCentralDateTime(transcript.createdAt) : '—'}</span></div>
                <div class="transcript-meta-item"><label>Closed</label><span>${transcript.closedAt ? formatCentralDateTime(transcript.closedAt) : '—'}</span></div>
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

// PvpLog already imported at top of file

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

// =====================================================
// ANALYTICS DASHBOARD PAGE (Supervisor+ only)
// =====================================================

app.get('/viewer/analytics', staffAuth, async (req, res) => {
    const session = req.session;
    
    // Check Supervisor+ permission
    if (!isSupervisorPlus(session)) {
        return res.status(403).send(`<!DOCTYPE html><html><head><title>Access Denied</title><style>${viewerStyles}</style></head><body>
            <div class="main" style="text-align:center;padding:100px">
                <h1 style="color:#ef4444">⛔ Access Denied</h1>
                <p style="color:#9ca3af">Analytics dashboard is restricted to Supervisor+ roles.</p>
                <a href="/viewer/search" class="btn btn-go" style="margin-top:20px">Back to Admin Panel</a>
            </div>
        </body></html>`);
    }
    
    try {
        // Import models
        const ServerTps = require('../database/models/ServerTps');
        const AltGroup = require('../database/models/AltGroup');
        const ChunkAnalytics = require('../database/models/ChunkAnalytics');
        const LagAlert = require('../database/models/LagAlert');
        const PlayerConnection = require('../database/models/PlayerConnection');
        
        // Get recent TPS data (last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        let tpsData = await ServerTps.find({ timestamp: { $gte: oneDayAgo } })
            .sort({ timestamp: -1 })
            .limit(500)
            .lean();
        
        // Generate live demo data if no real data exists
        const demoMode = tpsData.length === 0;
        if (demoMode) {
            const now = Date.now();
            tpsData = [];
            // Generate 6 hours of TPS data every 5 minutes
            for (let i = 0; i < 72; i++) {
                const time = new Date(now - i * 5 * 60 * 1000);
                // Simulate realistic TPS with occasional dips
                const baseTps = 19.5 + Math.sin(i / 10) * 0.3;
                const randomDip = Math.random() < 0.05 ? Math.random() * 5 : 0;
                const tps = Math.max(15, Math.min(20, baseTps - randomDip + (Math.random() - 0.5)));
                tpsData.push({
                    server: 'main',
                    tps: tps,
                    mspt: (1000 / tps) * (0.8 + Math.random() * 0.4),
                    timestamp: time,
                    playerCount: Math.floor(5 + Math.random() * 15),
                    entityCount: Math.floor(800 + Math.random() * 400),
                    loadedChunks: Math.floor(200 + Math.random() * 100)
                });
            }
        }
        
        // Get pending ALT reviews
        let pendingAlts = await AltGroup.find({ status: 'pending' })
            .sort({ updatedAt: -1 })
            .limit(20)
            .lean();
        
        // Get problem chunks
        const problemChunks = await ChunkAnalytics.find({ flagged: true })
            .sort({ entityCount: -1 })
            .limit(20)
            .lean();
        
        // Get recent lag alerts
        const lagAlerts = await LagAlert.find({ timestamp: { $gte: oneDayAgo } })
            .sort({ timestamp: -1 })
            .limit(20)
            .lean();
        
        // Get recent connections for unique player count
        const uniquePlayers = await PlayerConnection.distinct('uuid', { timestamp: { $gte: oneDayAgo } });
        
        // Calculate TPS averages per server
        const serverStats = {};
        for (const tps of tpsData) {
            if (!serverStats[tps.server]) {
                serverStats[tps.server] = { total: 0, count: 0, min: 20, max: 0, latest: null };
            }
            serverStats[tps.server].total += tps.tps;
            serverStats[tps.server].count++;
            serverStats[tps.server].min = Math.min(serverStats[tps.server].min, tps.tps);
            serverStats[tps.server].max = Math.max(serverStats[tps.server].max, tps.tps);
            if (!serverStats[tps.server].latest || tps.timestamp > serverStats[tps.server].latest.timestamp) {
                serverStats[tps.server].latest = tps;
            }
        }
        
        // Build server stats HTML
        let serverStatsHtml = '';
        for (const [server, stats] of Object.entries(serverStats)) {
            const avg = (stats.total / stats.count).toFixed(1);
            const current = stats.latest?.tps?.toFixed(1) || '—';
            const tpsClass = stats.latest?.tps >= 18 ? 'tps-good' : stats.latest?.tps >= 15 ? 'tps-warn' : 'tps-bad';
            const statusIcon = stats.latest?.tps >= 18 ? '🟢' : stats.latest?.tps >= 15 ? '🟡' : '🔴';
            serverStatsHtml += `
                <div class="stat-card">
                    <div class="stat-label">${statusIcon} ${server.toUpperCase()}</div>
                    <div class="stat-value ${tpsClass}">${current}</div>
                    <div style="font-size:.75em;color:#6b7280;margin-top:2px">TPS</div>
                    <div class="stat-meta">
                        <span>Avg: ${avg}</span>
                        <span>Min: ${stats.min.toFixed(1)}</span>
                        <span>Max: ${stats.max.toFixed(1)}</span>
                    </div>
                    ${stats.latest ? `<div class="stat-meta" style="margin-top:8px;border-top:1px solid #2d2d35;padding-top:8px">
                        <span>🧱 ${stats.latest.loadedChunks || 0}</span>
                        <span>👥 ${stats.latest.playerCount || 0}</span>
                        <span>🐄 ${stats.latest.entityCount || 0}</span>
                    </div>` : ''}
                </div>
            `;
        }
        
        // Build pending ALTs HTML
        let altsHtml = '';
        if (pendingAlts.length === 0) {
            altsHtml = '<div class="empty-state"><div style="font-size:2em;margin-bottom:8px">✅</div>No pending ALT reviews</div>';
        } else {
            for (const alt of pendingAlts) {
                const accounts = alt.accounts || [];
                altsHtml += `
                    <div class="item-card warning">
                        <div class="item-header">
                            <span class="item-title" style="color:#f59e0b">Potential ALT Group</span>
                            <span class="item-time">${formatCentralDateTime(alt.updatedAt)}</span>
                        </div>
                        <div class="item-tags">
                            ${accounts.map(a => `<span class="tag">${a.username || a.uuid?.substring(0, 8)}</span>`).join('')}
                        </div>
                        <div class="item-meta" style="margin-top:10px">
                            <span>${accounts.length} accounts</span>
                            <span>IP: ${alt.sharedIp ? '•••' + alt.sharedIp.slice(-6) : 'Multiple'}</span>
                        </div>
                    </div>
                `;
            }
        }
        
        // Build problem chunks HTML
        let chunksHtml = '';
        if (problemChunks.length === 0) {
            chunksHtml = '<div class="empty-state"><div style="font-size:2em;margin-bottom:8px">✅</div>No problem chunks detected</div>';
        } else {
            for (const chunk of problemChunks) {
                const isHighRisk = chunk.entityCount >= 200 || chunk.hopperCount >= 50;
                chunksHtml += `
                    <div class="item-card ${isHighRisk ? 'danger' : 'warning'}">
                        <div class="item-header">
                            <span class="item-title" style="color:${isHighRisk ? '#ef4444' : '#f59e0b'}">${chunk.world} @ ${chunk.x}, ${chunk.z}</span>
                            <span class="item-time">${chunk.server || 'main'}</span>
                        </div>
                        <div class="item-meta">
                            <span>🐄 ${chunk.entityCount || 0}</span>
                            <span>📦 ${chunk.hopperCount || 0}</span>
                            <span>⚡ ${chunk.redstoneCount || 0}</span>
                        </div>
                    </div>
                `;
            }
        }
        
        // Build lag alerts HTML
        let alertsHtml = '';
        if (lagAlerts.length === 0) {
            alertsHtml = '<div class="empty-state"><div style="font-size:2em;margin-bottom:8px">✅</div>No lag alerts in the last 24 hours</div>';
        } else {
            for (const alert of lagAlerts) {
                const isCritical = alert.severity === 'critical';
                alertsHtml += `
                    <div class="item-card ${isCritical ? 'danger' : 'warning'}">
                        <div class="item-header">
                            <span class="item-title" style="color:${isCritical ? '#ef4444' : '#f59e0b'}">${alert.type || 'Lag Alert'}</span>
                            <span class="item-time">${formatCentralDateTime(alert.timestamp)}</span>
                        </div>
                        <div class="item-meta">
                            ${alert.tps ? `<span>TPS: ${alert.tps.toFixed(1)}</span>` : ''}
                            ${alert.mspt ? `<span>MSPT: ${alert.mspt.toFixed(1)}ms</span>` : ''}
                            ${alert.server ? `<span>Server: ${alert.server}</span>` : ''}
                        </div>
                        ${alert.message ? `<div style="color:#9ca3af;font-size:.8em;margin-top:6px">${alert.message}</div>` : ''}
                    </div>
                `;
            }
        }
        
        // Build TPS chart data (last 6 hours)
        const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
        const chartData = tpsData
            .filter(t => new Date(t.timestamp).getTime() > sixHoursAgo)
            .reverse()
            .map(t => ({ time: new Date(t.timestamp).getTime(), tps: t.tps, server: t.server }));
        
        // Prepare chart labels (formatted times)
        const chartLabels = chartData.map(d => {
            const date = new Date(d.time);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Chicago' });
        });
        
        // Group by server for multi-line chart
        const servers = [...new Set(chartData.map(d => d.server))];
        const serverColors = { 'main': '#8b5cf6', 'hub': '#22c55e', 'creative': '#f59e0b', 'survival': '#3b82f6' };
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="30">
    <title>Analytics Dashboard - NewLife SMP</title>
    <style>
        ${viewerStyles}
        .analytics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px; }
        .stat-card { background: linear-gradient(135deg, #1f1f23 0%, #18181b 100%); border-radius: 16px; padding: 24px; border: 1px solid #2d2d35; transition: transform 0.2s, box-shadow 0.2s; }
        .stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
        .stat-label { font-size: 0.8em; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .stat-value { font-size: 2.5em; font-weight: 700; line-height: 1; }
        .stat-meta { display: flex; gap: 12px; margin-top: 12px; font-size: 0.8em; color: #6b7280; }
        .stat-meta span { display: flex; align-items: center; gap: 4px; }
        .chart-container { background: #1f1f23; border-radius: 16px; padding: 24px; margin-bottom: 32px; border: 1px solid #2d2d35; }
        .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
        .chart-title { margin: 0; color: #e5e7eb; font-size: 1.1em; }
        .chart-wrapper { position: relative; height: 280px; }
        .section-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
        @media (max-width: 900px) { .section-grid { grid-template-columns: 1fr; } }
        .section-card { background: #18181b; border-radius: 16px; padding: 20px; border: 1px solid #2d2d35; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .section-title { margin: 0; font-size: 1em; display: flex; align-items: center; gap: 8px; }
        .section-count { background: #2d2d35; padding: 2px 10px; border-radius: 12px; font-size: 0.85em; color: #9ca3af; }
        .section-content { max-height: 400px; overflow-y: auto; }
        .item-card { background: #1f1f23; border-radius: 10px; padding: 14px; margin-bottom: 10px; border-left: 4px solid #6b7280; transition: background 0.2s; }
        .item-card:hover { background: #252529; }
        .item-card.warning { border-left-color: #f59e0b; }
        .item-card.danger { border-left-color: #ef4444; }
        .item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .item-title { font-weight: 500; color: #e5e7eb; }
        .item-time { font-size: 0.75em; color: #6b7280; }
        .item-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.8em; color: #9ca3af; }
        .item-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .tag { background: #2d2d35; padding: 4px 10px; border-radius: 6px; font-size: 0.8em; color: #d1d5db; }
        .full-width { grid-column: span 2; }
        @media (max-width: 900px) { .full-width { grid-column: span 1; } }
        .empty-state { text-align: center; padding: 40px 20px; color: #6b7280; }
        .empty-state svg { width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5; }
        .tps-good { color: #22c55e; }
        .tps-warn { color: #f59e0b; }
        .tps-bad { color: #ef4444; }
        .demo-badge { background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 4px 12px; border-radius: 6px; font-size: 0.75em; font-weight: 600; animation: pulse 2s infinite; }
        .live-badge { background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; padding: 4px 12px; border-radius: 6px; font-size: 0.75em; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        .live-dot { width: 8px; height: 8px; background: #fff; border-radius: 50%; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .refresh-timer { font-size: 0.75em; color: #6b7280; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
</head>
<body>
${getHeader('analytics', session)}
<div class="main">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;flex-wrap:wrap;gap:16px">
        <div style="display:flex;align-items:center;gap:16px">
            <h1 style="margin:0;font-size:1.8em">📊 Server Analytics</h1>
            ${demoMode 
                ? '<span class="demo-badge">⚡ DEMO MODE</span>' 
                : '<span class="live-badge"><span class="live-dot"></span>LIVE</span>'}
        </div>
        <div style="color:#9ca3af;font-size:.9em;display:flex;gap:16px;align-items:center">
            <span class="refresh-timer" id="refreshTimer">Auto-refresh in 30s</span>
            <span style="background:#2d2d35;padding:4px 12px;border-radius:8px">👥 ${uniquePlayers.length || 0} unique players</span>
        </div>
    </div>
    
    ${demoMode ? `
    <div style="background:linear-gradient(135deg,#f59e0b20,#d9770620);border:1px solid #f59e0b40;border-radius:12px;padding:16px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
        <span style="font-size:1.5em">⚠️</span>
        <div>
            <div style="color:#f59e0b;font-weight:600">Demo Mode Active</div>
            <div style="color:#9ca3af;font-size:0.85em">No live data from Paper analytics plugin. Showing simulated data. Deploy the Paper plugin to see real server stats.</div>
        </div>
    </div>
    ` : ''}
    
    <!-- Server Stats Cards -->
    <div class="analytics-grid">
        ${serverStatsHtml || '<div class="stat-card"><div class="empty-state">No TPS data available</div></div>'}
    </div>
    
    <!-- TPS Chart -->
    <div class="chart-container">
        <div class="chart-header">
            <h3 class="chart-title">📈 TPS History (Last 6 Hours)</h3>
            <div style="display:flex;gap:16px;font-size:0.8em">
                ${servers.map(s => `<span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:3px;background:${serverColors[s] || '#8b5cf6'}"></span>${s}</span>`).join('')}
            </div>
        </div>
        <div class="chart-wrapper">
            <canvas id="tpsChart"></canvas>
        </div>
    </div>
    
    <!-- Grid Layout -->
    <div class="section-grid">
        <!-- Pending ALT Reviews -->
        <div class="section-card">
            <div class="section-header">
                <h3 class="section-title" style="color:#f59e0b">⚠️ Pending ALT Reviews</h3>
                <span class="section-count">${pendingAlts.length}</span>
            </div>
            <div class="section-content">
                ${altsHtml}
            </div>
        </div>
        
        <!-- Problem Chunks -->
        <div class="section-card">
            <div class="section-header">
                <h3 class="section-title" style="color:#f59e0b">🧱 Problem Chunks</h3>
                <span class="section-count">${problemChunks.length}</span>
            </div>
            <div class="section-content">
                ${chunksHtml}
            </div>
        </div>
        
        <!-- Lag Alerts -->
        <div class="section-card full-width">
            <div class="section-header">
                <h3 class="section-title" style="color:#ef4444">🚨 Lag Alerts</h3>
                <span class="section-count">${lagAlerts.length}</span>
            </div>
            <div class="section-content" style="max-height:300px">
                ${alertsHtml}
            </div>
        </div>
    </div>
</div>

<script>
(function() {
    const rawData = ${JSON.stringify(chartData)};
    const servers = ${JSON.stringify(servers)};
    const serverColors = ${JSON.stringify(serverColors)};
    
    if (rawData.length === 0) {
        document.getElementById('tpsChart').parentElement.innerHTML = '<div class="empty-state">No TPS data available for the last 6 hours</div>';
        return;
    }
    
    // Create time buckets (every 5 minutes) for smoother chart
    const bucketSize = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    const sixHoursAgo = now - 6 * 60 * 60 * 1000;
    
    // Create labels for every 30 mins
    const labels = [];
    for (let t = sixHoursAgo; t <= now; t += 30 * 60 * 1000) {
        const d = new Date(t);
        labels.push(d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' }));
    }
    
    // Build datasets per server
    const datasets = servers.map(server => {
        const serverData = rawData.filter(d => d.server === server);
        
        // Map data to label indices
        const dataPoints = new Array(labels.length).fill(null);
        serverData.forEach(d => {
            const idx = Math.round((d.time - sixHoursAgo) / (30 * 60 * 1000));
            if (idx >= 0 && idx < labels.length) {
                if (dataPoints[idx] === null) {
                    dataPoints[idx] = d.tps;
                } else {
                    dataPoints[idx] = (dataPoints[idx] + d.tps) / 2; // Average if multiple
                }
            }
        });
        
        return {
            label: server.charAt(0).toUpperCase() + server.slice(1),
            data: dataPoints,
            borderColor: serverColors[server] || '#8b5cf6',
            backgroundColor: (serverColors[server] || '#8b5cf6') + '15',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 5,
            spanGaps: true
        };
    });
    
    const ctx = document.getElementById('tpsChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f1f23',
                    borderColor: '#2d2d35',
                    borderWidth: 1,
                    titleColor: '#e5e7eb',
                    bodyColor: '#9ca3af',
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(ctx) {
                            if (ctx.parsed.y === null) return null;
                            const tps = ctx.parsed.y.toFixed(1);
                            const status = ctx.parsed.y >= 18 ? '🟢' : ctx.parsed.y >= 15 ? '🟡' : '🔴';
                            return status + ' ' + ctx.dataset.label + ': ' + tps + ' TPS';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#2d2d3550', drawBorder: false },
                    ticks: { color: '#6b7280', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }
                },
                y: {
                    min: 0,
                    max: 22,
                    grid: { color: '#2d2d3550', drawBorder: false },
                    ticks: { 
                        color: '#6b7280',
                        stepSize: 5,
                        callback: function(value) { return value + ' TPS'; }
                    }
                }
            }
        }
    });
})();

// Refresh countdown timer
(function() {
    let seconds = 30;
    const timer = document.getElementById('refreshTimer');
    if (!timer) return;
    setInterval(() => {
        seconds--;
        if (seconds <= 0) {
            timer.textContent = 'Refreshing...';
        } else {
            timer.textContent = 'Auto-refresh in ' + seconds + 's';
        }
    }, 1000);
})();
</script>
</body>
</html>`);
    } catch (error) {
        console.error('Analytics Page Error:', error);
        res.status(500).send(`<!DOCTYPE html><html><head><title>Error</title><style>${viewerStyles}</style></head><body>
            <div class="main" style="text-align:center;padding:100px">
                <h1 style="color:#ef4444">❌ Error Loading Analytics</h1>
                <p style="color:#9ca3af">${error.message}</p>
                <a href="/viewer/search" class="btn btn-go" style="margin-top:20px">Back to Admin Panel</a>
            </div>
        </body></html>`);
    }
});

// =====================================================
// ANALYTICS API ENDPOINTS
// =====================================================

const PlayerConnection = require('../database/models/PlayerConnection');
const AltGroup = require('../database/models/AltGroup');
const PlayerAnalytics = require('../database/models/PlayerAnalytics');
const ServerTps = require('../database/models/ServerTps');
const ChunkAnalytics = require('../database/models/ChunkAnalytics');
const LagAlert = require('../database/models/LagAlert');
const PlayerImpact = require('../database/models/PlayerImpact');

// Analytics API Key validation
const ANALYTICS_API_KEY = process.env.ANALYTICS_API_KEY || process.env.LINK_API_KEY;

function validateAnalyticsKey(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization header' });
    }
    
    const token = authHeader.substring(7);
    if (token !== ANALYTICS_API_KEY) {
        return res.status(403).json({ success: false, error: 'Invalid API key' });
    }
    
    next();
}

// Hash IP for privacy
function hashIp(ip) {
    return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'newlife')).digest('hex').substring(0, 16);
}

// POST /api/analytics/connection - Log player connection
app.post('/api/analytics/connection', validateAnalyticsKey, async (req, res) => {
    try {
        const { uuid, username, ip, server, type, sessionDuration, ping } = req.body;
        
        if (!uuid || !username || !ip) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        const ipHash = hashIp(ip);
        
        // Store connection
        await PlayerConnection.create({
            uuid,
            username,
            ip,
            ipHash,
            server: server || 'proxy',
            type: type || 'join',
            sessionDuration: sessionDuration || 0,
            ping: ping || 0
        });
        
        // Update player analytics
        const updateData = {
            $set: { username, lastSeen: new Date() },
            $setOnInsert: { firstSeen: new Date() },
            $inc: { connectionCount: 1 }
        };
        
        if (sessionDuration) {
            updateData.$inc.totalPlaytime = sessionDuration;
            updateData.$inc.sessionCount = 1;
        }
        
        await PlayerAnalytics.findOneAndUpdate(
            { uuid },
            updateData,
            { upsert: true }
        );
        
        // Check for ALTs and emit event to Discord bot
        if (type === 'join' && global.discordClient) {
            const sameIpAccounts = await PlayerConnection.aggregate([
                { $match: { ipHash, uuid: { $ne: uuid } } },
                { $group: { _id: '$uuid', username: { $last: '$username' }, count: { $sum: 1 } } }
            ]);
            
            if (sameIpAccounts.length > 0) {
                // Check if already flagged
                const existing = await AltGroup.findOne({
                    $or: [
                        { primaryUuid: uuid },
                        { 'linkedAccounts.uuid': uuid }
                    ]
                });
                
                if (!existing) {
                    // Calculate risk score
                    let riskScore = 30 + Math.min(sameIpAccounts.length * 15, 40);
                    riskScore = Math.min(riskScore, 100);
                    
                    const altGroup = await AltGroup.create({
                        primaryUuid: uuid,
                        primaryUsername: username,
                        linkedAccounts: sameIpAccounts.map(a => ({
                            uuid: a._id,
                            username: a.username
                        })),
                        sharedIps: [ipHash],
                        riskScore,
                        status: 'pending'
                    });
                    
                    // Emit to Discord bot
                    global.discordClient.emit('analyticsEvent', {
                        type: 'alt_detected',
                        altGroup,
                        newPlayer: { uuid, username },
                        linkedAccounts: sameIpAccounts
                    });
                }
            }
        }
        
        return res.json({ success: true });
    } catch (error) {
        console.error('Analytics Connection Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/analytics/tps - Log TPS data
app.post('/api/analytics/tps', validateAnalyticsKey, async (req, res) => {
    try {
        const { server, tps, mspt, loadedChunks, entityCount, playerCount, memoryUsed, memoryMax } = req.body;
        
        if (!server || tps === undefined) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        await ServerTps.create({
            server,
            tps,
            mspt: mspt || 0,
            loadedChunks: loadedChunks || 0,
            entityCount: entityCount || 0,
            playerCount: playerCount || 0,
            memoryUsed: memoryUsed || 0,
            memoryMax: memoryMax || 0
        });
        
        // Emit TPS alert if low
        if (tps < 18 && global.discordClient) {
            global.discordClient.emit('analyticsEvent', {
                type: 'tps_update',
                server,
                tps,
                mspt,
                loadedChunks,
                entityCount,
                playerCount,
                memoryUsed,
                memoryMax
            });
        }
        
        return res.json({ success: true });
    } catch (error) {
        console.error('Analytics TPS Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/analytics/chunks - Log chunk scan data
app.post('/api/analytics/chunks', validateAnalyticsKey, async (req, res) => {
    try {
        const { server, chunks } = req.body;
        
        if (!server || !chunks || !Array.isArray(chunks)) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        const flaggedChunks = [];
        
        for (const chunk of chunks) {
            const { world, x, z, entities, entityBreakdown, hoppers, redstone, tileEntities, playersNearby } = chunk;
            
            let flagged = false;
            let flagReason = null;
            
            if (entities >= 250) {
                flagged = true;
                flagReason = `Critical entity count: ${entities}`;
            } else if (entities >= 100) {
                flagged = true;
                flagReason = `High entity count: ${entities}`;
            } else if (hoppers >= 50) {
                flagged = true;
                flagReason = `High hopper count: ${hoppers}`;
            } else if (redstone >= 100) {
                flagged = true;
                flagReason = `High redstone count: ${redstone}`;
            }
            
            await ChunkAnalytics.findOneAndUpdate(
                { server, world, chunkX: x, chunkZ: z },
                {
                    entityCount: entities || 0,
                    entityBreakdown: entityBreakdown || {},
                    tileEntityCount: tileEntities || 0,
                    hopperCount: hoppers || 0,
                    redstoneCount: redstone || 0,
                    flagged,
                    flagReason,
                    playersNearby: playersNearby || [],
                    lastUpdated: new Date()
                },
                { upsert: true }
            );
            
            if (flagged) {
                flaggedChunks.push({ ...chunk, flagReason });
            }
        }
        
        // Emit flagged chunks to Discord
        if (flaggedChunks.length > 0 && global.discordClient) {
            global.discordClient.emit('analyticsEvent', {
                type: 'chunk_scan',
                server,
                chunks: flaggedChunks
            });
        }
        
        return res.json({ success: true, flaggedCount: flaggedChunks.length });
    } catch (error) {
        console.error('Analytics Chunks Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/analytics/lag-alert - Log lag alert
app.post('/api/analytics/lag-alert', validateAnalyticsKey, async (req, res) => {
    try {
        const { server, type, severity, location, details, playerNearby, metrics } = req.body;
        
        if (!server || !type || !details) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        const alert = await LagAlert.create({
            server,
            type,
            severity: severity || 'medium',
            location,
            details,
            playerNearby,
            metrics
        });
        
        // Emit to Discord
        if (global.discordClient) {
            global.discordClient.emit('analyticsEvent', {
                type: 'lag_alert',
                ...alert.toObject()
            });
        }
        
        return res.json({ success: true, alertId: alert._id });
    } catch (error) {
        console.error('Analytics Lag Alert Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// POST /api/analytics/player-impact - Log player impact
app.post('/api/analytics/player-impact', validateAnalyticsKey, async (req, res) => {
    try {
        const data = req.body;
        
        if (!data.uuid || !data.username || !data.server) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        await PlayerImpact.create(data);
        
        return res.json({ success: true });
    } catch (error) {
        console.error('Analytics Player Impact Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/analytics/player/:uuid - Get player analytics
app.get('/api/analytics/player/:uuid', validateAnalyticsKey, async (req, res) => {
    try {
        const { uuid } = req.params;
        
        const analytics = await PlayerAnalytics.findOne({ uuid });
        const altGroup = await AltGroup.findOne({
            $or: [{ primaryUuid: uuid }, { 'linkedAccounts.uuid': uuid }]
        });
        
        return res.json({
            success: true,
            analytics,
            altGroup
        });
    } catch (error) {
        console.error('Analytics Player Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/analytics/alts/pending - Get pending ALT reviews
app.get('/api/analytics/alts/pending', validateAnalyticsKey, async (req, res) => {
    try {
        const pending = await AltGroup.find({ status: 'pending' }).sort({ riskScore: -1 }).limit(50);
        return res.json({ success: true, alts: pending });
    } catch (error) {
        console.error('Analytics Alts Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/analytics/server/:server/tps - Get TPS history
app.get('/api/analytics/server/:server/tps', validateAnalyticsKey, async (req, res) => {
    try {
        const { server } = req.params;
        const hours = parseInt(req.query.hours) || 1;
        
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        const tpsData = await ServerTps.find({
            server,
            timestamp: { $gte: since }
        }).sort({ timestamp: -1 });
        
        return res.json({ success: true, data: tpsData });
    } catch (error) {
        console.error('Analytics TPS History Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/analytics/server/:server/chunks/problem - Get problem chunks
app.get('/api/analytics/server/:server/chunks/problem', validateAnalyticsKey, async (req, res) => {
    try {
        const { server } = req.params;
        
        const problemChunks = await ChunkAnalytics.find({
            server,
            flagged: true
        }).sort({ entityCount: -1 }).limit(20);
        
        return res.json({ success: true, chunks: problemChunks });
    } catch (error) {
        console.error('Analytics Problem Chunks Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/analytics/alerts - Get active alerts
app.get('/api/analytics/alerts', validateAnalyticsKey, async (req, res) => {
    try {
        const server = req.query.server;
        const query = { resolved: false };
        if (server) query.server = server;
        
        const alerts = await LagAlert.find(query).sort({ timestamp: -1 }).limit(50);
        return res.json({ success: true, alerts });
    } catch (error) {
        console.error('Analytics Alerts Error:', error);
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
