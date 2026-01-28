# NewLife Bot - Copilot Instructions

## Project Overview
Discord bot for **NewLife SMP** Minecraft server. Manages moderation (warnings, bans, kicks, mutes), support tickets, account linking (Discord ↔ Minecraft), whitelist management, and staff infrastructure.

## Architecture

### Component Structure
```
src/
├── bot.js          # Entry point: loads cogs, registers slash commands, initializes subsystems
├── cogs/           # Feature modules (commands + events). Each exports { commands, slashCommands }
├── database/       # Mongoose models and connection. Case numbers via atomic Counter increment
├── utils/          # Shared helpers: permissions, embeds, RCON, error logging
└── api/            # Express REST server for Velocity plugin communication
```

**Velocity Plugins** (`velocity-*/`): Java plugins that communicate with the bot's API for ban enforcement and account linking verification.

### Data Flow
- **MongoDB Change Streams**: `database/watcher.js` monitors warnings/bans collections → sends DMs and logs to Discord channels automatically
- **RCON**: Bot sends commands to Minecraft server via `rcon-client` for whitelist/broadcast/kick operations
- **API Server**: Velocity plugins verify linked accounts and bans via REST endpoints at `/api/`

## Key Patterns

### Adding Commands (Cog Pattern)
All commands live in `src/cogs/*.js`. Export structure:
```javascript
module.exports = {
    commands: {
        // Prefix commands (!command)
        commandname: {
            name: 'commandname',
            description: 'Description',
            usage: '!commandname <arg>',
            async execute(message, args, client) { }
        }
    },
    slashCommands: [
        // Slash commands (/command)
        {
            data: new SlashCommandBuilder()
                .setName('commandname')
                .setDescription('Description'),
            async execute(interaction) { }
        }
    ]
};
```

### Permission Hierarchy
Use `src/utils/permissions.js`. Levels (high to low): Owner(6) > Management(5) > Supervisor(4) > Admin(3) > SrMod(2) > Moderator(1) > Everyone(0)
```javascript
const { isAdmin, isSupervisor, isManagement, isModerator } = require('../utils/permissions');
if (!isAdmin(member)) return; // Checks Admin OR any higher role
```

### Case Numbers
All moderation records use atomic sequential case numbers:
```javascript
const { getNextCaseNumber } = require('../database/caseCounter');
const caseNumber = await getNextCaseNumber(); // Returns next integer
```

### Embeds
Use `src/utils/embeds.js` for consistent styling. Premium users get custom colors:
```javascript
const { createSuccessEmbed, createErrorEmbed, getMemberEmbedColor } = require('../utils/embeds');
```

### RCON Commands
```javascript
const { executeRcon } = require('../utils/rcon');
const { success, response } = await executeRcon('whitelist add PlayerName');
```

## Environment Variables
Critical env vars (see README for full list):
- `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` - Discord bot config
- `MONGODB_URI`, `MONGODB_DATABASE` - Database connection
- `RCON_HOST`, `RCON_PORT`, `RCON_PASSWORD` - Minecraft server RCON
- Role IDs: `OWNER_ROLE_ID`, `MANAGEMENT_ROLE_ID`, `ADMIN_ROLE_ID`, `MODERATOR_ROLE_ID`, etc.

## Development Workflow
```bash
npm run dev     # Start with nodemon (auto-restart on changes)
npm start       # Production start
```

**Slash commands register on startup** to the guild specified in `GUILD_ID` (or `REGISTER_GUILD` override).

## Database Models
All in `src/database/models/`. Key models:
- `Ban`, `Warning`, `Kick`, `Mute` - Moderation records
- `LinkedAccount` - Discord ↔ Minecraft account links
- `Application` - Whitelist applications
- `Infraction` - Staff discipline records

Models use `_id: String` (UUID) with `caseNumber: Number` for human-readable references.

## Velocity Plugins (Java)
Build with Maven: `cd velocity-plugin && mvn clean package`
- `velocity-plugin`: Account linking enforcement
- `velocity-bans-plugin`: Ban sync with MongoDB
- `velocity-status-plugin`: Server status reporting
