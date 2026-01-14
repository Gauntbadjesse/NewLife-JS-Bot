# NewLife Bot - Command Reference

## Permission Levels
| Level | Role |
|-------|------|
| 6 | Owner |
| 5 | Management |
| 4 | Supervisor |
| 3 | Admin |
| 2 | Sr Mod |
| 1 | Moderator |
| 0 | Everyone |

Special: `Whitelist Guru` - Can use whitelist commands and close apply tickets

## Ticket Permissions
| Ticket Type | Access Roles |
|-------------|--------------|
| General | Moderator, Admin, Supervisor, Management |
| Report | Admin, Supervisor, Management |
| Management | Supervisor, Management |

---

## Slash Commands

### /help
- **Permission:** Everyone
- **Description:** Show available commands

### /ping
- **Permission:** Everyone
- **Description:** Check bot latency

### /history
- **Permission:** Staff
- **Options:** `player` (required)
- **Description:** Show player's full punishment history

### /lookup
- **Permission:** Staff
- **Options:** `case_id` (required)
- **Description:** Look up any case by ID

### /stats
- **Permission:** Admin
- **Description:** Show database statistics

### /panel
- **Permission:** Supervisor
- **Description:** Send the support ticket panel

### /close
- **Permission:** Staff / Whitelist Guru (apply tickets)
- **Options:** `reason` (required)
- **Description:** Close current ticket

### /tclose
- **Permission:** Staff / Whitelist Guru (apply tickets)
- **Options:** `time` (required), `reason` (required)
- **Description:** Close ticket after delay (e.g., 30s, 5m, 1h)

### /escalate
- **Permission:** Moderator+
- **Options:** `level` (required: general/report/management)
- **Description:** Escalate ticket to higher permission level. Pings Staff Team for general/report, Management for management tickets.

### /add
- **Permission:** Staff
- **Options:** `user` (required)
- **Description:** Add a user to the current ticket

### /remove
- **Permission:** Staff
- **Options:** `user` (required)
- **Description:** Remove a user from the current ticket

### /mute
- **Permission:** Moderator+
- **Options:** `duration` (required), `reason` (required), `target` (optional), `mcname` (optional)
- **Description:** Mute a Discord user for a period of time. DMs the user and logs the action.

### /unmute
- **Permission:** Moderator+
- **Options:** `target` (required), `reason` (optional)
- **Description:** Unmute a Discord user

### /apanel
- **Permission:** Admin / Supervisor
- **Description:** Post whitelist application panel

### /infract
- **Permission:** Management
- **Options:** `type` (required: termination/warning/notice/strike), `reason` (required), `user` (optional), `mcname` (optional)
- **Description:** Issue staff infraction

### /infractions
- **Permission:** Supervisor
- **Options:** `target` (optional), `mcname` (optional), `filter` (optional)
- **Description:** View staff infractions

### /revokeinfraction
- **Permission:** Management
- **Options:** `case` (required)
- **Description:** Revoke staff infraction

### /ban
- **Permission:** Staff
- **Options:** `player` (required), `reason` (required), `duration` (required), `platform` (optional)
- **Description:** Ban player from Minecraft server

### /unban
- **Permission:** Staff
- **Options:** `player` (required), `reason` (optional), `platform` (optional)
- **Description:** Unban player from Minecraft server

### /checkban
- **Permission:** Staff
- **Options:** `player` (required)
- **Description:** Check if player is banned

### /warn
- **Permission:** Staff
- **Options:** `reason` (required), `target` (optional), `mcname` (optional), `severity` (optional), `category` (optional)
- **Description:** Issue Discord warning

### /warnings
- **Permission:** Staff
- **Options:** `target` (optional), `mcname` (optional)
- **Description:** View Discord warnings

### /whitelist add
- **Permission:** Staff / Whitelist Guru
- **Options:** `platform` (required), `username` (required), `discord` (required)
- **Description:** Add player to whitelist

### /whitelist stats
- **Permission:** Owner
- **Description:** View weekly whitelist stats

