# NewLife Analytics - Paper Plugin

Server performance analytics and lag detection for NewLife SMP Paper servers.

## Features

- **TPS Monitoring**: Tracks server TPS and MSPT every second, reports to API every 3 seconds
- **Chunk Scanning**: Scans loaded chunks every 5 minutes for:
  - Entity counts (warning at 100, critical at 250)
  - Hopper counts (warning at 50)
  - Redstone components (warning at 100)
  - Tile entity counts
- **Lag Detection**: Automatic alerts when:
  - TPS drops below 18 (warning)
  - TPS drops below 15 (critical)
  - Entity spam detected (critical)
- **Player Association**: Tracks which players are near problem chunks

## Installation

1. Build with Maven:
   ```bash
   cd paper-analytics-plugin
   mvn clean package
   ```

2. Copy `target/newlife-analytics-paper-1.0.0.jar` to your Paper server's `plugins/` folder

3. Start the server once to generate config

4. Edit `plugins/NewLifeAnalytics/config.yml`:
   ```yaml
   api:
     url: http://your-bot-host:3001
     key: your-api-key-here
   server:
     name: main  # or lobby, creative, etc.
   debug: false
   
   thresholds:
     entity:
       warning: 100
       critical: 250
     hopper:
       warning: 50
     redstone:
       warning: 100
     tps:
       alert: 18.0
       critical: 15.0
   
   intervals:
     tps: 20        # TPS check interval (ticks)
     chunkScan: 6000 # Chunk scan interval (ticks, 6000 = 5 min)
     tpsReport: 60   # API report interval (ticks, 60 = 3 sec)
   ```

5. Restart the server

## API Endpoints Used

- `POST /api/analytics/tps` - TPS reports every 3 seconds
- `POST /api/analytics/chunks` - Chunk scan results every 5 minutes
- `POST /api/analytics/lag-alert` - Instant alerts for critical issues

## Data Sent

### TPS Report
```json
{
  "server": "main",
  "tps": 19.95,
  "mspt": 50.25,
  "loadedChunks": 342,
  "entityCount": 1523,
  "playerCount": 15,
  "memoryUsed": 4096,
  "memoryMax": 8192
}
```

### Chunk Report (only flagged chunks)
```json
{
  "server": "main",
  "chunks": [
    {
      "world": "world",
      "x": 15,
      "z": -23,
      "entities": 156,
      "entityBreakdown": {"item": 45, "zombie": 12, "skeleton": 8},
      "hoppers": 12,
      "redstone": 34,
      "tileEntities": 89,
      "playersNearby": [{"uuid": "...", "username": "Player1"}]
    }
  ]
}
```

### Lag Alert
```json
{
  "server": "main",
  "type": "entity_spam",
  "severity": "critical",
  "details": "Critical chunk at (15, -23) in world: 156 entities",
  "location": {"world": "world", "chunkX": 15, "chunkZ": -23, "x": 240, "z": -368},
  "playerNearby": {"uuid": "...", "username": "Player1"},
  "metrics": {"tps": 18.5, "mspt": 54.2}
}
```

## Discord Commands (via Bot)

- `/tps` - View current TPS across all servers
- `/chunks` - View problem chunks with high entity/redstone counts
- `/lag` - View recent lag alerts

## Requirements

- Paper 1.20.4+ (or compatible fork)
- Java 17+
- Bot API running on accessible host
