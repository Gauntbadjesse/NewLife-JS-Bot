/**
 * Account Linking Cog
 * Allows users to link their Discord account to their Minecraft account
 * Provides /linkaccount for users and admin commands for staff
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const LinkedAccount = require('../database/models/LinkedAccount');
const { isAdmin, isSupervisor, isManagement, isOwner, isStaff } = require('../utils/permissions');
const fetch = require('node-fetch');
const { executeRcon } = require('../utils/rcon');

// Pending link verifications (in-memory, cleared on restart)
const pendingLinks = new Map();

// Cooldowns to prevent spam
const cooldowns = new Map();
const COOLDOWN_MS = 30000; // 30 seconds

/**
 * Lookup Minecraft profile from API (supports java and bedrock)
 */
async function lookupMcProfile(username, platform = 'java') {
    try {
        const url = platform === 'bedrock'
            ? `https://mcprofile.io/api/v1/bedrock/gamertag/${encodeURIComponent(username)}`
            : `https://mcprofile.io/api/v1/java/username/${encodeURIComponent(username)}`;
        
        const res = await fetch(url);
        if (!res.ok) return null;
        
        const data = await res.json();
        
        let uuid = null;
        if (platform === 'bedrock') {
            uuid = data.fuuid || data.floodgateuid || data.id || data.uuid;
        } else {
            uuid = data.uuid || data.id;
        }
        
        if (!uuid) return null;
        
        return {
            uuid,
            name: data.name || data.username || username,
            platform
        };
    } catch (e) {
        console.error('MC Profile lookup error:', e);
        return null;
    }
}

/**
 * Get embed color from env
 */
function getEmbedColor() {
    const color = process.env.EMBED_COLOR || '#10b981';
    return color.startsWith('#') ? parseInt(color.slice(1), 16) : parseInt(color, 16);
}

/**
 * Unlink and unwhitelist all accounts for a Discord user
 * @param {string} discordId - The Discord user ID
 * @returns {Promise<{count: number, accounts: Array, errors: Array}>}
 */
