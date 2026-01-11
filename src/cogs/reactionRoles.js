/**
 * Reaction Roles Cog
 * Self-assignable roles via emoji reactions
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ReactionRole = require('../database/models/ReactionRole');
const { isAdmin } = require('../utils/permissions');

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('reactionroles')
            .setDescription('Manage reaction roles')
            .addSubcommand(sub => sub
                .setName('create')
                .setDescription('Create a new reaction role message')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel to send message').setRequired(true))
                .addStringOption(opt => opt.setName('title').setDescription('Embed title').setRequired(true))
                .addStringOption(opt => opt.setName('description').setDescription('Embed description').setRequired(false))
                .addStringOption(opt => opt.setName('color').setDescription('Embed color (hex)').setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('Add a role to a message (any message)')
                .addStringOption(opt => opt.setName('messageid').setDescription('Message ID').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('Role to add').setRequired(true))
                .addStringOption(opt => opt.setName('emoji').setDescription('Emoji for this role').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('remove')
                .setDescription('Remove a role from a reaction role message')
                .addStringOption(opt => opt.setName('messageid').setDescription('Message ID').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('Role to remove').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List all reaction role messages')
            )
            .addSubcommand(sub => sub
                .setName('delete')
                .setDescription('Delete a reaction role setup')
                .addStringOption(opt => opt.setName('messageid').setDescription('Message ID').setRequired(true))
            ),

        async execute(interaction, client) {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: 'Permission denied.', ephemeral: true });
            }

            const sub = interaction.options.getSubcommand();

            if (sub === 'create') {
                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title');
                const description = interaction.options.getString('description') || 'React below to get/remove a role!';
                const color = interaction.options.getString('color') || '#3b82f6';

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(color)
                    .setFooter({ text: 'React to toggle a role' });

                try {
                    const message = await channel.send({ embeds: [embed] });
                    
                    return interaction.reply({
                        content: `Reaction role message created!\n**Message ID:** \`${message.id}\`\n\nNow use \`/reactionroles add\` to add roles.`,
                        ephemeral: true
                    });
                } catch (error) {
                    return interaction.reply({ content: 'Failed to send message. Check channel permissions.', ephemeral: true });
                }
            }

            if (sub === 'add') {
                const messageId = interaction.options.getString('messageid');
                const role = interaction.options.getRole('role');
                const emoji = interaction.options.getString('emoji').trim();

                await interaction.deferReply({ ephemeral: true });

                // Check if role already exists for this message
                const existing = await ReactionRole.findOne({ messageId, roleId: role.id });
                if (existing) {
                    return interaction.editReply({ content: 'This role is already added to this message.' });
                }

                // Count existing roles for this message
                const count = await ReactionRole.countDocuments({ messageId });
                if (count >= 20) {
                    return interaction.editReply({ content: 'Maximum 20 roles per message (Discord reaction limit).' });
                }

                // Find the message
                let message = null;
                let foundChannel = null;
                for (const [, chan] of interaction.guild.channels.cache) {
                    if (chan.isTextBased()) {
                        try {
                            message = await chan.messages.fetch(messageId);
                            if (message) {
                                foundChannel = chan;
                                break;
                            }
                        } catch (e) {}
                    }
                }

                if (!message) {
                    return interaction.editReply({ content: 'Message not found.' });
                }

                // Add the reaction to the message
                try {
                    await message.react(emoji);
                } catch (e) {
                    return interaction.editReply({ content: `Failed to add reaction. Make sure the emoji is valid and I have permission to react.\nError: ${e.message}` });
                }

                // Save to database
                const reactionRole = new ReactionRole({
                    guildId: interaction.guild.id,
                    channelId: foundChannel.id,
                    messageId,
                    emoji: emoji,
                    roleId: role.id
                });
                await reactionRole.save();

                return interaction.editReply({
                    content: `Added ${emoji} reaction for **${role.name}** role.`
                });
            }

            if (sub === 'remove') {
                const messageId = interaction.options.getString('messageid');
                const role = interaction.options.getRole('role');

                await interaction.deferReply({ ephemeral: true });

                const reactionRole = await ReactionRole.findOne({ messageId, roleId: role.id });
                if (!reactionRole) {
                    return interaction.editReply({ content: 'Role not found on this message.' });
                }

                // Find the message and remove bot's reaction
                try {
                    for (const [, chan] of interaction.guild.channels.cache) {
                        if (chan.isTextBased()) {
                            try {
                                const message = await chan.messages.fetch(messageId);
                                if (message) {
                                    // Try to remove the bot's reaction
                                    const reaction = message.reactions.cache.find(r => 
                                        r.emoji.toString() === reactionRole.emoji || 
                                        r.emoji.name === reactionRole.emoji ||
                                        r.emoji.id === reactionRole.emoji.match(/<a?:\w+:(\d+)>/)?.[1]
                                    );
                                    if (reaction) {
                                        await reaction.users.remove(interaction.client.user.id).catch(() => {});
                                    }
                                    break;
                                }
                            } catch (e) {}
                        }
                    }
                } catch (e) {}

                await ReactionRole.deleteOne({ _id: reactionRole._id });
                return interaction.editReply({ content: `Removed **${role.name}** from reaction roles.` });
            }

            if (sub === 'list') {
                await interaction.deferReply({ ephemeral: true });

                const allRoles = await ReactionRole.find({ guildId: interaction.guild.id });
                
                if (allRoles.length === 0) {
                    return interaction.editReply({ content: 'No reaction roles configured.' });
                }

                // Group by message
                const grouped = {};
                for (const rr of allRoles) {
                    if (!grouped[rr.messageId]) {
                        grouped[rr.messageId] = [];
                    }
                    grouped[rr.messageId].push(rr);
                }

                const embed = new EmbedBuilder()
                    .setTitle('Reaction Roles')
                    .setColor('#3b82f6');

                for (const [msgId, roles] of Object.entries(grouped)) {
                    const roleList = roles.map(r => {
                        const role = interaction.guild.roles.cache.get(r.roleId);
                        return `${r.emoji} → ${role ? role.name : 'Deleted Role'}`;
                    }).join('\n');

                    embed.addFields({
                        name: `Message: ${msgId}`,
                        value: roleList || 'No roles',
                        inline: false
                    });
                }

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'delete') {
                const messageId = interaction.options.getString('messageid');

                await interaction.deferReply({ ephemeral: true });

                const result = await ReactionRole.deleteMany({ messageId, guildId: interaction.guild.id });
                
                if (result.deletedCount === 0) {
                    return interaction.editReply({ content: 'No reaction roles found for this message.' });
                }

                return interaction.editReply({ content: `Deleted ${result.deletedCount} reaction role(s) from message.` });
            }
        }
    }
];

/**
 * Handle reaction add for reaction roles
 */
