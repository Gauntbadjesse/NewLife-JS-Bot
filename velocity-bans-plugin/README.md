# NewLife Bans - Velocity Plugin

A Velocity proxy plugin that integrates with the NewLife Discord bot to enforce bans across the network.

## Features

- **Ban Enforcement**: Automatically prevents banned players from connecting to any server
- **Linked Account Support**: When a player is banned through Discord, all their linked Minecraft accounts are blocked
- **Rich Kick Messages**: Beautiful, formatted kick messages using MiniMessage
- **In-Game Commands**: Check ban status with `/baninfo`
- **Fail-Safe**: Optionally allows players through if the API is unavailable
- **Staff Bypass**: Staff can bypass ban checks with a permission

## Installation

1. Build the plugin:
   ```bash
   cd velocity-bans-plugin
   mvn clean package
   ```

2. Copy `target/NewLifeBans-1.0-SNAPSHOT.jar` to your Velocity `plugins` folder

3. Start/restart Velocity to generate the config file

4. Edit `plugins/NewLifeBans/config.yml`:
   - Set `api.url` to your bot's API URL (e.g., `http://localhost:3001`)
   - Set `api.key` to match the `LINK_API_KEY` in your bot's `.env` file
   - Customize messages as desired

5. Restart Velocity or reload the plugin

## Configuration

```yaml
# API Settings
api:
  url: "http://localhost:3001"      # Your bot's API URL
  key: "your-secure-api-key-here"   # Must match LINK_API_KEY
  timeout: 5000                      # Request timeout (ms)

# Messages support MiniMessage format
# Placeholders: {reason}, {duration}, {expires}, {case}, {staff}
messages:
  banned: "..."       # Shown to banned players
  api-error: "..."    # Shown when API is unavailable

# Staff bypass permission
bypass-permission: "newlife.bans.bypass"

# Enable verbose logging
debug: false
```

## Commands

| Command | Permission | Description |
|---------|------------|-------------|
| `/baninfo` | None | Check your own ban status |
| `/baninfo <player>` | `newlife.bans.checkothers` | Check another player's ban status |

## Permissions

| Permission | Description | Default |
|------------|-------------|---------|
| `newlife.bans.bypass` | Bypass ban checks | op |
| `newlife.bans.checkothers` | Check other players' ban status | op |

## Discord Commands

The following Discord commands are available through the bot:

| Command | Description |
|---------|-------------|
| `/ban <player> <reason> <duration>` | Ban a player (all linked accounts) |
| `/unban <player>` | Unban a player (all linked accounts) |
| `/checkban <player>` | Check if a player is banned |
| `/banhistory <player>` | View a player's ban history |

## How It Works

1. **Player Joins**: When a player attempts to connect, the plugin intercepts the login event
2. **API Check**: The plugin queries the bot's API with the player's UUID
3. **Ban Lookup**: The bot checks if any bans exist for that UUID (including via linked accounts)
4. **Response**: If banned, the player is kicked with a formatted message showing the ban reason and expiry
5. **Linked Accounts**: When a player is banned through Discord, all their linked Minecraft accounts are automatically included in the ban

## API Endpoints Used

The plugin communicates with the following bot API endpoints:

- `GET /api/ban/:uuid` - Check if a UUID is banned
  - Returns: `{ success, banned, data: { caseNumber, reason, duration, isPermanent, remaining, expiresAt, staffTag } }`

## Requirements

- Velocity 3.3.0 or higher
- Java 17 or higher
- NewLife Discord Bot with API enabled (port 3001)

## Building from Source

```bash
# Clone the repository
git clone <repo-url>
cd NewLife-JS-Bot/velocity-bans-plugin

# Build with Maven
mvn clean package

# Output: target/NewLifeBans-1.0-SNAPSHOT.jar
```

## Troubleshooting

### Players can't connect at all
- Enable `debug: true` in config to see detailed logs
- Check if the API is running (`curl http://localhost:3001/health`)
- Verify the API key matches between bot and plugin

### Bans aren't being enforced
- Check the player's UUID is correct in the ban
- Ensure the ban hasn't expired
- Check if the player has the bypass permission

### Connection timeouts
- Increase `api.timeout` in config
- Ensure the bot API is running and accessible from the Velocity server

## Support

For issues or questions, join the NewLife SMP Discord:
https://discord.gg/YKhHRCgaSv
