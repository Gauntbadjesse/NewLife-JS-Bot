/**
 * Embed Builder Utilities
 * Professional embed templates for NewLife Management Bot
 */

const { EmbedBuilder } = require('discord.js');
const emojis = require('./emojis');

// Premium role ID for custom embed colors
const PREMIUM_ROLE_ID = process.env.NEWLIFE_PLUS;

// Get embed color from environment or use default
const getEmbedColor = () => {
    const color = process.env.EMBED_COLOR || '#2B2D31';
    return parseInt(color.replace('#', ''), 16);
};

/**
 * Get embed color for a member - uses their custom role color if premium
 * @param {GuildMember} member - Discord guild member
 * @returns {number} Color as integer
 */
const getMemberEmbedColor = async (member) => {
    if (!member) return getEmbedColor();
    
    // Check if member has premium role
    if (!member.roles || !member.roles.cache.has(PREMIUM_ROLE_ID)) {
        return getEmbedColor();
    }
    
    // Try to find their custom role (created by custom role system)
    // Custom roles are positioned under the premium role
    try {
        const CustomRole = require('../database/models/CustomRole');
        const customRole = await CustomRole.findOne({ 
            userId: member.id, 
            status: 'approved',
            roleId: { $exists: true, $ne: null }
        });
        
        if (customRole && customRole.roleColor) {
            return parseInt(customRole.roleColor.replace('#', ''), 16);
        }
    } catch (e) {
        // CustomRole model may not exist yet, fall back to default
    }
    
    // Fall back to their highest colored role
    const coloredRole = member.roles.cache
        .filter(r => r.color !== 0)
        .sort((a, b) => b.position - a.position)
        .first();
    
    if (coloredRole) {
        return coloredRole.color;
    }
    
    return getEmbedColor();
};

/**
 * Get embed color synchronously for a member - uses display color
 * @param {GuildMember} member - Discord guild member
 * @returns {number} Color as integer
 */
const getMemberEmbedColorSync = (member) => {
    if (!member) return getEmbedColor();
    
    // Check if member has premium role
    if (!member.roles || !member.roles.cache.has(PREMIUM_ROLE_ID)) {
        return getEmbedColor();
    }
    
    // Use their display color (highest colored role)
    if (member.displayColor && member.displayColor !== 0) {
        return member.displayColor;
    }
    
    return getEmbedColor();
};

/**
 * Create a warning embed
 * @param {Object} warning - Warning document from database
 * @returns {EmbedBuilder}
 */
function createWarningEmbed(warning) {
    const embed = new EmbedBuilder()
        .setColor(warning.active ? 0xFFA500 : 0x808080)
        .setTitle('Warning Case')
        .setDescription(`**Case:** #${warning.caseNumber || '—'} \n**ID:** \`${warning._id}\``)
        .addFields(
            {
                name: 'Player',
                value: `**Name:** ${warning.playerName}\n**UUID:** \`${warning.uuid}\``,
                inline: true
            },
            {
                name: 'Staff Member',
                value: `**Name:** ${warning.staffName}\n**UUID:** \`${warning.staffUuid || 'Console'}\``,
                inline: true
            },
            {
                name: 'Reason',
                value: warning.reason || 'No reason provided',
                inline: false
            },
            {
                name: 'Issued',
                value: `<t:${Math.floor(new Date(warning.createdAt).getTime() / 1000)}:F>`,
                inline: true
            },
            {
                name: 'Status',
                value: warning.active ? 'Active' : 'Removed',
                inline: true
            }
        )
        .setFooter({ text: 'NewLife Management | Warning System' })
        .setTimestamp();

    // Add removal info if warning was removed
    if (!warning.active && warning.removedBy) {
        embed.addFields({
            name: 'Removed',
            value: `**By:** ${warning.removedBy}\n**At:** <t:${Math.floor(new Date(warning.removedAt).getTime() / 1000)}:F>`,
            inline: false
        });
    }

    return embed;
}

/**
 * Create a ban embed
 * @param {Object} ban - Ban document from database
 * @returns {EmbedBuilder}
 */
