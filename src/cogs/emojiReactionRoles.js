/**
 * Emoji Reaction Roles Cog
 * Allows admins to add emoji reactions to messages that grant roles when clicked
 * Persistent - roles are stored in database and restored on bot restart
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const { isAdmin } = require('../utils/permissions');

// Schema for emoji reaction roles (separate from button-based reaction roles)
const emojiReactionRoleSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    emoji: { type: String, required: true }, // Unicode emoji or custom emoji string (e.g., <:name:id>)
    roleId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String }
});

// Compound index for quick lookups
emojiReactionRoleSchema.index({ messageId: 1, emoji: 1 }, { unique: true });
emojiReactionRoleSchema.index({ guildId: 1 });

const EmojiReactionRole = mongoose.models.EmojiReactionRole || mongoose.model('EmojiReactionRole', emojiReactionRoleSchema);

/**
 * Normalize emoji for consistent storage and comparison
 * Handles both unicode emojis and custom Discord emojis
 */
function normalizeEmoji(emoji) {
    // If it's a custom emoji in format <:name:id> or <a:name:id>
    const customMatch = emoji.match(/<a?:(\w+):(\d+)>/);
    if (customMatch) {
        return emoji; // Keep full custom emoji format
    }
    // For unicode emojis, just return as-is
    return emoji.trim();
}

/**
 * Compare emojis (handles both unicode and custom)
 */
