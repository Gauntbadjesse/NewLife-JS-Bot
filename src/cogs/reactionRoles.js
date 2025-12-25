/**
 * Reaction Roles Cog
 * Self-assignable roles via reactions or buttons
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
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
                .setDescription('Add a role to an existing reaction role message')
                .addStringOption(opt => opt.setName('messageid').setDescription('Message ID').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('Role to add').setRequired(true))
                .addStringOption(opt => opt.setName('emoji').setDescription('Emoji for this role').setRequired(true))
                .addStringOption(opt => opt.setName('label').setDescription('Button label (optional)').setRequired(false))
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
            )
            .addSubcommand(sub => sub
                .setName('refresh')
                .setDescription('Refresh buttons on a reaction role message')
                .addStringOption(opt => opt.setName('messageid').setDescription('Message ID').setRequired(true))
            ),

        async execute(interaction, client) {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Permission denied.', ephemeral: true });
            }

            const sub = interaction.options.getSubcommand();

            if (sub === 'create') {
                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title');
                const description = interaction.options.getString('description') || 'Click a button below to get/remove a role!';
                const color = interaction.options.getString('color') || '#3b82f6';

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(color)
                    .setFooter({ text: 'Click a button to toggle a role' });

                try {
                    const message = await channel.send({ embeds: [embed] });
                    
                    return interaction.reply({
                        content: `✅ Reaction role message created!\n**Message ID:** \`${message.id}\`\n\nNow use \`/reactionroles add\` to add roles.`,
                        ephemeral: true
                    });
                } catch (error) {
                    return interaction.reply({ content: '❌ Failed to send message. Check channel permissions.', ephemeral: true });
                }
            }

            if (sub === 'add') {
                const messageId = interaction.options.getString('messageid');
                const role = interaction.options.getRole('role');
                const emoji = interaction.options.getString('emoji');
                const label = interaction.options.getString('label') || role.name;

                await interaction.deferReply({ ephemeral: true });

                // Check if role already exists for this message
                const existing = await ReactionRole.findOne({ messageId, roleId: role.id });
                if (existing) {
                    return interaction.editReply({ content: '❌ This role is already added to this message.' });
                }

                // Count existing roles for this message
                const count = await ReactionRole.countDocuments({ messageId });
                if (count >= 25) {
                    return interaction.editReply({ content: '❌ Maximum 25 roles per message.' });
                }

                // Find the message
                let message = null;
                for (const [, chan] of interaction.guild.channels.cache) {
                    if (chan.isTextBased()) {
                        try {
                            message = await chan.messages.fetch(messageId);
                            if (message) break;
                        } catch (e) {}
                    }
                }

                if (!message) {
                    return interaction.editReply({ content: '❌ Message not found.' });
                }

                // Save to database
                const reactionRole = new ReactionRole({
                    guildId: interaction.guild.id,
                    channelId: message.channel.id,
                    messageId,
                    emoji: emoji.trim(),
                    roleId: role.id,
                    description: label
                });
                await reactionRole.save();

                // Update message with buttons
                await updateReactionRoleMessage(message, interaction.guild.id);

                return interaction.editReply({
                    content: `✅ Added **${role.name}** with ${emoji} to the reaction role message.`
                });
            }

            if (sub === 'remove') {
                const messageId = interaction.options.getString('messageid');
                const role = interaction.options.getRole('role');

                await interaction.deferReply({ ephemeral: true });

                const result = await ReactionRole.deleteOne({ messageId, roleId: role.id });
                if (result.deletedCount === 0) {
                    return interaction.editReply({ content: '❌ Role not found on this message.' });
                }

                // Find and update the message
                let message = null;
                for (const [, chan] of interaction.guild.channels.cache) {
                    if (chan.isTextBased()) {
                        try {
                            message = await chan.messages.fetch(messageId);
                            if (message) break;
                        } catch (e) {}
                    }
                }

                if (message) {
                    await updateReactionRoleMessage(message, interaction.guild.id);
                }

                return interaction.editReply({ content: `✅ Removed **${role.name}** from the reaction role message.` });
            }

            if (sub === 'list') {
                const messages = await ReactionRole.aggregate([
                    { $match: { guildId: interaction.guild.id } },
                    { $group: { _id: '$messageId', channelId: { $first: '$channelId' }, roles: { $push: { roleId: '$roleId', emoji: '$emoji' } } } }
                ]);

                if (messages.length === 0) {
                    return interaction.reply({ content: '📝 No reaction role messages set up.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle('🎭 Reaction Role Messages')
                    .setColor('#3b82f6');

                for (const msg of messages.slice(0, 10)) {
                    const roleList = msg.roles.map(r => `${r.emoji} <@&${r.roleId}>`).join('\n');
                    embed.addFields({
                        name: `Message: \`${msg._id}\``,
                        value: `Channel: <#${msg.channelId}>\n${roleList}`,
                        inline: false
                    });
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (sub === 'delete') {
                const messageId = interaction.options.getString('messageid');

                const result = await ReactionRole.deleteMany({ messageId });
                
                return interaction.reply({
                    content: result.deletedCount > 0
                        ? `✅ Deleted reaction role setup (${result.deletedCount} role(s) removed).`
                        : '❌ No reaction roles found for this message.',
                    ephemeral: true
                });
            }

            if (sub === 'refresh') {
                const messageId = interaction.options.getString('messageid');

                await interaction.deferReply({ ephemeral: true });

                // Find the message
                let message = null;
                for (const [, chan] of interaction.guild.channels.cache) {
                    if (chan.isTextBased()) {
                        try {
                            message = await chan.messages.fetch(messageId);
                            if (message) break;
                        } catch (e) {}
                    }
                }

                if (!message) {
                    return interaction.editReply({ content: '❌ Message not found.' });
                }

                await updateReactionRoleMessage(message, interaction.guild.id);
                return interaction.editReply({ content: '✅ Reaction role buttons refreshed.' });
            }
        }
    }
];

/**
 * Update a reaction role message with current buttons
 */
