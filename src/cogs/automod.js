/**
 * Automod Cog
 * Automatic moderation system with configurable filters
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const AutomodConfig = require('../database/models/AutomodConfig');
const Warning = require('../database/models/Warning');
const { getNextCaseNumber } = require('../database/caseCounter');
const { isAdmin } = require('../utils/permissions');
const { randomUUID } = require('crypto');

// In-memory spam tracking
const spamTracker = new Map(); // Map<`${guildId}-${userId}`, { messages: [], lastWarned: Date }>

/**
 * Get or create automod config for a guild
 */
async function getConfig(guildId) {
    let config = await AutomodConfig.findOne({ guildId });
    if (!config) {
        config = new AutomodConfig({ guildId });
        await config.save();
    }
    return config;
}

/**
 * Check if member is exempt from automod
 */
function isExempt(member, config) {
    if (!member) return true;
    
    // Check exempt roles
    if (config.exemptRoles && config.exemptRoles.length > 0) {
        if (member.roles.cache.some(r => config.exemptRoles.includes(r.id))) {
            return true;
        }
    }
    
    // Admins are always exempt
    if (isAdmin(member)) return true;
    
    return false;
}

/**
 * Check if channel is exempt
 */
function isChannelExempt(channelId, config) {
    return config.exemptChannels && config.exemptChannels.includes(channelId);
}

/**
 * Log automod action
 */
