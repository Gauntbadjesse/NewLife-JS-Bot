/**
 * Staff Infractions Cog
 * Issue and manage staff infractions: terminations, warnings, notices, strikes
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { randomUUID } = require('crypto');
const Infraction = require('../database/models/Infraction');
const { getNextCaseNumber } = require('../database/caseCounter');
const { isAdmin, isSupervisor, isManagement, isOwner } = require('../utils/permissions');
const { sendDM } = require('../utils/dm');

// Channel to post infractions
const INFRACTION_CHANNEL_ID = '1450253088693686313';

// Infraction type configurations
const INFRACTION_TYPES = {
    termination: {
        label: 'TERMINATION',
        color: 0x8B0000, // Dark red
        emoji: ' ',
        description: 'Employment/Position Terminated'
    },
    warning: {
        label: 'WARNING',
        color: 0xFF4500, // Orange red
        emoji: ' ',
        description: 'Formal Warning Issued'
    },
    notice: {
        label: 'NOTICE',
        color: 0xFFD700, // Gold
        emoji: ' ',
        description: 'Notice Issued'
    },
    strike: {
        label: 'STRIKE',
        color: 0xDC143C, // Crimson
        emoji: ' ',
        description: 'Strike Issued'
    }
};

/**
 * Build the infraction embed
 */
function buildInfractionEmbed(infraction, targetUser, issuerNickname) {
    const typeConfig = INFRACTION_TYPES[infraction.type];
    
    const embed = new EmbedBuilder()
        .setTitle(`${typeConfig.emoji} STAFF ${typeConfig.label}`)
        .setColor(typeConfig.color)
        .setDescription(`**${typeConfig.description}**`)
        .addFields(
            { 
                name: ' Staff Member', 
                value: `<@${infraction.targetId}>\n\`${infraction.targetTag}\``, 
                inline: true 
            },
            { 
                name: ' Type', 
                value: `**${typeConfig.label}**`, 
                inline: true 
            },
            { 
                name: ' Case', 
                value: `\`#${infraction.caseNumber}\``, 
                inline: true 
            },
            { 
                name: ' Reason', 
                value: infraction.reason, 
                inline: false 
            }
        )
        .setFooter({ 
            text: `Issued by ${issuerNickname} • Case #${infraction.caseNumber}` 
        })
        .setTimestamp(infraction.createdAt);
    
    // Add thumbnail if user has avatar
    if (targetUser?.displayAvatarURL) {
        embed.setThumbnail(targetUser.displayAvatarURL({ size: 128 }));
    }
    
    return embed;
}

