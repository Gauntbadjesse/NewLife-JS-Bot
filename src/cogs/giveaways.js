/**
 * Giveaway System Cog
 * Owner-only giveaway management with reaction entries
 * 
 * Commands:
 * - /giveaway start - Start a new giveaway
 * - /giveaway end - End a giveaway early
 * - /giveaway reroll - Reroll winners for a giveaway
 * - /giveaway list - List active giveaways
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { isOwner } = require('../utils/permissions');

// Premium role ID - gets double entries in giveaways
const PREMIUM_ROLE_ID = process.env.NEWLIFE_PLUS;

// Giveaway schema
const giveawaySchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    hostId: { type: String, required: true },
    prize: { type: String, required: true },
    description: { type: String },
    winners: { type: Number, default: 1 },
    endsAt: { type: Date, required: true },
    ended: { type: Boolean, default: false },
    winnerIds: [{ type: String }],
    participants: [{ type: String }],
    requiredRole: { type: String },
    createdAt: { type: Date, default: Date.now }
});

giveawaySchema.index({ endsAt: 1, ended: 1 });
giveawaySchema.index({ guildId: 1 });

const Giveaway = mongoose.models.Giveaway || mongoose.model('Giveaway', giveawaySchema);

// Store interval reference for cleanup
let giveawayInterval = null;

/**
 * Parse duration string to milliseconds
 * Accepts: 30s, 5m, 1h, 2d, 1w
 */
function parseDuration(str) {
    if (!str) return null;
    const match = String(str).toLowerCase().match(/^(\d+)(s|m|h|d|w)$/);
    if (!match) return null;
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * Create giveaway embed
 */
function createGiveawayEmbed(giveaway, ended = false) {
    const embed = new EmbedBuilder()
        .setTitle(ended ? 'GIVEAWAY ENDED' : 'GIVEAWAY')
        .setColor(ended ? 0x808080 : 0xFFD700)
        .setDescription(`**${giveaway.prize}**${giveaway.description ? `\n\n${giveaway.description}` : ''}`)
        .addFields(
            { name: 'Hosted by', value: `<@${giveaway.hostId}>`, inline: true },
            { name: 'Winners', value: `${giveaway.winners}`, inline: true }
        )
        .setFooter({ text: ended ? 'Giveaway ended' : 'Click the button to enter!' })
        .setTimestamp(giveaway.endsAt);

    if (giveaway.requiredRole) {
        embed.addFields({ name: 'Required Role', value: `<@&${giveaway.requiredRole}>`, inline: true });
    }

    if (!ended) {
        embed.addFields({ 
            name: 'Ends', 
            value: `<t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:R>`, 
            inline: true 
        });
        embed.addFields({
            name: 'Entries',
            value: `${giveaway.participants?.length || 0}`,
            inline: true
        });
    }

    if (ended && giveaway.winnerIds?.length > 0) {
        const winnerMentions = giveaway.winnerIds.map(id => `<@${id}>`).join(', ');
        embed.addFields({ name: 'Winner(s)', value: winnerMentions, inline: false });
    } else if (ended) {
        embed.addFields({ name: 'Winner(s)', value: 'No valid entries', inline: false });
    }

    return embed;
}

/**
 * Create giveaway button row
 */
function createGiveawayButtons(giveawayId, ended = false) {
    const row = new ActionRowBuilder();
    
    if (!ended) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`giveaway_enter_${giveawayId}`)
                .setLabel('Enter Giveaway')
                .setStyle(ButtonStyle.Success)
        );
    }
    
    return row;
}

/**
 * Pick random winners from participants
 * Handles bonus entries (userId_bonus) by mapping back to real user IDs
 */
function pickWinners(participants, count) {
    if (participants.length === 0) return [];
    if (participants.length <= count) {
        // Deduplicate - bonus entries should map to same user
        const uniqueUsers = [...new Set(participants.map(p => p.replace('_bonus', '')))];
        return uniqueUsers.slice(0, count);
    }
    
    const winners = [];
    const available = [...participants];
    const wonUsers = new Set(); // Track users who already won (to avoid same user winning twice)
    
    while (winners.length < count && available.length > 0) {
        const index = Math.floor(Math.random() * available.length);
        const entry = available.splice(index, 1)[0];
        
        // Map bonus entry back to real user ID
        const userId = entry.replace('_bonus', '');
        
        // Only add if this user hasn't already won
        if (!wonUsers.has(userId)) {
            winners.push(userId);
            wonUsers.add(userId);
            
            // Also remove any other entries from this user (bonus or regular)
            for (let i = available.length - 1; i >= 0; i--) {
                if (available[i].replace('_bonus', '') === userId) {
                    available.splice(i, 1);
                }
            }
        }
    }
    
    return winners;
}

