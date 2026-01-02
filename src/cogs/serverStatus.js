/**
 * Server Status Cog
 * Real-time Minecraft server status via RCON
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Rcon } = require('rcon-client');

// RCON configuration
const RCON_HOST = process.env.RCON_HOST || 'localhost';
const RCON_PORT = parseInt(process.env.RCON_PORT) || 25575;
const RCON_PASSWORD = process.env.RCON_PASSWORD || '';

/**
 * Execute RCON command
 */
async function executeRcon(command, timeout = 5000) {
    const rcon = new Rcon({
        host: RCON_HOST,
        port: RCON_PORT,
        password: RCON_PASSWORD,
        timeout: timeout
    });

    try {
        await rcon.connect();
        const response = await rcon.send(command);
        await rcon.end();
        return response;
    } catch (error) {
        console.error('RCON error:', error);
        throw error;
    }
}

/**
 * Parse player list response
 */
function parsePlayerList(response) {
    // Format: "There are X of a max of Y players online: player1, player2"
    const match = response.match(/There are (\d+) of a max of (\d+) players online:(.*)/);
    if (match) {
        const online = parseInt(match[1]);
        const max = parseInt(match[2]);
        const players = match[3].trim().split(', ').filter(p => p.length > 0);
        return { online, max, players };
    }
    
    // Alternative format: "There are X/Y players online:"
    const altMatch = response.match(/There are (\d+)\/(\d+) players online:(.*)/);
    if (altMatch) {
        const online = parseInt(altMatch[1]);
        const max = parseInt(altMatch[2]);
        const players = altMatch[3].trim().split(', ').filter(p => p.length > 0);
        return { online, max, players };
    }

    return { online: 0, max: 0, players: [] };
}

/**
 * Parse TPS response
 */
function parseTPS(response) {
    // Format varies by plugin, common ones:
    // "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0"
    // or "§6TPS from last 1m, 5m, 15m: §a20.0§6, §a20.0§6, §a20.0"
    
    // Strip color codes
    const clean = response.replace(/§[0-9a-fk-or]/gi, '');
    
    const tpsMatch = clean.match(/(\d+\.?\d*),?\s*(\d+\.?\d*),?\s*(\d+\.?\d*)/);
    if (tpsMatch) {
        return {
            tps1m: parseFloat(tpsMatch[1]),
            tps5m: parseFloat(tpsMatch[2]),
            tps15m: parseFloat(tpsMatch[3])
        };
    }
    
    return null;
}

/**
 * Get TPS color indicator
 */
function getTpsColor(tps) {
    if (tps >= 19.5) return '[Good]';
    if (tps >= 18) return '[OK]';
    if (tps >= 15) return '[Fair]';
    return '[Poor]';
}

/**
 * Get TPS health description
 */