/**
 * Slash Commands
 */
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('infract')
            .setDescription('Issue a staff infraction')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('The staff member to infract')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('type')
                .setDescription('Type of infraction')
                .setRequired(true)
                .addChoices(
                    { name: ' Termination', value: 'termination' },
                    { name: ' Warning', value: 'warning' },
                    { name: ' Notice', value: 'notice' },
                    { name: ' Strike', value: 'strike' }
                ))
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for the infraction')
                .setRequired(true)),
        
        async execute(interaction, client) {
            // Permission check - Management+ only
            if (!isManagement(interaction.member) && !isOwner(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ You do not have permission to issue staff infractions.', 
                    ephemeral: true 
                });
            }
            
            await interaction.deferReply({ ephemeral: true });
            
            const targetUser = interaction.options.getUser('user');
            const type = interaction.options.getString('type');
            const reason = interaction.options.getString('reason');
            
            // Get issuer nickname
            const issuerMember = interaction.member;
            const issuerNickname = issuerMember.nickname || issuerMember.user.displayName || issuerMember.user.username;
            
            try {
                // Get next case number
                const caseNumber = await getNextCaseNumber();
                
                // Create infraction record
                const infraction = new Infraction({
                    _id: randomUUID(),
                    caseNumber,
                    targetId: targetUser.id,
                    targetTag: targetUser.tag,
                    issuerId: interaction.user.id,
                    issuerTag: interaction.user.tag,
                    issuerNickname,
                    type,
                    reason,
                    guildId: interaction.guild.id,
                    createdAt: new Date()
                });
                
                await infraction.save();
                
                // Build embed
                const embed = buildInfractionEmbed(infraction, targetUser, issuerNickname);
                
                // Send to infraction channel
                const infractionChannel = await client.channels.fetch(INFRACTION_CHANNEL_ID).catch(() => null);
                if (infractionChannel) {
                    await infractionChannel.send({ embeds: [embed] });
                } else {
                    console.warn(`[Infractions] Could not find infraction channel: ${INFRACTION_CHANNEL_ID}`);
                }
                
                // DM the user
                const dmEmbed = new EmbedBuilder()
                    .setTitle(`${INFRACTION_TYPES[type].emoji} You Have Received a Staff ${INFRACTION_TYPES[type].label}`)
                    .setColor(INFRACTION_TYPES[type].color)
                    .setDescription(
                        `You have received an official **${INFRACTION_TYPES[type].label.toLowerCase()}** from **NewLife SMP** management.\n\n` +
                        `Please review the details below.`
                    )
                    .addFields(
                        { name: ' Type', value: `**${INFRACTION_TYPES[type].label}**`, inline: true },
                        { name: ' Case', value: `\`#${caseNumber}\``, inline: true },
                        { name: ' Reason', value: reason, inline: false }
                    )
                    .setFooter({ text: `Issued by ${issuerNickname}` })
                    .setTimestamp();
                
                const dmSent = await sendDM(targetUser, { embeds: [dmEmbed] });
                
                // Confirm to issuer
                const typeConfig = INFRACTION_TYPES[type];
                await interaction.editReply({
                    content: `✅ **${typeConfig.label}** issued to ${targetUser} (Case #${caseNumber})${dmSent ? '' : '\n⚠️ Could not DM user.'}`
                });
                
            } catch (error) {
                console.error('[Infractions] Error issuing infraction:', error);
                await interaction.editReply({
                    content: '❌ Failed to issue infraction. Please try again.'
                });
            }
        }
    },
    
    {
        data: new SlashCommandBuilder()
            .setName('infractions')
            .setDescription('View staff infractions')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('View infractions for a specific user')
                .setRequired(false))
            .addStringOption(opt => opt
                .setName('type')
                .setDescription('Filter by infraction type')
                .setRequired(false)
                .addChoices(
                    { name: ' Terminations', value: 'termination' },
                    { name: ' Warnings', value: 'warning' },
                    { name: ' Notices', value: 'notice' },
                    { name: ' Strikes', value: 'strike' }
                )),
        
        async execute(interaction, client) {
            // Permission check - Supervisor+ only
            if (!isSupervisor(interaction.member) && !isManagement(interaction.member) && !isOwner(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ You do not have permission to view infractions.', 
                    ephemeral: true 
                });
            }
            
            await interaction.deferReply({ ephemeral: true });
            
            const targetUser = interaction.options.getUser('user');
            const type = interaction.options.getString('type');
            
            try {
                // Build query
                const query = { guildId: interaction.guild.id };
                if (targetUser) query.targetId = targetUser.id;
                if (type) query.type = type;
                
                const infractions = await Infraction.find(query)
                    .sort({ createdAt: -1 })
                    .limit(15);
                
                if (infractions.length === 0) {
                    return interaction.editReply({
                        content: '📋 No infractions found matching your criteria.'
                    });
                }
                
                // Build embed
                const embed = new EmbedBuilder()
                    .setTitle(' Staff Infractions')
                    .setColor(0x2F3136)
                    .setTimestamp();
                
                if (targetUser) {
                    embed.setDescription(`Infractions for ${targetUser}`);
                    embed.setThumbnail(targetUser.displayAvatarURL({ size: 128 }));
                }
                
                const lines = infractions.map(inf => {
                    const typeConfig = INFRACTION_TYPES[inf.type];
                    const date = `<t:${Math.floor(new Date(inf.createdAt).getTime() / 1000)}:R>`;
                    const status = inf.active ? '' : ' *(revoked)*';
                    return `${typeConfig.emoji} **#${inf.caseNumber}** ${typeConfig.label}${status}\n` +
                           `└ <@${inf.targetId}> • ${inf.reason.substring(0, 50)}${inf.reason.length > 50 ? '...' : ''} • ${date}`;
                });
                
                embed.setDescription((embed.data.description ? embed.data.description + '\n\n' : '') + lines.join('\n\n'));
                embed.setFooter({ text: `${infractions.length} infraction(s) shown` });
                
                await interaction.editReply({ embeds: [embed] });
                
            } catch (error) {
                console.error('[Infractions] Error fetching infractions:', error);
                await interaction.editReply({
                    content: '❌ Failed to fetch infractions.'
                });
            }
        }
    },
    
    {
        data: new SlashCommandBuilder()
            .setName('revokeinfraction')
            .setDescription('Revoke a staff infraction')
            .addIntegerOption(opt => opt
                .setName('case')
                .setDescription('Case number to revoke')
                .setRequired(true)),
        
        async execute(interaction, client) {
            // Permission check - Management+ only
            if (!isManagement(interaction.member) && !isOwner(interaction.member)) {
                return interaction.reply({ 
                    content: '❌ You do not have permission to revoke infractions.', 
                    ephemeral: true 
                });
            }
            
            await interaction.deferReply({ ephemeral: true });
            
            const caseNumber = interaction.options.getInteger('case');
            
            try {
                const infraction = await Infraction.findOne({ caseNumber });
                
                if (!infraction) {
                    return interaction.editReply({
                        content: `❌ No infraction found with case #${caseNumber}.`
                    });
                }
                
                if (!infraction.active) {
                    return interaction.editReply({
                        content: `⚠️ Infraction #${caseNumber} is already revoked.`
                    });
                }
                
                infraction.active = false;
                await infraction.save();
                
                const typeConfig = INFRACTION_TYPES[infraction.type];
                await interaction.editReply({
                    content: `✅ **${typeConfig.label}** #${caseNumber} for <@${infraction.targetId}> has been revoked.`
                });
                
            } catch (error) {
                console.error('[Infractions] Error revoking infraction:', error);
                await interaction.editReply({
                    content: '❌ Failed to revoke infraction.'
                });
            }
        }
    }
];

module.exports = {
    name: 'infractions',
    slashCommands,
    commands: {}
};
