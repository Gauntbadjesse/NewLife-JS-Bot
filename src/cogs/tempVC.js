/**
 * Temporary Voice Channels Cog
 * Creates temporary voice channels that auto-delete when empty
 * 
 * How it works:
 * 1. Admin sets up a "hub" voice channel using /tempvc setup
 * 2. When users join the hub, a new temp channel is created for them
 * 3. The creator can manage their channel (rename, limit, lock, etc.)
 * 4. When everyone leaves, the channel is automatically deleted
 */

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ChannelType, 
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const mongoose = require('mongoose');
const { isAdmin, isOwner } = require('../utils/permissions');

// Schema for temp VC hub configuration
const tempVCHubSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    hubChannelId: { type: String, required: true },
    categoryId: { type: String },
    defaultName: { type: String, default: "{user}'s Channel" },
    defaultLimit: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

tempVCHubSchema.index({ guildId: 1, hubChannelId: 1 }, { unique: true });

const TempVCHub = mongoose.models.TempVCHub || mongoose.model('TempVCHub', tempVCHubSchema);

// Schema for active temp channels
const tempChannelSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    hubId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

tempChannelSchema.index({ channelId: 1 });
tempChannelSchema.index({ guildId: 1 });

const TempChannel = mongoose.models.TempChannel || mongoose.model('TempChannel', tempChannelSchema);

/**
 * Create a temporary voice channel for a user
 */
async function createTempChannel(member, hub, client) {
    try {
        const guild = member.guild;
        
        // Generate channel name
        const channelName = hub.defaultName
            .replace('{user}', member.displayName)
            .replace('{username}', member.user.username)
            .substring(0, 100);

        // Determine parent category
        let parentId = hub.categoryId;
        if (!parentId) {
            // Use same category as hub channel
            const hubChannel = await guild.channels.fetch(hub.hubChannelId).catch(() => null);
            if (hubChannel) parentId = hubChannel.parentId;
        }

        // Create the channel
        const tempChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: parentId,
            userLimit: hub.defaultLimit || 0,
            permissionOverwrites: [
                {
                    id: member.id,
                    allow: [
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.MuteMembers,
                        PermissionFlagsBits.DeafenMembers,
                        PermissionFlagsBits.MoveMembers,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak
                    ]
                },
                {
                    id: guild.id,
                    allow: [
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak,
                        PermissionFlagsBits.ViewChannel
                    ]
                }
            ],
            reason: `Temp VC created for ${member.user.tag}`
        });

        // Save to database
        await TempChannel.create({
            guildId: guild.id,
            channelId: tempChannel.id,
            ownerId: member.id,
            hubId: hub.hubChannelId
        });

        // Move member to the new channel
        await member.voice.setChannel(tempChannel, 'Created temp VC');

        // Send control panel message
        try {
            const controlEmbed = new EmbedBuilder()
                .setTitle('🎙️ Your Temporary Voice Channel')
                .setDescription(`Welcome to your temporary channel, ${member}!\n\nYou have full control over this channel. Use the buttons below or these commands:`)
                .setColor(0x5865F2)
                .addFields(
                    { name: '📝 Rename', value: '`/tempvc rename <name>`', inline: true },
                    { name: '👥 Set Limit', value: '`/tempvc limit <number>`', inline: true },
                    { name: '🔒 Lock/Unlock', value: '`/tempvc lock` / `unlock`', inline: true },
                    { name: '👤 Kick User', value: '`/tempvc kick <user>`', inline: true },
                    { name: '🚫 Ban/Unban', value: '`/tempvc ban/unban <user>`', inline: true },
                    { name: '👑 Transfer', value: '`/tempvc transfer <user>`', inline: true }
                )
                .setFooter({ text: 'Channel will be deleted when empty' });

            const controlButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`tempvc_lock_${tempChannel.id}`)
                    .setLabel('Lock')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`tempvc_unlock_${tempChannel.id}`)
                    .setLabel('Unlock')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`tempvc_hide_${tempChannel.id}`)
                    .setLabel('Hide')
                    .setEmoji('👻')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`tempvc_reveal_${tempChannel.id}`)
                    .setLabel('Reveal')
                    .setEmoji('👁️')
                    .setStyle(ButtonStyle.Secondary)
            );

            await tempChannel.send({ embeds: [controlEmbed], components: [controlButtons] });
        } catch (e) {
            // Ignore if can't send message
        }

        return tempChannel;
    } catch (e) {
        console.error('[TempVC] Failed to create temp channel:', e);
        return null;
    }
}

/**
 * Delete a temporary voice channel
 */
async function deleteTempChannel(channel) {
    try {
        // Remove from database
        await TempChannel.deleteOne({ channelId: channel.id });
        
        // Delete the channel
        await channel.delete('Temp VC empty');
        
        return true;
    } catch (e) {
        console.error('[TempVC] Failed to delete temp channel:', e);
        return false;
    }
}

