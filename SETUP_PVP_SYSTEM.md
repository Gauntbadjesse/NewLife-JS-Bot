# NewLife PvP & Status System - Setup Guide

## 🎯 Overview

Complete PvP consent and recording status system with:
- ✅ Velocity plugin for Minecraft server
- ✅ Discord bot integration for logging
- ✅ MongoDB data persistence
- ✅ TAB list display with colored boxes
- ✅ 5-minute PvP disable cooldown

---

## 📦 Components

### 1. Velocity Plugin (`velocity-status-plugin/`)
- Handles player PvP status and recording/streaming status
- Displays colored boxes in TAB list
- Commands: `/pvp`, `/status`
- Logs events to Discord bot API

### 2. Discord Bot Integration (`src/`)
- API endpoint for receiving plugin logs
- MongoDB storage for log history
- Discord channel logging with rich embeds
- Channel ID: `1439438975151505419`

---

## 🚀 Installation Steps

### Step 1: Build the Velocity Plugin

```bash
cd velocity-status-plugin
mvn clean package
```

The compiled JAR will be in `target/newlife-status-1.0.0.jar`

### Step 2: Install Plugin on Velocity

1. Copy `newlife-status-1.0.0.jar` to your Velocity `plugins/` folder
2. Start/restart Velocity server
3. Plugin will create `plugins/newlife-status/config.yml`

### Step 3: Configure the Plugin

Edit `plugins/newlife-status/config.yml`:

```yaml
api:
  url: "https://yourserver.com/api/pvp"  # Your Discord bot API URL
  key: "your-secure-api-key-here"         # Generate a secure key
  timeout: 5000

pvp:
  cooldown_minutes: 5
  damage_threshold: 3.75

tab_format: "{player_name} {pvp}{status}"
```

### Step 4: Configure Discord Bot

Add to your `.env` file:

```env
# PvP API Key (must match the Velocity plugin config)
PVP_API_KEY=your-secure-api-key-here
```

### Step 5: Restart Services

1. Restart Velocity proxy (to load plugin with new config)
2. Restart Discord bot (to activate API endpoint)

---

## 🎮 Player Commands

### PvP Commands (`/pvp`)

```
/pvp on       - Enable PvP instantly (Green ■)
/pvp off      - Start 5-minute cooldown (Yellow ■)
/pvp status   - View your current status
/pvp info     - View PvP system rules
```

### Status Commands (`/status`)

```
/status recording  - Set to Recording (Red ■)
/status streaming  - Set to Streaming (Purple ■)
/status none       - Clear status (Grey ■)
```

---

## 🎨 TAB List Format

```
PlayerName ■■
           ││
           │└─ Status Box (Recording/Streaming)
           └── PvP Box (ON/OFF/Cooldown)
```

**Color Legend:**
- 🟩 Green = PvP ON
- 🟨 Yellow = PvP Cooldown (transitioning to OFF)
- ⬜ Grey = PvP OFF
- 🔴 Red = Recording
- 🟪 Purple = Streaming

**Examples:**
- `Steve ■■` - Green + Red = PvP ON, Recording
- `Alex ■■` - Green + Purple = PvP ON, Streaming
- `Notch ■■` - Yellow + Grey = Cooling down, No status
- `Herobrine ■■` - Grey + Grey = PvP OFF, No status

---

## 📊 Discord Logging

All events are logged to channel `1439438975151505419`

### Event Types:

#### 1. PvP Status Changes
```
🟩 Steve enabled PvP
Timestamp: 2026-01-21 14:32:15 UTC
```

#### 2. PvP Kills (Consensual)
```
╔═══════════════════════════════════════╗
║        ⚔️ PVP KILL LOGGED            ║
╠═══════════════════════════════════════╣
║ Killer: Steve 🟩                      ║
║ Victim: Alex 🟩                       ║
║ Both Consented: ✅ YES                ║
║ Killer Recording: 🔴 YES              ║
║ Victim Recording: ⬜ NO               ║
╚═══════════════════════════════════════╝
```

#### 3. Invalid PvP (Non-Consensual)
```
╔═══════════════════════════════════════╗
║     ⚠️ INVALID PVP DETECTED          ║
╠═══════════════════════════════════════╣
║ Attacker: Herobrine 🟩                ║
║ Victim: Jeb ⬜ (PvP OFF)             ║
║ Damage Dealt: 4.50 HP                ║
║ Consensual: ❌ NO                     ║
╚═══════════════════════════════════════╝
```

