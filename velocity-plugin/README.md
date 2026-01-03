# NewLife Link - Velocity Plugin

A Velocity proxy plugin that enforces Discord account linking for NewLife SMP.

## Features

- **Account Verification**: Blocks players without linked Discord accounts
- **Beautiful Kick Messages**: Uses MiniMessage format for styled disconnect screens
- **API Integration**: Communicates with the Discord bot's Link API
- **Permission Bypass**: Staff can bypass the link requirement
- **Debug Mode**: Verbose logging for troubleshooting

## Installation

1. Build the plugin:
   ```bash
   cd velocity-plugin
   mvn clean package
   ```

2. Copy `target/newlife-link-1.0.0.jar` to your Velocity `plugins` folder

3. Start Velocity to generate the config file

4. Edit `plugins/newlife-link/config.yml`:
   - Set `api.url` to your bot's API URL (e.g., `http://localhost:3001`)
   - Set `api.key` to match `LINK_API_KEY` in your bot's `.env`

5. Restart Velocity

## Configuration

```yaml
api:
  url: "http://localhost:3001"  # Your bot's API URL
  key: "your-secure-api-key"    # Must match LINK_API_KEY in bot .env
  timeout: 5000                 # Request timeout in ms

messages:
  kick: |
    # MiniMessage formatted kick message for unlinked players
  api-error: |
    # MiniMessage formatted message for API errors

bypass-permission: "newlife.link.bypass"  # Permission to skip link check
debug: false  # Enable verbose logging
```

## Commands

| Command | Permission | Description |
|---------|------------|-------------|
| `/linkstatus` | Everyone | Check your own link status |
| `/linkstatus <player>` | `newlife.link.checkothers` | Check another player's status |

## Permissions

| Permission | Description |
|------------|-------------|
| `newlife.link.bypass` | Bypass the link requirement |
| `newlife.link.checkothers` | Check other players' link status |

## Bot Setup

Make sure your Discord bot has:

1. The Link API enabled (runs on port 3001 by default)
2. `LINK_API_KEY` set in `.env`
3. The `/linkaccount` command available for users

Add to your bot's `.env`:
```env
LINK_API_KEY=your-secure-api-key-here
LINK_API_PORT=3001
```

## How It Works

1. Player attempts to connect to the proxy
2. Plugin queries the bot's API with the player's UUID
3. If linked → Player connects normally
4. If not linked → Player sees a styled disconnect message with instructions
5. Player links their account in Discord using `/linkaccount`
6. Player can now join the server