/**
 * Check if a channel is a temp channel
 */
async function isTempChannel(channelId) {
    const tempChannel = await TempChannel.findOne({ channelId });
    return tempChannel;
}

/**
 * Handle voice state updates for temp VC
 */
async function handleVoiceStateUpdate(oldState, newState, client) {
    // User joined a channel
    if (newState.channel) {
        // Check if they joined a hub channel
        const hub = await TempVCHub.findOne({ 
            guildId: newState.guild.id, 
            hubChannelId: newState.channel.id 
        });

        if (hub) {
            // Create temp channel for this user
            await createTempChannel(newState.member, hub, client);
        }
    }

    // User left a channel
    if (oldState.channel) {
        // Check if it's a temp channel
        const tempChannel = await TempChannel.findOne({ channelId: oldState.channel.id });
        
        if (tempChannel) {
            // Check if channel is now empty
            const channel = await oldState.guild.channels.fetch(oldState.channel.id).catch(() => null);
            
            if (channel && channel.members.size === 0) {
                await deleteTempChannel(channel);
            }
        }
    }
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('tempvc')
            .setDescription('Manage temporary voice channels')
            .addSubcommand(sub => sub
                .setName('setup')
                .setDescription('Set up a temp VC hub (Admin)')
                .addChannelOption(opt => opt
                    .setName('hub')
                    .setDescription('Voice channel to use as the hub (join to create)')
                    .addChannelTypes(ChannelType.GuildVoice)
                    .setRequired(true))
                .addChannelOption(opt => opt
                    .setName('category')
                    .setDescription('Category for temp channels (default: same as hub)')
                    .addChannelTypes(ChannelType.GuildCategory)
                    .setRequired(false))
                .addStringOption(opt => opt
                    .setName('default_name')
                    .setDescription('Default channel name ({user} = display name)')
                    .setRequired(false))
                .addIntegerOption(opt => opt
                    .setName('default_limit')
                    .setDescription('Default user limit (0 = unlimited)')
                    .setMinValue(0)
                    .setMaxValue(99)
                    .setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('remove')
                .setDescription('Remove a temp VC hub (Admin)')
                .addChannelOption(opt => opt
                    .setName('hub')
                    .setDescription('Hub channel to remove')
                    .addChannelTypes(ChannelType.GuildVoice)
                    .setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List all temp VC hubs (Admin)')
            )
            .addSubcommand(sub => sub
                .setName('rename')
                .setDescription('Rename your temp channel')
                .addStringOption(opt => opt
                    .setName('name')
                    .setDescription('New channel name')
                    .setRequired(true)
                    .setMaxLength(100))
            )
            .addSubcommand(sub => sub
                .setName('limit')
                .setDescription('Set user limit for your temp channel')
                .addIntegerOption(opt => opt
                    .setName('users')
                    .setDescription('Max users (0 = unlimited)')
                    .setRequired(true)
                    .setMinValue(0)
                    .setMaxValue(99))
            )
            .addSubcommand(sub => sub
                .setName('lock')
                .setDescription('Lock your temp channel (no new joins)')
            )
            .addSubcommand(sub => sub
                .setName('unlock')
                .setDescription('Unlock your temp channel')
            )
            .addSubcommand(sub => sub
                .setName('hide')
                .setDescription('Hide your temp channel from channel list')
            )
            .addSubcommand(sub => sub
                .setName('reveal')
                .setDescription('Make your temp channel visible again')
            )
            .addSubcommand(sub => sub
                .setName('kick')
                .setDescription('Kick a user from your temp channel')
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription('User to kick')
                    .setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('ban')
                .setDescription('Ban a user from your temp channel')
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription('User to ban')
                    .setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('unban')
                .setDescription('Unban a user from your temp channel')
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription('User to unban')
                    .setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('transfer')
                .setDescription('Transfer ownership of your temp channel')
                .addUserOption(opt => opt
                    .setName('user')
                    .setDescription('New owner')
                    .setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('claim')
                .setDescription('Claim an ownerless temp channel')
            ),

        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();

            // Admin commands
            if (['setup', 'remove', 'list'].includes(sub)) {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
                }

                if (sub === 'setup') {
                    const hub = interaction.options.getChannel('hub');
                    const category = interaction.options.getChannel('category');
                    const defaultName = interaction.options.getString('default_name') || "{user}'s Channel";
                    const defaultLimit = interaction.options.getInteger('default_limit') || 0;

                    // Check if hub already exists
                    const existing = await TempVCHub.findOne({ 
                        guildId: interaction.guild.id, 
                        hubChannelId: hub.id 
                    });

                    if (existing) {
                        return interaction.reply({ content: '❌ This channel is already a temp VC hub.', ephemeral: true });
                    }

                    await TempVCHub.create({
                        guildId: interaction.guild.id,
                        hubChannelId: hub.id,
                        categoryId: category?.id || null,
                        defaultName,
                        defaultLimit
                    });

                    const embed = new EmbedBuilder()
                        .setTitle('✅ Temp VC Hub Created')
                        .setColor(0x6BCB77)
                        .addFields(
                            { name: 'Hub Channel', value: `<#${hub.id}>`, inline: true },
                            { name: 'Category', value: category ? `<#${category.id}>` : 'Same as hub', inline: true },
                            { name: 'Default Name', value: defaultName, inline: true },
                            { name: 'Default Limit', value: defaultLimit === 0 ? 'Unlimited' : String(defaultLimit), inline: true }
                        )
                        .setFooter({ text: 'Users joining the hub will get their own temp channel' });

                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }

                if (sub === 'remove') {
                    const hub = interaction.options.getChannel('hub');

                    const result = await TempVCHub.deleteOne({ 
                        guildId: interaction.guild.id, 
                        hubChannelId: hub.id 
                    });

                    if (result.deletedCount === 0) {
                        return interaction.reply({ content: '❌ This channel is not a temp VC hub.', ephemeral: true });
                    }

                    return interaction.reply({ content: '✅ Temp VC hub removed.', ephemeral: true });
                }

                if (sub === 'list') {
                    const hubs = await TempVCHub.find({ guildId: interaction.guild.id });

                    if (hubs.length === 0) {
                        return interaction.reply({ content: 'No temp VC hubs configured.', ephemeral: true });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('🎙️ Temp VC Hubs')
                        .setColor(0x5865F2);

                    for (const hub of hubs) {
                        embed.addFields({
                            name: `Hub: <#${hub.hubChannelId}>`,
                            value: `**Default Name:** ${hub.defaultName}\n**Limit:** ${hub.defaultLimit || 'Unlimited'}`,
                            inline: false
                        });
                    }

                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }

            // User commands - require being in a temp channel
            const member = interaction.member;
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) {
                return interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
            }

            const tempChannel = await TempChannel.findOne({ channelId: voiceChannel.id });

            if (!tempChannel) {
                return interaction.reply({ content: '❌ You\'re not in a temp channel.', ephemeral: true });
            }

            const isChannelOwner = tempChannel.ownerId === interaction.user.id;

            // Claim command - special case
            if (sub === 'claim') {
                // Check if owner is still in the channel
                const owner = voiceChannel.members.get(tempChannel.ownerId);
                if (owner) {
                    return interaction.reply({ content: '❌ The channel owner is still in the channel.', ephemeral: true });
                }

                // Transfer ownership
                await TempChannel.findOneAndUpdate(
                    { channelId: voiceChannel.id },
                    { ownerId: interaction.user.id }
                );

                // Update permissions
                await voiceChannel.permissionOverwrites.edit(interaction.user.id, {
                    ManageChannels: true,
                    MuteMembers: true,
                    DeafenMembers: true,
                    MoveMembers: true
                });

                return interaction.reply({ content: '👑 You are now the owner of this channel!', ephemeral: true });
            }

            // All other commands require ownership
            if (!isChannelOwner) {
                return interaction.reply({ content: '❌ You don\'t own this channel. Use `/tempvc claim` if the owner left.', ephemeral: true });
            }

            if (sub === 'rename') {
                const name = interaction.options.getString('name');
                await voiceChannel.setName(name);
                return interaction.reply({ content: `✅ Channel renamed to **${name}**`, ephemeral: true });
            }

            if (sub === 'limit') {
                const limit = interaction.options.getInteger('users');
                await voiceChannel.setUserLimit(limit);
                return interaction.reply({ 
                    content: `✅ User limit set to **${limit === 0 ? 'unlimited' : limit}**`, 
                    ephemeral: true 
                });
            }

            if (sub === 'lock') {
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                    Connect: false
                });
                return interaction.reply({ content: '🔒 Channel locked. No one else can join.', ephemeral: true });
            }

            if (sub === 'unlock') {
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                    Connect: true
                });
                return interaction.reply({ content: '🔓 Channel unlocked. Anyone can join.', ephemeral: true });
            }

            if (sub === 'hide') {
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                    ViewChannel: false
                });
                return interaction.reply({ content: '👻 Channel hidden from channel list.', ephemeral: true });
            }

            if (sub === 'reveal') {
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                    ViewChannel: true
                });
                return interaction.reply({ content: '👁️ Channel is now visible.', ephemeral: true });
            }

            if (sub === 'kick') {
                const user = interaction.options.getUser('user');
                const targetMember = voiceChannel.members.get(user.id);

                if (!targetMember) {
                    return interaction.reply({ content: '❌ User is not in your channel.', ephemeral: true });
                }

                if (user.id === interaction.user.id) {
                    return interaction.reply({ content: '❌ You can\'t kick yourself.', ephemeral: true });
                }

                await targetMember.voice.disconnect('Kicked from temp VC');
                return interaction.reply({ content: `👢 Kicked ${user} from the channel.`, ephemeral: true });
            }

            if (sub === 'ban') {
                const user = interaction.options.getUser('user');

                if (user.id === interaction.user.id) {
                    return interaction.reply({ content: '❌ You can\'t ban yourself.', ephemeral: true });
                }

                await voiceChannel.permissionOverwrites.edit(user.id, {
                    Connect: false,
                    ViewChannel: false
                });

                // Disconnect if in channel
                const targetMember = voiceChannel.members.get(user.id);
                if (targetMember) {
                    await targetMember.voice.disconnect('Banned from temp VC');
                }

                return interaction.reply({ content: `🚫 Banned ${user} from your channel.`, ephemeral: true });
            }

            if (sub === 'unban') {
                const user = interaction.options.getUser('user');

                await voiceChannel.permissionOverwrites.delete(user.id);
                return interaction.reply({ content: `✅ Unbanned ${user} from your channel.`, ephemeral: true });
            }

            if (sub === 'transfer') {
                const user = interaction.options.getUser('user');
                const newOwner = voiceChannel.members.get(user.id);

                if (!newOwner) {
                    return interaction.reply({ content: '❌ User must be in your channel.', ephemeral: true });
                }

                if (user.id === interaction.user.id) {
                    return interaction.reply({ content: '❌ You already own this channel.', ephemeral: true });
                }

                // Update database
                await TempChannel.findOneAndUpdate(
                    { channelId: voiceChannel.id },
                    { ownerId: user.id }
                );

                // Update permissions - remove from old owner
                await voiceChannel.permissionOverwrites.edit(interaction.user.id, {
                    ManageChannels: null,
                    MuteMembers: null,
                    DeafenMembers: null,
                    MoveMembers: null
                });

                // Add to new owner
                await voiceChannel.permissionOverwrites.edit(user.id, {
                    ManageChannels: true,
                    MuteMembers: true,
                    DeafenMembers: true,
                    MoveMembers: true
                });

                return interaction.reply({ content: `👑 Transferred ownership to ${user}.` });
            }
        }
    }
];

