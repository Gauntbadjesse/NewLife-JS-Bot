/**
 * Analytics Cog
 * Server analytics, ALT detection, and lag monitoring
 * 
 * Commands:
 * - /alts check, pending, resolve, history - ALT detection (Staff+)
 * - /tps, /chunks, /entities - Server analytics (Staff+)
 * - /lag alerts, resolve, player, scan - Lag detection (Staff+)
 * - /analytics player, online, peak - Player analytics (Staff+)
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');

// Models
const PlayerConnection = require('../database/models/PlayerConnection');
const AltGroup = require('../database/models/AltGroup');
const PlayerAnalytics = require('../database/models/PlayerAnalytics');
const ServerTps = require('../database/models/ServerTps');
const ChunkAnalytics = require('../database/models/ChunkAnalytics');
const LagAlert = require('../database/models/LagAlert');
const PlayerImpact = require('../database/models/PlayerImpact');

const { isStaff, isAdmin, isSupervisor } = require('../utils/permissions');
const { createErrorEmbed, createSuccessEmbed, getEmbedColor } = require('../utils/embeds');

// Alert channels (from env)
const LAG_ALERTS_CHANNEL_ID = process.env.LAG_ALERTS_CHANNEL_ID || '1439438975151505419';
const ALT_ALERTS_CHANNEL_ID = process.env.ALT_ALERTS_CHANNEL_ID || '1439438975151505419';

// Role IDs for pinging
const SUPERVISOR_ROLE_ID = process.env.SUPERVISOR_ROLE_ID;
const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID;

// Alert cooldowns (3 seconds as requested)
const alertCooldowns = new Map();
const ALERT_COOLDOWN_MS = 3000;

/**
 * Hash an IP address for privacy
 */
function hashIp(ip) {
    return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'newlife')).digest('hex').substring(0, 16);
}

/**
 * Check if we can send an alert (cooldown check)
 */
function canSendAlert(alertType) {
    const lastAlert = alertCooldowns.get(alertType);
    if (!lastAlert) return true;
    return Date.now() - lastAlert >= ALERT_COOLDOWN_MS;
}

/**
 * Mark alert as sent
 */
function markAlertSent(alertType) {
    alertCooldowns.set(alertType, Date.now());
}

/**
 * Get ping string for supervisor/management
 */
function getAlertPing() {
    const pings = [];
    if (SUPERVISOR_ROLE_ID) pings.push(`<@&${SUPERVISOR_ROLE_ID}>`);
    if (MANAGEMENT_ROLE_ID) pings.push(`<@&${MANAGEMENT_ROLE_ID}>`);
    return pings.join(' ');
}

/**
 * Initialize analytics system
 */
function initAnalytics(client) {
    console.log('[Analytics] Initializing analytics system...');
    
    // Listen for analytics events from plugins
    client.on('analyticsEvent', async (data) => {
        try {
            await handleAnalyticsEvent(client, data);
        } catch (error) {
            console.error('[Analytics] Error handling event:', error);
        }
    });
    
    console.log('[Analytics] Analytics system initialized');
}

/**
 * Handle incoming analytics events
 */
async function handleAnalyticsEvent(client, data) {
    switch (data.type) {
        case 'connection':
            await handleConnection(client, data);
            break;
        case 'alt_detected':
            await handleAltDetected(client, data);
            break;
        case 'tps_update':
        case 'tps_critical': // Legacy support
            await handleTpsUpdate(client, data);
            break;
        case 'chunk_scan':
        case 'problem_chunks': // Legacy support
            await handleChunkScan(client, data);
            break;
        case 'lag_alert':
            await handleLagAlert(client, data);
            break;
        case 'player_impact':
            await handlePlayerImpact(client, data);
            break;
    }
}

/**
 * Handle ALT detection event (from API)
 */
