/**
 * Kingdoms Cog
 * Kingdom management system for NewLife SMP
 * 
 * Staff Commands (Slash):
 * - /kingdom create - Create a new kingdom
 * - /kingdom delete - Delete a kingdom
 * - /kingdom list - List all kingdoms
 * 
 * Everyone Commands (Prefix):
 * - !kingdom help - Show help
 * - !kingdom add <user> - Add user to kingdom (rulers only)
 * - !kingdom remove <user> - Remove user from kingdom (rulers only)
 * - !kingdom list <kingdom> - List users in a kingdom
 * - !kingdom transfer <user> - Transfer leadership (rulers only)
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getKingdomModel } = require('../database/models/Kingdom');
const { isAdmin, isSupervisor, isManagement, isOwner } = require('../utils/permissions');
const { getEmbedColor } = require('../utils/embeds');

/**
 * Check if user is staff (Admin+)
 */
function isStaffMember(member) {
    return isAdmin(member) || isSupervisor(member) || isManagement(member) || isOwner(member);
}

/**
 * Find a kingdom by name (case insensitive)
 */
async function findKingdom(guildId, name) {
    const Kingdom = await getKingdomModel();
    return Kingdom.findOne({ guildId, nameLower: name.toLowerCase().trim() });
}

/**
 * Get the kingdom a user is a ruler of (has leader role)
 */
async function getUserRuledKingdom(guildId, member) {
    const Kingdom = await getKingdomModel();
    const kingdoms = await Kingdom.find({ guildId });
    
    for (const kingdom of kingdoms) {
        if (member.roles.cache.has(kingdom.leaderRoleId)) {
            return kingdom;
        }
    }
    return null;
}

/**
 * Get the kingdom a user is a member of
 */
async function getUserKingdom(guildId, member) {
    const Kingdom = await getKingdomModel();
    const kingdoms = await Kingdom.find({ guildId });
    
    for (const kingdom of kingdoms) {
        if (member.roles.cache.has(kingdom.leaderRoleId) || member.roles.cache.has(kingdom.memberRoleId)) {
            return kingdom;
        }
    }
    return null;
}

