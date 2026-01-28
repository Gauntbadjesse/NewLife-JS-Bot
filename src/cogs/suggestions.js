const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const mongoose = require('mongoose');

const SUGGESTION_CHANNEL_ID = '1459777467551191110';

// Suggestion schema
const suggestionSchema = new mongoose.Schema({
    guildId: String,
    messageId: String,
    threadId: String,
    userId: String,
    suggestion: String,
    upvotes: [String], // Array of user IDs who upvoted
    downvotes: [String], // Array of user IDs who downvoted
    status: { type: String, default: 'pending' }, // pending, approved, denied
    createdAt: { type: Date, default: Date.now }
});

const Suggestion = mongoose.models.Suggestion || mongoose.model('Suggestion', suggestionSchema);

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('suggest')
            .setDescription('Submit a suggestion for the server')
            .addStringOption(option =>
                option.setName('suggestion')
                    .setDescription('Your suggestion')
                    .setRequired(true)
                    .setMaxLength(1000)),

        async execute(interaction) {
            const suggestionText = interaction.options.getString('suggestion');
            const user = interaction.user;

            // Get the suggestion channel
            const channel = interaction.guild.channels.cache.get(SUGGESTION_CHANNEL_ID);
            if (!channel) {
                return interaction.reply({ content: 'Suggestion channel not found. Please contact an administrator.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            // Create the suggestion embed
            const embed = new EmbedBuilder()
                .setTitle('New Suggestion')
                .setDescription(suggestionText)
                .setColor(0x2B2D31)
                .addFields(
                    { name: 'Submitted By', value: `${user.tag}`, inline: true },
                    { name: 'Status', value: 'Pending', inline: true },
                    { name: 'Votes', value: 'Yes: 0 | No: 0', inline: true }
                )
                .setFooter({ text: `User ID: ${user.id}` })
                .setTimestamp();

            // Create voting buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('suggestion_upvote')
                        .setLabel('Upvote (0)')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('suggestion_downvote')
                        .setLabel('Downvote (0)')
                        .setStyle(ButtonStyle.Danger)
                );

            // Send the suggestion
            const suggestionMessage = await channel.send({ embeds: [embed], components: [row] });

            // Create a thread for discussion
            const thread = await suggestionMessage.startThread({
                name: `Suggestion by ${user.username}`,
                autoArchiveDuration: 10080 // 7 days
            });

            // Send initial message in thread
            await thread.send(`<@${user.id}> Use this thread to discuss your suggestion.`);

            // Save to database
            await Suggestion.create({
                guildId: interaction.guild.id,
                messageId: suggestionMessage.id,
                threadId: thread.id,
                userId: user.id,
                suggestion: suggestionText,
                upvotes: [],
                downvotes: []
            });

            await interaction.editReply({ content: `Your suggestion has been submitted! View it here: ${suggestionMessage.url}` });
        }
    }
];

module.exports = {
    slashCommands,

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('suggestion_')) return false;

        const suggestion = await Suggestion.findOne({ messageId: interaction.message.id });
        if (!suggestion) {
            await interaction.reply({ content: 'This suggestion no longer exists in the database.', ephemeral: true });
            return true;
        }

        const userId = interaction.user.id;
        const isUpvote = interaction.customId === 'suggestion_upvote';

        // Check if user already voted
        const hasUpvoted = suggestion.upvotes.includes(userId);
        const hasDownvoted = suggestion.downvotes.includes(userId);

        if (isUpvote) {
            if (hasUpvoted) {
                // Remove upvote
                suggestion.upvotes = suggestion.upvotes.filter(id => id !== userId);
            } else {
                // Add upvote, remove downvote if exists
                suggestion.upvotes.push(userId);
                suggestion.downvotes = suggestion.downvotes.filter(id => id !== userId);
            }
        } else {
            if (hasDownvoted) {
                // Remove downvote
                suggestion.downvotes = suggestion.downvotes.filter(id => id !== userId);
            } else {
                // Add downvote, remove upvote if exists
                suggestion.downvotes.push(userId);
                suggestion.upvotes = suggestion.upvotes.filter(id => id !== userId);
            }
        }

        await suggestion.save();

        // Update the embed
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setFields(
                { name: 'Submitted By', value: interaction.message.embeds[0].fields[0].value, inline: true },
                { name: 'Status', value: interaction.message.embeds[0].fields[1].value, inline: true },
                { name: 'Votes', value: `Yes: ${suggestion.upvotes.length} | No: ${suggestion.downvotes.length}`, inline: true }
            );

        // Update buttons with counts
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('suggestion_upvote')
                    .setLabel(`Upvote (${suggestion.upvotes.length})`)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('suggestion_downvote')
                    .setLabel(`Downvote (${suggestion.downvotes.length})`)
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.update({ embeds: [embed], components: [row] });
        return true;
    }
};
