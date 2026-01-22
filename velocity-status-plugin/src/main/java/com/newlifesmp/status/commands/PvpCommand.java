package com.newlifesmp.status.commands;

import com.newlifesmp.status.NewLifeStatus;
import com.newlifesmp.status.PlayerDataManager.PlayerData;
import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.proxy.Player;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;

public class PvpCommand implements SimpleCommand {
    private final NewLifeStatus plugin;

    public PvpCommand(NewLifeStatus plugin) {
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

        String subcommand = args[0].toLowerCase();

        switch (subcommand) {
            case "on":
                handlePvpOn(player);
                break;
            case "off":
                handlePvpOff(player);
                break;
            case "status":
                handleStatus(player);
                break;
            case "info":
                handleInfo(player);
                break;
            default:
                sendUsage(player);
                break;
        }
    }

    private void handlePvpOn(Player player) {
        PlayerData data = plugin.getPlayerDataManager().getPlayerData(player.getUniqueId());

        if (data.isInCooldown()) {
            player.sendMessage(Component.text(plugin.getConfig().getMessage("pvp_cooling_down")));
            return;
        }

        if (data.isPvpEnabled()) {
            player.sendMessage(Component.text(plugin.getConfig().getMessage("pvp_already_on")));
            return;
        }

        data.setPvpEnabled(true);
        plugin.getPlayerDataManager().savePlayerData(player.getUniqueId(), data);
        plugin.getTabListManager().updatePlayer(player);
        
        player.sendMessage(Component.text(plugin.getConfig().getMessage("pvp_enabled")));
        
        // Log to Discord
        plugin.getApiClient().logPvpStatusChange(
            player.getUniqueId().toString(),
            player.getUsername(),
            true
        );
    }

    private void handlePvpOff(Player player) {
        PlayerData data = plugin.getPlayerDataManager().getPlayerData(player.getUniqueId());

        if (data.isInCooldown()) {
            player.sendMessage(Component.text(plugin.getConfig().getMessage("pvp_cooling_down")));
            return;
        }

        if (!data.isPvpEnabled()) {
            player.sendMessage(Component.text(plugin.getConfig().getMessage("pvp_already_off")));
            return;
        }

        // Start cooldown
        data.startCooldown(plugin.getConfig().getPvpCooldownMinutes());
        plugin.getPlayerDataManager().savePlayerData(player.getUniqueId(), data);
        plugin.getTabListManager().updatePlayer(player);
        
        player.sendMessage(Component.text(plugin.getConfig().getMessage("pvp_cooldown_started")));
    }