function createBanEmbed(ban) {
    const embed = new EmbedBuilder()
        .setColor(ban.active ? 0xFF0000 : 0x808080)
        .setTitle('Ban Case')
        .setDescription(`**Case:** #${ban.caseNumber || '—'} \n**ID:** \`${ban._id}\``)
        .addFields(
            {
                name: 'Player',
                value: `**Name:** ${ban.playerName}\n**UUID:** \`${ban.uuid}\``,
                inline: true
            },
            {
                name: 'Staff Member',
                value: `**Name:** ${ban.staffName}\n**UUID:** \`${ban.staffUuid || 'Console'}\``,
                inline: true
            },
            {
                name: 'Reason',
                value: ban.reason || 'No reason provided',
                inline: false
            },
            {
                name: 'Issued',
                value: `<t:${Math.floor(new Date(ban.createdAt).getTime() / 1000)}:F>`,
                inline: true
            },
            {
                name: 'Status',
                value: ban.active ? 'Active' : 'Unbanned',
                inline: true
            }
        )
        .setFooter({ text: 'NewLife Management | Ban System' })
        .setTimestamp();

    // Add duration/expiration info for temp bans (defensive checks)
    try {
        const hasValidExpires = ban.expiresAt && !isNaN(new Date(ban.expiresAt).getTime());
        if (hasValidExpires) {
            embed.addFields({
                name: 'Duration',
                value: `Expires <t:${Math.floor(new Date(ban.expiresAt).getTime() / 1000)}:R>`,
                inline: true
            });
        } else if (ban.duration && typeof ban.duration === 'number') {
            // human friendly duration from milliseconds
            const ms = ban.duration;
            const days = Math.floor(ms / (24 * 60 * 60 * 1000));
            const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
            let display = '';
            if (days > 0) display = `${days} day${days>1?'s':''}`;
            else if (hours > 0) display = `${hours} hour${hours>1?'s':''}`;
            else if (minutes > 0) display = `${minutes} minute${minutes>1?'s':''}`;
            else display = `${Math.floor(ms/1000)} second${ms/1000>1?'s':''}`;

            embed.addFields({
                name: 'Duration',
                value: display,
                inline: true
            });
        } else {
            embed.addFields({
                name: 'Duration',
                value: 'Permanent',
                inline: true
            });
        }
    } catch (e) {
        embed.addFields({ name: 'Duration', value: 'Unknown', inline: true });
    }

    // Add removal info if ban was removed
    if (!ban.active && ban.removedBy) {
        embed.addFields({
            name: 'Unbanned',
            value: `**By:** ${ban.removedBy}\n**At:** <t:${Math.floor(new Date(ban.removedAt).getTime() / 1000)}:F>`,
            inline: false
        });
    }

    return embed;
}

/**
 * Create a player history embed
 * @param {string} playerName - Player name
 * @param {Array} warnings - Array of warnings
 * @param {Array} bans - Array of bans
 * @returns {EmbedBuilder}
 */
function createHistoryEmbed(playerName, warnings, bans) {
    const activeWarnings = warnings.filter(w => w.active).length;
    const activeBans = bans.filter(b => b.active).length;

    const embed = new EmbedBuilder()
        .setColor(getEmbedColor())
        .setTitle(`Player History: ${playerName}`)
        .addFields(
            {
                name: 'Warnings',
                value: `**Total:** ${warnings.length}\n**Active:** ${activeWarnings}`,
                inline: true
            },
            {
                name: 'Bans',
                value: `**Total:** ${bans.length}\n**Active:** ${activeBans}`,
                inline: true
            }
        )
        .setFooter({ text: 'NewLife Management | Player History' })
        .setTimestamp();

    // Add recent warnings
    if (warnings.length > 0) {
        const recentWarnings = warnings
            .slice(0, 5)
            .map((w, i) => `\`${i + 1}.\` ${w.reason.substring(0, 30)}${w.reason.length > 30 ? '...' : ''} - <t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:R>`)
            .join('\n');

        embed.addFields({
            name: 'Recent Warnings',
            value: recentWarnings || 'None',
            inline: false
        });
    }

    // Add recent bans
    if (bans.length > 0) {
        const recentBans = bans
            .slice(0, 5)
            .map((b, i) => `\`${i + 1}.\` ${b.reason.substring(0, 30)}${b.reason.length > 30 ? '...' : ''} - <t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R>`)
            .join('\n');

        embed.addFields({
            name: 'Recent Bans',
            value: recentBans || 'None',
            inline: false
        });
    }

    return embed;
}

/**
 * Create an error embed
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @returns {EmbedBuilder}
 */
function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(`${emojis.CROSS} ${title}`)
        .setDescription(description)
        .setFooter({ text: 'NewLife Management' })
        .setTimestamp();
}

