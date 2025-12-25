/**
 * Permission System for NewLife Management Bot
 * Role Hierarchy: Owner > Management > Supervisor > Admin > Sr Mod > Moderator > Everyone
 */

// Permission levels (higher = more permissions)
const PERMISSION_LEVELS = {
    EVERYONE: 0,
    MODERATOR: 1,
    SR_MOD: 2,
    ADMIN: 3,
    SUPERVISOR: 4,
    MANAGEMENT: 5,
    OWNER: 6
};

// Get role IDs from environment
const getRoleIds = () => ({
    MODERATOR: process.env.MODERATOR_ROLE_ID,
    SR_MOD: process.env.SR_MOD_ROLE_ID,
    ADMIN: process.env.ADMIN_ROLE_ID,
    SUPERVISOR: process.env.SUPERVISOR_ROLE_ID,
    MANAGEMENT: process.env.MANAGEMENT_ROLE_ID,
    OWNER: process.env.OWNER_ROLE_ID
});

/**
 * Get the highest permission level of a member
 */
function getPermissionLevel(member) {
    // Owner as a single user id (env var OWNER_ID or OWNER_USER_ID) should override role checks
    try {
        const ownerUserId = process.env.OWNER_ID || process.env.OWNER_USER_ID;
        if (ownerUserId) {
            if (typeof member === 'string' && member === ownerUserId) return PERMISSION_LEVELS.OWNER;
            if (member && (member.id === ownerUserId || (member.user && member.user.id === ownerUserId))) return PERMISSION_LEVELS.OWNER;
        }
    } catch (e) {
        // ignore
    }

    if (!member || !member.roles) return PERMISSION_LEVELS.EVERYONE;

    const roleIds = getRoleIds();
    const memberRoles = member.roles.cache;
    
    if (roleIds.OWNER && memberRoles.has(roleIds.OWNER)) return PERMISSION_LEVELS.OWNER;
    if (roleIds.MANAGEMENT && memberRoles.has(roleIds.MANAGEMENT)) return PERMISSION_LEVELS.MANAGEMENT;
    if (roleIds.SUPERVISOR && memberRoles.has(roleIds.SUPERVISOR)) return PERMISSION_LEVELS.SUPERVISOR;
    if (roleIds.ADMIN && memberRoles.has(roleIds.ADMIN)) return PERMISSION_LEVELS.ADMIN;
    if (roleIds.SR_MOD && memberRoles.has(roleIds.SR_MOD)) return PERMISSION_LEVELS.SR_MOD;
    if (roleIds.MODERATOR && memberRoles.has(roleIds.MODERATOR)) return PERMISSION_LEVELS.MODERATOR;
    
    return PERMISSION_LEVELS.EVERYONE;
}

/**
 * Check if member has at least the required permission level
 */
function hasPermissionLevel(member, requiredLevel) {
    return getPermissionLevel(member) >= requiredLevel;
}

// Specific role checks (each includes all higher roles)
function isOwner(member) {
    return hasPermissionLevel(member, PERMISSION_LEVELS.OWNER);
}

function isManagement(member) {
    return hasPermissionLevel(member, PERMISSION_LEVELS.MANAGEMENT);
}

function isSupervisor(member) {
    return hasPermissionLevel(member, PERMISSION_LEVELS.SUPERVISOR);
}

function isAdmin(member) {
    return hasPermissionLevel(member, PERMISSION_LEVELS.ADMIN);
}

function isSrMod(member) {
    return hasPermissionLevel(member, PERMISSION_LEVELS.SR_MOD);
}

function isModerator(member) {
    return hasPermissionLevel(member, PERMISSION_LEVELS.MODERATOR);
}

// Alias for backward compatibility
function isStaff(member) {
    return isModerator(member);
}

/**
 * Check if member can access General/Report tickets (Sr Mod+)
 */
function canAccessGeneralTickets(member) {
    return isSrMod(member);
}

/**
 * Check if member can access Management tickets (Supervisor+)
 */
function canAccessManagementTickets(member) {
    return isSupervisor(member);
}

/**
 * Get role IDs that should have access to general/report tickets
 */
function getGeneralTicketRoles() {
    const roleIds = getRoleIds();
    return [
        roleIds.SR_MOD,
        roleIds.ADMIN,
        roleIds.SUPERVISOR,
        roleIds.MANAGEMENT,
        roleIds.OWNER
    ].filter(id => id); // Filter out undefined/null
}

/**
 * Get role IDs that should have access to management tickets
 */
function getManagementTicketRoles() {
    const roleIds = getRoleIds();
    return [
        roleIds.SUPERVISOR,
        roleIds.MANAGEMENT,
        roleIds.OWNER
    ].filter(id => id); // Filter out undefined/null
}

module.exports = {
    PERMISSION_LEVELS,
    getPermissionLevel,
    hasPermissionLevel,
    isOwner,
    isManagement,
    isSupervisor,
    isAdmin,
    isSrMod,
    isModerator,
    isStaff,
    canAccessGeneralTickets,
    canAccessManagementTickets,
    getGeneralTicketRoles,
    getManagementTicketRoles,
    getRoleIds
};
