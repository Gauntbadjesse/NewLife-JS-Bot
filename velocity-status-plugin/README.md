# NewLife Status Plugin

**Version:** 1.0.0  
**Platform:** Velocity Proxy (Minecraft 1.20+)

## Overview

The NewLife Status plugin provides a PvP consent system and recording/streaming status tracking for NewLife SMP. Players can control their PvP status with a 5-minute cooldown when disabling, and set their recording/streaming status. All statuses are displayed in the TAB list with colored boxes.

## Features

- **PvP Consent System**
  - Players must have PvP enabled for fights to be consensual
  - Instant enable, 5-minute cooldown to disable
  - TAB list indicator (Green = ON, Yellow = Cooldown, Grey = OFF)
  
- **Recording/Streaming Status**
  - Players can set status to Recording (Red), Streaming (Purple), or None (Grey)
  - Displayed in TAB list next to PvP status
  
- **Discord Integration**
  - Logs PvP status changes
  - Logs consensual PvP kills
  - Logs invalid PvP attempts
  - Logs all player deaths
  
- **Data Persistence**
  - Player data saved to JSON files
  - Survives restarts and reloads

## Commands

### `/pvp <on|off|status|info>`
- `/pvp on` - Enable PvP instantly
- `/pvp off` - Start 5-minute cooldown to disable PvP
- `/pvp status` - View your current PvP and recording status
- `/pvp info` - View PvP system rules and information

### `/status <recording|streaming|none>`
- `/status recording` - Set status to Recording (Red ■)
- `/status streaming` - Set status to Streaming (Purple ■)
- `/status none` - Clear status (Grey ■)

## Installation

1. Build the plugin:
   ```bash
   cd velocity-status-plugin
   mvn clean package
   ```

2. Copy the JAR file from `target/` to your Velocity `plugins/` folder

3. Restart your Velocity proxy

4. Edit `plugins/newlife-status/config.yml` with your Discord bot API settings

## Configuration

```yaml
api:
  url: "http://localhost:3000/api/pvp"  # Your Discord bot API URL
  key: "your-api-key-here"               # API authentication key
  timeout: 5000                          # Request timeout in ms

pvp:
  cooldown_minutes: 5                    # Minutes for PvP disable cooldown
  damage_threshold: 3.75                 # Log after this much damage (HP)

colors:
  pvp_on: "§a"           # Green
  pvp_off: "§7"          # Grey
  pvp_cooldown: "§e"     # Yellow
  status_recording: "§c" # Red
  status_streaming: "§5" # Purple
  status_none: "§7"      # Grey

tab_format: "{player_name} {pvp}{status}"
```

## TAB List Display

Players will see colored boxes next to names in the TAB list:

- `Steve ■■` - Green + Red = PvP ON, Recording
- `Alex ■■` - Green + Purple = PvP ON, Streaming
- `Notch ■■` - Green + Grey = PvP ON, No status
- `Herobrine ■■` - Grey + Grey = PvP OFF, No status

## Discord Logging

The plugin sends the following events to your Discord bot:

1. **PvP Status Changes** - When players enable/disable PvP
2. **PvP Kills** - When a player kills another (with consent status)
3. **Invalid PvP** - When damage exceeds threshold with one player having PvP OFF
4. **Deaths** - All player deaths (PvP and non-PvP)

## Permissions

All commands are available to all players by default. No special permissions required.

## Requirements

- Velocity 3.3.0+
- Java 17+
- NewLife Discord Bot (for logging integration)

## Support

For issues or questions, contact the NewLife SMP staff team.
