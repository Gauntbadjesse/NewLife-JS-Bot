/**
 * Preset Embeds Cog
 * Predefined embeds for rules, guides, and DM functionality
 * 
 * Commands:
 * - !embed rules - Send rules embed
 * - !embed guru - Send guru guide embed
 * - !dm guru @user - DM the guru guide to a user
 */

const { EmbedBuilder } = require('discord.js');
const { isStaff, isAdmin } = require('../utils/permissions');
const { getEmbedColor, createErrorEmbed, createSuccessEmbed } = require('../utils/embeds');

/**
 * Create the Rules Embed
 */
function createRulesEmbed() {
    const embed = new EmbedBuilder()
        .setColor(getEmbedColor())
        .setTitle('SERVER RULES')
        .setDescription('All rules apply both in-game and on the official NewLife SMP Discord server. These rules are mandatory and non-negotiable. Ignorance of any rule is never an acceptable excuse for violating it.\n\n**[View Full Rules](https://newlifesmp.com/rules)**')
        .addFields(
            {
                name: 'Overview & Jurisdiction',
                value: 'These rules apply universally to all players, regardless of rank, tenure, or contribution. Rules apply across all platforms including the Minecraft server, Discord, and affiliated channels.',
                inline: false
            },
            {
                name: 'Code of Conduct',
                value: '- **Respect Required** - No harassment, hate speech, doxxing, or threats\n- **Account Responsibility** - You are responsible for all actions on your account\n- **No NSFW Content** - Absolutely prohibited in all forms\n- **No Impersonation** - Do not impersonate staff or other players\n- **No Advertising** - No promotion without approval\n- **No Spamming** - No chat, command, or entity spam\n- **Follow Staff Instructions** - Comply first, appeal later',
                inline: false
            },
            {
                name: 'Gameplay Rules',
                value: '- **PvP Consent** - Requires explicit, timestamped, server-verifiable consent (expires 24h)\n- **No Griefing/Theft** - Automatic rollback and ban\n- **Property Claims** - Require mailbox + sign with owner, date, radius, coordinates\n- **No Exploits** - No x-ray, hacks, dupes, or unfair mods\n- **No Intentional Lag** - Chunk loaders prohibited',
                inline: false
            },
            {
                name: 'Market & Kingdom Rules',
                value: '- **One Market Stall Per Player** - Alts count as same player\n- **No Market Fraud** - No collusion, price manipulation, or wash trading\n- **Kingdom Registration** - Must designate ruler and register via ticket\n- **Evictions** - Require 7 days written notice\n- **War Declarations** - Require mutual documentation from both rulers',
                inline: false
            },
            {
                name: 'Enforcement',
                value: '**Ladder:** Warning > Fine > Temp Ban > Perm Ban\n\n*Severe violations (griefing, exploits, public build destruction) result in immediate bans.*\n\n**Admissible Evidence:** Server chat logs, signed books, action logs, snapshots\n**Not Admissible:** Screenshots, unsigned text, client-side logs\n\nAppeals must be filed within 7 days via the ticket system.',
                inline: false
            },
            {
                name: 'Required Formats',
                value: '**Property Claim:**\n`Claim by <name> on <YYYY-MM-DD> at <x,y,z> radius <N blocks>`\n\n**PvP Consent:**\n`PvP consent: <A> consents to PvP with <B> on <date> chatID:<id>`',
                inline: false
            }
        )
        .setFooter({ text: 'NewLife SMP • Updated 12/17/2025 • Full rules at newlifesmp.com/rules' })
        .setTimestamp();

    return embed;
}

/**
 * Create the Guru Guide Embed
 */
function createGuruEmbed() {
    const embed = new EmbedBuilder()
        .setColor(getEmbedColor())
        .setTitle('Guru Guide')
        .setDescription('Look at the guru guide [here](https://curse-broker-d26.notion.site/Introduction-2de1919dd02680b794a2da4e2feca939).')
        .setFooter({ text: 'NewLife SMP' })
        .setTimestamp();

    return embed;
}

/**
 * Prefix Commands
 */
const commands = {
    // !embed <type> - Send a preset embed
    embed: {
        name: 'embed',
        description: 'Send a preset embed',
        usage: '!embed <rules|guru>',
        async execute(message, args, client) {
            // Check staff permissions
            if (!isStaff(message.member)) {
                return message.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    allowedMentions: { repliedUser: false }
                });
            }

            if (!args[0]) {
                return message.reply({
                    embeds: [createErrorEmbed('Missing Argument', 'Please specify an embed type.\n\n**Usage:** `!embed <rules|guru>`\n\n**Available Embeds:**\n• `rules` - Server rules\n• `guru` - Guru guide link')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const embedType = args[0].toLowerCase();

            // Delete the command message
            try {
                await message.delete();
            } catch (err) {
                // Ignore if we can't delete
            }

            switch (embedType) {
                case 'rules':
                    return message.channel.send({ embeds: [createRulesEmbed()] });

                case 'guru':
                    return message.channel.send({ embeds: [createGuruEmbed()] });

                default:
                    return message.channel.send({
                        embeds: [createErrorEmbed('Invalid Embed', `Unknown embed type: \`${embedType}\`\n\n**Available Embeds:**\n• \`rules\` - Server rules\n• \`guru\` - Guru guide link`)]
                    });
            }
        }
    },

    // !dm <type> @user - DM a preset embed to a user
    dm: {
        name: 'dm',
        description: 'DM a preset embed to a user',
        usage: '!dm <guru> @user',
        async execute(message, args, client) {
            // Check staff permissions
            if (!isStaff(message.member)) {
                return message.reply({
                    embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
                    allowedMentions: { repliedUser: false }
                });
            }

            if (!args[0]) {
                return message.reply({
                    embeds: [createErrorEmbed('Missing Argument', 'Please specify a DM type.\n\n**Usage:** `!dm <guru> @user`\n\n**Available DMs:**\n• `guru` - Guru guide link')],
                    allowedMentions: { repliedUser: false }
                });
            }

            const dmType = args[0].toLowerCase();
            const targetUser = message.mentions.users.first();

            if (!targetUser) {
                return message.reply({
                    embeds: [createErrorEmbed('Missing User', 'Please mention a user to DM.\n\n**Usage:** `!dm <guru> @user`')],
                    allowedMentions: { repliedUser: false }
                });
            }

            let embed;
            let dmName;

            switch (dmType) {
                case 'guru':
                    embed = createGuruEmbed();
                    dmName = 'Guru Guide';
                    break;

                default:
                    return message.reply({
                        embeds: [createErrorEmbed('Invalid DM Type', `Unknown DM type: \`${dmType}\`\n\n**Available DMs:**\n• \`guru\` - Guru guide link`)],
                        allowedMentions: { repliedUser: false }
                    });
            }

            try {
                await targetUser.send({ embeds: [embed] });
                return message.reply({
                    embeds: [createSuccessEmbed('DM Sent', `Successfully sent the **${dmName}** to ${targetUser}.`)],
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                console.error('Error sending DM:', error);
                return message.reply({
                    embeds: [createErrorEmbed('DM Failed', `Could not send DM to ${targetUser}. They may have DMs disabled.`)],
                    allowedMentions: { repliedUser: false }
                });
            }
        }
    }
};

module.exports = {
    commands,
    name: 'PresetEmbeds'
};
