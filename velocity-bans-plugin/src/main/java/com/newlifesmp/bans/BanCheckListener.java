package com.newlifesmp.bans;

import com.velocitypowered.api.event.ResultedEvent;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.LoginEvent;
import com.velocitypowered.api.proxy.Player;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.Component;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class BanCheckListener {

    private final NewLifeBans plugin;
    private final MiniMessage miniMessage;
    private final Map<String, Long> kickCooldowns = new ConcurrentHashMap<>();
    private static final long KICK_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

    public BanCheckListener(NewLifeBans plugin) {
        this.plugin = plugin;
        this.miniMessage = MiniMessage.miniMessage();
    }

    @Subscribe
    public void onPlayerLogin(LoginEvent event) {
        Player player = event.getPlayer();
        String uuid = player.getUniqueId().toString();
        String username = player.getUsername();
        
        BanConfig config = plugin.getConfig();
        
        // Debug logging
        if (config.isDebug()) {
            plugin.getLogger().info("[DEBUG] Checking ban/kick status for {} ({})", username, uuid);
        }

        // Check bypass permission
        if (player.hasPermission(config.getBypassPermission())) {
            if (config.isDebug()) {
                plugin.getLogger().info("[DEBUG] Player {} has bypass permission, skipping checks", username);
            }
            return;
        }

        // Check kick cooldown first (30 minutes)
        Long kickTime = kickCooldowns.get(uuid);
        if (kickTime != null) {
            long remaining = KICK_COOLDOWN_MS - (System.currentTimeMillis() - kickTime);
            if (remaining > 0) {
                // Still on cooldown
                long minutes = remaining / 60000;
                long seconds = (remaining % 60000) / 1000;
                
                String kickCooldownMessage = String.format(
                    "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
                    "<gradient:#FF4444:#FF6B6B><bold>KICKED - COOLDOWN ACTIVE</bold></gradient>\n\n" +
                    "<gray>You were recently kicked and cannot rejoin yet.\n" +
                    "<white>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
                    "<yellow><bold>COOLDOWN:</bold>\n\n" +
                    "<gray>Time Remaining: <white>%dm %ds\n\n" +
                    "<white>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
                    "<gray>Kick cooldowns help prevent disruption.\n" +
                    "<gray>Please wait before attempting to reconnect.\n\n" +
                    "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                    minutes, seconds
                );
                
                Component kickComponent = miniMessage.deserialize(kickCooldownMessage);
                event.setResult(ResultedEvent.ComponentResult.denied(kickComponent));
                
                plugin.getLogger().info("Denied kicked player {} - cooldown: {}m {}s remaining", 
                    username, minutes, seconds);
                return;
            } else {
                // Cooldown expired, remove from map
                kickCooldowns.remove(uuid);
            }
        }

        // Check ban status via API
        try {
            BanApiClient.BanResult result = plugin.getApiClient()
                .checkBan(uuid)
                .get(config.getTimeout() + 1000, TimeUnit.MILLISECONDS);

            if (config.isDebug()) {
                plugin.getLogger().info("[DEBUG] Ban check for {}: success={}, banned={}", 
                    username, result.isSuccess(), result.isBanned());
            }

            if (!result.isSuccess()) {
                // API error - let them through (fail-open for bans)
                plugin.getLogger().warn("Ban API check failed for {}: {}", username, 
                    result.getError().orElse("Unknown error"));
                return;
            }

            if (result.isBanned()) {
                // Player is banned - deny entry
                plugin.getLogger().info("Denied banned player: {} ({})", username, uuid);
                
                String kickMessage = config.getBannedMessage()
                    .replace("{reason}", result.getReason())
                    .replace("{duration}", result.getDuration())
                    .replace("{expires}", result.isPermanent() ? "Never (Permanent)" : result.getRemaining())
                    .replace("{case}", String.valueOf(result.getCaseNumber()))
                    .replace("{staff}", result.getStaffTag());
                
                Component kickComponent = miniMessage.deserialize(kickMessage);
                event.setResult(ResultedEvent.ComponentResult.denied(kickComponent));
                return;
            }

            // Player is not banned - allow
            if (config.isDebug()) {
                plugin.getLogger().info("[DEBUG] Player {} is not banned, allowing", username);
            }

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            plugin.getLogger().error("Ban check interrupted for {}", username);
            // Fail-open: allow player through
            
        } catch (ExecutionException e) {
            plugin.getLogger().error("Ban check execution failed for {}", username, e.getCause());
            // Fail-open: allow player through
            
        } catch (TimeoutException e) {
            plugin.getLogger().warn("Ban check timed out for {}", username);
            // Fail-open: allow player through
        }
    }
    
    /**
     * Mark a player as kicked - they won't be able to rejoin for 30 minutes
     */
    public void recordKick(String uuid) {
        kickCooldowns.put(uuid, System.currentTimeMillis());
        plugin.getLogger().info("Recorded kick cooldown for UUID: {}", uuid);
    }
    
    /**
     * Get the kick cooldown manager
     */
    public Map<String, Long> getKickCooldowns() {
        return kickCooldowns;
    }
}
