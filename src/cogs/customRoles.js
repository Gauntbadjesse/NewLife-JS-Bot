/**
 * Custom Roles Cog
 * Allows premium members to create and customize their own personal roles
 * 
 * Features:
 * - /customrole create - Request a new custom role (requires approval)
 * - /customrole edit - Edit your existing custom role (requires approval)
 * - /customrole delete - Delete your custom role
 * - /customrole view - View your current custom role
 * - Approval system via DM to owner with buttons
 */

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');
const { createErrorEmbed, createSuccessEmbed, getEmbedColor } = require('../utils/embeds');
const { sendDm } = require('../utils/dm');
const CustomRole = require('../database/models/CustomRole');
const emojis = require('../utils/emojis');

// Premium role that grants access to custom roles
const PREMIUM_ROLE_ID = '1463405789241802895';

// Role that custom roles will be positioned under
const CUSTOM_ROLE_POSITION_REFERENCE = '1463405789241802895';

// Owner ID for approval DMs
const getOwnerId = () => process.env.OWNER_ID || process.env.OWNER_USER_ID;

/**
 * Check if a user has the premium role
 */
function hasPremiumRole(member) {
    return member && member.roles && member.roles.cache.has(PREMIUM_ROLE_ID);
}

/**
 * Validate hex color format
 */
