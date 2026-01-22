package com.newlifesmp.link;

import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.proxy.Player;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.minimessage.MiniMessage;

import java.util.List;
import java.util.concurrent.CompletableFuture;

public class LinkStatusCommand implements SimpleCommand {

    private final NewLifeLink plugin;
    private final MiniMessage miniMessage;

    public LinkStatusCommand(NewLifeLink plugin) {
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

        if (args.length > 0 && source.hasPermission("newlife.link.checkothers")) {
            // Looking up another player
            targetName = args[0];
            
            // Try to find online player
            var optionalPlayer = plugin.getServer().getPlayer(targetName);
            if (optionalPlayer.isPresent()) {
                Player target = optionalPlayer.get();
                targetUuid = target.getUniqueId().toString();
                targetName = target.getUsername();
            } else {
                source.sendMessage(Component.text("Player not found or offline.", NamedTextColor.RED));
                return;
            }
        } else if (source instanceof Player player) {
            targetUuid = player.getUniqueId().toString();
            targetName = player.getUsername();
        } else {
            source.sendMessage(Component.text("Usage: /linkstatus <player>", NamedTextColor.RED));
            return;
        }

        final String finalTargetName = targetName;
        
        source.sendMessage(miniMessage.deserialize(
            "<gray>Checking link status for <white>" + finalTargetName + "<gray>..."
        ));

        plugin.getApiClient().checkLinked(targetUuid).thenAccept(result -> {
            if (!result.isSuccess()) {
                source.sendMessage(Component.text()
                    .append(Component.text("✗ ", NamedTextColor.RED))
                    .append(Component.text("Failed to check link status: ", NamedTextColor.GRAY))
                    .append(Component.text(result.getError().orElse("Unknown error"), NamedTextColor.RED))
                    .build());
                return;
            }

            if (result.isLinked()) {
                source.sendMessage(Component.empty());
                source.sendMessage(miniMessage.deserialize(
                    "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                ));
                source.sendMessage(miniMessage.deserialize(
                    "<green><bold>✓</bold></green> <white>" + finalTargetName + " <gray>is <green>linked"
                ));
                source.sendMessage(Component.empty());
                
                result.getDiscordId().ifPresent(discordId -> 
                    source.sendMessage(miniMessage.deserialize(
                        "  <gray>Discord ID: <white>" + discordId
                    ))
                );
                
                result.getPlatform().ifPresent(platform ->
                    source.sendMessage(miniMessage.deserialize(
                        "  <gray>Platform: <white>" + (platform.equals("bedrock") ? "Bedrock" : "Java")
                    ))
                );
                
                source.sendMessage(miniMessage.deserialize(
                    "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                ));
            } else {
                source.sendMessage(Component.empty());
                source.sendMessage(miniMessage.deserialize(
                    "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                ));
                source.sendMessage(miniMessage.deserialize(
                    "<red><bold>✗</bold></red> <white>" + finalTargetName + " <gray>is <red>not linked"
                ));
                source.sendMessage(Component.empty());
                source.sendMessage(miniMessage.deserialize(
                    "  <gray>Use <yellow>/linkaccount <gray>in Discord to link"
                ));
                source.sendMessage(miniMessage.deserialize(
                    "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                ));
            }
        });
    }

    @Override
    public CompletableFuture<List<String>> suggestAsync(Invocation invocation) {
        if (!invocation.source().hasPermission("newlife.link.checkothers")) {
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
               invocation.source().hasPermission("newlife.link.checkothers");
    }
}