async function updateReactionRoleMessage(message, guildId) {
    const roles = await ReactionRole.find({ messageId: message.id, guildId }).sort({ createdAt: 1 });

    if (roles.length === 0) {
        await message.edit({ components: [] });
        return;
    }

    const rows = [];
    let currentRow = new ActionRowBuilder();
    let buttonCount = 0;

    for (const role of roles) {
        // Create button for each role
        const button = new ButtonBuilder()
            .setCustomId(`rr_${role.roleId}`)
            .setStyle(ButtonStyle.Secondary);

        // Handle emoji
        const emojiMatch = role.emoji.match(/<a?:\w+:(\d+)>/);
        if (emojiMatch) {
            button.setEmoji(emojiMatch[1]);
        } else {
            button.setEmoji(role.emoji);
        }

        if (role.description) {
            button.setLabel(role.description.substring(0, 80));
        }

        currentRow.addComponents(button);
        buttonCount++;

        // Max 5 buttons per row
        if (buttonCount === 5) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
            buttonCount = 0;
        }
    }

    // Add remaining buttons
    if (buttonCount > 0) {
        rows.push(currentRow);
    }

    // Max 5 rows
    await message.edit({ components: rows.slice(0, 5) });
}

/**
 * Handle reaction role button clicks
 */
async function handleReactionRoleButton(interaction, client) {
    const roleId = interaction.customId.replace('rr_', '');

    // Verify this is a valid reaction role
    const reactionRole = await ReactionRole.findOne({
        messageId: interaction.message.id,
        roleId
    });

    if (!reactionRole) {
        return interaction.reply({ content: '❌ This reaction role no longer exists.', ephemeral: true });
    }

    const member = interaction.member;
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
        return interaction.reply({ content: '❌ Role not found.', ephemeral: true });
    }

    // Check if bot can manage this role
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return interaction.reply({ content: '❌ I cannot manage this role due to role hierarchy.', ephemeral: true });
    }

    try {
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            return interaction.reply({
                content: `✅ Removed **${role.name}** role.`,
                ephemeral: true
            });
        } else {
            await member.roles.add(roleId);
            return interaction.reply({
                content: `✅ Added **${role.name}** role.`,
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Reaction role error:', error);
        return interaction.reply({ content: '❌ Failed to update role.', ephemeral: true });
    }
}

module.exports = {
    name: 'ReactionRoles',
    slashCommands,
    handleReactionRoleButton,
    updateReactionRoleMessage
};
