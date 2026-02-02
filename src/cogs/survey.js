/**
 * Season Survey Cog
 * Sends feedback forms for season feedback collection
 */

const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { isOwner } = require('../utils/permissions');

// Channel to send submissions to (set via env or hardcode)
const SURVEY_LOG_CHANNEL_ID = process.env.SURVEY_LOG_CHANNEL_ID;

// Track who has submitted to prevent duplicates (optional)
const submittedUsers = new Set();

const commands = {
    send: {
        name: 'send',
        description: 'Send the season feedback survey to a channel',
        usage: '!send [#channel]',
        async execute(message, args, client) {
            // Owner only
            if (!isOwner(message.member)) {
                return message.reply('❌ This command is owner only.');
            }

            // Get target channel (mentioned or current)
            const targetChannel = message.mentions.channels.first() || message.channel;

            // Create the survey embed
            const surveyEmbed = new EmbedBuilder()
                .setTitle(' Season 3 Feedback Survey')
                .setDescription(
                    'We want to hear from you! Help us make Season 3 amazing by sharing your thoughts.\n\n' +
                    '**Click the button below to fill out the survey!**\n\n' +
                    ' Your feedback is anonymous to other players but logged for staff review.'
                )
                .setColor(0x5865F2)
                .setImage('http://193.218.34.214:5000/uploads/image.png') // You can add a banner image
                .setFooter({ text: 'NewLife SMP' })
                .setTimestamp();

            // Create button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('season_survey_open')
                        .setLabel('📋 Fill Out Survey')
                        .setStyle(ButtonStyle.Primary)
                );

            // Send to target channel
            await targetChannel.send({ embeds: [surveyEmbed], components: [row] });

            // Confirm to user
            if (targetChannel.id !== message.channel.id) {
                await message.reply(`✅ Survey sent to ${targetChannel}!`);
            }

            // Delete command message
            await message.delete().catch(() => {});
        }
    }
};

/**
 * Handle button click to open modal
 */
async function handleSurveyButton(interaction) {
    if (interaction.customId !== 'season_survey_open') return false;

    // Optional: Prevent duplicate submissions
    // if (submittedUsers.has(interaction.user.id)) {
    //     return interaction.reply({ content: '❌ You have already submitted a response!', ephemeral: true });
    // }

    // Create the modal
    const modal = new ModalBuilder()
        .setCustomId('season_survey_submit')
        .setTitle('Season 3 Feedback');

    // Question 1: What did you enjoy about season 2?
    const question1 = new TextInputBuilder()
        .setCustomId('season2_enjoy')
        .setLabel('What did you enjoy about Season 2?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Tell us what you loved about the last season...')
        .setRequired(true)
        .setMaxLength(4000);

    // Question 2: What would you like to see for season 3?
    const question2 = new TextInputBuilder()
        .setCustomId('season3_wants')
        .setLabel('What would you like to see for Season 3?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Features, events, changes you\'d like to see...')
        .setRequired(true)
        .setMaxLength(4000);

    // Question 3: Any themes?
    const question3 = new TextInputBuilder()
        .setCustomId('season3_themes')
        .setLabel('Any themes you\'d like? (Lifesteal, etc)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Lifesteal, origins, vanilla+, hardcore elements...')
        .setRequired(false)
        .setMaxLength(4000);

    // Add to modal (each input needs its own action row)
    modal.addComponents(
        new ActionRowBuilder().addComponents(question1),
        new ActionRowBuilder().addComponents(question2),
        new ActionRowBuilder().addComponents(question3)
    );

    await interaction.showModal(modal);
    return true;
}

/**
 * Handle modal submission
 */
async function handleSurveySubmit(interaction, client) {
    if (interaction.customId !== 'season_survey_submit') return false;

    const season2Enjoy = interaction.fields.getTextInputValue('season2_enjoy');
    const season3Wants = interaction.fields.getTextInputValue('season3_wants');
    const season3Themes = interaction.fields.getTextInputValue('season3_themes') || 'No preference';

    // Track submission (optional)
    submittedUsers.add(interaction.user.id);

    // Send confirmation to user
    await interaction.reply({ 
        content: '✅ **Thank you for your feedback!** Your response has been recorded and will help shape Season 3.', 
        ephemeral: true 
    });

    // Log to staff channel
    if (SURVEY_LOG_CHANNEL_ID) {
        try {
            const logChannel = await client.channels.fetch(SURVEY_LOG_CHANNEL_ID).catch(() => null);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('📋 New Survey Response')
                    .setColor(0x57F287)
                    .setAuthor({
                        name: interaction.user.tag,
                        iconURL: interaction.user.displayAvatarURL()
                    })
                    .addFields(
                        { 
                            name: '❓ What did you enjoy about Season 2?', 
                            value: season2Enjoy.length > 1024 ? season2Enjoy.substring(0, 1021) + '...' : season2Enjoy
                        },
                        { 
                            name: '❓ What would you like to see for Season 3?', 
                            value: season3Wants.length > 1024 ? season3Wants.substring(0, 1021) + '...' : season3Wants
                        },
                        { 
                            name: '❓ Themes you\'d like (Lifesteal, etc)?', 
                            value: season3Themes.length > 1024 ? season3Themes.substring(0, 1021) + '...' : season3Themes
                        }
                    )
                    .setFooter({ text: `User ID: ${interaction.user.id}` })
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });

                // If responses are very long, send as follow-up messages
                if (season2Enjoy.length > 1024 || season3Wants.length > 1024 || season3Themes.length > 1024) {
                    let fullText = `**Full Response from ${interaction.user.tag}:**\n\n`;
                    fullText += `**What did you enjoy about Season 2?**\n${season2Enjoy}\n\n`;
                    fullText += `**What would you like to see for Season 3?**\n${season3Wants}\n\n`;
                    fullText += `**Themes?**\n${season3Themes}`;

                    // Split if over 2000 chars
                    if (fullText.length > 2000) {
                        const chunks = fullText.match(/[\s\S]{1,1990}/g) || [];
                        for (const chunk of chunks) {
                            await logChannel.send(chunk);
                        }
                    } else {
                        await logChannel.send(fullText);
                    }
                }
            }
        } catch (e) {
            console.error('[Survey] Failed to log response:', e);
        }
    }

    return true;
}

module.exports = {
    name: 'Survey',
    description: 'Season feedback survey system',
    commands,
    handleSurveyButton,
    handleSurveySubmit
};
