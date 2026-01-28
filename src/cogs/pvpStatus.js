/**
 * PvP Status Logging
 * Handles logging PvP events from the Velocity plugin to Discord
 * Logs: status changes, kills, invalid PvP attempts, deaths
 */

const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const PvpLog = require('../database/models/PvpLog');
const { isStaff } = require('../utils/permissions');

// Channel for good stuff (status changes, consensual kills)
const PVP_GOOD_CHANNEL_ID = '1442649468586561616';
// Channel for alerts/investigations (damage sessions, combat logs, invalid pvp, non-consensual kills)
const PVP_ALERT_CHANNEL_ID = '1439438975151505419';

/**
 * Initialize PvP logging listener
 */
function initPvpLogger(client) {
    console.log('[PvP Logger] Initializing PvP event logger...');
    console.log(`[PvP Logger] Good channel: ${PVP_GOOD_CHANNEL_ID}`);
    console.log(`[PvP Logger] Alert channel: ${PVP_ALERT_CHANNEL_ID}`);
    
    client.on('pvpLog', async (logData) => {
        console.log('[PvP Logger] Received pvpLog event:', JSON.stringify(logData, null, 2));
        try {
            await handlePvpLog(client, logData);
        } catch (error) {
            console.error('[PvP Logger] Error handling PvP log:', error);
        }
    });
    
    console.log('[PvP Logger] PvP event logger initialized');
}

/**
 * Determine which channel to use based on log type
 */
function getChannelForLogType(logData) {
    switch (logData.type) {
        case 'status_change':
            // Status changes go to good channel
            return PVP_GOOD_CHANNEL_ID;
        case 'pvp_kill':
            // Consensual kills go to good channel, non-consensual to alert channel
            return logData.consensual ? PVP_GOOD_CHANNEL_ID : PVP_ALERT_CHANNEL_ID;
        case 'invalid_pvp':
        case 'pvp_damage_session':
        case 'combat_log':
            // All alerts/issues go to alert channel
            return PVP_ALERT_CHANNEL_ID;
        case 'death':
            // Regular deaths go to good channel
            return PVP_GOOD_CHANNEL_ID;
        default:
            return PVP_ALERT_CHANNEL_ID;
    }
}

/**
 * Handle incoming PvP log event
 */
async function handlePvpLog(client, logData) {
    console.log('[PvP Logger] Processing log type:', logData.type);
    
    const channelId = getChannelForLogType(logData);
    const channel = client.channels.cache.get(channelId);
    
    if (!channel) {
        console.error('[PvP Logger] Log channel not found:', channelId);
        console.log('[PvP Logger] Available channels:', client.channels.cache.map(c => c.id).join(', ').substring(0, 200) + '...');
        return;
    }
    
    console.log('[PvP Logger] Using channel:', channel.name, channelId);
    
    let embed;
    
    switch (logData.type) {
        case 'status_change':
            console.log('[PvP Logger] Creating status_change embed for:', logData.username, 'enabled:', logData.enabled);
            embed = createStatusChangeEmbed(logData);
            break;
        case 'pvp_kill':
            embed = createPvpKillEmbed(logData);
            break;
        case 'invalid_pvp':
            embed = createInvalidPvpEmbed(logData);
            break;
        case 'death':
            embed = createDeathEmbed(logData);
            break;
        case 'pvp_damage_session':
            embed = createDamageSessionEmbed(logData);
            break;
        case 'combat_log':
            embed = createCombatLogEmbed(logData);
            break;
        default:
            console.warn('[PvP Logger] Unknown log type:', logData.type);
            return;
    }
    
    if (embed) {
        console.log('[PvP Logger] Sending embed to channel...');
        const message = await channel.send({ embeds: [embed] });
        console.log('[PvP Logger] Message sent:', message.id);
        
        // Update database with message ID
        await PvpLog.findByIdAndUpdate(logData._id, {
            messageId: message.id,
            channelId: channel.id
        });
    }
}

/**
 * Create embed for PvP status change
 */