async function unlinkAndUnwhitelist(discordId) {
    const accounts = await LinkedAccount.find({ discordId: String(discordId) });
    const errors = [];
    
    for (const account of accounts) {
        try {
            // Remove from whitelist based on platform
            if (account.platform === 'java') {
                await executeRcon(`whitelist remove ${account.minecraftUsername}`);
            } else if (account.platform === 'bedrock') {
                await executeRcon(`fwhitelist remove ${account.uuid}`);
            }
        } catch (e) {
            errors.push(`Failed to unwhitelist ${account.minecraftUsername}: ${e.message}`);
        }
    }
    
    // Delete all linked accounts
    await LinkedAccount.deleteMany({ discordId: String(discordId) });
    
    return {
        count: accounts.length,
        accounts: accounts.map(a => ({ name: a.minecraftUsername, platform: a.platform, uuid: a.uuid })),
        errors
    };
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('linkaccount')
            .setDescription('Link your Discord account to your Minecraft account')
            .addStringOption(opt => opt
                .setName('platform')
                .setDescription('Your Minecraft platform')
                .setRequired(true)
                .addChoices(
                    { name: 'Java Edition', value: 'java' },
                    { name: 'Bedrock Edition', value: 'bedrock' }
                )
            )
            .addStringOption(opt => opt
                .setName('username')
                .setDescription('Your Minecraft username (for Bedrock, your Xbox Gamertag)')
                .setRequired(true)
            ),

        async execute(interaction, client) {
            const discordId = interaction.user.id;
            const platform = interaction.options.getString('platform');
            const username = interaction.options.getString('username');

            // Check cooldown
            const lastUse = cooldowns.get(discordId);
            if (lastUse && Date.now() - lastUse < COOLDOWN_MS) {
                const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastUse)) / 1000);
                return interaction.reply({
                    content: `⏳ Please wait ${remaining} seconds before trying again.`,
                    ephemeral: true
                });
            }
            cooldowns.set(discordId, Date.now());

            await interaction.deferReply({ ephemeral: true });

            // Lookup Minecraft profile
            const profile = await lookupMcProfile(username, platform);
            
            if (!profile || !profile.uuid) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff4444)
                            .setTitle('❌ Account Not Found')
                            .setDescription(`Could not find a ${platform === 'bedrock' ? 'Bedrock' : 'Java'} account with the username **${username}**.`)
                            .addFields(
                                { name: '💡 Tips', value: platform === 'bedrock' 
                                    ? '• Make sure you entered your **Xbox Gamertag** exactly\n• Check capitalization\n• The account must exist and be valid'
                                    : '• Make sure you entered your **Minecraft username** exactly\n• Check capitalization\n• The account must be a premium (paid) account'
                                }
                            )
                            .setFooter({ text: 'NewLife SMP Account Linking' })
                            .setTimestamp()
                    ]
                });
            }

            // Check if UUID is already linked
            const existingByUuid = await LinkedAccount.findOne({ uuid: profile.uuid });
            if (existingByUuid) {
                if (existingByUuid.discordId === discordId) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xffaa00)
                                .setTitle('⚠️ Already Linked')
                                .setDescription(`Your Discord account is already linked to **${profile.name}** (${platform}).`)
                                .setFooter({ text: 'NewLife SMP Account Linking' })
                                .setTimestamp()
                        ]
                    });
                }
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff4444)
                            .setTitle('❌ Account Already Linked')
                            .setDescription(`The Minecraft account **${profile.name}** is already linked to another Discord account.`)
                            .addFields(
                                { name: '❓ Need Help?', value: 'If you believe this is an error, please open a support ticket.' }
                            )
                            .setFooter({ text: 'NewLife SMP Account Linking' })
                            .setTimestamp()
                    ]
                });
            }

            // Check how many accounts this Discord user has linked
            const existingCount = await LinkedAccount.countDocuments({ discordId: String(discordId) });
            const maxAccounts = 2; // Allow 2 accounts (1 Java + 1 Bedrock typically)
            
            if (existingCount >= maxAccounts) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff4444)
                            .setTitle('❌ Maximum Accounts Reached')
                            .setDescription(`You already have ${existingCount} linked accounts, which is the maximum allowed.`)
                            .addFields(
                                { name: '❓ Need Help?', value: 'If you need to change a linked account, please open a support ticket.' }
                            )
                            .setFooter({ text: 'NewLife SMP Account Linking' })
                            .setTimestamp()
                    ]
                });
            }

            // Create the link
            try {
                const newLink = new LinkedAccount({
                    discordId: String(discordId),
                    minecraftUsername: profile.name,
                    uuid: profile.uuid,
                    platform: platform,
                    linkedAt: new Date(),
                    verified: false,
                    primary: existingCount === 0
                });

                await newLink.save();

                const embed = new EmbedBuilder()
                    .setColor(getEmbedColor())
                    .setTitle('✅ Account Linked Successfully!')
                    .setDescription(`Your Discord account has been linked to your Minecraft account.`)
                    .addFields(
                        { name: '🎮 Minecraft Username', value: `\`${profile.name}\``, inline: true },
                        { name: '📱 Platform', value: platform === 'bedrock' ? 'Bedrock Edition' : 'Java Edition', inline: true },
                        { name: '🔗 UUID', value: `\`${profile.uuid}\``, inline: false }
                    )
                    .addFields({
                        name: '🚀 What\'s Next?',
                        value: 'You can now join **NewLife SMP**! Connect to the server and start your adventure.',
                        inline: false
                    })
                    .setFooter({ text: 'NewLife SMP Account Linking' })
                    .setTimestamp()
                    .setThumbnail(platform === 'java' 
                        ? `https://mc-heads.net/avatar/${profile.uuid}/128` 
                        : null
                    );

                return interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error('Error linking account:', error);
                
                if (error.code === 11000) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xff4444)
                                .setTitle('❌ Link Failed')
                                .setDescription('This account combination already exists.')
                                .setFooter({ text: 'NewLife SMP Account Linking' })
                                .setTimestamp()
                        ]
                    });
                }

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff4444)
                            .setTitle('❌ Link Failed')
                            .setDescription('An unexpected error occurred while linking your account. Please try again later.')
                            .setFooter({ text: 'NewLife SMP Account Linking' })
                            .setTimestamp()
                    ]
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('myaccounts')
            .setDescription('View your linked Minecraft accounts'),

        async execute(interaction, client) {
            const discordId = interaction.user.id;

            await interaction.deferReply({ ephemeral: true });

            const accounts = await LinkedAccount.find({ discordId: String(discordId) }).sort({ linkedAt: 1 });

            if (accounts.length === 0) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xffaa00)
                            .setTitle('🔗 No Linked Accounts')
                            .setDescription('You don\'t have any Minecraft accounts linked to your Discord.')
                            .addFields({
                                name: '📝 How to Link',
                                value: 'Use `/linkaccount` to link your Minecraft account!\n\n**Example:**\n`/linkaccount platform:Java Edition username:YourMinecraftName`'
                            })
                            .setFooter({ text: 'NewLife SMP Account Linking' })
                            .setTimestamp()
                    ]
                });
            }

            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('🔗 Your Linked Accounts')
                .setDescription(`You have **${accounts.length}** linked account${accounts.length > 1 ? 's' : ''}.`)
                .setFooter({ text: 'NewLife SMP Account Linking' })
                .setTimestamp();

            for (const account of accounts) {
                const platformIcon = account.platform === 'bedrock' ? '📱' : '💻';
                const platformName = account.platform === 'bedrock' ? 'Bedrock' : 'Java';
                const primaryBadge = account.primary ? ' ⭐' : '';
                
                embed.addFields({
                    name: `${platformIcon} ${account.minecraftUsername}${primaryBadge}`,
                    value: [
                        `**Platform:** ${platformName}`,
                        `**UUID:** \`${account.uuid}\``,
                        `**Linked:** <t:${Math.floor(new Date(account.linkedAt).getTime() / 1000)}:R>`
                    ].join('\n'),
                    inline: false
                });
            }

            // Set thumbnail to first Java account's head if available
            const javaAccount = accounts.find(a => a.platform === 'java');
            if (javaAccount) {
                embed.setThumbnail(`https://mc-heads.net/avatar/${javaAccount.uuid}/128`);
            }

            return interaction.editReply({ embeds: [embed] });
        }
    }
];