/**
 * Slash Commands (Staff Only)
 */
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('kingdom')
            .setDescription('Kingdom management')
            .addSubcommand(sub => sub
                .setName('create')
                .setDescription('Create a new kingdom (auto-creates roles)')
                .addStringOption(opt => opt
                    .setName('name')
                    .setDescription('Kingdom name')
                    .setRequired(true))
                .addBooleanOption(opt => opt
                    .setName('leader_ping')
                    .setDescription('Allow leader to be pinged')
                    .setRequired(true))
                .addStringOption(opt => opt
                    .setName('color')
                    .setDescription('Hex color code (e.g., #ff0000)')
                    .setRequired(true)))
            .addSubcommand(sub => sub
                .setName('delete')
                .setDescription('Delete a kingdom')
                .addStringOption(opt => opt
                    .setName('name')
                    .setDescription('Kingdom name to delete')
                    .setRequired(true)
                    .setAutocomplete(true)))
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List all kingdoms')),

        async execute(interaction, client) {
            // Staff only check
            if (!isStaffMember(interaction.member)) {
                return interaction.reply({ content: 'Permission denied. Staff only.', ephemeral: true });
            }

            const sub = interaction.options.getSubcommand();
            const Kingdom = await getKingdomModel();

            // CREATE
            if (sub === 'create') {
                const name = interaction.options.getString('name').trim();
                const leaderPing = interaction.options.getBoolean('leader_ping');
                const color = interaction.options.getString('color').trim();

                // Validate color
                if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    return interaction.reply({ content: 'Invalid color format. Use hex like #ff0000', ephemeral: true });
                }

                // Check if kingdom exists
                const existing = await findKingdom(interaction.guild.id, name);
                if (existing) {
                    return interaction.reply({ content: `Kingdom **${name}** already exists.`, ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });

                try {
                    // Create the roles automatically
                    const colorInt = parseInt(color.replace('#', ''), 16);
                    
                    // Get the member role to position kingdom roles below it
                    const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID || '1374421919373328434';
                    const serverMemberRole = interaction.guild.roles.cache.get(MEMBER_ROLE_ID);
                    const targetPosition = serverMemberRole ? serverMemberRole.position - 1 : 1;
                    
                    // Create leader role (positioned higher than member role)
                    const leaderRole = await interaction.guild.roles.create({
                        name: `${name} Ruler`,
                        color: colorInt,
                        mentionable: leaderPing,
                        position: targetPosition,
                        reason: `Kingdom created by ${interaction.user.tag}`
                    });

                    // Create member role (positioned below leader role)
                    const memberRole = await interaction.guild.roles.create({
                        name: `${name} Member`,
                        color: colorInt,
                        mentionable: false,
                        position: targetPosition - 1,
                        reason: `Kingdom created by ${interaction.user.tag}`
                    });

                    const kingdom = new Kingdom({
                        guildId: interaction.guild.id,
                        name: name,
                        nameLower: name.toLowerCase(),
                        memberRoleId: memberRole.id,
                        leaderRoleId: leaderRole.id,
                        leaderPing: leaderPing,
                        color: color,
                        createdBy: interaction.user.id,
                        createdAt: new Date()
                    });

                    await kingdom.save();

                    const embed = new EmbedBuilder()
                        .setTitle('Kingdom Created')
                        .setColor(color)
                        .addFields(
                            { name: 'Name', value: name, inline: true },
                            { name: 'Member Role', value: `${memberRole}`, inline: true },
                            { name: 'Leader Role', value: `${leaderRole}`, inline: true },
                            { name: 'Leader Ping', value: leaderPing ? 'Enabled' : 'Disabled', inline: true },
                            { name: 'Color', value: color, inline: true }
                        )
                        .setFooter({ text: `Created by ${interaction.user.tag}` })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [embed] });
                } catch (error) {
                    console.error('Error creating kingdom:', error);
                    return interaction.editReply({ content: `Failed to create kingdom: ${error.message}` });
                }
            }

            // DELETE
            if (sub === 'delete') {
                const name = interaction.options.getString('name');

                const kingdom = await findKingdom(interaction.guild.id, name);
                if (!kingdom) {
                    return interaction.reply({ content: `Kingdom **${name}** not found.`, ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });

                try {
                    // Delete the roles
                    const memberRole = interaction.guild.roles.cache.get(kingdom.memberRoleId);
                    const leaderRole = interaction.guild.roles.cache.get(kingdom.leaderRoleId);
                    
                    if (memberRole) {
                        await memberRole.delete(`Kingdom ${kingdom.name} deleted by ${interaction.user.tag}`).catch(() => {});
                    }
                    if (leaderRole) {
                        await leaderRole.delete(`Kingdom ${kingdom.name} deleted by ${interaction.user.tag}`).catch(() => {});
                    }
                    
                    await Kingdom.deleteOne({ _id: kingdom._id });
                    return interaction.editReply({ content: `Kingdom **${kingdom.name}** and its roles have been deleted.` });
                } catch (error) {
                    console.error('Error deleting kingdom:', error);
                    return interaction.editReply({ content: `Failed to delete kingdom: ${error.message}` });
                }
            }

            // LIST
            if (sub === 'list') {
                await interaction.deferReply({ ephemeral: true });

                try {
                    const kingdoms = await Kingdom.find({ guildId: interaction.guild.id }).sort({ name: 1 });

                    if (kingdoms.length === 0) {
                        return interaction.editReply({ content: 'No kingdoms configured.' });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('Kingdoms')
                        .setColor(getEmbedColor())
                        .setDescription(`${kingdoms.length} kingdom(s) configured`)
                        .setTimestamp();

                    for (const k of kingdoms.slice(0, 25)) {
                        const memberRole = interaction.guild.roles.cache.get(k.memberRoleId);
                        const leaderRole = interaction.guild.roles.cache.get(k.leaderRoleId);
                        const memberCount = memberRole ? interaction.guild.members.cache.filter(m => m.roles.cache.has(k.memberRoleId)).size : 0;
                        const leaderCount = leaderRole ? interaction.guild.members.cache.filter(m => m.roles.cache.has(k.leaderRoleId)).size : 0;

                        embed.addFields({
                            name: k.name,
                            value: `Leader: ${leaderRole || 'Unknown'} (${leaderCount})\nMembers: ${memberRole || 'Unknown'} (${memberCount})\nColor: ${k.color}`,
                            inline: true
                        });
                    }

                    return interaction.editReply({ embeds: [embed] });
                } catch (error) {
                    console.error('Error listing kingdoms:', error);
                    return interaction.editReply({ content: `Failed to list kingdoms: ${error.message}` });
                }
            }
        },

        async autocomplete(interaction) {
            const focused = interaction.options.getFocused().toLowerCase();
            const Kingdom = await getKingdomModel();
            const kingdoms = await Kingdom.find({ guildId: interaction.guild.id });

            const filtered = kingdoms
                .filter(k => k.name.toLowerCase().includes(focused))
                .slice(0, 25)
                .map(k => ({ name: k.name, value: k.name }));

            return interaction.respond(filtered);
        }
    }
];

