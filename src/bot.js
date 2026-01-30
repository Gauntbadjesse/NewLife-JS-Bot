require('dotenv').config();
const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execAsync = util.promisify(exec);
const { Client, GatewayIntentBits, Collection, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');

const { connectDatabase } = require('./database/connection');
const { initWatcher } = require('./database/watcher');
const { logCommand, sendCommandLogToChannel } = require('./utils/commandLogger');
const { initErrorLogger, logError } = require('./utils/errorLogger');
const { startApiServer } = require('./api/server');
const { startAnalyticsServer } = require('./api/analyticsServer');
const emojis = require('./utils/emojis');

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration,
    ],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
});

// Initialize collections for commands
client.commands = new Collection();
client.slashCommands = new Collection();

/**
 * Load all commands from the cogs directory
 */
async function loadCogs() {
    const cogsPath = path.join(__dirname, 'cogs');
    if (!fs.existsSync(cogsPath)) fs.mkdirSync(cogsPath, { recursive: true });

    const cogFiles = fs.readdirSync(cogsPath).filter(file => file.endsWith('.js'));

    console.log('\n');
    console.log('     NewLife Management Bot Loader      ');
    console.log('');

    for (const file of cogFiles) {
        try {
            const cog = require(path.join(cogsPath, file));

            if (cog.commands) {
                for (const [name, command] of Object.entries(cog.commands)) {
                    client.commands.set(name, command);
                    console.log(`  Loaded command: ${name.padEnd(20)} `);
                }
            }

            if (cog.slashCommands) {
                for (const slashCommand of cog.slashCommands) {
                    client.slashCommands.set(slashCommand.data.name, slashCommand);
                    console.log(`  Loaded slash: /${slashCommand.data.name.padEnd(19)} `);
                }
            }

            console.log(`  Cog loaded: ${file.padEnd(23)} `);
        } catch (error) {
            console.error(`  Failed to load: ${file.padEnd(19)} `);
            console.error(error);
        }
    }

    console.log('\n');
}

/**
 * Register slash commands with Discord API (guild-scoped; supports REGISTER_GUILD env override)
 */
async function registerSlashCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const commands = client.slashCommands.map(cmd => cmd.data.toJSON());

    try {
        console.log(`${emojis.CHECK} Refreshing application (/) commands...`);

        const targetGuild = process.env.REGISTER_GUILD || process.env.GUILD_ID || '1372672239245459498';
        if (process.env.REGISTER_GUILD) console.log(` Registering commands to REGISTER_GUILD: ${process.env.REGISTER_GUILD}`);
        else console.log(` Registering commands to guild: ${targetGuild}`);

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, targetGuild),
            { body: commands }
        );

        console.log(`${emojis.CHECK} Successfully registered application commands!\\n`);
    } catch (error) {
        console.error(`${emojis.CROSS} Failed to register commands:`, error);
    }
}