async function handleAltDetected(client, data) {
    const { altGroup, newPlayer, linkedAccounts } = data;
    
    if (!canSendAlert(`alt_${newPlayer.uuid}`)) return;
    markAlertSent(`alt_${newPlayer.uuid}`);
    
    const channel = client.channels.cache.get(ALT_ALERTS_CHANNEL_ID);
    if (!channel) return;
    
    const embed = new EmbedBuilder()
        .setColor(altGroup.riskScore >= 70 ? 0xef4444 : altGroup.riskScore >= 50 ? 0xf59e0b : 0x3b82f6)
        .setTitle('⚠️ Potential ALT Detected')
        .setDescription(`**Primary:** ${newPlayer.username}\n**Risk Score:** ${altGroup.riskScore}/100`)
        .addFields(
            { 
                name: 'Linked Accounts', 
                value: linkedAccounts.map(a => `• ${a.username}`).join('\n') || 'None',
                inline: true 
            },
            { 
                name: 'Detection Reason', 
                value: 'Shared IP address',
                inline: true 
            }
        )
        .setFooter({ text: `ID: ${altGroup._id}` })
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`alt_confirm_${altGroup._id}`)
                .setLabel('Confirm ALT')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`alt_deny_${altGroup._id}`)
                .setLabel('False Positive')
                .setStyle(ButtonStyle.Secondary)
        );
    
    await channel.send({ 
        content: getAlertPing(),
        embeds: [embed], 
        components: [row] 
    });
}

/**
 * Handle player connection event
 */
async function handleConnection(client, data) {
    const { uuid, username, ip, server, type } = data;
    const ipHash = hashIp(ip);
    
    // Store connection
    await PlayerConnection.create({
        uuid,
        username,
        ip,
        ipHash,
        server,
        type,
        timestamp: new Date()
    });
    
    // Update player analytics
    await PlayerAnalytics.findOneAndUpdate(
        { uuid },
        {
            $set: { username, lastSeen: new Date() },
            $setOnInsert: { firstSeen: new Date() },
            $inc: { connectionCount: 1 }
        },
        { upsert: true }
    );
    
    // Check for ALTs on join
    if (type === 'join') {
        await checkForAlts(client, uuid, username, ip, ipHash);
    }
}

/**
 * Check for ALT accounts
 */
async function checkForAlts(client, uuid, username, ip, ipHash) {
    // Find other accounts with same IP
    const sameIpAccounts = await PlayerConnection.aggregate([
        { $match: { ipHash, uuid: { $ne: uuid } } },
        { $group: { _id: '$uuid', username: { $last: '$username' }, count: { $sum: 1 } } }
    ]);
    
    if (sameIpAccounts.length === 0) return;
    
    // Check if already flagged
    const existingGroup = await AltGroup.findOne({
        $or: [
            { primaryUuid: uuid },
            { 'linkedAccounts.uuid': uuid }
        ]
    });
    
    if (existingGroup) return; // Already tracked
    
    // Calculate risk score
    let riskScore = 30; // Base score for shared IP
    riskScore += Math.min(sameIpAccounts.length * 15, 40); // More accounts = higher risk
    
    // Check for similar usernames
    const lowerUsername = username.toLowerCase();
    for (const acc of sameIpAccounts) {
        if (acc.username.toLowerCase().includes(lowerUsername.substring(0, 3)) ||
            lowerUsername.includes(acc.username.toLowerCase().substring(0, 3))) {
            riskScore += 15;
            break;
        }
    }
    
    riskScore = Math.min(riskScore, 100);
    
    // Create ALT group
    const altGroup = await AltGroup.create({
        primaryUuid: uuid,
        primaryUsername: username,
        linkedAccounts: sameIpAccounts.map(a => ({
            uuid: a._id,
            username: a.username
        })),
        sharedIps: [ipHash],
        riskScore,
        status: 'pending'
    });
    
    // Send alert to Discord
    if (canSendAlert(`alt_${uuid}`)) {
        markAlertSent(`alt_${uuid}`);
        
        const channel = client.channels.cache.get(ALT_ALERTS_CHANNEL_ID);
        if (channel) {
            const embed = new EmbedBuilder()
                .setColor(riskScore >= 70 ? 0xef4444 : riskScore >= 50 ? 0xf59e0b : 0x3b82f6)
                .setTitle('⚠️ Potential ALT Detected')
                .setDescription(`**Primary:** ${username}\n**Risk Score:** ${riskScore}/100`)
                .addFields(
                    { 
                        name: 'Linked Accounts', 
                        value: sameIpAccounts.map(a => `• ${a.username}`).join('\n') || 'None',
                        inline: true 
                    },
                    { 
                        name: 'Detection Reason', 
                        value: 'Shared IP address',
                        inline: true 
                    }
                )
                .setFooter({ text: `ID: ${altGroup._id}` })
                .setTimestamp();
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`alt_confirm_${altGroup._id}`)
                        .setLabel('Confirm ALT')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`alt_deny_${altGroup._id}`)
                        .setLabel('False Positive')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await channel.send({ 
                content: getAlertPing(),
                embeds: [embed], 
                components: [row] 
            });
        }
    }
}

/**
 * Handle TPS update
 */