/**
 * Prefix Commands (Everyone)
 */
const commands = {
    kingdom: {
        name: 'kingdom',
        description: 'Kingdom management commands',
        usage: '!kingdom <help|add|remove|list|transfer>',
        async execute(message, args, client) {
            const sub = args[0]?.toLowerCase();

            if (!sub || sub === 'help') {
                const embed = new EmbedBuilder()
                    .setTitle('Kingdom Commands')
                    .setColor(getEmbedColor())
                    .setDescription('Manage your kingdom membership')
                    .addFields(
                        { name: '!kingdom help', value: 'Show this help message', inline: false },
                        { name: '!kingdom add <@user>', value: 'Add a user to your kingdom (Rulers only)', inline: false },
                        { name: '!kingdom remove <@user>', value: 'Remove a user from your kingdom (Rulers only)', inline: false },
                        { name: '!kingdom list <kingdom name>', value: 'List all members of a kingdom', inline: false },
                        { name: '!kingdom transfer <@user>', value: 'Transfer leadership to another member (Rulers only)', inline: false }
                    )
                    .setFooter({ text: 'NewLife SMP' })
                    .setTimestamp();

                return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
            }

            const Kingdom = await getKingdomModel();

            // ADD
            if (sub === 'add') {
                // Get the kingdom this user rules
                const kingdom = await getUserRuledKingdom(message.guild.id, message.member);
                if (!kingdom) {
                    return message.reply({ content: 'You are not a ruler of any kingdom.', allowedMentions: { repliedUser: false } });
                }

                // Get target user
                const targetUser = message.mentions.members.first() || 
                    (args[1] ? await message.guild.members.fetch(args[1]).catch(() => null) : null);

                if (!targetUser) {
                    return message.reply({ content: 'Please mention a user or provide their ID.\nUsage: `!kingdom add @user`', allowedMentions: { repliedUser: false } });
                }

                // Check if target is already in a kingdom
                const targetKingdom = await getUserKingdom(message.guild.id, targetUser);
                if (targetKingdom) {
                    return message.reply({ content: `${targetUser.displayName} is already in **${targetKingdom.name}**.`, allowedMentions: { repliedUser: false } });
                }

                try {
                    await targetUser.roles.add(kingdom.memberRoleId, `Added to ${kingdom.name} by ${message.author.tag}`);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('Member Added')
                        .setColor(kingdom.color)
                        .setDescription(`${targetUser} has been added to **${kingdom.name}**`)
                        .setFooter({ text: `Added by ${message.author.tag}` })
                        .setTimestamp();

                    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
                } catch (error) {
                    console.error('Error adding kingdom member:', error);
                    return message.reply({ content: 'Failed to add member. Check bot permissions.', allowedMentions: { repliedUser: false } });
                }
            }

            // REMOVE
            if (sub === 'remove') {
                // Get the kingdom this user rules
                const kingdom = await getUserRuledKingdom(message.guild.id, message.member);
                if (!kingdom) {
                    return message.reply({ content: 'You are not a ruler of any kingdom.', allowedMentions: { repliedUser: false } });
                }

                // Get target user
                const targetUser = message.mentions.members.first() || 
                    (args[1] ? await message.guild.members.fetch(args[1]).catch(() => null) : null);

                if (!targetUser) {
                    return message.reply({ content: 'Please mention a user or provide their ID.\nUsage: `!kingdom remove @user`', allowedMentions: { repliedUser: false } });
                }

                // Check if target is in this kingdom
                const isMember = targetUser.roles.cache.has(kingdom.memberRoleId);
                const isLeader = targetUser.roles.cache.has(kingdom.leaderRoleId);

                if (!isMember && !isLeader) {
                    return message.reply({ content: `${targetUser.displayName} is not in **${kingdom.name}**.`, allowedMentions: { repliedUser: false } });
                }

                // Cannot remove yourself if you're the only ruler
                if (isLeader && targetUser.id === message.author.id) {
                    return message.reply({ content: 'You cannot remove yourself. Use `!kingdom transfer` to pass leadership first.', allowedMentions: { repliedUser: false } });
                }

                // Cannot remove another ruler
                if (isLeader && targetUser.id !== message.author.id) {
                    return message.reply({ content: 'You cannot remove another ruler.', allowedMentions: { repliedUser: false } });
                }

                try {
                    await targetUser.roles.remove(kingdom.memberRoleId, `Removed from ${kingdom.name} by ${message.author.tag}`);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('Member Removed')
                        .setColor(kingdom.color)
                        .setDescription(`${targetUser} has been removed from **${kingdom.name}**`)
                        .setFooter({ text: `Removed by ${message.author.tag}` })
                        .setTimestamp();

                    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
                } catch (error) {
                    console.error('Error removing kingdom member:', error);
                    return message.reply({ content: 'Failed to remove member. Check bot permissions.', allowedMentions: { repliedUser: false } });
                }
            }

            // LIST
            if (sub === 'list') {
                const kingdomName = args.slice(1).join(' ');

                if (!kingdomName) {
                    // List all kingdoms briefly
                    const kingdoms = await Kingdom.find({ guildId: message.guild.id }).sort({ name: 1 });

                    if (kingdoms.length === 0) {
                        return message.reply({ content: 'No kingdoms configured.', allowedMentions: { repliedUser: false } });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('Kingdoms')
                        .setColor(getEmbedColor())
                        .setDescription('Use `!kingdom list <name>` to see members')
                        .setTimestamp();

                    const lines = [];
                    for (const k of kingdoms) {
                        const memberRole = message.guild.roles.cache.get(k.memberRoleId);
                        const leaderRole = message.guild.roles.cache.get(k.leaderRoleId);
                        const totalMembers = message.guild.members.cache.filter(m => 
                            m.roles.cache.has(k.memberRoleId) || m.roles.cache.has(k.leaderRoleId)
                        ).size;
                        lines.push(`**${k.name}** - ${totalMembers} member(s)`);
                    }

                    embed.setDescription(lines.join('\n') || 'No kingdoms');
                    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
                }

                // Find the specific kingdom
                const kingdom = await findKingdom(message.guild.id, kingdomName);
                if (!kingdom) {
                    return message.reply({ content: `Kingdom **${kingdomName}** not found.`, allowedMentions: { repliedUser: false } });
                }

                // Get all members
                const leaders = message.guild.members.cache.filter(m => m.roles.cache.has(kingdom.leaderRoleId));
                const members = message.guild.members.cache.filter(m => 
                    m.roles.cache.has(kingdom.memberRoleId) && !m.roles.cache.has(kingdom.leaderRoleId)
                );

                const embed = new EmbedBuilder()
                    .setTitle(kingdom.name)
                    .setColor(kingdom.color)
                    .setTimestamp();

                // Leaders
                const leaderList = leaders.map(m => m.displayName).join('\n') || 'None';
                embed.addFields({ name: `Rulers (${leaders.size})`, value: leaderList.substring(0, 1024), inline: false });

                // Members (max 20 shown)
                const memberList = members.first(20).map(m => m.displayName).join('\n') || 'None';
                const memberValue = members.size > 20 
                    ? `${memberList}\n... and ${members.size - 20} more`
                    : memberList;
                embed.addFields({ name: `Members (${members.size})`, value: memberValue.substring(0, 1024), inline: false });

                embed.setFooter({ text: `Total: ${leaders.size + members.size} member(s)` });

                return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
            }

            // TRANSFER
            if (sub === 'transfer') {
                // Get the kingdom this user rules
                const kingdom = await getUserRuledKingdom(message.guild.id, message.member);
                if (!kingdom) {
                    return message.reply({ content: 'You are not a ruler of any kingdom.', allowedMentions: { repliedUser: false } });
                }

                // Get target user
                const targetUser = message.mentions.members.first() || 
                    (args[1] ? await message.guild.members.fetch(args[1]).catch(() => null) : null);

                if (!targetUser) {
                    return message.reply({ content: 'Please mention a user or provide their ID.\nUsage: `!kingdom transfer @user`', allowedMentions: { repliedUser: false } });
                }

                // Cannot transfer to yourself
                if (targetUser.id === message.author.id) {
                    return message.reply({ content: 'You cannot transfer leadership to yourself.', allowedMentions: { repliedUser: false } });
                }

                // Check if target is in this kingdom (member or leader)
                const isMember = targetUser.roles.cache.has(kingdom.memberRoleId);
                const isLeader = targetUser.roles.cache.has(kingdom.leaderRoleId);

                if (!isMember && !isLeader) {
                    return message.reply({ content: `${targetUser.displayName} must be a member of **${kingdom.name}** first.`, allowedMentions: { repliedUser: false } });
                }

                if (isLeader) {
                    return message.reply({ content: `${targetUser.displayName} is already a ruler of **${kingdom.name}**.`, allowedMentions: { repliedUser: false } });
                }

                try {
                    // Give target the leader role
                    await targetUser.roles.add(kingdom.leaderRoleId, `Leadership transferred from ${message.author.tag}`);
                    // Remove member role from target (they're now leader)
                    await targetUser.roles.remove(kingdom.memberRoleId, 'Promoted to leader').catch(() => {});
                    
                    // Remove leader role from current user
                    await message.member.roles.remove(kingdom.leaderRoleId, `Transferred leadership to ${targetUser.user.tag}`);
                    // Add member role to current user
                    await message.member.roles.add(kingdom.memberRoleId, 'Demoted to member after transfer').catch(() => {});

                    const embed = new EmbedBuilder()
                        .setTitle('Leadership Transferred')
                        .setColor(kingdom.color)
                        .setDescription(`Leadership of **${kingdom.name}** has been transferred to ${targetUser}`)
                        .addFields(
                            { name: 'New Ruler', value: `${targetUser}`, inline: true },
                            { name: 'Previous Ruler', value: `${message.author}`, inline: true }
                        )
                        .setFooter({ text: 'NewLife SMP' })
                        .setTimestamp();

                    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
                } catch (error) {
                    console.error('Error transferring kingdom leadership:', error);
                    return message.reply({ content: 'Failed to transfer leadership. Check bot permissions.', allowedMentions: { repliedUser: false } });
                }
            }

            // Unknown subcommand
            return message.reply({ content: 'Unknown subcommand. Use `!kingdom help` for available commands.', allowedMentions: { repliedUser: false } });
        }
    }
};

module.exports = {
    name: 'Kingdoms',
    description: 'Kingdom management system',
    slashCommands,
    commands
};
