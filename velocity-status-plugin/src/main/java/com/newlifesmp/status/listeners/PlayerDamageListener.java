package com.newlifesmp.status.listeners;

import com.newlifesmp.status.NewLifeStatus;
import com.newlifesmp.status.PlayerDataManager;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;

/**
 * Listens for player damage events to track PvP sessions
 */
public class PlayerDamageListener implements Listener {

    private final NewLifeStatus plugin;

    public PlayerDamageListener(NewLifeStatus plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlayerDamage(EntityDamageByEntityEvent event) {
        // Check if both entities are players
        if (!(event.getEntity() instanceof Player victim)) {
            return;
        }

        if (!(event.getDamager() instanceof Player attacker)) {
            return;
        }

        // Don't track self-damage
        if (attacker.equals(victim)) {
            return;
        }

        // Get damage amount
        double damage = event.getFinalDamage();
        
        // Calculate health after damage (can't go below 0)
        double healthAfter = Math.max(0, victim.getHealth() - damage);

        // Record the damage in the tracker with health info
        if (plugin.getDamageTracker() != null) {
            plugin.getDamageTracker().recordDamage(attacker, victim, damage, healthAfter);
        }

        // Tag both players as in combat (only if they have PvP enabled)
        if (plugin.getCombatLogListener() != null) {
            // Check if attacker has PvP enabled
            PlayerDataManager.PlayerData attackerData = plugin.getPlayerDataManager().getPlayerData(attacker.getUniqueId());
            if (attackerData != null && attackerData.isPvpEnabled()) {
                plugin.getCombatLogListener().tagPlayer(attacker.getUniqueId());
            }

            // Check if victim has PvP enabled
            PlayerDataManager.PlayerData victimData = plugin.getPlayerDataManager().getPlayerData(victim.getUniqueId());
            if (victimData != null && victimData.isPvpEnabled()) {
                plugin.getCombatLogListener().tagPlayer(victim.getUniqueId());
            }
        }
    }
}
