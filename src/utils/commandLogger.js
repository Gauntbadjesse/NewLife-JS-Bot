/**
 * Command Logger Utility
 * Logs all Discord command executions to a Discord channel
 */

const { EmbedBuilder } = require('discord.js');

/**
 * Log a command execution (stub for compatibility)
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} options - Additional options
 */
async function logCommand(interaction, options = {}) {
    // No-op - logging is now Discord-only via sendCommandLogToChannel
    return null;
}

/**
 * Send command log to Discord channel
 * @param {Client} client - Discord client
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} options - Additional options
 */
async function sendCommandLogToChannel(client, interaction, options = {}) {
    const commandLogChannelId = process.env.COMMAND_LOG_CHANNEL_ID;
    if (!commandLogChannelId) return;

    try {
        const channel = await client.channels.fetch(commandLogChannelId).catch(() => null);
        if (!channel) return;

        // Build command string
        let fullCommand = `/${interaction.commandName}`;
        if (interaction.options) {
            const subcommand = interaction.options.getSubcommand(false);
            if (subcommand) fullCommand += ` ${subcommand}`;

            if (interaction.options.data) {
                for (const option of interaction.options.data) {
                    if (option.type === 1) {
                        for (const subOpt of option.options || []) {
                            fullCommand += ` ${subOpt.name}:${subOpt.value}`;
                        }
                    } else {
                        fullCommand += ` ${option.name}:${option.value}`;
                    }
                }
            }
        }

        const embed = new EmbedBuilder()
            .setColor(options.success !== false ? 0x3498DB : 0xE74C3C)
            .setTitle('Command Executed')
            .addFields(
                { name: 'Command', value: `\`${fullCommand}\``, inline: false },
                { name: 'User', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
                { name: 'Channel', value: `<#${interaction.channel?.id}>`, inline: true }
            )
            .setTimestamp();

        if (options.error) {
            embed.addFields({ name: 'Error', value: options.error, inline: false });
        }

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('[CommandLogger] Error sending to channel:', error.message);
    }
}

module.exports = {
    logCommand,
    sendCommandLogToChannel
};
