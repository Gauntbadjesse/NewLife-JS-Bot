package com.newlifesmp.status;

import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.logging.Logger;

public class StatusConfig {

    private final Path configPath;
    private final Logger logger;

    private int pvpCooldown;
    private boolean discordEnabled;
    private String discordApiUrl;
    private String discordApiKey;

    public StatusConfig(Path configPath, Logger logger) throws IOException {
        this.configPath = configPath;
        this.logger = logger;
        load();
    }

    @SuppressWarnings("unchecked")
    public void load() throws IOException {
        try (InputStream in = Files.newInputStream(configPath)) {
            Yaml yaml = new Yaml();
            Map<String, Object> data = yaml.load(in);

            // PvP settings
            Map<String, Object> pvp = (Map<String, Object>) data.getOrDefault("pvp", Map.of());
            this.pvpCooldown = ((Number) pvp.getOrDefault("cooldown", 300)).intValue();

            // Discord settings
            Map<String, Object> discord = (Map<String, Object>) data.getOrDefault("discord", Map.of());
            this.discordEnabled = (Boolean) discord.getOrDefault("enabled", false);
            this.discordApiUrl = (String) discord.getOrDefault("api-url", "http://localhost:3001");
            this.discordApiKey = (String) discord.getOrDefault("api-key", "");

            logger.info("Configuration loaded - PvP Cooldown: " + pvpCooldown + "s, Discord: " + discordEnabled);
        }
    }

    public int getPvpCooldown() {
        return pvpCooldown;
    }

    public boolean isDiscordEnabled() {
        return discordEnabled;
    }

    public String getDiscordApiUrl() {
        return discordApiUrl;
    }

    public String getDiscordApiKey() {
        return discordApiKey;
    }
}
