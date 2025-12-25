/**
 * Custom Embeds Cog
 * Create and send custom embeds with buttons via Discord
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const CustomEmbed = require('../database/models/CustomEmbed');
const { isAdmin } = require('../utils/permissions');

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('embed')
            .setDescription('Custom embed management')
            .addSubcommand(sub => sub
                .setName('create')
                .setDescription('Create a new custom embed')
                .addStringOption(opt => opt.setName('name').setDescription('Unique name for this embed').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('send')
                .setDescription('Send a saved embed')
                .addStringOption(opt => opt.setName('name').setDescription('Embed name').setRequired(true).setAutocomplete(true))
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel to send to').setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List all saved embeds')
            )
            .addSubcommand(sub => sub
                .setName('delete')
                .setDescription('Delete a saved embed')
                .addStringOption(opt => opt.setName('name').setDescription('Embed name').setRequired(true).setAutocomplete(true))
            )
            .addSubcommand(sub => sub
                .setName('preview')
                .setDescription('Preview a saved embed')
                .addStringOption(opt => opt.setName('name').setDescription('Embed name').setRequired(true).setAutocomplete(true))
            )
            .addSubcommand(sub => sub
                .setName('addbutton')
                .setDescription('Add a button to an embed')
                .addStringOption(opt => opt.setName('name').setDescription('Embed name').setRequired(true).setAutocomplete(true))
                .addStringOption(opt => opt.setName('label').setDescription('Button label').setRequired(true))
                .addStringOption(opt => opt.setName('action').setDescription('Button action').setRequired(true)
                    .addChoices(
                        { name: 'Appeal Button', value: 'appeal' },
                        { name: 'Ticket Button', value: 'ticket' },
                        { name: 'Custom URL', value: 'url' },
                        { name: 'Custom Action', value: 'custom' }
                    ))
                .addStringOption(opt => opt.setName('value').setDescription('URL or custom action ID').setRequired(false))
                .addStringOption(opt => opt.setName('style').setDescription('Button style').setRequired(false)
                    .addChoices(
                        { name: 'Primary (Blue)', value: 'primary' },
                        { name: 'Secondary (Gray)', value: 'secondary' },
                        { name: 'Success (Green)', value: 'success' },
                        { name: 'Danger (Red)', value: 'danger' }
                    ))
                .addStringOption(opt => opt.setName('emoji').setDescription('Button emoji').setRequired(false))
            )
            .addSubcommand(sub => sub
                .setName('removebutton')
                .setDescription('Remove a button from an embed')
                .addStringOption(opt => opt.setName('name').setDescription('Embed name').setRequired(true).setAutocomplete(true))
                .addIntegerOption(opt => opt.setName('index').setDescription('Button index (1-based)').setRequired(true))
            ),

        async execute(interaction, client) {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Permission denied.', ephemeral: true });
            }

            const sub = interaction.options.getSubcommand();

            if (sub === 'create') {
                const name = interaction.options.getString('name').toLowerCase();

                // Check if name exists
                const existing = await CustomEmbed.findOne({ name, guildId: interaction.guild.id });
                if (existing) {
                    return interaction.reply({ content: '❌ An embed with this name already exists.', ephemeral: true });
                }

                // Show modal for embed creation
                const modal = new ModalBuilder()
                    .setCustomId(`embed_create_${name}`)
                    .setTitle('Create Custom Embed');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('title')
                            .setLabel('Title')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMaxLength(256)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('description')
                            .setLabel('Description')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(false)
                            .setMaxLength(4000)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('color')
                            .setLabel('Color (hex, e.g., #3b82f6)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                            .setPlaceholder('#3b82f6')
                            .setMaxLength(7)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('footer')
                            .setLabel('Footer')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                            .setMaxLength(2048)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('image')
                            .setLabel('Image URL')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                    )
                );

                return interaction.showModal(modal);
            }

            if (sub === 'send') {
                const name = interaction.options.getString('name').toLowerCase();
                const channel = interaction.options.getChannel('channel') || interaction.channel;

                const embedData = await CustomEmbed.findOne({ name, guildId: interaction.guild.id });
                if (!embedData) {
                    return interaction.reply({ content: '❌ Embed not found.', ephemeral: true });
                }

                const { embed, components } = buildEmbed(embedData);

                try {
                    await channel.send({ embeds: [embed], components });
                    return interaction.reply({ content: `✅ Embed sent to <#${channel.id}>.`, ephemeral: true });
                } catch (error) {
                    return interaction.reply({ content: '❌ Failed to send embed. Check permissions.', ephemeral: true });
                }
            }

            if (sub === 'list') {
                const embeds = await CustomEmbed.find({ guildId: interaction.guild.id });

                if (embeds.length === 0) {
                    return interaction.reply({ content: '📝 No custom embeds saved.', ephemeral: true });
                }

                const list = embeds.map(e => {
                    const buttons = e.buttons?.length ? ` (${e.buttons.length} buttons)` : '';
                    return `• **${e.name}** - ${e.title}${buttons}`;
                }).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle('📋 Custom Embeds')
                    .setDescription(list)
                    .setColor('#3b82f6')
                    .setFooter({ text: `${embeds.length} embed(s)` });

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (sub === 'delete') {
                const name = interaction.options.getString('name').toLowerCase();

                const result = await CustomEmbed.deleteOne({ name, guildId: interaction.guild.id });
                if (result.deletedCount === 0) {
                    return interaction.reply({ content: '❌ Embed not found.', ephemeral: true });
                }

                return interaction.reply({ content: `✅ Deleted embed **${name}**.`, ephemeral: true });
            }

            if (sub === 'preview') {
                const name = interaction.options.getString('name').toLowerCase();

                const embedData = await CustomEmbed.findOne({ name, guildId: interaction.guild.id });
                if (!embedData) {
                    return interaction.reply({ content: '❌ Embed not found.', ephemeral: true });
                }

                const { embed, components } = buildEmbed(embedData);
                return interaction.reply({ embeds: [embed], components, ephemeral: true });
            }

            if (sub === 'addbutton') {
                const name = interaction.options.getString('name').toLowerCase();
                const label = interaction.options.getString('label');
                const action = interaction.options.getString('action');
                const value = interaction.options.getString('value');
                const style = interaction.options.getString('style') || 'primary';
                const emoji = interaction.options.getString('emoji');

                const embedData = await CustomEmbed.findOne({ name, guildId: interaction.guild.id });
                if (!embedData) {
                    return interaction.reply({ content: '❌ Embed not found.', ephemeral: true });
                }

                if (embedData.buttons.length >= 25) {
                    return interaction.reply({ content: '❌ Maximum 25 buttons per embed.', ephemeral: true });
                }

                // Validate URL action
                if (action === 'url' && !value) {
                    return interaction.reply({ content: '❌ URL action requires a value (URL).', ephemeral: true });
                }

                const button = {
                    label,
                    style,
                    emoji: emoji || null,
                    action,
                    customId: action !== 'url' ? `ce_${action}_${Date.now()}` : null,
                    url: action === 'url' ? value : null
                };

                embedData.buttons.push(button);
                await embedData.save();

                return interaction.reply({ content: `✅ Added button **${label}** to embed **${name}**.`, ephemeral: true });
            }

            if (sub === 'removebutton') {
                const name = interaction.options.getString('name').toLowerCase();
                const index = interaction.options.getInteger('index') - 1;

                const embedData = await CustomEmbed.findOne({ name, guildId: interaction.guild.id });
                if (!embedData) {
                    return interaction.reply({ content: '❌ Embed not found.', ephemeral: true });
                }

                if (index < 0 || index >= embedData.buttons.length) {
                    return interaction.reply({ content: '❌ Invalid button index.', ephemeral: true });
                }

                const removed = embedData.buttons.splice(index, 1);
                await embedData.save();

                return interaction.reply({ content: `✅ Removed button **${removed[0].label}** from embed.`, ephemeral: true });
            }
        },

        async autocomplete(interaction) {
            const focused = interaction.options.getFocused().toLowerCase();
            const embeds = await CustomEmbed.find({ guildId: interaction.guild.id });
            
            const filtered = embeds
                .filter(e => e.name.toLowerCase().includes(focused))
                .slice(0, 25)
                .map(e => ({ name: `${e.name} - ${e.title}`, value: e.name }));

            return interaction.respond(filtered);
        }
    }
];

/**
 * Build embed and components from database data
 */
