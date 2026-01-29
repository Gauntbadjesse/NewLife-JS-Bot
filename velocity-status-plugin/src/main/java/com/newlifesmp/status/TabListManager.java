package com.newlifesmp.status;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.entity.Player;

import java.util.UUID;

public class TabListManager {

    private final PlayerDataManager dataManager;

    // Box character
    private static final String BOX = "■";

    // PvP status colors
    private static final TextColor PVP_ON = NamedTextColor.GREEN;
    private static final TextColor PVP_COOLDOWN = NamedTextColor.YELLOW;
    private static final TextColor PVP_OFF = NamedTextColor.GRAY;

    // Recording status colors
    private static final TextColor RECORDING = NamedTextColor.RED;
    private static final TextColor STREAMING = TextColor.color(128, 0, 128); // Purple
    private static final TextColor NO_STATUS = NamedTextColor.GRAY;

    public TabListManager(PlayerDataManager dataManager) {
        this.dataManager = dataManager;
    }

    public void updatePlayer(Player player) {
        UUID uuid = player.getUniqueId();
        PlayerDataManager.PlayerData data = dataManager.getPlayerData(uuid);

        if (data == null) {
            // Default: PvP OFF, No status
            data = new PlayerDataManager.PlayerData(uuid.toString(), player.getName(), false, "none", 0);
            dataManager.savePlayerData(data);
        }

        Component prefix = buildPrefix(data);
        player.playerListName(prefix.append(Component.text(player.getName())));
    }

    private Component buildPrefix(PlayerDataManager.PlayerData data) {
        // PvP status box
        Component pvpBox;
        if (data.isPvpEnabled()) {
            if (data.hasPvpCooldown()) {
                pvpBox = Component.text(BOX, PVP_COOLDOWN);
            } else {
                pvpBox = Component.text(BOX, PVP_ON);
            }
        } else {
            pvpBox = Component.text(BOX, PVP_OFF);
        }

        // Status box
        Component statusBox;
        switch (data.getStatus().toLowerCase()) {
            case "recording":
                statusBox = Component.text(BOX, RECORDING);
                break;
            case "streaming":
                statusBox = Component.text(BOX, STREAMING);
                break;
            default:
                statusBox = Component.text(BOX, NO_STATUS);
                break;
        }

        // Combine: [PvP Box][Status Box] with space
        return pvpBox.append(statusBox).append(Component.text(" "));
    }
}
