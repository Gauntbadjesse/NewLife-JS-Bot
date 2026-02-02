/**
 * Enhanced Player Lookup Cog
 * Comprehensive player information lookup with notes, history, and activity
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Ban = require('../database/models/Ban');
const Warning = require('../database/models/Warning');
const Note = require('../database/models/Note');
const Application = require('../database/models/Application');
const WhitelistApplication = require('../database/models/WhitelistApplication');
const LinkedAccount = require('../database/models/LinkedAccount');
const { isModerator, isAdmin, isStaff, isSupervisor, isManagement, isOwner } = require('../utils/permissions');
const { resolvePlayer } = require('../utils/playerResolver');
const { lookupMcProfile } = require('../utils/minecraft');

/**
 * Get linked account info
 */
async function getLinkedInfo(playerName, uuid, discordId) {
    // Try multiple lookups
    let linked = null;
    
    if (discordId) {
        linked = await LinkedAccount.findOne({ discordId });
    }
    
    if (!linked && uuid) {
        linked = await LinkedAccount.findOne({ uuid });
    }
    
    if (!linked && playerName) {
        linked = await LinkedAccount.findOne({ 
            minecraftUsername: { $regex: new RegExp(`^${playerName}$`, 'i') }
        });
    }
    
    return linked;
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('playerlookup')
            .setDescription('Comprehensive player information lookup')
            .addStringOption(opt => opt
                .setName('player')
                .setDescription('Player name, UUID, or @mention')
                .setRequired(true)
            )
            .addBooleanOption(opt => opt
                .setName('detailed')
                .setDescription('Show detailed information')
                .setRequired(false)
            ),

        async execute(interaction, client) {
            if (!isModerator(interaction.member)) {
                return interaction.reply({ content: 'Permission denied.', ephemeral: true });
            }

            await interaction.deferReply();

            const playerInput = interaction.options.getString('player');
            const detailed = interaction.options.getBoolean('detailed') ?? false;

            // Initialize search variables
            let playerName = playerInput;
            let uuid = null;
            let discordId = null;
            let discordUser = null;
            let mcProfile = null;

            // Check if it's a Discord mention
            const mentionMatch = playerInput.match(/<@!?(\d+)>/);
            if (mentionMatch) {
                discordId = mentionMatch[1];
                try {
                    discordUser = await client.users.fetch(discordId);
                } catch (e) {}
            }

            // Try to resolve player (Minecraft lookup)
            try {
                const resolved = await resolvePlayer(playerInput);
                if (resolved) {
                    playerName = resolved.name;
                    uuid = resolved.uuid;
                }
            } catch (e) {}

            // Try MC profile API
            if (!uuid && !discordId) {
                mcProfile = await lookupMcProfile(playerName, 'java');
                if (mcProfile && mcProfile.uuid) {
                    uuid = mcProfile.uuid;
                    playerName = mcProfile.name || playerName;
                }
            }

            // Get linked account
            const linked = await getLinkedInfo(playerName, uuid, discordId);
            
            // If we found a linked account, update our search params
            if (linked) {
                playerName = linked.minecraftUsername || playerName;
                uuid = linked.uuid || uuid;
                discordId = linked.discordId || discordId;
                
                if (discordId && !discordUser) {
                    try {
                        discordUser = await client.users.fetch(discordId);
                    } catch (e) {}
                }
            }

            // Query all data
            const warningQuery = uuid 
                ? { $or: [{ uuid }, { playerName: { $regex: new RegExp(`^${playerName}$`, 'i') } }] }
                : { playerName: { $regex: new RegExp(`^${playerName}$`, 'i') } };
            
            const banQuery = warningQuery;

            const [warnings, bans, notes, application, whitelistApp] = await Promise.all([
                Warning.find(warningQuery).sort({ createdAt: -1 }),
                Ban.find(banQuery).sort({ createdAt: -1 }),
                Note.find({ playerName: playerName.toLowerCase() }).sort({ createdAt: -1 }),
                Application.findOne({ playerName: { $regex: new RegExp(`^${playerName}$`, 'i') } }).sort({ createdAt: -1 }),
                // Also check WhitelistApplication by discordId or linked accounts
                discordId 
                    ? WhitelistApplication.findOne({ discordId }).sort({ createdAt: -1 })
                    : WhitelistApplication.findOne({ 'linkedAccounts.minecraftUsername': { $regex: new RegExp(`^${playerName}$`, 'i') } }).sort({ createdAt: -1 })
            ]);

            // Use whichever application we found (prefer WhitelistApplication as it's newer)
            const effectiveApplication = whitelistApp || application;

            // Build the embed
            const embed = new EmbedBuilder()
                .setTitle(`Player Lookup: ${playerName}`)
                .setColor('#3b82f6')
                .setTimestamp();

            // Basic info section
            let basicInfo = '';
            if (uuid) basicInfo += `**UUID:** \`${uuid}\`\n`;
            if (discordUser) basicInfo += `**Discord:** ${discordUser.tag} (<@${discordId}>)\n`;
            if (linked?.linkedAt) basicInfo += `**Linked:** <t:${Math.floor(new Date(linked.linkedAt).getTime() / 1000)}:R>\n`;
            if (effectiveApplication) {
                basicInfo += `**Application:** ${effectiveApplication.status || 'submitted'} `;
                if (effectiveApplication.createdAt) {
                    basicInfo += `(<t:${Math.floor(new Date(effectiveApplication.createdAt).getTime() / 1000)}:R>)`;
                }
                basicInfo += '\n';
            }

            if (basicInfo) {
                embed.addFields({ name: 'Basic Info', value: basicInfo, inline: false });
            }

            // Statistics
            const activeWarnings = warnings.filter(w => w.active).length;
            const activeBans = bans.filter(b => b.active).length;

            embed.addFields(
                { name: 'Warnings', value: `${activeWarnings} active / ${warnings.length} total`, inline: true },
                { name: 'Bans', value: `${activeBans} active / ${bans.length} total`, inline: true },
                { name: 'Notes', value: `${notes.length}`, inline: true }
            );

            // Active ban status
            const activeBan = bans.find(b => b.active);
            if (activeBan) {
                let banInfo = `**Reason:** ${activeBan.reason}\n`;
                banInfo += `**By:** ${activeBan.staffName}\n`;
                banInfo += `**Date:** <t:${Math.floor(new Date(activeBan.createdAt).getTime() / 1000)}:R>`;
                if (activeBan.expiresAt) {
                    banInfo += `\n**Expires:** <t:${Math.floor(new Date(activeBan.expiresAt).getTime() / 1000)}:R>`;
                } else {
                    banInfo += '\n**Duration:** Permanent';
                }
                embed.addFields({ name: 'Currently Banned', value: banInfo, inline: false });
            }

            // Recent warnings
            if (warnings.length > 0 && detailed) {
                const recentWarnings = warnings.slice(0, 5).map((w, i) => {
                    const status = w.active ? '[Active]' : '[Inactive]';
                    const date = `<t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:R>`;
                    return `${status} \`#${w.caseNumber || i + 1}\` ${w.reason.substring(0, 40)}${w.reason.length > 40 ? '...' : ''} - ${date}`;
                }).join('\n');
                embed.addFields({ name: 'Recent Warnings', value: recentWarnings, inline: false });
            }

            // Recent bans
            if (bans.length > 0 && detailed) {
                const recentBans = bans.slice(0, 3).map((b, i) => {
                    const status = b.active ? '[Active]' : '[Inactive]';
                    const date = `<t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R>`;
                    return `${status} \`#${b.caseNumber || i + 1}\` ${b.reason.substring(0, 40)}${b.reason.length > 40 ? '...' : ''} - ${date}`;
                }).join('\n');
                embed.addFields({ name: 'Ban History', value: recentBans, inline: false });
            }

            // Staff notes (only visible to admins or if detailed)
            if (notes.length > 0 && (isAdmin(interaction.member) || detailed)) {
                const recentNotes = notes.slice(0, 3).map(n => {
                    const date = `<t:${Math.floor(new Date(n.createdAt).getTime() / 1000)}:R>`;
                    return `- ${n.content.substring(0, 60)}${n.content.length > 60 ? '...' : ''}\n  _by ${n.staffName} ${date}_`;
                }).join('\n');
                embed.addFields({ name: 'Staff Notes', value: recentNotes, inline: false });
            }

            // Risk assessment
            let riskLevel = 'Low';
            let riskColor = '[Low]';
            const totalInfractions = warnings.length + (bans.length * 3);
            
            if (activeBan) {
                riskLevel = 'Banned';
                riskColor = '[Banned]';
            } else if (totalInfractions >= 10 || activeWarnings >= 3) {
                riskLevel = 'High';
                riskColor = '[High]';
            } else if (totalInfractions >= 5 || activeWarnings >= 1) {
                riskLevel = 'Medium';
                riskColor = '[Medium]';
            }

            embed.addFields({ name: 'Risk Level', value: `${riskColor}`, inline: true });

            // Set thumbnail if we have MC profile
            if (uuid) {
                embed.setThumbnail(`https://mc-heads.net/avatar/${uuid}/128`);
            }

            embed.setFooter({ text: 'NewLife Management | Player Lookup' });

            // Action buttons
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`pl_refresh_${playerName}`)
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`pl_addnote_${playerName}`)
                    .setLabel('Add Note')
                    .setStyle(ButtonStyle.Primary)
            );

            if (!activeBan) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pl_warn_${playerName}`)
                        .setLabel('Warn')
                        .setStyle(ButtonStyle.Danger)
                );
            }

            return interaction.editReply({ embeds: [embed], components: [row] });
        }
    }
];

/**
 * Prefix commands for staff to manage linked accounts
 */
const commands = {
    // !linked [@user|id|minecraft] - show linked accounts
    linked: {
        name: 'linked',
        description: 'Show linked Minecraft accounts for a Discord user or Minecraft name',
        usage: '!linked <@user|discordId|minecraft>',
        async execute(message, args, client) {
            if (!(isAdmin(message.member) || isSupervisor(message.member) || isManagement(message.member) || isOwner(message.member))) return message.reply({ content: 'Permission denied.', allowedMentions: { repliedUser: false } });
            if (!args[0]) return message.reply({ content: 'Usage: !linked <@user|discordId|minecraft>', allowedMentions: { repliedUser: false } });

            const target = args[0];
            let results = [];

            // Discord mention
            const mentionMatch = target.match(/<@!?(\d+)>/);
            if (mentionMatch) {
                const discordId = mentionMatch[1];
                results = await LinkedAccount.find({ discordId: String(discordId) }).sort({ linkedAt: -1 });
            } else if (/^[0-9]{17,19}$/.test(target)) {
                // Discord ID
                results = await LinkedAccount.find({ discordId: String(target) }).sort({ linkedAt: -1 });
            } else {
                // Assume Minecraft username or uuid
                results = await LinkedAccount.find({ $or: [ { minecraftUsername: { $regex: new RegExp(`^${target}$`, 'i') } }, { uuid: target } ] }).sort({ linkedAt: -1 });
            }

            if (!results || results.length === 0) return message.reply({ content: 'No linked accounts found.', allowedMentions: { repliedUser: false } });

            const lines = results.map(r => {
                const icon = r.platform === 'bedrock' ? '[Bedrock]' : '[Java]';
                const primary = r.primary ? ' [Primary]' : '';
                return `${icon} **${r.minecraftUsername}**${primary} (\`${r.uuid}\`) — <@${r.discordId}> — linked <t:${Math.floor(new Date(r.linkedAt).getTime()/1000)}:R>`;
            });
            const chunk = [];
            for (let i = 0; i < lines.length; i += 20) chunk.push(lines.slice(i, i+20).join('\n'));

            for (const part of chunk) {
                await message.channel.send({ content: part, allowedMentions: { users: [] } });
            }
            try { await message.delete(); } catch (e) { /* ignore */ }
        }
    },

    // !link <discord> <platform> <minecraft> - staff manually link an account
    link: {
        name: 'link',
        description: 'Manually link a Minecraft account to a Discord user (staff-only)',
        usage: '!link <@user|discordId> <java|bedrock> <minecraftUsername>',
        async execute(message, args, client) {
            if (!(isAdmin(message.member) || isSupervisor(message.member) || isManagement(message.member) || isOwner(message.member))) return message.reply({ content: 'Permission denied.', allowedMentions: { repliedUser: false } });
            if (!args[0] || !args[1] || !args[2]) return message.reply({ content: 'Usage: !link <@user|discordId> <java|bedrock> <minecraftUsername>', allowedMentions: { repliedUser: false } });

            // Resolve discord id
            const mentionMatch = args[0].match(/<@!?(\d+)>/);
            const discordId = mentionMatch ? mentionMatch[1] : args[0];
            const platform = args[1].toLowerCase();
            const mcName = args.slice(2).join(' '); // Allow spaces for bedrock names

            if (platform !== 'java' && platform !== 'bedrock') {
                return message.reply({ content: 'Platform must be `java` or `bedrock`.', allowedMentions: { repliedUser: false } });
            }

            // Resolve mc uuid/fuuid
            let uuid = null;
            try {
                const profile = await lookupMcProfile(mcName, platform);
                if (!profile || !profile.uuid) return message.reply({ content: 'Failed to resolve Minecraft username.', allowedMentions: { repliedUser: false } });
                uuid = profile.uuid;
            } catch (e) {
                return message.reply({ content: 'Failed to resolve Minecraft username.', allowedMentions: { repliedUser: false } });
            }

            // Check existing
            const existing = await LinkedAccount.findOne({ discordId: String(discordId), uuid });
            if (existing) return message.reply({ content: 'This Minecraft account is already linked to that Discord user.', allowedMentions: { repliedUser: false } });

            const count = await LinkedAccount.countDocuments({ discordId: String(discordId) });
            await new LinkedAccount({ 
                discordId: String(discordId), 
                minecraftUsername: mcName, 
                uuid, 
                platform, 
                linkedAt: new Date(),
                linkedBy: message.author.id,
                primary: count === 0
            }).save();
            
            const icon = platform === 'bedrock' ? '[Bedrock]' : '[Java]';
            await message.channel.send({ content: `Linked ${icon} **${mcName}** (${platform}) to <@${discordId}>.`, allowedMentions: { repliedUser: false } });
            try { await message.delete(); } catch (e) { /* ignore */ }
        }
    }
};