function createStatusChangeEmbed(data) {
    const embed = new EmbedBuilder()
        .setColor(data.enabled ? 0x10b981 : 0x2B2D31)
        .setAuthor({ name: 'PvP Status Change' })
        .setDescription(data.enabled 
            ? `**${data.username}** has **enabled** PvP` 
            : `**${data.username}** has **disabled** PvP`)
        .addFields(
            { name: 'Player', value: `\`${data.username}\``, inline: true },
            { name: 'Status', value: data.enabled ? '\`PvP ON\`' : '\`PvP OFF\`', inline: true },
            { name: 'UUID', value: `\`${data.uuid}\``, inline: false }
        )
        .setTimestamp(new Date(data.timestamp))
        .setFooter({ text: 'NewLife SMP | PvP System' });
    
    return embed;
}

/**
 * Create embed for PvP kill
 */
function createPvpKillEmbed(data) {
    const consensual = data.consensual;
    const killerRecording = data.killer.status === 'recording';
    const killerStreaming = data.killer.status === 'streaming';
    const victimRecording = data.victim.status === 'recording';
    const victimStreaming = data.victim.status === 'streaming';
    
    // Green if consensual, Red if non-consensual
    const embedColor = consensual ? 0x10b981 : 0xef4444;
    
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({ name: 'PvP Kill Logged' })
        .setDescription(`**${data.killer.username}** killed **${data.victim.username}**`)
        .addFields(
            { 
                name: 'Killer', 
                value: `**${data.killer.username}**\n${data.killer.pvp_enabled ? 'PvP On' : 'PvP Off'}${killerRecording ? ' | Recording' : killerStreaming ? ' | Streaming' : ''}`, 
                inline: true 
            },
            { 
                name: 'Victim', 
                value: `**${data.victim.username}**\n${data.victim.pvp_enabled ? 'PvP On' : 'PvP Off'}${victimRecording ? ' | Recording' : victimStreaming ? ' | Streaming' : ''}`, 
                inline: true 
            },
            { 
                name: 'Consensual', 
                value: consensual ? 'Yes' : 'No', 
                inline: true 
            },
            { name: 'Killer UUID', value: `\`${data.killer.uuid}\``, inline: false },
            { name: 'Victim UUID', value: `\`${data.victim.uuid}\``, inline: false }
        )
        .setTimestamp(new Date(data.timestamp))
        .setFooter({ text: 'NewLife SMP | PvP System' });
    
    return embed;
}

/**
 * Create embed for invalid PvP attempt
 */
function createInvalidPvpEmbed(data) {
    const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setAuthor({ name: 'Invalid PvP Detected' })
        .setDescription(`**${data.attacker.username}** attacked **${data.victim.username}** without mutual consent`)
        .addFields(
            { 
                name: 'Attacker', 
                value: `**${data.attacker.username}**\n${data.attacker.pvp_enabled ? 'PvP On' : 'PvP Off'}`, 
                inline: true 
            },
            { 
                name: 'Victim', 
                value: `**${data.victim.username}**\n${data.victim.pvp_enabled ? 'PvP On' : 'PvP Off'}`, 
                inline: true 
            },
            { 
                name: 'Damage Dealt', 
                value: `\`${data.damage.toFixed(2)} HP\``, 
                inline: true 
            },
            { name: 'Attacker UUID', value: `\`${data.attacker.uuid}\``, inline: false },
            { name: 'Victim UUID', value: `\`${data.victim.uuid}\``, inline: false }
        )
        .setTimestamp(new Date(data.timestamp))
        .setFooter({ text: 'NewLife SMP | PvP System' });
    
    return embed;
}

/**
 * Create embed for player death (non-PvP)
 */
function createDeathEmbed(data) {
    const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setAuthor({ name: 'Player Death' })
        .setDescription(`**${data.username}** died`)
        .addFields(
            { name: 'Player', value: `\`${data.username}\``, inline: true },
            { name: 'Cause', value: data.cause || 'Unknown', inline: true },
            { name: 'UUID', value: `\`${data.uuid}\``, inline: false }
        )
        .setTimestamp(new Date(data.timestamp))
        .setFooter({ text: 'NewLife SMP | PvP System' });
    
    return embed;
}

/**
 * Create embed for damage session
 */
