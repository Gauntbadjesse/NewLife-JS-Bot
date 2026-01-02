/**
 * Kingdoms Cog
 * Discord-side kingdom management via !kingdom commands
 * Uses existing MongoDB kingdoms collection
 */
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Kingdom = require('../database/models/Kingdom');
const { createErrorEmbed, createSuccessEmbed, createInfoEmbed, getEmbedColor } = require('../utils/embeds');
const emojis = require('../utils/emojis');

const STAFF_ROLE_FALLBACK = process.env.STAFF_ROLE_ID || '1374421915938324583';

function isStaff(member) {
    if (!member || !member.guild) return false;
    if (member.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) return true;
    return member.roles.cache.has(String(STAFF_ROLE_FALLBACK));
}

function isLeaderOf(member, kingdom) {
    return member.roles.cache.has(kingdom.leader_role_id);
}

// Prefix commands only - Discord side
const commands = {
    kingdom: {
        name: 'kingdom',
        description: 'Kingdom management',
        usage: '!kingdom <subcommand>',
        async execute(message, args, client) {
            const sub = (args[0] || '').toLowerCase();
            
            // Help
            if (!sub || sub === 'help') {
                const embed = createInfoEmbed('Kingdom Commands',
                    '**!kingdom list** — list all kingdoms\n' +
                    '**!kingdom info <name>** — show kingdom details\n' +
                    '**!kingdom members <name>** — list all members\n' +
                    '**!kingdom add @user <name>** — add member (leader/staff)\n' +
                    '**!kingdom remove @user <name>** — remove member (leader/staff)\n' +
                    '**!kingdom promote @user <name>** — promote to leader (staff)\n' +
                    '**!kingdom demote @user <name>** — demote from leader (staff)'
                );
                return message.channel.send({ embeds: [embed] });
            }

            // List all kingdoms
            if (sub === 'list') {
                const kingdoms = await Kingdom.find({ guild_id: message.guild.id });
                if (!kingdoms.length) {
                    return message.reply({ embeds: [createInfoEmbed('No Kingdoms', 'No kingdoms configured.')] });
                }
                
                const lines = [];
                for (const k of kingdoms) {
                    const memberRole = message.guild.roles.cache.get(k.member_role_id);
                    const count = memberRole ? message.guild.members.cache.filter(m => m.roles.cache.has(memberRole.id)).size : 0;
                    lines.push(`• **${k.name}** — ${count} members`);
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('�� Kingdoms')
                    .setDescription(lines.join('\n'))
                    .setColor(getEmbedColor())
                    .setFooter({ text: 'Use !kingdom info <name> for details' })
                    .setTimestamp();
                return message.channel.send({ embeds: [embed] });
            }

            // Info about a kingdom
            if (sub === 'info') {
                const name = args.slice(1).join(' ').toLowerCase();
                if (!name) return message.reply({ embeds: [createErrorEmbed('Usage', '!kingdom info <name>')] });
                
                const k = await Kingdom.findOne({ guild_id: message.guild.id, name });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not Found', 'Kingdom not found.')] });
                
                const leaderRole = message.guild.roles.cache.get(k.leader_role_id);
                const memberRole = message.guild.roles.cache.get(k.member_role_id);
                const leaders = leaderRole ? message.guild.members.cache.filter(m => m.roles.cache.has(leaderRole.id)).map(m => m.toString()) : [];
                const memberCount = memberRole ? message.guild.members.cache.filter(m => m.roles.cache.has(memberRole.id)).size : 0;
                
                const embed = new EmbedBuilder()
                    .setTitle(`🏰 ${k.name.charAt(0).toUpperCase() + k.name.slice(1)}`)
                    .setColor(getEmbedColor())
                    .addFields(
                        { name: '👑 Leaders', value: leaders.length ? leaders.join(', ') : 'None', inline: false },
                        { name: '👥 Members', value: `${memberCount}`, inline: true },
                        { name: '📅 Created', value: k.created_at ? `<t:${Math.floor(new Date(k.created_at).getTime() / 1000)}:R>` : 'Unknown', inline: true }
                    )
                    .setFooter({ text: 'NewLife SMP' })
                    .setTimestamp();
                return message.channel.send({ embeds: [embed] });
            }

            // List members
            if (sub === 'members') {
                const name = args.slice(1).join(' ').toLowerCase();
                if (!name) return message.reply({ embeds: [createErrorEmbed('Usage', '!kingdom members <name>')] });
                
                const k = await Kingdom.findOne({ guild_id: message.guild.id, name });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not Found', 'Kingdom not found.')] });
                
                const memberRole = message.guild.roles.cache.get(k.member_role_id);
                if (!memberRole) return message.reply({ embeds: [createErrorEmbed('Error', 'Member role not found.')] });
                
                const members = message.guild.members.cache.filter(m => m.roles.cache.has(memberRole.id));
                if (!members.size) return message.reply({ embeds: [createInfoEmbed('No Members', 'This kingdom has no members.')] });
                
                const list = members.map(m => m.displayName).slice(0, 50).join(', ');
                const embed = new EmbedBuilder()
                    .setTitle(`👥 ${k.name} Members`)
                    .setDescription(list + (members.size > 50 ? `\n... and ${members.size - 50} more` : ''))
                    .setColor(getEmbedColor())
                    .setFooter({ text: `Total: ${members.size}` });
                return message.channel.send({ embeds: [embed] });
            }

            // Add member (leader or staff only)
            if (sub === 'add') {
                const user = message.mentions.members.first();
                const name = args.slice(2).join(' ').toLowerCase();
                if (!user || !name) return message.reply({ embeds: [createErrorEmbed('Usage', '!kingdom add @user <name>')] });
                
                const k = await Kingdom.findOne({ guild_id: message.guild.id, name });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not Found', 'Kingdom not found.')] });
                
                // Permission check: must be leader or staff
                if (!isLeaderOf(message.member, k) && !isStaff(message.member)) {
                    return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only leaders or staff can add members.')] });
                }
                
                const memberRole = message.guild.roles.cache.get(k.member_role_id);
                if (!memberRole) return message.reply({ embeds: [createErrorEmbed('Error', 'Member role not found.')] });
                
                if (user.roles.cache.has(memberRole.id)) {
                    return message.reply({ content: `${user} is already a member of ${k.name}.` });
                }
                
                await user.roles.add(memberRole);
                return message.channel.send({ content: `${emojis.CHECK} ${user} added to **${k.name}**` });
            }

            // Remove member
            if (sub === 'remove') {
                const user = message.mentions.members.first();
                const name = args.slice(2).join(' ').toLowerCase();
                if (!user || !name) return message.reply({ embeds: [createErrorEmbed('Usage', '!kingdom remove @user <name>')] });
                
                const k = await Kingdom.findOne({ guild_id: message.guild.id, name });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not Found', 'Kingdom not found.')] });
                
                if (!isLeaderOf(message.member, k) && !isStaff(message.member)) {
                    return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only leaders or staff can remove members.')] });
                }
                
                const memberRole = message.guild.roles.cache.get(k.member_role_id);
                if (!memberRole) return message.reply({ embeds: [createErrorEmbed('Error', 'Member role not found.')] });
                
                if (!user.roles.cache.has(memberRole.id)) {
                    return message.reply({ content: `${user} is not a member of ${k.name}.` });
                }
                
                await user.roles.remove(memberRole);
                // Also remove leader role if they have it
                const leaderRole = message.guild.roles.cache.get(k.leader_role_id);
                if (leaderRole && user.roles.cache.has(leaderRole.id)) {
                    await user.roles.remove(leaderRole);
                }
                return message.channel.send({ content: `${emojis.CHECK} ${user} removed from **${k.name}**` });
            }

            // Promote to leader (staff only)
            if (sub === 'promote') {
                const user = message.mentions.members.first();
                const name = args.slice(2).join(' ').toLowerCase();
                if (!user || !name) return message.reply({ embeds: [createErrorEmbed('Usage', '!kingdom promote @user <name>')] });
                
                if (!isStaff(message.member)) {
                    return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only staff can promote leaders.')] });
                }
                
                const k = await Kingdom.findOne({ guild_id: message.guild.id, name });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not Found', 'Kingdom not found.')] });
                
                const leaderRole = message.guild.roles.cache.get(k.leader_role_id);
                const memberRole = message.guild.roles.cache.get(k.member_role_id);
                if (!leaderRole) return message.reply({ embeds: [createErrorEmbed('Error', 'Leader role not found.')] });
                
                // Ensure they have member role too
                if (memberRole && !user.roles.cache.has(memberRole.id)) {
                    await user.roles.add(memberRole);
                }
                await user.roles.add(leaderRole);
                return message.channel.send({ content: `${emojis.CHECK} ${user} promoted to leader of **${k.name}**` });
            }

            // Demote from leader (staff only)
            if (sub === 'demote') {
                const user = message.mentions.members.first();
                const name = args.slice(2).join(' ').toLowerCase();
                if (!user || !name) return message.reply({ embeds: [createErrorEmbed('Usage', '!kingdom demote @user <name>')] });
                
                if (!isStaff(message.member)) {
                    return message.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only staff can demote leaders.')] });
                }
                
                const k = await Kingdom.findOne({ guild_id: message.guild.id, name });
                if (!k) return message.reply({ embeds: [createErrorEmbed('Not Found', 'Kingdom not found.')] });
                
                const leaderRole = message.guild.roles.cache.get(k.leader_role_id);
                if (!leaderRole) return message.reply({ embeds: [createErrorEmbed('Error', 'Leader role not found.')] });
                
                if (!user.roles.cache.has(leaderRole.id)) {
                    return message.reply({ content: `${user} is not a leader of ${k.name}.` });
                }
                
                await user.roles.remove(leaderRole);
                return message.channel.send({ content: `${emojis.CHECK} ${user} demoted from leader of **${k.name}**` });
            }

            return message.reply({ embeds: [createErrorEmbed('Unknown', 'Unknown subcommand. Use `!kingdom help`.')] });
        }
    }
};

module.exports = { 
    name: 'Kingdoms', 
    description: 'Discord-side kingdom management', 
    commands,
    slashCommands: [] // No slash commands - Discord side uses prefix
};
