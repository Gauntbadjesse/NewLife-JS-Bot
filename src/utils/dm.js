/**
 * DM helper that attempts to DM a user and logs the outcome to a channel.
 */
const { EmbedBuilder } = require('discord.js');

const DM_LOG_CHANNEL_ID = process.env.DM_LOG_CHANNEL_ID || '1442648914204295168';

async function sendDm(client, userId, options = {}) {
    const { content = null, embeds = [] } = options;
    const result = { success: false, error: null };

    try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) {
            result.error = 'User not found';
            await logDm(client, userId, result.error, content, embeds);
            return result;
        }

        try {
            await user.send({ content, embeds });
            result.success = true;
            await logDm(client, userId, null, content, embeds);
            return result;
        } catch (e) {
            result.error = e.message || String(e);
            await logDm(client, userId, result.error, content, embeds);
            return result;
        }
    } catch (e) {
        result.error = e.message || String(e);
        try { await logDm(client, userId, result.error, content, embeds); } catch (e2) {}
        return result;
    }
}

async function logDm(client, userId, error, content, embeds) {
    try {
        const ch = await client.channels.fetch(DM_LOG_CHANNEL_ID).catch(() => null);
        if (!ch) return;

        const title = error ? 'DM Failed' : 'DM Sent';
        const embed = new EmbedBuilder()
            .setTitle(title)
            .addFields(
                { name: 'User ID', value: String(userId), inline: true },
                { name: 'Result', value: error ? `Failure: ${error}` : 'Success', inline: true }
            )
            .setTimestamp();

        if (content) embed.addFields({ name: 'Content', value: content.length > 1024 ? content.slice(0, 1020) + '…' : content });
        if (Array.isArray(embeds) && embeds.length > 0) embed.addFields({ name: 'Embeds', value: `Count: ${embeds.length}` });

        await ch.send({ embeds: [embed] }).catch(() => null);
    } catch (e) {
        // swallow logging errors
    }
}

module.exports = { sendDm };