/**
 * Prefix Commands
 */
const commands = {
    linked: {
        name: 'linked',
        description: 'View linked accounts for a user',
        usage: '!linked [@user|userId|minecraftName]',
        async execute(message, args, client) {
            // Staff only
            if (!isStaff(message.member)) {
                return message.reply({ content: 'Permission denied. Staff only.', allowedMentions: { repliedUser: false } });
            }

            // Get target
            let targetUser = null;
            let searchQuery = null;

            if (args[0]) {
                // Check for mention
                targetUser = message.mentions.users.first();
                
                // Check for user ID
                if (!targetUser && /^\d{17,19}$/.test(args[0])) {
                    targetUser = await client.users.fetch(args[0]).catch(() => null);
                }
                
                // If not found, treat as Minecraft name search
                if (!targetUser) {
                    searchQuery = args.join(' ');
                }
            } else {
                // No args - show own accounts
                targetUser = message.author;
            }

            // Search by Minecraft name
            if (searchQuery) {
                const account = await LinkedAccount.findOne({ 
                    minecraftUsername: { $regex: new RegExp(`^${searchQuery}$`, 'i') }
                });

                if (!account) {
                    return message.reply({ 
                        content: `No linked account found for Minecraft name: **${searchQuery}**`, 
                        allowedMentions: { repliedUser: false } 
                    });
                }

                targetUser = await client.users.fetch(account.discordId).catch(() => null);
                if (!targetUser) {
                    const embed = new EmbedBuilder()
                        .setTitle('Linked Account Found')
                        .setColor(getEmbedColor())
                        .setDescription(`Found account but Discord user has left the server.`)
                        .addFields(
                            { name: 'Minecraft', value: `\`${account.minecraftUsername}\``, inline: true },
                            { name: 'Platform', value: account.platform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                            { name: 'Discord ID', value: `\`${account.discordId}\``, inline: true },
                            { name: 'UUID', value: `\`${account.uuid}\``, inline: false }
                        )
                        .setTimestamp();
                    
                    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
                }
            }

            // Fetch all accounts for the target user
            const accounts = await LinkedAccount.find({ discordId: String(targetUser.id) }).sort({ linkedAt: 1 });

            if (accounts.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('No Linked Accounts')
                    .setColor(0xffaa00)
                    .setDescription(`${targetUser} has no linked Minecraft accounts.`)
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
            }

            const embed = new EmbedBuilder()
                .setTitle('Linked Accounts')
                .setColor(getEmbedColor())
                .setDescription(`Showing linked accounts for ${targetUser}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Discord', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
                    { name: 'Total Accounts', value: `${accounts.length}`, inline: true }
                )
                .setTimestamp();

            for (const account of accounts) {
                const platformIcon = account.platform === 'bedrock' ? 'Bedrock' : 'Java';
                const primaryBadge = account.primary ? ' [PRIMARY]' : '';
                
                embed.addFields({
                    name: `${account.minecraftUsername}${primaryBadge}`,
                    value: [
                        `**Platform:** ${platformIcon}`,
                        `**UUID:** \`${account.uuid}\``,
                        `**Linked:** <t:${Math.floor(new Date(account.linkedAt).getTime() / 1000)}:R>`
                    ].join('\n'),
                    inline: false
                });
            }

            // Set head thumbnail if Java account exists
            const javaAccount = accounts.find(a => a.platform === 'java');
            if (javaAccount) {
                embed.setThumbnail(`https://mc-heads.net/avatar/${javaAccount.uuid}/128`);
            }

            return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
        }
    },

    unlink: {
        name: 'unlink',
        description: 'Unlink a Minecraft account from a user (Admin)',
        usage: '!unlink <@user|userId> <minecraft_username|all>',
        async execute(message, args, client) {
            // Admin only
            if (!isAdmin(message.member)) {
                return message.reply({ content: 'Permission denied. Admin only.', allowedMentions: { repliedUser: false } });
            }

            if (args.length < 2) {
                return message.reply({ 
                    content: 'Usage: `!unlink <@user|userId> <minecraft_username|all>`\n\nExamples:\n• `!unlink @User PlayerName` - Unlink specific account\n• `!unlink @User all` - Unlink all accounts', 
                    allowedMentions: { repliedUser: false } 
                });
            }

            // Get target user
            let targetUser = message.mentions.users.first();
            if (!targetUser && /^\d{17,19}$/.test(args[0])) {
                targetUser = await client.users.fetch(args[0]).catch(() => null);
            }

            if (!targetUser) {
                return message.reply({ content: 'Please mention a user or provide a valid user ID.', allowedMentions: { repliedUser: false } });
            }

            const mcName = args.slice(1).join(' ');

            // Unlink all accounts
            if (mcName.toLowerCase() === 'all') {
                const result = await LinkedAccount.deleteMany({ discordId: String(targetUser.id) });
                
                if (result.deletedCount === 0) {
                    return message.reply({ content: `${targetUser.tag} has no linked accounts.`, allowedMentions: { repliedUser: false } });
                }

                const embed = new EmbedBuilder()
                    .setTitle('All Accounts Unlinked')
                    .setColor(0xff4444)
                    .setDescription(`Removed **${result.deletedCount}** linked account(s) from ${targetUser}`)
                    .setFooter({ text: `Unlinked by ${message.author.tag}` })
                    .setTimestamp();

                return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
            }

            // Unlink specific account
            const account = await LinkedAccount.findOne({ 
                discordId: String(targetUser.id),
                minecraftUsername: { $regex: new RegExp(`^${mcName}$`, 'i') }
            });

            if (!account) {
                return message.reply({ 
                    content: `No account named **${mcName}** found linked to ${targetUser.tag}.`, 
                    allowedMentions: { repliedUser: false } 
                });
            }

            await LinkedAccount.deleteOne({ _id: account._id });

            const embed = new EmbedBuilder()
                .setTitle('Account Unlinked')
                .setColor(0xff4444)
                .addFields(
                    { name: 'Discord User', value: `${targetUser.tag}`, inline: true },
                    { name: 'Minecraft', value: `${account.minecraftUsername}`, inline: true },
                    { name: 'Platform', value: account.platform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                    { name: 'UUID', value: `\`${account.uuid}\``, inline: false }
                )
                .setFooter({ text: `Unlinked by ${message.author.tag}` })
                .setTimestamp();

            return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
        }
    },

    forcelink: {
        name: 'forcelink',
        description: 'Force link a Minecraft account to a user (Admin)',
        usage: '!forcelink <@user|userId> <platform> <minecraft_username>',
        async execute(message, args, client) {
            // Admin only
            if (!isAdmin(message.member)) {
                return message.reply({ content: 'Permission denied. Admin only.', allowedMentions: { repliedUser: false } });
            }

            if (args.length < 3) {
                return message.reply({ 
                    content: 'Usage: `!forcelink <@user|userId> <java|bedrock> <minecraft_username>`\n\nExample: `!forcelink @User java Notch`', 
                    allowedMentions: { repliedUser: false } 
                });
            }

            // Get target user
            let targetUser = message.mentions.users.first();
            let argsOffset = 0;
            
            if (!targetUser && /^\d{17,19}$/.test(args[0])) {
                targetUser = await client.users.fetch(args[0]).catch(() => null);
            }
            
            if (message.mentions.users.size > 0) {
                argsOffset = 1;
            } else {
                argsOffset = 1;
            }

            if (!targetUser) {
                return message.reply({ content: 'Please mention a user or provide a valid user ID.', allowedMentions: { repliedUser: false } });
            }

            const platform = args[argsOffset]?.toLowerCase();
            if (!['java', 'bedrock'].includes(platform)) {
                return message.reply({ content: 'Platform must be `java` or `bedrock`.', allowedMentions: { repliedUser: false } });
            }

            const username = args.slice(argsOffset + 1).join(' ');
            if (!username) {
                return message.reply({ content: 'Please provide a Minecraft username.', allowedMentions: { repliedUser: false } });
            }

            // Lookup the Minecraft profile
            const profile = await lookupMcProfile(username, platform);
            if (!profile) {
                return message.reply({ 
                    content: `Could not find a ${platform} account with username: **${username}**`, 
                    allowedMentions: { repliedUser: false } 
                });
            }

            // Check if UUID is already linked
            const existingByUuid = await LinkedAccount.findOne({ uuid: profile.uuid });
            if (existingByUuid) {
                const existingUser = await client.users.fetch(existingByUuid.discordId).catch(() => null);
                return message.reply({ 
                    content: `**${profile.name}** is already linked to ${existingUser ? existingUser.tag : `ID: ${existingByUuid.discordId}`}.\n\nUse \`!unlink\` to remove it first.`, 
                    allowedMentions: { repliedUser: false } 
                });
            }

            // Count existing accounts
            const existingCount = await LinkedAccount.countDocuments({ discordId: String(targetUser.id) });

            // Create the link
            const newLink = new LinkedAccount({
                discordId: String(targetUser.id),
                minecraftUsername: profile.name,
                uuid: profile.uuid,
                platform: platform,
                linkedAt: new Date(),
                verified: true,
                primary: existingCount === 0
            });

            await newLink.save();

            const embed = new EmbedBuilder()
                .setTitle('Account Force Linked')
                .setColor(getEmbedColor())
                .addFields(
                    { name: 'Discord User', value: `${targetUser}`, inline: true },
                    { name: 'Minecraft', value: `\`${profile.name}\``, inline: true },
                    { name: 'Platform', value: platform === 'bedrock' ? 'Bedrock' : 'Java', inline: true },
                    { name: 'UUID', value: `\`${profile.uuid}\``, inline: false }
                )
                .setFooter({ text: `Linked by ${message.author.tag}` })
                .setTimestamp();

            if (platform === 'java') {
                embed.setThumbnail(`https://mc-heads.net/avatar/${profile.uuid}/128`);
            }

            return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
        }
    },

    cleanup: {
        name: 'cleanup',
        description: 'Unlink and unwhitelist all accounts for users no longer in the Discord (Owner)',
        usage: '!cleanup [--dry-run]',
        async execute(message, args, client) {
            // Owner only
            if (!isOwner(message.member)) {
                return message.reply({ content: 'Permission denied. Owner only.', allowedMentions: { repliedUser: false } });
            }

            const isDryRun = args.includes('--dry-run');
            
            const statusMsg = await message.reply({ 
                content: `${isDryRun ? '[DRY RUN] ' : ''}Scanning linked accounts... This may take a moment.`, 
                allowedMentions: { repliedUser: false } 
            });

            try {
                // Get all linked accounts
                const allAccounts = await LinkedAccount.find({});
                const uniqueDiscordIds = [...new Set(allAccounts.map(a => a.discordId))];
                
                const toRemove = [];
                const guild = message.guild;

                // Check each Discord ID to see if they're still in the server
                for (const discordId of uniqueDiscordIds) {
                    try {
                        const member = await guild.members.fetch(discordId).catch(() => null);
                        if (!member) {
                            // User is no longer in the server
                            const userAccounts = allAccounts.filter(a => a.discordId === discordId);
                            toRemove.push({
                                discordId,
                                accounts: userAccounts.map(a => ({ name: a.minecraftUsername, platform: a.platform, uuid: a.uuid }))
                            });
                        }
                    } catch (e) {
                        // Member not found - add to removal list
                        const userAccounts = allAccounts.filter(a => a.discordId === discordId);
                        toRemove.push({
                            discordId,
                            accounts: userAccounts.map(a => ({ name: a.minecraftUsername, platform: a.platform, uuid: a.uuid }))
                        });
                    }
                }

                if (toRemove.length === 0) {
                    return statusMsg.edit({ content: 'All linked accounts belong to current Discord members. No cleanup needed.' });
                }

                // Count total accounts to remove
                const totalAccounts = toRemove.reduce((sum, u) => sum + u.accounts.length, 0);

                if (isDryRun) {
                    // Build summary for dry run
                    let description = `Found **${toRemove.length}** users with **${totalAccounts}** accounts to clean up:\n\n`;
                    for (const user of toRemove.slice(0, 10)) {
                        const accountList = user.accounts.map(a => `\`${a.name}\` (${a.platform})`).join(', ');
                        description += `**ID:** ${user.discordId}\n${accountList}\n\n`;
                    }
                    if (toRemove.length > 10) {
                        description += `*...and ${toRemove.length - 10} more users*`;
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('[DRY RUN] Cleanup Preview')
                        .setColor(0xffaa00)
                        .setDescription(description)
                        .addFields({ name: 'Run Cleanup', value: 'Use `!cleanup` (without --dry-run) to execute.' })
                        .setFooter({ text: `Requested by ${message.author.tag}` })
                        .setTimestamp();

                    return statusMsg.edit({ content: null, embeds: [embed] });
                }

                // Actually perform the cleanup
                let removedCount = 0;
                let errorCount = 0;
                const errors = [];

                for (const user of toRemove) {
                    for (const account of user.accounts) {
                        try {
                            // Remove from whitelist
                            if (account.platform === 'java') {
                                await executeRcon(`whitelist remove ${account.name}`);
                            } else if (account.platform === 'bedrock') {
                                await executeRcon(`fwhitelist remove ${account.uuid}`);
                            }
                            removedCount++;
                        } catch (e) {
                            errorCount++;
                            errors.push(`${account.name}: ${e.message}`);
                        }
                    }
                    
                    // Delete from database
                    await LinkedAccount.deleteMany({ discordId: user.discordId });
                }

                const embed = new EmbedBuilder()
                    .setTitle('Cleanup Complete')
                    .setColor(0x10b981)
                    .setDescription(`Cleaned up **${toRemove.length}** users who left the Discord.`)
                    .addFields(
                        { name: 'Accounts Unwhitelisted', value: `${removedCount}`, inline: true },
                        { name: 'Database Entries Removed', value: `${totalAccounts}`, inline: true }
                    )
                    .setFooter({ text: `Executed by ${message.author.tag}` })
                    .setTimestamp();

                if (errorCount > 0) {
                    embed.addFields({ name: 'Errors', value: `${errorCount} whitelist removal(s) failed` });
                }

                return statusMsg.edit({ content: null, embeds: [embed] });
            } catch (e) {
                console.error('[Cleanup] Error:', e);
                return statusMsg.edit({ content: `Cleanup failed: ${e.message}` });
            }
        }
    },

    nick: {
        name: 'nick',
        description: 'Update user nickname(s) to their linked Minecraft name',
        usage: '!nick @user [@user2...] | !nick all',
        async execute(message, args, client) {
            // Staff only
            if (!isStaff(message.member)) {
                return message.reply({ content: 'Permission denied. Staff only.', allowedMentions: { repliedUser: false } });
            }

            const guild = message.guild;

            // Check for "all" argument
            if (args[0] && args[0].toLowerCase() === 'all') {
                const statusMsg = await message.reply({ content: '🔄 Updating all member nicknames... This may take a while.', allowedMentions: { repliedUser: false } });

                try {
                    // Get all linked accounts
                    const allAccounts = await LinkedAccount.find({});
                    
                    // Group by discordId and pick primary or first account
                    const accountMap = new Map();
                    for (const account of allAccounts) {
                        if (!accountMap.has(account.discordId)) {
                            accountMap.set(account.discordId, account);
                        } else if (account.primary) {
                            accountMap.set(account.discordId, account);
                        }
                    }

                    let updated = 0;
                    let skipped = 0;
                    let failed = 0;
                    const errors = [];

                    for (const [discordId, account] of accountMap) {
                        try {
                            const member = await guild.members.fetch(discordId).catch(() => null);
                            if (!member) {
                                skipped++;
                                continue;
                            }

                            // Skip if nickname already matches
                            if (member.nickname === account.minecraftUsername) {
                                skipped++;
                                continue;
                            }

                            // Can't change owner's nickname
                            if (member.id === guild.ownerId) {
                                skipped++;
                                continue;
                            }

                            // Can't change if bot's role is lower
                            const botMember = guild.members.cache.get(client.user.id);
                            if (member.roles.highest.position >= botMember.roles.highest.position) {
                                skipped++;
                                continue;
                            }

                            await member.setNickname(account.minecraftUsername, 'Synced to linked Minecraft name');
                            updated++;
                        } catch (e) {
                            failed++;
                            if (errors.length < 5) {
                                errors.push(`<@${discordId}>: ${e.message.substring(0, 50)}`);
                            }
                        }
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('Nickname Sync Complete')
                        .setColor(getEmbedColor())
                        .addFields(
                            { name: 'Updated', value: `${updated}`, inline: true },
                            { name: 'Skipped', value: `${skipped}`, inline: true },
                            { name: 'Failed', value: `${failed}`, inline: true }
                        )
                        .setFooter({ text: `Executed by ${message.author.tag}` })
                        .setTimestamp();

                    if (errors.length > 0) {
                        embed.addFields({ name: 'Sample Errors', value: errors.join('\n'), inline: false });
                    }

                    return statusMsg.edit({ content: null, embeds: [embed] });
                } catch (e) {
                    console.error('[Nick All] Error:', e);
                    return statusMsg.edit({ content: `Failed to sync nicknames: ${e.message}` });
                }
            }

            // Handle mentioned users (one or multiple)
            const mentionedUsers = message.mentions.users;

            if (mentionedUsers.size === 0) {
                return message.reply({ 
                    content: 'Usage: `!nick @user [@user2...]` or `!nick all`', 
                    allowedMentions: { repliedUser: false } 
                });
            }

            const results = [];

            for (const [userId, user] of mentionedUsers) {
                try {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) {
                        results.push({ user: user.tag, success: false, error: 'User not in server' });
                        continue;
                    }

                    // Get their linked account (primary or first)
                    let account = await LinkedAccount.findOne({ discordId: userId, primary: true });
                    if (!account) {
                        account = await LinkedAccount.findOne({ discordId: userId });
                    }

                    if (!account) {
                        results.push({ user: user.tag, success: false, error: 'No linked account' });
                        continue;
                    }

                    // Can't change owner's nickname
                    if (member.id === guild.ownerId) {
                        results.push({ user: user.tag, success: false, error: 'Cannot change server owner' });
                        continue;
                    }

                    // Can't change if bot's role is lower
                    const botMember = guild.members.cache.get(client.user.id);
                    if (member.roles.highest.position >= botMember.roles.highest.position) {
                        results.push({ user: user.tag, success: false, error: 'Role hierarchy' });
                        continue;
                    }

                    const oldNick = member.nickname || member.user.username;
                    await member.setNickname(account.minecraftUsername, `Synced by ${message.author.tag}`);
                    results.push({ user: user.tag, success: true, oldNick, newNick: account.minecraftUsername });
                } catch (e) {
                    results.push({ user: user.tag, success: false, error: e.message.substring(0, 30) });
                }
            }

            // Build response
            if (results.length === 1) {
                const r = results[0];
                if (r.success) {
                    return message.reply({ 
                        content: `✅ Updated **${r.user}**'s nickname: \`${r.oldNick}\` → \`${r.newNick}\``, 
                        allowedMentions: { repliedUser: false } 
                    });
                } else {
                    return message.reply({ 
                        content: `❌ Failed to update **${r.user}**: ${r.error}`, 
                        allowedMentions: { repliedUser: false } 
                    });
                }
            }

            // Multiple users - build embed
            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            const embed = new EmbedBuilder()
                .setTitle('Nickname Updates')
                .setColor(failCount === 0 ? getEmbedColor() : 0xffaa00)
                .addFields(
                    { name: 'Updated', value: `${successCount}`, inline: true },
                    { name: 'Failed', value: `${failCount}`, inline: true }
                )
                .setFooter({ text: `Executed by ${message.author.tag}` })
                .setTimestamp();

            const successList = results.filter(r => r.success).map(r => `✅ **${r.user}**: \`${r.newNick}\``).slice(0, 10);
            const failList = results.filter(r => !r.success).map(r => `❌ **${r.user}**: ${r.error}`).slice(0, 10);

            if (successList.length > 0) {
                embed.addFields({ name: 'Successful', value: successList.join('\n'), inline: false });
            }
            if (failList.length > 0) {
                embed.addFields({ name: 'Failed', value: failList.join('\n'), inline: false });
            }

            return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
        }
    }
};

module.exports = {
    name: 'Linking',
    slashCommands,
    commands,
    lookupMcProfile,
    unlinkAndUnwhitelist
};
