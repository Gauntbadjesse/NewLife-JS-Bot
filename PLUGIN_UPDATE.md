# PvP Status Plugin Update - Bug Fixes & New Commands

## 🐛 Bugs Fixed

### 1. Name Color Preservation ✅
**Issue:** TAB list was changing player name colors  
**Fix:** Modified `TabListManager.java` to preserve original name colors
- `buildPrefix()` now returns just the boxes with space: `"■■ "`
- `updatePlayer()` appends prefix without wrapping name in Component

### 2. PvP Cooldown Completion ✅
**Issue:** When PvP cooldown ended, it stayed yellow and didn't turn off  
**Fix:** Modified `PvpCommand.java` cooldown scheduler
- Removed `!hasPvpCooldown()` check that was preventing execution
- Now unconditionally sets `pvpEnabled = false` after 5 minutes
- Clears cooldown with `setPvpCooldownUntil(0)`
- Sends success message: "Your PvP has been turned off after the cooldown period."

### 3. Enhanced Logging ✅
**Improvement:** Added detailed logging to track Discord API calls
- ApiClient now logs each request with emoji indicators (✓/✗)
- Shows endpoint URL, player name, event type
- Includes stack traces for debugging failed requests

## 🎮 New Discord Commands

### `/pvplogs recent [count]`
View recent PvP events across all players
- **count**: Number of events (1-25, default 10)
- Shows: Status changes, kills, invalid PvP, deaths
- Displays: Timestamp, event type, players involved

### `/pvplogs player <username> [count]`
View PvP history for a specific player
- **username**: Minecraft username (required)
- **count**: Number of events (1-25, default 10)
- Shows: All events involving that player
- Displays: Their perspective (killed/killed by, attacked/attacked by)

### `/pvplogs stats <username>`
View comprehensive PvP statistics
- **PvP Kills**: Total consensual PvP kills
- **PvP Deaths**: Times killed by other players
- **K/D Ratio**: Calculated kill/death ratio
- **Invalid PvP Attacks**: Non-consensual attack attempts
- **Total Deaths**: All deaths (PvP and environmental)
- **Total Events**: Sum of all recorded events

## 📦 Deployment Steps

### 1. Replace Plugin JAR
```bash
# Stop your server
# Replace the old JAR with the new one:
cp velocity-status-plugin/target/newlife-status-1.0.0.jar /path/to/server/plugins/
# Start your server
```

### 2. Verify Config
No config changes needed. Existing `config.yml` works with new version:
```yaml
discord:
  enabled: true
  api-url: "http://193.218.34.214:3001"
  api-key: "yhweiughwiufheowinfdoweihfoweih9832597gr8974tg97fg9h3h49f"
  log-channel: "1439438975151505419"

pvp:
  cooldown: 300 # 5 minutes in seconds
```

### 3. Restart Discord Bot
```bash
# Pull latest changes
git pull

# Restart bot to load new commands
pm2 restart discord-bot
# or
npm start
```

### 4. Test Commands
In Discord:
```
/pvplogs recent 5
/pvplogs player YourUsername
/pvplogs stats YourUsername
```

## 🔍 Verifying Fixes

### Test 1: Name Colors
1. Join server with a rank that has a colored name
2. Type `/pvp on`
3. Check TAB list - your name should keep its original color
4. Expected: `■■ §6YourName` (with your rank color)

### Test 2: Cooldown Completion
1. Type `/pvp on` then `/pvp off`
2. Watch TAB list - first box turns yellow (🟨)
3. Wait 5 minutes
4. Expected:
   - Both boxes turn grey (⬜)
   - Message: "Your PvP has been turned off after the cooldown period."

### Test 3: Discord Logging
1. Type `/pvp on` or `/status recording`
2. Check server console for log message
3. Check Discord channel #1439438975151505419
4. Expected: Embed showing your status change with green/red boxes

## 📊 Technical Details

### Files Modified
- `TabListManager.java` (lines 35-67)
- `PvpCommand.java` (lines 122-147)
- `ApiClient.java` (added enhanced logging)
- `src/cogs/pvpStatus.js` (added slash commands)

### Database Schema
PvP logs stored in MongoDB `pvplogs` collection:
```javascript
{
  type: 'status_change' | 'pvp_kill' | 'invalid_pvp' | 'death',
  timestamp: Date,
  username: String,
  uuid: String,
  // Type-specific fields...
}
```

### Permissions
All `/pvplogs` commands require staff permissions (checked via `isStaff()`)

## 🆘 Troubleshooting

### Discord Logs Not Appearing
1. Check server console for "✓ Successfully logged to Discord" messages
2. Verify API key in `.env` matches `config.yml`
3. Check bot console for "PvP event logger initialized"
4. Test manually: `/pvplogs recent` should show stored logs

### Cooldown Still Not Disabling
1. Check server console after 5 minutes for success message
2. Verify no errors in console
3. Try `/pvp status` to see current cooldown time
4. Reload plugin: `/reload confirm` (not recommended for production)

### Commands Not Showing
1. Restart Discord bot to register new slash commands
2. Wait 1-2 minutes for Discord API to sync
3. Check bot console for "Registered slash commands" message
4. Try in a different channel

## 📝 Notes

- All fixes are backward compatible with existing data
- No database migrations needed
- Config file format unchanged
- Existing PvP logs in database work with new commands