// Event: Bot is ready
client.once('ready', async () => {
    const startupVersion = process.env.BOT_VERSION || require('../package.json').version || '1.0.0';
    console.log('');
    console.log('       NewLife Management Bot           ');
    console.log('            Now Online!                 ');
    console.log('');
    console.log(` Bot: ${client.user.tag.padEnd(32)} `);
    console.log(` Version: ${('v' + startupVersion).padEnd(29)} `);
    console.log(` Servers: ${String(client.guilds.cache.size).padEnd(28)} `);
    console.log(` Commands: ${String(client.commands.size).padEnd(27)} `);
    console.log(` Slash Commands: ${String(client.slashCommands.size).padEnd(21)} `);
    console.log('\\n');

    // Make client globally available for API integration
    global.discordClient = client;

    // Initialize error logger with client
    initErrorLogger(client);

    await initWatcher(client);

    // Set activity with version
    const botVersion = process.env.BOT_VERSION || require('../package.json').version || '1.0.0';
    client.user.setActivity(`v${botVersion} | NewLife SMP`, { type: 3 });

    // Initialize timed close processor for tickets
    try {
        const { initTimedCloseProcessor } = require('./cogs/tickets');
        initTimedCloseProcessor(client);
    } catch (e) {
        console.error('Failed to initialize timed close processor:', e);
    }

    // Initialize mute expiration processor
    try {
        const { initMuteProcessor } = require('./cogs/serverBans');
        initMuteProcessor(client);
    } catch (e) {
        console.error('Failed to initialize mute processor:', e);
    }

    // Initialize guru performance scheduler
    try {
        const { initGuruScheduler } = require('./cogs/guruTracking');
        initGuruScheduler(client);
    } catch (e) {
        console.error('Failed to initialize guru tracking scheduler:', e);
    }

    // Schedule weekly whitelist stats (every Sunday at midnight UTC)
    scheduleWeeklyWhitelistStats(client);

    // Initialize member system - refresh counter and ensure roles work
    await initMemberSystem(client);

    // Restore emoji reaction roles
    try {
        const { restoreReactions } = require('./cogs/emojiReactionRoles');
        await restoreReactions(client);
    } catch (e) {
        console.error('Failed to restore emoji reaction roles:', e);
    }

    // Initialize giveaway checker
    try {
        const { initGiveawayChecker } = require('./cogs/giveaways');
        initGiveawayChecker(client);
    } catch (e) {
        console.error('Failed to initialize giveaway checker:', e);
    }

    // Cleanup orphaned temp voice channels
    try {
        const { cleanupOrphanedChannels } = require('./cogs/tempVC');
        await cleanupOrphanedChannels(client);
    } catch (e) {
        console.error('Failed to cleanup temp VCs:', e);
    }

    // Initialize server stats milestone tracking
    try {
        const { initializeMilestone, sendDailyStats } = require('./cogs/serverStats');
        const guild = client.guilds.cache.first();
        if (guild) {
            await initializeMilestone(guild);
        }
        // Schedule daily stats DM at midnight UTC
        cron.schedule('0 0 * * *', async () => {
            await sendDailyStats(client);
        }, { timezone: 'UTC' });
        console.log('[ServerStats] Initialized milestone tracking and daily stats');
    } catch (e) {
        console.error('Failed to initialize server stats:', e);
    }

    // Check for expired LOAs
    try {
        const { checkExpiredLOAs } = require('./cogs/loa');
        await checkExpiredLOAs(client);
    } catch (e) {
        console.error('Failed to check expired LOAs:', e);
    }

    // Initialize staff online tracker (grants "Currently Moderating" role to staff on MC server)
    try {
        const { initStaffOnlineTracker } = require('./cogs/staffOnline');
        initStaffOnlineTracker(client);
    } catch (e) {
        console.error('Failed to initialize staff online tracker:', e);
    }

    // Initialize server restart scheduler (daily at 12:00 AM CST)
    try {
        const { initScheduler } = require('./cogs/serverRestart');
        initScheduler(client);
    } catch (e) {
        console.error('Failed to initialize server restart scheduler:', e);
    }

    // Initialize username updater (checks and updates MC usernames every 5 minutes)
    try {
        const { initUsernameUpdater } = require('./utils/usernameUpdater');
        initUsernameUpdater();
        console.log('[UsernameUpdater] Initialized username updater');
    } catch (e) {
        console.error('Failed to initialize username updater:', e);
    }

    // Initialize staff tracking system (sends weekly reports)
    try {
        const { initStaffTracking } = require('./utils/staffTracking');
        initStaffTracking(client);
        console.log('[StaffTracking] Initialized staff tracking system');
    } catch (e) {
        console.error('Failed to initialize staff tracking:', e);
    }

    // Initialize PvP status logger
    try {
        const { initPvpLogger } = require('./cogs/pvpStatus');
        initPvpLogger(client);
    } catch (e) {
        console.error('Failed to initialize PvP logger:', e);
    }

    // Initialize Analytics system (ALT detection, TPS monitoring, lag alerts)
    try {
        const { initAnalytics, handleButtonInteraction } = require('./cogs/analytics');
        initAnalytics(client);
        
        // Register button handler for analytics resolution buttons
        client.on('interactionCreate', async (interaction) => {
            if (interaction.isButton()) {
                await handleButtonInteraction(interaction);
            }
        });
        
        console.log('[Analytics] Initialized analytics system');
    } catch (e) {
        console.error('Failed to initialize analytics:', e);
    }

    // Initialize Minecraft DM handler
    try {
        const LinkedAccount = require('./database/models/LinkedAccount');
        const { sendDm } = require('./utils/dm');

        client.on('sendMinecraftDM', async (data) => {
            try {
                const { minecraft_uuid, minecraft_username, message, type } = data;
                
                console.log(`[MinecraftDM] Attempting to send ${type} DM to ${minecraft_username} (${minecraft_uuid})`);
                
                // Find linked Discord account
                const linkedAccount = await LinkedAccount.findOne({ minecraftUuid: minecraft_uuid });
                
                if (!linkedAccount) {
                    console.log(`[MinecraftDM] No linked account found for ${minecraft_username}`);
                    return;
                }
                
                // Send DM to Discord user
                await sendDm(client, linkedAccount.discordId, {
                    content: message
                });
                
                console.log(`[MinecraftDM] Successfully sent ${type} DM to ${minecraft_username}`);
            } catch (error) {
                console.error('[MinecraftDM] Error sending DM:', error);
            }
        });
        
        console.log('[MinecraftDM] Initialized Minecraft DM handler');
    } catch (e) {
        console.error('Failed to initialize Minecraft DM handler:', e);
    }
});