async function handleReactionAdd(reaction, user, client) {
    if (user.bot) return;

    // Fetch partial if needed
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (e) {
            return;
        }
    }

    const emojiKey = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const emojiKeyAnimated = reaction.emoji.id ? `<a:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;

    // Check if this is a reaction role
    const reactionRole = await ReactionRole.findOne({
        messageId: reaction.message.id,
        $or: [
            { emoji: emojiKey },
            { emoji: emojiKeyAnimated },
            { emoji: reaction.emoji.name },
            { emoji: reaction.emoji.toString() }
        ]
    });

    if (!reactionRole) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const role = guild.roles.cache.get(reactionRole.roleId);
    if (!role) return;

    // Check role hierarchy
    if (role.position >= guild.members.me.roles.highest.position) {
        return;
    }

    try {
        if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role);
        }
    } catch (e) {
        console.error('[ReactionRoles] Failed to add role:', e);
    }
}

/**
 * Handle reaction remove for reaction roles
 */
async function handleReactionRemove(reaction, user, client) {
    if (user.bot) return;

    // Fetch partial if needed
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (e) {
            return;
        }
    }

    const emojiKey = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const emojiKeyAnimated = reaction.emoji.id ? `<a:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;

    // Check if this is a reaction role
    const reactionRole = await ReactionRole.findOne({
        messageId: reaction.message.id,
        $or: [
            { emoji: emojiKey },
            { emoji: emojiKeyAnimated },
            { emoji: reaction.emoji.name },
            { emoji: reaction.emoji.toString() }
        ]
    });

    if (!reactionRole) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const role = guild.roles.cache.get(reactionRole.roleId);
    if (!role) return;

    // Check role hierarchy
    if (role.position >= guild.members.me.roles.highest.position) {
        return;
    }

    try {
        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
        }
    } catch (e) {
        console.error('[ReactionRoles] Failed to remove role:', e);
    }
}

module.exports = {
    name: 'ReactionRoles',
    slashCommands,
    handleReactionAdd,
    handleReactionRemove
};
