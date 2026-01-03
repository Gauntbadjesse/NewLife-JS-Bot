package com.newlifesmp.bans;

import com.velocitypowered.api.event.PostOrder;
import com.velocitypowered.api.event.ResultedEvent;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.LoginEvent;
import com.velocitypowered.api.proxy.Player;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.Component;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class BanCheckListener {

    private final NewLifeBans plugin;
    private final MiniMessage miniMessage;

    public BanCheckListener(NewLifeBans plugin) {
        this.plugin = plugin;
        this.miniMessage = MiniMessage.miniMessage();
    }

    @Subscribe(order = PostOrder.NORMAL)
    public void onPlayerLogin(LoginEvent event) {
        Player player = event.getPlayer();
        String uuid = player.getUniqueId().toString();
        String username = player.getUsername();
        
        BanConfig config = plugin.getConfig();
        
        // Debug logging
        if (config.isDebug()) {
            plugin.getLogger().info("[DEBUG] Checking ban status for {} ({})", username, uuid);
        }

        // Check bypass permission
        if (player.hasPermission(config.getBypassPermission())) {
            if (config.isDebug()) {
                plugin.getLogger().info("[DEBUG] Player {} has bypass permission, skipping ban check", username);
            }
            return;
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
                // You can change this to fail-closed if preferred
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
}
