package com.newlifesmp.status.listeners;

import com.newlifesmp.status.NewLifeStatus;
import com.newlifesmp.status.PlayerDataManager;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.UUID;

public class PlayerConnectionListener implements Listener {

    private final NewLifeStatus plugin;

    public PlayerConnectionListener(NewLifeStatus plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();

        // Load or create player data
        PlayerDataManager.PlayerData data = plugin.getDataManager().getPlayerData(uuid);
        if (data == null) {
            data = new PlayerDataManager.PlayerData(uuid.toString(), false, "none", 0);
            plugin.getDataManager().savePlayerData(data);
            plugin.getLogger().info("Created new player data for " + player.getName());
        } else {
            plugin.getLogger().info("Loaded player data for " + player.getName() + 
                " (PvP: " + data.isPvpEnabled() + ", Status: " + data.getStatus() + 
                ", Cooldown: " + (data.hasPvpCooldown() ? "active" : "none") + ")");
            
            // If player has an active cooldown, schedule task to complete it
            if (data.hasPvpCooldown()) {
                long remainingMs = data.getPvpCooldownUntil() - System.currentTimeMillis();
                if (remainingMs > 0) {
                    long remainingSec = remainingMs / 1000;
                    plugin.getLogger().info("Restoring PvP cooldown for " + player.getName() + 
                        " (" + remainingSec + " seconds remaining)");
                    
                    // Schedule the cooldown completion task
                    plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
                        PlayerDataManager.PlayerData currentData = plugin.getDataManager().getPlayerData(uuid);
                        if (currentData != null && currentData.hasPvpCooldown()) {
                            currentData.setPvpEnabled(false);
                            currentData.setPvpCooldownUntil(0);
                            plugin.getDataManager().savePlayerData(currentData);
                            
                            if (player.isOnline()) {
                                plugin.getTabListManager().updatePlayer(player);
                                plugin.getNametagManager().updatePlayer(player);
                                player.sendMessage(net.kyori.adventure.text.Component.text("Your PvP has been turned off after the cooldown period.", net.kyori.adventure.text.format.NamedTextColor.GREEN));
                            }
                        }
                    }, remainingMs / 50); // Convert milliseconds to ticks (1 tick = 50ms)
                } else {
                    // Cooldown already expired while offline, disable PvP immediately
                    data.setPvpEnabled(false);
                    data.setPvpCooldownUntil(0);
                    plugin.getDataManager().savePlayerData(data);
                }
            }
        }

        // Update TAB list and nametag
        plugin.getTabListManager().updatePlayer(player);
        plugin.getNametagManager().updatePlayer(player);
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();
        
        // Remove player from nametag teams
        plugin.getNametagManager().removePlayer(player);
        
        // Ensure latest data is saved before disconnect
        PlayerDataManager.PlayerData data = plugin.getDataManager().getPlayerData(uuid);
        if (data != null) {
            plugin.getDataManager().savePlayerData(data);
            
            if (data.hasPvpCooldown()) {
                long remainingSec = (data.getPvpCooldownUntil() - System.currentTimeMillis()) / 1000;
                plugin.getLogger().info("Player " + player.getName() + " disconnected with " + 
                    remainingSec + " seconds of PvP cooldown remaining");
            } else {
                plugin.getLogger().info("Player " + player.getName() + " disconnected (PvP: " + 
                    data.isPvpEnabled() + ", Status: " + data.getStatus() + ")");
            }
        }
    }
}
