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

public class PvpCommand implements CommandExecutor, TabCompleter {

    private final NewLifeStatus plugin;

    public PvpCommand(NewLifeStatus plugin) {
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

        String subcommand = args[0].toLowerCase();

        switch (subcommand) {
            case "on":
                handlePvpOn(player, uuid);
                break;
            case "off":
                handlePvpOff(player, uuid);
                break;
            case "status":
                handleStatus(player, uuid);
                break;
            case "info":
                sendInfo(player);
                break;
            default:
                sendUsage(player);
                break;
        }

        return true;
    }

    private void handlePvpOn(Player player, UUID uuid) {
        PlayerDataManager.PlayerData data = plugin.getDataManager().getPlayerData(uuid);
        
        if (data == null) {
            data = new PlayerDataManager.PlayerData(uuid.toString(), false, "none", 0);
        }

        if (data.isPvpEnabled() && !data.hasPvpCooldown()) {
            player.sendMessage(Component.text("Your PvP is already enabled!", NamedTextColor.YELLOW));
            return;
        }

        data.setPvpEnabled(true);
        data.setPvpCooldownUntil(0);
        plugin.getDataManager().savePlayerData(data);
        plugin.getTabListManager().updatePlayer(player);
        plugin.getNametagManager().updatePlayer(player);

        player.sendMessage(Component.text("PvP Enabled", NamedTextColor.GREEN)
            .append(Component.newline())
            .append(Component.text("You can now be attacked by other players", NamedTextColor.GRAY)));

        // Log to Discord
        if (plugin.getApiClient() != null) {
            plugin.getApiClient().logStatusChange(
                uuid.toString(),
                player.getName(),
                "pvp_enabled",
                null
            );
        }
    }

    private void handlePvpOff(Player player, UUID uuid) {
        PlayerDataManager.PlayerData data = plugin.getDataManager().getPlayerData(uuid);
        
        if (data == null) {
            data = new PlayerDataManager.PlayerData(uuid.toString(), false, "none", 0);
        }

        if (!data.isPvpEnabled()) {
            player.sendMessage(Component.text("Your PvP is already disabled!", NamedTextColor.YELLOW));
            return;
        }

        if (data.hasPvpCooldown()) {
            long remaining = (data.getPvpCooldownUntil() - System.currentTimeMillis()) / 1000;
            player.sendMessage(Component.text("PvP will turn OFF in " + remaining + " seconds", NamedTextColor.YELLOW));
            return;
        }

        // Set cooldown - PvP stays ON for 5 minutes, then turns OFF
        long cooldownEnd = System.currentTimeMillis() + (plugin.getStatusConfig().getPvpCooldown() * 1000L);
        data.setPvpCooldownUntil(cooldownEnd);
        plugin.getDataManager().savePlayerData(data);
        plugin.getTabListManager().updatePlayer(player);
        plugin.getNametagManager().updatePlayer(player);

        player.sendMessage(Component.text("PvP Disabling...", NamedTextColor.YELLOW)
            .append(Component.newline())
            .append(Component.text("PvP will stay ON for " + plugin.getStatusConfig().getPvpCooldown() + " seconds", NamedTextColor.GRAY))
            .append(Component.newline())
            .append(Component.text("You can still be attacked during this time!", NamedTextColor.RED)));

        // Schedule task to disable PvP after cooldown
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            PlayerDataManager.PlayerData updatedData = plugin.getDataManager().getPlayerData(uuid);
            if (updatedData != null) {
                updatedData.setPvpEnabled(false);
                updatedData.setPvpCooldownUntil(0); // Clear cooldown
                plugin.getDataManager().savePlayerData(updatedData);
                
                if (player.isOnline()) {
                    plugin.getTabListManager().updatePlayer(player);
                    plugin.getNametagManager().updatePlayer(player);
                    player.sendMessage(Component.text("PvP is now OFF", NamedTextColor.GREEN)
                        .append(Component.newline())
                        .append(Component.text("You can no longer be attacked", NamedTextColor.GRAY)));
                }
                
                // Log to Discord
                if (plugin.getApiClient() != null) {
                    plugin.getApiClient().logStatusChange(
                        uuid.toString(),
                        player.getName(),
                        "pvp_disabled",
                        String.valueOf(plugin.getStatusConfig().getPvpCooldown())
                    );
                }
            }
        }, plugin.getStatusConfig().getPvpCooldown() * 20L); // Convert seconds to ticks
    }

    private void handleStatus(Player player, UUID uuid) {
        PlayerDataManager.PlayerData data = plugin.getDataManager().getPlayerData(uuid);

        if (data == null) {
            player.sendMessage(Component.text("PvP: OFF", NamedTextColor.GRAY));
            return;
        }

        String status = data.isPvpEnabled() ? "ON" : "OFF";
        NamedTextColor color = data.isPvpEnabled() ? NamedTextColor.GREEN : NamedTextColor.RED;

        Component message = Component.text("PvP Status: ", NamedTextColor.GRAY)
            .append(Component.text(status, color));

        if (data.hasPvpCooldown()) {
            long remaining = (data.getPvpCooldownUntil() - System.currentTimeMillis()) / 1000;
            message = message.append(Component.newline())
                .append(Component.text("Cooldown: " + remaining + "s remaining", NamedTextColor.YELLOW));
        }

        player.sendMessage(message);
    }

    private void sendInfo(Player player) {
        player.sendMessage(Component.text("=== PvP Consent System ===", NamedTextColor.GOLD)
            .append(Component.newline())
            .append(Component.text("• Players must consent to PvP", NamedTextColor.GRAY))
            .append(Component.newline())
            .append(Component.text("• Use /pvp on to enable PvP", NamedTextColor.GRAY))
            .append(Component.newline())
            .append(Component.text("• Use /pvp off to disable (cooldown applies)", NamedTextColor.GRAY))
            .append(Component.newline())
            .append(Component.text("• Cooldown: " + plugin.getStatusConfig().getPvpCooldown() + " seconds", NamedTextColor.GRAY))
            .append(Component.newline())
            .append(Component.text("• Check TAB list for player status", NamedTextColor.GRAY)));
    }

    private void sendUsage(Player player) {
        player.sendMessage(Component.text("Usage: /pvp <on|off|status|info>", NamedTextColor.RED));
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command, @NotNull String alias, @NotNull String[] args) {
        List<String> completions = new ArrayList<>();
        
        if (args.length == 1) {
            completions.add("on");
            completions.add("off");
            completions.add("status");
            completions.add("info");
            
            // Filter based on what user typed
            String input = args[0].toLowerCase();
            completions.removeIf(s -> !s.toLowerCase().startsWith(input));
        }
        
        return completions;
    }
}
