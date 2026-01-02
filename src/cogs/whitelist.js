/**
 * Clean Whitelist Cog
 * Provides a /whitelist add subcommand to add Java/Bedrock players
 * to the server whitelist via RCON and persist a LinkedAccount.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Rcon } = require('rcon-client');
const LinkedAccount = require('../database/models/LinkedAccount');
const { isStaff } = require('../utils/permissions');

const WHITELIST_ROLE_ID = process.env.WHITELIST_ROLE_ID || null;
const WHITELISTED_ROLE_ID = '1374421917284565046'; // Role to add after user is whitelisted
const WHITELIST_GURU_ROLE_ID = '1456563910919454786'; // Whitelist guru can use whitelist commands

/**
 * Check if member has whitelist guru role or is staff
 */
function canUseWhitelistCommands(member) {
    if (isStaff(member)) return true;
    if (member && member.roles && member.roles.cache.has(WHITELIST_GURU_ROLE_ID)) return true;
    return false;
}

async function getFetcher() {
	if (globalThis.fetch) return globalThis.fetch;
	try {
		const nf = require('node-fetch');
		return nf.default || nf;
	} catch (e) {
		throw new Error('Fetch not available. Install node-fetch or run on Node 18+.');
	}
}

async function lookupProfile(platform, username) {
	const fetch = await getFetcher();
	// Different endpoint for bedrock vs java
	const url = platform === 'bedrock'
		? `https://mcprofile.io/api/v1/bedrock/gamertag/${encodeURIComponent(username)}`
		: `https://mcprofile.io/api/v1/java/username/${encodeURIComponent(username)}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Profile lookup failed (${res.status})`);
	const data = await res.json();
	// For bedrock, use fuuid; for java, use uuid
	let id = null;
	if (platform === 'bedrock') {
		id = data.fuuid || data.floodgateuid || data.id;
	} else {
		id = data.uuid || data.id;
	}
	if (!id) throw new Error('Could not determine UUID/fUUID from profile response');
	return id;
}

async function sendRconCommand(cmd) {
	const host = process.env.RCON_HOST;
	const port = Number(process.env.RCON_PORT || 25575);
	const password = process.env.RCON_PASSWORD;
	if (!host || !port || !password) throw new Error('RCON not configured');
	const conn = await Rcon.connect({ host, port, password });
	try {
		const res = await conn.send(cmd);
		await conn.end();
		return res;
	} catch (err) {
		try { await conn.end(); } catch (e) {}
		throw err;
	}
}

