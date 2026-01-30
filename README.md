# NewLife Management Bot

A professional Discord bot for managing and viewing player punishments (warnings and bans) from the NewLife SMP Minecraft server.

## Features

- 🔍 **Case Lookup** - Look up any warning or ban by case ID
- 📋 **Player History** - View complete punishment history for any player
- ⚠️ **Warning Management** - List, search, and view warnings
- 🔨 **Ban Management** - List, search, and view bans
- 📊 **Statistics** - View database statistics
- 🔐 **Permission System** - Staff role-based access control
- ⚡ **Slash Commands** - Modern Discord slash command support
- 📝 **Prefix Commands** - Traditional prefix command support

## Requirements

- Node.js 18.0.0 or higher
- MongoDB database
- Discord Bot Token

## Installation

1. **Clone or download the bot files**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

4. **Edit the `.env` file with your configuration:**
   ```env
   # Discord Bot Configuration
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_client_id_here
   GUILD_ID=your_discord_guild_id_here

   # MongoDB Configuration
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DATABASE=newlife

   # Collection Names
   WARNINGS_COLLECTION=warnings
   BANS_COLLECTION=bans

   # Bot Settings
   BOT_PREFIX=!
   EMBED_COLOR=#2B2D31

   # Staff Role ID
   STAFF_ROLE_ID=your_staff_role_id_here
   ```

5. **Start the bot**
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

## Commands

### Warning Commands
| Command | Description |
|---------|-------------|
| `!warn <case_id>` | Look up a specific warning by ID |
| `!warnings <player> [page]` | List all warnings for a player |
| `!activewarnings [page]` | List all active warnings |
| `!recentwarnings [count]` | Show most recent warnings |

### Ban Commands
| Command | Description |
|---------|-------------|
| `!ban <case_id>` | Look up a specific ban by ID |
| `!bans <player> [page]` | List all bans for a player |
| `!activebans [page]` | List all active bans |
| `!recentbans [count]` | Show most recent bans |
| `!checkban <player>` | Check if a player is currently banned |

### General Commands
| Command | Description |
|---------|-------------|
| `!help [command]` | Show help menu or specific command help |
| `!history <player>` | Show player's full punishment history |
| `!lookup <case_id>` | Look up any case by ID |
| `!stats` | Show database statistics |
| `!ping` | Check bot latency |

All commands are also available as slash commands (`/command`).

## Database Schema

### Warnings Collection
```json
{
  "_id": "uuid-string",
  "uuid": "player-uuid-string",
  "playerName": "string",
  "staffUuid": "string or null",
  "staffName": "string",
  "reason": "string",
  "createdAt": { "$date": 1734659200000 },
  "active": true,
  "removedBy": "string or null",
  "removedAt": { "$date": ... }
}
```

### Bans Collection
```json
{
  "_id": "uuid-string",
  "uuid": "player-uuid-string",
  "playerName": "string",
  "staffUuid": "string or null",
  "staffName": "string",
  "reason": "string",
  "createdAt": { "$date": 1734659200000 },
  "active": true,
  "removedBy": "string or null",
  "removedAt": { "$date": ... }
}
```

## Project Structure

```
js bot/
├── src/
│   ├── bot.js                 # Main bot entry point
│   ├── cogs/                  # Command modules
│   │   ├── warnings.js        # Warning commands
│   │   ├── bans.js            # Ban commands
│   │   └── general.js         # General/utility commands
│   ├── database/
│   │   ├── connection.js      # MongoDB connection handler
│   │   └── models/
│   │       ├── Warning.js     # Warning schema
│   │       └── Ban.js         # Ban schema
│   └── utils/
│       ├── embeds.js          # Embed builder utilities
│       └── permissions.js     # Permission checker
├── .env                       # Environment configuration
├── .env.example               # Example environment file
├── package.json               # Node.js dependencies
└── README.md                  # This file
```

## Setting Up Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token to your `.env` file
5. Enable the following intents:
   - `Message Content Intent`
   - `Server Members Intent`
6. Go to OAuth2 > URL Generator
7. Select scopes: `bot`, `applications.commands`
8. Select permissions: `Send Messages`, `Embed Links`, `Read Message History`, `Use Slash Commands`
9. Use the generated URL to invite the bot to your server

## License

MIT License - NewLife SMP

## Support

For support, please contact the NewLife SMP administration team.




ANALYTICS_API_KEY=your-secure-key
LAG_ALERTS_CHANNEL_ID=channel-id
ALT_ALERTS_CHANNEL_ID=channel-id
IP_SALT=random-string-for-hashing