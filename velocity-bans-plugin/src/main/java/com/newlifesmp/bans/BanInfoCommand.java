package com.newlifesmp.bans;

import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.proxy.Player;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.minimessage.MiniMessage;

import java.util.List;
import java.util.concurrent.CompletableFuture;

public class BanInfoCommand implements SimpleCommand {

    private final NewLifeBans plugin;
    private final MiniMessage miniMessage;

    public BanInfoCommand(NewLifeBans plugin) {
        this.plugin = plugin;
        this.miniMessage = MiniMessage.miniMessage();
    }

    @Override
    public void execute(Invocation invocation) {
        var source = invocation.source();
        String[] args = invocation.arguments();

        // Check if player or has permission for checking others
        String targetUuid;
        String targetName;

        if (args.length > 0 && source.hasPermission("newlife.bans.checkothers")) {
            // Looking up another player
            targetName = args[0];
            
            // Try to find online player
            var optionalPlayer = plugin.getServer().getPlayer(targetName);
            if (optionalPlayer.isPresent()) {
                Player target = optionalPlayer.get();
                targetUuid = target.getUniqueId().toString();
                targetName = target.getUsername();
            } else {
                source.sendMessage(Component.text("Player not found or offline. Can only check online players.", NamedTextColor.RED));
                return;
            }
        } else if (source instanceof Player player) {
            targetUuid = player.getUniqueId().toString();
            targetName = player.getUsername();
        } else {
            source.sendMessage(Component.text("Usage: /baninfo <player>", NamedTextColor.RED));
            return;
        }

        final String finalTargetName = targetName;
        
        source.sendMessage(miniMessage.deserialize(
            "<gray>Checking ban status for <white>" + finalTargetName + "<gray>..."
        ));

        plugin.getApiClient().checkBan(targetUuid).thenAccept(result -> {
            if (!result.isSuccess()) {
                source.sendMessage(Component.text()
                    .append(Component.text("✗ ", NamedTextColor.RED))
                    .append(Component.text("Failed to check ban status: ", NamedTextColor.GRAY))
                    .append(Component.text(result.getError().orElse("Unknown error"), NamedTextColor.RED))
                    .build());
                return;
            }

            if (result.isBanned()) {
                source.sendMessage(Component.empty());
                source.sendMessage(miniMessage.deserialize(
                    "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                ));
                source.sendMessage(miniMessage.deserialize(
                    "<red><bold>🔨</bold></red> <white>" + finalTargetName + " <gray>is <red>BANNED"
                ));
                source.sendMessage(Component.empty());
                
                source.sendMessage(miniMessage.deserialize(
                    "  <gray>Reason: <white>" + result.getReason()
                ));
                source.sendMessage(miniMessage.deserialize(
                    "  <gray>Duration: <white>" + result.getDuration()
                ));
                source.sendMessage(miniMessage.deserialize(
                    "  <gray>Expires: <white>" + (result.isPermanent() ? "Never (Permanent)" : result.getRemaining())
                ));
                source.sendMessage(miniMessage.deserialize(
                    "  <gray>Case: <white>#" + result.getCaseNumber()
                ));
                source.sendMessage(miniMessage.deserialize(
                    "  <gray>Banned by: <white>" + result.getStaffTag()
                ));
                
                source.sendMessage(miniMessage.deserialize(
                    "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                ));
            } else {
                source.sendMessage(Component.empty());
                source.sendMessage(miniMessage.deserialize(
                    "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                ));
                source.sendMessage(miniMessage.deserialize(
                    "<green><bold>✓</bold></green> <white>" + finalTargetName + " <gray>is <green>not banned"
                ));
                source.sendMessage(miniMessage.deserialize(
                    "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                ));
            }
        });
    }

    @Override
    public CompletableFuture<List<String>> suggestAsync(Invocation invocation) {
        if (!invocation.source().hasPermission("newlife.bans.checkothers")) {
            return CompletableFuture.completedFuture(List.of());
        }

        String[] args = invocation.arguments();
        if (args.length <= 1) {
            String partial = args.length == 0 ? "" : args[0].toLowerCase();
            return CompletableFuture.completedFuture(
                plugin.getServer().getAllPlayers().stream()
                    .map(Player::getUsername)
                    .filter(name -> name.toLowerCase().startsWith(partial))
                    .limit(10)
                    .toList()
            );
        }

        return CompletableFuture.completedFuture(List.of());
    }

    @Override
    public boolean hasPermission(Invocation invocation) {
        return invocation.source() instanceof Player || 
               invocation.source().hasPermission("newlife.bans.checkothers");
    }
}