#### 4. Player Deaths (Non-PvP)
```
💀 Steve died to: Fall Damage
Timestamp: 2026-01-21 16:20:44 UTC
```

---

## ⚙️ Technical Details

### Data Storage

**Velocity Plugin:**
- JSON files in `plugins/newlife-status/playerdata/`
- Format: `<uuid>.json`
- Stores: PvP status, cooldown times, recording status

**Discord Bot:**
- MongoDB collection: `pvplogs`
- Stores all event history
- Indexed by type, UUIDs, timestamps

### API Endpoints

**POST `/api/pvp/log`**
```json
{
  "type": "pvp_kill",
  "killer": {
    "uuid": "069a79f4-44e9-4726-a518-ad80c88c47a5",
    "username": "Steve",
    "pvp_enabled": true,
    "status": "recording"
  },
  "victim": {
    "uuid": "853c80ef-3c3a-4754-be3b-bdb6f7ec4bf",
    "username": "Alex",
    "pvp_enabled": true,
    "status": "none"
  },
  "consensual": true,
  "timestamp": 1737471135000
}
```

**GET `/api/pvp/logs?type=pvp_kill&limit=50`**
- Query parameters: `type`, `uuid`, `limit`
- Returns: Array of log entries

### Authentication

All API requests require Bearer token authentication:

```
Authorization: Bearer your-api-key-here
```

---

## 🔧 Configuration Reference

### Velocity Plugin Config

| Setting | Default | Description |
|---------|---------|-------------|
| `api.url` | `http://localhost:3000/api/pvp` | Discord bot API endpoint |
| `api.key` | `your-api-key-here` | Authentication key |
| `api.timeout` | `5000` | Request timeout (ms) |
| `pvp.cooldown_minutes` | `5` | Minutes for PvP disable cooldown |
| `pvp.damage_threshold` | `3.75` | HP threshold for invalid PvP logging |
| `colors.pvp_on` | `§a` | Green color code |
| `colors.pvp_off` | `§7` | Grey color code |
| `colors.pvp_cooldown` | `§e` | Yellow color code |
| `colors.status_recording` | `§c` | Red color code |
| `colors.status_streaming` | `§5` | Purple color code |
| `colors.status_none` | `§7` | Grey color code |

---

## 🐛 Troubleshooting

### Plugin not loading
- Check Java version: `java -version` (requires Java 17+)
- Check Velocity version (requires 3.3.0+)
- Check console for errors

### TAB list not updating
- Rejoin the server
- Run `/pvp status` to refresh
- Check player data file exists

### Discord logs not appearing
- Verify API key matches in both configs
- Check bot console for API errors
- Verify channel ID `1439438975151505419` exists
- Ensure bot has permissions in the channel

### API Connection Failed
- Verify `api.url` is correct and accessible from Velocity server
- Check firewall/network rules
- Test API endpoint with curl:
  ```bash
  curl -X POST https://yourserver.com/api/pvp/log \
    -H "Authorization: Bearer your-api-key" \
    -H "Content-Type: application/json" \
    -d '{"type":"status_change","uuid":"test","username":"Test","enabled":true}'
  ```

---

## 📝 PvP Rules Summary

1. **Both players MUST have PvP ON** for a fight to be consensual
2. **PvP ON** → Instant activation
3. **PvP OFF** → 5-minute cooldown (cannot be cancelled)
4. **Winner decides:** Return items or keep loot
5. **If loot kept:** No ticket can be made about lost items
6. **Non-consensual damage:** Allowed but logged after 3.75 HP threshold

---

## 🔐 Security Notes

- **API Key:** Generate a strong random key (32+ characters)
- **Use HTTPS:** For production, use SSL/TLS for API endpoint
- **Firewall:** Restrict API endpoint to Velocity server IP
- **Rate Limiting:** Consider adding rate limits to API endpoint

---

## 📞 Support

For issues or questions:
1. Check logs in `plugins/newlife-status/` folder
2. Check Discord bot console output
3. Contact NewLife SMP staff team

---

## 🎉 You're All Set!

Players can now use:
- `/pvp on|off|status|info`
- `/status recording|streaming|none`

All PvP events will be logged to Discord channel `1439438975151505419` with full details including recording status!
