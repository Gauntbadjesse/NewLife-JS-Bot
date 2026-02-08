/**
 * Pagination Utility
 * Reusable paginated embeds with button navigation
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

/**
 * Create a paginated embed response
 * @param {Object} options - Pagination options
 * @param {Interaction|Message} options.interaction - Discord interaction or message
 * @param {EmbedBuilder[]} options.pages - Array of embed pages
 * @param {number} options.timeout - Timeout in ms (default 5 minutes)
 * @param {boolean} options.ephemeral - Whether the response is ephemeral
 * @param {string} options.authorId - User ID who can use buttons (defaults to interaction user)
 */
async function paginate({
    interaction,
    pages,
    timeout = 5 * 60 * 1000,
    ephemeral = false,
    authorId = null
}) {
    if (!pages || pages.length === 0) {
        throw new Error('At least one page is required');
    }

    const userId = authorId || interaction.user?.id || interaction.author?.id;
    let currentPage = 0;

    // If only one page, just send it without buttons
    if (pages.length === 1) {
        const options = { embeds: [pages[0]], ephemeral };
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply(options);
        }
        return interaction.reply ? interaction.reply(options) : interaction.channel.send(options);
    }

    // Create navigation buttons
    const getButtons = (page) => {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('page_first')
                .setEmoji('⏮️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId('page_prev')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId('page_indicator')
                .setLabel(`${page + 1}/${pages.length}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('page_next')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === pages.length - 1),
            new ButtonBuilder()
                .setCustomId('page_last')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === pages.length - 1)
        );
    };

    // Send initial message
    const messageOptions = {
        embeds: [pages[currentPage]],
        components: [getButtons(currentPage)],
        ephemeral
    };

    let message;
    if (interaction.deferred || interaction.replied) {
        message = await interaction.editReply(messageOptions);
    } else if (interaction.reply) {
        message = await interaction.reply({ ...messageOptions, fetchReply: true });
    } else {
        message = await interaction.channel.send(messageOptions);
    }

    // Create collector
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: timeout,
        filter: (i) => i.user.id === userId
    });

    collector.on('collect', async (i) => {
        switch (i.customId) {
            case 'page_first':
                currentPage = 0;
                break;
            case 'page_prev':
                currentPage = Math.max(0, currentPage - 1);
                break;
            case 'page_next':
                currentPage = Math.min(pages.length - 1, currentPage + 1);
                break;
            case 'page_last':
                currentPage = pages.length - 1;
                break;
        }

        await i.update({
            embeds: [pages[currentPage]],
            components: [getButtons(currentPage)]
        });
    });

    collector.on('end', async () => {
        // Disable all buttons when collector ends
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('page_first')
                .setEmoji('⏮️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('page_prev')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('page_indicator')
                .setLabel(`${currentPage + 1}/${pages.length}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('page_next')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('page_last')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        try {
            await message.edit({ components: [disabledRow] });
        } catch {
            // Message may have been deleted
        }
    });

    return message;
}

/**
 * Create pages from an array of items
 * @param {Array} items - Array of items to paginate
 * @param {number} perPage - Items per page
 * @param {Function} embedBuilder - Function that takes (items, pageNum, totalPages) and returns EmbedBuilder
 * @returns {EmbedBuilder[]} Array of embeds
 */
function createPages(items, perPage, embedBuilder) {
    const pages = [];
    const totalPages = Math.ceil(items.length / perPage);

    for (let i = 0; i < totalPages; i++) {
        const start = i * perPage;
        const pageItems = items.slice(start, start + perPage);
        pages.push(embedBuilder(pageItems, i + 1, totalPages));
    }

    return pages;
}

/**
 * Simple field pagination - splits fields across pages
 * @param {Object} options
 * @param {string} options.title - Embed title
 * @param {string} options.description - Optional description
 * @param {number} options.color - Embed color
 * @param {Array} options.fields - Array of { name, value, inline } objects
 * @param {number} options.fieldsPerPage - Fields per page (default 10)
 * @returns {EmbedBuilder[]}
 */
function paginateFields({ title, description, color, fields, fieldsPerPage = 10 }) {
    const { EmbedBuilder } = require('discord.js');
    const pages = [];
    const totalPages = Math.ceil(fields.length / fieldsPerPage);

    for (let i = 0; i < totalPages; i++) {
        const start = i * fieldsPerPage;
        const pageFields = fields.slice(start, start + fieldsPerPage);
        
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color || 0x2B2D31)
            .setFields(pageFields)
            .setFooter({ text: `Page ${i + 1}/${totalPages}` });

        if (description && i === 0) {
            embed.setDescription(description);
        }

        pages.push(embed);
    }

    return pages.length > 0 ? pages : [
        new EmbedBuilder()
            .setTitle(title)
            .setDescription(description || 'No items to display.')
            .setColor(color || 0x2B2D31)
    ];
}

module.exports = {
    paginate,
    createPages,
    paginateFields
};
