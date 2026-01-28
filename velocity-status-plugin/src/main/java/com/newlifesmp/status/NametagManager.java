package com.newlifesmp.status;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.scoreboard.Team;

import java.util.UUID;

/**
 * Manages player nametags using scoreboard teams.
 * This approach works for both Java and Bedrock players (via Geyser).
 * 
 * Displays a colored dot prefix above player heads:
 * - Green dot (●) = PvP enabled
 * - Yellow dot (●) = PvP cooldown (recently disabled)
 * - Gray circle (○) = PvP disabled
 */
public class NametagManager {

    private final PlayerDataManager dataManager;
    private final Scoreboard scoreboard;

    // Team names
    private static final String TEAM_PVP_ON = "pvp_on";
    private static final String TEAM_PVP_COOLDOWN = "pvp_cooldown";
    private static final String TEAM_PVP_OFF = "pvp_off";

    // Visual indicators - using unicode that works on Bedrock
    private static final String DOT_FILLED = "● ";  // Filled circle for PvP on/cooldown
    private static final String DOT_EMPTY = "○ ";   // Empty circle for PvP off

    // Colors
    private static final TextColor COLOR_PVP_ON = NamedTextColor.GREEN;
    private static final TextColor COLOR_PVP_COOLDOWN = NamedTextColor.YELLOW;
    private static final TextColor COLOR_PVP_OFF = NamedTextColor.GRAY;

    public NametagManager(PlayerDataManager dataManager) {
        this.dataManager = dataManager;
        this.scoreboard = Bukkit.getScoreboardManager().getMainScoreboard();
        initializeTeams();
    }

    /**
     * Creates the scoreboard teams if they don't exist
     */
    private void initializeTeams() {
        // PvP ON team - Green filled dot
        Team pvpOn = getOrCreateTeam(TEAM_PVP_ON);
        pvpOn.prefix(Component.text(DOT_FILLED, COLOR_PVP_ON));
        pvpOn.color(NamedTextColor.GREEN);

        // PvP Cooldown team - Yellow filled dot
        Team pvpCooldown = getOrCreateTeam(TEAM_PVP_COOLDOWN);
        pvpCooldown.prefix(Component.text(DOT_FILLED, COLOR_PVP_COOLDOWN));
        pvpCooldown.color(NamedTextColor.YELLOW);

        // PvP OFF team - Gray empty dot
        Team pvpOff = getOrCreateTeam(TEAM_PVP_OFF);
        pvpOff.prefix(Component.text(DOT_EMPTY, COLOR_PVP_OFF));
        pvpOff.color(NamedTextColor.GRAY);
    }

    /**
     * Gets an existing team or creates a new one
     */
    private Team getOrCreateTeam(String name) {
        Team team = scoreboard.getTeam(name);
        if (team == null) {
            team = scoreboard.registerNewTeam(name);
        }
        return team;
    }

    /**
     * Updates a player's nametag based on their PvP status
     */
    public void updatePlayer(Player player) {
        UUID uuid = player.getUniqueId();
        PlayerDataManager.PlayerData data = dataManager.getPlayerData(uuid);

        // Remove from all teams first
        removeFromAllTeams(player);

        // Determine which team to add them to
        String teamName;
        if (data == null || !data.isPvpEnabled()) {
            teamName = TEAM_PVP_OFF;
        } else if (data.hasPvpCooldown()) {
            teamName = TEAM_PVP_COOLDOWN;
        } else {
            teamName = TEAM_PVP_ON;
        }

        // Add to appropriate team
        Team team = scoreboard.getTeam(teamName);
        if (team != null) {
            team.addEntry(player.getName());
        }

        // Ensure player is using the main scoreboard
        player.setScoreboard(scoreboard);
    }

    /**
     * Removes a player from all PvP status teams
     */
    private void removeFromAllTeams(Player player) {
        String playerName = player.getName();
        
        Team pvpOn = scoreboard.getTeam(TEAM_PVP_ON);
        Team pvpCooldown = scoreboard.getTeam(TEAM_PVP_COOLDOWN);
        Team pvpOff = scoreboard.getTeam(TEAM_PVP_OFF);

        if (pvpOn != null) pvpOn.removeEntry(playerName);
        if (pvpCooldown != null) pvpCooldown.removeEntry(playerName);
        if (pvpOff != null) pvpOff.removeEntry(playerName);
    }

    /**
     * Removes a player from all teams (for cleanup on disconnect)
     */
    public void removePlayer(Player player) {
        removeFromAllTeams(player);
    }

    /**
     * Updates all online players' nametags
     */
    public void updateAllPlayers() {
        for (Player player : Bukkit.getOnlinePlayers()) {
            updatePlayer(player);
        }
    }
}
