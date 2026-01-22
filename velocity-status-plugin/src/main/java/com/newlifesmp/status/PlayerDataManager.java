package com.newlifesmp.status;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import org.slf4j.Logger;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class PlayerDataManager {
    private final Path dataDirectory;
    private final Logger logger;
    private final Gson gson;
    private final Map<UUID, PlayerData> cache;

    public PlayerDataManager(Path dataDirectory, Logger logger) {
        this.dataDirectory = dataDirectory;
        this.logger = logger;
        this.gson = new GsonBuilder().setPrettyPrinting().create();
        this.cache = new ConcurrentHashMap<>();
        
        // Create data directory if it doesn't exist
        File dir = dataDirectory.toFile();
        if (!dir.exists()) {
            dir.mkdirs();
        }
    }

    public PlayerData getPlayerData(UUID uuid) {
        if (cache.containsKey(uuid)) {
            return cache.get(uuid);
        }

        PlayerData data = loadFromDisk(uuid);
        cache.put(uuid, data);
        return data;
    }

    public void savePlayerData(UUID uuid, PlayerData data) {
        cache.put(uuid, data);
        saveToDisk(uuid, data);
    }

    private PlayerData loadFromDisk(UUID uuid) {
        File file = new File(dataDirectory.toFile(), uuid.toString() + ".json");
        
        if (!file.exists()) {
            return new PlayerData(uuid);
        }

        try (FileReader reader = new FileReader(file)) {
            return gson.fromJson(reader, PlayerData.class);
        } catch (IOException e) {
            logger.error("Failed to load player data for {}", uuid, e);
            return new PlayerData(uuid);
        }
    }

    private void saveToDisk(UUID uuid, PlayerData data) {
        File file = new File(dataDirectory.toFile(), uuid.toString() + ".json");
        
        try (FileWriter writer = new FileWriter(file)) {
            gson.toJson(data, writer);
        } catch (IOException e) {
            logger.error("Failed to save player data for {}", uuid, e);
        }
    }

    public void removeFromCache(UUID uuid) {
        cache.remove(uuid);
    }

    public void saveAll() {
        for (Map.Entry<UUID, PlayerData> entry : cache.entrySet()) {
            saveToDisk(entry.getKey(), entry.getValue());
        }
    }

    public static class PlayerData {
        private final String uuid;
        private String username;
        private boolean pvpEnabled;
        private Long cooldownStart;
        private Long cooldownEnd;
        private String status; // "recording", "streaming", "none"
        private long lastUpdated;
        
        // For tracking accumulated non-consensual damage
        private transient Map<UUID, Double> accumulatedDamage;

        public PlayerData(UUID uuid) {
            this.uuid = uuid.toString();
            this.username = "";
            this.pvpEnabled = false;
            this.cooldownStart = null;
            this.cooldownEnd = null;
            this.status = "none";
            this.lastUpdated = System.currentTimeMillis();
            this.accumulatedDamage = new HashMap<>();
        }

        public String getUuid() {
            return uuid;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
            this.lastUpdated = System.currentTimeMillis();
        }

        public boolean isPvpEnabled() {
            // Check if cooldown has expired
            if (cooldownEnd != null && System.currentTimeMillis() >= cooldownEnd) {
                pvpEnabled = false;
                cooldownStart = null;
                cooldownEnd = null;
            }
            return pvpEnabled;
        }

        public void setPvpEnabled(boolean enabled) {
            this.pvpEnabled = enabled;
            this.lastUpdated = System.currentTimeMillis();
        }

        public boolean isInCooldown() {
            if (cooldownEnd == null) {
                return false;
            }
            if (System.currentTimeMillis() >= cooldownEnd) {
                cooldownStart = null;
                cooldownEnd = null;
                pvpEnabled = false;
                return false;
            }
            return true;
        }

        public void startCooldown(int minutes) {
            this.cooldownStart = System.currentTimeMillis();
            this.cooldownEnd = this.cooldownStart + (minutes * 60 * 1000L);
            this.lastUpdated = System.currentTimeMillis();
        }

        public long getCooldownRemaining() {
            if (cooldownEnd == null) {
                return 0;
            }
            long remaining = cooldownEnd - System.currentTimeMillis();
            return Math.max(0, remaining);
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
            this.lastUpdated = System.currentTimeMillis();
        }

        public long getLastUpdated() {
            return lastUpdated;
        }

        // Damage tracking methods
        public void addAccumulatedDamage(UUID attackerUuid, double damage) {
            if (accumulatedDamage == null) {
                accumulatedDamage = new HashMap<>();
            }
            accumulatedDamage.merge(attackerUuid, damage, Double::sum);
        }

        public double getAccumulatedDamage(UUID attackerUuid) {
            if (accumulatedDamage == null) {
                return 0.0;
            }
            return accumulatedDamage.getOrDefault(attackerUuid, 0.0);
        }

        public void clearAccumulatedDamage(UUID attackerUuid) {
            if (accumulatedDamage != null) {
                accumulatedDamage.remove(attackerUuid);
            }
        }

        public void clearAllAccumulatedDamage() {
            if (accumulatedDamage != null) {
                accumulatedDamage.clear();
            }
        }
    }
}