/**
 * Handle temp VC control buttons
 */
async function handleTempVCButton(interaction, client) {
    if (!interaction.customId.startsWith('tempvc_')) return;

    const [, action, channelId] = interaction.customId.split('_');
    
    const tempChannel = await TempChannel.findOne({ channelId });
    if (!tempChannel) {
        return interaction.reply({ content: '❌ This channel no longer exists.', ephemeral: true });
    }

    if (tempChannel.ownerId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Only the channel owner can use these controls.', ephemeral: true });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        return interaction.reply({ content: '❌ Channel not found.', ephemeral: true });
    }

    switch (action) {
        case 'lock':
            await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
            return interaction.reply({ content: '🔒 Channel locked.', ephemeral: true });
        
        case 'unlock':
            await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
            return interaction.reply({ content: '🔓 Channel unlocked.', ephemeral: true });
        
        case 'hide':
            await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
            return interaction.reply({ content: '👻 Channel hidden.', ephemeral: true });
        
        case 'reveal':
            await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
            return interaction.reply({ content: '👁️ Channel revealed.', ephemeral: true });
    }
}

/**
 * Cleanup orphaned temp channels on startup
 */
async function cleanupOrphanedChannels(client) {
    try {
        const tempChannels = await TempChannel.find({});
        let cleaned = 0;

        for (const tc of tempChannels) {
            try {
                const guild = await client.guilds.fetch(tc.guildId).catch(() => null);
                if (!guild) {
                    await TempChannel.deleteOne({ _id: tc._id });
                    cleaned++;
                    continue;
                }

                const channel = await guild.channels.fetch(tc.channelId).catch(() => null);
                if (!channel) {
                    await TempChannel.deleteOne({ _id: tc._id });
                    cleaned++;
                    continue;
                }

                // Check if empty
                if (channel.members.size === 0) {
                    await channel.delete('Temp VC cleanup - empty');
                    await TempChannel.deleteOne({ _id: tc._id });
                    cleaned++;
                }
            } catch (e) {
                // Continue with next
            }
        }

        if (cleaned > 0) {
            console.log(`[TempVC] Cleaned up ${cleaned} orphaned temp channel(s)`);
        }
    } catch (e) {
        console.error('[TempVC] Cleanup error:', e);
    }
}

module.exports = {
    name: 'TempVC',
    slashCommands,
    handleVoiceStateUpdate,
    handleTempVCButton,
    cleanupOrphanedChannels
};
