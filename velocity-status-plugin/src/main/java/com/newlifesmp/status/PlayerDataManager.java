package com.newlifesmp.status;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

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

        try {
            if (!Files.exists(dataDirectory)) {
                Files.createDirectories(dataDirectory);
                logger.info("Created player data directory");
            }
        } catch (IOException e) {
            logger.severe("Failed to create player data directory: " + e.getMessage());
        }
    }

    public PlayerData getPlayerData(UUID uuid) {
        // Check cache first
        if (cache.containsKey(uuid)) {
            return cache.get(uuid);
        }

        // Load from disk
        Path file = dataDirectory.resolve(uuid.toString() + ".json");
        if (!Files.exists(file)) {
            return null;
        }

        try {
            String json = Files.readString(file);
            PlayerData data = gson.fromJson(json, PlayerData.class);
            cache.put(uuid, data);
            return data;
        } catch (IOException e) {
            logger.warning("Failed to load player data for " + uuid + ": " + e.getMessage());
            return null;
        }
    }

    public void savePlayerData(PlayerData data) {
        UUID uuid = UUID.fromString(data.getUuid());
        cache.put(uuid, data);

        Path file = dataDirectory.resolve(data.getUuid() + ".json");
        try {
            String json = gson.toJson(data);
            Files.writeString(file, json);
        } catch (IOException e) {
            logger.severe("Failed to save player data for " + uuid + ": " + e.getMessage());
        }
    }

    public static class PlayerData {
        private String uuid;
        private String username;
        private boolean pvpEnabled;
        private String status;
        private long pvpCooldownUntil;

        public PlayerData(String uuid, String username, boolean pvpEnabled, String status, long pvpCooldownUntil) {
            this.uuid = uuid;
            this.username = username;
            this.pvpEnabled = pvpEnabled;
            this.status = status;
            this.pvpCooldownUntil = pvpCooldownUntil;
        }

        public String getUuid() {
            return uuid;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public boolean isPvpEnabled() {
            return pvpEnabled;
        }

        public void setPvpEnabled(boolean pvpEnabled) {
            this.pvpEnabled = pvpEnabled;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public long getPvpCooldownUntil() {
            return pvpCooldownUntil;
        }

        public void setPvpCooldownUntil(long pvpCooldownUntil) {
            this.pvpCooldownUntil = pvpCooldownUntil;
        }

        public boolean hasPvpCooldown() {
            return System.currentTimeMillis() < pvpCooldownUntil;
        }
    }
}