function createDamageSessionEmbed(data) {
    const { player1, player2, total_hits, total_damage, duration_ms } = data;
    
    const bothPvpEnabled = player1.pvp_enabled && player2.pvp_enabled;
    const embedColor = bothPvpEnabled ? 0x2B2D31 : 0xef4444;
    
    const durationSeconds = (duration_ms / 1000).toFixed(1);
    
    // Determine who initiated (first attacker)
    const initiator = player1.hits_dealt > 0 ? player1 : player2;
    
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({ name: 'PvP Damage Session' })
        .setDescription(`Combat between **${player1.username}** and **${player2.username}**`)
        .addFields(
            { 
                name: player1.username, 
                value: `${player1.pvp_enabled ? 'PvP On' : 'PvP Off'}\n**${player1.damage_dealt.toFixed(1)} HP** dealt\n**${player1.hits_dealt}** hits`, 
                inline: true 
            },
            { 
                name: 'vs', 
                value: '-', 
                inline: true 
            },
            { 
                name: player2.username, 
                value: `${player2.pvp_enabled ? 'PvP On' : 'PvP Off'}\n**${player2.damage_dealt.toFixed(1)} HP** dealt\n**${player2.hits_dealt}** hits`, 
                inline: true 
            },
            { 
                name: 'Session Stats', 
                value: `**Total Damage:** ${total_damage.toFixed(1)} HP\n**Total Hits:** ${total_hits}\n**Duration:** ${durationSeconds}s\n**Consensual:** ${bothPvpEnabled ? 'Yes' : 'No'}`, 
                inline: false 
            },
            { name: `${player1.username} UUID`, value: `\`${player1.uuid}\``, inline: false },
            { name: `${player2.username} UUID`, value: `\`${player2.uuid}\``, inline: false }
        )
        .setTimestamp(new Date(data.timestamp))
        .setFooter({ text: `NewLife SMP | ${total_hits} hits in ${durationSeconds}s` });
    
    return embed;
}

/**
 * Create embed for combat log
 */
function createCombatLogEmbed(data) {
    const { player, location } = data;
    
    const embed = new EmbedBuilder()
        .setColor(0xdc2626)
        .setAuthor({ name: 'Combat Log Detected' })
        .setDescription(`**${player.username}** logged out during combat with PvP enabled`)
        .addFields(
            { 
                name: 'Player', 
                value: `**${player.username}**\nPvP was enabled`, 
                inline: true 
            },
            { 
                name: 'Action Taken', 
                value: `Player killed\nItems dropped`, 
                inline: true 
            },
            { 
                name: 'Location', 
                value: `**World:** ${location.world}\n**Coords:** ${location.x.toFixed(0)}, ${location.y.toFixed(0)}, ${location.z.toFixed(0)}`, 
                inline: true 
            },
            { name: 'Player UUID', value: `\`${player.uuid}\``, inline: false },
            { 
                name: 'Notification', 
                value: 'Player has been notified via Discord DM about the combat log penalty.', 
                inline: false 
            }
        )
        .setTimestamp(new Date(data.timestamp))
        .setFooter({ text: 'NewLife SMP | Combat Logging Prevention' });
    
    return embed;
}