function isValidHexColor(color) {
    if (!color) return true; // Optional
    return /^#?[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Normalize hex color (ensure it has #)
 */
function normalizeHexColor(color) {
    if (!color) return null;
    return color.startsWith('#') ? color : `#${color}`;
}

/**
 * Send approval request DM to owner
 */
async function sendApprovalDM(client, customRole, isEdit = false) {
    const ownerId = getOwnerId();
    if (!ownerId) {
        console.error('[CustomRoles] OWNER_ID not set in environment');
        return false;
    }

    try {
        const owner = await client.users.fetch(ownerId);
        if (!owner) {
            console.error('[CustomRoles] Could not fetch owner user');
            return false;
        }

        const pendingData = customRole.pendingRequest || {};
        const roleName = pendingData.roleName || customRole.roleName;
        const roleColor = pendingData.roleColor || customRole.roleColor || 'Default';
        const roleEmoji = pendingData.roleEmoji || customRole.roleEmoji || 'None';

        const embed = new EmbedBuilder()
            .setColor(roleColor && roleColor !== 'Default' ? parseInt(roleColor.replace('#', ''), 16) : 0xFFD700)
            .setTitle(`${isEdit ? '✏️  Custom Role Edit' : '🎨  New Custom Role'}`)
            .setDescription(`${isEdit ? 'A premium member wants to edit their role.' : 'A premium member is requesting a custom role.'}`)
            .addFields(
                { name: '👤  Member', value: `<@${customRole.userId}>`, inline: true },
                { name: '🏷️  Role Name', value: `\`${roleName}\``, inline: true },
                { name: '🎨  Color', value: roleColor && roleColor !== 'Default' ? `\`${roleColor}\`` : '*Default*', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `NewLife+ • User ID: ${customRole.userId}` });

        if (roleEmoji && roleEmoji !== 'None') {
            embed.addFields({ name: '✨  Emoji', value: roleEmoji, inline: true });
        }

        // Show current values if this is an edit
        if (isEdit && customRole.roleId) {
            embed.addFields({
                name: '📋  Current Role',
                value: `**Name:** ${customRole.roleName}\n**Color:** ${customRole.roleColor || 'Default'}${customRole.roleEmoji ? `\n**Emoji:** ${customRole.roleEmoji}` : ''}`,
                inline: false
            });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`customrole_approve_${customRole.userId}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`customrole_deny_${customRole.userId}`)
                .setLabel('Deny')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌'),
            new ButtonBuilder()
                .setCustomId(`customrole_preview_${customRole.userId}`)
                .setLabel('Preview')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👁️')
        );

        await owner.send({ embeds: [embed], components: [row] });
        return true;
    } catch (error) {
        console.error('[CustomRoles] Failed to send approval DM:', error);
        return false;
    }
}

/**
 * Create the Discord role
 */
async function createDiscordRole(guild, customRole) {
    try {
        const pendingData = customRole.pendingRequest || {};
        const roleName = pendingData.roleName || customRole.roleName;
        const roleColor = pendingData.roleColor || customRole.roleColor;
        const roleEmoji = pendingData.roleEmoji || customRole.roleEmoji;

        // Include emoji in role name if provided
        const finalRoleName = roleEmoji ? `${roleEmoji} ${roleName}` : roleName;
        
        // Get the reference role to position new role under
        const referenceRole = guild.roles.cache.get(CUSTOM_ROLE_POSITION_REFERENCE);
        const position = referenceRole ? referenceRole.position - 1 : 1;

        const role = await guild.roles.create({
            name: finalRoleName,
            color: roleColor ? parseInt(roleColor.replace('#', ''), 16) : null,
            permissions: [],
            reason: `Custom role for premium member ${customRole.userTag}`,
            position: Math.max(1, position)
        });

        return role;
    } catch (error) {
        console.error('[CustomRoles] Failed to create Discord role:', error);
        throw error;
    }
}

/**
 * Update the Discord role
 */
async function updateDiscordRole(guild, customRole) {
    try {
        const role = guild.roles.cache.get(customRole.roleId);
        if (!role) {
            throw new Error('Role not found');
        }

        const pendingData = customRole.pendingRequest || {};
        const roleName = pendingData.roleName || customRole.roleName;
        const roleColor = pendingData.roleColor || customRole.roleColor;
        const roleEmoji = pendingData.roleEmoji || customRole.roleEmoji;

        // Include emoji in role name if provided
        const finalRoleName = roleEmoji ? `${roleEmoji} ${roleName}` : roleName;

        await role.edit({
            name: finalRoleName,
            color: roleColor ? parseInt(roleColor.replace('#', ''), 16) : null,
            reason: `Custom role edit for premium member ${customRole.userTag}`
        });

        return role;
    } catch (error) {
        console.error('[CustomRoles] Failed to update Discord role:', error);
        throw error;
    }
}

// Slash commands
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('customrole')
            .setDescription('Manage your custom premium role')
            .addSubcommand(sub => sub
                .setName('create')
                .setDescription('Request a new custom role')
                .addStringOption(o => o
                    .setName('name')
                    .setDescription('The name for your custom role')
                    .setRequired(true)
                    .setMaxLength(50))
                .addStringOption(o => o
                    .setName('color')
                    .setDescription('Hex color for the role (e.g., #FF5733)')
                    .setRequired(false)
                    .setMaxLength(7))
                .addStringOption(o => o
                    .setName('emoji')
                    .setDescription('Emoji to display before the role name')
                    .setRequired(false)
                    .setMaxLength(50)))
            .addSubcommand(sub => sub
                .setName('edit')
                .setDescription('Request to edit your existing custom role')
                .addStringOption(o => o
                    .setName('name')
                    .setDescription('New name for your role')
                    .setRequired(false)
                    .setMaxLength(50))
                .addStringOption(o => o
                    .setName('color')
                    .setDescription('New hex color (e.g., #FF5733)')
                    .setRequired(false)
                    .setMaxLength(7))
                .addStringOption(o => o
                    .setName('emoji')
                    .setDescription('New emoji for your role')
                    .setRequired(false)
                    .setMaxLength(50)))
            .addSubcommand(sub => sub
                .setName('delete')
                .setDescription('Delete your custom role'))
            .addSubcommand(sub => sub
                .setName('view')
                .setDescription('View your current custom role'))
            .addSubcommand(sub => sub
                .setName('pending')
                .setDescription('View all pending custom role requests (Owner only)')),
        
        async execute(interaction, client) {
            const subcommand = interaction.options.getSubcommand();
            const member = interaction.member;

            // Check premium role for user commands (not pending)
            if (subcommand !== 'pending' && !hasPremiumRole(member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Premium Required', `You need the <@&${PREMIUM_ROLE_ID}> role to use custom roles.`)],
                    ephemeral: true
                });
            }

            switch (subcommand) {
                case 'create':
                    await handleCreate(interaction, client);
                    break;
                case 'edit':
                    await handleEdit(interaction, client);
                    break;
                case 'delete':
                    await handleDelete(interaction, client);
                    break;
                case 'view':
                    await handleView(interaction);
                    break;
                case 'pending':
                    await handlePending(interaction);
                    break;
            }
        }
    }
];

/**
 * Handle /customrole create
 */
async function handleCreate(interaction, client) {
    const userId = interaction.user.id;
    const name = interaction.options.getString('name');
    const color = interaction.options.getString('color');
    const emoji = interaction.options.getString('emoji');

    // Validate color if provided
    if (color && !isValidHexColor(color)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Invalid Color', 'Please provide a valid hex color (e.g., #FF5733 or FF5733)')],
            ephemeral: true
        });
    }

    // Check if user already has a custom role
    const existing = await CustomRole.findOne({ userId });
    if (existing) {
        if (existing.status === 'pending') {
            return interaction.reply({
                embeds: [createErrorEmbed('Pending Request', 'You already have a pending custom role request. Please wait for it to be reviewed.')],
                ephemeral: true
            });
        }
        if (existing.status === 'approved') {
            return interaction.reply({
                embeds: [createErrorEmbed('Already Have Role', 'You already have a custom role. Use `/customrole edit` to modify it or `/customrole delete` to remove it.')],
                ephemeral: true
            });
        }
    }

    // Create or update the custom role request
    const customRole = existing || new CustomRole();
    customRole.userId = userId;
    customRole.userTag = interaction.user.tag;
    customRole.roleName = name;
    customRole.roleColor = normalizeHexColor(color);
    customRole.roleEmoji = emoji;
    customRole.status = 'pending';
    customRole.pendingRequest = {
        roleName: name,
        roleColor: normalizeHexColor(color),
        roleEmoji: emoji,
        requestedAt: new Date(),
        isEdit: false
    };
    await customRole.save();

    // Send approval DM to owner
    const dmSent = await sendApprovalDM(client, customRole, false);

    const colorDisplay = normalizeHexColor(color);
    const embed = new EmbedBuilder()
        .setColor(colorDisplay ? parseInt(colorDisplay.replace('#', ''), 16) : 0xFFD700)
        .setTitle('🎨  Custom Role Request Submitted')
        .setDescription('Your request has been sent for approval!\nYou\'ll receive a DM once it\'s reviewed.')
        .addFields(
            { name: '🏷️  Name', value: `\`${name}\``, inline: true },
            { name: '🎨  Color', value: colorDisplay ? `\`${colorDisplay}\`` : '*Default*', inline: true },
            { name: '✨  Emoji', value: emoji || '*None*', inline: true }
        )
        .setFooter({ text: 'NewLife+ • Custom Role System' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /customrole edit
 */
async function handleEdit(interaction, client) {
    const userId = interaction.user.id;
    const name = interaction.options.getString('name');
    const color = interaction.options.getString('color');
    const emoji = interaction.options.getString('emoji');

    // Must provide at least one option
    if (!name && !color && !emoji) {
        return interaction.reply({
            embeds: [createErrorEmbed('No Changes', 'Please provide at least one option to change (name, color, or emoji).')],
            ephemeral: true
        });
    }

    // Validate color if provided
    if (color && !isValidHexColor(color)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Invalid Color', 'Please provide a valid hex color (e.g., #FF5733 or FF5733)')],
            ephemeral: true
        });
    }

    // Check if user has an approved custom role
    const customRole = await CustomRole.findOne({ userId, status: 'approved' });
    if (!customRole) {
        return interaction.reply({
            embeds: [createErrorEmbed('No Role Found', 'You don\'t have an approved custom role yet. Use `/customrole create` to request one.')],
            ephemeral: true
        });
    }

    // Check for pending edit request
    if (customRole.pendingRequest && customRole.pendingRequest.requestedAt) {
        return interaction.reply({
            embeds: [createErrorEmbed('Pending Edit', 'You already have a pending edit request. Please wait for it to be reviewed.')],
            ephemeral: true
        });
    }

    // Create edit request
    customRole.pendingRequest = {
        roleName: name || customRole.roleName,
        roleColor: color ? normalizeHexColor(color) : customRole.roleColor,
        roleEmoji: emoji !== undefined ? emoji : customRole.roleEmoji,
        requestedAt: new Date(),
        isEdit: true
    };
    await customRole.save();

    // Send approval DM to owner
    const dmSent = await sendApprovalDM(client, customRole, true);

    const newColor = color ? normalizeHexColor(color) : customRole.roleColor;
    const embed = new EmbedBuilder()
        .setColor(newColor ? parseInt(newColor.replace('#', ''), 16) : 0xFFD700)
        .setTitle('✏️  Edit Request Submitted')
        .setDescription('Your changes have been sent for approval!\nYou\'ll receive a DM once it\'s reviewed.')
        .addFields(
            { name: '🏷️  Name', value: `\`${name || customRole.roleName}\``, inline: true },
            { name: '🎨  Color', value: newColor ? `\`${newColor}\`` : '*Default*', inline: true },
            { name: '✨  Emoji', value: (emoji !== undefined ? emoji : customRole.roleEmoji) || '*None*', inline: true }
        )
        .setFooter({ text: 'NewLife+ • Custom Role System' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /customrole delete
 */
async function handleDelete(interaction, client) {
    const userId = interaction.user.id;
    const guild = interaction.guild;

    const customRole = await CustomRole.findOne({ userId });
    if (!customRole) {
        return interaction.reply({
            embeds: [createErrorEmbed('No Role Found', 'You don\'t have a custom role to delete.')],
            ephemeral: true
        });
    }

    // Delete the Discord role if it exists
    if (customRole.roleId) {
        try {
            const role = guild.roles.cache.get(customRole.roleId);
            if (role) {
                await role.delete('Custom role deleted by user');
            }
        } catch (error) {
            console.error('[CustomRoles] Failed to delete Discord role:', error);
        }
    }

    // Delete from database
    await CustomRole.deleteOne({ userId });

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🗑️  Custom Role Deleted')
        .setDescription('Your custom role has been removed.')
        .setFooter({ text: 'NewLife+ • Custom Role System' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /customrole view
 */
async function handleView(interaction) {
    const userId = interaction.user.id;

    const customRole = await CustomRole.findOne({ userId });
    if (!customRole) {
        return interaction.reply({
            embeds: [createErrorEmbed('No Role Found', 'You don\'t have a custom role yet. Use `/customrole create` to request one.')],
            ephemeral: true
        });
    }

    const statusEmoji = customRole.status === 'approved' ? '✅' : customRole.status === 'pending' ? '⏳' : '❌';
    
    const embed = new EmbedBuilder()
        .setColor(customRole.roleColor ? parseInt(customRole.roleColor.replace('#', ''), 16) : 0xFFD700)
        .setTitle('🎨  Your Custom Role')
        .setDescription(customRole.roleId ? `<@&${customRole.roleId}>` : '*Role not yet created*')
        .addFields(
            { name: '📊  Status', value: `${statusEmoji} ${customRole.status.charAt(0).toUpperCase() + customRole.status.slice(1)}`, inline: true },
            { name: '🏷️  Name', value: `\`${customRole.roleName}\``, inline: true },
            { name: '🎨  Color', value: customRole.roleColor ? `\`${customRole.roleColor}\`` : '*Default*', inline: true }
        )
        .setFooter({ text: 'NewLife+ • Custom Role System' })
        .setTimestamp();

    if (customRole.roleEmoji) {
        embed.addFields({ name: '✨  Emoji', value: customRole.roleEmoji, inline: true });
    }

    if (customRole.pendingRequest && customRole.pendingRequest.requestedAt) {
        embed.addFields({
            name: '⏳  Pending Changes',
            value: `**Name:** ${customRole.pendingRequest.roleName}\n**Color:** ${customRole.pendingRequest.roleColor || 'Default'}${customRole.pendingRequest.roleEmoji ? `\n**Emoji:** ${customRole.pendingRequest.roleEmoji}` : ''}`,
            inline: false
        });
    }

    if (customRole.approvedAt) {
        embed.addFields({
            name: '📅  Approved',
            value: `<t:${Math.floor(customRole.approvedAt.getTime() / 1000)}:R>`,
            inline: true
        });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /customrole pending (Owner only)
 */
async function handlePending(interaction) {
    const ownerId = getOwnerId();
    
    // Only owner can view pending
    if (interaction.user.id !== ownerId) {
        return interaction.reply({
            embeds: [createErrorEmbed('Permission Denied', 'Only the server owner can view pending requests.')],
            ephemeral: true
        });
    }

    const pendingRoles = await CustomRole.find({
        $or: [
            { status: 'pending' },
            { 'pendingRequest.requestedAt': { $exists: true, $ne: null } }
        ]
    });

    if (pendingRoles.length === 0) {
        return interaction.reply({
            embeds: [createSuccessEmbed('No Pending Requests', 'There are no pending custom role requests.')],
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(getEmbedColor())
        .setTitle('⏳ Pending Custom Role Requests')
        .setDescription(`Found ${pendingRoles.length} pending request(s)`)
        .setTimestamp();

    for (const role of pendingRoles.slice(0, 10)) {
        const isEdit = role.pendingRequest?.isEdit || false;
        const data = role.pendingRequest || role;
        embed.addFields({
            name: `${isEdit ? '✏️ Edit' : '🆕 New'}: ${role.userTag}`,
            value: `**Name:** ${data.roleName || role.roleName}\n**Color:** ${data.roleColor || role.roleColor || 'Default'}\n**Emoji:** ${data.roleEmoji || role.roleEmoji || 'None'}\n**User:** <@${role.userId}>`,
            inline: true
        });
    }

    if (pendingRoles.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${pendingRoles.length} pending requests` });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle button interactions for custom role approval/denial
 */
async function handleButton(interaction) {
    if (!interaction.customId.startsWith('customrole_')) return false;

    const ownerId = getOwnerId();
    
    // Only owner can approve/deny
    if (interaction.user.id !== ownerId) {
        await interaction.reply({
            embeds: [createErrorEmbed('Permission Denied', 'Only the server owner can approve or deny custom role requests.')],
            ephemeral: true
        });
        return true;
    }

    const parts = interaction.customId.split('_');
    const action = parts[1]; // approve, deny, or preview
    const userId = parts[2];

    const customRole = await CustomRole.findOne({ userId });
    if (!customRole) {
        await interaction.reply({
            embeds: [createErrorEmbed('Not Found', 'This custom role request no longer exists.')],
            ephemeral: true
        });
        return true;
    }

    // Get guild
    const guildId = process.env.GUILD_ID || '1372672239245459498';
    const guild = interaction.client.guilds.cache.get(guildId);
    if (!guild) {
        await interaction.reply({
            embeds: [createErrorEmbed('Error', 'Could not find the server.')],
            ephemeral: true
        });
        return true;
    }

    if (action === 'preview') {
        // Show preview of what the role will look like
        const pendingData = customRole.pendingRequest || {};
        const roleName = pendingData.roleName || customRole.roleName;
        const roleColor = pendingData.roleColor || customRole.roleColor;
        const roleEmoji = pendingData.roleEmoji || customRole.roleEmoji;
        const finalName = roleEmoji ? `${roleEmoji} ${roleName}` : roleName;

        const embed = new EmbedBuilder()
            .setColor(roleColor ? parseInt(roleColor.replace('#', ''), 16) : getEmbedColor())
            .setTitle('👁️ Role Preview')
            .setDescription(`This is how the role will appear:\n\n**${finalName}**`)
            .addFields(
                { name: 'Display Name', value: finalName, inline: true },
                { name: 'Color', value: roleColor || 'Default', inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return true;
    }

    if (action === 'approve') {
        await interaction.deferUpdate();

        try {
            const isEdit = customRole.pendingRequest?.isEdit || false;
            let role;

            if (isEdit && customRole.roleId) {
                // Update existing role
                role = await updateDiscordRole(guild, customRole);
            } else {
                // Create new role
                role = await createDiscordRole(guild, customRole);
                
                // Assign role to user
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await member.roles.add(role.id, 'Custom role approved');
                }
            }

            // Update database
            const pendingData = customRole.pendingRequest || {};
            customRole.roleId = role.id;
            customRole.roleName = pendingData.roleName || customRole.roleName;
            customRole.roleColor = pendingData.roleColor || customRole.roleColor;
            customRole.roleEmoji = pendingData.roleEmoji || customRole.roleEmoji;
            customRole.status = 'approved';
            customRole.approvedAt = new Date();
            customRole.approvedBy = interaction.user.id;
            customRole.pendingRequest = null;
            await customRole.save();

            // Update the message to show it was approved
            const embed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0x00FF00)
                .setTitle(`✅ ${isEdit ? 'Edit' : 'Custom Role'} Approved`)
                .setFooter({ text: `Approved by ${interaction.user.tag}` });

            await interaction.editReply({ embeds: [embed], components: [] });

            // DM the user (with logging)
            const userEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle(`✅  Custom Role ${isEdit ? 'Updated' : 'Created'}!`)
                .setDescription(`Your ${isEdit ? 'changes have been applied' : 'custom role is ready'}!\n\n<@&${role.id}>`)
                .addFields(
                    { name: '🏷️  Name', value: `\`${customRole.roleName}\``, inline: true },
                    { name: '🎨  Color', value: customRole.roleColor ? `\`${customRole.roleColor}\`` : '*Default*', inline: true }
                )
                .setFooter({ text: 'NewLife+ • Custom Role System' })
                .setTimestamp();
            
            if (customRole.roleEmoji) {
                userEmbed.addFields({ name: '✨  Emoji', value: customRole.roleEmoji, inline: true });
            }
            
            await sendDm(interaction.client, userId, { embeds: [userEmbed] });

        } catch (error) {
            console.error('[CustomRoles] Error approving role:', error);
            await interaction.followUp({
                embeds: [createErrorEmbed('Error', `Failed to create/update role: ${error.message}`)],
                ephemeral: true
            });
        }

        return true;
    }

    if (action === 'deny') {
        await interaction.deferUpdate();

        const isEdit = customRole.pendingRequest?.isEdit || false;

        if (isEdit) {
            // Just clear the pending request
            customRole.pendingRequest = null;
            await customRole.save();
        } else {
            // Delete the request entirely
            await CustomRole.deleteOne({ userId });
        }

        // Update the message to show it was denied
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0xFF0000)
            .setTitle(`❌ ${isEdit ? 'Edit' : 'Custom Role'} Denied`)
            .setFooter({ text: `Denied by ${interaction.user.tag}` });

        await interaction.editReply({ embeds: [embed], components: [] });

        // DM the user (with logging)
        const userEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle(`❌  Custom Role ${isEdit ? 'Edit' : 'Request'} Denied`)
            .setDescription(`Your ${isEdit ? 'edit request' : 'custom role request'} was not approved.`)
            .addFields({ name: '💬  What Now?', value: 'If you have questions, feel free to open a support ticket.' })
            .setFooter({ text: 'NewLife+ • Custom Role System' })
            .setTimestamp();
        
        await sendDm(interaction.client, userId, { embeds: [userEmbed] });

        return true;
    }

    return false;
}

module.exports = {
    name: 'CustomRoles',
    description: 'Custom role system for premium members',
    slashCommands,
    handleButton,
    // Export for potential use elsewhere
    hasPremiumRole,
    PREMIUM_ROLE_ID
};