/**
 * Handle lookup action buttons
 */
async function handleLookupButton(interaction, client) {
    const [, action, ...playerParts] = interaction.customId.split('_');
    const playerName = playerParts.join('_');

    if (action === 'refresh') {
        // Re-run the lookup
        await interaction.deferUpdate();
        
        // Simulate command re-execution
        const command = slashCommands[0];
        const fakeInteraction = {
            ...interaction,
            options: {
                getString: (name) => name === 'player' ? playerName : null,
                getBoolean: () => true
            },
            deferReply: async () => {},
            editReply: async (data) => interaction.editReply(data),
            reply: async (data) => interaction.editReply(data)
        };
        
        await command.execute(fakeInteraction, client);
        return;
    }

    if (action === 'addnote') {
        // Show modal for adding note
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder: ModalRow } = require('discord.js');
        
        const modal = new ModalBuilder()
            .setCustomId(`pl_note_modal_${playerName}`)
            .setTitle(`Add Note for ${playerName}`);

        modal.addComponents(
            new ModalRow().addComponents(
                new TextInputBuilder()
                    .setCustomId('note_content')
                    .setLabel('Note Content')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000)
            )
        );

        return interaction.showModal(modal);
    }

    if (action === 'warn') {
        return interaction.reply({
            content: `Use \`/warn ${playerName} <reason>\` to warn this player.`,
            ephemeral: true
        });
    }
}

/**
 * Handle note modal submission
 */
async function handleLookupNoteModal(interaction) {
    if (!interaction.customId.startsWith('pl_note_modal_')) return false;

    const playerName = interaction.customId.replace('pl_note_modal_', '');
    const content = interaction.fields.getTextInputValue('note_content');

    const note = new Note({
        playerName: playerName.toLowerCase(),
        staffId: interaction.user.id,
        staffName: interaction.user.tag,
        content,
        createdAt: new Date()
    });

    await note.save();

    return interaction.reply({
        content: `Note added for **${playerName}**.`,
        ephemeral: true
    });
}

module.exports = {
    name: 'PlayerLookup',
    commands,
    slashCommands,
    handleLookupButton,
    handleLookupNoteModal,
    lookupMcProfile,
    getLinkedInfo
};