function getTpsHealth(tps) {
    if (tps >= 19.5) return 'Excellent';
    if (tps >= 18) return 'Good';
    if (tps >= 15) return 'Fair';
    if (tps >= 10) return 'Poor';
    return 'Critical';
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('status')
            .setDescription('Check Minecraft server status')
            .addSubcommand(sub => sub
                .setName('server')
                .setDescription('Full server status')
            )
            .addSubcommand(sub => sub
                .setName('players')
                .setDescription('List online players')
            )
            .addSubcommand(sub => sub
                .setName('tps')
                .setDescription('Check server TPS')
            ),

        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();

            await interaction.deferReply();

            try {
                if (sub === 'server') {
                    // Get player list
                    const listResponse = await executeRcon('list');
                    const playerData = parsePlayerList(listResponse);

                    // Try to get TPS
                    let tpsData = null;
                    try {
                        const tpsResponse = await executeRcon('tps');
                        tpsData = parseTPS(tpsResponse);
                    } catch (e) {
                        // TPS command might not exist
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('Server Status')
                        .setColor('#22c55e')
                        .setTimestamp();

                    // Connection status
                    embed.addFields({
                        name: 'Connection',
                        value: 'Online',
                        inline: true
                    });

                    // Player count
                    embed.addFields({
                        name: 'Players',
                        value: `${playerData.online}/${playerData.max}`,
                        inline: true
                    });

                    // TPS if available
                    if (tpsData) {
                        const tpsIcon = getTpsColor(tpsData.tps1m);
                        embed.addFields({
                            name: 'TPS',
                            value: `${tpsIcon} ${tpsData.tps1m.toFixed(1)} (${getTpsHealth(tpsData.tps1m)})`,
                            inline: true
                        });
                    }

                    // Online players
                    if (playerData.players.length > 0) {
                        const playerList = playerData.players.slice(0, 30).join(', ');
                        const truncated = playerData.players.length > 30 ? ` (+${playerData.players.length - 30} more)` : '';
                        embed.addFields({
                            name: 'Online Players',
                            value: playerList + truncated || 'None',
                            inline: false
                        });
                    }

                    // Server info
                    embed.setFooter({ text: `RCON: ${RCON_HOST}:${RCON_PORT}` });

                    return interaction.editReply({ embeds: [embed] });
                }

                if (sub === 'players') {
                    const listResponse = await executeRcon('list');
                    const playerData = parsePlayerList(listResponse);

                    const embed = new EmbedBuilder()
                        .setTitle('Online Players')
                        .setColor('#3b82f6')
                        .setDescription(`**${playerData.online}** of **${playerData.max}** players online`)
                        .setTimestamp();

                    if (playerData.players.length === 0) {
                        embed.addFields({
                            name: 'Players',
                            value: 'No players currently online.',
                            inline: false
                        });
                    } else {
                        // Split into columns if many players
                        const mid = Math.ceil(playerData.players.length / 2);
                        const col1 = playerData.players.slice(0, mid);
                        const col2 = playerData.players.slice(mid);

                        if (playerData.players.length <= 20) {
                            embed.addFields({
                                name: 'Online',
                                value: playerData.players.map(p => `• ${p}`).join('\n'),
                                inline: false
                            });
                        } else {
                            embed.addFields(
                                {
                                    name: 'Online (1)',
                                    value: col1.slice(0, 25).map(p => `• ${p}`).join('\n'),
                                    inline: true
                                },
                                {
                                    name: 'Online (2)',
                                    value: col2.slice(0, 25).map(p => `• ${p}`).join('\n'),
                                    inline: true
                                }
                            );
                        }
                    }

                    return interaction.editReply({ embeds: [embed] });
                }

                if (sub === 'tps') {
                    let tpsResponse;
                    try {
                        tpsResponse = await executeRcon('tps');
                    } catch (e) {
                        return interaction.editReply({
                            content: 'TPS command not available on this server. Make sure you have a plugin that provides `/tps`.'
                        });
                    }

                    const tpsData = parseTPS(tpsResponse);

                    if (!tpsData) {
                        return interaction.editReply({
                            content: `Raw TPS Response:\n\`\`\`\n${tpsResponse}\n\`\`\``
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('Server Performance')
                        .setColor(tpsData.tps1m >= 18 ? '#22c55e' : tpsData.tps1m >= 15 ? '#f59e0b' : '#ef4444')
                        .setTimestamp();

                    embed.addFields(
                        {
                            name: '1 Minute',
                            value: `${getTpsColor(tpsData.tps1m)} **${tpsData.tps1m.toFixed(2)}**`,
                            inline: true
                        },
                        {
                            name: '5 Minutes',
                            value: `${getTpsColor(tpsData.tps5m)} **${tpsData.tps5m.toFixed(2)}**`,
                            inline: true
                        },
                        {
                            name: '15 Minutes',
                            value: `${getTpsColor(tpsData.tps15m)} **${tpsData.tps15m.toFixed(2)}**`,
                            inline: true
                        }
                    );

                    // Overall health
                    const avgTps = (tpsData.tps1m + tpsData.tps5m + tpsData.tps15m) / 3;
                    embed.addFields({
                        name: 'Overall Health',
                        value: `${getTpsHealth(avgTps)} (${avgTps.toFixed(1)} avg TPS)`,
                        inline: false
                    });

                    // Performance bar
                    const perfPercent = Math.min(100, (avgTps / 20) * 100);
                    const filled = Math.round(perfPercent / 5);
                    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
                    embed.addFields({
                        name: 'Performance',
                        value: `\`${bar}\` ${perfPercent.toFixed(0)}%`,
                        inline: false
                    });

                    return interaction.editReply({ embeds: [embed] });
                }

            } catch (error) {
                console.error('Status command error:', error);
                
                const embed = new EmbedBuilder()
                    .setTitle('Server Status')
                    .setColor('#ef4444')
                    .addFields({
                        name: 'Connection',
                        value: 'Offline / Unreachable',
                        inline: true
                    })
                    .setDescription('Could not connect to the Minecraft server via RCON.')
                    .setFooter({ text: 'Check RCON configuration and server status' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }
        }
    }
];

module.exports = {
    name: 'ServerStatus',
    slashCommands,
    executeRcon,
    parsePlayerList,
    parseTPS
};
