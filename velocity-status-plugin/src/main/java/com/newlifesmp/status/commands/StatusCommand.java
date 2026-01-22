package com.newlifesmp.status.commands;

import com.newlifesmp.status.NewLifeStatus;
import com.newlifesmp.status.PlayerDataManager;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class StatusCommand implements CommandExecutor, TabCompleter {

    private final NewLifeStatus plugin;

    public StatusCommand(NewLifeStatus plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, @NotNull String[] args) {
        if (!(sender instanceof Player)) {
            sender.sendMessage(Component.text("This command can only be used by players", NamedTextColor.RED));
            return true;
        }

        Player player = (Player) sender;
        UUID uuid = player.getUniqueId();

        if (args.length == 0) {
            sendUsage(player);
            return true;
        }

        String status = args[0].toLowerCase();

        PlayerDataManager.PlayerData data = plugin.getDataManager().getPlayerData(uuid);
        if (data == null) {
            data = new PlayerDataManager.PlayerData(uuid.toString(), false, "none", 0);
        }

        switch (status) {
            case "recording":
                data.setStatus("recording");
                plugin.getDataManager().savePlayerData(data);
                plugin.getTabListManager().updatePlayer(player);
                player.sendMessage(Component.text("✓ Status: ", NamedTextColor.GRAY)
                    .append(Component.text("Recording", NamedTextColor.RED, TextDecoration.BOLD)));
                
                if (plugin.getApiClient() != null) {
                    plugin.getApiClient().logStatusChange(uuid.toString(), player.getName(), "recording", null);
                }
                break;

            case "streaming":
                data.setStatus("streaming");
                plugin.getDataManager().savePlayerData(data);
                plugin.getTabListManager().updatePlayer(player);
                player.sendMessage(Component.text("✓ Status: ", NamedTextColor.GRAY)
                    .append(Component.text("Streaming", NamedTextColor.LIGHT_PURPLE, TextDecoration.BOLD)));
                
                if (plugin.getApiClient() != null) {
                    plugin.getApiClient().logStatusChange(uuid.toString(), player.getName(), "streaming", null);
                }
                break;

            case "none":
                data.setStatus("none");
                plugin.getDataManager().savePlayerData(data);
                plugin.getTabListManager().updatePlayer(player);
                player.sendMessage(Component.text("✓ Status cleared", NamedTextColor.GRAY));
                
                if (plugin.getApiClient() != null) {
                    plugin.getApiClient().logStatusChange(uuid.toString(), player.getName(), "status_cleared", null);
                }
                break;

            default:
                sendUsage(player);
                break;
        }

        return true;
    }

    private void sendUsage(Player player) {
        player.sendMessage(Component.text("Usage: /status <recording|streaming|none>", NamedTextColor.RED));
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command, @NotNull String alias, @NotNull String[] args) {
        List<String> completions = new ArrayList<>();
        
        if (args.length == 1) {
            completions.add("recording");
            completions.add("streaming");
            completions.add("none");
            
            // Filter based on what user typed
            String input = args[0].toLowerCase();
            completions.removeIf(s -> !s.toLowerCase().startsWith(input));
        }
        
        return completions;
    }
}
