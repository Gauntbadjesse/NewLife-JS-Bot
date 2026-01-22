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
            plugin.getLogger().info("Loaded player data for " + player.getName());
        }

        // Update TAB list
        plugin.getTabListManager().updatePlayer(player);
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        // Player data is already saved, just log
        plugin.getLogger().info("Player " + event.getPlayer().getName() + " disconnected");
    }
}