### /linkaccount
- **Permission:** Everyone
- **Options:** `platform` (required), `username` (required)
- **Description:** Link Discord to Minecraft account

### /myaccounts
- **Permission:** Everyone
- **Description:** View your linked accounts

### /kingdom create
- **Permission:** Admin
- **Options:** `name` (required), `ruler` (required), `leader_ping` (required), `color` (required)
- **Description:** Create new kingdom

### /kingdom delete
- **Permission:** Admin
- **Options:** `kingdom` (required)
- **Description:** Delete kingdom

### /kingdom list
- **Permission:** Admin
- **Description:** List all kingdoms

### /kingdom sync
- **Permission:** Admin
- **Description:** Sync kingdom roles from database

### /note add
- **Permission:** Staff
- **Options:** `player` (required), `note` (required)
- **Description:** Add note to player

### /note list
- **Permission:** Staff
- **Options:** `player` (required)
- **Description:** List player notes

### /note delete
- **Permission:** Staff (author) / Admin
- **Options:** `id` (required)
- **Description:** Delete note

### /note search
- **Permission:** Staff
- **Options:** `query` (required)
- **Description:** Search notes by content

### /note recent
- **Permission:** Staff
- **Description:** View recent notes

### /playerlookup
- **Permission:** Moderator
- **Options:** `player` (required), `detailed` (optional)
- **Description:** Comprehensive player lookup

### /giveaway start
- **Permission:** Owner
- **Options:** `duration` (required), `prize` (required), `winners` (optional), `channel` (optional), `description` (optional), `required_role` (optional)
- **Description:** Start giveaway

### /giveaway end
- **Permission:** Owner
- **Options:** `message_id` (required)
- **Description:** End giveaway early

### /giveaway reroll
- **Permission:** Owner
- **Options:** `message_id` (required), `winners` (optional)
- **Description:** Reroll giveaway winners

### /giveaway list
- **Permission:** Owner
- **Description:** List active giveaways

### /giveaway delete
- **Permission:** Owner
- **Options:** `message_id` (required)
- **Description:** Delete giveaway

### /suggest
- **Permission:** Everyone
- **Options:** `suggestion` (required, max 1000 chars)
- **Description:** Submit server suggestion

### /reactionroles create
- **Permission:** Admin
- **Options:** `title` (required), `description` (required), `channel` (optional), `color` (optional)
- **Description:** Create reaction role message

### /reactionroles add
- **Permission:** Admin
- **Options:** `messageid` (required), `role` (required), `label` (required), `emoji` (optional)
- **Description:** Add role to reaction message

### /reactionroles remove
- **Permission:** Admin
- **Options:** `messageid` (required), `role` (required)
- **Description:** Remove role from reaction message

### /reactionroles list
- **Permission:** Admin
- **Description:** List reaction role messages

### /reactionroles delete
- **Permission:** Admin
- **Options:** `messageid` (required)
- **Description:** Delete reaction role setup

### /reactionroles refresh
- **Permission:** Admin
- **Options:** `messageid` (required)
- **Description:** Refresh reaction role buttons

### /emojirole add
- **Permission:** Admin
- **Options:** `message_id` (required), `emoji` (required), `role` (required)
- **Description:** Add emoji reaction role

### /emojirole remove
- **Permission:** Admin
- **Options:** `message_id` (required), `emoji` (required)
- **Description:** Remove emoji reaction role

### /emojirole list
- **Permission:** Admin
- **Description:** List emoji reaction roles

### /emojirole clear
- **Permission:** Admin
- **Options:** `message_id` (required)
- **Description:** Clear all reactions from message

### /loa start
- **Permission:** Staff
- **Options:** `duration` (required), `reason` (optional)
- **Description:** Start leave of absence

### /loa end
- **Permission:** Staff
- **Description:** End leave of absence early

### /loa view
- **Permission:** Everyone
- **Description:** View staff on LOA

### /guru stats
- **Permission:** Management
- **Description:** View current week guru stats

