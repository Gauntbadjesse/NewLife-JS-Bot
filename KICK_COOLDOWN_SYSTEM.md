# Kick Cooldown System

## Overview
When a player is kicked via the `/kick` Discord command, they cannot rejoin the server for **30 minutes**.

## How It Works

### 1. Discord Bot Kicks Player
When a staff member uses `/kick` in Discord:
1. The bot executes the kick via RCON
2. Saves the kick record to MongoDB
3. **Sends a POST request to the Velocity plugin's HTTP server**

### 2. Velocity Plugin Receives Notification
The Velocity plugin runs a simple HTTP server on port 3002 that:
1. Listens for POST requests to `/kick`
2. Validates the API key (must match `LINK_API_KEY`)
3. Records the kick timestamp in memory using the player's UUID

### 3. Player Tries to Rejoin
When a kicked player attempts to log in:
1. `BanCheckListener` checks the kick cooldown map
2. If the UUID is found and < 30 minutes have passed:
   - Player is denied with a formatted message showing time remaining
   - Example: "Time Remaining: 23m 45s"
3. If > 30 minutes have passed:
   - Cooldown entry is removed from memory
   - Player can join normally

## Configuration

### Velocity Plugin Config
File: `velocity-bans-plugin/config.yml`

```yaml
api:
  kick-server-port: 3002  # Port for HTTP server
  key: "your-api-key"     # Must match bot's LINK_API_KEY
```

### Discord Bot
File: `src/cogs/serverBans.js`

After a kick is saved, the bot calls:
```javascript
fetch('http://localhost:3002/kick', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINK_API_KEY}`
    },
    body: JSON.stringify({ uuid: playerUuid })
});
```

## Technical Details

### In-Memory Storage
- Uses `ConcurrentHashMap<String, Long>` to store UUID → timestamp
- Thread-safe for concurrent access
- Automatically removes expired entries when players try to log in

### Cooldown Duration
- **30 minutes** (defined as constant in `BanCheckListener.java`)
- `KICK_COOLDOWN_MS = 30 * 60 * 1000`

### HTTP Server
- Runs on port **3002** by default (configurable)
- Uses Java's built-in `HttpServer` class
- API key authentication via Bearer token
- Single endpoint: `POST /kick` with `{"uuid": "player-uuid"}`

### Error Handling
- If HTTP server fails to start, cooldowns won't work (logged as warning)
- If Discord bot fails to notify plugin, player can still rejoin (non-blocking)
- If Velocity plugin is down during kick, cooldown won't be recorded

## Message Format
When a player is denied for kick cooldown:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KICKED - COOLDOWN ACTIVE

You were recently kicked and cannot rejoin yet.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COOLDOWN:

Time Remaining: 23m 45s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kick cooldowns help prevent disruption.
Please wait before attempting to reconnect.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Security Considerations

1. **API Key Required**: All kick notifications must include valid API key
2. **UUID Validation**: Only valid UUID strings are accepted
3. **Memory Safety**: Uses ConcurrentHashMap for thread-safe operations
4. **No Persistence**: Kick cooldowns are lost on server restart (intentional)

## Testing

To test the kick cooldown:
1. Use `/kick @player` in Discord
2. Try to log in immediately → Should be denied with countdown
3. Wait 30 minutes (or restart Velocity to clear cooldowns)
4. Log in → Should succeed

## Troubleshooting

**Kicks work but cooldowns don't:**
- Check if HTTP server started (look for "Kick notification server started on port 3002" in logs)
- Verify API key matches between bot and Velocity config
- Check if Discord bot can reach `localhost:3002`

**"Failed to notify Velocity about kick cooldown" error:**
- Velocity plugin may not be running
- HTTP server may have failed to start
- Port 3002 may be in use by another process

**Players can rejoin immediately after kick:**
- Check Velocity logs for "Received kick notification for player"
- Verify cooldown was recorded
- Check if player has bypass permission (`newlife.bans.bypass`)
