/**
 * Account Linking Cog
 * Allows users to link their Discord account to their Minecraft account
 * Provides /linkaccount for users and /linksettings for staff
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const LinkedAccount = require('../database/models/LinkedAccount');
const { isAdmin, isSupervisor, isManagement, isOwner } = require('../utils/permissions');
const fetch = require('node-fetch');

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

module.exports = {
    name: 'Linking',
    slashCommands,
    lookupMcProfile
};
