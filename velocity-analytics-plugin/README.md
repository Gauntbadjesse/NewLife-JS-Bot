# NewLife Analytics - Velocity Plugin

Connection tracking and ALT account detection for NewLife SMP Velocity proxy.

## Features

- **Connection Tracking**: Records every player connection with:
  - IP address (hashed for storage)
  - Minecraft UUID and username
  - Session duration tracking
- **ALT Account Detection**: Automatically links accounts that share IP addresses
- **Pending Review System**: Flags potential ALT groups for staff review
- **Session Tracking**: Tracks join/leave times for playtime analytics

## Installation

1. Build with Maven:
   ```bash
   cd velocity-analytics-plugin
   mvn clean package
   ```

2. Copy `target/newlife-analytics-velocity-1.0.0.jar` to your Velocity proxy's `plugins/` folder

3. Start the proxy once to generate config

4. Edit `plugins/newlife-analytics/config.yml`:
   ```yaml
   api-url: http://your-bot-host:3001
   api-key: your-api-key-here
   debug: false
   ```

5. Restart the proxy

## API Endpoints Used

- `POST /api/analytics/connection` - Player connection events
- `POST /api/analytics/disconnect` - Player disconnection events

## Data Sent

### Connection Event
```json
{
  "uuid": "player-uuid",
  "username": "PlayerName",
  "ipHash": "sha256-hash-of-ip",
  "rawIp": "192.168.1.1"
}
```

### Disconnect Event
```json
{
  "uuid": "player-uuid",
  "sessionDuration": 3600000
}
```

## ALT Detection Logic

1. When a player connects, their IP is recorded
2. The bot API checks if any other accounts have used the same IP
3. If found, accounts are grouped into an "ALT Group"
4. Groups with multiple accounts are flagged for staff review
5. Staff can mark groups as "confirmed alts", "false positive", or "banned"

## Privacy Considerations

- IPs are stored with SHA-256 hashing in the database
- Raw IPs are only used for ALT detection, then discarded
- All connection data expires after 14 days (configurable)
- Staff with Supervisor+ permission can view ALT groups

## Discord Commands (via Bot)

- `/alts <player>` - View potential ALT accounts for a player
- `/alts pending` - View ALT groups pending review
- `/alts mark <group_id> <status>` - Mark ALT group status

## Requirements

- Velocity 3.1.0+
- Java 17+
- Bot API running on accessible host