/**
 * Create a success embed
 * @param {string} title - Success title
 * @param {string} description - Success description
 * @returns {EmbedBuilder}
 */
function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`${emojis.CHECK} ${title}`)
        .setDescription(description)
        .setFooter({ text: 'NewLife Management' })
        .setTimestamp();
}

/**
 * Create an info embed
 * @param {string} title - Info title
 * @param {string} description - Info description
 * @returns {EmbedBuilder}
 */
function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(getEmbedColor())
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: 'NewLife Management' })
        .setTimestamp();
}

/**
 * Create a list embed with pagination info
 * @param {string} title - List title
 * @param {Array} items - Array of items
 * @param {number} page - Current page
 * @param {number} totalPages - Total pages
 * @returns {EmbedBuilder}
 */
function createListEmbed(title, items, page, totalPages) {
    const embed = new EmbedBuilder()
        .setColor(getEmbedColor())
        .setTitle(title)
        .setDescription(items.join('\n') || 'No items found')
        .setFooter({ text: `NewLife Management • Page ${page}/${totalPages}` })
        .setTimestamp();

    return embed;
}

/**
 * Create a DM notification embed for warnings
 * @param {Object} warning - Warning document
 * @returns {EmbedBuilder}
 */
function createWarningDMEmbed(warning) {
    const viewUrl = warning.caseNumber 
        ? `https://staff.newlifesmp.com/home?case=mute-${warning.caseNumber}`
        : null;
    
    const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('You have been warned on NewLife SMP')
        .setDescription(`You have received a warning from the staff team.`)
        .addFields(
            {
                name: 'Reason',
                value: warning.reason || 'No reason provided',
                inline: false
            },
            {
                name: 'Issued By',
                value: warning.staffName,
                inline: true
            },
            {
                name: 'Date',
                value: `<t:${Math.floor(new Date(warning.createdAt).getTime() / 1000)}:F>`,
                inline: true
            },
            {
                name: 'Case',
                value: `#${warning.caseNumber || '—'} \n\`${warning._id}\``,
                inline: false
            }
        )
        .setFooter({ text: 'NewLife SMP | Please follow the server rules' })
        .setTimestamp();
    
    if (viewUrl) {
        embed.addFields({
            name: 'View Case Details',
            value: `[Click here to view this case with evidence](${viewUrl})`,
            inline: false
        });
    }
    
    return embed;
}

/**
 * Create a DM notification embed for bans
 * @param {Object} ban - Ban document
 * @returns {EmbedBuilder}
 */
function createBanDMEmbed(ban) {
    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('You have been banned from NewLife SMP')
        .setDescription(`You have been banned from the server.`)
        .addFields(
            {
                name: 'Reason',
                value: ban.reason || 'No reason provided',
                inline: false
            },
            {
                name: 'Banned By',
                value: ban.staffName,
                inline: true
            },
            {
                name: 'Date',
                value: `<t:${Math.floor(new Date(ban.createdAt).getTime() / 1000)}:F>`,
                inline: true
            },
            {
                name: 'Case',
                value: `#${ban.caseNumber || '—'} \n\`${ban._id}\``,
                inline: false
            }
        )
        .setFooter({ text: 'NewLife SMP | Appeal at discord.gg/newlife' })
        .setTimestamp();

    try {
        const hasValidExpires = ban.expiresAt && !isNaN(new Date(ban.expiresAt).getTime());
        if (hasValidExpires) {
            embed.addFields({
                name: 'Expires',
                value: `<t:${Math.floor(new Date(ban.expiresAt).getTime() / 1000)}:R>`,
                inline: true
            });
        }
    } catch (e) {
        // ignore
    }

    return embed;
}

/**
 * Create a log embed for warnings (sent to log channel)
 * @param {Object} warning - Warning document
 * @returns {EmbedBuilder}
 */
function createWarningLogEmbed(warning) {
    return new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('Warning Issued')
        .addFields(
            {
                name: 'Player',
                value: warning.playerName,
                inline: true
            },
            {
                name: 'Staff',
                value: warning.staffName,
                inline: true
            },
            {
                name: 'Case',
                value: `#${warning.caseNumber || '—'} \n\`${warning._id}\``,
                inline: true
            },
            {
                name: 'Reason',
                value: warning.reason || 'No reason provided',
                inline: false
            }
        )
        .setFooter({ text: 'NewLife Management | Warning Log' })
        .setTimestamp(new Date(warning.createdAt));
}