/**
 * Slash commands for PvP logs
 */
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('pvplogs')
            .setDescription('View PvP event logs')
            .addSubcommand(sub => sub
                .setName('recent')
                .setDescription('View recent PvP events')
                .addIntegerOption(opt => opt
                    .setName('count')
                    .setDescription('Number of events to show (default 10, max 25)')
                    .setRequired(false)
                )
            )
            .addSubcommand(sub => sub
                .setName('player')
                .setDescription('View PvP events for a specific player')
                .addStringOption(opt => opt
                    .setName('username')
                    .setDescription('Minecraft username')
                    .setRequired(true)
                )
                .addIntegerOption(opt => opt
                    .setName('count')
                    .setDescription('Number of events to show (default 10, max 25)')
                    .setRequired(false)
                )
            )
            .addSubcommand(sub => sub
                .setName('stats')
                .setDescription('View PvP statistics for a player')
                .addStringOption(opt => opt
                    .setName('username')
                    .setDescription('Minecraft username')
                    .setRequired(true)
                )
            ),
        
        async execute(interaction, client) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ 
                    content: 'You do not have permission to use this command.', 
                    flags: 64
                });
            }

            await interaction.deferReply();

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'recent') {
                const count = Math.min(interaction.options.getInteger('count') || 10, 25);
                const logs = await PvpLog.find({}).sort({ timestamp: -1 }).limit(count);

                if (logs.length === 0) {
                    return interaction.editReply('No PvP events found.');
                }

                const embed = new EmbedBuilder()
                    .setTitle(`Recent PvP Events (${logs.length})`)
                    .setColor(0x3b82f6)
                    .setDescription(logs.map(log => {
                        const time = `<t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:R>`;
                        switch (log.type) {
                            case 'status_change':
                                return `${time} - **Status Change** - ${log.username}`;
                            case 'pvp_kill':
                                return `${time} - **Kill** - ${log.killer?.username} > ${log.victim?.username}`;
                            case 'invalid_pvp':
                                return `${time} - **Invalid PvP** - ${log.attacker?.username} > ${log.victim?.username}`;
                            case 'death':
                                return `${time} - **Death** - ${log.username}`;
                            default:
                                return `${time} - Unknown event`;
                        }
                    }).join('\n'))
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (subcommand === 'player') {
                const username = interaction.options.getString('username');
                const count = Math.min(interaction.options.getInteger('count') || 10, 25);

                const logs = await PvpLog.find({
                    $or: [
                        { username: { $regex: new RegExp(username, 'i') } },
                        { 'killer.username': { $regex: new RegExp(username, 'i') } },
                        { 'victim.username': { $regex: new RegExp(username, 'i') } },
                        { 'attacker.username': { $regex: new RegExp(username, 'i') } }
                    ]
                }).sort({ timestamp: -1 }).limit(count);

                if (logs.length === 0) {
                    return interaction.editReply(`No PvP events found for **${username}**.`);
                }

                const embed = new EmbedBuilder()
                    .setTitle(`PvP Events for ${username} (${logs.length})`)
                    .setColor(0x3b82f6)
                    .setDescription(logs.map(log => {
                        const time = `<t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:R>`;
                        switch (log.type) {
                            case 'status_change':
                                return `${time} - **Status Change**`;
                            case 'pvp_kill':
                                const isKiller = log.killer?.username?.toLowerCase() === username.toLowerCase();
                                return `${time} - **${isKiller ? 'Killed' : 'Killed by'}** ${isKiller ? log.victim?.username : log.killer?.username}`;
                            case 'invalid_pvp':
                                const isAttacker = log.attacker?.username?.toLowerCase() === username.toLowerCase();
                                return `${time} - **${isAttacker ? 'Attacked' : 'Attacked by'}** ${isAttacker ? log.victim?.username : log.attacker?.username}`;
                            case 'death':
                                return `${time} - **Death** - ${log.cause || 'Unknown'}`;
                            default:
                                return `${time} - Unknown event`;
                        }
                    }).join('\n'))
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (subcommand === 'stats') {
                const username = interaction.options.getString('username');

                const kills = await PvpLog.countDocuments({
                    type: 'pvp_kill',
                    'killer.username': { $regex: new RegExp(username, 'i') }
                });

                const deaths = await PvpLog.countDocuments({
                    type: 'pvp_kill',
                    'victim.username': { $regex: new RegExp(username, 'i') }
                });

                const invalidAttacks = await PvpLog.countDocuments({
                    type: 'invalid_pvp',
                    'attacker.username': { $regex: new RegExp(username, 'i') }
                });

                const totalDeaths = await PvpLog.countDocuments({
                    type: 'death',
                    username: { $regex: new RegExp(username, 'i') }
                });

                const embed = new EmbedBuilder()
                    .setTitle(`PvP Statistics for ${username}`)
                    .setColor(0x10b981)
                    .addFields(
                        { name: 'PvP Kills', value: kills.toString(), inline: true },
                        { name: 'PvP Deaths', value: deaths.toString(), inline: true },
                        { name: 'K/D Ratio', value: deaths > 0 ? (kills / deaths).toFixed(2) : kills.toString(), inline: true },
                        { name: 'Invalid PvP Attacks', value: invalidAttacks.toString(), inline: true },
                        { name: 'Total Deaths', value: totalDeaths.toString(), inline: true },
                        { name: 'Total Events', value: (kills + deaths + invalidAttacks + totalDeaths).toString(), inline: true }
                    )
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }
        }
    }
];

module.exports = {
    name: 'PvPStatus',
    description: 'PvP status logging and management',
    slashCommands,
    initPvpLogger
};