async function handleTpsUpdate(client, data) {
    const { server, tps, mspt, loadedChunks, entityCount, playerCount, memoryUsed, memoryMax } = data;
    
    // Store TPS data
    await ServerTps.create({
        server,
        tps,
        mspt,
        loadedChunks,
        entityCount,
        playerCount,
        memoryUsed,
        memoryMax
    });
    
    // Check for TPS drops
    if (tps < 18) {
        const severity = tps < 12 ? 'critical' : tps < 15 ? 'high' : 'medium';
        
        if (canSendAlert(`tps_${server}`)) {
            markAlertSent(`tps_${server}`);
            
            const channel = client.channels.cache.get(LAG_ALERTS_CHANNEL_ID);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor(severity === 'critical' ? 0xef4444 : severity === 'high' ? 0xf59e0b : 0xeab308)
                    .setTitle(`🔴 TPS Drop Alert - ${server}`)
                    .setDescription(`Server TPS has dropped below safe levels!`)
                    .addFields(
                        { name: 'TPS', value: `\`${tps.toFixed(2)}\``, inline: true },
                        { name: 'MSPT', value: `\`${mspt.toFixed(2)}ms\``, inline: true },
                        { name: 'Severity', value: severity.toUpperCase(), inline: true },
                        { name: 'Entities', value: `\`${entityCount}\``, inline: true },
                        { name: 'Chunks', value: `\`${loadedChunks}\``, inline: true },
                        { name: 'Players', value: `\`${playerCount}\``, inline: true }
                    )
                    .setTimestamp();
                
                await channel.send({ 
                    content: getAlertPing(),
                    embeds: [embed] 
                });
            }
            
            // Create lag alert record
            await LagAlert.create({
                server,
                type: 'tps_drop',
                severity,
                details: `TPS dropped to ${tps.toFixed(2)}`,
                metrics: { tps, mspt, entityCount }
            });
        }
    }
}

/**
 * Handle chunk scan results
 */
async function handleChunkScan(client, data) {
    const { server, chunks } = data;
    
    for (const chunk of chunks) {
        const { world, x, z, entities, entityBreakdown, hoppers, redstone, tileEntities } = chunk;
        
        let flagged = false;
        let flagReason = null;
        
        // Check thresholds
        if (entities >= 250) {
            flagged = true;
            flagReason = `Critical entity count: ${entities}`;
        } else if (entities >= 100) {
            flagged = true;
            flagReason = `High entity count: ${entities}`;
        } else if (hoppers >= 50) {
            flagged = true;
            flagReason = `High hopper count: ${hoppers}`;
        } else if (redstone >= 100) {
            flagged = true;
            flagReason = `High redstone count: ${redstone}`;
        }
        
        // Update chunk data
        await ChunkAnalytics.findOneAndUpdate(
            { server, world, chunkX: x, chunkZ: z },
            {
                entityCount: entities,
                entityBreakdown: entityBreakdown || {},
                tileEntityCount: tileEntities || 0,
                hopperCount: hoppers || 0,
                redstoneCount: redstone || 0,
                flagged,
                flagReason,
                lastUpdated: new Date()
            },
            { upsert: true }
        );
        
        // Alert if flagged
        if (flagged && canSendAlert(`chunk_${server}_${x}_${z}`)) {
            markAlertSent(`chunk_${server}_${x}_${z}`);
            
            const channel = client.channels.cache.get(LAG_ALERTS_CHANNEL_ID);
            if (channel) {
                const severity = entities >= 250 ? 'critical' : 'high';
                
                const embed = new EmbedBuilder()
                    .setColor(severity === 'critical' ? 0xef4444 : 0xf59e0b)
                    .setTitle(`⚠️ Problem Chunk Detected - ${server}`)
                    .setDescription(`**World:** ${world}\n**Chunk:** (${x}, ${z})\n**Block Coords:** (${x * 16}, ${z * 16})`)
                    .addFields(
                        { name: 'Issue', value: flagReason, inline: false },
                        { name: 'Entities', value: `\`${entities}\``, inline: true },
                        { name: 'Hoppers', value: `\`${hoppers || 0}\``, inline: true },
                        { name: 'Redstone', value: `\`${redstone || 0}\``, inline: true }
                    )
                    .setTimestamp();
                
                if (entityBreakdown && Object.keys(entityBreakdown).length > 0) {
                    const breakdown = Object.entries(entityBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([type, count]) => `${type}: ${count}`)
                        .join('\n');
                    embed.addFields({ name: 'Top Entities', value: `\`\`\`${breakdown}\`\`\``, inline: false });
                }
                
                await channel.send({ 
                    content: getAlertPing(),
                    embeds: [embed] 
                });
                
                // Create alert record
                await LagAlert.create({
                    server,
                    type: entities >= 100 ? 'entity_spam' : hoppers >= 50 ? 'hopper_lag' : 'redstone_lag',
                    severity,
                    location: { world, chunkX: x, chunkZ: z, x: x * 16, z: z * 16 },
                    details: flagReason,
                    metrics: { entityCount: entities }
                });
            }
        }
    }
}

