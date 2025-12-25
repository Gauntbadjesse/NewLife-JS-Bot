const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createErrorEmbed, getEmbedColor } = require('../utils/embeds');

// Prefix commands
const commands = {
    rules: {
        name: 'rules',
        description: 'Rules utilities (usage: !rules quiz <@user>)',
        usage: '!rules quiz <@user>',
        async execute(message, args, client) {
            if (!args[0] || args[0].toLowerCase() !== 'quiz') {
                return message.reply({ embeds: [createErrorEmbed('Usage', 'Usage: `!rules quiz <@user>`')], allowedMentions: { repliedUser: false } });
            }

            const target = message.mentions.users.first() || (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null);
            if (!target) return message.reply({ embeds: [createErrorEmbed('Missing User', 'Please mention a user to DM the rules quiz.')], allowedMentions: { repliedUser: false } });

            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('NewLife SMP — Rules Quiz')
                .setDescription('Please review the server rules and reply with `I agree` once you understand them.\n\nQuestions will be sent by staff if required.')
                .setFooter({ text: 'Complete this quiz to confirm acceptance of the rules.' })
                .setTimestamp();

            // Send in-channel and ping the target user
            try {
                await message.channel.send({ content: `<@${target.id}>`, embeds: [embed] });
                return message.reply({ content: `Posted rules quiz for ${target.tag}.`, allowedMentions: { repliedUser: false } });
            } catch (e) {
                return message.reply({ embeds: [createErrorEmbed('Failed', 'Unable to post the quiz in this channel.')], allowedMentions: { repliedUser: false } });
            }
        }
    }
};

// Slash commands
const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('rules')
            .setDescription('Rules related utilities')
            .addSubcommand(sub => sub.setName('quiz').setDescription('Send the rules quiz to a user').addUserOption(o => o.setName('user').setDescription('User to DM').setRequired(true))),
        async execute(interaction, client) {
            const sub = interaction.options.getSubcommand();
            if (sub !== 'quiz') return interaction.reply({ embeds: [createErrorEmbed('Invalid', 'Unknown subcommand')], ephemeral: true });

            const user = interaction.options.getUser('user');
            const embed = new EmbedBuilder()
                .setColor(getEmbedColor())
                .setTitle('NewLife SMP — Rules Quiz')
                .setDescription('Please review the server rules and reply with `I agree` once you understand them.\n\nQuestions will be sent by staff if required.')
                .setFooter({ text: 'Complete this quiz to confirm acceptance of the rules.' })
                .setTimestamp();

            try {
                await interaction.channel.send({ content: `<@${user.id}>`, embeds: [embed] });
                return interaction.reply({ content: `Posted rules quiz for ${user.tag}.`, ephemeral: true });
            } catch (e) {
                return interaction.reply({ embeds: [createErrorEmbed('Failed', 'Unable to post the quiz in this channel.')], ephemeral: true });
            }
        }
    }
];

module.exports = { name: 'Rules', description: 'Rules quiz utilities', commands, slashCommands };
