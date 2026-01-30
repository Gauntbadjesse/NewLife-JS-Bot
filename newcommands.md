# NewLife Bot Command Reference

This document provides a comprehensive reference for all NewLife Bot commands, organized by permission level. 

# Everyone Commands

These commands are available to all server members.

`/linkaccount <platform> <username>`
Link your Discord account to your Minecraft account (Java or Bedrock)

`/serverstats view`
View current server statistics (members, channels, boosts)

`!kingdom help`
Display kingdom system help

`!kingdom list <kingdom>`
List members of a specific kingdom

## Kingdom Commands (Rulers Only)

`!kingdom add <user>`
Add a user to your kingdom

`!kingdom remove <user>`
Remove a user from your kingdom

`!kingdom transfer <user>`
Transfer kingdom leadership to another user

## Server Moderation (Slash Commands)

`/ban <player> <reason> [duration]`
Ban a player from the Minecraft server

`/unban <player>`
Remove a player's server ban

`/kick <player> <reason>`
Kick a player from the server

`/warn <player> <reason>`
Issue a warning to a player

`/mute <player> <duration> <reason>`
Mute a player

`/warnings <player>`
View all warnings for a player

`/removewarn <case>`
Remove a specific warning

## Player Management

`/playerlookup <player> [detailed]`
Comprehensive player information lookup (history, notes, linked accounts)

`/whitelist add <platform> <mcname> <discord>`
Add a player to the whitelist and link their account

`/note add <player> <content>`
Add a staff note to a player

`/note list <player>`
List all notes for a player

`/note delete <id>`
Delete your own note

`/note search <query>`
Search notes by content

`/note recent`
View recent notes across all players

## Investigation Tools

`/pvplogs recent [count]`
View recent PvP combat logs

`/pvplogs player <username> [count]`
View PvP logs for a specific player

`/pvplogs stats <username>`
View PvP statistics for a player

`/alts check <player>`
Check if a player has potential ALT accounts

`/alts pending`
View pending ALT reviews

`/alts history <player>`
View player connection history

## Staff Utilities

`/loa start <duration> <reason>`
Start a leave of absence

`/loa end`
End your LOA early

`/loa view`
View all staff currently on LOA

`!embed rules`
Send the rules embed to the current channel

`!embed guru`
Send the guru guide embed

`!dm guru <@user>`
DM the guru guide to a specified user

`!history <player>`
View comprehensive moderation history

## Ticket Commands (In Tickets)

`close`
Close the current ticket

`tclose <time>`
Schedule ticket close (e.g., tclose 1h)

`add <@user>`
Add a user to the ticket

`remove <@user>`
Remove a user from the ticket

`rename <name>`
Rename the ticket channel

`transcript`
Generate and save ticket transcript

---

# Admin+ Commands

These commands require Admin role or higher.

## Role Management

`/reactionroles create <channel> <title>`
Create a new reaction role message

`/reactionroles add <messageid> <role> <emoji>`
Add a role to a reaction role message

`/reactionroles remove <messageid> <role>`
Remove a role from a message

`/reactionroles list`
List all reaction role setups

`/reactionroles delete <messageid>`
Delete a reaction role setup

`/emojirole add <messageid> <emoji> <role>`
Add emoji reaction role to any message

`/emojirole remove <messageid> <emoji>`
Remove emoji reaction role

`/emojirole list`
List all emoji reaction roles

## Statistics and Analytics

`/weekstats current`
View current week whitelist statistics

`/alts resolve <id> <action>`
Resolve an ALT detection flag (confirm/dismiss/link)

## Discord Moderation (Prefix Commands)

`!ban <user> <reason>`
Ban a Discord member

`!unban <userid>`
Unban a Discord member

`!kick <user> <reason>`
Kick a Discord member

`!mute <user> [duration]`
Mute a Discord member

`!unmute <user>`
Unmute a Discord member

`!lock [channel]`
Lock a channel (prevent messages)

`!unlock [channel]`
Unlock a channel

## Kingdom Management