/**
 * Initialize member counter and role system
 * Runs on bot startup to ensure everything is working
 */
async function initMemberSystem(client) {
    const memberCounterChannel = process.env.MEMBER_COUNTER_CHANNEL || '1437529792755794123';
    const memberRoleId = process.env.MEMBER_ROLE_ID || '1374421919373328434';
    const guildId = process.env.GUILD_ID || '1372672239245459498';
    
    try {
        // Fetch guild with members
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            console.error('[MemberSystem] Could not find guild');
            return;
        }
        
        // Force fetch all members to ensure accurate count
        console.log('[MemberSystem] Fetching all guild members...');
        await guild.members.fetch();
        console.log(`[MemberSystem] Fetched ${guild.memberCount} members`);
        
        // Update the member counter channel
        try {
            let ch = guild.channels.cache.get(memberCounterChannel);
            if (!ch) {
                ch = await guild.channels.fetch(memberCounterChannel).catch(() => null);
            }
            
            if (ch && (ch.type === 2 || ch.type === 13)) { // Voice channel or Stage channel
                const currentName = ch.name;
                const newName = `Members: ${guild.memberCount}`;
                
                if (currentName !== newName) {
                    await ch.setName(newName);
                    console.log(`[MemberSystem] Counter updated: ${currentName} -> ${newName}`);
                } else {
                    console.log(`[MemberSystem] Counter already up to date: ${newName}`);
                }
            } else if (ch) {
                console.error(`[MemberSystem] Counter channel is type ${ch.type}, needs to be voice (2) or stage (13)`);
            } else {
                console.error(`[MemberSystem] Counter channel ${memberCounterChannel} not found`);
            }
        } catch (e) {
            console.error('[MemberSystem] Failed to update counter:', e.message);
        }
        
        // Verify the member role exists and bot can assign it
        try {
            const role = await guild.roles.fetch(memberRoleId).catch(() => null);
            if (role) {
                console.log(`[MemberSystem] Member role verified: ${role.name}`);
                
                // Check if bot can assign this role
                const botMember = guild.members.me;
                if (botMember && botMember.roles.highest.position <= role.position) {
                    console.warn(`[MemberSystem] WARNING: Bot role is not high enough to assign ${role.name}`);
                }
            } else {
                console.error(`[MemberSystem] Member role ${memberRoleId} not found`);
            }
        } catch (e) {
            console.error('[MemberSystem] Failed to verify member role:', e.message);
        }
        
        console.log('[MemberSystem] Member system initialized successfully');
    } catch (e) {
        console.error('[MemberSystem] Failed to initialize:', e);
    }
}

/**
 * Schedule weekly whitelist stats to be sent to owner
 * Uses node-cron for reliable scheduling
 */
const cron = require('node-cron');
let weeklyStatsTask = null;

