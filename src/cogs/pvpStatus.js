/**
 * PvP Status Logging
 * Handles logging PvP events from the Velocity plugin to Discord
 * Logs: status changes, kills, invalid PvP attempts, deaths
 */

const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const PvpLog = require('../database/models/PvpLog');
const { isStaff } = require('../utils/permissions');

const PVP_LOG_CHANNEL_ID = '1439438975151505419';

/**
 * Initialize PvP logging listener
 */
function initPvpLogger(client) {
    console.log('[PvP Logger] Initializing PvP event logger...');
    
    client.on('pvpLog', async (logData) => {
        try {
            await handlePvpLog(client, logData);
        } catch (error) {
            console.error('[PvP Logger] Error handling PvP log:', error);
        }
    });
    
    console.log('[PvP Logger] PvP event logger initialized');
}

/**
 * Handle incoming PvP log event
 */
async function handlePvpLog(client, logData) {
    const channel = client.channels.cache.get(PVP_LOG_CHANNEL_ID);
    
    if (!channel) {
        console.error('[PvP Logger] Log channel not found:', PVP_LOG_CHANNEL_ID);
        return;
    }
    
    let embed;
    
    switch (logData.type) {
        case 'status_change':
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
        default:
            console.warn('[PvP Logger] Unknown log type:', logData.type);
            return;
    }
    
    if (embed) {
        const message = await channel.send({ embeds: [embed] });
        
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
        .setColor(data.enabled ? 0x10b981 : 0x6b7280)
        .setTitle(data.enabled ? '🟩 PvP Enabled' : '⬜ PvP Disabled')
        .addFields(
            { name: 'Player', value: `\`${data.username}\``, inline: true },
            { name: 'UUID', value: `\`${data.uuid}\``, inline: false }
        )
        .setTimestamp(new Date(data.timestamp))
        .setFooter({ text: 'NewLife PvP' });
    
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
    
    // Grey if both have PvP on (consensual), Red if one or both have PvP off
    const embedColor = consensual ? 0x6b7280 : 0xef4444;
    
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle('╔═══════════════════════════════════════╗')
        .setDescription(
            `**║        ⚔️ PVP KILL LOGGED            ║**\n` +
            `**╠═══════════════════════════════════════╣**\n` +
            `**║** Killer: **${data.killer.username}** ${data.killer.pvp_enabled ? '🟩' : '⬜'}                      **║**\n` +
            `**║** Victim: **${data.victim.username}** ${data.victim.pvp_enabled ? '🟩' : '⬜'}                       **║**\n` +
            `**║** Both Consented: ${consensual ? '✅ YES' : '❌ NO'}                **║**\n` +
            `**║** Killer Recording: ${killerRecording ? '🔴 YES' : killerStreaming ? '🟪 STREAMING' : '⬜ NO'}              **║**\n` +
            `**║** Victim Recording: ${victimRecording ? '🔴 YES' : victimStreaming ? '🟪 STREAMING' : '⬜ NO'}               **║**\n` +
            `**╚═══════════════════════════════════════╝**`
        )
        .addFields(
            { name: 'Killer UUID', value: `\`${data.killer.uuid}\``, inline: false },
            { name: 'Victim UUID', value: `\`${data.victim.uuid}\``, inline: false }
        )
        .setTimestamp(new Date(data.timestamp))
        .setFooter({ text: 'NewLife PvP' });
    
    return embed;
}

/**
 * Create embed for invalid PvP attempt
 */
function createInvalidPvpEmbed(data) {
    const embed = new EmbedBuilder()
        .setColor(0xfbbf24)
        .setTitle('╔═══════════════════════════════════════╗')
        .setDescription(
            `**║     ⚠️ INVALID PVP DETECTED          ║**\n` +
            `**╠═══════════════════════════════════════╣**\n` +
            `**║** Attacker: **${data.attacker.username}** ${data.attacker.pvp_enabled ? '🟩' : '⬜'}                **║**\n` +
            `**║** Victim: **${data.victim.username}** ${data.victim.pvp_enabled ? '🟩' : '⬜'}                   **║**\n` +
            `**║** Damage Dealt: **${data.damage.toFixed(2)} HP**               **║**\n` +
            `**║** Consensual: ❌ NO                     **║**\n` +
            `**║** Action: Damage allowed                **║**\n` +
            `**╚═══════════════════════════════════════╝**`
        )
        .addFields(
            { name: 'Attacker UUID', value: `\`${data.attacker.uuid}\``, inline: false },
            { name: 'Victim UUID', value: `\`${data.victim.uuid}\``, inline: false }
        )
        .setTimestamp(new Date(data.timestamp))
        .setFooter({ text: 'NewLife PvP' });
    
    return embed;
}

/**
 * Create embed for player death (non-PvP)
 */
function createDeathEmbed(data) {
    const embed = new EmbedBuilder()
        .setColor(0x6b7280)
        .setTitle('💀 Player Death')
        .addFields(
            { name: 'Player', value: `\`${data.username}\``, inline: true },
            { name: 'Cause', value: data.cause || 'Unknown', inline: true },
            { name: 'UUID', value: `\`${data.uuid}\``, inline: false }
        )
        .setTimestamp(new Date(data.timestamp))
        .setFooter({ text: 'NewLife PvP' });
    
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
                    .setTitle(`📊 Recent PvP Events (${logs.length})`)
                    .setColor(0x3b82f6)
                    .setDescription(logs.map(log => {
                        const time = `<t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:R>`;
                        switch (log.type) {
                            case 'status_change':
                                return `${time} - 🔄 **Status Change** - ${log.username}`;
                            case 'pvp_kill':
                                return `${time} - ⚔️ **Kill** - ${log.killer?.username} → ${log.victim?.username}`;
                            case 'invalid_pvp':
                                return `${time} - ⚠️ **Invalid PvP** - ${log.attacker?.username} → ${log.victim?.username}`;
                            case 'death':
                                return `${time} - 💀 **Death** - ${log.username}`;
                            default:
                                return `${time} - ❓ Unknown event`;
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
                    .setTitle(`📊 PvP Events for ${username} (${logs.length})`)
                    .setColor(0x3b82f6)
                    .setDescription(logs.map(log => {
                        const time = `<t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:R>`;
                        switch (log.type) {
                            case 'status_change':
                                return `${time} - 🔄 **Status Change**`;
                            case 'pvp_kill':
                                const isKiller = log.killer?.username?.toLowerCase() === username.toLowerCase();
                                return `${time} - ⚔️ **${isKiller ? 'Killed' : 'Killed by'}** ${isKiller ? log.victim?.username : log.killer?.username}`;
                            case 'invalid_pvp':
                                const isAttacker = log.attacker?.username?.toLowerCase() === username.toLowerCase();
                                return `${time} - ⚠️ **${isAttacker ? 'Attacked' : 'Attacked by'}** ${isAttacker ? log.victim?.username : log.attacker?.username}`;
                            case 'death':
                                return `${time} - 💀 **Death** - ${log.cause || 'Unknown'}`;
                            default:
                                return `${time} - ❓ Unknown event`;
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
                    .setTitle(`📊 PvP Statistics for ${username}`)
                    .setColor(0x10b981)
                    .addFields(
                        { name: '⚔️ PvP Kills', value: kills.toString(), inline: true },
                        { name: '💀 PvP Deaths', value: deaths.toString(), inline: true },
                        { name: '📈 K/D Ratio', value: deaths > 0 ? (kills / deaths).toFixed(2) : kills.toString(), inline: true },
                        { name: '⚠️ Invalid PvP Attacks', value: invalidAttacks.toString(), inline: true },
                        { name: '☠️ Total Deaths', value: totalDeaths.toString(), inline: true },
                        { name: '📊 Total Events', value: (kills + deaths + invalidAttacks + totalDeaths).toString(), inline: true }
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
