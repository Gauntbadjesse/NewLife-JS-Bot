package com.newlifesmp.status.listeners;

import com.google.gson.JsonObject;
import com.newlifesmp.status.NewLifeStatus;
import com.newlifesmp.status.PlayerDataManager;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;

public class PlayerDeathListener implements Listener {

    private final NewLifeStatus plugin;

    public PlayerDeathListener(NewLifeStatus plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onPlayerDeath(PlayerDeathEvent event) {
        Player victim = event.getEntity();
        Player killer = victim.getKiller();

        // Check if it was a PvP kill (player killed by another player)
        if (killer != null && killer != victim) {
            logPvpKill(killer, victim);
        }
    }

    private void logPvpKill(Player killer, Player victim) {
        CompletableFuture.runAsync(() -> {
            try {
                PlayerDataManager dataManager = plugin.getPlayerDataManager();

                // Get PvP and status data for both players
                PlayerDataManager.PlayerData killerData = dataManager.getPlayerData(killer.getUniqueId());
                PlayerDataManager.PlayerData victimData = dataManager.getPlayerData(victim.getUniqueId());

                // Default values if data not found
                boolean killerPvpEnabled = killerData != null && killerData.isPvpEnabled();
                String killerStatus = killerData != null ? killerData.getStatus() : "none";
                boolean victimPvpEnabled = victimData != null && victimData.isPvpEnabled();
                String victimStatus = victimData != null ? victimData.getStatus() : "none";

                // Determine if consensual (both have PvP enabled)
                boolean consensual = killerPvpEnabled && victimPvpEnabled;

                // Build payload
                JsonObject payload = new JsonObject();
                payload.addProperty("type", "pvp_kill");
                payload.addProperty("timestamp", System.currentTimeMillis());
                payload.addProperty("consensual", consensual);

                // Killer data
                JsonObject killerJson = new JsonObject();
                killerJson.addProperty("uuid", killer.getUniqueId().toString());
                killerJson.addProperty("username", killer.getName());
                killerJson.addProperty("pvp_enabled", killerPvpEnabled);
                killerJson.addProperty("status", killerStatus);
                payload.add("killer", killerJson);

                // Victim data
                JsonObject victimJson = new JsonObject();
                victimJson.addProperty("uuid", victim.getUniqueId().toString());
                victimJson.addProperty("username", victim.getName());
                victimJson.addProperty("pvp_enabled", victimPvpEnabled);
                victimJson.addProperty("status", victimStatus);
                payload.add("victim", victimJson);

                // Send to Discord API
                String apiUrl = plugin.getStatusConfig().getDiscordApiUrl();
                String apiKey = plugin.getStatusConfig().getDiscordApiKey();

                if (apiUrl == null || apiKey == null || !plugin.getStatusConfig().isDiscordEnabled()) {
                    plugin.getLogger().warning("Discord logging disabled or not configured");
                    return;
                }

                String endpoint = apiUrl.endsWith("/") ? apiUrl.substring(0, apiUrl.length() - 1) : apiUrl;
                endpoint += "/api/pvp/log";

                plugin.getLogger().info("Logging PvP kill: " + killer.getName() + " → " + victim.getName() + 
                    " (consensual: " + consensual + ")");

                HttpURLConnection conn = (HttpURLConnection) URI.create(endpoint).toURL().openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = payload.toString().getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }

                int responseCode = conn.getResponseCode();
                if (responseCode == 200 || responseCode == 201) {
                    plugin.getLogger().info("✓ PvP kill logged to Discord");
                } else {
                    plugin.getLogger().warning("✗ Discord API returned " + responseCode + " for PvP kill log");
                }

                conn.disconnect();
            } catch (Exception e) {
                plugin.getLogger().warning("✗ Failed to log PvP kill: " + e.getMessage());
                e.printStackTrace();
            }
        });
    }
}