function emojisMatch(emoji1, emoji2) {
    const norm1 = normalizeEmoji(emoji1);
    const norm2 = normalizeEmoji(emoji2);
    
    // For custom emojis, compare IDs
    const match1 = norm1.match(/<a?:\w+:(\d+)>/);
    const match2 = norm2.match(/<a?:\w+:(\d+)>/);
    
    if (match1 && match2) {
        return match1[1] === match2[1];
    }
    
    // If one is custom and one is unicode, they don't match
    if (match1 || match2) {
        // Check if emoji2 is just the ID (from reaction events)
        if (match1 && emoji2 === match1[1]) return true;
        if (match2 && emoji1 === match2[1]) return true;
        return false;
    }
    
    return norm1 === norm2;
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('emojirole')
            .setDescription('Manage emoji-based reaction roles')
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('Add an emoji reaction role to a message')
                .addStringOption(opt => opt
                    .setName('messageid')
                    .setDescription('The ID of the message to add the reaction to')
                    .setRequired(true))
                .addStringOption(opt => opt
                    .setName('emoji')
                    .setDescription('The emoji to react with')
                    .setRequired(true))
                .addRoleOption(opt => opt
                    .setName('role')
                    .setDescription('The role to assign when users react')
                    .setRequired(true))
                .addChannelOption(opt => opt
                    .setName('channel')
                    .setDescription('The channel containing the message (optional if in same channel)')
                    .setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('remove')
                .setDescription('Remove an emoji reaction role from a message')
                .addStringOption(opt => opt
                    .setName('messageid')
                    .setDescription('The ID of the message')
                    .setRequired(true))
                .addStringOption(opt => opt
                    .setName('emoji')
                    .setDescription('The emoji to remove')
                    .setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List all emoji reaction roles in this server')
            )
            .addSubcommand(sub => sub
                .setName('clear')
                .setDescription('Remove all emoji reaction roles from a message')
                .addStringOption(opt => opt
                    .setName('messageid')
                    .setDescription('The ID of the message to clear')
                    .setRequired(true))
            ),

        async execute(interaction, client) {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Permission denied. Admin only.', ephemeral: true });
            }

            const sub = interaction.options.getSubcommand();

            if (sub === 'add') {
                const messageId = interaction.options.getString('messageid');
                const emoji = interaction.options.getString('emoji');
                const role = interaction.options.getRole('role');
                const channelOption = interaction.options.getChannel('channel');

                await interaction.deferReply({ ephemeral: true });

                // Find the message
                let message = null;
                let targetChannel = channelOption || interaction.channel;

                try {
                    message = await targetChannel.messages.fetch(messageId);
                } catch (e) {
                    // If not found in specified/current channel, search all channels
                    if (!channelOption) {
                        for (const [, chan] of interaction.guild.channels.cache) {
                            if (chan.isTextBased()) {
                                try {
                                    message = await chan.messages.fetch(messageId);
                                    if (message) {
                                        targetChannel = chan;
                                        break;
                                    }
                                } catch (err) {
                                    // Continue searching
                                }
                            }
                        }
                    }
                }

                if (!message) {
                    return interaction.editReply({ content: '❌ Message not found. Make sure the message ID is correct and the bot has access to the channel.' });
                }

                // Check if this emoji-role combination already exists
                const normalizedEmoji = normalizeEmoji(emoji);
                const existing = await EmojiReactionRole.findOne({ 
                    messageId, 
                    emoji: normalizedEmoji 
                });

                if (existing) {
                    return interaction.editReply({ content: '❌ This emoji is already set up on this message.' });
                }

                // Check bot permissions
                if (role.position >= interaction.guild.members.me.roles.highest.position) {
                    return interaction.editReply({ content: '❌ I cannot assign this role because it\'s higher than or equal to my highest role.' });
                }

                // Add the reaction to the message
                try {
                    await message.react(emoji);
                } catch (e) {
                    return interaction.editReply({ content: `❌ Failed to add reaction. Make sure the emoji is valid and I have permission to add reactions in that channel.` });
                }

                // Save to database
                await EmojiReactionRole.create({
                    guildId: interaction.guild.id,
                    channelId: targetChannel.id,
                    messageId,
                    emoji: normalizedEmoji,
                    roleId: role.id,
                    createdBy: interaction.user.id
                });

                const embed = new EmbedBuilder()
                    .setColor(0x6BCB77)
                    .setTitle('✅ Emoji Reaction Role Added')
                    .addFields(
                        { name: 'Message', value: `[Jump to message](${message.url})`, inline: true },
                        { name: 'Emoji', value: emoji, inline: true },
                        { name: 'Role', value: `<@&${role.id}>`, inline: true }
                    )
                    .setFooter({ text: 'Users can now react to get the role!' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'remove') {
                const messageId = interaction.options.getString('messageid');
                const emoji = interaction.options.getString('emoji');

                await interaction.deferReply({ ephemeral: true });

                const normalizedEmoji = normalizeEmoji(emoji);
                
                // Find and delete the reaction role
                const deleted = await EmojiReactionRole.findOneAndDelete({
                    guildId: interaction.guild.id,
                    messageId,
                    emoji: normalizedEmoji
                });

                if (!deleted) {
                    return interaction.editReply({ content: '❌ No reaction role found with that emoji on that message.' });
                }

                // Try to remove the bot's reaction from the message
                try {
                    const channel = await interaction.guild.channels.fetch(deleted.channelId).catch(() => null);
                    if (channel) {
                        const message = await channel.messages.fetch(messageId).catch(() => null);
                        if (message) {
                            const reaction = message.reactions.cache.find(r => {
                                if (r.emoji.id) {
                                    return normalizedEmoji.includes(r.emoji.id);
                                }
                                return r.emoji.name === normalizedEmoji;
                            });
                            if (reaction) {
                                await reaction.users.remove(interaction.client.user.id);
                            }
                        }
                    }
                } catch (e) {
                    // Ignore errors removing reaction
                }

                return interaction.editReply({ content: `✅ Removed reaction role: ${emoji} → <@&${deleted.roleId}>` });
            }

            if (sub === 'list') {
                const reactionRoles = await EmojiReactionRole.find({ guildId: interaction.guild.id });

                if (reactionRoles.length === 0) {
                    return interaction.reply({ content: 'No emoji reaction roles set up in this server.', ephemeral: true });
                }

                // Group by message
                const byMessage = {};
                for (const rr of reactionRoles) {
                    if (!byMessage[rr.messageId]) {
                        byMessage[rr.messageId] = {
                            channelId: rr.channelId,
                            roles: []
                        };
                    }
                    byMessage[rr.messageId].roles.push({ emoji: rr.emoji, roleId: rr.roleId });
                }

                const embed = new EmbedBuilder()
                    .setColor(0x3b82f6)
                    .setTitle('📋 Emoji Reaction Roles')
                    .setFooter({ text: `Total: ${reactionRoles.length} reaction role(s)` })
                    .setTimestamp();

                let count = 0;
                for (const [msgId, data] of Object.entries(byMessage)) {
                    if (count >= 25) break; // Discord embed field limit
                    
                    const roleList = data.roles.map(r => `${r.emoji} → <@&${r.roleId}>`).join('\n');
                    embed.addFields({
                        name: `Message \`${msgId}\``,
                        value: `Channel: <#${data.channelId}>\n${roleList}`,
                        inline: false
                    });
                    count++;
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (sub === 'clear') {
                const messageId = interaction.options.getString('messageid');

                await interaction.deferReply({ ephemeral: true });

                const deleted = await EmojiReactionRole.deleteMany({
                    guildId: interaction.guild.id,
                    messageId
                });

                if (deleted.deletedCount === 0) {
                    return interaction.editReply({ content: '❌ No reaction roles found on that message.' });
                }

                return interaction.editReply({ content: `✅ Removed ${deleted.deletedCount} reaction role(s) from the message.` });
            }
        }
    }
];

/**
 * Handle reaction add event
 * Called when a user adds a reaction to a message
 */
async function handleReactionAdd(reaction, user, client) {
    if (user.bot) return;

    // Handle partial reactions
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (e) {
            console.error('[EmojiReactionRoles] Failed to fetch partial reaction:', e);
            return;
        }
    }

    const { message } = reaction;
    if (!message.guild) return;

    // Get the emoji identifier
    let emojiKey = reaction.emoji.id 
        ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;

    // Find matching reaction role
    const reactionRole = await EmojiReactionRole.findOne({
        messageId: message.id,
        guildId: message.guild.id
    });

    if (!reactionRole) return;

    // Check if the emoji matches
    if (!emojisMatch(reactionRole.emoji, emojiKey) && !emojisMatch(reactionRole.emoji, reaction.emoji.name) && !emojisMatch(reactionRole.emoji, reaction.emoji.id || '')) {
        // Check all reaction roles for this message
        const allRoles = await EmojiReactionRole.find({
            messageId: message.id,
            guildId: message.guild.id
        });

        const matchingRole = allRoles.find(rr => 
            emojisMatch(rr.emoji, emojiKey) || 
            emojisMatch(rr.emoji, reaction.emoji.name) ||
            emojisMatch(rr.emoji, reaction.emoji.id || '')
        );

        if (!matchingRole) return;

        // Add the role
        try {
            const member = await message.guild.members.fetch(user.id);
            if (!member.roles.cache.has(matchingRole.roleId)) {
                await member.roles.add(matchingRole.roleId, 'Reaction role');
            }
        } catch (e) {
            console.error('[EmojiReactionRoles] Failed to add role:', e);
        }
        return;
    }

    // Add the role
    try {
        const member = await message.guild.members.fetch(user.id);
        if (!member.roles.cache.has(reactionRole.roleId)) {
            await member.roles.add(reactionRole.roleId, 'Reaction role');
        }
    } catch (e) {
        console.error('[EmojiReactionRoles] Failed to add role:', e);
    }
}

/**
 * Handle reaction remove event
 * Called when a user removes a reaction from a message
 */
async function handleReactionRemove(reaction, user, client) {
    if (user.bot) return;

    // Handle partial reactions
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (e) {
            console.error('[EmojiReactionRoles] Failed to fetch partial reaction:', e);
            return;
        }
    }

    const { message } = reaction;
    if (!message.guild) return;

    // Get the emoji identifier
    let emojiKey = reaction.emoji.id 
        ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;

    // Find all reaction roles for this message
    const allRoles = await EmojiReactionRole.find({
        messageId: message.id,
        guildId: message.guild.id
    });

    if (allRoles.length === 0) return;

    const matchingRole = allRoles.find(rr => 
        emojisMatch(rr.emoji, emojiKey) || 
        emojisMatch(rr.emoji, reaction.emoji.name) ||
        emojisMatch(rr.emoji, reaction.emoji.id || '')
    );

    if (!matchingRole) return;

    // Remove the role
    try {
        const member = await message.guild.members.fetch(user.id);
        if (member.roles.cache.has(matchingRole.roleId)) {
            await member.roles.remove(matchingRole.roleId, 'Reaction role removed');
        }
    } catch (e) {
        console.error('[EmojiReactionRoles] Failed to remove role:', e);
    }
}

/**
 * Restore reactions on bot startup
 * Re-adds bot reactions to messages that have reaction roles
 */
async function restoreReactions(client) {
    try {
        const allReactionRoles = await EmojiReactionRole.find({});
        
        // Group by message
        const byMessage = {};
        for (const rr of allReactionRoles) {
            if (!byMessage[rr.messageId]) {
                byMessage[rr.messageId] = {
                    guildId: rr.guildId,
                    channelId: rr.channelId,
                    emojis: []
                };
            }
            byMessage[rr.messageId].emojis.push(rr.emoji);
        }

        let restored = 0;
        for (const [messageId, data] of Object.entries(byMessage)) {
            try {
                const guild = await client.guilds.fetch(data.guildId).catch(() => null);
                if (!guild) continue;

                const channel = await guild.channels.fetch(data.channelId).catch(() => null);
                if (!channel || !channel.isTextBased()) continue;

                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (!message) continue;

                for (const emoji of data.emojis) {
                    try {
                        // Check if bot already reacted
                        const existingReaction = message.reactions.cache.find(r => {
                            if (r.emoji.id) {
                                return emoji.includes(r.emoji.id);
                            }
                            return r.emoji.name === emoji;
                        });

                        if (!existingReaction || !existingReaction.me) {
                            await message.react(emoji);
                            restored++;
                        }
                    } catch (e) {
                        // Emoji might be invalid or bot lacks permissions
                    }
                }
            } catch (e) {
                // Continue with next message
            }
        }

        if (restored > 0) {
            console.log(`[EmojiReactionRoles] Restored ${restored} reaction(s)`);
        }
    } catch (e) {
        console.error('[EmojiReactionRoles] Failed to restore reactions:', e);
    }
}

module.exports = {
    name: 'EmojiReactionRoles',
    slashCommands,
    handleReactionAdd,
    handleReactionRemove,
    restoreReactions
};
