/**
 * Streaming Mode Cog
 * Allows staff to toggle streaming mode which removes their in-game permissions
 * while streaming to prevent leaking sensitive information
 * 
 * Commands:
 * - /stream toggle - Toggle streaming mode on/off
 * - /stream status - Check current streaming mode status
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const LinkedAccount = require('../database/models/LinkedAccount');
const { executeRcon } = require('../utils/rcon');
const { isAdmin, isModerator } = require('../utils/permissions');

// Schema for tracking streaming mode status
const streamingModeSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    roleLevel: { type: String, enum: ['admin', 'moderator'], required: true },
    enabledAt: { type: Date },
    accounts: [{ type: String }] // Minecraft usernames affected
});

streamingModeSchema.index({ discordId: 1 });

const StreamingMode = mongoose.models.StreamingMode || mongoose.model('StreamingMode', streamingModeSchema);

// Role IDs for checking permission level
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const MODERATOR_ROLE_ID = process.env.MODERATOR_ROLE_ID;

/**
 * Get the user's staff role level for streaming mode
 * Returns 'admin' if they have admin role, 'moderator' if they have mod role, or null
 */
function getStaffRoleLevel(member) {
    if (!member || !member.roles) return null;
    
    // Check for admin role (includes management, supervisor, admin)
    if (isAdmin(member)) {
        return 'admin';
    }
    
    // Check for moderator role
    if (isModerator(member)) {
        return 'moderator';
    }
    
    return null;
}

/**
 * Execute LuckPerms commands via RCON for a user
 */
async function executePermissionCommands(username, roleLevel, isEnabling) {
    const action = isEnabling ? 'add' : 'remove';
    const results = [];

    // For streaming mode ON (removing perms) or OFF (adding perms back)
    // Note: When streaming mode is ON, we REMOVE permissions
    // When streaming mode is OFF, we ADD permissions back
    const lpAction = isEnabling ? 'remove' : 'add';

    if (roleLevel === 'admin') {
        // Admin gets both administration and moderation removed/added
        const cmd1 = `lp user ${username} parent ${lpAction} administration`;
        const cmd2 = `lp user ${username} parent ${lpAction} moderation`;
        
        const result1 = await executeRcon(cmd1);
        results.push({ command: cmd1, ...result1 });
        
        const result2 = await executeRcon(cmd2);
        results.push({ command: cmd2, ...result2 });
    } else if (roleLevel === 'moderator') {
        // Moderator only gets moderation removed/added
        const cmd = `lp user ${username} parent ${lpAction} moderation`;
        const result = await executeRcon(cmd);
        results.push({ command: cmd, ...result });
    }

    return results;
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('stream')
            .setDescription('Manage streaming mode')
            .addSubcommand(sub => sub
                .setName('toggle')
                .setDescription('Toggle streaming mode on/off (removes in-game staff permissions)')
            )
            .addSubcommand(sub => sub
                .setName('status')
                .setDescription('Check your current streaming mode status')
            ),

        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();
            const member = interaction.member;
            const userId = interaction.user.id;

            // Check if user is staff
            const roleLevel = getStaffRoleLevel(member);
            if (!roleLevel) {
                return interaction.reply({
                    content: '❌ You must be a staff member (Moderator or higher) to use streaming mode.',
                    ephemeral: true
                });
            }

            if (sub === 'status') {
                const streamingStatus = await StreamingMode.findOne({ discordId: userId });
                
                if (!streamingStatus || !streamingStatus.enabled) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('📺 Streaming Mode Status')
                                .setDescription('**Status:** 🟢 OFF (Normal permissions)')
                                .setColor(0x6BCB77)
                                .setFooter({ text: 'Use /stream toggle to enable streaming mode' })
                        ],
                        ephemeral: true
                    });
                }

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('📺 Streaming Mode Status')
                            .setDescription('**Status:** 🔴 ON (Permissions hidden)')
                            .setColor(0xFF6B6B)
                            .addFields(
                                { name: 'Role Level', value: streamingStatus.roleLevel, inline: true },
                                { name: 'Enabled At', value: `<t:${Math.floor(streamingStatus.enabledAt.getTime() / 1000)}:R>`, inline: true },
                                { name: 'Accounts Affected', value: streamingStatus.accounts.join(', ') || 'None', inline: false }
                            )
                            .setFooter({ text: 'Use /stream toggle to disable streaming mode' })
                    ],
                    ephemeral: true
                });
            }

            if (sub === 'toggle') {
                await interaction.deferReply({ ephemeral: true });

                // Get linked Minecraft accounts
                const linkedAccounts = await LinkedAccount.find({ discordId: userId });
                
                if (linkedAccounts.length === 0) {
                    return interaction.editReply({
                        content: '❌ You don\'t have any linked Minecraft accounts. Link your account first with `/whitelist add` or contact staff.'
                    });
                }

                const usernames = linkedAccounts.map(acc => acc.minecraftUsername);

                // Check current streaming mode status
                let streamingStatus = await StreamingMode.findOne({ discordId: userId });
                const isCurrentlyEnabled = streamingStatus?.enabled || false;
                const newState = !isCurrentlyEnabled;

                // Execute RCON commands for all linked accounts
                const allResults = [];
                let hasErrors = false;

                for (const username of usernames) {
                    const results = await executePermissionCommands(username, roleLevel, newState);
                    allResults.push({ username, results });
                    
                    if (results.some(r => !r.success)) {
                        hasErrors = true;
                    }
                }

                // Update database
                if (!streamingStatus) {
                    streamingStatus = new StreamingMode({
                        discordId: userId,
                        roleLevel,
                        enabled: newState,
                        enabledAt: newState ? new Date() : null,
                        accounts: usernames
                    });
                } else {
                    streamingStatus.enabled = newState;
                    streamingStatus.roleLevel = roleLevel;
                    streamingStatus.enabledAt = newState ? new Date() : null;
                    streamingStatus.accounts = usernames;
                }
                await streamingStatus.save();

                // Build response embed
                const embed = new EmbedBuilder()
                    .setTitle(`📺 Streaming Mode ${newState ? 'Enabled' : 'Disabled'}`)
                    .setColor(newState ? 0xFF6B6B : 0x6BCB77)
                    .setDescription(newState 
                        ? '🔴 **Your in-game staff permissions have been temporarily removed.**\n\nYou can now stream safely without revealing staff commands.'
                        : '🟢 **Your in-game staff permissions have been restored.**\n\nYou\'re back to normal staff mode.'
                    )
                    .addFields(
                        { name: 'Role Level', value: roleLevel.charAt(0).toUpperCase() + roleLevel.slice(1), inline: true },
                        { name: 'Accounts', value: usernames.join(', '), inline: true }
                    )
                    .setTimestamp();

                // Add command results
                const commandSummary = allResults.map(({ username, results }) => {
                    const status = results.every(r => r.success) ? '✅' : '⚠️';
                    return `${status} **${username}**: ${results.length} command(s)`;
                }).join('\n');

                embed.addFields({ name: 'Commands Executed', value: commandSummary, inline: false });

                if (hasErrors) {
                    embed.addFields({
                        name: '⚠️ Warning',
                        value: 'Some commands may have failed. Check if the server is online and RCON is configured.',
                        inline: false
                    });
                }

                // Log to console
                console.log(`[StreamingMode] ${interaction.user.tag} ${newState ? 'enabled' : 'disabled'} streaming mode for accounts: ${usernames.join(', ')}`);

                return interaction.editReply({ embeds: [embed] });
            }
        }
    }
];

module.exports = {
    name: 'StreamingMode',
    slashCommands
};