/**
 * Handle lag alert from plugin
 */
async function handleLagAlert(client, data) {
    const { server, type, severity, location, details, playerNearby, metrics } = data;
    
    if (!canSendAlert(`lag_${server}_${type}`)) return;
    markAlertSent(`lag_${server}_${type}`);
    
    const alert = await LagAlert.create({
        server,
        type,
        severity: severity || 'medium',
        location,
        details,
        playerNearby,
        metrics
    });
    
    const channel = client.channels.cache.get(LAG_ALERTS_CHANNEL_ID);
    if (channel) {
        const colorMap = {
            'critical': 0xef4444,
            'high': 0xf59e0b,
            'medium': 0xeab308,
            'low': 0x3b82f6
        };
        
        const typeNames = {
            'tps_drop': '🔴 TPS Drop',
            'entity_spam': '👾 Entity Spam',
            'redstone_lag': '🔴 Redstone Lag',
            'chunk_overload': '📦 Chunk Overload',
            'hopper_lag': '⬇️ Hopper Lag',
            'piston_spam': '🔧 Piston Spam',
            'suspected_lag_machine': '⚠️ Suspected Lag Machine'
        };
        
        const embed = new EmbedBuilder()
            .setColor(colorMap[severity] || 0xf59e0b)
            .setTitle(`${typeNames[type] || type} - ${server}`)
            .setDescription(details)
            .addFields(
                { name: 'Severity', value: (severity || 'medium').toUpperCase(), inline: true }
            )
            .setTimestamp();
        
        if (location) {
            embed.addFields({
                name: 'Location',
                value: `World: ${location.world}\nCoords: (${location.x}, ${location.y || '~'}, ${location.z})`,
                inline: true
            });
        }
        
        if (playerNearby) {
            embed.addFields({
                name: 'Player Nearby',
                value: playerNearby.username || 'Unknown',
                inline: true
            });
        }
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`lag_resolve_${alert._id}`)
                    .setLabel('Mark Resolved')
                    .setStyle(ButtonStyle.Success)
            );
        
        const msg = await channel.send({ 
            content: getAlertPing(),
            embeds: [embed], 
            components: [row] 
        });
        
        alert.discordMessageId = msg.id;
        await alert.save();
    }
}

/**
 * Handle player impact data
 */
async function handlePlayerImpact(client, data) {
    await PlayerImpact.create(data);
}

/**
 * Slash Commands
 */