    private void handleStatus(Player player) {
        PlayerData data = plugin.getPlayerDataManager().getPlayerData(player.getUniqueId());

        Component header = Component.text("╔══════════════════════════════════╗", NamedTextColor.GRAY);
        Component title = Component.text("║      ", NamedTextColor.GRAY)
            .append(Component.text("NewLife PvP Status", NamedTextColor.GREEN, TextDecoration.BOLD))
            .append(Component.text("          ║", NamedTextColor.GRAY));
        Component divider = Component.text("╠══════════════════════════════════╣", NamedTextColor.GRAY);
        Component footer = Component.text("╚══════════════════════════════════╝", NamedTextColor.GRAY);

        player.sendMessage(header);
        player.sendMessage(title);
        player.sendMessage(divider);

        // PvP Light status
        if (data.isInCooldown()) {
            long remaining = data.getCooldownRemaining();
            long minutes = remaining / 60000;
            long seconds = (remaining % 60000) / 1000;
            
            player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
                .append(Component.text("PvP Light: ", NamedTextColor.WHITE))
                .append(Component.text("■ COOLING DOWN", NamedTextColor.YELLOW))
                .append(Component.text("      ║", NamedTextColor.GRAY)));
            
            player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
                .append(Component.text("Time Remaining: ", NamedTextColor.WHITE))
                .append(Component.text(minutes + "m " + seconds + "s", NamedTextColor.YELLOW))
                .append(Component.text("           ║", NamedTextColor.GRAY)));
        } else if (data.isPvpEnabled()) {
            player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
                .append(Component.text("PvP Light: ", NamedTextColor.WHITE))
                .append(Component.text("■ ON", NamedTextColor.GREEN))
                .append(Component.text("                ║", NamedTextColor.GRAY)));
        } else {
            player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
                .append(Component.text("PvP Light: ", NamedTextColor.WHITE))
                .append(Component.text("■ OFF", NamedTextColor.GRAY))
                .append(Component.text("               ║", NamedTextColor.GRAY)));
        }

        // Status
        String status = data.getStatus();
        NamedTextColor statusColor = status.equals("recording") ? NamedTextColor.RED :
                                     status.equals("streaming") ? NamedTextColor.DARK_PURPLE :
                                     NamedTextColor.GRAY;
        String statusText = status.equals("recording") ? "Recording ■" :
                           status.equals("streaming") ? "Streaming ■" :
                           "None ■";
        
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("Status: ", NamedTextColor.WHITE))
            .append(Component.text(statusText, statusColor))
            .append(Component.text("             ║", NamedTextColor.GRAY)));

        // Eligible for PvP
        boolean eligible = data.isPvpEnabled() || data.isInCooldown();
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("Eligible for PvP: ", NamedTextColor.WHITE))
            .append(Component.text(eligible ? "YES" : "NO", eligible ? NamedTextColor.GREEN : NamedTextColor.RED))
            .append(Component.text("            ║", NamedTextColor.GRAY)));

        player.sendMessage(footer);
    }

    private void handleInfo(Player player) {
        Component header = Component.text("╔═══════════════════════════════════════╗", NamedTextColor.GRAY);
        Component title = Component.text("║       ", NamedTextColor.GRAY)
            .append(Component.text("NewLife PvP System Info", NamedTextColor.GREEN, TextDecoration.BOLD))
            .append(Component.text("         ║", NamedTextColor.GRAY));
        Component divider = Component.text("╠═══════════════════════════════════════╣", NamedTextColor.GRAY);
        Component footer = Component.text("╚═══════════════════════════════════════╝", NamedTextColor.GRAY);
        Component empty = Component.text("║                                       ║", NamedTextColor.GRAY);

        player.sendMessage(header);
        player.sendMessage(title);
        player.sendMessage(divider);
        player.sendMessage(empty);
        
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("⚔ PVP RULES", NamedTextColor.GOLD, TextDecoration.BOLD))
            .append(Component.text("                          ║", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("• Both players MUST have PvP ON", NamedTextColor.WHITE))
            .append(Component.text("       ║", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("• Winner decides: return or keep loot", NamedTextColor.WHITE))
            .append(Component.text(" ║", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("• If loot kept = NO TICKET allowed", NamedTextColor.WHITE))
            .append(Component.text("    ║", NamedTextColor.GRAY)));
        player.sendMessage(empty);
        
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("⏱ COOLDOWN", NamedTextColor.GOLD, TextDecoration.BOLD))
            .append(Component.text("                           ║", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("• PvP ON → Instant", NamedTextColor.WHITE))
            .append(Component.text("                    ║", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("• PvP OFF → 5 minutes", NamedTextColor.WHITE))
            .append(Component.text("                 ║", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("• Cannot cancel once started", NamedTextColor.WHITE))
            .append(Component.text("          ║", NamedTextColor.GRAY)));
        player.sendMessage(empty);
        
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("📹 STATUS", NamedTextColor.GOLD, TextDecoration.BOLD))
            .append(Component.text("                             ║", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("• Use /status to set recording state", NamedTextColor.WHITE))
            .append(Component.text("  ║", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("║ ", NamedTextColor.GRAY)
            .append(Component.text("• Red = Recording | Purple = Streaming", NamedTextColor.WHITE))
            .append(Component.text("║", NamedTextColor.GRAY)));
        player.sendMessage(empty);
        
        player.sendMessage(footer);
    }

    private void sendUsage(Player player) {
        player.sendMessage(Component.text("Usage:", NamedTextColor.YELLOW));
        player.sendMessage(Component.text("  /pvp on", NamedTextColor.WHITE)
            .append(Component.text(" - Enable PvP instantly", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("  /pvp off", NamedTextColor.WHITE)
            .append(Component.text(" - Start 5min cooldown", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("  /pvp status", NamedTextColor.WHITE)
            .append(Component.text(" - View your current status", NamedTextColor.GRAY)));
        player.sendMessage(Component.text("  /pvp info", NamedTextColor.WHITE)
            .append(Component.text(" - View PvP system rules", NamedTextColor.GRAY)));
    }
}