function scheduleWeeklyWhitelistStats(client) {
    const { sendWeeklyStatsToOwner } = require('./cogs/whitelist');
    
    // Schedule for Sunday at midnight UTC using cron
    weeklyStatsTask = cron.schedule('0 0 * * 0', async () => {
        console.log('[WeeklyStats] Running weekly whitelist stats report...');
        await sendWeeklyStatsToOwner(client);
    }, {
        timezone: 'UTC'
    });
    
    console.log('[WeeklyStats] Weekly whitelist stats scheduler initialized (Sundays 00:00 UTC)');
}

// Prefix command handler
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Track guru responses in apply tickets
    try {
        const { trackGuruMessageInTicket } = require('./cogs/tickets');
        if (trackGuruMessageInTicket) {
            await trackGuruMessageInTicket(message, client);
        }
    } catch (e) {
        // Silently ignore if tracking fails
    }

    // Handle welcome test command
    try {
        const welcome = require('./cogs/welcome');
        if (welcome.handleMessage) {
            await welcome.handleMessage(message);
        }
    } catch (e) {
        // Silently ignore
    }

    // Handle page command
    try {
        const paging = require('./cogs/paging');
        if (paging.handleMessage) {
            await paging.handleMessage(message);
        }
    } catch (e) {
        // Silently ignore
    }

    const prefix = process.env.BOT_PREFIX || '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName);
    if (!command) return;

    try {
        await command.execute(message, args, client);
    } catch (error) {
        await logError(`Prefix Command: ${commandName}`, error, {
            user: message.author.tag,
            userId: message.author.id,
            channel: message.channel.name,
            content: message.content
        });
        await message.reply({ content: `${emojis.CROSS} An error occurred while executing this command.`, allowedMentions: { repliedUser: false } });
    }
});

// Interaction handler (buttons, modals, slash commands)
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        try {
            // Try tickets cog
            try {
                const ticketsCog = require('./cogs/tickets');
                if (ticketsCog.handleButton) await ticketsCog.handleButton(interaction);
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') await logError('Button: tickets', e, { customId: interaction.customId, user: interaction.user.tag });
            }

            // Try verification cog
            try {
                const verificationCog = require('./cogs/verification');
                if (verificationCog.handleButton) await verificationCog.handleButton(interaction);
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') await logError('Button: verification', e, { customId: interaction.customId, user: interaction.user.tag });
            }

            // Try applications cog
            try {
                const applicationsCog = require('./cogs/applications');
                if (applicationsCog.handleButton) await applicationsCog.handleButton(interaction);
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') await logError('Button: applications', e, { customId: interaction.customId, user: interaction.user.tag });
            }

            // Try giveaways cog
            try {
                const giveawaysCog = require('./cogs/giveaways');
                if (giveawaysCog.handleGiveawayButton) await giveawaysCog.handleGiveawayButton(interaction, client);
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') await logError('Button: giveaways', e, { customId: interaction.customId, user: interaction.user.tag });
            }

            // Try temp VC cog
            try {
                const tempVCCog = require('./cogs/tempVC');
                if (tempVCCog.handleTempVCButton) await tempVCCog.handleTempVCButton(interaction, client);
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') await logError('Button: tempVC', e, { customId: interaction.customId, user: interaction.user.tag });
            }

            // Try suggestions cog
            try {
                const suggestionsCog = require('./cogs/suggestions');
                if (suggestionsCog.handleButton) await suggestionsCog.handleButton(interaction);
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') await logError('Button: suggestions', e, { customId: interaction.customId, user: interaction.user.tag });
            }

            // Try customRoles cog
            try {
                const customRolesCog = require('./cogs/customRoles');
                if (customRolesCog.handleButton) await customRolesCog.handleButton(interaction);
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') await logError('Button: customRoles', e, { customId: interaction.customId, user: interaction.user.tag });
            }
        } catch (error) {
            await logError('Button Handler', error, { customId: interaction.customId, user: interaction.user.tag });
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `${emojis.CROSS} An error occurred.`, ephemeral: true });
            }
        }
        return;
    }

    // String Select Menu handler
    if (interaction.isStringSelectMenu()) {
        try {
            // Try tickets cog
            try {
                const ticketsCog = require('./cogs/tickets');
                if (ticketsCog.handleSelectMenu) await ticketsCog.handleSelectMenu(interaction);
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') await logError('SelectMenu: tickets', e, { customId: interaction.customId, user: interaction.user.tag });
            }
        } catch (error) {
            await logError('SelectMenu Handler', error, { customId: interaction.customId, user: interaction.user.tag });
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `${emojis.CROSS} An error occurred.`, ephemeral: true });
            }
        }
        return;
    }

    if (interaction.isModalSubmit()) {
        try {
            // Try tickets cog
            try {
                const ticketsCog = require('./cogs/tickets');
                if (ticketsCog.handleModalSubmit) await ticketsCog.handleModalSubmit(interaction);
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') await logError('Modal: tickets', e, { customId: interaction.customId, user: interaction.user.tag });
            }

            // Try applications cog
            try {
                const applicationsCog = require('./cogs/applications');
                if (applicationsCog.handleModal) await applicationsCog.handleModal(interaction);
            } catch (e) {
                if (e.code !== 'MODULE_NOT_FOUND') await logError('Modal: applications', e, { customId: interaction.customId, user: interaction.user.tag });
            }
        } catch (error) {
            await logError('Modal Handler', error, { customId: interaction.customId, user: interaction.user.tag });
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `${emojis.CROSS} An error occurred.`, ephemeral: true });
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.slashCommands.get(interaction.commandName);
    if (!command) return;

    const startTime = Date.now();
    let success = true;
    let errorMessage = null;

    try {
        await command.execute(interaction, client);
    } catch (error) {
        success = false;
        errorMessage = error.message;
        await logError(`Slash Command: /${interaction.commandName}`, error, {
            user: interaction.user.tag,
            userId: interaction.user.id,
            options: interaction.options?.data?.map(o => `${o.name}=${o.value}`).join(', ') || 'none'
        });

        const errorReply = { content: `${emojis.CROSS} An error occurred while executing this command.`, ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(errorReply);
        else await interaction.reply(errorReply);
    } finally {
        const responseTime = Date.now() - startTime;
        await logCommand(interaction, { success, error: errorMessage, responseTime });
        await sendCommandLogToChannel(client, interaction, { success, error: errorMessage });
    }
});

