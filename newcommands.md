# NewLife Bot Commands

## Analytics
/alts check <player>
/alts pending
/alts resolve <id> <action>
/alts history <player>
/tps [server] [hours]
/chunks problem [server]
/chunks info <x> <z> [world] [server]
/lag alerts [server]
/lag resolve <id>
/lag player <player>

## Applications
/apanel
!from [days]

## Custom Roles
/customrole create <name> [color] [emoji]
/customrole edit [name] [color] [emoji]
/customrole delete
/customrole view
/customrole pending

## Emoji Reaction Roles
/emojirole add <messageid> <emoji> <role> [channel]
/emojirole remove <messageid> <emoji>
/emojirole list
/emojirole clear <messageid>

## General
/help
/history <player>
/lookup <case_id>
/stats
/ping
/staffreport
/version
!help [command]
!history <player>
!lookup <case_id>
!stats
!ping
!nlp <@user>
!pull
!test1
!remove <case_id>
!temp2
!memberupdate
!addkingdoms
!m [role]

## Giveaways
/giveaway start <duration> <prize> [winners] [channel] [description] [required_role]
/giveaway end <message_id>
/giveaway reroll <message_id> [winners]
/giveaway list
/giveaway delete <message_id>

## Guru Tracking
/guru stats
/guru performance [user] [mcname]
/guru report
/guru history [user] [mcname] [weeks]

## Infractions
/infract <type> <reason> [user] [mcname]
/infractions [user] [mcname] [type]
/revokeinfraction <case>

## Kingdoms
/kingdom create <name> <ruler> [leader_ping] [color]
/kingdom delete <name>
/kingdom list
/kingdom sync
!kingdom <help|add|remove|list|transfer>

## Linking
/linkaccount <platform> <username>
/myaccounts
!linked [@user|userId|minecraftName]
!unlink <@user|userId> <minecraft_username|all>
!forcelink <@user|userId> <platform> <minecraft_username>
!cleanup [--dry-run]
!update <@user [@user2...]|all>
!nick <@user [@user2...]|all>

## LOA
/loa start <duration> <reason>
/loa end
/loa view

## Moderation
!ban <user> <reason>
!unban <userId|username#discriminator>
!kick <user> <reason>
!mute <user> [duration] [reason]
!unmute <user>
!case <id>
!pardon <case_id>
!lookup <user>
!lock
!unlock
!purge <number> [@user]
!role <@user> <role>
!rcon

## Notes
/note add <player> <content>
/note list <player>
/note delete <id>
/note search <query>
/note recent

## Player Lookup
/playerlookup <player> [detailed]
!linked <@user|discordId|minecraft>
!link <@user|discordId> <java|bedrock> <minecraftUsername>

## Preset Embeds
!embed <rules|guru>
!dm <guru> <@user>

## PvP Status
/pvplogs recent [count]
/pvplogs player <username> [count]
/pvplogs stats <username>

## Reaction Roles
/reactionroles create <channel> <title> [description] [color]
/reactionroles add <messageid> <role> <emoji>
/reactionroles remove <messageid> <role>
/reactionroles list
/reactionroles delete <messageid>

## Rules
/rules quiz <user>
!rules quiz <@user>

## Server Bans
/ban <target> <reason> [duration] [platform]
/unban <target> [reason] [platform]
/checkban <target>
/banhistory <target>
/kick <target> <reason> [platform]
/warn <reason> [target] [mcname] [severity] [category]
/mute <duration> <reason> [target] [mcname]
/unmute <target> [reason]
/setupmute
/warnings [target] [mcname] [include_removed]
/removewarn <case> [reason]

## Server Restart
/restart now [reason]
/restart schedule <minutes> [reason]
/restart cancel
/restart status

## Server Stats
/serverstats view
/serverstats send

## Streaming
/stream toggle
/stream status

## Suggestions
/suggest <suggestion>

## Temp VC
/tempvc setup <hub> [category] [default_name] [default_limit]
/tempvc remove <hub>
/tempvc list
/tempvc rename <name>
/tempvc limit <users>
/tempvc lock
/tempvc unlock
/tempvc hide
/tempvc reveal
/tempvc kick <user>
/tempvc ban <user>
/tempvc unban <user>
/tempvc transfer <user>
/tempvc claim

## Tickets
/panel
/close [reason]
/tclose set <time> [reason]
/tclose cancel
/escalate <level>
/add <user>
/remove <user>

## Verification
!postverify [channel]

## Weekly Stats
/weekstats current
/weekstats send
/weekstats history [weeks]

## Welcome
!welcometest

## Whitelist
/whitelist add <platform> <mcname> <discord>
/whitelist stats
/unwhitelist <discord>
