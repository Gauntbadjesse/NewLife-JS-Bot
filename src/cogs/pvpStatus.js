/**
 * PvP Status Logging
 * Handles logging PvP events from the Velocity plugin to Discord
 * Logs: status changes, kills, invalid PvP attempts, deaths
 */

const { EmbedBuilder } = require('discord.js');
const PvpLog = require('../database/models/PvpLog');

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
    
    const embed = new EmbedBuilder()
        .setColor(consensual ? 0x10b981 : 0xef4444)
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

module.exports = {
    initPvpLogger
};
