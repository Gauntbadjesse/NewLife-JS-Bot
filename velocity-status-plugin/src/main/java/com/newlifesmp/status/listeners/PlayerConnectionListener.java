package com.newlifesmp.status.listeners;

import com.newlifesmp.status.NewLifeStatus;
import com.newlifesmp.status.PlayerDataManager.PlayerData;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.DisconnectEvent;
import com.velocitypowered.api.event.connection.PostLoginEvent;
import com.velocitypowered.api.proxy.Player;

public class PlayerConnectionListener {
    private final NewLifeStatus plugin;

    public PlayerConnectionListener(NewLifeStatus plugin) {
        this.plugin = plugin;
    }

    @Subscribe
    public void onPlayerJoin(PostLoginEvent event) {
        Player player = event.getPlayer();
        
        // Load player data
        PlayerData data = plugin.getPlayerDataManager().getPlayerData(player.getUniqueId());
        data.setUsername(player.getUsername());
        plugin.getPlayerDataManager().savePlayerData(player.getUniqueId(), data);
        
        // Update tab list after a short delay to ensure player is fully loaded
        plugin.getServer().getScheduler()
            .buildTask(plugin, () -> plugin.getTabListManager().updatePlayer(player))
            .delay(1, java.util.concurrent.TimeUnit.SECONDS)
            .schedule();
        
        plugin.getLogger().info("Player {} joined - PvP: {}, Status: {}", 
            player.getUsername(), 
            data.isPvpEnabled() ? "ON" : "OFF",
            data.getStatus());
    }

    @Subscribe
    public void onPlayerDisconnect(DisconnectEvent event) {
        Player player = event.getPlayer();
        
        // Save player data
        PlayerData data = plugin.getPlayerDataManager().getPlayerData(player.getUniqueId());
        plugin.getPlayerDataManager().savePlayerData(player.getUniqueId(), data);
        
        // Remove from cache to save memory
        plugin.getPlayerDataManager().removeFromCache(player.getUniqueId());
        
        plugin.getLogger().debug("Player {} left - data saved", player.getUsername());
    }
}