const slashCommands = [
    // /alts command group
    {
        data: new SlashCommandBuilder()
            .setName('alts')
            .setDescription('ALT account detection commands')
            .addSubcommand(sub => sub
                .setName('check')
                .setDescription('Check if a player has ALT accounts')
                .addStringOption(opt => opt.setName('player').setDescription('Player name or UUID').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('pending')
                .setDescription('View pending ALT reviews')
            )
            .addSubcommand(sub => sub
                .setName('resolve')
                .setDescription('Resolve an ALT flag')
                .addStringOption(opt => opt.setName('id').setDescription('ALT group ID').setRequired(true))
                .addStringOption(opt => opt
                    .setName('action')
                    .setDescription('Action to take')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Confirm ALT', value: 'confirm' },
                        { name: 'False Positive', value: 'deny' }
                    )
                )
            )
            .addSubcommand(sub => sub
                .setName('history')
                .setDescription('View player connection history')
                .addStringOption(opt => opt.setName('player').setDescription('Player name or UUID').setRequired(true))
            ),
        async execute(interaction) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Staff only.')], ephemeral: true });
            }
            
            const sub = interaction.options.getSubcommand();
            
            if (sub === 'check') {
                const player = interaction.options.getString('player');
                await interaction.deferReply();
                
                // Find player
                const analytics = await PlayerAnalytics.findOne({
                    $or: [
                        { uuid: player },
                        { username: { $regex: new RegExp(`^${player}$`, 'i') } }
                    ]
                });
                
                if (!analytics) {
                    return interaction.editReply({ embeds: [createErrorEmbed('Not Found', 'Player not found in analytics database.')] });
                }
                
                // Find ALT groups
                const altGroup = await AltGroup.findOne({
                    $or: [
                        { primaryUuid: analytics.uuid },
                        { 'linkedAccounts.uuid': analytics.uuid }
                    ]
                });
                
                const embed = new EmbedBuilder()
                    .setColor(altGroup ? 0xf59e0b : 0x10b981)
                    .setTitle(`ALT Check: ${analytics.username}`)
                    .addFields(
                        { name: 'UUID', value: `\`${analytics.uuid}\``, inline: false },
                        { name: 'First Seen', value: `<t:${Math.floor(analytics.firstSeen.getTime() / 1000)}:R>`, inline: true },
                        { name: 'Last Seen', value: `<t:${Math.floor(analytics.lastSeen.getTime() / 1000)}:R>`, inline: true },
                        { name: 'Connections', value: `${analytics.connectionCount}`, inline: true }
                    );
                
                if (altGroup) {
                    const allAccounts = [altGroup.primaryUsername, ...altGroup.linkedAccounts.map(a => a.username)];
                    embed.addFields(
                        { name: 'ALT Status', value: `⚠️ **${altGroup.status.toUpperCase()}**`, inline: true },
                        { name: 'Risk Score', value: `${altGroup.riskScore}/100`, inline: true },
                        { name: 'Linked Accounts', value: allAccounts.join(', '), inline: false }
                    );
                } else {
                    embed.addFields({ name: 'ALT Status', value: '✅ No ALTs detected', inline: false });
                }
                
                // IP history (Supervisor+ only)
                if (isSupervisor(interaction.member) && analytics.ipHistory?.length > 0) {
                    const ipList = analytics.ipHistory.slice(-5).map(h => 
                        `\`${h.ip}\` - Last: <t:${Math.floor(h.lastUsed.getTime() / 1000)}:R>`
                    ).join('\n');
                    embed.addFields({ name: 'Recent IPs (Supervisor+)', value: ipList, inline: false });
                }
                
                return interaction.editReply({ embeds: [embed] });
            }
            
            if (sub === 'pending') {
                await interaction.deferReply();
                
                const pending = await AltGroup.find({ status: 'pending' }).sort({ riskScore: -1 }).limit(10);
                
                if (pending.length === 0) {
                    return interaction.editReply({ embeds: [createSuccessEmbed('No Pending', 'No pending ALT reviews.')] });
                }
                
                const embed = new EmbedBuilder()
                    .setColor(0xf59e0b)
                    .setTitle('Pending ALT Reviews')
                    .setDescription(pending.map((g, i) => {
                        const linked = g.linkedAccounts.map(a => a.username).join(', ');
                        return `**${i + 1}.** ${g.primaryUsername} ↔ ${linked}\n   Risk: ${g.riskScore}/100 | ID: \`${g._id}\``;
                    }).join('\n\n'))
                    .setFooter({ text: `${pending.length} pending reviews` });
                
                return interaction.editReply({ embeds: [embed] });
            }
            
            if (sub === 'resolve') {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Admin+ only.')], ephemeral: true });
                }
                
                const id = interaction.options.getString('id');
                const action = interaction.options.getString('action');
                
                const altGroup = await AltGroup.findById(id);
                if (!altGroup) {
                    return interaction.reply({ embeds: [createErrorEmbed('Not Found', 'ALT group not found.')], ephemeral: true });
                }
                
                altGroup.status = action === 'confirm' ? 'confirmed_alt' : 'false_positive';
                altGroup.resolvedBy = interaction.user.id;
                altGroup.resolvedAt = new Date();
                await altGroup.save();
                
                return interaction.reply({
                    embeds: [createSuccessEmbed('Resolved', `ALT group marked as **${altGroup.status.replace('_', ' ')}**.`)]
                });
            }
            
            if (sub === 'history') {
                if (!isSupervisor(interaction.member)) {
                    return interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Supervisor+ only.')], ephemeral: true });
                }
                
                const player = interaction.options.getString('player');
                await interaction.deferReply({ ephemeral: true });
                
                const connections = await PlayerConnection.find({
                    $or: [
                        { uuid: player },
                        { username: { $regex: new RegExp(`^${player}$`, 'i') } }
                    ]
                }).sort({ timestamp: -1 }).limit(20);
                
                if (connections.length === 0) {
                    return interaction.editReply({ embeds: [createErrorEmbed('Not Found', 'No connection history found.')] });
                }
                
                const embed = new EmbedBuilder()
                    .setColor(getEmbedColor())
                    .setTitle(`Connection History: ${connections[0].username}`)
                    .setDescription(connections.map(c => 
                        `<t:${Math.floor(c.timestamp.getTime() / 1000)}:R> - \`${c.ip}\` - ${c.type} (${c.server})`
                    ).join('\n'))
                    .setFooter({ text: 'Showing last 20 connections' });
                
                return interaction.editReply({ embeds: [embed] });
            }
        }
    },
    
    // /tps command
    {
        data: new SlashCommandBuilder()
            .setName('tps')
            .setDescription('View server TPS and performance')
            .addStringOption(opt => opt.setName('server').setDescription('Server name (default: main)'))
            .addIntegerOption(opt => opt.setName('hours').setDescription('Hours of history (default: 1)')),
        async execute(interaction) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Staff only.')], ephemeral: true });
            }
            
            await interaction.deferReply();
            
            const server = interaction.options.getString('server') || 'main';
            const hours = interaction.options.getInteger('hours') || 1;
            
            const since = new Date(Date.now() - hours * 60 * 60 * 1000);
            
            const tpsData = await ServerTps.find({
                server,
                timestamp: { $gte: since }
            }).sort({ timestamp: -1 });
            
            if (tpsData.length === 0) {
                return interaction.editReply({ embeds: [createErrorEmbed('No Data', `No TPS data for server "${server}".`)] });
            }
            
            const latest = tpsData[0];
            const avgTps = tpsData.reduce((sum, d) => sum + d.tps, 0) / tpsData.length;
            const minTps = Math.min(...tpsData.map(d => d.tps));
            const maxTps = Math.max(...tpsData.map(d => d.tps));
            
            const embed = new EmbedBuilder()
                .setColor(latest.tps >= 18 ? 0x10b981 : latest.tps >= 15 ? 0xf59e0b : 0xef4444)
                .setTitle(`Server Performance: ${server}`)
                .addFields(
                    { name: 'Current TPS', value: `\`${latest.tps.toFixed(2)}\``, inline: true },
                    { name: 'MSPT', value: `\`${latest.mspt.toFixed(2)}ms\``, inline: true },
                    { name: 'Status', value: latest.tps >= 18 ? '🟢 Good' : latest.tps >= 15 ? '🟡 Warning' : '🔴 Lag', inline: true },
                    { name: `${hours}h Average`, value: `\`${avgTps.toFixed(2)}\``, inline: true },
                    { name: `${hours}h Min`, value: `\`${minTps.toFixed(2)}\``, inline: true },
                    { name: `${hours}h Max`, value: `\`${maxTps.toFixed(2)}\``, inline: true },
                    { name: 'Entities', value: `\`${latest.entityCount}\``, inline: true },
                    { name: 'Chunks', value: `\`${latest.loadedChunks}\``, inline: true },
                    { name: 'Players', value: `\`${latest.playerCount}\``, inline: true }
                )
                .setFooter({ text: `Last update: ${latest.timestamp.toISOString()}` });
            
            if (latest.memoryUsed && latest.memoryMax) {
                const memPercent = ((latest.memoryUsed / latest.memoryMax) * 100).toFixed(1);
                embed.addFields({
                    name: 'Memory',
                    value: `\`${latest.memoryUsed}MB / ${latest.memoryMax}MB (${memPercent}%)\``,
                    inline: false
                });
            }
            
            return interaction.editReply({ embeds: [embed] });
        }
    },
    
    // /chunks command
    {
        data: new SlashCommandBuilder()
            .setName('chunks')
            .setDescription('View chunk analytics')
            .addSubcommand(sub => sub
                .setName('problem')
                .setDescription('List problem chunks')
                .addStringOption(opt => opt.setName('server').setDescription('Server name'))
            )
            .addSubcommand(sub => sub
                .setName('info')
                .setDescription('Get info about a specific chunk')
                .addIntegerOption(opt => opt.setName('x').setDescription('Chunk X').setRequired(true))
                .addIntegerOption(opt => opt.setName('z').setDescription('Chunk Z').setRequired(true))
                .addStringOption(opt => opt.setName('world').setDescription('World name'))
                .addStringOption(opt => opt.setName('server').setDescription('Server name'))
            ),
        async execute(interaction) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Staff only.')], ephemeral: true });
            }
            
            const sub = interaction.options.getSubcommand();
            await interaction.deferReply();
            
            if (sub === 'problem') {
                const server = interaction.options.getString('server') || 'main';
                
                const problemChunks = await ChunkAnalytics.find({
                    server,
                    flagged: true
                }).sort({ entityCount: -1 }).limit(10);
                
                if (problemChunks.length === 0) {
                    return interaction.editReply({ embeds: [createSuccessEmbed('All Clear', 'No problem chunks detected!')] });
                }
                
                const embed = new EmbedBuilder()
                    .setColor(0xf59e0b)
                    .setTitle(`Problem Chunks: ${server}`)
                    .setDescription(problemChunks.map((c, i) => 
                        `**${i + 1}.** (${c.chunkX}, ${c.chunkZ}) in ${c.world}\n   ${c.flagReason}\n   Entities: ${c.entityCount} | Hoppers: ${c.hopperCount}`
                    ).join('\n\n'))
                    .setFooter({ text: `${problemChunks.length} problem chunks` });
                
                return interaction.editReply({ embeds: [embed] });
            }
            
            if (sub === 'info') {
                const x = interaction.options.getInteger('x');
                const z = interaction.options.getInteger('z');
                const world = interaction.options.getString('world') || 'world';
                const server = interaction.options.getString('server') || 'main';
                
                const chunk = await ChunkAnalytics.findOne({ server, world, chunkX: x, chunkZ: z });
                
                if (!chunk) {
                    return interaction.editReply({ embeds: [createErrorEmbed('Not Found', 'Chunk not in database. It may not have been scanned yet.')] });
                }
                
                const embed = new EmbedBuilder()
                    .setColor(chunk.flagged ? 0xef4444 : 0x10b981)
                    .setTitle(`Chunk (${x}, ${z}) - ${world}`)
                    .addFields(
                        { name: 'Server', value: server, inline: true },
                        { name: 'Block Coords', value: `(${x * 16}, ${z * 16})`, inline: true },
                        { name: 'Status', value: chunk.flagged ? `⚠️ ${chunk.flagReason}` : '✅ Normal', inline: false },
                        { name: 'Entities', value: `${chunk.entityCount}`, inline: true },
                        { name: 'Tile Entities', value: `${chunk.tileEntityCount}`, inline: true },
                        { name: 'Hoppers', value: `${chunk.hopperCount}`, inline: true },
                        { name: 'Redstone', value: `${chunk.redstoneCount}`, inline: true }
                    )
                    .setFooter({ text: `Last updated: ${chunk.lastUpdated.toISOString()}` });
                
                if (chunk.entityBreakdown && chunk.entityBreakdown.size > 0) {
                    const breakdown = Array.from(chunk.entityBreakdown.entries())
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 8)
                        .map(([type, count]) => `${type}: ${count}`)
                        .join('\n');
                    embed.addFields({ name: 'Entity Breakdown', value: `\`\`\`${breakdown}\`\`\``, inline: false });
                }
                
                return interaction.editReply({ embeds: [embed] });
            }
        }
    },
    
    // /lag command group
    {
        data: new SlashCommandBuilder()
            .setName('lag')
            .setDescription('Lag detection and alerts')
            .addSubcommand(sub => sub
                .setName('alerts')
                .setDescription('View active lag alerts')
                .addStringOption(opt => opt.setName('server').setDescription('Server name'))
            )
            .addSubcommand(sub => sub
                .setName('resolve')
                .setDescription('Mark an alert as resolved')
                .addStringOption(opt => opt.setName('id').setDescription('Alert ID').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('player')
                .setDescription('Check a player\'s server impact')
                .addStringOption(opt => opt.setName('player').setDescription('Player name').setRequired(true))
            ),
        async execute(interaction) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Staff only.')], ephemeral: true });
            }
            
            const sub = interaction.options.getSubcommand();
            await interaction.deferReply();
            
            if (sub === 'alerts') {
                const server = interaction.options.getString('server');
                
                const query = { resolved: false };
                if (server) query.server = server;
                
                const alerts = await LagAlert.find(query).sort({ timestamp: -1 }).limit(10);
                
                if (alerts.length === 0) {
                    return interaction.editReply({ embeds: [createSuccessEmbed('All Clear', 'No active lag alerts!')] });
                }
                
                const embed = new EmbedBuilder()
                    .setColor(0xf59e0b)
                    .setTitle('Active Lag Alerts')
                    .setDescription(alerts.map((a, i) => {
                        const loc = a.location ? `(${a.location.x}, ${a.location.z})` : 'N/A';
                        return `**${i + 1}.** [${a.severity.toUpperCase()}] ${a.type.replace(/_/g, ' ')}\n   Server: ${a.server} | Location: ${loc}\n   ID: \`${a._id}\``;
                    }).join('\n\n'))
                    .setFooter({ text: `${alerts.length} active alerts` });
                
                return interaction.editReply({ embeds: [embed] });
            }
            
            if (sub === 'resolve') {
                if (!isAdmin(interaction.member)) {
                    return interaction.editReply({ embeds: [createErrorEmbed('Permission Denied', 'Admin+ only.')] });
                }
                
                const id = interaction.options.getString('id');
                
                const alert = await LagAlert.findByIdAndUpdate(id, {
                    resolved: true,
                    resolvedBy: interaction.user.id,
                    resolvedAt: new Date()
                });
                
                if (!alert) {
                    return interaction.editReply({ embeds: [createErrorEmbed('Not Found', 'Alert not found.')] });
                }
                
                return interaction.editReply({ embeds: [createSuccessEmbed('Resolved', 'Lag alert marked as resolved.')] });
            }
            
            if (sub === 'player') {
                const player = interaction.options.getString('player');
                
                const recentImpact = await PlayerImpact.find({
                    username: { $regex: new RegExp(`^${player}$`, 'i') }
                }).sort({ timestamp: -1 }).limit(10);
                
                if (recentImpact.length === 0) {
                    return interaction.editReply({ embeds: [createErrorEmbed('No Data', 'No impact data for this player.')] });
                }
                
                const totals = recentImpact.reduce((acc, i) => ({
                    blocks: acc.blocks + i.blocksPlaced + i.blocksBroken,
                    entities: acc.entities + i.entitiesSpawned,
                    redstone: acc.redstone + i.redstoneTriggered,
                    chunkLoads: acc.chunkLoads + i.chunkLoads
                }), { blocks: 0, entities: 0, redstone: 0, chunkLoads: 0 });
                
                const embed = new EmbedBuilder()
                    .setColor(getEmbedColor())
                    .setTitle(`Player Impact: ${recentImpact[0].username}`)
                    .addFields(
                        { name: 'Recent Block Activity', value: `${totals.blocks}`, inline: true },
                        { name: 'Entities Spawned', value: `${totals.entities}`, inline: true },
                        { name: 'Redstone Triggered', value: `${totals.redstone}`, inline: true },
                        { name: 'Chunk Loads', value: `${totals.chunkLoads}`, inline: true }
                    )
                    .setFooter({ text: 'Based on recent activity samples' });
                
                return interaction.editReply({ embeds: [embed] });
            }
        }
    }
];

