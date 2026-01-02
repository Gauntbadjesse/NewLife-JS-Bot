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

    await initWatcher(client);

    client.user.setActivity('NewLife SMP | !help', { type: 3 });
});

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
        console.error(`Error executing command ${commandName}:`, error);
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
            } catch (e) { /* ignore */ }

            // Try verification cog
            try {
                const verificationCog = require('./cogs/verification');
                if (verificationCog.handleButton) await verificationCog.handleButton(interaction);
            } catch (e) { /* ignore */ }

            // Try applications cog
            try {
                const applicationsCog = require('./cogs/applications');
                if (applicationsCog.handleButton) await applicationsCog.handleButton(interaction);
            } catch (e) { /* ignore */ }
        } catch (error) {
            console.error('Error handling button:', error);
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
            } catch (e) { /* ignore */ }

            // Try applications cog
            try {
                const applicationsCog = require('./cogs/applications');
                if (applicationsCog.handleModal) await applicationsCog.handleModal(interaction);
            } catch (e) { /* ignore */ }
        } catch (error) {
            console.error('Error handling modal:', error);
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
        console.error(`Error executing slash command ${interaction.commandName}:`, error);

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
    try {
        const memberCounterChannel = process.env.MEMBER_COUNTER_CHANNEL || '1437529792755794123';
        const memberRoleId = process.env.MEMBER_ROLE_ID || '1374421919373328434';
        const guildId = process.env.GUILD_ID;
        
        if (guildId && member.guild && String(member.guild.id) !== String(guildId)) return;
        if (!member.guild) return;

        // Update member counter channel
        try {
            const ch = await member.guild.channels.fetch(memberCounterChannel).catch(() => null);
            if (ch && typeof ch.setTopic === 'function') {
                await ch.setTopic(`Members: ${member.guild.memberCount}`).catch(() => {});
            }
        } catch (e) {
            console.error('Failed to update member counter:', e);
        }
    } catch (e) {
        console.error('Error in guildMemberAdd:', e);
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
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error(`${emojis.CROSS} Failed to start bot:`, error);
        process.exit(1);
    }
}

main();