### /guru performance
- **Permission:** Management
- **Options:** `target` (optional), `mcname` (optional)
- **Description:** View specific guru performance

### /guru report
- **Permission:** Owner
- **Description:** Manually trigger weekly report

### /guru history
- **Permission:** Owner
- **Options:** `target` (optional), `mcname` (optional), `weeks` (optional)
- **Description:** View guru history

### /serverstats view
- **Permission:** Everyone
- **Description:** View server statistics

### /serverstats send
- **Permission:** Owner
- **Description:** Send stats DM to owner

### /weekstats current
- **Permission:** Staff
- **Description:** View current week stats

### /tempvc setup
- **Permission:** Admin
- **Options:** `hub` (required), `default_name` (optional), `default_limit` (optional), `category` (optional)
- **Description:** Set up temp VC hub

### /tempvc remove
- **Permission:** Admin
- **Options:** `hub` (required)
- **Description:** Remove temp VC hub

### /tempvc list
- **Permission:** Admin
- **Description:** List temp VC hubs

### /tempvc rename
- **Permission:** Channel Owner
- **Options:** `name` (required)
- **Description:** Rename your temp channel

### /tempvc limit
- **Permission:** Channel Owner
- **Options:** `number` (required)
- **Description:** Set user limit

### /tempvc lock
- **Permission:** Channel Owner
- **Description:** Lock temp channel

### /tempvc unlock
- **Permission:** Channel Owner
- **Description:** Unlock temp channel

### /tempvc hide
- **Permission:** Channel Owner
- **Description:** Hide temp channel

### /tempvc reveal
- **Permission:** Channel Owner
- **Description:** Reveal temp channel

### /tempvc kick
- **Permission:** Channel Owner
- **Options:** `user` (required)
- **Description:** Kick user from temp channel

### /tempvc ban
- **Permission:** Channel Owner
- **Options:** `user` (required)
- **Description:** Ban user from temp channel

### /tempvc unban
- **Permission:** Channel Owner
- **Options:** `user` (required)
- **Description:** Unban user from temp channel

### /tempvc transfer
- **Permission:** Channel Owner
- **Options:** `user` (required)
- **Description:** Transfer channel ownership

### /tempvc claim
- **Permission:** Everyone (if owner left)
- **Description:** Claim abandoned temp channel

### /stream toggle
- **Permission:** Moderator
- **Description:** Toggle streaming mode (removes in-game perms)

### /stream status
- **Permission:** Moderator
- **Description:** Check streaming mode status

### /rules quiz
- **Permission:** Staff
- **Options:** `user` (required)
- **Description:** Send rules quiz to user

---

## Prefix Commands

### !help [command]
- **Permission:** Everyone
- **Description:** Show available commands

### !ping
- **Permission:** Everyone
- **Description:** Check bot latency

### !m [role]
- **Permission:** Everyone
- **Description:** Show online members or members in role

### !history <player>
- **Permission:** Staff
- **Description:** Show player punishment history

### !lookup <case_id>
- **Permission:** Staff
- **Description:** Look up case by ID

### !stats
- **Permission:** Staff
- **Description:** Show database statistics

### !embed <rules|guru>
- **Permission:** Staff
- **Description:** Send preset embed

### !dm guru <@user>
- **Permission:** Staff
- **Description:** DM guru guide to user

### !rules quiz <@user>
- **Permission:** Staff
- **Description:** Send rules quiz

### !linked <@user|userId|mcname>
- **Permission:** Staff
- **Description:** View linked accounts

### !mute <user> [duration] [reason]
- **Permission:** Moderator
- **Description:** Timeout member

### !unmute <user>
- **Permission:** Moderator
- **Description:** Remove timeout

### !case <id>
- **Permission:** Moderator
- **Description:** Look up case

### !pardon <case_id>
- **Permission:** Moderator (warnings) / Admin (bans)
- **Description:** Pardon case

### !ban <user> <reason>
- **Permission:** Admin
- **Description:** Ban Discord member