async function logAction(client, config, action, member, reason, details = {}) {
    if (!config.logChannelId) return;
    
    try {
        const channel = await client.channels.fetch(config.logChannelId);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle('🛡️ Automod Action')
            .setColor('#f59e0b')
            .addFields(
                { name: 'Action', value: action, inline: true },
                { name: 'User', value: `${member.user?.tag || member} (<@${member.id || member}>)`, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();

        if (details.message) {
            embed.addFields({ name: 'Message', value: details.message.substring(0, 500), inline: false });
        }

        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Failed to log automod action:', e);
    }
}

/**
 * Take action based on configured action type
 */
async function takeAction(client, config, actionType, member, message, reason, muteDuration = 300000) {
    try {
        switch (actionType) {
            case 'delete':
                if (message && message.deletable) {
                    await message.delete().catch(() => {});
                }
                break;

            case 'warn':
                if (message && message.deletable) {
                    await message.delete().catch(() => {});
                }
                // Create warning in database
                const caseNumber = await getNextCaseNumber();
                const warning = new Warning({
                    _id: randomUUID(),
                    caseNumber,
                    uuid: member.id,
                    playerName: member.user?.tag || 'Unknown',
                    staffUuid: client.user.id,
                    staffName: 'Automod',
                    reason: `[Automod] ${reason}`,
                    active: true,
                    createdAt: new Date()
                });
                await warning.save();
                
                try {
                    await member.send(`⚠️ You have been warned in **${message.guild.name}** for: ${reason}`);
                } catch (e) {}
                break;

            case 'mute':
                if (message && message.deletable) {
                    await message.delete().catch(() => {});
                }
                try {
                    await member.timeout(muteDuration, `[Automod] ${reason}`);
                    try {
                        await member.send(`🔇 You have been muted in **${message.guild.name}** for ${Math.round(muteDuration/60000)} minutes for: ${reason}`);
                    } catch (e) {}
                } catch (e) {
                    console.error('Failed to mute:', e);
                }
                break;

            case 'kick':
                if (message && message.deletable) {
                    await message.delete().catch(() => {});
                }
                try {
                    await member.send(`👢 You have been kicked from **${message.guild.name}** for: ${reason}`);
                } catch (e) {}
                try {
                    await member.kick(`[Automod] ${reason}`);
                } catch (e) {
                    console.error('Failed to kick:', e);
                }
                break;

            case 'ban':
                if (message && message.deletable) {
                    await message.delete().catch(() => {});
                }
                try {
                    await member.send(`🔨 You have been banned from **${message.guild.name}** for: ${reason}`);
                } catch (e) {}
                try {
                    await member.ban({ reason: `[Automod] ${reason}` });
                } catch (e) {
                    console.error('Failed to ban:', e);
                }
                break;
        }

        await logAction(client, config, actionType.toUpperCase(), member, reason, { message: message?.content });
    } catch (error) {
        console.error('Automod takeAction error:', error);
    }
}

/**
 * Process a message through all automod filters
 */
async function processMessage(message, client) {
    if (!message.guild || message.author.bot) return;

    const config = await getConfig(message.guild.id);
    if (!config.enabled) return;

    const member = message.member;
    if (!member || isExempt(member, config)) return;
    if (isChannelExempt(message.channel.id, config)) return;

    const content = message.content;

    // Word Filter
    if (config.wordFilterEnabled && config.bannedWords.length > 0) {
        const lowerContent = content.toLowerCase();
        for (const word of config.bannedWords) {
            if (lowerContent.includes(word.toLowerCase())) {
                await takeAction(client, config, config.wordFilterAction, member, message, `Banned word detected: ${word}`, config.wordFilterMuteDuration);
                return;
            }
        }
    }

    // Spam Detection
    if (config.spamDetectionEnabled) {
        const key = `${message.guild.id}-${message.author.id}`;
        const now = Date.now();
        
        if (!spamTracker.has(key)) {
            spamTracker.set(key, { messages: [], lastWarned: 0 });
        }
        
        const tracker = spamTracker.get(key);
        tracker.messages = tracker.messages.filter(t => now - t < config.spamTimeWindow);
        tracker.messages.push(now);

        if (tracker.messages.length >= config.spamThreshold) {
            if (now - tracker.lastWarned > 30000) { // Don't spam warnings
                tracker.lastWarned = now;
                await takeAction(client, config, config.spamAction, member, message, 'Message spam detected', config.spamMuteDuration);
            }
            tracker.messages = [];
        }
    }

    // Link Filter
    if (config.linkFilterEnabled) {
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const urls = content.match(urlRegex);
        
        if (urls && urls.length > 0) {
            let blocked = false;
            for (const url of urls) {
                try {
                    const domain = new URL(url).hostname.toLowerCase();
                    const isAllowed = config.allowedDomains.some(d => 
                        domain === d.toLowerCase() || domain.endsWith('.' + d.toLowerCase())
                    );
                    if (!isAllowed) {
                        blocked = true;
                        break;
                    }
                } catch (e) {
                    blocked = true;
                }
            }
            
            if (blocked) {
                await takeAction(client, config, config.linkFilterAction, member, message, 'Unauthorized link posted');
                return;
            }
        }
    }

    // Caps Filter
    if (config.capsFilterEnabled && content.length >= config.capsMinLength) {
        const letters = content.replace(/[^a-zA-Z]/g, '');
        if (letters.length >= config.capsMinLength) {
            const capsCount = (content.match(/[A-Z]/g) || []).length;
            const capsPercent = (capsCount / letters.length) * 100;
            
            if (capsPercent >= config.capsThreshold) {
                await takeAction(client, config, config.capsAction, member, message, 'Excessive caps usage');
                return;
            }
        }
    }

    // Mention Spam
    if (config.mentionSpamEnabled) {
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        if (mentionCount >= config.mentionThreshold) {
            await takeAction(client, config, config.mentionAction, member, message, `Mass mention (${mentionCount} mentions)`, config.spamMuteDuration);
            return;
        }
    }
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('automod')
            .setDescription('Automod configuration')
            .addSubcommand(sub => sub
                .setName('status')
                .setDescription('View automod status')
            )
            .addSubcommand(sub => sub
                .setName('toggle')
                .setDescription('Enable or disable automod')
                .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable automod').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('addword')
                .setDescription('Add a banned word')
                .addStringOption(opt => opt.setName('word').setDescription('Word to ban').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('removeword')
                .setDescription('Remove a banned word')
                .addStringOption(opt => opt.setName('word').setDescription('Word to remove').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('setlog')
                .setDescription('Set the automod log channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('Log channel').setRequired(true))
            ),

        async execute(interaction, client) {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Permission denied.', ephemeral: true });
            }

            const sub = interaction.options.getSubcommand();
            const config = await getConfig(interaction.guild.id);

            if (sub === 'status') {
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Automod Status')
                    .setColor(config.enabled ? '#22c55e' : '#ef4444')
                    .addFields(
                        { name: 'Status', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                        { name: 'Word Filter', value: config.wordFilterEnabled ? `✅ (${config.bannedWords.length} words)` : '❌', inline: true },
                        { name: 'Spam Detection', value: config.spamDetectionEnabled ? '✅' : '❌', inline: true },
                        { name: 'Link Filter', value: config.linkFilterEnabled ? '✅' : '❌', inline: true },
                        { name: 'Caps Filter', value: config.capsFilterEnabled ? '✅' : '❌', inline: true },
                        { name: 'Mention Spam', value: config.mentionSpamEnabled ? '✅' : '❌', inline: true },
                        { name: 'Log Channel', value: config.logChannelId ? `<#${config.logChannelId}>` : 'Not set', inline: true }
                    )
                    .setFooter({ text: 'Use the Admin UI for full configuration' });

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (sub === 'toggle') {
                config.enabled = interaction.options.getBoolean('enabled');
                config.updatedBy = interaction.user.tag;
                config.updatedAt = new Date();
                await config.save();

                return interaction.reply({
                    content: `✅ Automod ${config.enabled ? 'enabled' : 'disabled'}.`,
                    ephemeral: true
                });
            }

            if (sub === 'addword') {
                const word = interaction.options.getString('word').toLowerCase();
                if (!config.bannedWords.includes(word)) {
                    config.bannedWords.push(word);
                    config.wordFilterEnabled = true;
                    await config.save();
                }
                return interaction.reply({ content: `✅ Added "${word}" to banned words.`, ephemeral: true });
            }

            if (sub === 'removeword') {
                const word = interaction.options.getString('word').toLowerCase();
                config.bannedWords = config.bannedWords.filter(w => w !== word);
                await config.save();
                return interaction.reply({ content: `✅ Removed "${word}" from banned words.`, ephemeral: true });
            }

            if (sub === 'setlog') {
                const channel = interaction.options.getChannel('channel');
                config.logChannelId = channel.id;
                await config.save();
                return interaction.reply({ content: `✅ Automod log channel set to <#${channel.id}>.`, ephemeral: true });
            }
        }
    }
];

module.exports = {
    name: 'Automod',
    slashCommands,
    processMessage,
    getConfig
};
