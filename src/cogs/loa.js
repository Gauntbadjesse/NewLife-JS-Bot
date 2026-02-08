const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const LOA = require('../database/models/LOA');
const { isStaff } = require('../utils/permissions');
const { parseDuration } = require('../utils/duration');
const { registerTimeout, removeTimeout } = require('../utils/cleanup');

const LOA_ROLE_ID = '1459778232206360681';

// Track scheduled auto-ends for cleanup
const scheduledAutoEnds = new Map();

function scheduleAutoEnd(client, guildId, userId, endDate) {
    const timeUntilEnd = endDate.getTime() - Date.now();
    
    if (timeUntilEnd <= 0) return;

    // Don't schedule if more than 24 hours (will be checked on bot restart)
    if (timeUntilEnd > 24 * 60 * 60 * 1000) return;

    // Cancel any existing timeout for this user
    const existingKey = `${guildId}_${userId}`;
    if (scheduledAutoEnds.has(existingKey)) {
        removeTimeout(scheduledAutoEnds.get(existingKey));
    }

    const timeout = setTimeout(async () => {
        scheduledAutoEnds.delete(existingKey);
        try {
            const loa = await LOA.findOne({ guildId, userId, active: true });
            if (!loa) return;

            // Check if end date has passed
            if (new Date() >= loa.endDate) {
                loa.active = false;
                await loa.save();

                const guild = client.guilds.cache.get(guildId);
                if (guild) {
                    try {
                        const member = await guild.members.fetch(userId);
                        await member.roles.remove(LOA_ROLE_ID);
                        console.log(`[LOA] Auto-ended LOA for ${member.user.tag}`);
                    } catch {
                        // Member may have left
                    }
                }
            }
        } catch (error) {
            console.error('[LOA] Error in auto-end:', error);
        }
    }, timeUntilEnd);

    const timeoutId = registerTimeout(`loa-autoend-${userId}`, timeout);
    scheduledAutoEnds.set(existingKey, timeoutId);
}

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('loa')
            .setDescription('Leave of Absence management')
            .addSubcommand(sub =>
                sub.setName('start')
                    .setDescription('Start a leave of absence')
                    .addStringOption(option =>
                        option.setName('duration')
                            .setDescription('Duration (e.g., 3d, 1w, 2w)')
                            .setRequired(true))
                    .addStringOption(option =>
                        option.setName('reason')
                            .setDescription('Reason for LOA')
                            .setRequired(false)))
            .addSubcommand(sub =>
                sub.setName('end')
                    .setDescription('End your leave of absence early'))
            .addSubcommand(sub =>
                sub.setName('view')
                    .setDescription('View all staff currently on LOA')),

        async execute(interaction) {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'start') {
                // Check if user is staff
                if (!isStaff(interaction.member)) {
                    return interaction.reply({ content: 'This command is for staff members only.', ephemeral: true });
                }

                const durationStr = interaction.options.getString('duration');
                const reason = interaction.options.getString('reason') || 'No reason provided';

                // Parse duration
                const duration = parseDuration(durationStr);
                if (!duration) {
                    return interaction.reply({ content: 'Invalid duration format. Use formats like: 3d, 1w, 2w', ephemeral: true });
                }

                // Check if already on LOA
                const existingLOA = await LOA.findOne({ userId: interaction.user.id, active: true });
                if (existingLOA) {
                    return interaction.reply({ content: 'You are already on LOA. Use `/loa end` to end your current LOA first.', ephemeral: true });
                }

                const endDate = new Date(Date.now() + duration);

                // Create LOA record
                await LOA.create({
                    guildId: interaction.guild.id,
                    userId: interaction.user.id,
                    reason: reason,
                    endDate: endDate,
                    active: true
                });

                // Add LOA role
                try {
                    await interaction.member.roles.add(LOA_ROLE_ID);
                } catch (error) {
                    console.error('[LOA] Failed to add LOA role:', error);
                }

                const embed = new EmbedBuilder()
                    .setTitle('Leave of Absence Started')
                    .setColor(0x2B2D31)
                    .addFields(
                        { name: 'Staff Member', value: interaction.user.tag, inline: true },
                        { name: 'Duration', value: durationStr, inline: true },
                        { name: 'End Date', value: `<t:${Math.floor(endDate.getTime() / 1000)}:F>`, inline: true },
                        { name: 'Reason', value: reason }
                    )
                    .setFooter({ text: 'NewLife SMP 2026' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

                // Schedule auto-end
                scheduleAutoEnd(interaction.client, interaction.guild.id, interaction.user.id, endDate);

            } else if (subcommand === 'end') {
                const loa = await LOA.findOne({ userId: interaction.user.id, active: true });
                
                if (!loa) {
                    return interaction.reply({ content: 'You are not currently on LOA.', ephemeral: true });
                }

                loa.active = false;
                await loa.save();

                // Remove LOA role
                try {
                    await interaction.member.roles.remove(LOA_ROLE_ID);
                } catch (error) {
                    console.error('[LOA] Failed to remove LOA role:', error);
                }

                const embed = new EmbedBuilder()
                    .setTitle('Leave of Absence Ended')
                    .setColor(0x57F287)
                    .setDescription(`${interaction.user.tag} has returned from LOA.`)
                    .setFooter({ text: 'NewLife SMP 2026' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

            } else if (subcommand === 'view') {
                const activeLOAs = await LOA.find({ guildId: interaction.guild.id, active: true });

                if (activeLOAs.length === 0) {
                    return interaction.reply({ content: 'No staff members are currently on LOA.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle('Staff on Leave of Absence')
                    .setColor(0x2B2D31)
                    .setFooter({ text: 'NewLife SMP 2026' })
                    .setTimestamp();

                let description = '';
                for (const loa of activeLOAs) {
                    try {
                        const member = await interaction.guild.members.fetch(loa.userId);
                        description += `**${member.user.tag}**\n`;
                        description += `Ends: <t:${Math.floor(loa.endDate.getTime() / 1000)}:R>\n`;
                        description += `Reason: ${loa.reason}\n\n`;
                    } catch {
                        // Member left server, clean up
                        loa.active = false;
                        await loa.save();
                    }
                }

                if (description === '') {
                    return interaction.reply({ content: 'No staff members are currently on LOA.', ephemeral: true });
                }

                embed.setDescription(description);
                await interaction.reply({ embeds: [embed] });
            }
        }
    }
];

module.exports = {
    slashCommands,

    // Check for expired LOAs on startup
    async checkExpiredLOAs(client) {
        const expiredLOAs = await LOA.find({ active: true, endDate: { $lte: new Date() } });
        
        for (const loa of expiredLOAs) {
            loa.active = false;
            await loa.save();

            try {
                const guild = client.guilds.cache.get(loa.guildId);
                if (guild) {
                    const member = await guild.members.fetch(loa.userId);
                    await member.roles.remove(LOA_ROLE_ID);
                    console.log(`[LOA] Removed expired LOA for ${member.user.tag}`);
                }
            } catch {
                // Ignore errors
            }
        }

        // Schedule upcoming LOA endings (within 24 hours)
        const upcomingLOAs = await LOA.find({
            active: true,
            endDate: { $gt: new Date(), $lte: new Date(Date.now() + 24 * 60 * 60 * 1000) }
        });

        for (const loa of upcomingLOAs) {
            scheduleAutoEnd(client, loa.guildId, loa.userId, loa.endDate);
        }

        console.log(`[LOA] Checked ${expiredLOAs.length} expired LOAs, scheduled ${upcomingLOAs.length} upcoming`);
    }
};