### !unban <userId>
- **Permission:** Admin
- **Description:** Unban user

### !kick <user> <reason>
- **Permission:** Admin
- **Description:** Kick Discord member

### !lock
- **Permission:** Admin
- **Description:** Lock channel

### !unlock
- **Permission:** Admin
- **Description:** Unlock channel

### !unlink <@user|userId> <mcname|all>
- **Permission:** Admin
- **Description:** Unlink Minecraft account

### !cleanup [--dry-run]
- **Permission:** Owner
- **Description:** Unlink and unwhitelist all accounts for users no longer in Discord. Use --dry-run to preview without making changes.

### !forcelink <@user|userId> <java|bedrock> <mcname>
- **Permission:** Admin
- **Description:** Force link account

### !postverify [channel]
- **Permission:** Admin
- **Description:** Post verification embed

### !memberupdate
- **Permission:** Admin
- **Description:** Update member counter

### !testrcon
- **Permission:** Admin
- **Description:** Test RCON connection

### !kingdom
- **Permission:** Everyone
- **Description:** Show kingdom help

### !kingdom add <@user>
- **Permission:** Kingdom Ruler
- **Description:** Add user to kingdom

### !kingdom remove <@user>
- **Permission:** Kingdom Ruler
- **Description:** Remove user from kingdom

### !kingdom list [kingdom]
- **Permission:** Everyone
- **Description:** List kingdoms or members

### !kingdom transfer <@user>
- **Permission:** Kingdom Ruler
- **Description:** Transfer leadership

### !page <@user|userId> <reason>
- **Permission:** Supervisor
- **Description:** Page user (10 pings)

### !welcometest
- **Permission:** Owner
- **Description:** Test welcome DM

### !update
- **Permission:** Owner
- **Description:** Pull git and restart

### !remove <case_id>
- **Permission:** Owner
- **Description:** Permanently delete record

### !addkingdoms
- **Permission:** Owner
- **Description:** Add preset kingdoms

### !temp2
- **Permission:** Owner
- **Description:** Add member role to all users

### !test1
- **Permission:** Owner
- **Description:** Deny view to unverified role

---

## Button/Interaction Features

| Feature | Trigger | Description |
|---------|---------|-------------|
| Whitelist Application | `/apanel` button | Apply for whitelist |
| Ticket Creation | `/panel` buttons | Create General/Report/Management tickets |
| Apply Ticket | Button in whitelist app | Create whitelist application ticket |
| Verification | `/postverify` button | Give member role |
| Giveaway Entry | Giveaway embed button | Enter/leave giveaway |
| Suggestion Voting | `/suggest` embed buttons | Upvote/downvote suggestions |
| Reaction Roles | `/reactionroles` buttons | Toggle roles |
| Emoji Reaction Roles | Message reactions | Toggle roles via emoji |
| Temp VC Controls | Temp channel buttons | Lock/Unlock/Hide/Reveal |

---

## Automated Features

| Feature | Trigger | Description |
|---------|---------|-------------|
| Welcome DM | Member join | Send welcome embed via DM |
| Member Milestone | 1000+ members, every 250 | Announce in channel |
| Daily Stats | Midnight UTC | DM stats to owner |
| Weekly Whitelist Stats | Sunday midnight UTC | DM whitelist report to owner |
| LOA Auto-End | LOA duration expires | Remove LOA role |
| Giveaway Auto-End | Giveaway duration expires | Select winners |
| Temp VC Cleanup | Channel empty | Delete temp channel |
| Discord Logger | Various events | Log to log channel |

---

## Channel IDs

| Purpose | Channel ID |
|---------|------------|
| Discord Logs | 1442649468586561616 |
| Whitelist Logs | 1442648914204295168 |
| Milestone Announcements | 1437537451110567936 |
| Suggestions | 1459777467551191110 |

---

## Role IDs

| Purpose | Role ID |
|---------|---------|
| LOA Role | 1459778232206360681 |
