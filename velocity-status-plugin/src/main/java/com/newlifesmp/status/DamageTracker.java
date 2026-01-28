package com.newlifesmp.status;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

/**
 * Tracks damage sessions between players and logs them after inactivity
 * Also tracks low HP events when a victim drops below threshold during combat
 */
public class DamageTracker {

    private final NewLifeStatus plugin;
    private final Logger logger;
    private final Map<String, DamageSession> activeSessions;
    private final long sessionTimeoutMs;
    
    // Low HP threshold (5 HP = 2.5 hearts)
    private static final double LOW_HP_THRESHOLD = 5.0;
    
    // Track recent low HP alerts to prevent spam (UUID -> last alert time)
    private final Map<UUID, Long> recentLowHpAlerts;
    private static final long LOW_HP_ALERT_COOLDOWN_MS = 30000; // 30 seconds cooldown

    public DamageTracker(NewLifeStatus plugin, long sessionTimeoutSeconds) {
        this.plugin = plugin;
        this.logger = plugin.getLogger();
        this.activeSessions = new ConcurrentHashMap<>();
        this.recentLowHpAlerts = new ConcurrentHashMap<>();
        this.sessionTimeoutMs = sessionTimeoutSeconds * 1000;

        // Start cleanup task (runs every 5 seconds)
        Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this::checkExpiredSessions, 100L, 100L);
    }

    /**
     * Record a damage event
     * @param attacker The player who dealt damage
     * @param victim The player who received damage
     * @param damage Amount of damage dealt
     * @param victimHealthAfter Victim's health after damage
     */
    public void recordDamage(Player attacker, Player victim, double damage, double victimHealthAfter) {
        // Create unique session key (ordered by UUID to ensure consistency)
        String sessionKey = createSessionKey(attacker.getUniqueId(), victim.getUniqueId());

        // Get or create session
        DamageSession session = activeSessions.computeIfAbsent(sessionKey, k -> 
            new DamageSession(attacker.getUniqueId(), attacker.getName(), 
                            victim.getUniqueId(), victim.getName())
        );

        // Record who initiated if this is the first damage event
        if (session.getInitiatorUUID() == null) {
            session.setInitiator(attacker.getUniqueId(), attacker.getName());
        }

        // Add damage event to session
        session.addDamageEvent(attacker.getUniqueId(), damage, victimHealthAfter, victim.getUniqueId());
        
        // Check for low HP threshold
        if (victimHealthAfter <= LOW_HP_THRESHOLD && victimHealthAfter > 0) {
            checkLowHpAlert(attacker, victim, victimHealthAfter, session);
        }
    }
    
    /**
     * Check and send low HP alert if victim dropped below threshold
     */
    private void checkLowHpAlert(Player attacker, Player victim, double healthAfter, DamageSession session) {
        UUID victimUUID = victim.getUniqueId();
        long currentTime = System.currentTimeMillis();
        
        // Check cooldown
        Long lastAlert = recentLowHpAlerts.get(victimUUID);
        if (lastAlert != null && (currentTime - lastAlert) < LOW_HP_ALERT_COOLDOWN_MS) {
            return; // Still in cooldown
        }
        
        // Update cooldown
        recentLowHpAlerts.put(victimUUID, currentTime);
        
        // Get PvP status for context
        PlayerDataManager dataManager = plugin.getPlayerDataManager();
        PlayerDataManager.PlayerData attackerData = dataManager.getPlayerData(attacker.getUniqueId());
        PlayerDataManager.PlayerData victimData = dataManager.getPlayerData(victim.getUniqueId());
        
        boolean attackerPvpEnabled = attackerData != null && attackerData.isPvpEnabled();
        boolean victimPvpEnabled = victimData != null && victimData.isPvpEnabled();
        
        logger.info(String.format("Low HP Alert: %s (%.1f HP) - Attacker: %s - Initiator: %s",
            victim.getName(), healthAfter, attacker.getName(), session.getInitiatorName()));
        
        // Build JSON payload for low HP alert
        JsonObject payload = new JsonObject();
        payload.addProperty("type", "low_hp_alert");
        payload.addProperty("timestamp", currentTime);
        payload.addProperty("health_remaining", healthAfter);
        payload.addProperty("threshold", LOW_HP_THRESHOLD);
        
        // Victim data
        JsonObject victimJson = new JsonObject();
        victimJson.addProperty("uuid", victim.getUniqueId().toString());
        victimJson.addProperty("username", victim.getName());
        victimJson.addProperty("pvp_enabled", victimPvpEnabled);
        victimJson.addProperty("health", healthAfter);
        payload.add("victim", victimJson);
        
        // Current attacker data (who dealt the damage that dropped them low)
        JsonObject attackerJson = new JsonObject();
        attackerJson.addProperty("uuid", attacker.getUniqueId().toString());
        attackerJson.addProperty("username", attacker.getName());
        attackerJson.addProperty("pvp_enabled", attackerPvpEnabled);
        attackerJson.addProperty("total_damage_dealt", session.getDamageDealtTo(victim.getUniqueId(), attacker.getUniqueId()));
        payload.add("attacker", attackerJson);
        
        // Initiator data (who started the fight)
        JsonObject initiatorJson = new JsonObject();
        initiatorJson.addProperty("uuid", session.getInitiatorUUID().toString());
        initiatorJson.addProperty("username", session.getInitiatorName());
        initiatorJson.addProperty("is_current_attacker", session.getInitiatorUUID().equals(attacker.getUniqueId()));
        payload.add("initiator", initiatorJson);
        
        // Session context
        JsonObject sessionJson = new JsonObject();
        sessionJson.addProperty("duration_ms", session.getDuration());
        sessionJson.addProperty("total_hits", session.getTotalHits());
        sessionJson.addProperty("total_damage", session.getTotalDamage());
        sessionJson.addProperty("consensual", attackerPvpEnabled && victimPvpEnabled);
        payload.add("session", sessionJson);
        
        // Location data
        JsonObject locationJson = new JsonObject();
        locationJson.addProperty("world", victim.getWorld().getName());
        locationJson.addProperty("x", victim.getLocation().getX());
        locationJson.addProperty("y", victim.getLocation().getY());
        locationJson.addProperty("z", victim.getLocation().getZ());
        payload.add("location", locationJson);
        
        // Send to API
        if (plugin.getApiClient() != null) {
            plugin.getApiClient().sendLog("pvp/low-hp", payload);
        }
    }

    /**
     * Check for expired sessions and log them
     */
    private void checkExpiredSessions() {
        long currentTime = System.currentTimeMillis();
        List<String> expiredKeys = new ArrayList<>();

        for (Map.Entry<String, DamageSession> entry : activeSessions.entrySet()) {
            DamageSession session = entry.getValue();
            if (currentTime - session.getLastDamageTime() >= sessionTimeoutMs) {
                expiredKeys.add(entry.getKey());
            }
        }

        // Log and remove expired sessions
        for (String key : expiredKeys) {
            DamageSession session = activeSessions.remove(key);
            if (session != null) {
                logSession(session);
            }
        }
    }

    /**
     * Log a damage session to Discord
     */
    private void logSession(DamageSession session) {
        // Check if at least one player had PvP disabled
        PlayerDataManager dataManager = plugin.getPlayerDataManager();
        
        UUID player1UUID = session.getPlayer1UUID();
        UUID player2UUID = session.getPlayer2UUID();
        
        PlayerDataManager.PlayerData data1 = dataManager.getPlayerData(player1UUID);
        PlayerDataManager.PlayerData data2 = dataManager.getPlayerData(player2UUID);
        
        boolean player1PvpEnabled = data1 != null && data1.isPvpEnabled();
        boolean player2PvpEnabled = data2 != null && data2.isPvpEnabled();
        
        // Only log if at least one player had PvP disabled
        if (player1PvpEnabled && player2PvpEnabled) {
            logger.info("Skipping damage session log - both players had PvP enabled");
            return;
        }

        logger.info(String.format("Logging damage session: %s <-> %s (%d hits, %.2f total damage, initiator: %s)",
            session.getPlayer1Name(), session.getPlayer2Name(), 
            session.getTotalHits(), session.getTotalDamage(), session.getInitiatorName()));

        // Build JSON payload
        JsonObject payload = new JsonObject();
        payload.addProperty("type", "pvp_damage_session");
        payload.addProperty("timestamp", session.getStartTime());
        payload.addProperty("duration_ms", session.getDuration());
        payload.addProperty("total_hits", session.getTotalHits());
        payload.addProperty("total_damage", session.getTotalDamage());
        
        // Initiator data (who started the fight)
        if (session.getInitiatorUUID() != null) {
            JsonObject initiatorJson = new JsonObject();
            initiatorJson.addProperty("uuid", session.getInitiatorUUID().toString());
            initiatorJson.addProperty("username", session.getInitiatorName());
            payload.add("initiator", initiatorJson);
        }

        // Player 1 data
        JsonObject player1Json = new JsonObject();
        player1Json.addProperty("uuid", player1UUID.toString());
        player1Json.addProperty("username", session.getPlayer1Name());
        player1Json.addProperty("pvp_enabled", player1PvpEnabled);
        player1Json.addProperty("damage_dealt", session.getDamageDealtBy(player1UUID));
        player1Json.addProperty("hits_dealt", session.getHitsDealtBy(player1UUID));
        payload.add("player1", player1Json);

        // Player 2 data
        JsonObject player2Json = new JsonObject();
        player2Json.addProperty("uuid", player2UUID.toString());
        player2Json.addProperty("username", session.getPlayer2Name());
        player2Json.addProperty("pvp_enabled", player2PvpEnabled);
        player2Json.addProperty("damage_dealt", session.getDamageDealtBy(player2UUID));
        player2Json.addProperty("hits_dealt", session.getHitsDealtBy(player2UUID));
        payload.add("player2", player2Json);

        // Damage events timeline
        JsonArray events = new JsonArray();
        for (DamageEvent event : session.getDamageEvents()) {
            JsonObject eventJson = new JsonObject();
            eventJson.addProperty("timestamp", event.timestamp);
            eventJson.addProperty("attacker_uuid", event.attackerUUID.toString());
            eventJson.addProperty("damage", event.damage);
            events.add(eventJson);
        }
        payload.add("damage_events", events);

        // Send to API
        if (plugin.getApiClient() != null) {
            plugin.getApiClient().sendLog("pvp/damage-session", payload);
        }
    }

    /**
     * Create a consistent session key for two players
     */
    private String createSessionKey(UUID uuid1, UUID uuid2) {
        // Order UUIDs to ensure same key regardless of who attacks first
        if (uuid1.compareTo(uuid2) < 0) {
            return uuid1.toString() + "_" + uuid2.toString();
        } else {
            return uuid2.toString() + "_" + uuid1.toString();
        }
    }

    /**
     * Represents a damage session between two players
     */
    private static class DamageSession {
        private final UUID player1UUID;
        private final String player1Name;
        private final UUID player2UUID;
        private final String player2Name;
        private final long startTime;
        private long lastDamageTime;
        private final List<DamageEvent> damageEvents;
        
        // Track who initiated the fight
        private UUID initiatorUUID;
        private String initiatorName;

        public DamageSession(UUID player1UUID, String player1Name, UUID player2UUID, String player2Name) {
            this.player1UUID = player1UUID;
            this.player1Name = player1Name;
            this.player2UUID = player2UUID;
            this.player2Name = player2Name;
            this.startTime = System.currentTimeMillis();
            this.lastDamageTime = startTime;
            this.damageEvents = new ArrayList<>();
        }
        
        public void setInitiator(UUID uuid, String name) {
            this.initiatorUUID = uuid;
            this.initiatorName = name;
        }
        
        public UUID getInitiatorUUID() {
            return initiatorUUID;
        }
        
        public String getInitiatorName() {
            return initiatorName;
        }

        public void addDamageEvent(UUID attackerUUID, double damage, double victimHealthAfter, UUID victimUUID) {
            this.lastDamageTime = System.currentTimeMillis();
            this.damageEvents.add(new DamageEvent(attackerUUID, damage, lastDamageTime, victimHealthAfter, victimUUID));
        }

        public UUID getPlayer1UUID() {
            return player1UUID;
        }

        public String getPlayer1Name() {
            return player1Name;
        }

        public UUID getPlayer2UUID() {
            return player2UUID;
        }

        public String getPlayer2Name() {
            return player2Name;
        }

        public long getStartTime() {
            return startTime;
        }

        public long getLastDamageTime() {
            return lastDamageTime;
        }

        public long getDuration() {
            return lastDamageTime - startTime;
        }

        public List<DamageEvent> getDamageEvents() {
            return damageEvents;
        }

        public int getTotalHits() {
            return damageEvents.size();
        }

        public double getTotalDamage() {
            return damageEvents.stream().mapToDouble(e -> e.damage).sum();
        }

        public double getDamageDealtBy(UUID uuid) {
            return damageEvents.stream()
                .filter(e -> e.attackerUUID.equals(uuid))
                .mapToDouble(e -> e.damage)
                .sum();
        }
        
        /**
         * Get damage dealt TO a specific victim BY a specific attacker
         */
        public double getDamageDealtTo(UUID victimUUID, UUID attackerUUID) {
            return damageEvents.stream()
                .filter(e -> e.attackerUUID.equals(attackerUUID) && e.victimUUID.equals(victimUUID))
                .mapToDouble(e -> e.damage)
                .sum();
        }

        public int getHitsDealtBy(UUID uuid) {
            return (int) damageEvents.stream()
                .filter(e -> e.attackerUUID.equals(uuid))
                .count();
        }
    }

    /**
     * Represents a single damage event
     */
    private static class DamageEvent {
        private final UUID attackerUUID;
        private final double damage;
        private final long timestamp;
        private final double victimHealthAfter;
        private final UUID victimUUID;

        public DamageEvent(UUID attackerUUID, double damage, long timestamp, double victimHealthAfter, UUID victimUUID) {
            this.attackerUUID = attackerUUID;
            this.damage = damage;
            this.timestamp = timestamp;
            this.victimHealthAfter = victimHealthAfter;
            this.victimUUID = victimUUID;
        }
    }
}