// Update member counter when someone joins
// Rate limit protection - only update counter once per 5 minutes max
let lastCounterUpdate = 0;
const COUNTER_UPDATE_COOLDOWN = 5 * 60 * 1000; // 5 minutes

async function updateMemberCounter(guild, reason) {
    const memberCounterChannel = process.env.MEMBER_COUNTER_CHANNEL || '1437529792755794123';
    
    // Check cooldown (Discord rate limits channel renames to 2 per 10 minutes)
    const now = Date.now();
    if (now - lastCounterUpdate < COUNTER_UPDATE_COOLDOWN) {
        console.log(`[MemberCounter] Skipping update (cooldown) - ${reason}`);
        return;
    }
    
    try {
        let ch = guild.channels.cache.get(memberCounterChannel);
        if (!ch) {
            ch = await guild.channels.fetch(memberCounterChannel).catch(() => null);
        }
        
        if (ch && (ch.type === 2 || ch.type === 13)) { // Voice channel or Stage channel
            const newName = `Members: ${guild.memberCount}`;
            await ch.setName(newName);
            lastCounterUpdate = now;
            console.log(`[MemberCounter] Updated to ${guild.memberCount} - ${reason}`);
        } else if (ch) {
            console.error(`[MemberCounter] Channel is type ${ch.type}, not voice (2) or stage (13)`);
        } else {
            console.error(`[MemberCounter] Channel ${memberCounterChannel} not found`);
        }
    } catch (e) {
        console.error(`[MemberCounter] Failed to update:`, e.message);
    }
}