/**
 * End a giveaway and announce winners
 */
async function endGiveaway(client, giveaway) {
    try {
        const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel) return;

        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (!message) return;

        // Pick winners
        const winners = pickWinners(giveaway.participants || [], giveaway.winners);
        
        // Update database
        await Giveaway.findByIdAndUpdate(giveaway._id, {
            ended: true,
            winnerIds: winners
        });

        giveaway.ended = true;
        giveaway.winnerIds = winners;

        // Update the giveaway message
        const embed = createGiveawayEmbed(giveaway, true);
        await message.edit({ 
            embeds: [embed], 
            components: [] // Remove buttons
        });

        // Announce winners
        if (winners.length > 0) {
            const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
            await channel.send({
                content: `Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`,
                allowedMentions: { users: winners }
            });
        } else {
            await channel.send({
                content: `The giveaway for **${giveaway.prize}** ended with no valid entries.`
            });
        }
    } catch (e) {
        console.error('[Giveaways] Failed to end giveaway:', e);
    }
}

/**
 * Check and end expired giveaways
 */
async function checkGiveaways(client) {
    try {
        const expiredGiveaways = await Giveaway.find({
            ended: false,
            endsAt: { $lte: new Date() }
        });

        for (const giveaway of expiredGiveaways) {
            await endGiveaway(client, giveaway);
        }
    } catch (e) {
        console.error('[Giveaways] Error checking giveaways:', e);
    }
}

/**
 * Initialize giveaway checker interval
 */
