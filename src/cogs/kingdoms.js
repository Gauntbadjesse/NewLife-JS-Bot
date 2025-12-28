const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const Kingdom = require('../database/models/Kingdom');
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, getEmbedColor } = require('../utils/embeds');
const emojis = require('../utils/emojis');

const STAFF_ROLE_FALLBACK = process.env.STAFF_ROLE_ID || '1374421915938324583';
const HOIST_BELOW_ROLE_ID = process.env.KINGDOM_HOIST_BELOW || '1374421917284565046';

// Helper: ensure caller is staff (basic check)
function isStaff(member) {
    if (!member || !member.guild) return false;
    if (member.permissions && member.permissions.has && member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
    return member.roles.cache.has(String(STAFF_ROLE_FALLBACK));
}

async function ensureBotCanManageRoles(guild) {
    const me = guild.members.me;
    return me && me.permissions.has(PermissionsBitField.Flags.ManageRoles);
}

// Format color input (#rrggbb or integer)
function parseColor(input) {
    if (!input) return null;
    if (typeof input === 'number') return input;
    const s = String(input).trim();
    if (s.startsWith('#')) return parseInt(s.replace('#', ''), 16);
    // allow hex without #
    if (/^[0-9a-fA-F]{6}$/.test(s)) return parseInt(s, 16);
    return null;
}

// Prefix commands
const commands = {
    kingdom: {
        name: 'kingdom',
        description: 'Kingdom management (see subcommands)',
        usage: '!kingdom help',
        async execute(message, args, client) {
            const sub = (args[0] || '').toLowerCase();
            if (!sub || sub === 'help') {
                const embed = createInfoEmbed('Kingdom Commands',
                    '\n' +
                    '**!kingdom help** — show this message\n' +
                    '**!kingdom status <name>** — show kingdom info\n' +
                    '**!kingdom list <name>?** — list members\n' +
                    '**!kingdom add @user <name>** — add member (ruler)\n' +
                    '**!kingdom remove @user <name>** — remove member (ruler)\n' +
                    '**!kingdom transfer @user <name>** — transfer rulership'
                );
                return message.channel.send({ embeds: [embed] });
            }

            // status
            if (sub === 'status') {
                const name = args.slice(1).join(' ');
                if (!name) return message.reply({ embeds: [createErrorEmbed('Usage', 'Usage: !kingdom status <name>')] });
                const k = await Kingdom.findOne({ guildId: message.guild.id, name: name.toLowerCase().trim() });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not found', 'Kingdom not found')] });
                const leaderRole = message.guild.roles.cache.get(k.leaderRoleId);
                const memberRole = message.guild.roles.cache.get(k.memberRoleId);
                const leaders = leaderRole ? message.guild.members.cache.filter(m => m.roles.cache.has(leaderRole.id)).map(m => m.toString()) : [];
                const members = memberRole ? message.guild.members.cache.filter(m => m.roles.cache.has(memberRole.id)).map(m => m.displayName) : [];
                const embed = new EmbedBuilder()
                    .setTitle(`Kingdom — ${k.name}`)
                    .setColor(k.color || getEmbedColor())
                    .addFields(
                        { name: 'Leader(s)', value: leaders.join(', ') || 'None', inline: false },
                        { name: 'Members', value: `${members.length}`, inline: true }
                    )
                    .setFooter({ text: 'NewLife Management' })
                    .setTimestamp();
                if (members.length) embed.addFields({ name: 'Sample', value: members.slice(0, 25).join(', ') });
                return message.channel.send({ embeds: [embed] });
            }

            // list
            if (sub === 'list') {
                const name = args.slice(1).join(' ');
                if (!name) return message.reply({ embeds: [createErrorEmbed('Usage', 'Usage: !kingdom list <name>')] });
                const k = await Kingdom.findOne({ guildId: message.guild.id, name: name.toLowerCase().trim() });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not found', 'Kingdom not found')] });
                const memberRole = message.guild.roles.cache.get(k.memberRoleId);
                if (!memberRole) return message.reply({ embeds: [createErrorEmbed('Missing role', 'Member role not found in this guild')] });
                const members = message.guild.members.cache.filter(m => m.roles.cache.has(memberRole.id)).map(m => m.displayName);
                if (!members.length) return message.reply({ embeds: [createInfoEmbed('No members', 'No members for this kingdom')] });
                return message.channel.send({ content: `Members of ${k.name}: ${members.slice(0,200).join(', ')}` });
            }

            // add
            if (sub === 'add') {
                const user = message.mentions.members.first();
                const name = args.slice(2).join(' ');
                if (!user || !name) return message.reply({ embeds: [createErrorEmbed('Usage', 'Usage: !kingdom add @user <name>')] });
                // determine kingdom by the caller
                const k = await Kingdom.findOne({ guildId: message.guild.id, name: name.toLowerCase().trim() });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not found', 'Kingdom not found')] });
                const memberRole = message.guild.roles.cache.get(k.memberRoleId);
                if (!memberRole) return message.reply({ embeds: [createErrorEmbed('Missing role', 'Member role not found; contact staff.')] });
                if (user.roles.cache.has(memberRole.id)) return message.reply({ content: `${user} is already a member of ${k.name}` });
                if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return message.reply({ embeds: [createErrorEmbed('Missing perms', 'Bot lacks Manage Roles permission')] });
                try {
                    await user.roles.add(memberRole);
                    return message.channel.send({ content: `${emojis.CHECK} ${user} added to ${k.name}` });
                } catch (e) {
                    console.error('Error adding member role', e);
                    return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to add member role')] });
                }
            }

            // remove
            if (sub === 'remove') {
                const user = message.mentions.members.first();
                const name = args.slice(2).join(' ');
                if (!user || !name) return message.reply({ embeds: [createErrorEmbed('Usage', 'Usage: !kingdom remove @user <name>')] });
                const k = await Kingdom.findOne({ guildId: message.guild.id, name: name.toLowerCase().trim() });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not found', 'Kingdom not found')] });
                const memberRole = message.guild.roles.cache.get(k.memberRoleId);
                if (!memberRole) return message.reply({ embeds: [createErrorEmbed('Missing role', 'Member role not found; contact staff.')] });
                if (!user.roles.cache.has(memberRole.id)) return message.reply({ content: `${user} is not a member of ${k.name}` });
                try {
                    await user.roles.remove(memberRole);
                    return message.channel.send({ content: `${emojis.CHECK} ${user} removed from ${k.name}` });
                } catch (e) {
                    console.error('Error removing member', e);
                    return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to remove member role')] });
                }
            }

            // transfer
            if (sub === 'transfer') {
                const user = message.mentions.members.first();
                const name = args.slice(2).join(' ');
                if (!user || !name) return message.reply({ embeds: [createErrorEmbed('Usage', 'Usage: !kingdom transfer @user <name>')] });
                const k = await Kingdom.findOne({ guildId: message.guild.id, name: name.toLowerCase().trim() });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not found', 'Kingdom not found')] });
                const leaderRole = message.guild.roles.cache.get(k.leaderRoleId);
                if (!leaderRole) return message.reply({ embeds: [createErrorEmbed('Missing role', 'Leader role not found; contact staff.')] });
                try {
                    await user.roles.add(leaderRole);
                    if (message.member.roles.cache.has(leaderRole.id)) await message.member.roles.remove(leaderRole);
                    return message.channel.send({ content: `${emojis.CHECK} ${user} is now the ruler of ${k.name}` });
                } catch (e) {
                    console.error('Error transferring leadership', e);
                    return message.reply({ embeds: [createErrorEmbed('Error', 'Failed to transfer leadership')] });
                }
            }

            // unknown
            return message.reply({ embeds: [createErrorEmbed('Unknown', 'Unknown subcommand. Use `!kingdom help`.')] });
        }
    }
};

// Slash commands
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('kingdom_create')
            .setDescription('Create a kingdom (staff only)')
            .addStringOption(o => o.setName('name').setDescription('Kingdom name').setRequired(true))
            .addStringOption(o => o.setName('color').setDescription('Hex color like #RRGGBB').setRequired(false)),
        async execute(interaction, client) {
            const author = interaction.user;
            if (!interaction.guild) return interaction.reply({ embeds: [createErrorEmbed('Context', 'This command must be used in a guild.')], ephemeral: true });
            const member = interaction.guild.members.cache.get(author.id);
            if (!member) return interaction.reply({ embeds: [createErrorEmbed('Context', 'Member context required.')], ephemeral: true });
            if (!isStaff(member) && !member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({ embeds: [createErrorEmbed('Permission', 'You do not have permission to create kingdoms.')], ephemeral: true });
            }

            const name = interaction.options.getString('name').trim();
            const colorRaw = interaction.options.getString('color');
            const color = parseColor(colorRaw) || null;

            const existing = await Kingdom.findOne({ guildId: interaction.guild.id, name: name.toLowerCase() });
            if (existing) return interaction.reply({ embeds: [createErrorEmbed('Exists', 'A kingdom with that name already exists.')], ephemeral: true });

            if (!await ensureBotCanManageRoles(interaction.guild)) {
                return interaction.reply({ embeds: [createErrorEmbed('Permissions', 'Bot lacks Manage Roles permission.')], ephemeral: true });
            }

            // Create roles (leader and member)
            try {
                const hoistBelow = interaction.guild.roles.cache.get(HOIST_BELOW_ROLE_ID);
                const basePosition = hoistBelow ? hoistBelow.position : null;

                const leaderRole = await interaction.guild.roles.create({
                    name: `${name} — Ruler`,
                    color: color || null,
                    hoist: true,
                    reason: `Kingdom created by ${author.tag}`
                });

                const memberRole = await interaction.guild.roles.create({
                    name: `${name} — Member`,
                    color: color || null,
                    hoist: true,
                    reason: `Kingdom created by ${author.tag}`
                });

                // Try position: place roles just below hoistBelow role
                try {
                    if (basePosition !== null) {
                        // set leader just below target, member just below leader
                        await leaderRole.setPosition(basePosition - 1).catch(() => {});
                        await memberRole.setPosition(basePosition - 2).catch(() => {});
                    }
                } catch (e) {
                    // ignore position errors
                }

                // Persist to DB
                const doc = new Kingdom({
                    guildId: interaction.guild.id,
                    name: name.toLowerCase(),
                    leaderRoleId: leaderRole.id,
                    memberRoleId: memberRole.id,
                    color: color,
                    createdBy: author.id
                });
                await doc.save();

                return interaction.reply({ embeds: [createSuccessEmbed('Kingdom Created', `Created kingdom **${name}** with roles ${leaderRole} and ${memberRole}.`)], ephemeral: true });
            } catch (e) {
                console.error('Error creating kingdom', e);
                return interaction.reply({ embeds: [createErrorEmbed('Failed', 'Failed to create kingdom. Check bot permissions and try again.')], ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('kingdom_delete')
            .setDescription('Delete a kingdom configuration (staff only)')
            .addStringOption(o => o.setName('name').setDescription('Kingdom name').setRequired(true)),
        async execute(interaction, client) {
            if (!interaction.guild) return interaction.reply({ embeds: [createErrorEmbed('Context', 'This must be run in a server.')], ephemeral: true });
            const member = interaction.guild.members.cache.get(interaction.user.id);
            if (!member) return interaction.reply({ embeds: [createErrorEmbed('Context', 'Member context required.')], ephemeral: true });
            if (!isStaff(member) && !member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({ embeds: [createErrorEmbed('Permission', 'You do not have permission.')], ephemeral: true });
            const name = interaction.options.getString('name').trim().toLowerCase();
            const res = await Kingdom.findOneAndDelete({ guildId: interaction.guild.id, name });
            if (!res) return interaction.reply({ embeds: [createErrorEmbed('Not found', 'No such kingdom found.')], ephemeral: true });
            return interaction.reply({ embeds: [createSuccessEmbed('Deleted', `Kingdom **${name}** removed from configuration.`)], ephemeral: true });
        }
    }
];

module.exports = { name: 'Kingdoms', description: 'Manage kingdoms (roles + members)', commands, slashCommands };
