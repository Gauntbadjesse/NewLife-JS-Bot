package com.newlifesmp.status.listeners;

import com.google.gson.JsonObject;
import com.newlifesmp.status.NewLifeStatus;
import com.newlifesmp.status.PlayerDataManager;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Handles combat logging - kills players who logout while in combat with PvP enabled
 */
public class CombatLogListener implements Listener {

    private final NewLifeStatus plugin;
    private final Map<UUID, Long> combatTagged;
    private final long combatTagDuration;

    public CombatLogListener(NewLifeStatus plugin, long combatTagDurationSeconds) {
        this.plugin = plugin;
        this.combatTagged = new ConcurrentHashMap<>();
        this.combatTagDuration = combatTagDurationSeconds * 1000;

        // Start cleanup task for expired combat tags
        Bukkit.getScheduler().runTaskTimer(plugin, this::cleanupExpiredTags, 20L, 20L);
    }

    /**
     * Tag a player as in combat
     */
    public void tagPlayer(UUID playerUUID) {
        combatTagged.put(playerUUID, System.currentTimeMillis());
    }

    /**
     * Check if a player is currently in combat
     */
    public boolean isInCombat(UUID playerUUID) {
        Long tagTime = combatTagged.get(playerUUID);
        if (tagTime == null) {
            return false;
        }
        return System.currentTimeMillis() - tagTime < combatTagDuration;
    }

    /**
     * Remove combat tag from a player
     */
    public void removeTag(UUID playerUUID) {
        combatTagged.remove(playerUUID);
    }

    /**
     * Clean up expired combat tags
     */
    private void cleanupExpiredTags() {
        long currentTime = System.currentTimeMillis();
        combatTagged.entrySet().removeIf(entry -> 
            currentTime - entry.getValue() >= combatTagDuration
        );
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onPlayerQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();

        // Check if player has PvP enabled
        PlayerDataManager.PlayerData data = plugin.getPlayerDataManager().getPlayerData(uuid);
        if (data == null || !data.isPvpEnabled()) {
            return;
        }

        // Check if player is in combat
        if (!isInCombat(uuid)) {
            return;
        }

        // Player is combat logging - kill them
        plugin.getLogger().warning(String.format("Combat log detected: %s (UUID: %s) logged out with PvP enabled while in combat",
            player.getName(), uuid));

        // Kill the player on the main thread
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) {
                player.setHealth(0.0);
                
                // Send disconnect message
                Component message = Component.text("You were killed for logging out during combat with PvP enabled!", 
                    NamedTextColor.RED);
                player.kick(message);
            }
        });

        // Log to Discord
        logCombatLog(player, data);

        // Send DM to player
        sendCombatLogDM(player);

        // Remove combat tag
        removeTag(uuid);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onPlayerDeath(PlayerDeathEvent event) {
        // Remove combat tag when player dies
        removeTag(event.getEntity().getUniqueId());
    }

    /**
     * Log combat logging event to Discord
     */
    private void logCombatLog(Player player, PlayerDataManager.PlayerData data) {
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            JsonObject payload = new JsonObject();
            payload.addProperty("type", "combat_log");
            payload.addProperty("timestamp", System.currentTimeMillis());

            // Player data
            JsonObject playerJson = new JsonObject();
            playerJson.addProperty("uuid", player.getUniqueId().toString());
            playerJson.addProperty("username", player.getName());
            playerJson.addProperty("pvp_enabled", true);
            playerJson.addProperty("status", data.getStatus());
            payload.add("player", playerJson);

            // Location data
            JsonObject locationJson = new JsonObject();
            locationJson.addProperty("world", player.getWorld().getName());
            locationJson.addProperty("x", player.getLocation().getX());
            locationJson.addProperty("y", player.getLocation().getY());
            locationJson.addProperty("z", player.getLocation().getZ());
            payload.add("location", locationJson);

            // Send to API
            if (plugin.getApiClient() != null) {
                plugin.getApiClient().sendLog("pvp/combat-log", payload);
            }
        });
    }

    /**
     * Send DM to player about combat logging
     */
    private void sendCombatLogDM(Player player) {
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            JsonObject payload = new JsonObject();
            payload.addProperty("type", "combat_log_dm");
            payload.addProperty("minecraft_uuid", player.getUniqueId().toString());
            payload.addProperty("minecraft_username", player.getName());
            
            String message = String.format(
                "⚔️ **Combat Log Detected**\n\n" +
                "You were killed for logging out during combat while you had PvP enabled.\n\n" +
                "**What happened?**\n" +
                "• You took or dealt damage with PvP enabled\n" +
                "• You disconnected before the combat timer expired\n" +
                "• Your character was killed and items dropped at your logout location\n\n" +
                "**To avoid this:**\n" +
                "• Wait %d seconds after combat before logging out\n" +
                "• Turn off PvP if you need to logout (note: this has a cooldown)",
                plugin.getStatusConfig().getCombatTagDuration()
            );
            
            payload.addProperty("message", message);

            // Send DM request to API
            if (plugin.getApiClient() != null) {
                plugin.getApiClient().sendLog("pvp/send-dm", payload);
            }
        });
    }
}
