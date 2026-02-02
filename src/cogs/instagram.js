/**
 * Instagram Feed Cog
 * Posts new Instagram content to a Discord channel
 * 
 * SETUP REQUIRED:
 * 1. Have Instagram Business/Creator account linked to Facebook Page
 * 2. Create Facebook App at https://developers.facebook.com/
 * 3. Add "Instagram Graph API" product
 * 4. Generate User Access Token with instagram_basic permission
 * 5. Get your Instagram Business Account ID
 * 6. Set environment variables:
 *    - INSTAGRAM_ACCESS_TOKEN
 *    - INSTAGRAM_USER_ID
 *    - INSTAGRAM_CHANNEL_ID (Discord channel to post to)
 */

const { EmbedBuilder } = require('discord.js');

// Configuration
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID;
const INSTAGRAM_CHANNEL_ID = process.env.INSTAGRAM_CHANNEL_ID;
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

// Track last seen post
let lastPostId = null;
let checkInterval = null;
let discordClient = null;

/**
 * Fetch recent Instagram posts
 */
async function fetchInstagramPosts() {
    if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) {
        return null;
    }

    try {
        const url = `https://graph.instagram.com/${INSTAGRAM_USER_ID}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username&access_token=${INSTAGRAM_ACCESS_TOKEN}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            const error = await response.json();
            console.error('[Instagram] API Error:', error);
            return null;
        }

        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('[Instagram] Fetch error:', error);
        return null;
    }
}

/**
 * Create Discord embed for Instagram post
 */
function createPostEmbed(post) {
    const embed = new EmbedBuilder()
        .setColor(0xE1306C) // Instagram pink/magenta
        .setAuthor({
            name: `@${post.username}`,
            iconURL: 'https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png',
            url: `https://instagram.com/${post.username}`
        })
        .setTimestamp(new Date(post.timestamp))
        .setFooter({ text: 'Instagram' });

    // Add caption if exists (truncate if too long)
    if (post.caption) {
        const caption = post.caption.length > 300 
            ? post.caption.substring(0, 297) + '...' 
            : post.caption;
        embed.setDescription(caption);
    }

    // Set image based on media type
    if (post.media_type === 'VIDEO') {
        // For videos, use thumbnail
        if (post.thumbnail_url) {
            embed.setImage(post.thumbnail_url);
        }
        embed.setTitle('📹 New Video Post');
    } else if (post.media_type === 'CAROUSEL_ALBUM') {
        if (post.media_url) {
            embed.setImage(post.media_url);
        }
        embed.setTitle('🖼️ New Album Post');
    } else {
        // IMAGE
        if (post.media_url) {
            embed.setImage(post.media_url);
        }
        embed.setTitle('📸 New Photo Post');
    }

    embed.setURL(post.permalink);

    return embed;
}

/**
 * Check for new posts and send to Discord
 */
async function checkForNewPosts() {
    if (!discordClient || !INSTAGRAM_CHANNEL_ID) return;

    const posts = await fetchInstagramPosts();
    if (!posts || posts.length === 0) return;

    // Sort by timestamp descending (newest first)
    posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const newestPost = posts[0];

    // On first run, just store the ID without posting
    if (!lastPostId) {
        lastPostId = newestPost.id;
        console.log(`[Instagram] Initialized with latest post: ${lastPostId}`);
        return;
    }

    // Check if there's a new post
    if (newestPost.id !== lastPostId) {
        // Find all new posts since last check
        const newPosts = [];
        for (const post of posts) {
            if (post.id === lastPostId) break;
            newPosts.push(post);
        }

        // Post in chronological order (oldest first)
        newPosts.reverse();

        const channel = await discordClient.channels.fetch(INSTAGRAM_CHANNEL_ID).catch(() => null);
        if (!channel) {
            console.error(`[Instagram] Could not find channel: ${INSTAGRAM_CHANNEL_ID}`);
            return;
        }

        for (const post of newPosts) {
            try {
                const embed = createPostEmbed(post);
                await channel.send({
                    content: '**New post on our Instagram!** 📱',
                    embeds: [embed]
                });
                console.log(`[Instagram] Posted: ${post.id}`);
            } catch (error) {
                console.error('[Instagram] Failed to send post:', error);
            }
        }

        lastPostId = newestPost.id;
    }
}

/**
 * Initialize the Instagram feed checker
 */
function initInstagramFeed(client) {
    discordClient = client;

    if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID || !INSTAGRAM_CHANNEL_ID) {
        console.log('[Instagram] Missing configuration - feed disabled');
        console.log('  Required env vars: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, INSTAGRAM_CHANNEL_ID');
        return;
    }

    console.log('[Instagram] Feed checker initialized');
    
    // Initial check
    checkForNewPosts();
    
    // Set up interval
    checkInterval = setInterval(checkForNewPosts, CHECK_INTERVAL);
}

/**
 * Stop the feed checker (for graceful shutdown)
 */
function stopInstagramFeed() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
        console.log('[Instagram] Feed checker stopped');
    }
}

/**
 * Manually trigger a post check (for testing)
 */
async function forceCheck() {
    const posts = await fetchInstagramPosts();
    if (!posts) return { success: false, error: 'Failed to fetch posts' };
    
    return { 
        success: true, 
        postCount: posts.length,
        latestPost: posts[0] ? {
            id: posts[0].id,
            caption: posts[0].caption?.substring(0, 100),
            type: posts[0].media_type,
            timestamp: posts[0].timestamp
        } : null
    };
}

// Slash Commands
const { SlashCommandBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('instagram')
            .setDescription('Instagram feed management')
            .addSubcommand(sub => sub
                .setName('check')
                .setDescription('Force check for new Instagram posts')
            )
            .addSubcommand(sub => sub
                .setName('status')
                .setDescription('Check Instagram feed status')
            )
            .addSubcommand(sub => sub
                .setName('latest')
                .setDescription('Show the latest Instagram post')
            ),
        async execute(interaction) {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Admin only command.', ephemeral: true });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'check') {
                await interaction.deferReply({ ephemeral: true });
                
                await checkForNewPosts();
                return interaction.editReply('✅ Instagram check complete!');
            }

            if (subcommand === 'status') {
                const configured = !!(INSTAGRAM_ACCESS_TOKEN && INSTAGRAM_USER_ID && INSTAGRAM_CHANNEL_ID);
                const status = configured 
                    ? `✅ **Configured**\n📺 Channel: <#${INSTAGRAM_CHANNEL_ID}>\n🕐 Checking every 5 minutes\n📌 Last post ID: \`${lastPostId || 'Not yet tracked'}\``
                    : '❌ **Not configured** - Missing environment variables';
                
                return interaction.reply({ content: `**Instagram Feed Status**\n${status}`, ephemeral: true });
            }

            if (subcommand === 'latest') {
                await interaction.deferReply({ ephemeral: true });
                
                const result = await forceCheck();
                if (!result.success) {
                    return interaction.editReply('❌ Failed to fetch Instagram posts. Check configuration.');
                }

                if (!result.latestPost) {
                    return interaction.editReply('📭 No posts found.');
                }

                const posts = await fetchInstagramPosts();
                if (posts && posts[0]) {
                    const embed = createPostEmbed(posts[0]);
                    return interaction.editReply({ content: '**Latest Instagram post:**', embeds: [embed] });
                }

                return interaction.editReply('❌ Could not fetch latest post.');
            }
        }
    }
];

module.exports = {
    name: 'Instagram',
    description: 'Instagram feed to Discord integration',
    slashCommands,
    initInstagramFeed,
    stopInstagramFeed,
    forceCheck
};