`/kingdom create <name> <leaderrole> <memberrole>`
Create a new kingdom

`/kingdom delete <name>`
Delete a kingdom

`/kingdom list`
List all kingdoms

`/kingdom sync`
Sync kingdom roles from database

# Supervisor+ Commands

These commands require Supervisor role or higher.

`!page <@user> <reason>`
Page a user with 10 consecutive pings

`/infract view`
View staff infractions

`/infract <type> <reason> [user/mcname]`
Issue a staff infraction (termination, warning, notice, strike)

`/guru view [user]`
View guru performance metrics

`/guru leaderboard`
View guru performance leaderboard

`/application wipe <discordid>`
Wipe application data for a user

`/application debug <discordid>`
Debug application issues


## Whitelist Guru

Whitelist Gurus have limited staff access specifically for processing applications.

`/whitelist add <platform> <mcname> <discord>`
Add player to whitelist

`close`
Close apply tickets

`tclose <time>`
Schedule close for apply tickets

`add <@user>`
Add user to apply ticket

`remove <@user>`
Remove user from apply ticket

Note: Guru activity is automatically tracked for performance metrics.

---

# Staff Functions and Systems

This section covers automated systems and important functions that staff should be aware of.

---

## Ticket System

The ticket system supports multiple ticket types with different access levels:

**Apply Tickets**
Access: Whitelist Guru, Moderator+
Purpose: Whitelist applications

**General Tickets**
Access: Senior Mod+
Purpose: General questions and concerns

**Report Tickets**
Access: Senior Mod+
Purpose: Player reports

**Management Tickets**
Access: Supervisor+
Purpose: Staff-related issues

### Timed Close

Use `tclose <duration>` to schedule automatic closure.
Format examples: `1h`, `30m`, `1d`

## Moderation Case System

All moderation actions (bans, warnings, kicks, mutes) are assigned sequential case numbers for tracking.

**Case Number Format:** #12345

### Viewing Cases

- Case details are logged to the designated log channel
- Players receive DM notification with case number
- Cases can be viewed at `https://staff.newlifesmp.com/`
- Log in with discord and switch to the admin panel.

### Appealing

Players can appeal through the ticket system within 7 days, 
Appeals are not to be handeled by the person who moderated them
Appeals are also restricted to ADMIN +

### Account Linking

1. Player uses `/linkaccount` with platform and username
2. Bot verifies Minecraft account exists via API
3. Once the player is whitelisted, there added to a linked database that links there accounts

### Staff Tools

- `/playerlookup` shows linked account information

## ALT Detection System ( Supervisors )  

The analytics system automatically detects potential ALT accounts based on IP matching.

### Risk Scoring

- Accounts sharing IP addresses are flagged
- Risk score (0-100) indicates confidence level
- Higher scores indicate more suspicious patterns

### Resolution Actions

**confirm** - Mark accounts as confirmed ALTs
**dismiss** - Mark as false positive
**link** - Link accounts to same user

### Automatic Actions

- DMs players when banned/warned
- Logs moderation actions to Discord channels
- Updates member counts
- Syncs ban states with Velocity proxy
- Unwhitelists on member leave

## Error Handling

When errors occur:

1. Error is logged to console with stack trace
2. User receives generic error message
3. Critical errors logged to error channel
 * If you get an error with the bot, please ping @gauntbadjesse. So he can fix it!

## Leave of Absence (LOA)

Staff can request LOA through the bot:

### Starting LOA

- Use `/loa start <duration> <reason>`
- Duration format: `3d`, `1w`, `2w`
- LOA is logged and visible to other staff

### Ending LOA

- Use `/loa end` to return early
- LOA expires automatically at end of duration

### Viewing LOA

`/loa view` shows all staff currently on LOA


## Staff Infractions

Management can issue infractions to staff members:

**Notice** - Low severity, informal notification
**Warning** - Medium severity, formal warning
**Strike** - High severity, serious violation
**Termination** - Severe, employment/position terminated

3 warnings = 1 stike
3 strikes = 1 termination

