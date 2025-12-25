/**
 * Notes Cog
 * Staff notes system for tracking player information
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Note = require('../database/models/Note');
const { isStaff, isAdmin } = require('../utils/permissions');
const { resolvePlayer } = require('../utils/playerResolver');

const NOTES_PER_PAGE = 5;

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('note')
            .setDescription('Staff notes management')
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('Add a note to a player')
                .addStringOption(opt => opt.setName('player').setDescription('Player name or UUID').setRequired(true))
                .addStringOption(opt => opt.setName('content').setDescription('Note content').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List notes for a player')
                .addStringOption(opt => opt.setName('player').setDescription('Player name or UUID').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('delete')
                .setDescription('Delete a note')
                .addStringOption(opt => opt.setName('id').setDescription('Note ID').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('search')
                .setDescription('Search notes by content')
                .addStringOption(opt => opt.setName('query').setDescription('Search query').setRequired(true))
            )
            .addSubcommand(sub => sub
                .setName('recent')
                .setDescription('View recent notes across all players')
            ),

        async execute(interaction, client) {
            if (!isStaff(interaction.member)) {
                return interaction.reply({ content: '❌ Permission denied. Staff only.', ephemeral: true });
            }

            const sub = interaction.options.getSubcommand();

            if (sub === 'add') {
                const playerInput = interaction.options.getString('player');
                const content = interaction.options.getString('content');

                await interaction.deferReply({ ephemeral: true });

                // Try to resolve player
                let playerName = playerInput;
                let uuid = null;

                try {
                    const resolved = await resolvePlayer(playerInput);
                    if (resolved) {
                        playerName = resolved.name;
                        uuid = resolved.uuid;
                    }
                } catch (e) {
                    // Just use the input as-is if resolution fails
                }

                const note = new Note({
                    playerName: playerName.toLowerCase(),
                    uuid,
                    staffId: interaction.user.id,
                    staffName: interaction.user.tag,
                    content,
                    createdAt: new Date()
                });

                await note.save();

                const embed = new EmbedBuilder()
                    .setTitle('📝 Note Added')
                    .setColor('#22c55e')
                    .addFields(
                        { name: 'Player', value: playerName, inline: true },
                        { name: 'Note ID', value: note._id.toString().slice(-8), inline: true },
                        { name: 'Content', value: content.substring(0, 1000), inline: false }
                    )
                    .setFooter({ text: `Added by ${interaction.user.tag}` })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'list') {
                const playerInput = interaction.options.getString('player');
                
                await interaction.deferReply({ ephemeral: true });

                // Try to resolve player
                let playerName = playerInput.toLowerCase();
                try {
                    const resolved = await resolvePlayer(playerInput);
                    if (resolved) {
                        playerName = resolved.name.toLowerCase();
                    }
                } catch (e) {}

                const notes = await Note.find({ playerName }).sort({ createdAt: -1 }).limit(25);

                if (notes.length === 0) {
                    return interaction.editReply({ content: `📝 No notes found for **${playerInput}**.` });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`📝 Notes for ${playerInput}`)
                    .setColor('#3b82f6')
                    .setDescription(`Found ${notes.length} note(s)`)
                    .setTimestamp();

                for (const note of notes.slice(0, NOTES_PER_PAGE)) {
                    const date = note.createdAt.toLocaleDateString();
                    const shortId = note._id.toString().slice(-8);
                    embed.addFields({
                        name: `[${shortId}] by ${note.staffName} • ${date}`,
                        value: note.content.substring(0, 200) + (note.content.length > 200 ? '...' : ''),
                        inline: false
                    });
                }

                if (notes.length > NOTES_PER_PAGE) {
                    embed.setFooter({ text: `Showing ${NOTES_PER_PAGE} of ${notes.length} notes` });
                }

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'delete') {
                const noteId = interaction.options.getString('id');

                // Try to find by full ID or partial ID
                let note = await Note.findById(noteId).catch(() => null);
                
                if (!note) {
                    // Try partial match
                    const allNotes = await Note.find({});
                    note = allNotes.find(n => n._id.toString().endsWith(noteId));
                }

                if (!note) {
                    return interaction.reply({ content: '❌ Note not found.', ephemeral: true });
                }

                // Only the author or admin can delete
                if (note.staffId !== interaction.user.id && !isAdmin(interaction.member)) {
                    return interaction.reply({ content: '❌ You can only delete your own notes (unless admin).', ephemeral: true });
                }

                const playerName = note.playerName;
                await Note.deleteOne({ _id: note._id });

                return interaction.reply({
                    content: `✅ Deleted note for **${playerName}**.`,
                    ephemeral: true
                });
            }

            if (sub === 'search') {
                const query = interaction.options.getString('query');
                
                await interaction.deferReply({ ephemeral: true });

                const notes = await Note.find({
                    content: { $regex: query, $options: 'i' }
                }).sort({ createdAt: -1 }).limit(15);

                if (notes.length === 0) {
                    return interaction.editReply({ content: `📝 No notes found matching "**${query}**".` });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`📝 Search Results: "${query}"`)
                    .setColor('#f59e0b')
                    .setDescription(`Found ${notes.length} matching note(s)`)
                    .setTimestamp();

                for (const note of notes.slice(0, 10)) {
                    const date = note.createdAt.toLocaleDateString();
                    const shortId = note._id.toString().slice(-8);
                    embed.addFields({
                        name: `[${shortId}] ${note.playerName} • ${note.staffName} • ${date}`,
                        value: note.content.substring(0, 150) + (note.content.length > 150 ? '...' : ''),
                        inline: false
                    });
                }

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'recent') {
                await interaction.deferReply({ ephemeral: true });

                const notes = await Note.find({}).sort({ createdAt: -1 }).limit(15);

                if (notes.length === 0) {
                    return interaction.editReply({ content: '📝 No notes in the system yet.' });
                }

                const embed = new EmbedBuilder()
                    .setTitle('📝 Recent Notes')
                    .setColor('#8b5cf6')
                    .setDescription(`Showing ${notes.length} most recent notes`)
                    .setTimestamp();

                for (const note of notes.slice(0, 10)) {
                    const date = note.createdAt.toLocaleDateString();
                    const shortId = note._id.toString().slice(-8);
                    embed.addFields({
                        name: `[${shortId}] ${note.playerName} • ${note.staffName} • ${date}`,
                        value: note.content.substring(0, 150) + (note.content.length > 150 ? '...' : ''),
                        inline: false
                    });
                }

                return interaction.editReply({ embeds: [embed] });
            }
        }
    }
];

/**
 * Get notes for a player (used by other parts of the system)
 */
async function getPlayerNotes(playerName) {
    return Note.find({ playerName: playerName.toLowerCase() }).sort({ createdAt: -1 });
}

/**
 * Add a quick note programmatically
 */
async function addNote(playerName, staffId, staffName, content) {
    const note = new Note({
        playerName: playerName.toLowerCase(),
        staffId,
        staffName,
        content,
        createdAt: new Date()
    });
    await note.save();
    return note;
}

module.exports = {
    name: 'Notes',
    slashCommands,
    getPlayerNotes,
    addNote
};
