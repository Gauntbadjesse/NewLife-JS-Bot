const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
                .setDescription([
                    '1. PvP Consent\nWhat are the required elements for valid PvP consent on NewLife SMP, and how long does that consent remain valid?',
                    '2. Property Claims\nWhat four pieces of information must be written on the sign and mailbox for a property claim to be considered valid?',
                    '3. Griefing Enforcement\nWhat are the automatic consequences for griefing another player’s build or property on NewLife SMP?',
                    '4. Theft Rules\nUnder what conditions is harvesting or taking items considered theft on NewLife SMP, and how do private vs. unmarked farms or builds affect this?',
                    '5. Evidence Standards\nWhich types of evidence are not admissible when staff investigate rule violations, and why are they disallowed?'
                ].join('\n\n'))
                .setFooter({ text: 'Answer these questions honestly; staff will follow up if needed.' })
                .setTimestamp();

            // Create a link button to the full rules, then post the quiz embed
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('View the rules here')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://newlifesmp.com/rules')
            );

            // Delete the invoking command message to avoid clutter, then post the quiz embed
            try {
                await message.delete().catch(() => {});
                await message.channel.send({ content: `<@${target.id}>`, embeds: [embed], components: [row] });
                return; // no additional reply
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
                .setDescription([
                    '1. PvP Consent\nWhat are the required elements for valid PvP consent on NewLife SMP, and how long does that consent remain valid?',
                    '2. Property Claims\nWhat four pieces of information must be written on the sign and mailbox for a property claim to be considered valid?',
                    '3. Griefing Enforcement\nWhat are the automatic consequences for griefing another player’s build or property on NewLife SMP?',
                    '4. Theft Rules\nUnder what conditions is harvesting or taking items considered theft on NewLife SMP, and how do private vs. unmarked farms or builds affect this?',
                    '5. Evidence Standards\nWhich types of evidence are not admissible when staff investigate rule violations, and why are they disallowed?'
                ].join('\n\n'))
                .setFooter({ text: 'Answer these questions honestly; staff will follow up if needed.' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('View the rules here')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://newlifesmp.com/rules')
            );

            try {
                await interaction.channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });
                return interaction.reply({ content: `Posted rules quiz for ${user.tag}.`, ephemeral: true });
            } catch (e) {
                return interaction.reply({ embeds: [createErrorEmbed('Failed', 'Unable to post the quiz in this channel.')], ephemeral: true });
            }
        }
    }
];

module.exports = { name: 'Rules', description: 'Rules quiz utilities', commands, slashCommands };
