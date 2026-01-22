package com.newlifesmp.status.commands;

import com.newlifesmp.status.NewLifeStatus;
import com.newlifesmp.status.PlayerDataManager.PlayerData;
import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.proxy.Player;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;

public class StatusCommand implements SimpleCommand {
    private final NewLifeStatus plugin;

    public StatusCommand(NewLifeStatus plugin) {
        this.plugin = plugin;
    }

    @Override
    public void execute(Invocation invocation) {
        if (!(invocation.source() instanceof Player)) {
            invocation.source().sendMessage(Component.text("This command can only be used by players.", NamedTextColor.RED));
            return;
        }

        Player player = (Player) invocation.source();
        String[] args = invocation.arguments();

        if (args.length == 0) {
            sendUsage(player);
            return;
        }

        String mode = args[0].toLowerCase();

        switch (mode) {
            case "recording":
                setStatus(player, "recording");
                break;
            case "streaming":
                setStatus(player, "streaming");
                break;
            case "none":
                setStatus(player, "none");
                break;
            default:
                player.sendMessage(Component.text(plugin.getConfig().getMessage("invalid_status")));
                sendUsage(player);
                break;
        }
    }

    private void setStatus(Player player, String status) {
        PlayerData data = plugin.getPlayerDataManager().getPlayerData(player.getUniqueId());
        data.setStatus(status);
        plugin.getPlayerDataManager().savePlayerData(player.getUniqueId(), data);
        plugin.getTabListManager().updatePlayer(player);

        String messageKey = "status_" + status;
        player.sendMessage(Component.text(plugin.getConfig().getMessage(messageKey)));
    }

    private void sendUsage(Player player) {
        player.sendMessage(Component.text("Usage:", NamedTextColor.YELLOW));
        player.sendMessage(Component.text("  /status recording", NamedTextColor.WHITE)
            .append(Component.text(" - Set status to Recording (Red ■)", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("  /status streaming", NamedTextColor.WHITE)
            .append(Component.text(" - Set status to Streaming (Purple ■)", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("  /status none", NamedTextColor.WHITE)
            .append(Component.text(" - Clear status (Grey ■)", NamedTextColor.GRAY)));
    }
}
