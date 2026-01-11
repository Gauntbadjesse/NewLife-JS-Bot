const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const LinkedAccount = require('../database/models/LinkedAccount');

const OWNER_ID = process.env.OWNER_ID;
const MILESTONE_CHANNEL_ID = '1437537451110567936';
const MILESTONE_START = 1000;
const MILESTONE_INTERVAL = 250;

// Track last milestone to prevent duplicates
let lastMilestone = 0;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverstats')
        .setDescription('View server statistics')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View current server statistics'))
        .addSubcommand(sub =>
            sub.setName('send')
                .setDescription('Send stats DM to owner (Owner only)')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            await this.showStats(interaction, false);
        } else if (subcommand === 'send') {
            if (interaction.user.id !== OWNER_ID) {
                return interaction.reply({ content: 'This command is owner only.', ephemeral: true });
            }
            await this.showStats(interaction, true);
        }
    },

    async showStats(interaction, dmOwner) {
        const guild = interaction.guild;
        
        const totalMembers = guild.memberCount;
        const whitelistedCount = await LinkedAccount.countDocuments();
        const onlineMembers = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
        const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
        const roles = guild.roles.cache.size;
        const boosts = guild.premiumSubscriptionCount || 0;
        const boostLevel = guild.premiumTier;

        const embed = new EmbedBuilder()
            .setTitle('Server Statistics')
            .setColor(0x2B2D31)
            .addFields(
                { name: 'Members', value: `Total: ${totalMembers}\nOnline: ${onlineMembers}\nWhitelisted: ${whitelistedCount}`, inline: true },
                { name: 'Channels', value: `Text: ${textChannels}\nVoice: ${voiceChannels}`, inline: true },
                { name: 'Server Info', value: `Roles: ${roles}\nBoosts: ${boosts}\nBoost Level: ${boostLevel}`, inline: true }
            )
            .setFooter({ text: 'NewLife SMP 2026' })
            .setTimestamp();

        if (dmOwner) {
            try {
                const owner = await interaction.client.users.fetch(OWNER_ID);
                await owner.send({ embeds: [embed] });
                await interaction.reply({ content: 'Stats sent to your DMs.', ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: 'Failed to send DM. Make sure your DMs are open.', ephemeral: true });
            }
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    // Daily stats DM to owner
    async sendDailyStats(client) {
        const guild = client.guilds.cache.first();
        if (!guild) return;

        const totalMembers = guild.memberCount;
        const whitelistedCount = await LinkedAccount.countDocuments();
        const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
        const roles = guild.roles.cache.size;
        const boosts = guild.premiumSubscriptionCount || 0;

        const embed = new EmbedBuilder()
            .setTitle('Daily Server Statistics')
            .setColor(0x2B2D31)
            .addFields(
                { name: 'Members', value: `Total: ${totalMembers}\nWhitelisted: ${whitelistedCount}`, inline: true },
                { name: 'Channels', value: `Text: ${textChannels}\nVoice: ${voiceChannels}`, inline: true },
                { name: 'Server Info', value: `Roles: ${roles}\nBoosts: ${boosts}`, inline: true }
            )
            .setFooter({ text: 'NewLife SMP 2026' })
            .setTimestamp();

        try {
            const owner = await client.users.fetch(OWNER_ID);
            await owner.send({ embeds: [embed] });
            console.log('[ServerStats] Daily stats sent to owner');
        } catch (error) {
            console.error('[ServerStats] Failed to send daily stats:', error);
        }
    },

    // Check for milestones when members join
    async checkMilestone(guild) {
        const memberCount = guild.memberCount;
        
        // Only start tracking at 1000 members
        if (memberCount < MILESTONE_START) return;

        // Calculate current milestone
        const currentMilestone = Math.floor((memberCount - MILESTONE_START) / MILESTONE_INTERVAL) * MILESTONE_INTERVAL + MILESTONE_START;
        
        // Check if we've hit a new milestone
        if (currentMilestone > lastMilestone && memberCount >= currentMilestone) {
            lastMilestone = currentMilestone;
            
            const whitelistedCount = await LinkedAccount.countDocuments();
            
            const channel = guild.channels.cache.get(MILESTONE_CHANNEL_ID);
            if (!channel) {
                console.error('[ServerStats] Milestone channel not found');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('Member Milestone Reached!')
                .setDescription(`We've reached **${currentMilestone}** members!`)
                .setColor(0x57F287)
                .addFields(
                    { name: 'Members', value: `${memberCount}`, inline: true },
                    { name: 'Whitelisted', value: `${whitelistedCount}`, inline: true }
                )
                .setFooter({ text: 'NewLife SMP 2026' })
                .setTimestamp();

            await channel.send({ content: '🎉', embeds: [embed] });
            console.log(`[ServerStats] Milestone reached: ${currentMilestone} members`);
        }
    },

    // Initialize last milestone on startup
    async initializeMilestone(guild) {
        const memberCount = guild.memberCount;
        if (memberCount >= MILESTONE_START) {
            lastMilestone = Math.floor((memberCount - MILESTONE_START) / MILESTONE_INTERVAL) * MILESTONE_INTERVAL + MILESTONE_START;
            console.log(`[ServerStats] Initialized milestone tracking at ${lastMilestone}`);
        }
    }
};
