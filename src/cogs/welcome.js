const { EmbedBuilder } = require('discord.js');
const { isOwner } = require('../utils/permissions');

module.exports = {
    // No slash commands for this cog

    async handleMessage(message) {
        if (message.author.bot) return;
        
        // !welcometest command (owner only)
        if (message.content.toLowerCase() === '!welcometest') {
            if (!isOwner(message.member)) {
                return message.reply({ content: 'This command is owner only.', allowedMentions: { repliedUser: false } });
            }

            const embed = this.createWelcomeEmbed(message.member || message.author, message.guild);
            
            try {
                await message.author.send({ embeds: [embed] });
                await message.reply({ content: 'Welcome embed sent to your DMs.', allowedMentions: { repliedUser: false } });
            } catch (error) {
                await message.reply({ content: 'Failed to send DM. Make sure your DMs are open.', allowedMentions: { repliedUser: false } });
            }
        }
    },

    createWelcomeEmbed(member, guild) {
        const embed = new EmbedBuilder()
            .setTitle(`Welcome to ${guild.name}`)
            .setDescription(`Hello and welcome to **NewLife SMP**!\n\nWe're excited to have you join our community. Please take a moment to read through our rules and get yourself set up.`)
            .setColor(0x2B2D31)
            .addFields(
                { 
                    name: 'Getting Started', 
                    value: '1. Read the rules in our rules channel\n2. Link your Minecraft account using `/link`\n3. Apply for whitelist access\n4. Introduce yourself to the community' 
                },
                { 
                    name: 'Need Help?', 
                    value: 'If you have any questions, feel free to open a ticket or ask in our general chat. Our staff team is here to help!' 
                },
                {
                    name: 'Server Information',
                    value: `You are member **#${guild.memberCount}** of our community.`
                }
            )
            .setFooter({ text: 'NewLife SMP 2026' })
            .setTimestamp();

        if (guild.iconURL()) {
            embed.setThumbnail(guild.iconURL({ dynamic: true }));
        }

        return embed;
    },

    // Called when a new member joins
    async sendWelcomeDM(member) {
        // Don't send to bots
        if (member.user.bot) return;

        const embed = this.createWelcomeEmbed(member, member.guild);

        try {
            await member.send({ embeds: [embed] });
            console.log(`[Welcome] Sent welcome DM to ${member.user.tag}`);
        } catch (error) {
            // User has DMs disabled - this is fine, don't log as error
            console.log(`[Welcome] Could not send DM to ${member.user.tag} (DMs disabled)`);
        }
    }
};
