package com.newlifesmp.status;

import com.newlifesmp.status.PlayerDataManager.PlayerData;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitypowered.api.proxy.player.TabListEntry;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.TextColor;
import org.slf4j.Logger;

public class TabListManager {
    private final ProxyServer server;
    private final PlayerDataManager dataManager;
    private final StatusConfig config;
    private final Logger logger;

    public TabListManager(ProxyServer server, PlayerDataManager dataManager, StatusConfig config, Logger logger) {
        this.server = server;
        this.dataManager = dataManager;
        this.config = config;
        this.logger = logger;
    }

    public void updatePlayer(Player player) {
        try {
            PlayerData data = dataManager.getPlayerData(player.getUniqueId());
            Component displayName = buildDisplayName(player, data);
            
            // Update the player's tab list entry
            player.getTabList().getEntry(player.getUniqueId()).ifPresent(entry -> {
                entry.setDisplayName(displayName);
            });
            
            logger.debug("Updated tab list for {}", player.getUsername());
        } catch (Exception e) {
            logger.error("Failed to update tab list for {}", player.getUsername(), e);
        }
    }

    public void updateAllPlayers() {
        for (Player player : server.getAllPlayers()) {
            updatePlayer(player);
        }
    }

    private Component buildDisplayName(Player player, PlayerData data) {
        String format = config.getTabFormat();
        
        // Get PvP box
        Component pvpBox = getPvpBox(data);
        
        // Get Status box
        Component statusBox = getStatusBox(data);
        
        // Build the display name
        Component displayName = Component.text(player.getUsername());
        
        if (format.contains("{player_name}") && format.contains("{pvp}") && format.contains("{status}")) {
            // Format: {player_name} {pvp}{status}
            if (format.startsWith("{player_name}")) {
                displayName = displayName.append(Component.text(" ")).append(pvpBox).append(statusBox);
            } else {
                // Format: {pvp}{status} {player_name}
                displayName = pvpBox.append(statusBox).append(Component.text(" ")).append(Component.text(player.getUsername()));
            }
        } else {
            // Default format
            displayName = displayName.append(Component.text(" ")).append(pvpBox).append(statusBox);
        }
        
        return displayName;
    }

    private Component getPvpBox(PlayerData data) {
        String box = "■";
        TextColor color;
        
        if (data.isInCooldown()) {
            // Yellow for cooldown
            color = TextColor.fromHexString(colorToHex(config.getColorPvpCooldown()));
        } else if (data.isPvpEnabled()) {
            // Green for PvP ON
            color = TextColor.fromHexString(colorToHex(config.getColorPvpOn()));
        } else {
            // Grey for PvP OFF
            color = TextColor.fromHexString(colorToHex(config.getColorPvpOff()));
        }
        
        return Component.text(box, color);
    }

    private Component getStatusBox(PlayerData data) {
        String box = "■";
        TextColor color;
        
        String status = data.getStatus();
        
        if ("recording".equals(status)) {
            color = TextColor.fromHexString(colorToHex(config.getColorStatusRecording()));
        } else if ("streaming".equals(status)) {
            color = TextColor.fromHexString(colorToHex(config.getColorStatusStreaming()));
        } else {
            color = TextColor.fromHexString(colorToHex(config.getColorStatusNone()));
        }
        
        return Component.text(box, color);
    }

    /**
     * Convert Minecraft color code to hex color
     */
    private String colorToHex(String minecraftColor) {
        if (minecraftColor == null || minecraftColor.length() < 2) {
            return "#AAAAAA"; // Default grey
        }
        
        char code = minecraftColor.charAt(1);
        
        switch (code) {
            case '0': return "#000000"; // Black
            case '1': return "#0000AA"; // Dark Blue
            case '2': return "#00AA00"; // Dark Green
            case '3': return "#00AAAA"; // Dark Aqua
            case '4': return "#AA0000"; // Dark Red
            case '5': return "#AA00AA"; // Dark Purple
            case '6': return "#FFAA00"; // Gold
            case '7': return "#AAAAAA"; // Grey
            case '8': return "#555555"; // Dark Grey
            case '9': return "#5555FF"; // Blue
            case 'a': return "#55FF55"; // Green
            case 'b': return "#55FFFF"; // Aqua
            case 'c': return "#FF5555"; // Red
            case 'd': return "#FF55FF"; // Light Purple
            case 'e': return "#FFFF55"; // Yellow
            case 'f': return "#FFFFFF"; // White
            default: return "#AAAAAA"; // Default grey
        }
    }
}