/**
 * Create a log embed for bans (sent to log channel)
 * @param {Object} ban - Ban document
 * @returns {EmbedBuilder}
 */
function createBanLogEmbed(ban) {
    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Ban Issued')
        .addFields(
            {
                name: 'Player',
                value: ban.playerName,
                inline: true
            },
            {
                name: 'Staff',
                value: ban.staffName,
                inline: true
            },
            {
                name: 'Case',
                value: `#${ban.caseNumber || '—'} \n\`${ban._id}\``,
                inline: true
            },
            {
                name: 'Reason',
                value: ban.reason || 'No reason provided',
                inline: false
            }
        )
        .setFooter({ text: 'NewLife Management | Ban Log' })
        .setTimestamp(new Date(ban.createdAt));

    // Add duration info for temp bans
    if (ban.expiresAt) {
        embed.addFields({
            name: 'Duration',
            value: `Expires <t:${Math.floor(new Date(ban.expiresAt).getTime() / 1000)}:R>`,
            inline: true
        });
    } else {
        embed.addFields({
            name: 'Duration',
            value: 'Permanent',
            inline: true
        });
    }

    return embed;
}

/**
 * Create a fine embed
 */
function createFineEmbed(fine) {
    const embed = new EmbedBuilder()
        .setColor(fine.paid ? 0x00FF00 : 0xFFAA00)
        .setTitle('Fine Case')
        .setDescription(`**Case:** #${fine.caseNumber || '—'} \n**ID:** \`${fine._id}\``)
        .addFields(
            { name: 'Player', value: `**Name:** ${fine.playerName}\n**UUID:** \`${fine.uuid}\``, inline: true },
            { name: 'Staff', value: `**Name:** ${fine.staffName}\n**UUID:** \`${fine.staffUuid || 'Console'}\``, inline: true },
            { name: 'Amount', value: fine.amount || 'N/A', inline: true },
            { name: 'Note', value: fine.note || 'No note provided', inline: false },
            { name: 'Issued', value: `<t:${Math.floor(new Date(fine.createdAt).getTime() / 1000)}:F>`, inline: true },
            { name: 'Status', value: fine.paid ? `Paid by ${fine.paidBy || 'Unknown'} on <t:${Math.floor(new Date(fine.paidAt).getTime() / 1000)}:F>` : 'Unpaid', inline: true }
        )
        .setFooter({ text: 'NewLife Management | Fine System' })
        .setTimestamp();

    if (fine.dueAt) {
        try {
            embed.addFields({ name: 'Due', value: `<t:${Math.floor(new Date(fine.dueAt).getTime() / 1000)}:F>`, inline: true });
        } catch (e) {}
    }

    return embed;
}

function createFineDMEmbed(fine) {
    return new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('You have received a fine on NewLife SMP')
        .setDescription(`You have been issued a fine.`)
        .addFields(
            { name: 'Amount', value: fine.amount || 'N/A', inline: true },
            { name: 'Issued By', value: fine.staffName, inline: true },
            { name: 'Note', value: fine.note || 'No note provided', inline: false },
            { name: 'Case', value: `#${fine.caseNumber || '—'} \n\`${fine._id}\``, inline: false },
            { name: 'How to Pay', value: 'Visit https://wiki.newlifesmp.com for payment instructions', inline: false }
        )
        .setFooter({ text: 'NewLife SMP | Pay fines at wiki.newlifesmp.com' })
        .setTimestamp();
}

function createFineLogEmbed(fine) {
    return new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('Fine Issued')
        .addFields(
            { name: 'Player', value: fine.playerName, inline: true },
            { name: 'Staff', value: fine.staffName, inline: true },
            { name: 'Case', value: `#${fine.caseNumber || '—'} \n\`${fine._id}\``, inline: true },
            { name: 'Amount', value: fine.amount || 'N/A', inline: false }
        )
        .setFooter({ text: 'NewLife Management | Fine Log' })
        .setTimestamp(new Date(fine.createdAt));
}

module.exports = {
    createWarningEmbed,
    createBanEmbed,
    createHistoryEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    createInfoEmbed,
    createListEmbed,
    createWarningDMEmbed,
    createBanDMEmbed,
    createWarningLogEmbed,
    createBanLogEmbed,
    createFineEmbed,
    createFineDMEmbed,
    createFineLogEmbed,
    getEmbedColor,
    getMemberEmbedColor,
    getMemberEmbedColorSync,
    PREMIUM_ROLE_ID
};
