const { EmbedBuilder } = require('discord.js');
const { isSupervisor } = require('../utils/permissions');

module.exports = {
    // No slash commands for this cog

    async handleMessage(message) {
        if (message.author.bot) return;
        if (!message.content.toLowerCase().startsWith('!page ')) return;

        // Check permissions (Supervisor/Management only)
        if (!isSupervisor(message.member)) {
            return message.reply('You do not have permission to use this command. Supervisor or higher required.');
        }

        const args = message.content.slice(6).trim().split(/ +/);
        
        if (args.length < 2) {
            return message.reply('Usage: `!page <@user|userId> <reason>`');
        }

        // Get user from mention or ID
        let targetUser;
        const userArg = args[0];
        
        // Check for mention
        const mentionMatch = userArg.match(/^<@!?(\d+)>$/);
        if (mentionMatch) {
            try {
                targetUser = await message.guild.members.fetch(mentionMatch[1]);
            } catch {
                return message.reply('Could not find that user.');
            }
        } else if (/^\d+$/.test(userArg)) {
            // User ID
            try {
                targetUser = await message.guild.members.fetch(userArg);
            } catch {
                return message.reply('Could not find a user with that ID.');
            }
        } else {
            return message.reply('Please provide a valid user mention or ID.');
        }

        const reason = args.slice(1).join(' ');

        if (!reason) {
            return message.reply('Please provide a reason for paging.');
        }

        // Delete the command message
        try {
            await message.delete();
        } catch {
            // Ignore if can't delete
        }

        // Create the page message
        const pageContent = `<@${targetUser.id}> **PAGE** from ${message.author.tag}: ${reason}`;

        // Send 10 pings
        for (let i = 0; i < 10; i++) {
            await message.channel.send(pageContent);
            
            // Small delay between messages to avoid rate limiting
            if (i < 9) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log(`[Page] ${message.author.tag} paged ${targetUser.user.tag} with reason: ${reason}`);
    }
};