function buildEmbed(embedData) {
    const embed = new EmbedBuilder()
        .setTitle(embedData.title)
        .setColor(embedData.color || '#3b82f6');

    if (embedData.description) {
        embed.setDescription(embedData.description);
    }

    if (embedData.footer) {
        embed.setFooter({ text: embedData.footer });
    }

    if (embedData.image) {
        embed.setImage(embedData.image);
    }

    if (embedData.thumbnail) {
        embed.setThumbnail(embedData.thumbnail);
    }

    if (embedData.fields && embedData.fields.length > 0) {
        embed.addFields(embedData.fields.map(f => ({
            name: f.name,
            value: f.value,
            inline: f.inline || false
        })));
    }

    // Build button components
    const components = [];
    if (embedData.buttons && embedData.buttons.length > 0) {
        const rows = [];
        let currentRow = new ActionRowBuilder();
        let buttonCount = 0;

        for (const btn of embedData.buttons) {
            const button = new ButtonBuilder().setLabel(btn.label);

            // Set style
            const styleMap = {
                primary: ButtonStyle.Primary,
                secondary: ButtonStyle.Secondary,
                success: ButtonStyle.Success,
                danger: ButtonStyle.Danger,
                link: ButtonStyle.Link
            };
            button.setStyle(btn.url ? ButtonStyle.Link : (styleMap[btn.style] || ButtonStyle.Primary));

            // Set emoji if present
            if (btn.emoji) {
                button.setEmoji(btn.emoji);
            }

            // Set URL or custom ID based on action
            if (btn.url) {
                button.setURL(btn.url);
            } else {
                // Map special actions to their handlers
                let customId = btn.customId;
                if (btn.action === 'appeal') {
                    customId = 'open_appeal';
                } else if (btn.action === 'ticket') {
                    customId = 'open_ticket';
                }
                button.setCustomId(customId);
            }

            currentRow.addComponents(button);
            buttonCount++;

            if (buttonCount === 5) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
                buttonCount = 0;
            }
        }

        if (buttonCount > 0) {
            rows.push(currentRow);
        }

        components.push(...rows.slice(0, 5));
    }

    return { embed, components };
}

/**
 * Handle embed creation modal
 */
async function handleEmbedModal(interaction) {
    if (!interaction.customId.startsWith('embed_create_')) return false;

    const name = interaction.customId.replace('embed_create_', '');

    const title = interaction.fields.getTextInputValue('title');
    const description = interaction.fields.getTextInputValue('description') || null;
    const color = interaction.fields.getTextInputValue('color') || '#3b82f6';
    const footer = interaction.fields.getTextInputValue('footer') || null;
    const image = interaction.fields.getTextInputValue('image') || null;

    try {
        const embedData = new CustomEmbed({
            guildId: interaction.guild.id,
            name,
            title,
            description,
            color,
            footer,
            image,
            buttons: [],
            fields: [],
            createdBy: interaction.user.id
        });
        await embedData.save();

        return interaction.reply({
            content: `✅ Embed **${name}** created!\n\nUse \`/embed addbutton\` to add buttons, or \`/embed send\` to send it.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error creating embed:', error);
        return interaction.reply({ content: '❌ Failed to create embed.', ephemeral: true });
    }
}

module.exports = {
    name: 'CustomEmbeds',
    slashCommands,
    buildEmbed,
    handleEmbedModal
};