client.on('guildMemberAdd', async (member) => {
    console.log(`[MemberJoin] Event fired for ${member.user?.tag || 'unknown'}`);
    
    try {
        const memberRoleId = process.env.MEMBER_ROLE_ID || '1374421919373328434';
        
        if (!member.guild) {
            console.log(`[MemberJoin] Skipping - no guild`);
            return;
        }

        // Add member role to new users
        try {
            // Try cache first, then fetch
            let role = member.guild.roles.cache.get(memberRoleId);
            if (!role) {
                console.log(`[MemberJoin] Role not in cache, fetching...`);
                role = await member.guild.roles.fetch(memberRoleId).catch(() => null);
            }
            
            if (role) {
                await member.roles.add(role, 'Auto member role on join');
                console.log(`[MemberJoin] Successfully added member role to ${member.user.tag}`);
            } else {
                console.error(`[MemberJoin] Member role ${memberRoleId} not found`);
            }
        } catch (e) {
            console.error(`[MemberJoin] Failed to add role to ${member.user.tag}:`, e.message);
            if (logError) await logError('guildMemberAdd: addRole', e, { member: member.user.tag });
        }

        // Restore kingdom roles if member was previously in a kingdom
        try {
            const { syncMemberRoles } = require('./cogs/kingdoms');
            if (syncMemberRoles) {
                await syncMemberRoles(member);
            }
        } catch (e) {
            console.error(`[MemberJoin] Failed to sync kingdom roles:`, e.message);
        }

        // Update member counter channel (with rate limiting)
        await updateMemberCounter(member.guild, `${member.user.tag} joined`);

        // Log member join via Discord Logger
        try {
            const { handleMemberJoin } = require('./cogs/discordLogger');
            await handleMemberJoin(member, client);
        } catch (e) {
            console.error('[DiscordLogger] Failed to handle member join:', e);
        }

        // Send welcome DM to new member
        try {
            const { sendWelcomeDM } = require('./cogs/welcome');
            await sendWelcomeDM(member);
        } catch (e) {
            console.error('[Welcome] Failed to send welcome DM:', e);
        }

        // Check for member milestone
        try {
            const { checkMilestone } = require('./cogs/serverStats');
            await checkMilestone(member.guild);
        } catch (e) {
            console.error('[ServerStats] Failed to check milestone:', e);
        }
    } catch (e) {
        console.error(`[MemberJoin] Error:`, e);
        if (logError) await logError('guildMemberAdd', e, { member: member?.user?.tag || 'unknown' });
    }
});

// Update member counter when someone leaves
client.on('guildMemberRemove', async (member) => {
    console.log(`[MemberLeave] Event fired for ${member.user?.tag || 'unknown'}`);
    
    try {
        if (!member.guild) return;

        // Update member counter channel (with rate limiting)
        await updateMemberCounter(member.guild, `${member.user?.tag || 'unknown'} left`);

        // Log member leave with roles via Discord Logger
        try {
            const { handleMemberLeave } = require('./cogs/discordLogger');
            await handleMemberLeave(member, client);
        } catch (e) {
            console.error('[DiscordLogger] Failed to handle member leave:', e);
        }

        // Auto-unlink and unwhitelist when member leaves
        try {
            const { unlinkAndUnwhitelist } = require('./cogs/linking');
            const result = await unlinkAndUnwhitelist(member.user.id);
            if (result.count > 0) {
                console.log(`[MemberLeave] Unlinked and unwhitelisted ${result.count} account(s) for ${member.user.tag} (${member.user.id})`);
                if (result.accounts.length > 0) {
                    const accountNames = result.accounts.map(a => `${a.name} (${a.platform})`).join(', ');
                    console.log(`[MemberLeave] Removed accounts: ${accountNames}`);
                }
                if (result.errors.length > 0) {
                    console.error(`[MemberLeave] Errors during unwhitelist:`, result.errors);
                }
            }
        } catch (e) {
            console.error('[MemberLeave] Failed to unlink/unwhitelist:', e);
        }
    } catch (e) {
        if (logError) await logError('guildMemberRemove', e, { member: member?.user?.tag || 'unknown' });
    }
});