const slashCommands = [
	{
		data: new SlashCommandBuilder()
			.setName('whitelist')
			.setDescription('Manage whitelist entries')
				.addSubcommand(sub => sub
					.setName('add')
					.setDescription('Add a player to the whitelist')
					.addStringOption(o => o.setName('platform').setDescription('java or bedrock').setRequired(true)
						.addChoices({ name: 'java', value: 'java' }, { name: 'bedrock', value: 'bedrock' }))
					.addStringOption(o => o.setName('mcname').setDescription('Minecraft username').setRequired(true))
					.addUserOption(o => o.setName('discord').setDescription('Discord user to link').setRequired(true))
				),

		async execute(interaction, client) {
			const sub = interaction.options.getSubcommand();
			if (sub === 'add') {
				if (!canUseWhitelistCommands(interaction.member)) return interaction.reply({ content: 'Permission denied.', ephemeral: true });
				await interaction.deferReply({ ephemeral: false });
				try {
					const platform = interaction.options.getString('platform');
					const mcname = interaction.options.getString('mcname');
					const discordUser = interaction.options.getUser('discord');

					let uuid = null;
					try {
						uuid = await lookupProfile(platform, mcname);
					} catch (err) {
						return interaction.editReply({ content: `Profile lookup failed: ${err.message}` });
					}

					try {
						if (platform === 'java') await sendRconCommand(`whitelist add ${mcname}`);
						else await sendRconCommand(`fwhitelist add ${uuid}`);
					} catch (err) {
						console.error('RCON error:', err);
						return interaction.editReply({ content: `Failed to send whitelist command: ${err.message}` });
					}

					try {
						const existing = await LinkedAccount.findOne({ discordId: String(discordUser.id), minecraftUsername: mcname });
						if (!existing) {
							await new LinkedAccount({ discordId: String(discordUser.id), minecraftUsername: mcname, uuid, platform, linkedAt: new Date() }).save();
						}
					} catch (err) {
						console.error('Failed to persist linked account:', err);
					}

					try {
						const guild = interaction.guild;
						if (guild) {
							const member = await guild.members.fetch(discordUser.id).catch(() => null);
							if (member) {
								try { await member.setNickname(mcname, 'Auto whitelist rename'); } catch (e) {}
								if (WHITELIST_ROLE_ID) {
									try { await member.roles.add(WHITELIST_ROLE_ID, 'Auto whitelist role'); } catch (e) {}
								}
								// Add the whitelisted role
								try { await member.roles.add(WHITELISTED_ROLE_ID, 'User whitelisted'); } catch (e) {}
							}
						}
					} catch (err) { console.error('Failed to update guild member:', err); }

					try {
						const { sendDm } = require('../utils/dm');
						const colorVal = process.env.EMBED_COLOR || '#2B2D31';
						const embedColor = (typeof colorVal === 'string' && colorVal.startsWith('#')) ? parseInt(colorVal.slice(1), 16) : colorVal;
						const welcomeEmbed = new EmbedBuilder()
							.setTitle("We're glad to have you here!")
							.setDescription("Before you jump in, please make sure you’ve read our rules and understand how the server works.\nNewLife SMP is built on respect, fairness, and community — and we’re excited to see what you’ll bring to the world.")
							.setColor(embedColor)
							.addFields(
								{ name: 'Wiki', value: '[Wiki](https://wiki.newlifesmp.com)', inline: true },
								{ name: 'Rules', value: '[Rules](https://newlifesmp.com/rules)', inline: true },
								{ name: 'Modpack', value: '[Modpack](https://modrinth.com/modpack/thenewlife-modpack)', inline: true },
								{ name: 'Support', value: '[Support](https://discord.com/channels/1372672239245459498/1437529798707777537)', inline: false }
							)
							.setFooter({ text: 'Welcome to NewLife SMP' })
							.setTimestamp();

						const dmRes = await sendDm(client, discordUser.id, { content: `Whitelisted **${mcname}** (${platform}) and linked to <@${discordUser.id}>. imperical`, embeds: [welcomeEmbed] });
						if (!dmRes.success) console.warn('DM failed for whitelist:', dmRes.error);
					} catch (e) { /* ignore DM failures */ }

					try {
						if (process.env.LOG_CHANNEL_ID) {
							const ch = await client.channels.fetch(process.env.LOG_CHANNEL_ID).catch(() => null);
							if (ch) {
								const logEmbed = new EmbedBuilder()
									.setTitle('Whitelist Added')
									.addFields(
										{ name: 'Minecraft', value: `${mcname} (${platform})`, inline: true },
										{ name: 'UUID', value: uuid || 'N/A', inline: true },
										{ name: 'Discord', value: `${discordUser.tag} (${discordUser.id})`, inline: true }
									)
									.setTimestamp();
								await ch.send({ embeds: [logEmbed] }).catch(() => null);
							}
						}
					} catch (e) { console.error('Failed to send log:', e); }

					return interaction.editReply({ content: `Whitelisted **${mcname}** (${platform}) and linked to <@${discordUser.id}>.` });
				} catch (err) {
					console.error('Whitelist execute error:', err);
					return interaction.editReply({ content: 'An unexpected error occurred.' });
				}
			} else {
				return interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
			}
		}
	}
];

module.exports = { name: 'Whitelist', slashCommands };

