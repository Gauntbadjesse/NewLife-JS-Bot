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
const emojis = require('./utils/emojis');

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
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
    console.log('');
    console.log('       NewLife Management Bot           ');
    console.log('            Now Online!                 ');
    console.log('');
    console.log(` Bot: ${client.user.tag.padEnd(32)} `);
    console.log(` Servers: ${String(client.guilds.cache.size).padEnd(28)} `);
    console.log(` Commands: ${String(client.commands.size).padEnd(27)} `);
    console.log(` Slash Commands: ${String(client.slashCommands.size).padEnd(21)} `);
    console.log('\\n');

    // Initialize error logger with client
    initErrorLogger(client);

    await initWatcher(client);

    client.user.setActivity('NewLife SMP | !help', { type: 3 });

    // Refresh member counter on startup
    try {
        const memberCounterChannel = process.env.MEMBER_COUNTER_CHANNEL || '1437529792755794123';
        const guildId = process.env.GUILD_ID || '1372672239245459498';
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
            const ch = await guild.channels.fetch(memberCounterChannel).catch(() => null);
            if (ch && typeof ch.setName === 'function') {
                await ch.setName(`Members: ${guild.memberCount}`).catch(() => {});
                console.log(` Member counter refreshed: ${guild.memberCount} members`);
            }
        }
    } catch (e) {
        console.error('Failed to refresh member counter on startup:', e);
    }

    // Initialize timed close processor for tickets
    try {
        const { initTimedCloseProcessor } = require('./cogs/tickets');
        initTimedCloseProcessor(client);
    } catch (e) {
        console.error('Failed to initialize timed close processor:', e);
    }

    // Schedule weekly whitelist stats (every Sunday at midnight UTC)
    scheduleWeeklyWhitelistStats(client);
});

/**
 * Schedule weekly whitelist stats to be sent to owner
 */
function scheduleWeeklyWhitelistStats(client) {
    const { sendWeeklyStatsToOwner, getWeekStart } = require('./cogs/whitelist');
    
    const checkAndSend = () => {
        const now = new Date();
        // Check if it's Sunday and between 00:00-00:05 UTC
        if (now.getUTCDay() === 0 && now.getUTCHours() === 0 && now.getUTCMinutes() < 5) {
            sendWeeklyStatsToOwner(client);
        }
    };
    
    // Check every 5 minutes
    setInterval(checkAndSend, 5 * 60 * 1000);
    console.log(' Weekly whitelist stats scheduler initialized');
}

// Prefix command handler
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

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
        } catch (error) {
            await logError('Button Handler', error, { customId: interaction.customId, user: interaction.user.tag });
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
client.on('guildMemberAdd', async (member) => {
    console.log(`[MemberJoin] Event fired for ${member.user?.tag || 'unknown'}`);
    
    try {
        const memberCounterChannel = process.env.MEMBER_COUNTER_CHANNEL || '1437529792755794123';
        const memberRoleId = process.env.MEMBER_ROLE_ID || '1374421919373328434';
        const guildId = process.env.GUILD_ID;
        
        // Skip if wrong guild
        if (guildId && member.guild && String(member.guild.id) !== String(guildId)) {
            console.log(`[MemberJoin] Skipping - wrong guild`);
            return;
        }
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

        // Update member counter channel
        try {
            let ch = member.guild.channels.cache.get(memberCounterChannel);
            if (!ch) {
                console.log(`[MemberJoin] Channel not in cache, fetching...`);
                ch = await member.guild.channels.fetch(memberCounterChannel).catch(() => null);
            }
            
            if (ch && (ch.type === 2 || ch.type === 13)) { // Voice channel or Stage channel
                const newName = `Members: ${member.guild.memberCount}`;
                await ch.setName(newName);
                console.log(`[MemberJoin] Updated counter to ${member.guild.memberCount}`);
            } else if (ch) {
                console.error(`[MemberJoin] Channel ${memberCounterChannel} is type ${ch.type}, not a voice channel`);
            } else {
                console.error(`[MemberJoin] Counter channel ${memberCounterChannel} not found`);
            }
        } catch (e) {
            console.error(`[MemberJoin] Failed to update counter:`, e.message);
            if (logError) await logError('guildMemberAdd: counter', e, { member: member.user.tag });
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
        const memberCounterChannel = process.env.MEMBER_COUNTER_CHANNEL || '1437529792755794123';
        const guildId = process.env.GUILD_ID;
        
        if (guildId && member.guild && String(member.guild.id) !== String(guildId)) return;
        if (!member.guild) return;

        // Update member counter channel
        try {
            let ch = member.guild.channels.cache.get(memberCounterChannel);
            if (!ch) {
                ch = await member.guild.channels.fetch(memberCounterChannel).catch(() => null);
            }
            
            if (ch && (ch.type === 2 || ch.type === 13)) { // Voice channel or Stage channel
                const newName = `Members: ${member.guild.memberCount}`;
                await ch.setName(newName);
                console.log(`[MemberLeave] Updated counter to ${member.guild.memberCount}`);
            }
        } catch (e) {
            console.error(`[MemberLeave] Failed to update counter:`, e.message);
            if (logError) await logError('guildMemberRemove: counter', e, { member: member.user?.tag || 'unknown' });
        }
    } catch (e) {
        if (logError) await logError('guildMemberRemove', e, { member: member?.user?.tag || 'unknown' });
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
        
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error(`${emojis.CROSS} Failed to start bot:`, error);
        process.exit(1);
    }
}

main();
