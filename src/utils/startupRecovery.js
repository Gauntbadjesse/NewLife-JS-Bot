const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { sendDm } = require('./dm');

const TARGET_USER_ID = process.env.STARTUP_RECOVERY_USER_ID || '1244492957986590773';
const TARGET_GUILD_ID = process.env.GUILD_ID || '1372672239245459498';
const TARGET_ROLE_ID = process.env.ADMIN_ROLE_ID || null;

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'startup-recovery.json');

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return null;
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        console.error('[StartupRecovery] Failed to load state:', error.message);
        return null;
    }
}

function saveState(state) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('[StartupRecovery] Failed to save state:', error.message);
    }
}

function clearState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            fs.unlinkSync(STATE_FILE);
        }
    } catch (error) {
        console.error('[StartupRecovery] Failed to clear state:', error.message);
    }
}

function ensureState() {
    const state = loadState();
    if (state) return state;

    const fresh = {
        userId: TARGET_USER_ID,
        guildId: TARGET_GUILD_ID,
        roleId: TARGET_ROLE_ID,
        unbanDone: false,
        inviteUrl: null,
        inviteDmSent: false,
        roleGranted: false,
        completed: false,
        createdAt: new Date().toISOString()
    };

    saveState(fresh);
    return fresh;
}

async function findInviteChannel(guild) {
    if (!guild || !guild.channels) return null;

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const candidates = [];

    if (guild.systemChannel) {
        candidates.push(guild.systemChannel);
    }

    for (const channel of guild.channels.cache.values()) {
        if (channel?.isTextBased?.()) {
            candidates.push(channel);
        }
    }

    for (const channel of candidates) {
        try {
            if (!channel || typeof channel.createInvite !== 'function') continue;
            if (me && channel.permissionsFor && !channel.permissionsFor(me).has(PermissionsBitField.Flags.CreateInstantInvite)) {
                continue;
            }
            return channel;
        } catch (error) {
            continue;
        }
    }

    return null;
}

async function createRecoveryInvite(guild) {
    const channel = await findInviteChannel(guild);
    if (!channel) {
        console.warn('[StartupRecovery] No invite-capable channel found');
        return null;
    }

    try {
        const invite = await channel.createInvite({
            maxAge: 24 * 60 * 60,
            maxUses: 1,
            unique: true,
            reason: `Startup recovery invite for ${TARGET_USER_ID}`
        });
        return invite.url;
    } catch (error) {
        console.error('[StartupRecovery] Failed to create invite:', error.message);
        return null;
    }
}

async function restoreAdminRole(member) {
    if (!member || !TARGET_ROLE_ID) return false;

    const role = member.guild.roles.cache.get(TARGET_ROLE_ID) || await member.guild.roles.fetch(TARGET_ROLE_ID).catch(() => null);
    if (!role) {
        console.error('[StartupRecovery] Admin role not found');
        return false;
    }

    try {
        if (member.roles.cache.has(role.id)) {
            return true;
        }

        await member.roles.add(role, 'Startup recovery role restore');
        return true;
    } catch (error) {
        console.error('[StartupRecovery] Failed to restore admin role:', error.message);
        return false;
    }
}

async function completeRecovery() {
    clearState();
    return true;
}

async function runStartupRecovery(client) {
    const state = ensureState();
    if (state.completed) return state;

    const guild = await client.guilds.fetch(TARGET_GUILD_ID).catch(() => null);
    if (!guild) {
        console.error(`[StartupRecovery] Guild ${TARGET_GUILD_ID} not found`);
        return state;
    }

    let nextState = { ...state };

    if (!nextState.unbanDone) {
        try {
            await guild.bans.remove(TARGET_USER_ID, 'Startup recovery: remove accidental ban').catch(() => null);
            nextState.unbanDone = true;
            console.log(`[StartupRecovery] Unban attempted for ${TARGET_USER_ID}`);
        } catch (error) {
            console.error('[StartupRecovery] Failed to remove ban:', error.message);
        }
    }

    if (!nextState.inviteUrl) {
        nextState.inviteUrl = await createRecoveryInvite(guild);
    }

    if (nextState.inviteUrl && !nextState.inviteDmSent) {
        const dmEmbed = new EmbedBuilder()
            .setTitle('Server Invite')
            .setDescription('Use this invite to rejoin the server. Your administrator role will be restored automatically once you are back in the guild.')
            .addFields({ name: 'Invite', value: nextState.inviteUrl })
            .setTimestamp();

        const dmResult = await sendDm(client, TARGET_USER_ID, {
            content: `Rejoin link: ${nextState.inviteUrl}`,
            embeds: [dmEmbed]
        });

        if (dmResult.success) {
            nextState.inviteDmSent = true;
            console.log(`[StartupRecovery] Invite DM sent to ${TARGET_USER_ID}`);
        } else {
            console.warn(`[StartupRecovery] Invite DM failed: ${dmResult.error}`);
        }
    }

    const member = await guild.members.fetch(TARGET_USER_ID).catch(() => null);
    if (member && TARGET_ROLE_ID) {
        const restored = await restoreAdminRole(member);
        if (restored) {
            nextState.roleGranted = true;
            nextState.completed = true;
            await completeRecovery();
            console.log(`[StartupRecovery] Recovery completed immediately for ${TARGET_USER_ID}`);
            return nextState;
        }
    }

    saveState(nextState);
    return nextState;
}

async function handleRecoveryJoin(member) {
    if (!member || member.user?.id !== TARGET_USER_ID) return false;

    const state = loadState();
    if (!state || state.completed) return false;

    const restored = await restoreAdminRole(member);
    if (!restored) return false;

    clearState();
    console.log(`[StartupRecovery] Admin role restored and recovery cleared for ${TARGET_USER_ID}`);
    return true;
}

module.exports = {
    TARGET_USER_ID,
    TARGET_GUILD_ID,
    TARGET_ROLE_ID,
    runStartupRecovery,
    handleRecoveryJoin
};