// Detect when user gains NewLife+ role and send welcome DM
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
        const PREMIUM_ROLE_ID = '1463405789241802895';
        
        // Check if user gained the NewLife+ role (didn't have before, has now)
        const hadPremium = oldMember.roles.cache.has(PREMIUM_ROLE_ID);
        const hasPremium = newMember.roles.cache.has(PREMIUM_ROLE_ID);
        
        if (!hadPremium && hasPremium) {
            console.log(`[NewLife+] ${newMember.user.tag} gained NewLife+ role, sending welcome DM`);
            
            // Send welcome DM with perks explanation
            const { sendDm } = require('./utils/dm');
            const { EmbedBuilder } = require('discord.js');
            
            const welcomeEmbed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('Welcome to NewLife+')
                .setDescription('Thank you for supporting NewLife SMP!\nYou now have access to exclusive premium perks.')
                .addFields(
                    { 
                        name: '🎨 Custom Role', 
                        value: 'Create your own role with a custom name, color, and emoji.\n`/customrole create <name> [color] [emoji]`', 
                        inline: false 
                    },
                    { 
                        name: '⚡ Priority Support', 
                        value: 'Your tickets are highlighted and marked as priority for faster responses.', 
                        inline: false 
                    },
                    { 
                        name: '🎁 2x Giveaway Entries', 
                        value: 'Double your chances in all server giveaways automatically.', 
                        inline: false 
                    },
                    { 
                        name: '🔊 Soundboard Access', 
                        value: 'Use soundboard and external sounds in your temporary voice channels.', 
                        inline: false 
                    }
                )
                .setFooter({ text: 'NewLife+ | Premium Membership' })
                .setTimestamp();

            const dmResult = await sendDm(client, newMember.user.id, { embeds: [welcomeEmbed] });
            
            if (dmResult.success) {
                console.log(`[NewLife+] Successfully sent welcome DM to ${newMember.user.tag}`);
            } else {
                console.log(`[NewLife+] Failed to send welcome DM to ${newMember.user.tag}: ${dmResult.error || 'Unknown error'}`);
            }
        }
    } catch (e) {
        console.error('[NewLife+] Error handling role update:', e);
    }
});

// Discord Logger Events - Message Delete
client.on('messageDelete', async (message) => {
    try {
        const { handleMessageDelete } = require('./cogs/discordLogger');
        await handleMessageDelete(message, client);
    } catch (e) {
        // Silently ignore errors
    }
});

// Discord Logger Events - Bulk Message Delete
client.on('messageDeleteBulk', async (messages, channel) => {
    try {
        const { handleBulkMessageDelete } = require('./cogs/discordLogger');
        await handleBulkMessageDelete(messages, channel, client);
    } catch (e) {
        // Silently ignore errors
    }
});

// Discord Logger Events - Message Edit
client.on('messageUpdate', async (oldMessage, newMessage) => {
    try {
        const { handleMessageEdit } = require('./cogs/discordLogger');
        await handleMessageEdit(oldMessage, newMessage, client);
    } catch (e) {
        // Silently ignore errors
    }
});

// Discord Logger Events - Channel Create
client.on('channelCreate', async (channel) => {
    try {
        const { handleChannelCreate } = require('./cogs/discordLogger');
        await handleChannelCreate(channel, client);
    } catch (e) {
        // Silently ignore errors
    }
});

// Discord Logger Events - Channel Delete
client.on('channelDelete', async (channel) => {
    try {
        const { handleChannelDelete } = require('./cogs/discordLogger');
        await handleChannelDelete(channel, client);
    } catch (e) {
        // Silently ignore errors
    }
});

// Discord Logger Events - Role Create
client.on('roleCreate', async (role) => {
    try {
        const { handleRoleCreate } = require('./cogs/discordLogger');
        await handleRoleCreate(role, client);
    } catch (e) {
        // Silently ignore errors
    }
});

// Discord Logger Events - Role Delete
client.on('roleDelete', async (role) => {
    try {
        const { handleRoleDelete } = require('./cogs/discordLogger');
        await handleRoleDelete(role, client);
    } catch (e) {
        // Silently ignore errors
    }
});

// Discord Logger Events - Member Ban
client.on('guildBanAdd', async (ban) => {
    try {
        const { handleMemberBan } = require('./cogs/discordLogger');
        await handleMemberBan(ban, client);
    } catch (e) {
        // Silently ignore errors
    }
});

// Discord Logger Events - Member Unban
client.on('guildBanRemove', async (ban) => {
    try {
        const { handleMemberUnban } = require('./cogs/discordLogger');
        await handleMemberUnban(ban, client);
    } catch (e) {
        // Silently ignore errors
    }
});