function initGiveawayChecker(client) {
    // Check every 10 seconds
    giveawayInterval = setInterval(() => checkGiveaways(client), 10000);
    console.log('[Giveaways] Giveaway checker initialized');
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('giveaway')
            .setDescription('Manage giveaways (Owner only)')
            .addSubcommand(sub => sub
                .setName('start')
                .setDescription('Start a new giveaway')
                .addStringOption(opt => opt
                    .setName('duration')
                    .setDescription('Duration (e.g., 30s, 5m, 1h, 2d, 1w)')
                    .setRequired(true))
                .addStringOption(opt => opt
                    .setName('prize')
                    .setDescription('What are you giving away?')
                    .setRequired(true))
                .addIntegerOption(opt => opt
                    .setName('winners')
                    .setDescription('Number of winners (default: 1)')
                    .setMinValue(1)
                    .setMaxValue(20)
                    .setRequired(false))
                .addChannelOption(opt => opt
                    .setName('channel')
                    .setDescription('Channel to host giveaway (default: current)')
                    .setRequired(false))
                .addStringOption(opt => opt
                    .setName('description')
                    .setDescription('Additional description')
                    .setRequired(false))
                .addRoleOption(opt => opt
                    .setName('required_role')
                    .setDescription('Role required to enter')
                    .setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('end')
                .setDescription('End a giveaway early')
                .addStringOption(opt => opt
                    .setName('message_id')
                    .setDescription('Message ID of the giveaway')
                    .setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('reroll')
                .setDescription('Reroll winners for an ended giveaway')
                .addStringOption(opt => opt
                    .setName('message_id')
                    .setDescription('Message ID of the giveaway')
                    .setRequired(true))
                .addIntegerOption(opt => opt
                    .setName('winners')
                    .setDescription('Number of new winners to pick')
                    .setMinValue(1)
                    .setMaxValue(20)
                    .setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List all active giveaways')
            )
            .addSubcommand(sub => sub
                .setName('delete')
                .setDescription('Delete a giveaway completely')
                .addStringOption(opt => opt
                    .setName('message_id')
                    .setDescription('Message ID of the giveaway')
                    .setRequired(true))
            ),

        async execute(interaction, client) {
            // Owner only check
            if (!isOwner(interaction.member)) {
                return interaction.reply({ 
                    content: 'Only the server owner can manage giveaways.', 
                    ephemeral: true 
                });
            }

            const sub = interaction.options.getSubcommand();

            // START GIVEAWAY
            if (sub === 'start') {
                const durationStr = interaction.options.getString('duration');
                const prize = interaction.options.getString('prize');
                const winners = interaction.options.getInteger('winners') || 1;
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                const description = interaction.options.getString('description');
                const requiredRole = interaction.options.getRole('required_role');

                const duration = parseDuration(durationStr);
                if (!duration) {
                    return interaction.reply({ 
                        content: 'Invalid duration format. Use: 30s, 5m, 1h, 2d, or 1w', 
                        ephemeral: true 
                    });
                }

                if (duration < 10000) {
                    return interaction.reply({ 
                        content: 'Duration must be at least 10 seconds.', 
                        ephemeral: true 
                    });
                }

                if (duration > 30 * 24 * 60 * 60 * 1000) {
                    return interaction.reply({ 
                        content: 'Duration cannot exceed 30 days.', 
                        ephemeral: true 
                    });
                }

                await interaction.deferReply({ ephemeral: true });

                const endsAt = new Date(Date.now() + duration);

                // Create the giveaway document first
                const giveawayDoc = new Giveaway({
                    guildId: interaction.guild.id,
                    channelId: channel.id,
                    messageId: 'pending',
                    hostId: interaction.user.id,
                    prize,
                    description,
                    winners,
                    endsAt,
                    requiredRole: requiredRole?.id || null,
                    participants: []
                });

                await giveawayDoc.save();

                // Create and send the giveaway message
                const embed = createGiveawayEmbed(giveawayDoc);
                const buttons = createGiveawayButtons(giveawayDoc._id.toString());

                try {
                    const giveawayMsg = await channel.send({ 
                        embeds: [embed], 
                        components: [buttons] 
                    });

                    // Update with actual message ID
                    giveawayDoc.messageId = giveawayMsg.id;
                    await giveawayDoc.save();

                    return interaction.editReply({ 
                        content: `Giveaway started in ${channel}!\n**Prize:** ${prize}\n**Duration:** ${formatDuration(duration)}\n**Winners:** ${winners}` 
                    });
                } catch (e) {
                    await Giveaway.findByIdAndDelete(giveawayDoc._id);
                    return interaction.editReply({ content: 'Failed to create giveaway. Check bot permissions.' });
                }
            }

            // END GIVEAWAY
            if (sub === 'end') {
                const messageId = interaction.options.getString('message_id');

                await interaction.deferReply({ ephemeral: true });

                const giveaway = await Giveaway.findOne({ 
                    messageId, 
                    guildId: interaction.guild.id 
                });

                if (!giveaway) {
                    return interaction.editReply({ content: 'Giveaway not found.' });
                }

                if (giveaway.ended) {
                    return interaction.editReply({ content: 'This giveaway has already ended.' });
                }

                await endGiveaway(client, giveaway);
                return interaction.editReply({ content: 'Giveaway ended!' });
            }

            // REROLL WINNERS
            if (sub === 'reroll') {
                const messageId = interaction.options.getString('message_id');
                const newWinnerCount = interaction.options.getInteger('winners') || 1;

                await interaction.deferReply({ ephemeral: true });

                const giveaway = await Giveaway.findOne({ 
                    messageId, 
                    guildId: interaction.guild.id 
                });

                if (!giveaway) {
                    return interaction.editReply({ content: 'Giveaway not found.' });
                }

                if (!giveaway.ended) {
                    return interaction.editReply({ content: 'This giveaway hasn\'t ended yet.' });
                }

                if (!giveaway.participants || giveaway.participants.length === 0) {
                    return interaction.editReply({ content: 'No participants to reroll.' });
                }

                // Pick new winners (excluding previous winners optionally)
                const newWinners = pickWinners(giveaway.participants, newWinnerCount);

                if (newWinners.length === 0) {
                    return interaction.editReply({ content: 'No valid entries to reroll.' });
                }

                const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
                if (channel) {
                    const winnerMentions = newWinners.map(id => `<@${id}>`).join(', ');
                    await channel.send({
                        content: `**Reroll!** New winner(s): ${winnerMentions}! You won **${giveaway.prize}**!`,
                        allowedMentions: { users: newWinners }
                    });
                }

                return interaction.editReply({ content: `Rerolled ${newWinners.length} new winner(s)!` });
            }

            // LIST GIVEAWAYS
            if (sub === 'list') {
                const giveaways = await Giveaway.find({ 
                    guildId: interaction.guild.id,
                    ended: false 
                }).sort({ endsAt: 1 });

                if (giveaways.length === 0) {
                    return interaction.reply({ content: 'No active giveaways.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle('Active Giveaways')
                    .setColor(0xFFD700)
                    .setTimestamp();

                for (const g of giveaways.slice(0, 10)) {
                    embed.addFields({
                        name: g.prize,
                        value: `**Channel:** <#${g.channelId}>\n**Ends:** <t:${Math.floor(g.endsAt.getTime() / 1000)}:R>\n**Entries:** ${g.participants?.length || 0}\n**Message ID:** \`${g.messageId}\``,
                        inline: false
                    });
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // DELETE GIVEAWAY
            if (sub === 'delete') {
                const messageId = interaction.options.getString('message_id');

                await interaction.deferReply({ ephemeral: true });

                const giveaway = await Giveaway.findOneAndDelete({ 
                    messageId, 
                    guildId: interaction.guild.id 
                });

                if (!giveaway) {
                    return interaction.editReply({ content: 'Giveaway not found.' });
                }

                // Try to delete the message
                try {
                    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
                    if (channel) {
                        const message = await channel.messages.fetch(messageId).catch(() => null);
                        if (message) await message.delete();
                    }
                } catch (e) {
                    // Ignore deletion errors
                }

                return interaction.editReply({ content: 'Giveaway deleted.' });
            }
        }
    }
];

/**
 * Handle giveaway button clicks
 */
async function handleGiveawayButton(interaction, client) {
    if (!interaction.customId.startsWith('giveaway_enter_')) return;

    const giveawayId = interaction.customId.replace('giveaway_enter_', '');

    try {
        const giveaway = await Giveaway.findById(giveawayId);

        if (!giveaway) {
            return interaction.reply({ content: 'This giveaway no longer exists.', ephemeral: true });
        }

        if (giveaway.ended) {
            return interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
        }

        // Check required role
        if (giveaway.requiredRole) {
            const member = interaction.member;
            if (!member.roles.cache.has(giveaway.requiredRole)) {
                return interaction.reply({ 
                    content: `You need <@&${giveaway.requiredRole}> to enter this giveaway.`, 
                    ephemeral: true 
                });
            }
        }

        const userId = interaction.user.id;
        const member = interaction.member;
        const isPremium = member && member.roles && member.roles.cache.has(PREMIUM_ROLE_ID);
        
        // Check if user already entered (check for their base entry)
        const alreadyEntered = giveaway.participants?.includes(userId);

        if (alreadyEntered) {
            // Remove all entries for this user (including bonus entries)
            const entriesToRemove = isPremium ? [userId, `${userId}_bonus`] : [userId];
            await Giveaway.findByIdAndUpdate(giveawayId, {
                $pull: { participants: { $in: entriesToRemove } }
            });

            // Update embed with new count
            const updatedGiveaway = await Giveaway.findById(giveawayId);
            const embed = createGiveawayEmbed(updatedGiveaway);
            const buttons = createGiveawayButtons(giveawayId);
            await interaction.message.edit({ embeds: [embed], components: [buttons] });

            return interaction.reply({ 
                content: 'You\'ve left the giveaway.', 
                ephemeral: true 
            });
        } else {
            // Add entry (premium members get double entries)
            const entries = isPremium ? [userId, `${userId}_bonus`] : [userId];
            await Giveaway.findByIdAndUpdate(giveawayId, {
                $addToSet: { participants: { $each: entries } }
            });

            // Update embed with new count
            const updatedGiveaway = await Giveaway.findById(giveawayId);
            const embed = createGiveawayEmbed(updatedGiveaway);
            const buttons = createGiveawayButtons(giveawayId);
            await interaction.message.edit({ embeds: [embed], components: [buttons] });

            const premiumBonus = isPremium ? '\n\n**NewLife+ Bonus** — You have **2x entries**!' : '';
            return interaction.reply({ 
                content: `You're in! Good luck!${premiumBonus}`, 
                ephemeral: true 
            });
        }
    } catch (e) {
        console.error('[Giveaways] Button error:', e);
        return interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

function stopGiveawayChecker() {
    if (giveawayInterval) {
        clearInterval(giveawayInterval);
        giveawayInterval = null;
    }
}

module.exports = {
    name: 'Giveaways',
    slashCommands,
    handleGiveawayButton,
    initGiveawayChecker,
    stopGiveawayChecker
};