/**
 * Handle button interactions for ALT/Lag resolution
 */
async function handleButtonInteraction(interaction) {
    if (!interaction.isButton()) return false;
    
    const customId = interaction.customId;
    
    // ALT resolution buttons
    if (customId.startsWith('alt_confirm_') || customId.startsWith('alt_deny_')) {
        if (!isAdmin(interaction.member)) {
            await interaction.reply({ content: 'Admin+ only.', ephemeral: true });
            return true;
        }
        
        const action = customId.startsWith('alt_confirm_') ? 'confirm' : 'deny';
        const id = customId.replace('alt_confirm_', '').replace('alt_deny_', '');
        
        const altGroup = await AltGroup.findByIdAndUpdate(id, {
            status: action === 'confirm' ? 'confirmed_alt' : 'false_positive',
            resolvedBy: interaction.user.id,
            resolvedAt: new Date()
        });
        
        if (altGroup) {
            await interaction.update({
                content: `✅ Resolved by ${interaction.user.tag} as **${action === 'confirm' ? 'Confirmed ALT' : 'False Positive'}**`,
                components: []
            });
        }
        return true;
    }
    
    // Lag resolution buttons
    if (customId.startsWith('lag_resolve_')) {
        if (!isAdmin(interaction.member)) {
            await interaction.reply({ content: 'Admin+ only.', ephemeral: true });
            return true;
        }
        
        const id = customId.replace('lag_resolve_', '');
        
        await LagAlert.findByIdAndUpdate(id, {
            resolved: true,
            resolvedBy: interaction.user.id,
            resolvedAt: new Date()
        });
        
        await interaction.update({
            content: `✅ Resolved by ${interaction.user.tag}`,
            components: []
        });
        return true;
    }
    
    return false;
}

module.exports = {
    name: 'Analytics',
    description: 'Server analytics, ALT detection, and lag monitoring',
    slashCommands,
    initAnalytics,
    handleButtonInteraction,
    handleAnalyticsEvent,
    hashIp
};