// Discord Logger Events - Voice State Update
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Handle temp VC (create/delete channels)
    try {
        const { handleVoiceStateUpdate: tempVCHandler } = require('./cogs/tempVC');
        await tempVCHandler(oldState, newState, client);
    } catch (e) {
        // Silently ignore errors
    }

    // Log voice state changes
    try {
        const { handleVoiceStateUpdate } = require('./cogs/discordLogger');
        await handleVoiceStateUpdate(oldState, newState, client);
    } catch (e) {
        // Silently ignore errors
    }
});

// Analytics Event Logging - Handle analytics alerts from the API
client.on('analyticsEvent', async (data) => {
    try {
        const { handleAnalyticsEvent } = require('./cogs/discordLogger');
        await handleAnalyticsEvent(data, client);
    } catch (e) {
        console.error('[AnalyticsEvent] Failed to handle analytics event:', e);
    }
});

// Reaction Role Events - Handle reactions for reaction roles
client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot) return;
        // Try main reactionRoles module
        const { handleReactionAdd } = require('./cogs/reactionRoles');
        if (handleReactionAdd) await handleReactionAdd(reaction, user, client);
    } catch (e) {
        // Module may not exist yet or error occurred
    }
    try {
        if (user.bot) return;
        // Try legacy emojiReactionRoles module
        const { handleReactionAdd } = require('./cogs/emojiReactionRoles');
        if (handleReactionAdd) await handleReactionAdd(reaction, user, client);
    } catch (e) {
        // Module may not exist yet or error occurred
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    try {
        if (user.bot) return;
        // Try main reactionRoles module
        const { handleReactionRemove } = require('./cogs/reactionRoles');
        if (handleReactionRemove) await handleReactionRemove(reaction, user, client);
    } catch (e) {
        // Module may not exist yet or error occurred
    }
    try {
        if (user.bot) return;
        // Try legacy emojiReactionRoles module
        const { handleReactionRemove } = require('./cogs/emojiReactionRoles');
        if (handleReactionRemove) await handleReactionRemove(reaction, user, client);
    } catch (e) {
        // Module may not exist yet or error occurred
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n Shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

// Main startup
async function main() {
    // Version check / auto-update flow
    try {
        const botVersion = process.env.BOT_VERSION;
        if (botVersion) {
            const repoRoot = path.resolve(__dirname, '..');
            const deployedFile = path.join(repoRoot, '.deployed_version');
            const current = fs.existsSync(deployedFile) ? fs.readFileSync(deployedFile, 'utf8').trim() : null;
            if (current !== botVersion) {
                console.log(`🔄 BOT_VERSION mismatch (deployed=${current || 'none'} target=${botVersion}). Attempting update...`);
                const branch = process.env.GIT_BRANCH || 'main';

                try {
                    await execAsync('git fetch --all', { cwd: repoRoot, timeout: 5 * 60 * 1000 });
                    await execAsync(`git reset --hard origin/${branch}`, { cwd: repoRoot, timeout: 5 * 60 * 1000 });
                    await execAsync('npm install --production', { cwd: repoRoot, timeout: 10 * 60 * 1000 });

                    // record deployed version so we don't loop
                    fs.writeFileSync(deployedFile, String(botVersion), { encoding: 'utf8' });

                    console.log('✅ Update applied, exiting so process manager (Pterodactyl) can restart the server.');
                    process.exit(0);
                } catch (updateErr) {
                    console.error('❌ Auto-update failed:', updateErr);
                    console.error('Continuing startup with existing files. Fix update and restart manually.');
                }
            }
        }
    } catch (verErr) {
        console.error('Error during version check:', verErr);
    }
    try {
        await connectDatabase();
        await loadCogs();
        await registerSlashCommands();
        
        // Start the Link API server
        try {
            await startApiServer();
        } catch (apiErr) {
            console.error('Failed to start Link API server:', apiErr);
        }
        
        // Start the Analytics API server
        try {
            startAnalyticsServer(client);
        } catch (analyticsErr) {
            console.error('Failed to start Analytics API server:', analyticsErr);
        }
        
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error(`${emojis.CROSS} Failed to start bot:`, error);
        process.exit(1);
    }
}

main();
