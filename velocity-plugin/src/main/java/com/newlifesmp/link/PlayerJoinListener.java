package com.newlifesmp.link;

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

public class PlayerJoinListener {

    private final NewLifeLink plugin;
    private final MiniMessage miniMessage;

    public PlayerJoinListener(NewLifeLink plugin) {
        this.plugin = plugin;
        this.miniMessage = MiniMessage.miniMessage();
    }

    @Subscribe(order = PostOrder.EARLY)
    public void onPlayerLogin(LoginEvent event) {
        Player player = event.getPlayer();
        String uuid = player.getUniqueId().toString();
        String username = player.getUsername();
        
        Config config = plugin.getConfig();
        
        // Debug logging
        if (config.isDebug()) {
            plugin.getLogger().info("[DEBUG] Player {} ({}) attempting to join", username, uuid);
        }

        // Check bypass permission
        if (player.hasPermission(config.getBypassPermission())) {
            if (config.isDebug()) {
                plugin.getLogger().info("[DEBUG] Player {} has bypass permission, allowing", username);
            }
            return;
        }

        // Check link status via API
        try {
            LinkApiClient.LinkResult result = plugin.getApiClient()
                .checkLinked(uuid)
                .get(config.getTimeout() + 1000, TimeUnit.MILLISECONDS);

            if (config.isDebug()) {
                plugin.getLogger().info("[DEBUG] API result for {}: success={}, linked={}", 
                    username, result.isSuccess(), result.isLinked());
            }

            if (!result.isSuccess()) {
                // API error - deny with error message
                plugin.getLogger().warn("API check failed for {}: {}", username, 
                    result.getError().orElse("Unknown error"));
                
                Component kickComponent = miniMessage.deserialize(config.getApiErrorMessage());
                event.setResult(ResultedEvent.ComponentResult.denied(kickComponent));
                return;
            }

            if (!result.isLinked()) {
                // Not linked - deny with instructions
                plugin.getLogger().info("Denied unlinked player: {} ({})", username, uuid);
                
                Component kickComponent = miniMessage.deserialize(config.getKickMessage());
                event.setResult(ResultedEvent.ComponentResult.denied(kickComponent));
                return;
            }

            // Player is linked - allow
            if (config.isDebug()) {
                plugin.getLogger().info("[DEBUG] Player {} is linked to Discord {}, allowing", 
                    username, result.getDiscordId().orElse("unknown"));
            }

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            plugin.getLogger().error("Link check interrupted for {}", username);
            Component kickComponent = miniMessage.deserialize(config.getApiErrorMessage());
            event.setResult(ResultedEvent.ComponentResult.denied(kickComponent));
            
        } catch (ExecutionException e) {
            plugin.getLogger().error("Link check execution failed for {}", username, e.getCause());
            Component kickComponent = miniMessage.deserialize(config.getApiErrorMessage());
            event.setResult(ResultedEvent.ComponentResult.denied(kickComponent));
            
        } catch (TimeoutException e) {
            plugin.getLogger().warn("Link check timed out for {}", username);
            Component kickComponent = miniMessage.deserialize(config.getApiErrorMessage());
            event.setResult(ResultedEvent.ComponentResult.denied(kickComponent));
        }
    }
}
